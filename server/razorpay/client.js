// Razorpay test-mode client (TDD §7). Only `send_payment_link` maps to a real
// Razorpay API (Payment Links, which works in test mode). Retries have no
// real "retry this failed payment" API, so they are always simulated by the
// mock executor. Any failure here falls back to a mock link.
let _instance = null;

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
  if (!razorpayEnabled()) {
    return { url: `https://rzp.io/i/mock_${payment.payment_id}`, id: `plink_mock_${payment.payment_id}`, real: false };
  }
  try {
    const rzp = await instance();
    const link = await rzp.paymentLink.create({
      amount: Math.round(Number(payment.amount) * 100), // paise
      currency: 'INR',
      accept_partial: false,
      description: `Recovery for ${payment.payment_id}`,
      reference_id: `${payment.run_id}:${payment.payment_id}`.slice(0, 40),
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
