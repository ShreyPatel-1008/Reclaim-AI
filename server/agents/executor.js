// Agent 3 — Executor (PRD §6.3, TDD §6.3, §7; correction #3).
// Performs the chosen bounded action (real Razorpay test-mode where possible,
// mock otherwise) and RESOLVES it to a terminal state within the batch so the
// recovery number is measurable. Deterministic mock uses per-root-cause
// success rates so outcomes are plausible, not arbitrary.
import { getRootCause } from '../config/failureCodes.js';
import { createPaymentLink, razorpayEnabled } from '../razorpay/client.js';

// Seeded RNG so a given run is reproducible for demos/tests.
function rng(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function simulateOutcome(payment, seed) {
  const rc = getRootCause(payment.root_cause);
  const r = rng(`${payment.run_id}:${payment.payment_id}:${seed}`)();
  return r < rc.mockSuccessRate ? 'success' : 'failed';
}

export async function execute(payment) {
  const action = payment.action;

  if (action === 'escalate_to_human') {
    return { result: 'escalated', simulated: false, recovered: 0, notes: 'Routed to human review; no automated payment action taken.' };
  }
  if (action === 'no_action') {
    return { result: 'no_action', simulated: false, recovered: 0, notes: 'No recovery attempted (below pursuit threshold).' };
  }

  if (action === 'send_payment_link') {
    const link = await createPaymentLink(payment);
    // Link creation may be real; the customer's payment is always simulated.
    const outcome = simulateOutcome(payment, 'link');
    const via = link.real ? 'real Razorpay test-mode link' : 'mock link';
    return {
      result: outcome, // success = customer paid via link
      simulated: true,
      recovered: outcome === 'success' ? Number(payment.amount) : 0,
      notes: `Payment link created (${via}): ${link.url}. Simulated customer outcome: ${outcome}.`,
      link_url: link.url,
      link_real: link.real,
    };
  }

  if (action === 'retry_immediate' || action === 'retry_delayed_2hr') {
    // No real Razorpay API to re-trigger a failed charge -> always simulated.
    const outcome = simulateOutcome(payment, action);
    const timing = action === 'retry_delayed_2hr' ? 'after a 2h backoff (simulated in-batch)' : 'immediately';
    return {
      result: outcome,
      simulated: true,
      recovered: outcome === 'success' ? Number(payment.amount) : 0,
      notes: `Retried ${timing}. Simulated outcome: ${outcome}.`,
    };
  }

  return { result: 'failed', simulated: true, recovered: 0, notes: `Unknown action "${action}".` };
}

export { razorpayEnabled };
