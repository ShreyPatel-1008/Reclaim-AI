// Catalog of payment failure signals -> root cause metadata.
// Modeled on real Stripe / card-network decline codes so the agent's
// diagnosis and intervention choices map to how recovery actually works.
//
// category:
//   soft      -> temporary, retrying can succeed (funds, rate limits, transient)
//   hard      -> permanent, retrying is pointless/harmful (lost/stolen/fraud)
//   action    -> needs the customer to do something (update card, authenticate)
//
// baseRecoveryRate: probability a *correct* intervention eventually recovers
//   the charge. Used by the outcome simulator so demo numbers are realistic.

export const DECLINE_CODES = {
  insufficient_funds: {
    label: 'Insufficient funds',
    category: 'soft',
    rootCause: 'Customer account lacked funds at charge time. Balances refresh on paydays.',
    baseRecoveryRate: 0.62,
    retryable: true,
  },
  do_not_honor: {
    label: 'Do not honor',
    category: 'soft',
    rootCause: 'Generic issuer decline, often transient risk-scoring. Frequently clears on retry with backoff.',
    baseRecoveryRate: 0.45,
    retryable: true,
  },
  processing_error: {
    label: 'Processing / network error',
    category: 'soft',
    rootCause: 'Transient processor or network fault. Not the customer. Almost always clears on immediate retry.',
    baseRecoveryRate: 0.80,
    retryable: true,
  },
  issuer_unavailable: {
    label: 'Issuer unavailable',
    category: 'soft',
    rootCause: 'Card issuer temporarily unreachable. Retrying after a short delay usually works.',
    baseRecoveryRate: 0.72,
    retryable: true,
  },
  expired_card: {
    label: 'Expired card',
    category: 'action',
    rootCause: 'Card on file has expired. Requires the customer to update card details.',
    baseRecoveryRate: 0.55,
    retryable: false,
  },
  incorrect_cvc: {
    label: 'Incorrect CVC',
    category: 'action',
    rootCause: 'CVC mismatch. Needs the customer to re-enter correct card details.',
    baseRecoveryRate: 0.40,
    retryable: false,
  },
  authentication_required: {
    label: 'Authentication required (3DS)',
    category: 'action',
    rootCause: 'Issuer requires Strong Customer Authentication. Needs a customer-completed 3DS challenge.',
    baseRecoveryRate: 0.58,
    retryable: false,
  },
  lost_card: {
    label: 'Lost card',
    category: 'hard',
    rootCause: 'Card reported lost. Retrying is futile and may flag the merchant. Must obtain a new payment method.',
    baseRecoveryRate: 0.18,
    retryable: false,
  },
  stolen_card: {
    label: 'Stolen card',
    category: 'hard',
    rootCause: 'Card reported stolen. Never retry — network abuse risk. Manual outreach only.',
    baseRecoveryRate: 0.12,
    retryable: false,
  },
  fraudulent: {
    label: 'Suspected fraud',
    category: 'hard',
    rootCause: 'Issuer flagged as fraudulent. Do not retry. Route to manual review / stop.',
    baseRecoveryRate: 0.05,
    retryable: false,
  },
  card_not_supported: {
    label: 'Card type not supported',
    category: 'action',
    rootCause: 'Card network/type not accepted. Needs an alternate payment method.',
    baseRecoveryRate: 0.30,
    retryable: false,
  },
};

export function getDecline(code) {
  return DECLINE_CODES[code] || {
    label: code,
    category: 'soft',
    rootCause: 'Unclassified decline.',
    baseRecoveryRate: 0.3,
    retryable: true,
  };
}
