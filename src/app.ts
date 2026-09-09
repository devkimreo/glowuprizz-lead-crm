import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import swaggerUi from 'swagger-ui-express';
import { z } from 'zod';
import type { Queryable } from './db.js';
import { createSession, deleteSession, requireAuth, SESSION_COOKIE } from './auth.js';

const channels = ['instagram', 'x', 'youtube', 'threads'] as const;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 512 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, file.originalname.toLowerCase().endsWith('.html')),
});

const loginSchema = z.object({ email: z.email(), password: z.string().min(8) });
const campaignSchema = z.object({ name: z.string().trim().min(1).max(120), formTemplateId: z.uuid() });
const linkSchema = z.object({ channel: z.enum(channels) });
const submissionSchema = z.object({ visitorId: z.string().min(8).max(100), data: z.record(z.string(), z.unknown()) });

const token = () => randomBytes(18).toString('base64url');
const wrap = (fn: express.RequestHandler): express.RequestHandler => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function publicFormPage(name: string, html: string, linkToken: string, nonce: string) {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const safeName = name.replace(/[&<>"']/g, char => entities[char] ?? char);
  const encoded = Buffer.from(html).toString('base64');
  return [
    '<!doctype html><html lang="ko"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>' + safeName + '</title><link rel="stylesheet" href="/assets/public.css"></head>',
    '<body><main><header><span>GLOWUPRIZZ</span><h1>' + safeName + '</h1></header>',
    '<iframe id="form" title="' + safeName + ' 신청 폼" sandbox="allow-scripts allow-forms"></iframe>',
    '<p id="status" role="status" aria-live="polite"></p></main>',
    '<script nonce="' + nonce + '" src="/assets/form-host.js?v=5" data-token="' + linkToken + '" data-nonce="' + nonce + '" data-html="' + encoded + '"></script>',
    '</body></html>',
  ].join('');
}

export async function createApp(db: Queryable) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.use(express.json({ limit: '128kb' }));
  app.use(express.urlencoded({ extended: false }));

  const here = dirname(fileURLToPath(import.meta.url));
  const publicDir = join(here, '..', 'public');
  app.use('/assets', express.static(publicDir, { maxAge: '1h' }));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/', (_req, res) => res.redirect('/admin'));
  app.get(/^\/admin(?:\/.*)?$/, (_req, res) => res.sendFile(join(publicDir, 'index.html')));

  app.post('/api/auth/login', wrap(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const result = await db.query('SELECT id, password_hash FROM operators WHERE email = $1', [body.email.toLowerCase()]);
    const operator = result.rows[0];
    if (!operator || !(await bcrypt.compare(body.password, operator.password_hash))) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }
    const session = await createSession(db, operator.id);
    res.cookie(SESSION_COOKIE, session, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ email: body.email.toLowerCase() });
  }));

  app.post('/api/auth/logout', wrap(async (req, res) => {
    await deleteSession(db, req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.status(204).end();
  }));

  const auth = requireAuth(db);
  app.get('/api/me', auth, wrap(async (req, res) => {
    const result = await db.query('SELECT id, email FROM operators WHERE id = $1', [req.operatorId]);
    res.json(result.rows[0]);
  }));

  app.get('/api/forms', auth, wrap(async (req, res) => {
    const result = await db.query(
      'SELECT id, name, filename, created_at FROM form_templates WHERE operator_id = $1 ORDER BY created_at DESC',
      [req.operatorId],
    );
    res.json(result.rows);
  }));

  app.post('/api/forms', auth, upload.single('file'), wrap(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: '.html 파일이 필요합니다.' });
    const html = req.file.buffer.toString('utf8');
    if (!/<form[\s>]/i.test(html)) return res.status(400).json({ error: 'HTML에 form 요소가 필요합니다.' });
    const id = randomUUID();
    const name = String(req.body.name || req.file.originalname.replace(/\.html$/i, '')).slice(0, 120);
    await db.query(
      'INSERT INTO form_templates (id, operator_id, name, filename, html) VALUES ($1, $2, $3, $4, $5)',
      [id, req.operatorId, name, req.file.originalname, html],
    );
    res.status(201).json({ id, name, filename: req.file.originalname });
  }));

  app.get('/api/campaigns', auth, wrap(async (req, res) => {
    const result = await db.query(
      `SELECT c.id, c.name, c.public_id, c.status, c.created_at,
              f.name AS form_name,
              COUNT(DISTINCT v.id)::int AS visits,
              COUNT(DISTINCT v.visitor_id)::int AS visitors,
              COUNT(DISTINCT s.id)::int AS submissions
       FROM campaigns c
       JOIN form_templates f ON f.id = c.form_template_id
       LEFT JOIN visits v ON v.campaign_id = c.id
       LEFT JOIN submissions s ON s.campaign_id = c.id
       WHERE c.operator_id = $1
       GROUP BY c.id, f.name ORDER BY c.created_at DESC`,
      [req.operatorId],
    );
    res.json(result.rows.map(row => ({ ...row, conversionRate: row.visitors ? Number(((row.submissions / row.visitors) * 100).toFixed(1)) : 0 })));
  }));

  app.post('/api/campaigns', auth, wrap(async (req, res) => {
    const body = campaignSchema.parse(req.body);
    const form = await db.query('SELECT id FROM form_templates WHERE id = $1 AND operator_id = $2', [body.formTemplateId, req.operatorId]);
    if (!form.rows[0]) return res.status(404).json({ error: '폼을 찾을 수 없습니다.' });
    const id = randomUUID();
    const publicId = token();
    await db.query(
      'INSERT INTO campaigns (id, operator_id, form_template_id, name, public_id) VALUES ($1, $2, $3, $4, $5)',
      [id, req.operatorId, body.formTemplateId, body.name, publicId],
    );
    res.status(201).json({ id, publicId, name: body.name, status: 'active' });
  }));

  app.get('/api/campaigns/:id/links', auth, wrap(async (req, res) => {
    const result = await db.query(
      `SELECT l.id, l.channel, l.token FROM distribution_links l
       JOIN campaigns c ON c.id = l.campaign_id WHERE c.id = $1 AND c.operator_id = $2 ORDER BY l.channel`,
      [req.params.id, req.operatorId],
    );
    const base = process.env.PUBLIC_BASE_URL ?? `${req.protocol}://${req.get('host')}`;
    res.json(result.rows.map(row => ({ ...row, url: `${base}/f/${row.token}` })));
  }));

  app.post('/api/campaigns/:id/links', auth, wrap(async (req, res) => {
    const body = linkSchema.parse(req.body);
    const campaign = await db.query('SELECT id FROM campaigns WHERE id = $1 AND operator_id = $2', [req.params.id, req.operatorId]);
    if (!campaign.rows[0]) return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
    const linkToken = token();
    const result = await db.query(
      `INSERT INTO distribution_links (id, campaign_id, channel, token)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (campaign_id, channel) DO UPDATE SET channel = EXCLUDED.channel
       RETURNING id, channel, token`,
      [randomUUID(), req.params.id, body.channel, linkToken],
    );
    const row = result.rows[0];
    const base = process.env.PUBLIC_BASE_URL ?? `${req.protocol}://${req.get('host')}`;
    res.status(201).json({ ...row, url: `${base}/f/${row.token}` });
  }));

  app.get('/api/campaigns/:id/submissions', auth, wrap(async (req, res) => {
    const result = await db.query(
      `SELECT s.id, s.data, s.created_at, l.channel FROM submissions s
       JOIN campaigns c ON c.id = s.campaign_id
       JOIN distribution_links l ON l.id = s.distribution_link_id
       WHERE c.id = $1 AND c.operator_id = $2 ORDER BY s.created_at DESC LIMIT 200`,
      [req.params.id, req.operatorId],
    );
    res.json(result.rows);
  }));

  app.get('/api/campaigns/:id/analytics', auth, wrap(async (req, res) => {
    const owner = await db.query('SELECT id FROM campaigns WHERE id = $1 AND operator_id = $2', [req.params.id, req.operatorId]);
    if (!owner.rows[0]) return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
    const totalVisits = await db.query(
      'SELECT COUNT(id)::int AS visits, COUNT(DISTINCT visitor_id)::int AS visitors FROM visits WHERE campaign_id = $1',
      [req.params.id],
    );
    const totalSubmissions = await db.query(
      'SELECT COUNT(id)::int AS submissions FROM submissions WHERE campaign_id = $1',
      [req.params.id],
    );
    const links = await db.query('SELECT id, channel FROM distribution_links WHERE campaign_id = $1 ORDER BY channel', [req.params.id]);
    const visits = await db.query(
      `SELECT distribution_link_id, COUNT(id)::int AS visits, COUNT(DISTINCT visitor_id)::int AS visitors
       FROM visits WHERE campaign_id = $1 GROUP BY distribution_link_id`, [req.params.id],
    );
    const submissions = await db.query(
      `SELECT distribution_link_id, COUNT(id)::int AS submissions
       FROM submissions WHERE campaign_id = $1 GROUP BY distribution_link_id`, [req.params.id],
    );
    const visitMap = new Map(visits.rows.map(row => [row.distribution_link_id, row]));
    const submissionMap = new Map(submissions.rows.map(row => [row.distribution_link_id, row]));
    const byChannel = links.rows.map(link => ({
      channel: link.channel,
      visits: visitMap.get(link.id)?.visits ?? 0,
      visitors: visitMap.get(link.id)?.visitors ?? 0,
      submissions: submissionMap.get(link.id)?.submissions ?? 0,
    }));
    const metric = (row: any) => ({ ...row, conversionRate: row.visitors ? Number(((row.submissions / row.visitors) * 100).toFixed(1)) : 0 });
    const total = { ...totalVisits.rows[0], submissions: totalSubmissions.rows[0]?.submissions ?? 0 };
    res.json({ total: metric(total), channels: byChannel.map(metric) });
  }));

  app.get('/f/:token', wrap(async (req, res) => {
    const result = await db.query(
      `SELECT c.id AS campaign_id, c.name, c.status, f.html, l.id AS link_id, l.token
       FROM distribution_links l JOIN campaigns c ON c.id = l.campaign_id
       JOIN form_templates f ON f.id = c.form_template_id WHERE l.token = $1`, [req.params.token],
    );
    const form = result.rows[0];
    if (!form || form.status !== 'active') return res.status(404).send('사용할 수 없는 캠페인입니다.');
    const nonce = randomBytes(18).toString('base64url');
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; frame-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`);
    res.send(publicFormPage(form.name, form.html, form.token, nonce));
  }));

  app.post('/api/public/:token/visit', wrap(async (req, res) => {
    const visitorId = z.object({ visitorId: z.string().min(8).max(100) }).parse(req.body).visitorId;
    const link = await db.query(
      `SELECT l.id, l.campaign_id FROM distribution_links l JOIN campaigns c ON c.id = l.campaign_id
       WHERE l.token = $1 AND c.status = 'active'`, [req.params.token],
    );
    if (!link.rows[0]) return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
    await db.query('INSERT INTO visits (id, campaign_id, distribution_link_id, visitor_id, user_agent) VALUES ($1, $2, $3, $4, $5)',
      [randomUUID(), link.rows[0].campaign_id, link.rows[0].id, visitorId, req.get('user-agent')?.slice(0, 500) ?? null]);
    res.status(201).json({ recorded: true });
  }));

  app.post('/api/public/:token/submissions', wrap(async (req, res) => {
    const body = submissionSchema.parse(req.body);
    const serialized = JSON.stringify(body.data);
    if (serialized.length > 64 * 1024) return res.status(413).json({ error: '신청 데이터가 너무 큽니다.' });
    const link = await db.query(
      `SELECT l.id, l.campaign_id FROM distribution_links l JOIN campaigns c ON c.id = l.campaign_id
       WHERE l.token = $1 AND c.status = 'active'`, [req.params.token],
    );
    if (!link.rows[0]) return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
    const id = randomUUID();
    await db.query('INSERT INTO submissions (id, campaign_id, distribution_link_id, visitor_id, data) VALUES ($1, $2, $3, $4, $5::jsonb)',
      [id, link.rows[0].campaign_id, link.rows[0].id, body.visitorId, serialized]);
    res.status(201).json({ id, message: '신청이 완료되었습니다.' });
  }));

  try {
    const spec = JSON.parse(await readFile(join(here, '..', 'openapi.json'), 'utf8'));
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec));
  } catch { /* API still runs if docs file is unavailable in a test bundle */ }

  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof z.ZodError) return res.status(400).json({ error: '요청 값이 올바르지 않습니다.', details: error.issues });
    if (error?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'HTML 파일은 512KB 이하여야 합니다.' });
    console.error(error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  });
  return app;
}
