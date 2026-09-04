// Deterministic decision engine: the compliant, auditable core.
// Given an at-risk account it (1) diagnoses root cause, (2) checks guardrails
// / stopping rules, and (3) selects the next bounded intervention.
//
// This runs with zero network dependency so the recovery loop is always
// explainable and safe. The AI layer (aiAdvisor) sits ON TOP of this to add
// natural-language reasoning and to *choose among* engine-approved actions —
// it can never invent an action the guardrails forbid.

import { getDecline } from '../data/declineCodes.js';

// ---- Policy: the bounded workflow the agent is allowed to run -------------
export const POLICY = {
  maxAttempts: 4,              // hard stop: never touch an account more than this
  maxRetriesHardDecline: 0,    // never auto-retry lost/stolen/fraud
  retryBackoffHours: [24, 72, 120], // spacing between smart retries
  quietHoursLocal: [21, 8],    // 9pm–8am: no SMS/voice contact
  contactCooldownHours: 24,    // min gap between customer messages
  maxCustomerMessages: 3,      // anti-harassment cap on outreach
  minChargeToPursue: 2,        // don't spend effort on trivial amounts ($)
};

// The escalation ladder — ordered least → most intrusive.
export const LADDER = [
  'smart_retry',
  'card_update_email',
  'dunning_email',
  'sms_reminder',
  'final_notice',
  'manual_review',
];

// Map a diagnosis to the *set* of interventions that are appropriate for it.
function allowedInterventions(decline) {
  switch (decline.category) {
    case 'soft':
      return ['smart_retry', 'dunning_email', 'sms_reminder', 'final_notice'];
    case 'action':
      // retrying the same card is pointless; the customer must act
      return ['card_update_email', 'dunning_email', 'sms_reminder', 'final_notice'];
    case 'hard':
      // never retry; a human decides
      return ['manual_review'];
    default:
      return ['dunning_email', 'manual_review'];
  }
}

// ---- Guardrails: reasons the agent must STOP, with an audit-ready reason ---
export function checkStoppingRules(account) {
  const decline = getDecline(account.declineCode);
  const attempts = account.attempts || 0;
  const messagesSent = account.messagesSent || 0;

  if (account.status === 'recovered')
    return { stop: true, code: 'ALREADY_RECOVERED', reason: 'Charge already recovered; no further action.' };

  if (account.optedOut)
    return { stop: true, code: 'CUSTOMER_OPTED_OUT', reason: 'Customer opted out of communications. Compliance stop.' };

  if (attempts >= POLICY.maxAttempts)
    return { stop: true, code: 'MAX_ATTEMPTS', reason: `Reached max ${POLICY.maxAttempts} attempts. Bounded workflow exhausted.` };

  if (decline.category === 'hard')
    return { stop: true, code: 'HARD_DECLINE', reason: `${decline.label}: retrying is non-compliant and futile. Routed to manual review.` };

  if (account.amount < POLICY.minChargeToPursue)
    return { stop: true, code: 'BELOW_THRESHOLD', reason: `Charge $${account.amount} below $${POLICY.minChargeToPursue} pursuit threshold. Not economical.` };

  if (messagesSent >= POLICY.maxCustomerMessages)
    return { stop: true, code: 'MESSAGE_CAP', reason: `Hit anti-harassment cap of ${POLICY.maxCustomerMessages} messages.` };

  return { stop: false };
}

// Is it compliant to send an outreach message right now?
function contactAllowed(account, nowHour) {
  const [start, end] = POLICY.quietHoursLocal;
  const inQuietHours = nowHour >= start || nowHour < end;
  if (inQuietHours) return { ok: false, reason: 'Quiet hours (21:00–08:00 local). Deferred to comply with contact policy.' };
  const since = account.hoursSinceLastMessage;
  if (since != null && since < POLICY.contactCooldownHours)
    return { ok: false, reason: `Contact cooldown: only ${since}h since last message (<${POLICY.contactCooldownHours}h).` };
  return { ok: true };
}

// ---- The core decision: what is the next bounded action for this account? --
export function decideAction(account, nowHour = 12) {
  const decline = getDecline(account.declineCode);

  const stop = checkStoppingRules(account);
  if (stop.stop) {
    const action = decline.category === 'hard' ? 'manual_review' : 'stop';
    return {
      action,
      diagnosis: decline.rootCause,
      category: decline.category,
      reasoning: stop.reason,
      stoppingRule: stop.code,
      compliant: true,
    };
  }

  const options = allowedInterventions(decline).filter((a) => LADDER.includes(a));
  const attempts = account.attempts || 0;

  // Walk up the escalation ladder as attempts accumulate.
  let choice = options[Math.min(attempts, options.length - 1)];

  // Enforce contact policy for any customer-facing message.
  const isMessage = ['card_update_email', 'dunning_email', 'sms_reminder', 'final_notice'].includes(choice);
  let deferralNote = null;
  if (isMessage) {
    const c = contactAllowed(account, nowHour);
    if (!c.ok) {
      deferralNote = c.reason;
      // If a retry is still valid for soft declines, fall back to it instead of waiting.
      if (decline.retryable && attempts < POLICY.maxAttempts - 1) choice = 'smart_retry';
    }
  }

  const backoff = POLICY.retryBackoffHours[Math.min(attempts, POLICY.retryBackoffHours.length - 1)];

  return {
    action: choice,
    diagnosis: decline.rootCause,
    category: decline.category,
    retryable: decline.retryable,
    nextBackoffHours: choice === 'smart_retry' ? backoff : null,
    reasoning: buildReasoning(decline, choice, attempts),
    deferralNote,
    stoppingRule: null,
    compliant: true,
  };
}

function buildReasoning(decline, action, attempts) {
  const human = {
    smart_retry: `Soft decline (${decline.label}) is transient — scheduling a spaced retry rather than contacting the customer.`,
    card_update_email: `${decline.label} needs customer action — sending a secure card-update request.`,
    dunning_email: `Escalating to a dunning email after ${attempts} prior attempt(s).`,
    sms_reminder: `Email unanswered — escalating to SMS reminder (within contact policy).`,
    final_notice: `Final notice before pausing recovery, per bounded workflow.`,
    manual_review: `${decline.label}: routed to human review — automated recovery is not appropriate.`,
  };
  return human[action] || `Selected ${action}.`;
}
