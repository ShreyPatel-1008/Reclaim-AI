// AI reasoning layer (OpenRouter, OpenAI-compatible).
//
// Design principle: the AI ADVISES, the rules engine DECIDES the safe set.
// We hand the model the diagnosis + the engine-approved action and ask it to
// (a) confirm or pick among the allowed actions and (b) write a crisp,
// customer-safe rationale. If the model returns an action outside the allowed
// set, or the call fails, we fall back to the deterministic engine choice.
// This keeps the live demo network-optional and the agent always compliant.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export function aiEnabled() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

const SYSTEM_PROMPT = `You are Reclaim, an AI revenue-recovery agent for failed payments.
You are given a failed charge, its diagnosed root cause, the guardrail-approved actions,
and the action the deterministic policy engine selected.

Your job:
1. Choose the single best action ONLY from the "allowedActions" list. Never invent actions.
2. Write a one-sentence rationale a human ops reviewer would trust. No fluff, no emojis.
3. Estimate recovery likelihood (0-1) for your chosen action given the root cause.

Respond ONLY with compact JSON:
{"action": "<one of allowedActions>", "rationale": "<= 25 words", "confidence": 0.0-1.0}`;

export async function advise(account, engineDecision, allowedActions) {
  const fallback = {
    action: engineDecision.action,
    rationale: engineDecision.reasoning,
    confidence: null,
    source: 'rules',
  };

  if (!aiEnabled()) return fallback;
  // Don't spend a model call on hard stops — the rule is absolute.
  if (engineDecision.stoppingRule) return fallback;

  const model = process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';
  const userPayload = {
    charge: { amount: account.amount, currency: account.currency, customer: account.customerName },
    declineCode: account.declineCode,
    rootCause: engineDecision.diagnosis,
    category: engineDecision.category,
    attemptsSoFar: account.attempts || 0,
    allowedActions,
    engineSelected: engineDecision.action,
  };

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://reclaim.local',
        'X-Title': 'Reclaim Revenue Recovery',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 200,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(userPayload) },
        ],
      }),
    });
    clearTimeout(t);
    if (!res.ok) return fallback;
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) return fallback;

    const parsed = safeParseJson(text);
    if (!parsed) return fallback;

    // GUARDRAIL: reject any action the engine did not approve.
    if (!allowedActions.includes(parsed.action)) {
      return { ...fallback, rationale: engineDecision.reasoning, overriddenBy: 'guardrail' };
    }

    return {
      action: parsed.action,
      rationale: typeof parsed.rationale === 'string' ? parsed.rationale : engineDecision.reasoning,
      confidence: clamp01(parsed.confidence),
      source: 'ai',
      model,
    };
  } catch {
    return fallback;
  }
}

function safeParseJson(text) {
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function clamp01(n) {
  const x = Number(n);
  if (Number.isNaN(x)) return null;
  return Math.max(0, Math.min(1, x));
}
