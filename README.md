# 🔄 Reclaim AI — AI-Powered Revenue Recovery for Failed Payments

> **Automatically diagnose, strategize, and recover failed payments using a multi-agent AI pipeline with Razorpay integration.**

Reclaim AI is an intelligent revenue recovery system that processes batches of failed payments through a 4-agent pipeline — diagnosing why each payment failed, deciding the optimal recovery strategy, executing the action (with real Razorpay test-mode support), and generating personalized Hinglish recovery messages for customers.

---

## ✨ Key Features

- **🤖 4-Agent AI Pipeline** — Diagnoser → Strategist → Executor → Messenger, each with a clear responsibility
- **🧠 Hybrid AI + Rules** — LLM-powered diagnosis for ambiguous failures, deterministic rules for known codes
- **💳 Razorpay Integration** — Real test-mode payment link generation via Razorpay API
- **🗣️ Hinglish Recovery Messages** — AI-generated personalized customer messages in Hindi-English mix
- **📊 Real-Time Dashboard** — Live SSE-powered batch processing with detailed analytics
- **🔍 Full Audit Trail** — Every agent decision is logged with reasoning, confidence scores, and input snapshots
- **🛡️ Bounded & Safe** — Policy guardrails prevent over-retrying, enforce human escalation for high-value/risky payments

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    React Dashboard (Vite)                │
│                   http://localhost:5173                   │
└──────────────────────────┬──────────────────────────────┘
                           │  /api  (proxy)
┌──────────────────────────▼──────────────────────────────┐
│                  Express API Server                      │
│                  http://localhost:4000                    │
│                                                          │
│  ┌────────────┐  ┌────────────┐  ┌──────────┐  ┌──────┐│
│  │ Diagnoser  │→ │ Strategist │→ │ Executor │→ │Msgr  ││
│  │ (AI+Rules) │  │  (Rules)   │  │(Razorpay)│  │(AI)  ││
│  └────────────┘  └────────────┘  └──────────┘  └──────┘│
└──────────────────────────┬──────────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │   PostgreSQL Database    │
              │    revenue_recovery      │
              └─────────────────────────┘
```

### Agent Breakdown

| Agent | Role | Method |
|-------|------|--------|
| **Diagnoser** | Classifies failure root cause | Deterministic for known codes; LLM (OpenRouter) for ambiguous/blank codes |
| **Strategist** | Picks optimal recovery action | Pure rule-based decision table with policy guardrails |
| **Executor** | Executes the recovery action | Real Razorpay payment links (test-mode) + simulated outcomes |
| **Messenger** | Writes customer recovery message | LLM-generated Hinglish messages with template fallback |

### Recovery Actions

| Action | When Used |
|--------|-----------|
| `retry_immediate` | Transient errors (issuer unavailable) |
| `retry_delayed_2hr` | Transient with backoff (bank timeout, network error) |
| `send_payment_link` | Customer must act (expired card, insufficient funds, invalid CVV) |
| `escalate_to_human` | Risky/declined, unknown cause, high-value, or max retries exceeded |
| `no_action` | Amount below ₹50 pursuit threshold |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v18+
- **PostgreSQL** 14+ running on `localhost:5432`

### 1. Clone the Repository

```bash
git clone https://github.com/ShreyPatel-1008/Reclaim-AI.git
cd Reclaim-AI
```

### 2. Install Dependencies

```bash
# Backend
cd server
npm install

# Frontend
cd ../client
npm install
```

### 3. Configure Environment

```bash
cd server
cp .env.example .env
```

Edit `server/.env` and fill in your credentials:

```env
# Required — PostgreSQL
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=your_password
PGDATABASE=revenue_recovery

# Optional — AI diagnosis for blank failure codes
OPENROUTER_API_KEY=your_openrouter_key
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free

# Optional — Real Razorpay test-mode payment links
RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=xxxxx

