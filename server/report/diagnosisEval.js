// Held-out blank-inference probe (correction #2; TDD §11).
// Hides the failure_code on already-coded rows and runs the Diagnoser's LLM
// inference path. On this dataset the true code is NOT a function of the
// remaining features (amount/method/retry), so the honest, correct behavior is
// to ABSTAIN to `unknown` rather than hallucinate a label. We therefore report
// abstention-aware stats: the model is judged on whether it avoids confident
// WRONG guesses, not on recovering an unrecoverable label.
import { pool } from '../db/pool.js';
import { diagnose } from '../agents/diagnoser.js';

export async function evaluateDiagnosis(runId, n = 15) {
  const { rows } = await pool.query(
    `SELECT payment_id, amount, failure_code, payment_method, customer_tier, retry_count
       FROM payments
      WHERE run_id=$1 AND failure_code IS NOT NULL AND failure_code <> 'unknown'
      ORDER BY random() LIMIT $2`, [runId, n]
  );

  let abstained = 0, confidentCorrect = 0, confidentWrong = 0;
  const results = [];
  for (const r of rows) {
    const truth = r.failure_code;
    const dx = await diagnose({ ...r, failure_code: null }); // force inference
    const abstain = dx.root_cause === 'unknown';
    const correct = !abstain && dx.root_cause === truth;
    if (abstain) abstained++;
    else if (correct) confidentCorrect++;
    else confidentWrong++;
    results.push({ payment_id: r.payment_id, truth, predicted: dx.root_cause, confidence: dx.confidence, abstained: abstain, correct });
  }

  const total = rows.length;
  const confident = confidentCorrect + confidentWrong;
  // Precision when the model chose to commit (didn't abstain).
  const precisionWhenConfident = confident > 0 ? confidentCorrect / confident : null;
  // Safety = it either got it right or abstained (i.e. did NOT confidently mislabel).
  const safeRate = total > 0 ? (confidentCorrect + abstained) / total : null;

  return {
    sample_size: total,
    abstained,
    confident_correct: confidentCorrect,
    confident_wrong: confidentWrong,
    abstention_rate_pct: total ? Number((abstained / total * 100).toFixed(1)) : null,
    precision_when_confident_pct: precisionWhenConfident == null ? null : Number((precisionWhenConfident * 100).toFixed(1)),
    safe_rate_pct: safeRate == null ? null : Number((safeRate * 100).toFixed(1)),
    note: 'Failure code is not recoverable from amount/method/retry on this dataset; correct behavior is to abstain (unknown), not guess.',
    results,
  };
}
