import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  getHealth, getPolicy, getLatest, getPayments, ingestBatch, getAudit, getMessage, runEval, fmtMoney, fmtPct,
} from './api.js';
import {
  Money, Num, StatusBadge, CauseTag, ACTION_LABEL, ROOT_CAUSE_LABEL, ROOT_CAUSE_CAT,
} from './components/Bits.jsx';

const RULE_LABEL = {
  HIGH_VALUE: 'High-value · needs sign-off',
  MAX_RETRIES: 'Retry limit reached',
  RISKY: 'Risky · never auto-retried',
  UNKNOWN_CAUSE: 'Cause unclear · escalated',
  BELOW_THRESHOLD: 'Too small to pursue',
};

export default function App() {
  const [health, setHealth] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [runId, setRunId] = useState(null);
  const [payments, setPayments] = useState([]);
  const [metrics, setMetrics] = useState({ recovered: 0, recoveredCount: 0, escalated: 0, actionsTaken: 0 });
  const [report, setReport] = useState(null);
  const [evalResult, setEvalResult] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | running | done
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState('fast');
  const [feed, setFeed] = useState([]);
  const [drawer, setDrawer] = useState(null); // { payment_id, audit }
  const [busy, setBusy] = useState('');
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('rr-theme') || 'dark'; } catch { return 'dark'; }
  });
  const esRef = useRef(null);
  const pmap = useRef(new Map());

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('rr-theme', theme); } catch { /* ignore */ }
  }, [theme]);

  useEffect(() => {
    getHealth().then(setHealth).catch(() => setHealth({ db: false }));
    getPolicy().then(setPolicy).catch(() => {});
    boot();
    return () => esRef.current?.close();
  }, []);

  async function boot() {
    try {
      let latest = await getLatest();
      if (!latest?.run_id) { const r = await ingestBatch(); latest = { run_id: r.run_id }; }
      setRunId(latest.run_id);
      await loadPayments(latest.run_id);
    } catch { /* db likely down; health banner will show */ }
  }

  async function loadPayments(id) {
    const { payments } = await getPayments(id);
    pmap.current = new Map(payments.map((p) => [p.payment_id, p]));
    setPayments(payments);
    setAmountAttempted(payments.reduce((s, p) => s + p.amount, 0));
  }
  const [amountAttempted, setAmountAttempted] = useState(0);

  async function newBatch() {
    setBusy('Ingesting fresh batch…');
    esRef.current?.close();
    setPhase('idle'); setFeed([]); setReport(null); setEvalResult(null); setProgress(0);
    setMetrics({ recovered: 0, recoveredCount: 0, escalated: 0, actionsTaken: 0 });
    try {
      const r = await ingestBatch();
      setRunId(r.run_id);
      await loadPayments(r.run_id);
    } finally { setBusy(''); }
  }

  function run() {
    if (!runId || phase === 'running') return;
    setPhase('running'); setFeed([]); setReport(null); setProgress(0);
    setMetrics({ recovered: 0, recoveredCount: 0, escalated: 0, actionsTaken: 0 });
    setPayments((prev) => prev.map((p) => ({ ...p, status: 'pending', root_cause: null, action: null })));
    pmap.current = new Map([...pmap.current].map(([k, p]) => [k, { ...p, status: 'pending' }]));

    const es = new EventSource(`/api/batches/${runId}/run?speed=${speed}`);
    esRef.current = es;
    const total = payments.length || 185;
    const buf = [];
    let done = 0;

    es.onmessage = (e) => {
      const evt = JSON.parse(e.data);
      if (evt.type === 'payment_done') {
        const p = evt.payment;
        pmap.current.set(p.payment_id, p);
        buf.unshift(p);
        if (buf.length > 400) buf.pop();
        if (evt.running) setMetrics(evt.running);
        done++;
        setProgress(Math.min(100, Math.round((done / total) * 100)));
        if (done % 3 === 0 || p.status === 'recovered') {
          setFeed([...buf]);
          setPayments([...pmap.current.values()]);
        }
      } else if (evt.type === 'batch_complete') {
        setReport(evt.report);
      } else if (evt.type === 'done') {
        setFeed([...buf]); setPayments([...pmap.current.values()]);
        setProgress(100); setPhase('done'); es.close();
      } else if (evt.type === 'error') { setPhase('done'); es.close(); }
    };
    es.onerror = () => { es.close(); setPhase((x) => (x === 'running' ? 'done' : x)); };
  }

  async function openAudit(paymentId) {
    setDrawer({ payment_id: paymentId, audit: null, message: undefined });
    try {
      const a = await getAudit(paymentId, runId);
      setDrawer((d) => (d?.payment_id === paymentId ? { ...d, audit: a.audit } : d));
      const m = await getMessage(paymentId, runId); // may take a moment (LLM)
      setDrawer((d) => (d?.payment_id === paymentId ? { ...d, message: m } : d));
    } catch {
      setDrawer((d) => (d?.payment_id === paymentId ? { ...d, audit: d.audit || [], message: { applicable: false } } : d));
    }
  }

  async function doEval() {
    if (!runId) return;
    setBusy('Running held-out diagnosis eval…');
    try { setEvalResult(await runEval(runId, 15)); }
    finally { setBusy(''); }
  }

  // During the run, show the live SSE counters; once the batch completes, use
  // the authoritative report so the final numbers are exact.
  const liveRecRate = amountAttempted ? (metrics.recovered / amountAttempted) * 100 : 0;
  const liveEscRate = payments.length ? (metrics.escalated / payments.length) * 100 : 0;
  const v = {
    recovered: report ? report.amount_recovered : metrics.recovered,
    recoveredCount: report ? report.recovered_count : metrics.recoveredCount,
    escalated: report ? report.escalated_count : metrics.escalated,
    actions: report ? (report.recovered_count + report.failed_count + report.escalated_count + report.no_action_count) : metrics.actionsTaken,
    recRate: report ? report.recovery_rate_pct : liveRecRate,
    escRate: report ? report.escalation_rate_pct : liveEscRate,
  };

  const causeBreakdown = useMemo(() => {
    const m = new Map();
    for (const p of payments) {
      const key = p.root_cause || p.failure_code || 'unknown';
      if (!m.has(key)) m.set(key, { key, amount: 0, count: 0, recovered: 0 });
      const e = m.get(key); e.amount += p.amount; e.count++; e.recovered += p.recovered_amount || 0;
    }
    return [...m.values()].sort((a, b) => b.amount - a.amount);
  }, [payments]);

  const guardrailHits = useMemo(() => feed.filter((p) => p.stopping_rule).slice(0, 40), [feed]);
  const dbDown = health && health.db === false;

  return (
    <div className="app">
      <Header health={health} theme={theme} onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} />
      {dbDown && (
        <div className="banner-warn">
          ⚠ Postgres not connected. Add <code>PGPASSWORD</code> to <code>server/.env</code> and run
          <code> npm run setup</code> in <code>/server</code>, then reload.
        </div>
      )}

      <Hero attempted={amountAttempted} count={payments.length} recovered={v.recovered} recCount={v.recoveredCount} recRate={v.recRate} hasRun={!!report} />
      <FlowStrip />

      <div className="controls">
        <button className="btn-run" onClick={run} disabled={phase === 'running' || !runId}>
          {phase === 'running' ? (<><span className="spinner" /> Recovering…</>) : '▶  Run Recovery Batch'}
        </button>
        <button className="btn-ghost" onClick={newBatch} disabled={phase === 'running' || busy}>↻ New batch</button>
        <button className="btn-ghost" onClick={doEval} disabled={phase === 'running' || busy}>◈ Diagnosis eval</button>
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
      {busy && <div className="busy">{busy}</div>}

      <div className="kpi-groups">
        <div className="kpi-group">
          <div className="kpi-group-title">💰 The outcome</div>
          <div className="kpi-row two">
            <Kpi label="Recovered" tip="Money the agent won back, resolved to a final outcome across the batch." value={<Money value={v.recovered} />} sub={<><Num value={v.recoveredCount} /> payments</>} tone="good" big />
            <Kpi label="Recovery rate" tip="Recovered ÷ attempted, using the WHOLE batch as the denominator (including escalated and failed) — not cherry-picked." value={fmtPct(v.recRate)} sub="of whole batch" tone="good" />
          </div>
        </div>
        <div className="kpi-group">
          <div className="kpi-group-title">🛡 The safeguards</div>
          <div className="kpi-row four">
            <Kpi label="At risk" tip="Total value of all failed payments in this batch before any recovery." value={fmtMoney(amountAttempted)} sub={`${payments.length} payments`} tone="risk" />
            <Kpi label="Escalated" tip="Share sent to a human (risky, unknown, high-value, or retry-cap). Non-zero proves the guardrails actually act." value={fmtPct(v.escRate)} sub={<><Num value={v.escalated} /> to human</>} tone="manual" />
            <Kpi label="Diagnosis acc." tip="Agreement with the true failure code on the 177 coded rows. Blank rows are handled by honest abstention." value={report?.diagnosis_accuracy_pct != null ? fmtPct(report.diagnosis_accuracy_pct) : '—'} sub={report ? `${report.coded_rows} coded` : 'run a batch'} tone="neutral" />
            <Kpi label="Actions" tip="Bounded interventions performed — every one from a fixed allow-list, never freeform." value={<Num value={v.actions} />} sub="bounded" tone="mute" />
          </div>
        </div>
      </div>

      <div className="grid">
        <section className="panel triage">
          <div className="panel-head">
            <div>
              <h2>Triage <span className="muted">· {payments.length} payments</span></h2>
              <div className="section-sub">Every failed payment, its diagnosis, and what the agent did. Click a row for the full trail.</div>
            </div>
            <Legend />
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr>
                <th>Payment</th><th>Tier</th><th>Method</th><th className="r">Amount</th>
                <th>Diagnosis</th><th className="c">Retry</th><th>Action</th><th>Status</th>
              </tr></thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.payment_id} className={p.status === 'recovered' ? 'row-recovered' : ''} onClick={() => openAudit(p.payment_id)}>
                    <td className="mono dim">{p.payment_id}</td>
                    <td><span className={`tier tier-${p.customer_tier}`}>{p.customer_tier}</span></td>
                    <td className="dim">{p.payment_method}</td>
                    <td className="r mono">{fmtMoney(p.amount)}</td>
                    <td>
                      {p.root_cause
                        ? <><CauseTag cause={p.root_cause} /> <span className="dim small">{ROOT_CAUSE_LABEL[p.root_cause] || p.root_cause}</span>
                            {p.diagnosis_confidence != null && <span className="conf mono">{Math.round(p.diagnosis_confidence * 100)}%</span>}</>
                        : <span className="dim small">{p.failure_code || '—'}</span>}
                    </td>
                    <td className="c mono">{p.retry_count}</td>
                    <td>{p.action ? <span className="act">{ACTION_LABEL[p.action] || p.action}</span> : <span className="dim">—</span>}</td>
                    <td><StatusBadge status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Agent decision log</h2>
              <div className="section-sub">What each agent decided, live — newest first.</div>
            </div>
            <span className="muted mono">{feed.length}</span>
          </div>
          <div className="feed">
            {feed.length === 0 && <div className="empty">Run a batch to watch Diagnoser → Strategist → Executor decide each payment. Click any row for its full audit trail.</div>}
            {feed.map((p) => (
              <div key={p.payment_id} className={`audit-row ar-${p.status}`} onClick={() => openAudit(p.payment_id)}>
                <div className="ar-top">
                  <span className="ar-action">{ACTION_LABEL[p.action] || p.action}</span>
                  {p.action === 'send_payment_link' && <span className="ar-msg" title="AI writes a Hinglish message — click to view">✉</span>}
                  <StatusBadge status={p.status} />
                  {p.diagnosis_source?.startsWith('ai') && <span className="ar-ai">AI</span>}
                  {p.simulated && <span className="ar-sim">sim</span>}
                  <span className="ar-amt mono">{fmtMoney(p.amount)}</span>
                </div>
                <div className="ar-mid"><span className="mono dim">{p.payment_id}</span> · <CauseTag cause={p.root_cause} /> {ROOT_CAUSE_LABEL[p.root_cause] || p.root_cause}
                  {p.stopping_rule && <span className={`rule-tag rule-${p.stopping_rule.toLowerCase()}`}>{RULE_LABEL[p.stopping_rule] || p.stopping_rule}</span>}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid grid-lower">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>At-risk amount by root cause</h2>
              <div className="section-sub">Where the money is — green shows how much of each was recovered.</div>
            </div>
          </div>
          <div className="bars">
            {causeBreakdown.map((d) => (
              <div className="bar-row" key={d.key}>
                <div className="bar-label"><CauseTag cause={d.key} /> {ROOT_CAUSE_LABEL[d.key] || d.key} <span className="dim small">· {d.count}</span></div>
                <div className="bar-track">
                  <div className={`bar-fill fill-${ROOT_CAUSE_CAT[d.key] || 'ambiguous'}`} style={{ width: `${(d.amount / (causeBreakdown[0]?.amount || 1)) * 100}%` }} />
                  {d.recovered > 0 && <div className="bar-recovered" style={{ width: `${(d.recovered / (causeBreakdown[0]?.amount || 1)) * 100}%` }} />}
                </div>
                <div className="bar-val mono">{fmtMoney(d.amount)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Compliance & stopping rules</h2>
              <div className="section-sub">The guardrails that keep the agent safe — and them firing, live.</div>
            </div>
            <span className="muted">audit-ready</span>
          </div>
          {policy && <PolicyStrip policy={policy.policy} />}
          <div className="guardrail-feed">
            {guardrailHits.length === 0 && <div className="empty small">Stopping-rule activations (retry cap, high-value sign-off, risky, unknown, below-threshold) appear here during a run.</div>}
            {guardrailHits.map((p) => (
              <div className="grow-row" key={p.payment_id} onClick={() => openAudit(p.payment_id)}>
                <span className={`rule-tag rule-${p.stopping_rule?.toLowerCase()}`}>{RULE_LABEL[p.stopping_rule] || p.stopping_rule}</span>
                <span className="mono dim">{p.payment_id}</span>
                <span className="grow-reason">{fmtMoney(p.amount)} → {ACTION_LABEL[p.action]}</span>
              </div>
            ))}
          </div>
          {evalResult && (
            <div className="eval-box">
              <b>Blank-inference probe</b> — hid codes on {evalResult.sample_size} rows: abstained {evalResult.abstained}, committed {evalResult.confident_correct + evalResult.confident_wrong} ({evalResult.confident_correct} correct). No confident-wrong safety: <b>{evalResult.safe_rate_pct}%</b>.
              <div className="eval-note">{evalResult.note}</div>
            </div>
          )}
        </section>
      </div>

      <footer className="foot">
        AI Revenue Recovery · Razorpay Buildathon Track 03 — detect → diagnose → decide → execute → recover, with compliant escalation, stopping rules, and a full Postgres audit trail.
      </footer>

      {drawer && <AuditDrawer data={drawer} onClose={() => setDrawer(null)} />}
    </div>
  );
}

function Header({ health, theme, onToggleTheme }) {
  const badges = [
    ['DB', health?.db, health?.db ? 'Postgres' : 'no DB'],
    ['AI', health?.aiEnabled, health?.aiEnabled ? shortModel(health.model) : 'rules-only'],
    ['Pay', health?.razorpay, health?.razorpay ? 'Razorpay test' : 'mock'],
  ];
  return (
    <header className="hdr">
      <div className="brand">
        <div className="logo">₹</div>
        <div>
          <div className="brand-name">AI Revenue Recovery</div>
          <div className="brand-sub">Failed-payment recovery agent · Track 03</div>
        </div>
      </div>
      <div className="hdr-right">
        {badges.map(([k, on, txt]) => (
          <div key={k} className={`ai-badge ${on ? 'ai-on' : 'ai-off'}`}><span className="dot" />{k}: {txt}</div>
        ))}
        <button className="theme-toggle tip" data-tip={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} onClick={onToggleTheme} aria-label="Toggle theme">
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </div>
    </header>
  );
}
const shortModel = (m) => (m || '').split('/').pop();

function Hero({ attempted, count, recovered, recCount, recRate, hasRun }) {
  return (
    <section className="hero">
      <div>
        <h1 className="hero-title">Find failed payments and <span className="hl">win the revenue back</span>—automatically.</h1>
        <p className="hero-sub">
          An AI agent reads a batch of {count || 185} failed payments, diagnoses why each one failed,
          decides a safe recovery action, executes it, and proves the money recovered—with a full
          audit trail behind every decision. {hasRun ? '' : 'Press “Run Recovery Batch” to watch it work.'}
        </p>
      </div>
      <div className="hero-metric">
        <div className="hero-metric-label">Revenue recovered</div>
        <div className="hero-metric-value"><Money value={recovered} /></div>
        <div className="hero-metric-sub">
          {hasRun ? <><b>{recRate?.toFixed(1)}%</b> of <b>{fmtMoney(attempted)}</b> at risk · <Num value={recCount} /> payments</>
                  : <>of {fmtMoney(attempted)} at risk across {count} payments</>}
        </div>
      </div>
    </section>
  );
}

function FlowStrip() {
  const steps = [
    ['Step 1', '🔍', 'Diagnoser', 'Reads each failed payment and finds the root cause, with a confidence score. Abstains instead of guessing when unsure.'],
    ['Step 2', '🧭', 'Strategist', 'Picks one recovery action from a fixed list and applies the stopping rules (retry caps, high-value sign-off, escalation).'],
    ['Step 3', '⚡', 'Executor', 'Runs the action — a real Razorpay payment link or a retry — records the outcome, and logs every step.'],
  ];
  return (
    <div className="flow">
      {steps.map(([num, ico, name, desc]) => (
        <div className="flow-step" key={name}>
          <div className="flow-num">{num}</div>
          <div className="flow-name"><span className="flow-ico">{ico}</span>{name}</div>
          <div className="flow-desc">{desc}</div>
        </div>
      ))}
    </div>
  );
}

function Kpi({ label, value, sub, tone, big, tip }) {
  return (
    <div className={`kpi kpi-${tone} ${big ? 'kpi-big' : ''}`}>
      <div className="kpi-label">
        {label}
        {tip && <span className="tip tip-i" data-tip={tip}>?</span>}
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  );
}

function PolicyStrip({ policy }) {
  if (!policy) return null;
  const s = policy.currencySymbol || '₹';
  const items = [
    ['Max retries', policy.maxRetries ?? '—'],
    ['Retry backoff', `${policy.retryDelayHours ?? '—'}h`],
    ['High-value sign-off', `${s}${(policy.highValueThreshold ?? 0).toLocaleString('en-IN')}`],
    ['Min pursue', `${s}${policy.minPursueAmount ?? '—'}`],
  ];
  return <div className="policy-strip">{items.map(([k, v]) => <div className="pol" key={k}><span className="pol-k">{k}</span><span className="pol-v mono">{v}</span></div>)}</div>;
}

function Legend() {
  return (
    <div className="legend">
      <span><i className="dot d-soft" /> Transient</span>
      <span><i className="dot d-action" /> Action</span>
      <span><i className="dot d-hard" /> Risk</span>
      <span><i className="dot d-amb" /> Ambiguous</span>
    </div>
  );
}

function AuditDrawer({ data, onClose }) {
  const AGENT_META = { diagnoser: ['Diagnoser', '#38bdf8'], strategist: ['Strategist', '#d4a25a'], executor: ['Executor', '#34d399'] };
  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div><div className="drawer-title">Audit trail</div><div className="mono dim">{data.payment_id}</div></div>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>
        <div className="drawer-body">
          {!data.audit && <div className="empty">Loading…</div>}
          {data.audit?.length === 0 && <div className="empty">No audit entries (run the batch first).</div>}
          {data.audit?.map((a) => {
            const [name, color] = AGENT_META[a.agent] || [a.agent, '#8b97ad'];
            return (
              <div className="trail" key={a.id}>
                <div className="trail-dot" style={{ background: color }} />
                <div className="trail-body">
                  <div className="trail-top"><span className="trail-agent" style={{ color }}>{name}</span>
                    <span className="trail-out mono">{a.output}</span>
                    {a.confidence != null && <span className="trail-conf">{Math.round(a.confidence * 100)}%</span>}
                    {a.simulated && <span className="ar-sim">sim</span>}
                  </div>
                  <div className="trail-reason">{a.reasoning}</div>
                </div>
              </div>
            );
          })}

          {data.audit && <MessageCard message={data.message} />}
        </div>
      </div>
    </div>
  );
}

function MessageCard({ message }) {
  // message: undefined = still loading; {applicable:false} = not a customer msg
  if (message === undefined) {
    return (
      <div className="msg-card">
        <div className="msg-head">✉ Message to customer <span className="msg-gen"><span className="spinner-sm" /> writing…</span></div>
      </div>
    );
  }
  if (!message?.applicable) {
    return (
      <div className="msg-card msg-na">
        <div className="msg-head">✉ Message to customer</div>
        <div className="msg-na-text">No customer message — this action was a {message?.action === 'escalate_to_human' ? 'human hand-off' : message?.action === 'no_action' ? 'no-op' : 'silent retry'}, not an outreach.</div>
      </div>
    );
  }
  const isAi = String(message.source || '').startsWith('ai');
  return (
    <div className="msg-card">
      <div className="msg-head">
        ✉ Message to customer · Hinglish
        <span className={isAi ? 'msg-ai' : 'msg-tpl'}>{isAi ? 'AI-written' : 'template'}</span>
      </div>
      <div className="msg-bubble">{message.message}</div>
    </div>
  );
}
