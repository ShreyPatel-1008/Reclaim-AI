// Minimal OpenRouter (OpenAI-compatible) chat client with one retry and a
// hard timeout. Used only by the Diagnoser for ambiguous rows.
const URL = 'https://openrouter.ai/api/v1/chat/completions';

export function llmEnabled() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export function activeModel() {
  return process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';
}

export async function chatJson(system, user, { timeoutMs = 15000 } = {}) {
  if (!llmEnabled()) return null;
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
          'X-Title': 'AI Revenue Recovery',
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
      if (!res.ok) return null;
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content?.trim();
      return text ? parseJson(text) : null;
    } finally {
      clearTimeout(t);
    }
  };
  try {
    return (await attempt()) ?? (await attempt()); // one retry (TDD §10)
  } catch {
    try { return await attempt(); } catch { return null; }
  }
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
