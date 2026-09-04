// Ingests the bundled synthetic dataset into a fresh batch_run.
// Usage: node scripts/seed.js
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingestCsv, loadDatasetFile } from '../ingestion/ingest.js';
import { pool } from '../db/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATASET = path.join(__dirname, '..', 'data', 'failed_payments_synthetic.csv');

try {
  const csv = loadDatasetFile(DATASET);
  const out = await ingestCsv(csv, 'bundled_dataset');
  console.log(`Ingested run ${out.run_id}: ${out.total} payments, ${out.rejected.length} rejected.`);
  if (out.rejected.length) console.log('Rejected:', JSON.stringify(out.rejected, null, 2));
  await pool.end();
} catch (e) {
  console.error('Seed failed:', e.message);
  process.exit(1);
}
