import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { newDb } from 'pg-mem';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createApp } from './app.js';
import { createSession } from './auth.js';

async function fixture() {
  const memory = newDb({ autoCreateForeignKeyIndices: true });
  memory.public.registerFunction({ name: 'current_timestamp', returns: 'timestamptz', implementation: () => new Date() });
  const adapter = memory.adapters.createPg();
  const pool = new adapter.Pool();
  const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  await pool.query(schema);
  await pool.query('INSERT INTO operators (id, email, password_hash) VALUES ($1, $2, $3)', [
    randomUUID(), 'admin@example.com', await bcrypt.hash('ChangeMe123!', 4),
  ]);
  return { app: await createApp(pool), pool };
}

async function login(app: Awaited<ReturnType<typeof createApp>>) {
  const response = await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: 'ChangeMe123!' });
  return response.headers['set-cookie'];
}

describe('lead magnet CRM', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let dbPool: any;
  beforeEach(async () => {
    const current = await fixture();
    app = current.app;
    dbPool = current.pool;
  });

  it('rejects unauthenticated admin requests and invalid credentials', async () => {
    await request(app).get('/admin/forms').expect(200);
    await request(app).get('/admin/forms/new').expect(200);
    await request(app).get('/admin/campaigns/new').expect(200);
    await request(app).get('/admin/campaigns/00000000-0000-0000-0000-000000000000/analytics').expect(200);
    await request(app).get('/api/campaigns').expect(401);
    await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: 'wrong-password' }).expect(401);
  });

  it('completes upload, campaign, channel visit, submission, and analytics flow', async () => {
    const cookie = await login(app);
    const form = await request(app).post('/api/forms').set('Cookie', cookie)
      .field('name', '테스트 폼').attach('file', Buffer.from('<html><body><form><input name="email"></form></body></html>'), 'form.html')
      .expect(201);
    const campaign = await request(app).post('/api/campaigns').set('Cookie', cookie)
      .send({ name: '테스트 캠페인', formTemplateId: form.body.id }).expect(201);
    const link = await request(app).post(`/api/campaigns/${campaign.body.id}/links`).set('Cookie', cookie)
      .send({ channel: 'instagram' }).expect(201);
    const publicPage = await request(app).get(`/f/${link.body.token}`).expect(200).expect('Content-Security-Policy', /frame-ancestors 'none'/);
    expect(publicPage.text).toContain('sandbox="allow-scripts allow-forms"');
    expect(publicPage.text).not.toContain('allow-same-origin');
    await request(app).post(`/api/public/${link.body.token}/visit`).send({ visitorId: 'visitor-12345678' }).expect(201);
    await request(app).post(`/api/public/${link.body.token}/submissions`)
      .send({ visitorId: 'visitor-12345678', data: { email: 'lead@example.com' } }).expect(201);
    const analytics = await request(app).get(`/api/campaigns/${campaign.body.id}/analytics`).set('Cookie', cookie).expect(200);
    expect(analytics.body.total).toMatchObject({ visits: 1, visitors: 1, submissions: 1, conversionRate: 100 });
    expect(analytics.body.channels[0]).toMatchObject({ channel: 'instagram', conversionRate: 100 });
  });

  it('rejects non-html uploads and forms without a form element', async () => {
    const cookie = await login(app);
    await request(app).post('/api/forms').set('Cookie', cookie).attach('file', Buffer.from('x'), 'note.txt').expect(400);
    await request(app).post('/api/forms').set('Cookie', cookie).attach('file', Buffer.from('<p>no form</p>'), 'bad.html').expect(400);
    await request(app).post('/api/public/not-a-real-token/visit').send({ visitorId: 'visitor-12345678' }).expect(404);
  });

  it('prevents one operator from reading another operator campaign', async () => {
    const ownerCookie = await login(app);
    const form = await request(app).post('/api/forms').set('Cookie', ownerCookie)
      .attach('file', Buffer.from('<form><input name="email"></form>'), 'owner.html').expect(201);
    const campaign = await request(app).post('/api/campaigns').set('Cookie', ownerCookie)
      .send({ name: '소유자 캠페인', formTemplateId: form.body.id }).expect(201);

    const otherId = randomUUID();
    await dbPool.query('INSERT INTO operators (id, email, password_hash) VALUES ($1, $2, $3)', [
      otherId, 'other@example.com', await bcrypt.hash('OtherPassword123!', 4),
    ]);
    const otherToken = await createSession(dbPool, otherId);
    await request(app).get(`/api/campaigns/${campaign.body.id}/analytics`)
      .set('Cookie', `glow_session=${otherToken}`).expect(404);
  });

  it('isolates uploaded HTML in an opaque sandbox with a nonce-restricted bridge', async () => {
    const cookie = await login(app);
    const hostileHtml = '<form><input name="email"></form><script>document.body.dataset.cookie = document.cookie</script>';
    const form = await request(app).post('/api/forms').set('Cookie', cookie)
      .attach('file', Buffer.from(hostileHtml), 'isolated.html').expect(201);
    const campaign = await request(app).post('/api/campaigns').set('Cookie', cookie)
      .send({ name: '격리 테스트', formTemplateId: form.body.id }).expect(201);
    const link = await request(app).post(`/api/campaigns/${campaign.body.id}/links`).set('Cookie', cookie)
      .send({ channel: 'threads' }).expect(201);

    const publicPage = await request(app).get(`/f/${link.body.token}`).expect(200);
    expect(publicPage.headers['content-security-policy']).toMatch(/script-src 'self' 'nonce-[^']+'/);
    expect(publicPage.text).toContain('sandbox="allow-scripts allow-forms"');
    expect(publicPage.text).not.toContain('allow-same-origin');
    expect(publicPage.text).not.toContain(hostileHtml);
  });

  it('rejects malformed and oversized public submissions', async () => {
    const cookie = await login(app);
    const form = await request(app).post('/api/forms').set('Cookie', cookie)
      .attach('file', Buffer.from('<form><input name="email"></form>'), 'public-errors.html').expect(201);
    const campaign = await request(app).post('/api/campaigns').set('Cookie', cookie)
      .send({ name: '공개 오류 테스트', formTemplateId: form.body.id }).expect(201);
    const link = await request(app).post(`/api/campaigns/${campaign.body.id}/links`).set('Cookie', cookie)
      .send({ channel: 'youtube' }).expect(201);

    await request(app).post(`/api/public/${link.body.token}/submissions`)
      .send({ visitorId: 'short', data: {} }).expect(400);
    await request(app).post(`/api/public/${link.body.token}/submissions`)
      .send({ visitorId: 'visitor-oversized', data: { note: 'x'.repeat(70 * 1024) } }).expect(413);
  });
});
