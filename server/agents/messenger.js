// Recovery Messenger — writes a short, personalized Hinglish message for the
// customer whose payment we're trying to recover (matches the brief's
// "Hinglish voice recovery" direction). LLM-generated where possible, with a
// reliable Hinglish template fallback so the demo never breaks.
import { chatJson, llmEnabled, activeModel } from '../llm/openrouter.js';
import { getRootCause } from '../config/failureCodes.js';

const SYSTEM = `You write short payment-recovery messages in Hinglish (Hindi + English mixed, written in Latin/Roman script), in the warm, friendly tone of an Indian fintech like Razorpay or PhonePe.
Rules:
- 1 to 2 sentences only.
- Mention the amount and, simply, why the payment failed.
- End with a polite nudge to complete payment via the link.
- Use at most ONE emoji. Be respectful, never pushy.
- Do NOT invent a customer name.
Return ONLY compact JSON: {"message":"<the hinglish message>"}`;

// Simple, safe Hinglish reason phrases per root cause.
const REASON_HI = {
  card_expired: 'aapka card expire ho gaya hai',
  invalid_cvv: 'card ki details match nahi ho payi',
  insufficient_funds: 'account mein us waqt sufficient balance nahi tha',
  bank_timeout: 'bank ki taraf se thodi der ho gayi',
  network_error: 'ek chhoti si technical dikkat aa gayi',
  issuer_unavailable: 'aapka bank us waqt available nahi tha',
};

function template(rootCause, amountStr) {
  const reason = REASON_HI[rootCause] || 'payment complete nahi ho paya';
  return `Namaste! Aapka ${amountStr} ka payment nahi ho paya kyunki ${reason}. Koi baat nahi — niche diye gaye secure link se aap ise abhi complete kar sakte hain 👇`;
}

export async function generateMessage(payment) {
  const rc = getRootCause(payment.root_cause);
  const amountStr = `₹${Number(payment.amount).toLocaleString('en-IN')}`;

  if (llmEnabled()) {
    const user = JSON.stringify({
      amount: amountStr,
      failure_reason: rc.label,
      payment_method: payment.payment_method,
      customer_tier: payment.customer_tier,
    });
    const out = await chatJson(SYSTEM, user, { timeoutMs: 15000 });
    if (out?.message && typeof out.message === 'string') {
      return { message: out.message.trim().slice(0, 320), source: `ai:${activeModel()}` };
    }
  }
  return { message: template(payment.root_cause, amountStr), source: 'template' };
}
