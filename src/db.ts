import pg from 'pg';

const { Pool } = pg;

export interface Queryable {
  query: (text: string, values?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://glowuprizz:glowuprizz@localhost:5432/glowuprizz',
});
