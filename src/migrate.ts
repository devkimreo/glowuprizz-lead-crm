import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from './db.js';

const here = dirname(fileURLToPath(import.meta.url));
const candidates = [join(here, 'schema.sql'), join(here, '..', 'src', 'schema.sql')];
let sql = '';
for (const candidate of candidates) {
  try { sql = await readFile(candidate, 'utf8'); break; } catch { /* try source path */ }
}
if (!sql) throw new Error('schema.sql not found');
await pool.query(sql);
await pool.end();
console.log('Database migration complete.');
