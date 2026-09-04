// Pipeline orchestrator — the Node equivalent of the LangGraph state graph:
//   Diagnose -> Decide -> Act -> Log, one payment at a time.
// Every agent step writes an audit_log row before the next step runs, so the
// trail is complete even if the run is interrupted (NFR-5).
import { pool } from '../db/pool.js';
import { diagnose } from '../agents/diagnoser.js';
import { decide } from '../agents/strategist.js';
import { execute } from '../agents/executor.js';
import { computeAndStoreReport } from '../report/report.js';

async function audit(client, runId, paymentId, agent, { input, output, confidence = null, reasoning, simulated = null }) {
  await client.query(
    `INSERT INTO audit_log (run_id, payment_id, agent, input_snapshot, output, confidence, reasoning, simulated)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [runId, paymentId, agent, input, output, confidence, reasoning, simulated]
  );
}

// Runs the full pipeline over an ingested batch. `onEvent` receives live events.
export async function runBatch(runId, { onEvent, stepDelayMs = 0 } = {}) {
  const emit = (e) => onEvent && onEvent(e);
  const { rows: payments } = await pool.query(
    `SELECT * FROM payments WHERE run_id = $1 ORDER BY payment_id`, [runId]
  );
  await pool.query(`UPDATE batch_runs SET status='running' WHERE run_id=$1`, [runId]);
  emit({ type: 'batch_start', runId, total: payments.length });

  let recovered = 0, recoveredCount = 0, escalated = 0, actionsTaken = 0;

  for (const p of payments) {
    p.run_id = runId;
    p.amount = Number(p.amount);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // --- Diagnose ---
      const dx = await diagnose(p);
      p.root_cause = dx.root_cause;
      await audit(client, runId, p.payment_id, 'diagnoser', {
        input: { failure_code: p.failure_code, amount: p.amount, payment_method: p.payment_method, retry_count: p.retry_count },
        output: dx.root_cause, confidence: dx.confidence, reasoning: dx.reasoning,
      });

      // --- Decide ---
      const st = decide({ root_cause: p.root_cause, amount: p.amount, retry_count: p.retry_count });
      p.action = st.action;
      await audit(client, runId, p.payment_id, 'strategist', {
        input: { root_cause: p.root_cause, amount: p.amount, retry_count: p.retry_count },
        output: st.action, reasoning: st.reasoning,
      });

      // --- Act ---
      const ex = await execute(p);
      actionsTaken++;
      await audit(client, runId, p.payment_id, 'executor', {
        input: { action: p.action }, output: ex.result, reasoning: ex.notes, simulated: ex.simulated,
      });

      // map executor result -> payment status
      const status = ex.result === 'success' ? 'recovered'
        : ex.result === 'escalated' ? 'escalated'
        : ex.result === 'no_action' ? 'no_action'
        : 'failed';
      if (status === 'recovered') { recovered += ex.recovered; recoveredCount++; }
      if (status === 'escalated') escalated++;

      await client.query(
        `UPDATE payments SET root_cause=$1, diagnosis_confidence=$2, action=$3, status=$4,
           recovered_amount=$5, simulated=$6 WHERE run_id=$7 AND payment_id=$8`,
        [p.root_cause, dx.confidence, p.action, status, ex.recovered, ex.simulated, runId, p.payment_id]
      );
      await client.query('COMMIT');

      emit({
        type: 'payment_done',
        payment: {
          payment_id: p.payment_id, amount: p.amount, payment_method: p.payment_method,
          customer_tier: p.customer_tier, failure_code: p.failure_code, retry_count: p.retry_count,
          root_cause: p.root_cause, diagnosis_confidence: dx.confidence, diagnosis_source: dx.source,
          action: p.action, status, recovered_amount: ex.recovered, simulated: ex.simulated,
          stopping_rule: st.stoppingRule,
        },
        running: { recovered, recoveredCount, escalated, actionsTaken },
      });
    } catch (e) {
      await client.query('ROLLBACK');
      emit({ type: 'payment_error', payment_id: p.payment_id, message: e.message });
    } finally {
      client.release();
    }
    if (stepDelayMs) await new Promise((r) => setTimeout(r, stepDelayMs));
  }

  const report = await computeAndStoreReport(runId);
  emit({ type: 'batch_complete', report });
  return report;
}
