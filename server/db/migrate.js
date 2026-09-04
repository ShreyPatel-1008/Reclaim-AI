// Creates the app database (if missing) and applies schema.sql.
// Usage: node db/migrate.js
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { pool } from './pool.js';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_NAME = process.env.PGDATABASE || 'revenue_recovery';

async function ensureDatabase() {
  // Connect to the default 'postgres' DB to create the app DB if needed.
  if (process.env.DATABASE_URL) return; // assume the URL points at an existing DB
  const admin = new Client({
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    database: 'postgres',
  });
  await admin.connect();
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME]);
  if (exists.rowCount === 0) {
    await admin.query(`CREATE DATABASE ${JSON.stringify(DB_NAME).replace(/"/g, '"')}`);
    console.log(`  created database "${DB_NAME}"`);
  } else {
    console.log(`  database "${DB_NAME}" already exists`);
  }
  await admin.end();
}

async function applySchema() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('  schema applied');
}

try {
  await ensureDatabase();
  await applySchema();
  console.log('Migration complete.');
  await pool.end();
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exit(1);
}
