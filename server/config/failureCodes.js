// Canonical root-cause catalog — the corrected 8-label set.
//
// Correction #1 (doc review): PRD §6 omitted `invalid_cvv` and
// `issuer_unavailable`, which both appear in the dataset and in the TDD §6.2
// decision table. This is the single source of truth used by every agent.
//
// category:
//   transient -> temporary; a retry can succeed (bank/network/issuer)
//   action    -> customer must act (fund account, new card, re-enter CVV)
//   risk      -> risky/fraud-adjacent; never auto-retry, always human
//   ambiguous -> unknown; escalate rather than guess
//
// mockSuccessRate: probability the *correct* action recovers the charge, used
//   by the mock executor so the recovered-amount figure is plausible, not
//   arbitrary (TDD §7).

export const ROOT_CAUSES = {
  insufficient_funds: {
    label: 'Insufficient funds',
    category: 'action',
    explanation: 'Customer account lacked funds. A payment link lets them retry when funded.',
    mockSuccessRate: 0.55,
  },
  bank_timeout: {
    label: 'Bank timeout',
    category: 'transient',
    explanation: 'Bank did not respond in time. A spaced retry usually clears it.',
    mockSuccessRate: 0.65,
  },
  network_error: {
    label: 'Network error',
    category: 'transient',
    explanation: 'Transient network/processor fault. Not the customer. Retry succeeds often.',
    mockSuccessRate: 0.70,
  },
  issuer_unavailable: {
    label: 'Issuer unavailable',
    category: 'transient',
    explanation: 'Card issuer temporarily unreachable. An immediate retry frequently works.',
    mockSuccessRate: 0.68,
  },
  card_expired: {
    label: 'Card expired',
    category: 'action',
    explanation: 'Card on file expired. Customer must supply new card details via a payment link.',
    mockSuccessRate: 0.50,
  },
  invalid_cvv: {
    label: 'Invalid CVV',
    category: 'action',
    explanation: 'CVV mismatch. Customer must re-enter correct card details via a payment link.',
    mockSuccessRate: 0.48,
  },
  risky_declined: {
    label: 'Risky / declined',
    category: 'risk',
    explanation: 'Flagged as risky. Never auto-retry — route to human review (compliance).',
    mockSuccessRate: 0.0,
  },
  unknown: {
    label: 'Unknown',
    category: 'ambiguous',
    explanation: 'Cause could not be determined with confidence. Escalate rather than guess.',
    mockSuccessRate: 0.0,
  },
};

// Failure codes that appear verbatim in the dataset and map 1:1 to a root
// cause (deterministic diagnosis, confidence 1.0).
export const DETERMINISTIC_CODES = new Set([
  'insufficient_funds', 'bank_timeout', 'network_error', 'issuer_unavailable',
  'card_expired', 'invalid_cvv', 'risky_declined', 'unknown',
]);

export function getRootCause(code) {
  return ROOT_CAUSES[code] || ROOT_CAUSES.unknown;
}

export const ROOT_CAUSE_KEYS = Object.keys(ROOT_CAUSES);
