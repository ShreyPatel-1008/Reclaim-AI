import React, { useEffect, useRef, useState } from 'react';
import { fmtMoney } from '../api.js';

// Smoothly animate a number toward a target.
// A single persistent RAF loop lerps the displayed value toward the latest
// target each frame. This stays robust even when the target changes hundreds
// of times per frame (e.g. an "instant" batch run) — no cancellation storms,
// and it always converges to the final value.
export function useCountUp(target) {
  const [val, setVal] = useState(target || 0);
  const targetRef = useRef(target || 0);
  const valRef = useRef(target || 0);

  useEffect(() => { targetRef.current = target || 0; }, [target]);

  // Driven by setInterval (not requestAnimationFrame) so the counter keeps
  // advancing even when the tab is backgrounded / not compositing frames.
  useEffect(() => {
    const id = setInterval(() => {
      const t = targetRef.current;
      const cur = valRef.current;
      const diff = t - cur;
      if (Math.abs(diff) < 0.5) {
        if (cur !== t) { valRef.current = t; setVal(t); }
      } else {
        valRef.current = cur + diff * 0.18;
        setVal(valRef.current);
      }
    }, 33);
    return () => clearInterval(id);
  }, []);

  return val;
}

export function Money({ value }) {
  const v = useCountUp(value);
  return <>{fmtMoney(v)}</>;
}

export function Num({ value }) {
  const v = useCountUp(value);
  return <>{Math.round(v).toLocaleString('en-US')}</>;
}

export function StatusBadge({ status }) {
  const map = {
    at_risk: ['At risk', 'sb-risk'],
    in_progress: ['Working', 'sb-progress'],
    recovered: ['Recovered', 'sb-good'],
    stopped: ['Stopped', 'sb-stop'],
    manual_review: ['Manual review', 'sb-manual'],
  };
  const [label, cls] = map[status] || [status, 'sb-risk'];
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function CategoryTag({ category }) {
  const map = { soft: ['Soft', 'ct-soft'], action: ['Action', 'ct-action'], hard: ['Hard', 'ct-hard'] };
  const [label, cls] = map[category] || [category, 'ct-soft'];
  return <span className={`ctag ${cls}`}>{label}</span>;
}

export const ACTION_LABEL = {
  smart_retry: 'Smart retry',
  card_update_email: 'Card-update email',
  dunning_email: 'Dunning email',
  sms_reminder: 'SMS reminder',
  final_notice: 'Final notice',
  manual_review: 'Manual review',
  stop: 'Stop',
};

export const OUTCOME_LABEL = {
  recovered: ['Recovered', 'out-good'],
  no_response: ['No response', 'out-none'],
  escalated: ['Escalated', 'out-manual'],
  stopped: ['Stopped', 'out-stop'],
};
