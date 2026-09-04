# Demo Script — AI Revenue Recovery Agent

**Target length: 2.5–3 minutes.** Everything below is live in the running app.

## Before you start (30s of setup, off-camera)

1. Backend: `cd server && npm start` → confirm it prints `Postgres: connected`,
   `Diagnoser: OpenRouter`, `Executor: Razorpay test-mode`.
2. Client: `cd client && npm run dev` → open **http://localhost:5180**.
3. Set speed to **Fast**. Have one browser tab spare (to open a Razorpay link).
4. If you want a clean slate, click **New batch** once.

---

## The script

### 1. Frame the problem (20s)
> "Merchants lose revenue when payments fail — insufficient funds, expired cards,
> bank timeouts, risky declines. Recovering it is manual or ignored. My agent
> closes the loop: detect → diagnose → decide → execute → recover — and proves
> the money recovered across a whole batch, not one cherry-picked case."

Point at the three badges (top-right): **DB: Postgres · AI: nemotron · Pay:
Razorpay test.** "These are real — Postgres, a live LLM, and Razorpay test-mode."

### 2. Show the batch (15s)
Point at the triage table. "185 failed payments. **8 of them have no failure
code on purpose** — the ambiguous cases that break naive systems. ₹3.84 lakh at
risk."

### 3. Run it (30s)
Click **▶ Run Recovery Batch.** Narrate while it streams:
> "Three agents per payment. The **Diagnoser** finds the root cause — deterministic
> where there's a code, the LLM for the blanks. The **Strategist** picks one
> bounded action and enforces the stopping rules. The **Executor** acts and
> records the outcome."

Watch **Amount recovered** climb. Let it finish (100%).

### 4. The honest headline number (20s)
Point at the KPIs:
> "₹1.3 lakh recovered — **35% of the whole batch**, and that denominator includes
> everything I escalated or couldn't recover. That's the honest number. **23%
> escalation** — non-zero, which proves the guardrails actually fire. And **100%
> diagnosis accuracy** on the coded rows."

### 5. Prove it's not a black box (35s) — the money moment
Click any **escalated** row in the triage table → the **audit drawer** opens.
> "Every decision is logged. Here's the full trail for this payment: what the
> Diagnoser saw and concluded, why the Strategist chose to escalate, what the
> Executor did — each with plain-language reasoning, straight from Postgres."

Then scroll to the **Compliance & stopping rules** panel:
> "And here are the guardrails firing in real time — `MAX_RETRIES`,
> `HIGH_VALUE` sign-off, `RISKY` never auto-retried, `UNKNOWN_CAUSE` escalated."

### 6. The blank-row / anti-hallucination bit (20s)
Open the audit drawer for a **blank-code row** (e.g. `pay_0011`).
> "No failure code. The LLM either makes a confident call when there's signal, or
> **abstains to `unknown` and escalates** rather than guessing. It doesn't
> hallucinate a reason — that's the compliant behavior."

(Optional) Click **◈ Diagnosis eval** → "A held-out probe confirms it: ~93% of the
time it's either right or safely abstains, never a confident wrong label."

### 7. Real Razorpay (15s)
Open a `send_payment_link` row's audit → copy the `rzp.io/...` link into a new
tab. "These are **real Razorpay test-mode payment links** — created via the API,
not mocked."

### 8. Close (15s)
> "So: measured recovery across a full batch, compliant escalation with reasons,
> stopping rules that actually stop it, and a complete audit trail. That's the
> whole loop — and every claim on screen is backed by a row in the database."

---

## If something goes wrong (fallbacks)
- **LLM slow / rate-limited:** the run still completes — blanks just fall to
  `unknown → escalate`. Say "the free-tier model is rate-limited; the system
  degrades safely to escalation, which is the point."
- **Razorpay hiccups:** links fall back to mock automatically; the audit log
  shows `mock link`. Still a valid, labeled outcome.
- **Want a repeatable run:** click **New batch** then **Run** — it's idempotent.

## Numbers vary run-to-run
Recovery amount shifts a bit each run (the mock outcome is seeded per payment and
the batch id changes). Recovery rate typically lands **31–35%**, escalation
**~23%**. Diagnosis accuracy is always **100%** on coded rows.
