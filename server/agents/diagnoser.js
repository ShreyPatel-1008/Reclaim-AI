// Agent 1 — Diagnoser (PRD §6.1, TDD §6.1).
// Classifies each failed payment into one of the canonical root causes with a
// confidence score and plain-language reasoning.
//
//  1. failure_code present & known  -> deterministic map, confidence 1.0
//  2. failure_code blank/ambiguous  -> LLM reasons over amount/method/retry
//  3. confidence < 0.5              -> forced to `unknown` (hard rule, correction #8)
import { getRootCause, DETERMINISTIC_CODES, ROOT_CAUSE_KEYS } from '../config/failureCodes.js';
import { chatJson, llmEnabled, activeModel } from '../llm/openrouter.js';

const CONFIDENCE_FLOOR = 0.5;

const SYSTEM = `You are a payment-failure diagnostician. Given a failed payment with NO failure code,
infer the most likely root cause using amount, payment method, and retry count.
Choose EXACTLY ONE label from this list:
${ROOT_CAUSE_KEYS.join(', ')}.
If the signals are weak or conflicting, choose "unknown" rather than guessing.
Respond ONLY with compact JSON: {"root_cause":"<label>","confidence":0.0-1.0,"reasoning":"<= 30 words"}`;

export async function diagnose(payment) {
  const code = payment.failure_code;

  // Case 1: deterministic
  if (code && DETERMINISTIC_CODES.has(code)) {
    const rc = getRootCause(code);
    return {
      root_cause: code,
      confidence: 1.0,
      reasoning: `Failure code "${code}" maps directly to ${rc.label}. ${rc.explanation}`,
      source: 'deterministic',
    };
  }

  // Case 2: ambiguous / blank -> LLM
  if (llmEnabled()) {
    const user = JSON.stringify({
      amount: payment.amount,
      payment_method: payment.payment_method,
      retry_count: payment.retry_count,
      customer_tier: payment.customer_tier,
      note: 'failure_code is missing',
    });
    const out = await chatJson(SYSTEM, user);
    if (out && ROOT_CAUSE_KEYS.includes(out.root_cause)) {
      let confidence = clamp01(out.confidence);
      let root = out.root_cause;
      let reasoning = String(out.reasoning || 'LLM inference over amount, method, retry count.');
      // Case 3: hard floor — low confidence must not masquerade as a real label.
      if (confidence == null || confidence < CONFIDENCE_FLOOR) {
        root = 'unknown';
        reasoning = `Low-confidence inference (${confidence ?? 'n/a'}) → forced to unknown to avoid guessing. ${reasoning}`;
        confidence = confidence ?? 0.3;
      }
      return { root_cause: root, confidence, reasoning, source: `ai:${activeModel()}` };
    }
    // LLM failed/unusable -> escalate-safe default
    return unknownFallback('LLM diagnosis unavailable for blank code; defaulting to unknown.');
  }

  // No LLM key: blank codes cannot be inferred -> unknown (safe, escalates)
  return unknownFallback('No failure code and AI diagnosis disabled; defaulting to unknown.');
}

function unknownFallback(reason) {
  return { root_cause: 'unknown', confidence: 0.3, reasoning: reason, source: 'rules' };
}

function clamp01(n) {
  const x = Number(n);
  if (Number.isNaN(x)) return null;
  return Math.max(0, Math.min(1, x));
}
