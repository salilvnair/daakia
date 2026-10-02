/**
 * The actuator, through a forward — the management port nobody exposes,
 * read from Daakia: health, info, metrics, and the two dumps, each of which
 * lands in the Doctor's analyzer the way a jcmd dump does.
 *
 * It asks the actuator's index which endpoints are on, and says how to turn
 * on the ones that are not, rather than offering buttons that 404.
 */
import { useEffect, useMemo, useState } from 'react';
import { ModalView, SegmentedControlView, SkeletonView } from '@salilvnair/dui';
import { usePortForwardStore, type ForwardInfo } from '../../store/dk8s-port-forward-store';
import { useK8sStore } from '../../store/k8s-store';
import { logUiEvent } from '../../store/ui-audit-store';
import {
  findActuator, parseJson, formatBytes, formatMeasurement, EXPOSE_HINT, type Actuator, type Health,
} from './actuator';
import { targetName } from './forward-snippets';
import { PF, tint, PfButton, PfBar, StatePill } from './pf-ui';

type View = 'health' | 'info' | 'metrics' | 'threads' | 'heap' | 'loggers';
const VIEWS: { id: View; label: string; needs: string }[] = [
  { id: 'health', label: 'Health', needs: 'health' },
  { id: 'info', label: 'Info', needs: 'info' },
  { id: 'metrics', label: 'Metrics', needs: 'metrics' },
  { id: 'threads', label: 'Thread dump', needs: 'threaddump' },
  { id: 'heap', label: 'Heap dump', needs: 'heapdump' },
  { id: 'loggers', label: 'Loggers', needs: 'loggers' },
];

