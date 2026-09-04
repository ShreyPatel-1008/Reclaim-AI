// Razorpay test-mode client (TDD §7). Only `send_payment_link` maps to a real
// Razorpay API (Payment Links, which works in test mode). Retries have no
// real "retry this failed payment" API, so they are always simulated by the
// mock executor. Any failure here falls back to a mock link.
let _instance = null;

// Budget of REAL Razorpay calls per batch, so a 185-row run doesn't fire ~90
// live API calls (slow + rate-limited). The first N payment links are real
// (proving the integration); the rest use the mock. Reset at batch start.
let _realBudget = Number(process.env.RAZORPAY_MAX_LINKS || 8);
export function resetLinkBudget() { _realBudget = Number(process.env.RAZORPAY_MAX_LINKS || 8); }

export function razorpayEnabled() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

async function instance() {
  if (_instance) return _instance;
  const { default: Razorpay } = await import('razorpay');
  _instance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
  return _instance;
}

// Create a real test-mode payment link. Returns { url, id, real } or a mock.
export async function createPaymentLink(payment) {
  if (!razorpayEnabled() || _realBudget <= 0) {
    return { url: `https://rzp.io/i/mock_${payment.payment_id}`, id: `plink_mock_${payment.payment_id}`, real: false };
  }
  _realBudget -= 1;
  try {
    const rzp = await instance();
    const link = await rzp.paymentLink.create({
      amount: Math.round(Number(payment.amount) * 100), // paise
      currency: 'INR',
      accept_partial: false,
      description: `Recovery for ${payment.payment_id}`,
      // alphanumeric/underscore only + a nonce so re-runs never collide
      reference_id: `${payment.payment_id}_${Date.now().toString(36)}`.replace(/[^a-zA-Z0-9_]/g, ''),
      notes: { payment_id: payment.payment_id, root_cause: payment.root_cause || '' },
    });
    return { url: link.short_url, id: link.id, real: true };
  } catch (e) {
    return {
      url: `https://rzp.io/i/mock_${payment.payment_id}`,
      id: `plink_mock_${payment.payment_id}`,
      real: false,
      error: e?.error?.description || e?.message || 'razorpay error',
    };
  }
}
