// Recovery orchestrator.
// Walks a batch of at-risk accounts through the bounded recovery workflow,
// consulting the decision engine (safe set) + AI advisor (chosen action &
// rationale), simulating realistic outcomes, and emitting an audit event for
// every single decision. Emits events via onEvent for live streaming.

import { decideAction, checkStoppingRules, POLICY, LADDER } from './decisionEngine.js';
import { advise } from './aiAdvisor.js';
import { getDecline } from '../data/declineCodes.js';

// How much each action lifts the base recovery odds, if appropriate.
const ACTION_EFFICACY = {
  smart_retry: 1.0,
  card_update_email: 0.9,
  dunning_email: 0.55,
  sms_reminder: 0.7,
  final_notice: 0.45,
  manual_review: 0.0, // handed to a human; no automated recovery credited
};

function allowedFor(decline) {
  switch (decline.category) {
    case 'soft': return ['smart_retry', 'dunning_email', 'sms_reminder', 'final_notice'];
    case 'action': return ['card_update_email', 'dunning_email', 'sms_reminder', 'final_notice'];
    case 'hard': return ['manual_review'];
    default: return ['dunning_email', 'manual_review'];
  }
}

// Probability a given action recovers the charge on this attempt.
function successProbability(account, action, attempt) {
  const decline = getDecline(account.declineCode);
  const efficacy = ACTION_EFFICACY[action] ?? 0.3;
  // odds decay a little each additional attempt (fatigue)
  const decay = Math.pow(0.85, attempt);
  return Math.max(0, Math.min(0.95, decline.baseRecoveryRate * efficacy * decay));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runBatch(accounts, { onEvent, stepDelayMs = 0 } = {}) {
  const auditLog = [];
  let recoveredRevenue = 0;
  let recoveredCount = 0;
  let actionsTaken = 0;
  let stoppedCount = 0;

  const emit = (evt) => { if (onEvent) onEvent(evt); };

  emit({ type: 'batch_start', total: accounts.length, ts: Date.now() });

  for (const account of accounts) {
    account.status = 'in_progress';

    // Each account gets up to POLICY.maxAttempts bounded steps.
    while (true) {
      const stop = checkStoppingRules(account);
      const decline = getDecline(account.declineCode);

      if (stop.stop) {
        const isManual = decline.category === 'hard';
        account.status = isManual ? 'manual_review' : (account.status === 'recovered' ? 'recovered' : 'stopped');
        if (account.status !== 'recovered') stoppedCount++;
        const entry = auditEntry(account, {
          action: isManual ? 'manual_review' : 'stop',
          rationale: stop.reason,
          stoppingRule: stop.code,
          outcome: isManual ? 'escalated' : 'stopped',
          source: 'rules',
        });
        auditLog.push(entry);
        emit({ type: 'decision', account: publicAccount(account), entry });
        break;
      }

      // 1) Engine proposes the safe action set + a default choice.
      const engineDecision = decideAction(account, currentHour());
      const allowed = allowedFor(decline);

      // 2) AI advisor picks among allowed actions + writes rationale.
      const advice = await advise(account, engineDecision, allowed);
      const action = allowed.includes(advice.action) ? advice.action : engineDecision.action;

      account.attempts += 1;
      actionsTaken += 1;
      const isMessage = ['card_update_email', 'dunning_email', 'sms_reminder', 'final_notice'].includes(action);
      if (isMessage) {
        account.messagesSent += 1;
        account.hoursSinceLastMessage = 0;
      }

      // 3) Simulate the outcome.
      const p = successProbability(account, action, account.attempts - 1);
      const success = Math.random() < p;

      let outcome, entryExtra = {};
      if (action === 'manual_review') {
        outcome = 'escalated';
        account.status = 'manual_review';
      } else if (success) {
        outcome = 'recovered';
        account.status = 'recovered';
        account.recoveredAmount = account.amount;
        recoveredRevenue += account.amount;
        recoveredCount += 1;
      } else {
        outcome = 'no_response';
      }

      const entry = auditEntry(account, {
        action,
        rationale: advice.rationale || engineDecision.reasoning,
        diagnosis: engineDecision.diagnosis,
        category: engineDecision.category,
        confidence: advice.confidence,
        source: advice.source,
        model: advice.model,
        successProbability: Number(p.toFixed(2)),
        nextBackoffHours: engineDecision.nextBackoffHours,
        deferralNote: engineDecision.deferralNote,
        outcome,
        ...entryExtra,
      });
      auditLog.push(entry);
      emit({
        type: 'decision',
        account: publicAccount(account),
        entry,
        running: { recoveredRevenue, recoveredCount, actionsTaken, stoppedCount },
      });

      if (stepDelayMs) await sleep(stepDelayMs);

      if (account.status === 'recovered' || account.status === 'manual_review') break;
      if (account.attempts >= POLICY.maxAttempts) {
        account.status = 'stopped';
        stoppedCount++;
        const e2 = auditEntry(account, {
          action: 'stop',
          rationale: `Reached max ${POLICY.maxAttempts} attempts. Bounded workflow exhausted.`,
          stoppingRule: 'MAX_ATTEMPTS',
          outcome: 'stopped',
          source: 'rules',
        });
        auditLog.push(e2);
        emit({ type: 'decision', account: publicAccount(account), entry: e2 });
        break;
      }
    }
  }

  const atRisk = accounts.reduce((s, a) => s + a.amount, 0);
  const result = {
    totalAccounts: accounts.length,
    atRiskRevenue: atRisk,
    recoveredRevenue,
    recoveredCount,
    recoveryRatePct: atRisk ? Number(((recoveredRevenue / atRisk) * 100).toFixed(1)) : 0,
    actionsTaken,
    stoppedCount,
    manualReviewCount: accounts.filter((a) => a.status === 'manual_review').length,
    auditCount: auditLog.length,
  };
  emit({ type: 'batch_complete', result, ts: Date.now() });
  return { result, auditLog, accounts };
}

let _seq = 0;
function auditEntry(account, fields) {
  _seq += 1;
  return {
    seq: _seq,
    ts: Date.now(),
    chargeId: account.id,
    customer: account.customerName,
    amount: account.amount,
    declineCode: account.declineCode,
    declineLabel: account.declineLabel,
    attempt: account.attempts,
    ...fields,
  };
}

function publicAccount(a) {
  return {
    id: a.id, customerName: a.customerName, plan: a.plan, amount: a.amount,
    declineCode: a.declineCode, declineLabel: a.declineLabel, status: a.status,
    attempts: a.attempts, recoveredAmount: a.recoveredAmount,
  };
}

function currentHour() {
  return new Date().getHours();
}
