# How to explain the app — simple words + live demo

Keep it simple. Tell the story first, then show it working. You don't need
technical words. Here's everything you can just say out loud.

---

## PART A — Start with the problem and solution (say this first, ~40 seconds)

**The problem (in plain words):**
> "When a customer tries to pay a business and the payment fails — maybe their
> card expired, or the bank timed out, or there wasn't enough money — that's
> lost revenue. Most businesses either chase each failed payment by hand, which
> takes forever, or they just let the money go. Either way, they lose."

**The solution (what I built):**
> "I built an AI agent that does this automatically. You give it a big list of
> failed payments. For each one it figures out *why* it failed, decides the
> *right* way to recover it, actually does it, and at the end it tells you
> exactly how much money it got back — and it keeps a record of every single
> decision, so you can trust it."

**The one-line version if you only get 10 seconds:**
> "It finds failed payments, recovers the money automatically, and proves how
> much it recovered — safely."

---

## PART B — The live demo (the main part — click while you talk)

> Tip: have the app open at **http://localhost:5180** before you start.

### 1. Point at the top of the screen (10 sec)
> "Everything here is real and connected — see these tags at the top: a real
> database, a real AI model, and Razorpay in test mode."

Point at the three badges: **DB · AI · Pay**.

### 2. Read the big headline (10 sec)
> "The whole point is this one number — the revenue recovered. Right now the
> batch has ₹3.8 lakh of failed payments sitting at risk."

Point at the hero and the **Revenue recovered** number.

### 3. Explain the 3 steps once (15 sec)
> "It works like a small team of three. **Step 1, the Diagnoser** figures out why
> each payment failed. **Step 2, the Strategist** decides what to do about it.
> **Step 3, the Executor** actually does it. And everything gets written down."

Point at the three step cards.

### 4. Press the button (the exciting part, 30 sec)
Click **▶ Run Recovery Batch.** While it runs:
> "Now watch — it's going through all 185 failed payments, one by one. See the
> recovered amount climbing. Each row on the left is getting a diagnosis and an
> action in real time."

Let it reach 100%.

### 5. Read the results honestly (20 sec)
> "So out of ₹3.8 lakh at risk, it recovered around ₹1.2 lakh — that's about a
> third of the *whole* batch, not a cherry-picked example. And around a quarter
> got sent to a human on purpose, because a safe system shouldn't try to recover
> everything blindly."

Point at **Recovered**, **Recovery rate**, and **Escalated**.

### 6. Prove it's not a black box (30 sec — this is the winning moment)
Click any row in the table (or in the decision log on the right).
> "Here's the part judges care about — it's not magic, it's accountable. This is
> the full trail for one payment: what the Diagnoser saw, why the Strategist
> chose this action, and what happened — each with a plain-English reason. Every
> single payment has this."

### 7. Show the safety rules firing (20 sec)
Point at the **Compliance & stopping rules** panel (bottom right).
> "And these are the safety rules working live — it won't retry forever, it won't
> touch a high-value payment without a human, and it never auto-retries a risky
> one. That's what stops it from doing something dumb or unfair to customers."

### 8. Close strong (10 sec)
> "So — it finds the money, recovers it, knows when to stop, and can prove every
> decision. That's the whole loop."

---

## PART C — What each part of the screen means (reference, if someone asks)

| Section | Say this in simple words |
|---|---|
| **Top badges (DB · AI · Pay)** | "Proof it's really connected — a real database, a real AI, and real Razorpay test mode. Not fake." |
| **Big headline + number** | "The main result — how much money we won back." |
| **The 3 step cards** | "The three-part team: diagnose → decide → do." |
| **Run Recovery Batch** | "Starts the agent on the whole list of failed payments." |
| **New batch** | "Loads a fresh copy of the data to run again." |
| **Diagnosis eval** | "A test that checks the AI isn't guessing — it proves it abstains when it's not sure." |
| **The outcome (Recovered, Recovery rate)** | "How much we got back, and what share of the total that is." |
| **The safeguards (At risk, Escalated, Diagnosis accuracy, Actions)** | "The honest numbers — total at risk, how much we handed to a human, how accurate the diagnosis was, and how many actions we took." |
| **Triage table** | "Every failed payment, its diagnosis, and what we did about it. Click one to see the full story." |
| **Agent decision log** | "A live feed of each decision as it happens." |
| **Bar chart (by root cause)** | "Where the money is — which failure reasons hold the most money, and how much of each we recovered (the green part)." |
| **Compliance & stopping rules** | "The safety limits, and them firing in real time." |
| **Audit trail (pop-up on click)** | "The full 3-step reasoning for one payment — proof it's not a black box." |

---

## PART D — Simple answers to likely questions

**"Is the money real?"**
> "The data is realistic test data — no real customers. The payment links are
> real Razorpay *test-mode* links. The recovery outcomes are simulated with
> realistic success rates, and I clearly mark which ones are simulated so nothing
> is faked."

**"Why did it only recover about a third?"**
> "Because that's honest. A lot of failed payments *can't* be safely recovered —
> risky ones, or ones a human should handle. A system that claimed 100% would be
> lying. I count the whole batch in the total, on purpose."

**"What are the 8 blank ones?"**
> "Those are payments with no failure reason given — the hard cases. The AI tries
> to figure them out, but if it can't be sure, it says 'unknown' and escalates
> instead of guessing. That's the safe, honest behaviour."

**"What makes this an 'agent' and not just a script?"**
> "It reasons per payment — an AI diagnoses the unclear cases — and it chooses
> between actions based on rules, then acts and records everything. It's a
> decision loop, not a fixed if-else."

**"Could this work for a real business?"**
> "Yes — the same three steps work on live failed payments. You'd swap the test
> data for real Razorpay data and connect the real recovery actions. The safety
> rules and audit trail are exactly what a finance team needs to trust it."

---

## Quick tips for the demo
- **Speak the story, not the tech.** "A small team of three" beats "a 3-agent
  pipeline."
- **Let the number climb on screen** — don't talk over the best moment.
- **The audit pop-up is your strongest card** — always open it.
- If the internet is slow, the AI part may be rate-limited; just say *"it safely
  falls back to escalation, which is the whole point,"* and carry on.
- You can switch between light and dark with the ☀/☾ button — light usually
  looks cleaner on a projector.
