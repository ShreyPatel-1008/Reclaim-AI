export async function getHealth() {
  const r = await fetch('/api/health');
  return r.json();
}
export async function getPolicy() {
  const r = await fetch('/api/policy');
  return r.json();
}
export async function getAccounts() {
  const r = await fetch('/api/accounts');
  return r.json();
}
export async function resetBatch(count = 200) {
  const r = await fetch('/api/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count }),
  });
  return r.json();
}
export function fmtMoney(n) {
  return '$' + Math.round(n || 0).toLocaleString('en-US');
}
export function fmtPct(n) {
  return (n ?? 0).toFixed(1) + '%';
}
