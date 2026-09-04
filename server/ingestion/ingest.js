// CSV ingestion + validation (TDD §5.1, §10; corrections #9).
// - blank failure_code is VALID (the deliberate ambiguous rows)
// - malformed rows and duplicate payment_ids are rejected and counted
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { pool } from '../db/pool.js';

const REQUIRED = ['payment_id', 'amount', 'payment_method', 'customer_tier', 'retry_count', 'timestamp'];
const METHODS = new Set(['card', 'upi', 'netbanking', 'wallet', 'emandate']);
const TIERS = new Set(['bronze', 'silver', 'gold', 'platinum']);

export function parseAndValidate(csvText) {
  const rows = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });
  const valid = [];
  const rejected = [];
  const seen = new Set();

  for (const [i, r] of rows.entries()) {
    const rowNum = i + 2; // +1 header, +1 to 1-index
    const problems = [];

    for (const col of REQUIRED) {
      if (r[col] === undefined || r[col] === '') problems.push(`missing ${col}`);
    }
    const amount = Number(r.amount);
    if (Number.isNaN(amount) || amount < 0) problems.push('invalid amount');
    const retry = Number(r.retry_count);
    if (!Number.isInteger(retry) || retry < 0) problems.push('invalid retry_count');
    if (r.payment_method && !METHODS.has(r.payment_method)) problems.push(`unknown method ${r.payment_method}`);
    if (r.customer_tier && !TIERS.has(r.customer_tier)) problems.push(`unknown tier ${r.customer_tier}`);
    if (r.payment_id && seen.has(r.payment_id)) problems.push('duplicate payment_id');

    if (problems.length) {
      rejected.push({ row: rowNum, payment_id: r.payment_id || null, problems });
      continue;
    }
    seen.add(r.payment_id);
    valid.push({
      payment_id: r.payment_id,
      amount,
      failure_code: r.failure_code === '' ? null : r.failure_code, // blank -> null (valid)
      payment_method: r.payment_method,
      customer_tier: r.customer_tier,
      retry_count: retry,
      failed_at: r.timestamp,
    });
  }
  return { valid, rejected };
}

// Ingest a CSV into a fresh batch_run. Returns { run_id, total, rejected }.
export async function ingestCsv(csvText, source = 'upload') {
  const { valid, rejected } = parseAndValidate(csvText);
  const runId = randomUUID();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const amountAttempted = valid.reduce((s, p) => s + p.amount, 0);
    await client.query(
      `INSERT INTO batch_runs (run_id, source, status, total_records, rows_rejected, amount_attempted)
       VALUES ($1,$2,'ingested',$3,$4,$5)`,
      [runId, source, valid.length, rejected.length, amountAttempted]
    );
    for (const p of valid) {
      await client.query(
        `INSERT INTO payments
           (run_id, payment_id, amount, failure_code, payment_method, customer_tier, retry_count, failed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [runId, p.payment_id, p.amount, p.failure_code, p.payment_method, p.customer_tier, p.retry_count, p.failed_at]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return { run_id: runId, total: valid.length, rejected };
}

export function loadDatasetFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}
