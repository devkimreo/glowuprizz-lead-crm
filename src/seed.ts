import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { pool } from './db.js';

const email = (process.env.ADMIN_EMAIL ?? 'admin@example.com').toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? 'ChangeMe123!';
const passwordHash = await bcrypt.hash(password, 12);
await pool.query(
  `INSERT INTO operators (id, email, password_hash) VALUES ($1, $2, $3)
   ON CONFLICT (email) DO NOTHING`,
  [randomUUID(), email, passwordHash],
);
await pool.end();
console.log(`Admin account ready: ${email}`);
