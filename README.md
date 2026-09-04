# AI Revenue Recovery Agent

> **Razorpay Buildathon — Track 03.** Detect failed payments, diagnose the root
> cause, decide a bounded recovery action, execute it, and prove measured money
> recovered across a batch — with compliant escalation, stopping rules, and a
> full audit trail.

A 3-agent pipeline (**Diagnoser → Strategist → Executor**) over a batch of
failed payments, with a Postgres audit trail and a live React dashboard.

## The loop

```
CSV batch ─▶ Diagnoser ─▶ Strategist ─▶ Executor ─▶ Postgres audit trail ─▶ Report
            (root cause)  (bounded      (Razorpay     (every decision +      (recovery %,
             + confidence  action +      test-mode +   reasoning + outcome)   escalation %,
                           stopping      mock)                                accuracy)
                           rules)
```

- **Diagnoser** — coded rows map deterministically (confidence 1.0); the 8 blank
  rows are inferred by an OpenRouter LLM, with a hard `<0.5 → unknown` floor so
  it escalates rather than guesses.
- **Strategist** — a pure, auditable decision table (not an LLM). Enforces the
  stopping rules: max-3-retries (gates retries only), high-value → human
  sign-off, risky/unknown → escalate.
- **Executor** — `send_payment_link` creates a **real Razorpay test-mode payment
  link**; retries and customer-payment outcomes are resolved in-batch by a
  deterministic mock (per-root-cause success rates), tagged `simulated: true`.

## Stack

- **Backend:** Node + Express, Server-Sent Events for live streaming
- **DB:** PostgreSQL (`payments`, `audit_log`, `batch_runs`)
- **AI:** OpenRouter (OpenAI-compatible), free-tier models
- **Payments:** Razorpay test-mode (Payment Links) + deterministic mock fallback
- **Frontend:** React + Vite dashboard
- **Dataset:** `server/data/failed_payments_synthetic.csv` (185 rows, 8 deliberately blank)

## Setup

You already have **PostgreSQL 18 on port 5432**. From `server/`:

```bash
cd server
npm install
cp .env.example .env      # then edit .env (see below)
npm run setup             # creates the DB, applies schema, ingests the CSV
npm start                 # http://localhost:4000
```

Then the client:

```bash
cd client
npm install
npm run dev               # http://localhost:5180
```

### `.env`

| Var | Required | Purpose |
|---|---|---|
| `PGPASSWORD` | **yes** | Password for the `postgres` user |
| `OPENROUTER_API_KEY` | optional | LLM diagnosis of the 8 blank rows (else → `unknown`) |
| `OPENROUTER_MODEL` | optional | e.g. `meta-llama/llama-3.3-70b-instruct:free` |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | optional | Real test-mode payment links (else → mock) |

The app runs and degrades gracefully if the optional keys are missing.

## API (TDD §8)

| Endpoint | Purpose |
|---|---|
| `POST /api/batches` | Ingest a CSV (defaults to the bundled dataset) → `run_id` |
| `GET /api/batches/:runId/run` | Run the pipeline, streaming decisions over SSE |
| `GET /api/batches/:runId/report` | Batch metrics |
| `GET /api/batches/:runId/payments` | All payments + current status |
| `GET /api/payments/:paymentId/audit` | Full audit trail for one payment |
| `POST /api/batches/:runId/eval` | Held-out diagnosis-accuracy evaluation |

## Metrics (TDD §9)

- **recovery_rate** = `amount_recovered / amount_attempted`, where the
  denominator is the **whole batch** (including escalated / no-action) — an
  honest number, not cherry-picked.
- **escalation_rate** = escalated / total (non-zero by design — proves the
  guardrail isn't theater).
- **diagnosis_accuracy** — measured by *hiding* the `failure_code` on a held-out
  set of coded rows and scoring the LLM's recovery of the true label (the
  deterministic mapping would trivially score 100%).

## Doc-review corrections applied

Built against the PRD / TDD / Requirements docs, with 9 corrections:
canonical 8-label root-cause set (#1); held-out accuracy measurement (#2);
in-batch resolution of links/retries (#3); retry cap gates retries only (#4);
`no_action` threshold rule (#5); backoff wording (#6); high-value sign-off
guardrail (#7); confidence-floor wording (#8); blank codes valid at ingestion (#9).

## Guardrails ("the bar")

| Requirement | Where |
|---|---|
| Stopping rules | `config/policy.js` + `agents/strategist.js` |
| Compliant escalation | risky / unknown / retry-cap / high-value → `escalate_to_human` |
| Explainability | every agent writes a mandatory `reasoning` to `audit_log` |
| Bounded action | Executor only performs actions from a fixed allow-list |
