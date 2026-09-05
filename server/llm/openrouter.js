// Minimal OpenRouter (OpenAI-compatible) chat client with one retry and a
// hard timeout. Used only by the Diagnoser for ambiguous rows.
const URL = 'https://openrouter.ai/api/v1/chat/completions';

export function llmEnabled() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export function activeModel() {
  return process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function chatJson(system, user, { timeoutMs = 20000, maxAttempts = 3 } = {}) {
  if (!llmEnabled()) return null;
  // Returns { text } on success, { retryable: true } on 429/5xx, null otherwise.
  const attempt = async () => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://revenue-recovery.local',
          'X-Title': 'Reclaim AI',
        },
        body: JSON.stringify({
          model: activeModel(),
          temperature: 0.1,
          max_tokens: 250,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
      if (res.status === 429 || res.status >= 500) return { retryable: true };
      if (!res.ok) return null;
      const data = await res.json();
      return { text: data?.choices?.[0]?.message?.content?.trim() || null };
    } catch {
      return { retryable: true }; // timeout / network -> worth a retry
    } finally {
      clearTimeout(t);
    }
  };

  for (let i = 0; i < maxAttempts; i++) {
    const r = await attempt();
    if (r && 'text' in r) return r.text ? parseJson(r.text) : null;
    if (!r?.retryable) return null;
    if (i < maxAttempts - 1) await sleep(1500 * (i + 1)); // backoff on 429/5xx
  }
  return null;
}

function parseJson(text) {
  try {
    const a = text.indexOf('{');
    const b = text.lastIndexOf('}');
    if (a === -1 || b === -1) return null;
    return JSON.parse(text.slice(a, b + 1));
  } catch {
    return null;
  }
}
