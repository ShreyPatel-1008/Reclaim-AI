// Bounded-workflow policy — the enforcement constants for "the bar".
// Referenced by the Strategist. Kept in one place so the guardrails are
// auditable and can't drift (TDD §6.2).

export const POLICY = {
  maxRetries: 3,               // stopping rule: cap on RETRY actions per payment
  retryDelayHours: 2,          // fixed spaced-retry delay (see correction #6)
  highValueThreshold: 15000,   // ₹: above this, require human sign-off (correction #7)
  minPursueAmount: 50,         // ₹: below this, no_action (correction #5)
  currency: 'INR',
  currencySymbol: '₹',
};

// The only actions the Executor is allowed to perform (NFR-2: bounded, not
// freeform). Anything outside this list is rejected.
export const ALLOWED_ACTIONS = [
  'retry_immediate',
  'retry_delayed_2hr',
  'send_payment_link',
  'escalate_to_human',
  'no_action',
];

// Actions that count as a "retry" for the max-retry stopping rule.
// (Correction #4: the cap gates only retries, not links/escalations.)
export const RETRY_ACTIONS = new Set(['retry_immediate', 'retry_delayed_2hr']);
