// Diagnosis-accuracy evaluation (correction #2; TDD §11 fixture test).
// Takes already-CODED payments, HIDES their failure_code, runs the Diagnoser's
// inference path, and scores its guess against the true code. This is the only
// honest way to measure the LLM's diagnostic ability — the deterministic
// mapping on coded rows would trivially score 100%.
import { pool } from '../db/pool.js';
import { diagnose } from '../agents/diagnoser.js';

export async function evaluateDiagnosis(runId, n = 15) {
  // Sample coded rows (exclude already-unknown and blank rows).
  const { rows } = await pool.query(
    `SELECT payment_id, amount, failure_code, payment_method, customer_tier, retry_count
       FROM payments
      WHERE run_id=$1 AND failure_code IS NOT NULL AND failure_code <> 'unknown'
      ORDER BY random() LIMIT $2`, [runId, n]
  );

  const results = [];
  let correct = 0;
  for (const r of rows) {
    const truth = r.failure_code;
    const dx = await diagnose({ ...r, failure_code: null }); // force inference
    const hit = dx.root_cause === truth;
    if (hit) correct++;
    results.push({
      payment_id: r.payment_id, truth, predicted: dx.root_cause,
      confidence: dx.confidence, correct: hit, reasoning: dx.reasoning,
    });
  }

  const accuracy = rows.length ? correct / rows.length : null;
  if (accuracy != null) {
    await pool.query(`UPDATE batch_runs SET diagnosis_accuracy=$2 WHERE run_id=$1`, [runId, accuracy]);
  }
  return { sample_size: rows.length, correct, accuracy, accuracy_pct: accuracy == null ? null : Number((accuracy * 100).toFixed(1)), results };
}
