import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getHealth, getPolicy, getAccounts, resetBatch, fmtMoney, fmtPct } from './api.js';
import { Money, Num, StatusBadge, CategoryTag, ACTION_LABEL, OUTCOME_LABEL } from './components/Bits.jsx';

const DECLINE_CAT = {
  insufficient_funds: 'soft', do_not_honor: 'soft', processing_error: 'soft', issuer_unavailable: 'soft',
  expired_card: 'action', incorrect_cvc: 'action', authentication_required: 'action', card_not_supported: 'action',
  lost_card: 'hard', stolen_card: 'hard', fraudulent: 'hard',
};

export default function App() {
  const [health, setHealth] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [audit, setAudit] = useState([]);
  const [metrics, setMetrics] = useState({ recoveredRevenue: 0, recoveredCount: 0, actionsTaken: 0, stoppedCount: 0 });
  const [result, setResult] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | running | done
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState('fast');
  const esRef = useRef(null);
  const acctMap = useRef(new Map());

  useEffect(() => {
    getHealth().then(setHealth).catch(() => {});
    getPolicy().then(setPolicy).catch(() => {});
    loadAccounts();
    return () => esRef.current?.close();
  }, []);

  async function loadAccounts() {
    const { accounts, summary } = await getAccounts();
    acctMap.current = new Map(accounts.map((a) => [a.id, a]));
    setAccounts(accounts);
    setSummary(summary);
  }

  async function handleReset() {
    esRef.current?.close();
    setPhase('idle');
    setAudit([]);
    setResult(null);
    setMetrics({ recoveredRevenue: 0, recoveredCount: 0, actionsTaken: 0, stoppedCount: 0 });
    setProgress(0);
    await resetBatch(200);
    await loadAccounts();
  }

  function runBatch() {
    if (phase === 'running') return;
    // reset live state but keep the seeded accounts visible
    setAudit([]);
    setResult(null);
    setMetrics({ recoveredRevenue: 0, recoveredCount: 0, actionsTaken: 0, stoppedCount: 0 });
    setProgress(0);
    setPhase('running');
    setAccounts((prev) => prev.map((a) => ({ ...a, status: 'at_risk', attempts: 0, recoveredAmount: 0 })));
    acctMap.current = new Map(accounts.map((a) => [a.id, { ...a, status: 'at_risk' }]));

    const es = new EventSource(`/api/run?speed=${speed}`);
    esRef.current = es;
    let seen = 0;
    const total = accounts.length || 200;
    const auditBuffer = [];

    es.onmessage = (e) => {
      const evt = JSON.parse(e.data);
      if (evt.type === 'decision') {
        const a = evt.account;
        acctMap.current.set(a.id, a);
        auditBuffer.unshift(evt.entry);
        if (auditBuffer.length > 400) auditBuffer.pop();
        if (evt.running) setMetrics(evt.running);
        // count each account once toward progress when it terminates
        if (['recovered', 'stopped', 'manual_review'].includes(a.status)) {
          seen = [...acctMap.current.values()].filter((x) => ['recovered', 'stopped', 'manual_review'].includes(x.status)).length;
          setProgress(Math.min(100, Math.round((seen / total) * 100)));
        }
        // throttle React updates
        if (auditBuffer.length % 3 === 0 || evt.entry.outcome === 'recovered') {
          setAudit([...auditBuffer]);
          setAccounts([...acctMap.current.values()]);
        }
      } else if (evt.type === 'batch_complete') {
        setResult(evt.result);
      } else if (evt.type === 'done') {
        setAudit([...auditBuffer]);
        setAccounts([...acctMap.current.values()]);
        setProgress(100);
        setPhase('done');
        es.close();
      } else if (evt.type === 'error') {
        setPhase('done');
        es.close();
      }
    };
    es.onerror = () => { es.close(); setPhase((p) => (p === 'running' ? 'done' : p)); };
  }

  const atRisk = summary?.atRiskRevenue || 0;
  const recoveryRate = atRisk ? (metrics.recoveredRevenue / atRisk) * 100 : 0;

  const catCounts = useMemo(() => {
    const c = { soft: 0, action: 0, hard: 0 };
    for (const a of accounts) { const cat = DECLINE_CAT[a.declineCode] || 'soft'; c[cat]++; }
    return c;
  }, [accounts]);

  const declineBreakdown = useMemo(() => {
    const m = new Map();
    for (const a of accounts) {
      const k = a.declineLabel || a.declineCode;
      if (!m.has(k)) m.set(k, { label: k, cat: DECLINE_CAT[a.declineCode] || 'soft', amount: 0, count: 0 });
      const e = m.get(k); e.amount += a.amount; e.count += 1;
    }
    return [...m.values()].sort((x, y) => y.amount - x.amount);
  }, [accounts]);

  const guardrailHits = useMemo(
    () => audit.filter((e) => e.stoppingRule).slice(0, 40),
    [audit]
  );

  return (
    <div className="app">
      <Header health={health} />

      <div className="controls">
        <button className="btn-run" onClick={runBatch} disabled={phase === 'running'}>
          {phase === 'running' ? (<><span className="spinner" /> Recovering…</>) : '▶  Run Recovery Batch'}
        </button>
        <button className="btn-ghost" onClick={handleReset} disabled={phase === 'running'}>↻ New batch</button>
        <div className="speed">
          <span>Speed</span>
          {['instant', 'fast', 'normal'].map((s) => (
            <button key={s} className={`chip ${speed === s ? 'chip-on' : ''}`} onClick={() => setSpeed(s)} disabled={phase === 'running'}>{s}</button>
          ))}
        </div>
        <div className="progress-wrap">
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
          <span className="progress-label">{progress}%</span>
        </div>
      </div>

      <div className="kpis">
        <Kpi label="Revenue at risk" value={<>{fmtMoney(atRisk)}</>} sub={`${accounts.length} failed charges`} tone="risk" />
        <Kpi label="Revenue recovered" value={<Money value={metrics.recoveredRevenue} />} sub={<><Num value={metrics.recoveredCount} /> charges won back</>} tone="good" big />
        <Kpi label="Recovery rate" value={fmtPct(recoveryRate)} sub="of at-risk dollars" tone="good" />
        <Kpi label="Actions taken" value={<Num value={metrics.actionsTaken} />} sub="bounded interventions" tone="neutral" />
        <Kpi label="Manual review" value={<Num value={result?.manualReviewCount ?? catCounts.hard} />} sub="hard declines escalated" tone="manual" />
        <Kpi label="Stopped by rules" value={<Num value={metrics.stoppedCount} />} sub="guardrails enforced" tone="stop" />
      </div>

      <div className="grid">
        <section className="panel triage">
          <div className="panel-head">
            <h2>Triage <span className="muted">· {accounts.length} accounts</span></h2>
            <Legend />
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Charge</th><th>Customer</th><th>Plan</th><th className="r">Amount</th><th>Failure</th><th className="c">Attempts</th><th>Status</th></tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className={a.status === 'recovered' ? 'row-recovered' : ''}>
                    <td className="mono dim">{a.id}</td>
                    <td>{a.customerName}</td>
                    <td className="dim">{a.plan}</td>
                    <td className="r mono">{fmtMoney(a.amount)}</td>
                    <td><CategoryTag category={DECLINE_CAT[a.declineCode] || 'soft'} /> <span className="dim small">{a.declineLabel}</span></td>
                    <td className="c mono">{a.attempts || 0}</td>
                    <td><StatusBadge status={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel audit">
          <div className="panel-head"><h2>Agent decision log</h2><span className="muted mono">{audit.length} entries</span></div>
          <div className="feed">
            {audit.length === 0 && <div className="empty">Run a batch to watch the agent diagnose, decide, and recover — every decision logged here.</div>}
            {audit.map((e) => <AuditRow key={e.seq} e={e} />)}
          </div>
        </section>
      </div>

      <div className="grid grid-lower">
        <section className="panel">
          <div className="panel-head"><h2>At-risk revenue by root cause</h2></div>
          <div className="bars">
            {declineBreakdown.map((d) => (
              <div className="bar-row" key={d.label}>
                <div className="bar-label"><CategoryTag category={d.cat} /> {d.label} <span className="dim small">· {d.count}</span></div>
                <div className="bar-track"><div className={`bar-fill fill-${d.cat}`} style={{ width: `${(d.amount / (declineBreakdown[0]?.amount || 1)) * 100}%` }} /></div>
                <div className="bar-val mono">{fmtMoney(d.amount)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head"><h2>Compliance & stopping rules</h2><span className="muted">audit-ready</span></div>
          {policy && <PolicyStrip policy={policy.policy} />}
          <div className="guardrail-feed">
            {guardrailHits.length === 0 && <div className="empty small">Guardrail activations (max attempts, hard declines, opt-outs, anti-harassment caps) appear here during a run.</div>}
            {guardrailHits.map((e) => (
              <div className="grow-row" key={e.seq}>
                <span className={`rule-tag rule-${e.stoppingRule?.toLowerCase()}`}>{e.stoppingRule}</span>
                <span className="mono dim">{e.chargeId}</span>
                <span className="grow-reason">{e.rationale}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <footer className="foot">
        Reclaim · AI Revenue Recovery agent — detect → diagnose → decide → execute → recover, with compliant escalation, stopping rules, and a full audit trail.
      </footer>
    </div>
  );
}

function Header({ health }) {
  return (
    <header className="hdr">
      <div className="brand">
        <div className="logo">R</div>
        <div>
          <div className="brand-name">Reclaim</div>
          <div className="brand-sub">AI Revenue Recovery</div>
        </div>
      </div>
      <div className="hdr-right">
        <div className={`ai-badge ${health?.aiEnabled ? 'ai-on' : 'ai-off'}`}>
          <span className="dot" />
          {health?.aiEnabled ? `AI: ${shortModel(health.model)}` : 'Rules engine (AI off)'}
        </div>
      </div>
    </header>
  );
}
function shortModel(m) { return (m || '').split('/').pop(); }

function Kpi({ label, value, sub, tone, big }) {
  return (
    <div className={`kpi kpi-${tone} ${big ? 'kpi-big' : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  );
}

function AuditRow({ e }) {
  const [outLabel, outCls] = OUTCOME_LABEL[e.outcome] || [e.outcome, 'out-none'];
  return (
    <div className={`audit-row ar-${e.outcome}`}>
      <div className="ar-top">
        <span className="ar-action">{ACTION_LABEL[e.action] || e.action}</span>
        <span className={`ar-out ${outCls}`}>{outLabel}</span>
        {e.source === 'ai' && <span className="ar-ai">AI</span>}
        {e.confidence != null && <span className="ar-conf mono">{Math.round(e.confidence * 100)}%</span>}
        <span className="ar-amt mono">{fmtMoney(e.amount)}</span>
      </div>
      <div className="ar-mid"><span className="mono dim">{e.chargeId}</span> · {e.customer} · <span className="dim">{e.declineLabel}</span></div>
      <div className="ar-reason">{e.rationale}</div>
    </div>
  );
}

function PolicyStrip({ policy }) {
  const items = [
    ['Max attempts', policy.maxAttempts],
    ['Hard-decline retries', policy.maxRetriesHardDecline],
    ['Msg cap', policy.maxCustomerMessages],
    ['Cooldown', `${policy.contactCooldownHours}h`],
    ['Quiet hours', `${policy.quietHoursLocal[0]}:00–${policy.quietHoursLocal[1]}:00`],
    ['Min charge', `$${policy.minChargeToPursue}`],
  ];
  return (
    <div className="policy-strip">
      {items.map(([k, v]) => (<div className="pol" key={k}><span className="pol-k">{k}</span><span className="pol-v mono">{v}</span></div>))}
    </div>
  );
}

function Legend() {
  return (
    <div className="legend">
      <span><i className="dot d-soft" /> Soft · retry</span>
      <span><i className="dot d-action" /> Action · customer</span>
      <span><i className="dot d-hard" /> Hard · stop</span>
    </div>
  );
}
