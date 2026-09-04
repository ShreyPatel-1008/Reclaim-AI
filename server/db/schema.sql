-- Schema for the AI Revenue Recovery agent (TDD §5).
-- Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS batch_runs (
  run_id            uuid PRIMARY KEY,
  source            text        NOT NULL,
  started_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,
  status            text        NOT NULL DEFAULT 'ingested', -- ingested | running | completed | failed
  total_records     int         NOT NULL DEFAULT 0,
  rows_rejected     int         NOT NULL DEFAULT 0,
  amount_attempted  numeric(14,2) NOT NULL DEFAULT 0,
  amount_recovered  numeric(14,2) NOT NULL DEFAULT 0,
  recovery_rate     numeric(6,4),
  escalation_rate   numeric(6,4),
  diagnosis_accuracy numeric(6,4)
);

CREATE TABLE IF NOT EXISTS payments (
  run_id          uuid NOT NULL REFERENCES batch_runs(run_id) ON DELETE CASCADE,
  payment_id      text NOT NULL,
  amount          numeric(12,2) NOT NULL,
  failure_code    text,                       -- nullable: blank rows are valid (correction #9)
  payment_method  text NOT NULL,
  customer_tier   text NOT NULL,
  retry_count     int  NOT NULL DEFAULT 0,
  failed_at       timestamptz,
  -- pipeline results (filled as it runs)
  root_cause      text,
  diagnosis_confidence numeric(4,3),
  action          text,
  status          text NOT NULL DEFAULT 'pending', -- pending | recovered | failed | escalated | no_action
  recovered_amount numeric(12,2) NOT NULL DEFAULT 0,
  simulated       boolean,
  PRIMARY KEY (run_id, payment_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id              bigserial PRIMARY KEY,
  run_id          uuid NOT NULL REFERENCES batch_runs(run_id) ON DELETE CASCADE,
  payment_id      text NOT NULL,
  agent           text NOT NULL,              -- diagnoser | strategist | executor
  input_snapshot  jsonb NOT NULL,
  output          text NOT NULL,              -- label / action / result
  confidence      numeric(4,3),
  reasoning       text NOT NULL,              -- mandatory plain-language justification
  simulated       boolean,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_run       ON payments(run_id);
CREATE INDEX IF NOT EXISTS idx_audit_run_payment  ON audit_log(run_id, payment_id, id);
