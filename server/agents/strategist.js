// Agent 2 — Strategist (PRD §6.2, TDD §6.2, with review corrections #4/#5/#7).
// Pure, deterministic decision table — NOT an LLM call — so the guardrails are
// auditable and cannot drift. Returns an action from the fixed allow-list plus
// a plain-language reason for the audit log.
import { POLICY, RETRY_ACTIONS } from '../config/policy.js';

// Base action per root cause (before stopping rules are applied).
const BASE_ACTION = {
  insufficient_funds: 'send_payment_link',
  card_expired: 'send_payment_link',
  invalid_cvv: 'send_payment_link',
  issuer_unavailable: 'retry_immediate',
  bank_timeout: 'retry_delayed_2hr',
  network_error: 'retry_delayed_2hr',
  risky_declined: 'escalate_to_human',
  unknown: 'escalate_to_human',
};

export function decide({ root_cause, amount, retry_count }) {
  const sym = POLICY.currencySymbol;

  // 1. Below pursuit threshold -> not economical (correction #5)
  if (amount < POLICY.minPursueAmount) {
    return action('no_action',
      `Amount ${sym}${amount} is below the ${sym}${POLICY.minPursueAmount} pursuit threshold — not economical to recover.`,
      'BELOW_THRESHOLD');
  }

  // 2. High-value -> human sign-off, regardless of cause (correction #7)
  if (amount > POLICY.highValueThreshold) {
    return action('escalate_to_human',
      `High-value charge ${sym}${amount} exceeds ${sym}${POLICY.highValueThreshold}; requires human sign-off before any recovery attempt.`,
      'HIGH_VALUE');
  }

  // 3 & 4. Risky / ambiguous -> escalate, never auto-retry
  if (root_cause === 'risky_declined') {
    return action('escalate_to_human', 'Risky/declined: never auto-retried — routed to human review (compliance).', 'RISKY');
  }
  if (root_cause === 'unknown') {
    return action('escalate_to_human', 'Root cause unknown: escalating rather than guessing an action.', 'UNKNOWN_CAUSE');
  }

  const base = BASE_ACTION[root_cause] || 'escalate_to_human';

  // 5. Stopping rule applies ONLY to retry actions (correction #4).
  if (RETRY_ACTIONS.has(base) && retry_count >= POLICY.maxRetries) {
    return action('escalate_to_human',
      `Retry cap reached (retry_count=${retry_count} ≥ ${POLICY.maxRetries}); escalating instead of retrying again.`,
      'MAX_RETRIES');
  }

  // 6. Otherwise take the base action.
  const why = {
    send_payment_link: `${root_cause}: customer must act — sending a secure payment link (not a retry, so the retry cap does not apply).`,
    retry_immediate: `${root_cause} is transient — an immediate retry is appropriate (attempt ${retry_count + 1}/${POLICY.maxRetries}).`,
    retry_delayed_2hr: `${root_cause} is transient — scheduling a spaced retry in ${POLICY.retryDelayHours}h (attempt ${retry_count + 1}/${POLICY.maxRetries}).`,
  }[base] || `Selected ${base}.`;
  return action(base, why, null);
}

function action(action, reasoning, stoppingRule) {
  return { action, reasoning, stoppingRule };
}
