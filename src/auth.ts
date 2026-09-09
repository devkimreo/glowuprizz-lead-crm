import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Queryable } from './db.js';

export const SESSION_COOKIE = 'glow_session';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export async function createSession(db: Queryable, operatorId: string) {
  const token = randomBytes(32).toString('base64url');
  await db.query(
    `INSERT INTO sessions (id, operator_id, token_hash, expires_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')`,
    [randomUUID(), operatorId, digest(token)],
  );
  return token;
}

export async function deleteSession(db: Queryable, token?: string) {
  if (token) await db.query('DELETE FROM sessions WHERE token_hash = $1', [digest(token)]);
}

declare global {
  namespace Express {
    interface Request { operatorId?: string }
  }
}

export function requireAuth(db: Queryable) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.cookies?.[SESSION_COOKIE];
      if (!token) return res.status(401).json({ error: '인증이 필요합니다.' });
      const result = await db.query(
        `SELECT operator_id FROM sessions
         WHERE token_hash = $1 AND expires_at > NOW()`,
        [digest(token)],
      );
      if (!result.rows[0]) return res.status(401).json({ error: '세션이 만료되었습니다.' });
      req.operatorId = result.rows[0].operator_id;
      next();
    } catch (error) { next(error); }
  };
}
