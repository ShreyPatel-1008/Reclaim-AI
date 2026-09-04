// Synthetic-but-realistic batch of at-risk revenue.
// Distribution of decline codes is weighted to mirror real dunning data:
// most failures are soft (recoverable), a meaningful slice need customer
// action, and a minority are hard declines that must be stopped.

import { DECLINE_CODES } from './data/declineCodes.js';

const FIRST = ['Aarav', 'Diya', 'Rohan', 'Isha', 'Kabir', 'Ananya', 'Vivaan', 'Sara', 'Arjun', 'Meera',
  'James', 'Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Lucas', 'Mia', 'Ethan', 'Zoe',
  'Wei', 'Yuki', 'Chen', 'Priya', 'Omar', 'Fatima', 'Diego', 'Sofia', 'Hassan', 'Nina'];
const LAST = ['Sharma', 'Patel', 'Khan', 'Reddy', 'Nair', 'Smith', 'Johnson', 'Lee', 'Garcia', 'Muller',
  'Kim', 'Tanaka', 'Silva', 'Costa', 'Ahmed', 'Rossi', 'Dubois', 'Novak', 'Haddad', 'Ivanov'];

const PLANS = [
  { name: 'Starter', amount: 19 },
  { name: 'Pro', amount: 49 },
  { name: 'Team', amount: 99 },
  { name: 'Business', amount: 199 },
  { name: 'Scale', amount: 399 },
  { name: 'Enterprise', amount: 899 },
];

// Weighted decline distribution (sums ~1.0)
const WEIGHTS = [
  ['insufficient_funds', 0.24],
  ['do_not_honor', 0.16],
  ['processing_error', 0.10],
  ['issuer_unavailable', 0.07],
  ['expired_card', 0.14],
  ['incorrect_cvc', 0.05],
  ['authentication_required', 0.08],
  ['card_not_supported', 0.03],
  ['lost_card', 0.045],
  ['stolen_card', 0.035],
  ['fraudulent', 0.03],
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function weightedDecline() {
  const r = Math.random();
  let acc = 0;
  for (const [code, w] of WEIGHTS) {
    acc += w;
    if (r <= acc) return code;
  }
  return 'do_not_honor';
}

let counter = 1000;

export function generateAccounts(n = 200) {
  const accounts = [];
  for (let i = 0; i < n; i++) {
    const plan = pick(PLANS);
    const declineCode = weightedDecline();
    // vary amount a little around the plan price (annual plans, add-ons, etc.)
    const multiplier = Math.random() < 0.15 ? 12 : 1; // some are annual
    const jitter = 1 + (Math.random() * 0.1 - 0.05);
    const amount = Math.round(plan.amount * multiplier * jitter);
    counter += 1;
    accounts.push({
      id: `chg_${counter}`,
      customerName: `${pick(FIRST)} ${pick(LAST)}`,
      plan: plan.name,
      amount,
      currency: 'USD',
      declineCode,
      declineLabel: DECLINE_CODES[declineCode].label,
      // account state (mutated by the recovery engine)
      status: 'at_risk',        // at_risk | in_progress | recovered | stopped | manual_review
      attempts: 0,
      messagesSent: 0,
      optedOut: Math.random() < 0.03,
      hoursSinceLastMessage: null,
      failedAt: Date.now() - Math.floor(Math.random() * 72) * 3600 * 1000,
      recoveredAmount: 0,
    });
  }
  return accounts;
}

export function summarize(accounts) {
  const atRisk = accounts.reduce((s, a) => s + a.amount, 0);
  const byCategory = {};
  for (const a of accounts) {
    const cat = DECLINE_CODES[a.declineCode]?.category || 'unknown';
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }
  return { count: accounts.length, atRiskRevenue: atRisk, byCategory };
}
