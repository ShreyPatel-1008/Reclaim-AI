# Reclaim — AI Revenue Recovery

> Track 03: *Find revenue that's slipping away and win it back.*

Reclaim is an AI agent that detects revenue at risk from **failed payments**,
diagnoses the **root cause**, chooses the right **bounded intervention**, and
executes a compliant recovery workflow across a whole batch — then proves how
much money it won back, with **stopping rules** and a **full audit trail**.

It runs the complete loop the track asks for:

**Detect → Diagnose → Decide → Execute → Recover**

---

## Why failed-payment recovery

Every part of "the bar" falls out of this one scenario naturally:

| The bar | How Reclaim delivers it |
|---|---|
| **Measured money recovered across a batch** | Runs 200 failed charges and shows `$` recovered climbing live. |
| **Root cause → recovery action** | Decline codes map to *different* fixes (expired card ≠ insufficient funds ≠ fraud). |
| **Compliant escalation** | Ordered ladder: smart retry → card-update → dunning → SMS → final notice. |
| **Stopping rules** | Max attempts, never-retry hard declines, opt-out compliance, anti-harassment caps, quiet hours. |
| **Audit trail** | Every single decision is logged with its reasoning, outcome, and (when enabled) AI confidence. |

## Architecture

```
Failed charge ─▶ Decision Engine (deterministic, compliant)
                    │  diagnose root cause  → decline-code catalog
                    │  check stopping rules → guardrails / policy
                    │  propose safe action set
                    ▼
                 AI Advisor (OpenRouter, optional)
                    │  picks among ENGINE-APPROVED actions only
                    │  writes human rationale + confidence
                    ▼
                 Recovery Orchestrator
                    │  executes bounded workflow, simulates outcome
                    │  writes audit entry, updates recovered $
                    ▼
                 Live dashboard (SSE stream)
```

**Safety by design:** the deterministic engine decides the *allowed* set of
actions; the AI only chooses among them and explains the choice. The AI can
never invent an action the guardrails forbid, and if the API key is absent or
the call fails, Reclaim runs fully on the rules engine. The live demo never
depends on the network.

### Decline-code intelligence (`server/data/declineCodes.js`)
- **soft** (insufficient funds, do-not-honor, processing error…) → smart retry with backoff
- **action** (expired card, incorrect CVC, 3DS required…) → customer must act; secure card-update
- **hard** (lost / stolen / fraud) → **never retry**; route to manual review

## Run it

Two terminals.

**1. Backend** (port 4000):
```bash
cd server
npm install
npm start
```

**2. Frontend** (port 5180):
```bash
cd client
npm install
npm run dev
```

Open the dashboard, click **Run Recovery Batch**, and watch the agent triage
200 failed charges in real time.

### Enable the AI layer (OpenRouter)

Reclaim runs great in deterministic **rules-only** mode out of the box. To turn
on AI reasoning, add a key:

```bash
cd server
cp .env.example .env
# then edit .env:
#   OPENROUTER_API_KEY=sk-or-...
#   OPENROUTER_MODEL=anthropic/claude-3.5-sonnet   (any OpenRouter model id)
```

Restart the backend. The header badge flips to **AI: <model>**, and audit
entries gain per-decision AI rationale + confidence.

## The bounded-workflow policy (`server/engine/decisionEngine.js`)

| Rule | Default |
|---|---|
| Max attempts per charge | 4 |
| Hard-decline auto-retries | 0 (never) |
| Max customer messages | 3 (anti-harassment) |
| Contact cooldown | 24h |
| Quiet hours | 21:00–08:00 |
| Min charge to pursue | $2 |

## Tech

- **Backend:** Node + Express, Server-Sent Events for live streaming, zero
  native dependencies (in-memory store — nothing to install or provision).
- **Frontend:** React + Vite, custom dark dashboard, no chart library.
- **AI:** OpenRouter (OpenAI-compatible), model-agnostic.

## Extending to other lanes

The decide/execute/audit core is scenario-agnostic. A **B2B overdue
receivables** lane (promise-to-pay + escalation ladder) plugs into the same
engine by adding an intent type and its ladder — the guardrails, audit trail,
and dashboard are reused as-is.
