const J = (r) => r.json();

export const getHealth = () => fetch('/api/health').then(J);
export const getPolicy = () => fetch('/api/policy').then(J);
export const getLatest = () => fetch('/api/batches/latest').then(J);
export const getPayments = (runId) => fetch(`/api/batches/${runId}/payments`).then(J);
export const getReport = (runId) => fetch(`/api/batches/${runId}/report`).then(J);
export const getAudit = (paymentId, runId) =>
  fetch(`/api/payments/${paymentId}/audit?run_id=${runId}`).then(J);

export const ingestBatch = () =>
  fetch('/api/batches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(J);

export const runEval = (runId, n = 15) =>
  fetch(`/api/batches/${runId}/eval?n=${n}`, { method: 'POST' }).then(J);

export function fmtMoney(n) {
  return '₹' + Math.round(n || 0).toLocaleString('en-IN');
}
export function fmtPct(n) {
  return (n ?? 0).toFixed(1) + '%';
}
