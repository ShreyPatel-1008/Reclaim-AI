import React, { useEffect, useRef, useState } from 'react';
import { fmtMoney } from '../api.js';

// Animate a number toward a target. Driven by setInterval (not rAF) so it keeps
// advancing even when the tab is backgrounded / not compositing frames.
export function useCountUp(target) {
  const [val, setVal] = useState(target || 0);
  const targetRef = useRef(target || 0);
  const valRef = useRef(target || 0);
  useEffect(() => { targetRef.current = target || 0; }, [target]);
  useEffect(() => {
    const id = setInterval(() => {
      const t = targetRef.current, cur = valRef.current, diff = t - cur;
      if (Math.abs(diff) < 0.5) { if (cur !== t) { valRef.current = t; setVal(t); } }
      else { valRef.current = cur + diff * 0.18; setVal(valRef.current); }
    }, 33);
    return () => clearInterval(id);
  }, []);
  return val;
}

export function Money({ value }) { return <>{fmtMoney(useCountUp(value))}</>; }
export function Num({ value }) { return <>{Math.round(useCountUp(value)).toLocaleString('en-IN')}</>; }

export const STATUS_META = {
  pending: ['Pending', 'sb-risk'],
  recovered: ['Recovered', 'sb-good'],
  escalated: ['Escalated', 'sb-manual'],
  failed: ['Failed', 'sb-stop'],
  no_action: ['No action', 'sb-mute'],
};
export function StatusBadge({ status }) {
  const [label, cls] = STATUS_META[status] || [status, 'sb-risk'];
  return <span className={`badge ${cls}`}>{label}</span>;
}

export const CAT_META = {
  transient: ['Transient', 'ct-soft'],
  action: ['Action', 'ct-action'],
  risk: ['Risk', 'ct-hard'],
  ambiguous: ['Ambiguous', 'ct-amb'],
};
export const ROOT_CAUSE_CAT = {
  insufficient_funds: 'action', card_expired: 'action', invalid_cvv: 'action',
  bank_timeout: 'transient', network_error: 'transient', issuer_unavailable: 'transient',
  risky_declined: 'risk', unknown: 'ambiguous',
};
export const ROOT_CAUSE_LABEL = {
  insufficient_funds: 'Insufficient funds', bank_timeout: 'Bank timeout', network_error: 'Network error',
  issuer_unavailable: 'Issuer unavailable', card_expired: 'Card expired', invalid_cvv: 'Invalid CVV',
  risky_declined: 'Risky / declined', unknown: 'Unknown',
};
export function CauseTag({ cause }) {
  const cat = ROOT_CAUSE_CAT[cause] || 'ambiguous';
  const [label, cls] = CAT_META[cat] || [cat, 'ct-amb'];
  return <span className={`ctag ${cls}`}>{label}</span>;
}

export const ACTION_LABEL = {
  retry_immediate: 'Retry now',
  retry_delayed_2hr: 'Retry +2h',
  send_payment_link: 'Payment link',
  escalate_to_human: 'Escalate',
  no_action: 'No action',
};
