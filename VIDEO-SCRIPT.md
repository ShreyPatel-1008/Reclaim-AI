# Jury Video Script — AI Revenue Recovery Agent
**Target length: ~3 minutes.** Read the **SAY** lines aloud; do the **[SCREEN]**
actions as you speak. Confident and calm — you built something real.

> Before recording, see the **Production checklist** at the bottom.

---

## 0:00 – 0:12 · Hook
**[SCREEN: the dashboard, freshly loaded, before running.]**

**SAY:**
> "Every day, businesses lose real money to failed payments — a card expires, a
> bank times out, there isn't enough balance. Most of that money is never
> recovered. I built an AI agent that recovers it — automatically, safely, and
> honestly."

---

## 0:12 – 0:35 · The problem, made real
**[SCREEN: point at the 'At risk' number and the triage table.]**

**SAY:**
> "Here are 185 real failed payments — about 3.8 lakh rupees at risk. A business
> has two bad choices: chase each one by hand, which doesn't scale, or write the
> money off. My agent gives them a third option."

---

## 0:35 – 0:55 · The solution — a team of three
**[SCREEN: point at the three step cards: Diagnoser, Strategist, Executor.]**

**SAY:**
> "Think of it as a small team of three. The Diagnoser figures out *why* each
> payment failed. The Strategist decides the *right* action, following strict
> safety rules. And the Executor *does* it — and writes down every decision. Let
> me show you."

---

## 0:55 – 1:35 · Run it live (the exciting part)
**[SCREEN: click ▶ Run Recovery Batch. Let the numbers move — don't talk over the peak.]**

**SAY (as it runs):**
> "Watch it work through all 185 payments in real time. For each one it
> diagnoses the cause, picks a bounded action, and records the result. See the
> recovered amount climbing."

**[SCREEN: wait for 100%. Point at the top badges.]**

**SAY:**
> "And everything here is real — a real Postgres database, a real AI model, and
> real Razorpay test-mode payment links. Nothing is faked."

---

## 1:35 – 2:00 · The honest result
**[SCREEN: point at Recovered, Recovery rate, Escalated.]**

**SAY:**
> "Out of 3.8 lakh at risk, it recovered around 1.2 lakh — roughly a third of the
> *whole* batch. Not a cherry-picked example — the honest number, counting
> everything. And notice about a quarter was deliberately sent to a human,
> because a trustworthy system knows what it should *not* touch."

---

## 2:00 – 2:35 · The winning moment — proof, not magic
**[SCREEN: click any payment-link row → the audit drawer opens.]**

**SAY:**
> "This is what makes it trustworthy. For every single payment, I can show the
> full reasoning — what the Diagnoser saw, why the Strategist chose this action,
> and what happened, each in plain language. It's not a black box."

**[SCREEN: point at the Hinglish message card.]**

**SAY:**
> "And here's my favourite part — the AI writes a personalized recovery message
> to the customer, in Hinglish: *'Namaste! Aapka payment nahi ho paya… niche diye
> gaye link se complete karein.'* That's the difference between a dashboard and
> something that actually talks to a real Indian customer."

---

## 2:35 – 2:50 · The safety rails
**[SCREEN: point at the Compliance & stopping rules panel.]**

**SAY:**
> "And these are the guardrails, firing live — it never retries forever, never
> touches a high-value payment without a human, and never auto-retries a risky
> one. That's what 'compliant' really means."

---

## 2:50 – 3:05 · Close (strong)
**[SCREEN: back to the full dashboard, or a clean end card.]**

**SAY:**
> "So — it finds the money, recovers what it safely can, knows when to stop,
> speaks the customer's language, and can prove every decision. Other projects
> try to recover the most money. Mine recovers money you can *trust*. Thank you."

---

# Your strong points (weave these in — and put in your submission text)

1. **Honest numbers.** Recovery rate is measured across the *whole* batch,
   including what it couldn't recover — no inflation. Most teams cherry-pick.
2. **The AI is bounded, not free.** Rules pick the action; the AI advises. It
   can never do something unsafe or unexplainable. This is production-grade
   thinking, not a toy.
3. **It knows when to STOP.** Escalates risky, unknown, and high-value cases to a
   human; caps retries. The hard, mature part of an agent — and exactly the
   track's "compliant escalation + stopping rules."
4. **Full audit trail.** Every decision, with a plain-English reason, in a real
   database. If a business asked "why did you do that?", you can answer for all
   185 payments.
5. **Talks to the customer — in Hinglish.** AI-written, personalized recovery
   messages. Matches the brief's own "Hinglish voice recovery" example, which
   almost no one will do.
6. **Everything is real + it degrades safely.** Real DB, real AI, real Razorpay
   test links — and if the AI is unavailable, it safely falls back instead of
   breaking. That resilience *is* a feature.

---

# 60-second cut (if a short version is required)
1. (0:00–0:10) Problem: "Businesses lose real money to failed payments."
2. (0:10–0:20) Solution: "An AI agent — a team of three — that recovers it
   safely." Point at the 3 steps.
3. (0:20–0:35) Click **Run**. "185 payments, real database, real AI, real
   Razorpay. It recovered about a third — the honest number — and escalated the
   risky ones to a human."
4. (0:35–0:50) Open the audit drawer. "Every decision is explained, and the AI
   even writes the customer a Hinglish recovery message."
5. (0:50–0:60) "It finds the money, knows when to stop, and proves every
   decision. That's the difference."

---

# Production checklist (do these BEFORE recording)
- [ ] **Fresh AI quota:** the OpenRouter free tier is 50 calls/day and resets at
      **5:30 AM IST**. Record after a reset, or add ~$10 credit, so the Hinglish
      card shows **"AI-written"** (not "template"). Or pre-generate + cache the
      messages first.
- [ ] **Do one practice run** so the batch is already completed and the numbers
      look good; you can re-run on camera for the live effect.
- [ ] **Pick a payment-link row in advance** that has a nice Hinglish message, so
      the audit-drawer moment lands.
- [ ] **Light theme** usually looks cleaner on video — toggle with the ☀/☾ button.
- [ ] **Screen-record at 1080p**, speak slowly, and pause for 1–2 seconds on the
      recovered number and the audit drawer — let the visuals breathe.
- [ ] Keep the whole video **under 3 minutes**. Shorter and confident beats long.
- [ ] Optional: add soft background music at low volume; end with your name +
      "Razorpay Buildathon · Track 03".