export function ActuatorDialog({ f, onClose }: { f: ForwardInfo; onClose: () => void }) {
  const [act, setAct] = useState<Actuator | { error: string }>();
  const [view, setView] = useState<View>('health');
  useEffect(() => { let live = true; void findActuator(f).then(a => { if (live) setAct(a); }); return () => { live = false; }; }, [f.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const found = act && 'port' in act ? act : undefined;
  const has = (k: string) => !!found?.links.includes(k);

  return (
    <ModalView open onClose={onClose} size="lg"
               title={<span>Actuator <span style={{ fontWeight: 400, color: PF.mu }}>· {targetName(f)}</span></span>}
               subtitle={found ? <span style={{ fontFamily: PF.mono }}>localhost:{found.port}{found.base}</span> : 'Looking for it…'}>
      <div className="flex flex-col" style={{ gap: 12, minHeight: 320, fontSize: 12.5, color: PF.mu }}>
        {!act && <SkeletonView variant="text" lines={6} />}
        {act && 'error' in act && (
          <>
            <PfBar tone="wa">{act.error}</PfBar>
            <p style={{ margin: 0 }}>
              A Spring Boot app serves it at <code>/actuator</code> on its HTTP port, or on <code>management.server.port</code> when that is set —
              forward that port too. The endpoints it lists are the ones in <code>{EXPOSE_HINT.split('=')[0]}</code>.
            </p>
          </>
        )}
        {found && (
          <>
            <SegmentedControlView size="sm" accentColor={PF.dk} value={view} onChange={v => setView(v as View)}
                                  options={VIEWS.map(v => ({ value: v.id, label: v.label }))} />
            {!has(VIEWS.find(v => v.id === view)!.needs)
              ? <NotExposed name={VIEWS.find(v => v.id === view)!.needs} links={found.links} />
              : view === 'health' ? <HealthView f={f} a={found} />
                : view === 'info' ? <JsonView f={f} a={found} path="/info" empty="Nothing in info — set info.* properties, or management.info.env.enabled=true." />
                  : view === 'metrics' ? <MetricsView f={f} a={found} />
                    : view === 'threads' ? <ThreadDumpView f={f} a={found} onDone={onClose} />
                      : view === 'heap' ? <HeapDumpView f={f} a={found} onDone={onClose} />
                        : <LoggersView f={f} onDone={onClose} />}
          </>
        )}
      </div>
    </ModalView>
  );
}

function NotExposed({ name, links }: { name: string; links: string[] }) {
  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      <PfBar tone="wa"><b>{name}</b> is not exposed on this actuator.</PfBar>
      <span>It lists: <span style={{ fontFamily: PF.mono, color: PF.tx }}>{links.join(', ') || 'nothing'}</span>. To add it, set in the app:</span>
      <code style={{ fontFamily: PF.mono, fontSize: 11.5, color: PF.tx, padding: '7px 10px', borderRadius: 8, background: PF.well, border: `1px solid ${PF.bd}`, overflowX: 'auto', whiteSpace: 'pre' }}>{EXPOSE_HINT}</code>
    </div>
  );
}

/** GET a path under the actuator, with a reload. */
function useGet(f: ForwardInfo, a: Actuator, path: string) {
  const [state, setState] = useState<{ loading: boolean; status?: number; body?: string; error?: string }>({ loading: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    setState(s => ({ ...s, loading: true }));
    void usePortForwardStore.getState().call(f, a.port, `${a.base}${path}`).then(r => {
      if (live) setState({ loading: false, status: r.status, body: r.body, error: r.error ?? (r.status && r.status !== 200 ? `The pod answered ${r.status}.` : undefined) });
    });
    return () => { live = false; };
  }, [f.id, a.port, a.base, path, n]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, reload: () => setN(x => x + 1) };
}

const tone = (s?: string) => (s === 'UP' ? 'ok' : s === 'DOWN' || s === 'OUT_OF_SERVICE' ? 'er' : s ? 'wa' : 'mu') as 'ok' | 'er' | 'wa' | 'mu';

function HealthView({ f, a }: { f: ForwardInfo; a: Actuator }) {
  const r = useGet(f, a, '/health');
  /* A DOWN app answers 503 with the same body — that is an answer, not a failure. */
  const h = parseJson<Health>(r.body);
  const [open, setOpen] = useState<string>();
  if (r.loading && !h) return <SkeletonView variant="text" lines={4} />;
  if (!h) return <PfBar tone="er">{r.error ?? 'The answer was not JSON.'}</PfBar>;
  const comps = Object.entries(h.components ?? {});
  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      <div className="flex items-center" style={{ gap: 10 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: tone(h.status) === 'ok' ? PF.ok : tone(h.status) === 'er' ? PF.er : PF.wa }}>{h.status ?? '?'}</span>
        <span>overall{comps.length ? ` · ${comps.length} component${comps.length === 1 ? '' : 's'}` : ' — no components shown (management.endpoint.health.show-components)'}</span>
        <span className="flex-1" />
        <PfButton onClick={r.reload} disabled={r.loading}>{r.loading ? 'Reading…' : 'Refresh'}</PfButton>
      </div>
      <div className="flex flex-col" style={{ gap: 6 }}>
        {comps.map(([name, c]) => (
          <div key={name} style={{ border: `1px solid ${PF.bd}`, borderRadius: 8, background: PF.panel }}>
            <button type="button" onClick={() => setOpen(o => (o === name ? undefined : name))}
                    className="flex items-center w-full cursor-pointer border-none" style={{ gap: 10, padding: '7px 10px', background: 'transparent', color: PF.tx, textAlign: 'left' }}>
              <span style={{ fontFamily: PF.mono, fontSize: 12 }}>{name}</span>
              <span className="flex-1" />
              {c.details || c.components ? <span style={{ fontSize: 10.5, color: PF.mu }}>{open === name ? 'hide' : 'details'}</span> : null}
              <StatePill tone={tone(c.status)}>{c.status ?? '?'}</StatePill>
            </button>
            {open === name && (c.details || c.components) && (
              <pre style={{ margin: 0, padding: '8px 10px', borderTop: `1px solid ${PF.bd}`, fontFamily: PF.mono, fontSize: 11, color: PF.tx, overflowX: 'auto' }}>
                {JSON.stringify(c.details ?? c.components, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function JsonView({ f, a, path, empty }: { f: ForwardInfo; a: Actuator; path: string; empty: string }) {
  const r = useGet(f, a, path);
  const v = parseJson<Record<string, unknown>>(r.body);
  if (r.loading) return <SkeletonView variant="text" lines={4} />;
  if (r.error || !v) return <PfBar tone="er">{r.error ?? 'The answer was not JSON.'}</PfBar>;
  if (!Object.keys(v).length) return <span>{empty}</span>;
  return (
    <pre style={{ margin: 0, padding: '10px 12px', borderRadius: 8, background: PF.well, border: `1px solid ${PF.bd}`, fontFamily: PF.mono, fontSize: 11.5, color: PF.tx, overflow: 'auto', maxHeight: 420 }}>
      {JSON.stringify(v, null, 2)}
    </pre>
  );
}

type Metric = { name: string; description?: string; baseUnit?: string; measurements?: { statistic: string; value: number }[]; availableTags?: { tag: string; values: string[] }[] };

function MetricsView({ f, a }: { f: ForwardInfo; a: Actuator }) {
  const list = useGet(f, a, '/metrics');
  const names = useMemo(() => parseJson<{ names?: string[] }>(list.body)?.names ?? [], [list.body]);
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<string>();
  const shown = names.filter(n => n.toLowerCase().includes(q.toLowerCase()));
  useEffect(() => { if (!pick && names.length) setPick(names.find(n => n === 'jvm.memory.used') ?? names[0]); }, [names, pick]);
  if (list.loading && !names.length) return <SkeletonView variant="text" lines={6} />;
  if (list.error) return <PfBar tone="er">{list.error}</PfBar>;
  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(180px, 240px) minmax(0, 1fr)', gap: 12, minHeight: 300 }}>
      <div className="flex flex-col min-w-0" style={{ gap: 6 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={`Filter ${names.length} metrics`} aria-label="Filter metrics" className="outline-none"
               style={{ padding: '5px 8px', borderRadius: 7, fontSize: 12, color: PF.tx, border: `1px solid ${PF.bd}`, background: PF.well }} />
        <div className="flex flex-col" style={{ overflowY: 'auto', maxHeight: 340, gap: 1 }}>
          {shown.map(n => (
            <button key={n} type="button" onClick={() => setPick(n)} className="pf-row cursor-pointer border-none truncate"
                    style={{ textAlign: 'left', padding: '4px 8px', borderRadius: 6, fontFamily: PF.mono, fontSize: 11.5, color: pick === n ? PF.dk : PF.tx, background: pick === n ? tint(PF.dk, 12) : 'transparent' }}>
              {n}
            </button>
          ))}
        </div>
      </div>
      {pick ? <MetricDetail key={pick} f={f} a={a} name={pick} /> : <span />}
    </div>
  );
}

function MetricDetail({ f, a, name }: { f: ForwardInfo; a: Actuator; name: string }) {
  const r = useGet(f, a, `/metrics/${encodeURIComponent(name)}`);
  const m = parseJson<Metric>(r.body);
  if (r.loading && !m) return <SkeletonView variant="text" lines={3} />;
  if (!m) return <PfBar tone="er">{r.error ?? 'The answer was not JSON.'}</PfBar>;
  return (
    <div className="flex flex-col min-w-0" style={{ gap: 10 }}>
      <div className="flex items-center" style={{ gap: 8 }}>
        <b style={{ fontFamily: PF.mono, color: PF.tx, fontSize: 13 }}>{m.name}</b>
        <span className="flex-1" />
        <PfButton onClick={r.reload} disabled={r.loading}>{r.loading ? 'Reading…' : 'Refresh'}</PfButton>
      </div>
      {m.description && <span>{m.description}</span>}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
        {(m.measurements ?? []).map(x => (
          <div key={x.statistic} className="flex flex-col" style={{ gap: 2, padding: '8px 10px', borderRadius: 8, border: `1px solid ${PF.bd}`, background: PF.panel }}>
            <span style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase' }}>{x.statistic.toLowerCase().replace('_', ' ')}</span>
            <b style={{ fontSize: 16, color: PF.tx, fontVariantNumeric: 'tabular-nums' }}>{formatMeasurement(x.value, m.baseUnit)}</b>
          </div>
        ))}
      </div>
      {!!m.availableTags?.length && (
        <div className="flex flex-col" style={{ gap: 4 }}>
          <span style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase' }}>Tags</span>
          {m.availableTags.map(t => (
            <div key={t.tag} className="flex flex-wrap items-center" style={{ gap: 4 }}>
              <span style={{ fontFamily: PF.mono, fontSize: 11, color: PF.tx, marginRight: 4 }}>{t.tag}</span>
              {t.values.slice(0, 12).map(v => <StatePill key={v} tone="mu">{v}</StatePill>)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ThreadDumpView({ f, a, onDone }: { f: ForwardInfo; a: Actuator; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const take = async () => {
    setBusy(true); setError(undefined);
    logUiEvent('dk8s.pf_dump', { kind: 'threaddump', prod: f.prod });
    const r = await usePortForwardStore.getState().dump(f, a.port, 'threaddump', a.base);
    setBusy(false);
    if (r.file) onDone(); else setError(r.error ?? 'No thread dump came back.');
  };
  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      <p style={{ margin: 0 }}>
        Every thread's stack, right now — read from <code>{a.base}/threaddump</code> as text, saved with the Doctor's artifacts, and opened in the
        thread analyzer: deadlocks, blocked threads, what the pool is waiting on. The JVM does not pause for this.
      </p>
      {error && <PfBar tone="er">{error}</PfBar>}
      <div><PfButton tone="solid" disabled={busy} onClick={() => void take()}>{busy ? 'Taking it…' : 'Take a thread dump'}</PfButton></div>
    </div>
  );
}

function HeapDumpView({ f, a, onDone }: { f: ForwardInfo; a: Actuator; onDone: () => void }) {
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reqId, setReqId] = useState<string>();
  const [error, setError] = useState<string>();
  const written = usePortForwardStore(s => (reqId ? s.dumpBytes[reqId] : undefined));
  const used = useGet(f, a, '/metrics/jvm.memory.used');
  const heap = parseJson<Metric>(used.body)?.measurements?.[0]?.value;
  const take = async () => {
    setBusy(true); setError(undefined);
    logUiEvent('dk8s.pf_dump', { kind: 'heapdump', prod: f.prod });
    const r = await usePortForwardStore.getState().dump(f, a.port, 'heapdump', a.base, setReqId);
    setBusy(false);
    if (r.file) onDone(); else setError(r.error ?? 'No heap dump came back.');
  };
  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      {f.prod && <PfBar tone="er"><b>{f.context}</b> is production. Its JVM stops while the dump is written.</PfBar>}
      <PfBar tone="wa">
        A heap dump <b>pauses the application</b> while it is written — seconds for a small heap, longer for a big one — and is written to the pod's
        temp directory before it comes down{heap ? <>, about <b>{formatBytes(heap)}</b> here</> : ''}.
      </PfBar>
      <p style={{ margin: 0 }}>It is saved with the Doctor's artifacts and opened in the heap analyzer: what is holding memory, and why it is not freed.</p>
      <label className="flex items-center cursor-pointer" style={{ gap: 8, color: PF.tx }}>
        <input type="checkbox" checked={sure} onChange={e => setSure(e.target.checked)} />
        Pause {targetName(f)} and take the dump
      </label>
      {error && <PfBar tone="er">{error}</PfBar>}
      <div className="flex items-center" style={{ gap: 10 }}>
        <PfButton tone={f.prod ? 'danger' : 'solid'} disabled={!sure || busy} onClick={() => void take()}>{busy ? 'Taking it…' : 'Take a heap dump'}</PfButton>
        {busy && <span style={{ fontVariantNumeric: 'tabular-nums' }}>{written ? `${formatBytes(written)} down` : 'Waiting for the JVM to write it…'}</span>}
      </div>
    </div>
  );
}

function LoggersView({ f, onDone }: { f: ForwardInfo; onDone: () => void }) {
  const open = () => {
    const s = useK8sStore.getState();
    const pod = s.pods.find(p => p.name === f.pod && p.namespace === f.namespace && (!p.context || p.context === f.context))
      ?? (s.detail?.name === f.pod ? s.detail : undefined);
    if (pod) {
      if (s.detail?.name !== pod.name) s.openDetail(pod);
      useK8sStore.getState().setDetailTab('loggers');
      usePortForwardStore.getState().setPanelOpen(false);
    }
    onDone();
  };
  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      <p style={{ margin: 0 }}>
        While this forward is up, the pod's <b>Loggers</b> tab can change a level on the running app — turn a logger to DEBUG for ten minutes, and it
        goes back on its own. No redeploy.
      </p>
      <div><PfButton tone="dk" onClick={open}>Open {f.pod.slice(-14)}'s Loggers tab</PfButton></div>
    </div>
  );
}
