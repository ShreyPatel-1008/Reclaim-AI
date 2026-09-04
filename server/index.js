import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { router } from './routes/api.js';
import { llmEnabled, activeModel } from './llm/openrouter.js';
import { razorpayEnabled } from './razorpay/client.js';
import { pool } from './db/pool.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use('/api', router);

const PORT = process.env.PORT || 4000;

app.listen(PORT, async () => {
  let db = 'DISCONNECTED';
  try { await pool.query('SELECT 1'); db = 'connected'; } catch { db = 'DISCONNECTED (set PGPASSWORD in .env and run: npm run migrate)'; }
  console.log(`\n  AI Revenue Recovery — server on http://localhost:${PORT}`);
  console.log(`  Postgres:  ${db}`);
  console.log(`  Diagnoser: ${llmEnabled() ? `OpenRouter (${activeModel()})` : 'rules-only (set OPENROUTER_API_KEY)'}`);
  console.log(`  Executor:  ${razorpayEnabled() ? 'Razorpay test-mode + mock fallback' : 'mock-only (set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)'}\n`);
});
