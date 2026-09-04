import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, num } from '../db/pool.js';
import { ingestCsv, loadDatasetFile } from '../ingestion/ingest.js';
import { runBatch } from '../pipeline/runBatch.js';
import { getReport } from '../report/report.js';
import { evaluateDiagnosis } from '../report/diagnosisEval.js';
import { POLICY, ALLOWED_ACTIONS } from '../config/policy.js';
import { ROOT_CAUSES } from '../config/failureCodes.js';
import { llmEnabled, activeModel } from '../llm/openrouter.js';
import { razorpayEnabled } from '../razorpay/client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATASET = path.join(__dirname, '..', 'data', 'failed_payments_synthetic.csv');

export const router = express.Router();

// Express 4 does not catch rejections from async handlers — without this a DB
// error (e.g. no password configured) would crash the process instead of
// returning a 500. Wrap every async handler.
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((e) => {
  if (!res.headersSent) res.status(500).json({ error: e.message });
  else { try { res.end(); } catch { /* noop */ } }
});

router.get('/health', async (_req, res) => {
  let db = false;
  try { await pool.query('SELECT 1'); db = true; } catch { db = false; }
  res.json({ ok: true, db, aiEnabled: llmEnabled(), model: activeModel(), razorpay: razorpayEnabled() });
});

router.get('/policy', (_req, res) => {
  res.json({ policy: POLICY, allowedActions: ALLOWED_ACTIONS, rootCauses: ROOT_CAUSES });
});

// Ingest a batch. Body: { csv?: string, source?: string }. Defaults to the
// bundled synthetic dataset.
router.post('/batches', async (req, res) => {
  try {
    const csv = req.body?.csv || loadDatasetFile(DATASET);
    const source = req.body?.source || (req.body?.csv ? 'upload' : 'bundled_dataset');
    const out = await ingestCsv(csv, source);
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Most recent run (UI convenience).
router.get('/batches/latest', h(async (_req, res) => {
  const { rows } = await pool.query(`SELECT run_id, status FROM batch_runs ORDER BY started_at DESC LIMIT 1`);
  res.json(rows[0] || null);
}));

router.get('/batches/:runId/payments', h(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT payment_id, amount, failure_code, payment_method, customer_tier, retry_count,
            root_cause, diagnosis_confidence, action, status, recovered_amount, simulated
       FROM payments WHERE run_id=$1 ORDER BY payment_id`, [req.params.runId]
  );
  res.json({ payments: rows.map((r) => ({ ...r, amount: num(r.amount), recovered_amount: num(r.recovered_amount), diagnosis_confidence: num(r.diagnosis_confidence) })) });
}));

router.get('/batches/:runId/report', h(async (req, res) => {
  const report = await getReport(req.params.runId);
  if (!report) return res.status(404).json({ error: 'run not found' });
  res.json(report);
}));

router.get('/payments/:paymentId/audit', h(async (req, res) => {
  const { run_id } = req.query;
  const { rows } = await pool.query(
    `SELECT id, agent, input_snapshot, output, confidence, reasoning, simulated, created_at
       FROM audit_log WHERE payment_id=$1 ${run_id ? 'AND run_id=$2' : ''} ORDER BY id`,
    run_id ? [req.params.paymentId, run_id] : [req.params.paymentId]
  );
  res.json({ payment_id: req.params.paymentId, audit: rows.map((r) => ({ ...r, confidence: num(r.confidence) })) });
}));

// Run the pipeline over a batch, streaming decisions via SSE (EventSource GET).
router.get('/batches/:runId/run', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const send = (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  const speed = req.query.speed || 'fast';
  const stepDelayMs = speed === 'instant' ? 0 : speed === 'normal' ? 40 : 12;
  try {
    await runBatch(req.params.runId, { onEvent: send, stepDelayMs });
    send({ type: 'done' });
  } catch (e) {
    send({ type: 'error', message: e.message });
  } finally {
    res.end();
  }
});

// Held-out diagnosis-accuracy eval.
router.post('/batches/:runId/eval', async (req, res) => {
  try {
    const n = Number(req.query.n) || 15;
    const out = await evaluateDiagnosis(req.params.runId, n);
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
