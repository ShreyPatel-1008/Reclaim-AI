import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

// Connection resolves from DATABASE_URL, or discrete PG* vars, or sane local
// defaults for the Postgres 18 instance detected on port 5432.
function buildConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }
  return {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    database: process.env.PGDATABASE || 'revenue_recovery',
  };
}

export const pool = new Pool(buildConfig());

// Without this, an idle-client or connection error (e.g. no password set yet)
// is emitted as an unhandled 'error' event and crashes the process.
pool.on('error', (err) => {
  console.error('[pg pool] error:', err.message);
});

// Postgres numeric columns come back as strings via node-postgres; parse the
// money/decimal columns to numbers so the API and report math are clean.
export async function query(text, params) {
  return pool.query(text, params);
}

export function num(v) {
  return v == null ? null : Number(v);
}
