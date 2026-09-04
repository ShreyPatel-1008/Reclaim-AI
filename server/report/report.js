// Batch report / metrics (TDD §9, corrections #2/#3).
import { pool, num } from '../db/pool.js';

export async function computeAndStoreReport(runId) {
  const { rows: [agg] } = await pool.query(
    `SELECT
        COUNT(*)::int                                             AS total,
        COALESCE(SUM(amount),0)                                   AS amount_attempted,
        COALESCE(SUM(recovered_amount),0)                         AS amount_recovered,
        COUNT(*) FILTER (WHERE status='recovered')::int           AS recovered_count,
        COUNT(*) FILTER (WHERE status='escalated')::int           AS escalated_count,
        COUNT(*) FILTER (WHERE status='failed')::int              AS failed_count,
        COUNT(*) FILTER (WHERE status='no_action')::int           AS no_action_count
     FROM payments WHERE run_id=$1`, [runId]
  );

  const attempted = num(agg.amount_attempted);
  const recoveredAmt = num(agg.amount_recovered);
  // recovery_rate denominator = whole batch (includes escalated / no-action),
  // so the headline number is honest, not cherry-picked (correction: TDD §9).
  const recovery_rate = attempted > 0 ? recoveredAmt / attempted : 0;
  const escalation_rate = agg.total > 0 ? agg.escalated_count / agg.total : 0;

  // by-root-cause breakdown for the dashboard
  const { rows: byCause } = await pool.query(
    `SELECT root_cause,
            COUNT(*)::int AS count,
            COALESCE(SUM(amount),0) AS amount,
            COALESCE(SUM(recovered_amount),0) AS recovered
     FROM payments WHERE run_id=$1 GROUP BY root_cause ORDER BY amount DESC`, [runId]
  );
  const { rows: byAction } = await pool.query(
    `SELECT action, COUNT(*)::int AS count FROM payments WHERE run_id=$1 GROUP BY action ORDER BY count DESC`, [runId]
  );

  const { rows: [run] } = await pool.query(
    `UPDATE batch_runs
        SET amount_recovered=$2, recovery_rate=$3, escalation_rate=$4,
            status='completed', completed_at=now()
      WHERE run_id=$1 RETURNING *`,
    [runId, recoveredAmt, recovery_rate, escalation_rate]
  );

  return {
    run_id: runId,
    total_records: agg.total,
    rows_rejected: run.rows_rejected,
    amount_attempted: attempted,
    amount_recovered: recoveredAmt,
    recovery_rate: round4(recovery_rate),
    recovery_rate_pct: round1(recovery_rate * 100),
    escalation_rate: round4(escalation_rate),
    escalation_rate_pct: round1(escalation_rate * 100),
    recovered_count: agg.recovered_count,
    escalated_count: agg.escalated_count,
    failed_count: agg.failed_count,
    no_action_count: agg.no_action_count,
    diagnosis_accuracy: num(run.diagnosis_accuracy), // null until an eval runs
    by_root_cause: byCause.map((r) => ({ ...r, amount: num(r.amount), recovered: num(r.recovered) })),
    by_action: byAction,
  };
}

export async function getReport(runId) {
  const { rows: [run] } = await pool.query(`SELECT * FROM batch_runs WHERE run_id=$1`, [runId]);
  if (!run) return null;
  if (run.status !== 'completed') {
    return { run_id: runId, status: run.status, total_records: run.total_records, rows_rejected: run.rows_rejected };
  }
  return computeAndStoreReport(runId);
}
