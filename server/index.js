import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { generateAccounts, summarize } from './seed.js';
import { runBatch } from './engine/recoveryEngine.js';
import { POLICY, LADDER } from './engine/decisionEngine.js';
import { aiEnabled } from './engine/aiAdvisor.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

// ---- In-memory store (zero external deps, resets on restart) --------------
const store = {
  accounts: generateAccounts(200),
  lastResult: null,
  auditLog: [],
};

// ---- Meta ----------------------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, aiEnabled: aiEnabled(), model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet' });
});

app.get('/api/policy', (_req, res) => {
  res.json({ policy: POLICY, ladder: LADDER });
});

// Current batch (at-risk accounts + summary)
app.get('/api/accounts', (_req, res) => {
  res.json({ accounts: store.accounts, summary: summarize(store.accounts) });
});

app.get('/api/audit', (req, res) => {
  const limit = Number(req.query.limit) || 500;
  res.json({ audit: store.auditLog.slice(-limit).reverse(), result: store.lastResult });
});

// Reset / regenerate a fresh batch
app.post('/api/reset', (req, res) => {
  const n = Number(req.body?.count) || 200;
  store.accounts = generateAccounts(n);
  store.lastResult = null;
  store.auditLog = [];
  res.json({ ok: true, summary: summarize(store.accounts) });
});

// ---- Run the recovery batch, streaming events over SSE -------------------
app.get('/api/run', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (evt) => res.write(`data: ${JSON.stringify(evt)}\n\n`);
  const speed = req.query.speed || 'normal';
  const stepDelayMs = speed === 'instant' ? 0 : speed === 'fast' ? 8 : 25;

  // fresh copy so re-running is idempotent from the seeded state
  const accounts = store.accounts.map((a) => ({ ...a, status: 'at_risk', attempts: 0, messagesSent: 0, hoursSinceLastMessage: null, recoveredAmount: 0 }));

  try {
    const { result, auditLog, accounts: processed } = await runBatch(accounts, { onEvent: send, stepDelayMs });
    store.lastResult = result;
    store.auditLog = auditLog;
    store.accounts = processed;
    send({ type: 'done' });
  } catch (err) {
    send({ type: 'error', message: String(err?.message || err) });
  } finally {
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`\n  Reclaim server → http://localhost:${PORT}`);
  console.log(`  AI layer: ${aiEnabled() ? 'OpenRouter ENABLED' : 'rules-only (set OPENROUTER_API_KEY to enable)'}\n`);
});