PORT=4000
```

> **Note:** The app works without OpenRouter and Razorpay keys — it falls back to rules-only diagnosis and mock payment links.

### 4. Set Up the Database

```bash
cd server
npm run setup    # Creates DB, applies schema, seeds 185 sample payments
```

### 5. Run the App

```bash
# Terminal 1 — Backend
cd server
npm run dev

# Terminal 2 — Frontend
cd client
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## 📖 Usage

1. **Ingest a Batch** — Click "Run Pipeline" to process the bundled dataset of 185 failed payments
2. **Watch Real-Time Processing** — See each payment flow through Diagnoser → Strategist → Executor via live SSE
3. **View Results** — Explore the dashboard with recovery stats, action breakdowns, and per-payment details
4. **Inspect Audit Trail** — Click any payment to see the full decision chain with reasoning and confidence scores
5. **View Recovery Messages** — For `send_payment_link` actions, view the AI-generated Hinglish customer message

---

## 🛡️ Policy Guardrails

The system enforces bounded, auditable rules to prevent runaway automation:

| Rule | Value | Effect |
|------|-------|--------|
| Max Retries | 3 | Stops retrying after 3 attempts → escalates to human |
| High-Value Threshold | ₹15,000 | Payments above this always require human sign-off |
| Min Pursue Amount | ₹50 | Payments below this aren't worth recovering |
| Risky/Declined | Always | Never auto-retried — routed to human review |
| Unknown Cause | Always | Escalated rather than guessed |

---

## 🗂️ Project Structure

```
Reclaim-AI/
├── client/                     # React frontend (Vite)
│   ├── src/
│   │   ├── App.jsx             # Main dashboard application
│   │   ├── api.js              # API client functions
│   │   ├── components/         # React components
│   │   └── styles.css          # Application styles
│   └── vite.config.js          # Vite config with API proxy
│
├── server/                     # Express backend
│   ├── agents/                 # AI agent implementations
│   │   ├── diagnoser.js        # Root cause classification
│   │   ├── strategist.js       # Recovery action decision
│   │   ├── executor.js         # Action execution (Razorpay)
│   │   └── messenger.js        # Hinglish message generation
│   ├── config/
│   │   ├── policy.js           # Guardrail constants
│   │   └── failureCodes.js     # Root cause catalog
│   ├── db/
│   │   ├── pool.js             # PostgreSQL connection pool
│   │   ├── migrate.js          # DB migration script
│   │   └── schema.sql          # Database schema
│   ├── pipeline/
│   │   └── runBatch.js         # Batch processing orchestrator
│   ├── ingestion/              # CSV data ingestion
│   ├── llm/                    # OpenRouter LLM client
│   ├── razorpay/               # Razorpay API client
│   ├── report/                 # Analytics & reporting
│   ├── routes/
│   │   └── api.js              # REST API endpoints
│   ├── data/                   # Bundled synthetic dataset
│   └── .env.example            # Environment template
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check (DB, AI, Razorpay status) |
| `GET` | `/api/policy` | Current policy guardrails |
| `POST` | `/api/batches` | Ingest a new payment batch |
| `GET` | `/api/batches/latest` | Most recent batch run |
| `GET` | `/api/batches/:runId/payments` | All payments in a batch |
| `GET` | `/api/batches/:runId/run` | Run pipeline (SSE stream) |
| `GET` | `/api/batches/:runId/report` | Recovery analytics report |
| `GET` | `/api/payments/:id/audit` | Full audit trail for a payment |
| `GET` | `/api/payments/:id/message` | Hinglish recovery message |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite 5 |
| Backend | Node.js, Express 4 |
| Database | PostgreSQL |
| AI/LLM | OpenRouter (Nvidia Nemotron / Llama 3.3) |
| Payments | Razorpay (test-mode) |
| Real-time | Server-Sent Events (SSE) |

---

## 📄 License

This project was built for a hackathon. Feel free to use and extend it.
