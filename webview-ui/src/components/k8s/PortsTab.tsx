/**
 * Pod → Ports: a port on this pod, on this machine.
 *
 * Drawn to the plan's mock: what is forwarded now, the ports the pod declares
 * (each with a guessed role and a local port that defaults to the same
 * number), the Services that route here, and Another port… for one the image
 * listens on without declaring it.
 *
 * Starting asks the host whether the local port is free. When it is not, or
 * the cluster is production, a dialog comes first: which process holds the
 * port and the next free one; or what forwarding into production means.
 */
import { useEffect, useMemo, useState } from 'react';
import { ModalView, SkeletonView } from '@salilvnair/dui';
import { useK8sStore } from '../../store/k8s-store';
import {
  usePortForwardStore, forwardsFor, isUp, isProdContext, podPortsKey,
  type PodPorts, type PortCheck, type ForwardPort, type PortRole,
} from '../../store/dk8s-port-forward-store';
import { ForwardCard } from './ForwardCard';
import { PortForwardIcon } from '../../icons';
import { PF, PfButton, StatePill, RoleChip, PfHeading, PfCheck, PfBar } from './pf-ui';

const portOf = (s: string) => { const n = Number(s); return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : undefined; };

/** The mock's row: name · port · protocol · role · → local · action. */
const ROW: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '120px 80px 56px minmax(90px, 1fr) 118px 96px',
  gap: 10, alignItems: 'center', padding: '7px 10px', borderRadius: 8, border: `1px solid ${PF.bd}`, background: PF.panel,
};
const LIVE: React.CSSProperties = { borderColor: `color-mix(in srgb, ${PF.ok} 40%, ${PF.bd})`, background: `color-mix(in srgb, ${PF.ok} 5%, ${PF.panel})` };
const NOTE: React.CSSProperties = { fontSize: 11, color: PF.mu };

function LocalBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const ok = !!portOf(value);
  return (
    <span className="flex items-center" style={{ gap: 6, fontFamily: PF.mono, fontSize: 11.5, color: PF.mu }}>
      →
      <input value={value} inputMode="numeric" aria-label={label}
             onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 5))}
             className="outline-none"
             style={{ width: 66, padding: '2px 8px', borderRadius: 6, fontFamily: PF.mono, fontSize: 11.5, color: PF.tx,
                      border: `1px solid ${ok ? PF.bd : PF.er}`, background: PF.well }} />
    </span>
  );
}

/** The start dialog's question: which ports, whether any local one is taken, whether it is production. */
interface Pending { ports: ForwardPort[]; checks: PortCheck[]; prod: boolean }

export function PortsTab() {
  const detail = useK8sStore(s => s.detail);
  const forwards = usePortForwardStore(s => s.forwards);
  /* What was read last time, drawn at once; the re-read below updates it quietly. */
  const cached = usePortForwardStore(s => (detail?.context
    ? s.portsByPod[podPortsKey({ context: detail.context, namespace: detail.namespace, pod: detail.name })] : undefined));
  const [fresh, setFresh] = useState<PodPorts>();
  const info = fresh ?? cached;
  const [locals, setLocals] = useState<Record<string, string>>({});
  const [another, setAnother] = useState<string>();
  const [pending, setPending] = useState<Pending>();
  const [busy, setBusy] = useState(false);

  const podKey = detail ? `${detail.context}/${detail.namespace}/${detail.name}` : '';
  useEffect(() => { usePortForwardStore.getState().refresh(); }, []);
  useEffect(() => {
    if (!detail?.context) return;
    let live = true;
    setFresh(undefined); setLocals({}); setAnother(undefined);
    void usePortForwardStore.getState().loadPorts({ context: detail.context, namespace: detail.namespace, pod: detail.name })
      .then(r => { if (live && (r.error ? !cached : true)) setFresh(r); });
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podKey]);

  const mine = useMemo(() => (detail ? forwardsFor(forwards, detail) : []), [forwards, detail]);
  const up = mine.filter(isUp);
  const finished = mine.filter(f => !isUp(f)).slice(0, 3);
  /** remote port → the local one it is forwarded to right now. */
  const forwarded = new Map<number, number>();
  up.forEach(f => f.ports.forEach(p => forwarded.set(p.remote, p.local)));

  if (!detail?.context) return null;
  const phase = info?.phase ?? detail.phase;
  const running = phase === 'Running';
  const prod = isProdContext(detail.context);
  const declared = info?.ports ?? [];
  const declaredNumbers = new Set(declared.map(p => p.port));
  const localFor = (remote: number) => locals[String(remote)] ?? String(forwarded.get(remote) ?? remote);
  const setLocal = (remote: number) => (v: string) => setLocals(l => ({ ...l, [String(remote)]: v }));

  async function begin(ports: ForwardPort[]) {
    if (!detail?.context || busy) return;
    setBusy(true);
    try {
      const checks = await usePortForwardStore.getState().check(ports.map(p => p.local));
      const taken = checks.filter(c => !c.free);
      const adjusted = ports.map(p => {
        const c = checks.find(x => x.port === p.local);
        return c && !c.free && c.suggestion ? { ...p, local: c.suggestion } : p;
      });
      if (!taken.length && !prod) { go(adjusted); return; }
      setPending({ ports: adjusted, checks, prod });
    } finally {
      setBusy(false);
    }
  }
  function go(ports: ForwardPort[]) {
    if (!detail?.context) return;
    usePortForwardStore.getState().start({ context: detail.context, namespace: detail.namespace, pod: detail.name, workload: detail.workload, ports });
    setPending(undefined);
    setAnother(undefined);
  }

  const cannot = !running
    ? phase === 'Succeeded' || phase === 'Completed'
      ? 'A finished run has nothing listening to forward to.'
      : `The pod is ${phase ?? 'not running'} — a forward needs a running pod.`
    : undefined;

  const forwardButton = (remote: number, name: string | undefined, role: PortRole, udp = false) => {
    const local = portOf(localFor(remote));
    return (
      <PfButton tone="dk" icon={<PortForwardIcon size={12} />} style={{ justifySelf: 'end' }}
                disabled={!!cannot || udp || !local || busy}
                title={udp ? 'kubectl can forward TCP only' : cannot ?? (local ? `Forward ${remote} to localhost:${local}` : 'Pick a local port between 1 and 65535')}
                onClick={() => local && begin([{ local, remote, name, role }])}>
        Forward
      </PfButton>
    );
  };

  const anotherPort = portOf(another ?? '');

  return (
    <div className="h-full overflow-auto">
      <div className="flex flex-col" style={{ gap: 12, padding: '12px 14px', maxWidth: 880 }}>
        {prod && <PfBar tone="er"><b>{detail.context}</b> is production. A forward from here asks first, and stops on its own after an hour.</PfBar>}

        {(up.length > 0 || finished.length > 0) && (
          <div className="flex flex-col" style={{ gap: 8 }}>
            <PfHeading>Forwarding now</PfHeading>
            {[...up, ...finished].map(f => <ForwardCard key={f.id} f={f} />)}
          </div>
        )}

        <div className="flex flex-col" style={{ gap: 6 }}>
          <PfHeading>Ports this pod declares</PfHeading>
          {!info ? (
            [0, 1].map(i => <SkeletonView key={i} height={38} />)
          ) : info.error ? (
            <div style={{ fontSize: 12, color: PF.er }}>{info.error}</div>
          ) : declared.length === 0 ? (
            <div style={{ fontSize: 12, color: PF.mu }}>This pod declares no ports. If you know one it listens on, use Another port below.</div>
          ) : declared.map(p => {
            const on = forwarded.has(p.port);
            const udp = p.protocol.toUpperCase() !== 'TCP';
            return (
              <div key={`${p.container}:${p.port}`} style={{ ...ROW, ...(on ? LIVE : {}) }}>
                <span className="truncate" style={{ fontFamily: PF.mono, fontSize: 12, color: p.name ? PF.tx : PF.mu }} title={`container ${p.container}`}>
                  {p.name ?? 'unnamed'}
                </span>
                <span style={{ fontFamily: PF.mono, fontSize: 12, color: PF.dk }}>{p.port}</span>
                <span style={{ fontSize: 11, color: udp ? PF.wa : PF.mu }} title={udp ? 'kubectl cannot forward UDP' : undefined}>{p.protocol}</span>
                <RoleChip role={p.role} />
                {on
                  ? <span style={{ fontFamily: PF.mono, fontSize: 11.5, color: PF.ok }}>→ {forwarded.get(p.port)}</span>
                  : <LocalBox value={localFor(p.port)} onChange={setLocal(p.port)} label={`Local port for ${p.port}`} />}
                {on
                  ? <span style={{ justifySelf: 'end' }}><StatePill tone="ok">forwarding</StatePill></span>
                  : forwardButton(p.port, p.name, p.role, udp)}
              </div>
            );
          })}
        </div>

        {info && !info.error && (info.services.length > 0 || info.servicesError) && (
          <div className="flex flex-col" style={{ gap: 6 }}>
            <PfHeading>Services that route here</PfHeading>
            {info.servicesError && <div style={NOTE}>{info.servicesError}</div>}
            {info.services.map(s => {
              const target = s.containerPort;
              const same = target !== undefined && (declaredNumbers.has(target) || forwarded.has(target));
              return (
                <div key={`${s.service}:${s.port}`} style={ROW}>
                  <span className="truncate" style={{ fontFamily: PF.mono, fontSize: 12, color: PF.tx }} title={`svc/${s.service}`}>svc/{s.service}</span>
                  <span style={{ fontFamily: PF.mono, fontSize: 12, color: PF.dk }}>{s.port}→{target ?? s.targetPort}</span>
                  <span style={{ fontSize: 11, color: PF.mu }}>TCP</span>
                  <RoleChip text={s.type} />
                  {target !== undefined && !same ? <LocalBox value={localFor(target)} onChange={setLocal(target)} label={`Local port for ${target}`} /> : <span />}
                  {target === undefined ? <span style={{ ...NOTE, justifySelf: 'end' }}>not resolved</span>
                    : same ? <span style={{ ...NOTE, justifySelf: 'end', whiteSpace: 'nowrap' }}>same port as above</span>
                      : forwardButton(target, s.name ?? s.service, 'http')}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center flex-wrap" style={{ gap: 8 }}>
          {another === undefined ? (
            <PfButton onClick={() => setAnother('')} disabled={!!cannot}>✚ Another port…</PfButton>
          ) : (
            <>
              <input autoFocus value={another} inputMode="numeric" placeholder="port" aria-label="Another port to forward"
                     onChange={e => setAnother(e.target.value.replace(/\D/g, '').slice(0, 5))}
                     onKeyDown={e => {
                       if (e.key === 'Escape') setAnother(undefined);
                       if (e.key === 'Enter' && anotherPort) void begin([{ local: anotherPort, remote: anotherPort, role: '' }]);
                     }}
                     className="outline-none"
                     style={{ width: 80, height: 24, padding: '0 8px', borderRadius: 6, fontFamily: PF.mono, fontSize: 11.5, color: PF.tx, border: `1px solid ${PF.bd}`, background: PF.well }} />
              <PfButton tone="dk" icon={<PortForwardIcon size={12} />} disabled={!anotherPort || busy}
                        onClick={() => anotherPort && begin([{ local: anotherPort, remote: anotherPort, role: '' }])}>
                Forward
              </PfButton>
              <PfButton tone="ghost" onClick={() => setAnother(undefined)}>Cancel</PfButton>
            </>
          )}
          <span style={NOTE}>Any port the container listens on, declared or not.</span>
        </div>

        {cannot && <div style={{ fontSize: 12, color: PF.wa }}>{cannot}</div>}
      </div>

      {pending && (
        <StartDialog pod={detail.name} workload={detail.workload?.name} context={detail.context} pending={pending}
                     onCancel={() => setPending(undefined)} onGo={go} />
      )}
    </div>
  );
}

function StartDialog({ pod, workload, context, pending, onCancel, onGo }: {
  pod: string; workload?: string; context: string; pending: Pending; onCancel: () => void; onGo: (ports: ForwardPort[]) => void;
}) {
  const [ports, setPorts] = useState(pending.ports);
  const taken = pending.checks.filter(c => !c.free);
  const valid = ports.every(p => p.local >= 1 && p.local <= 65535) && new Set(ports.map(p => p.local)).size === ports.length;
  const localLabel = ports.map(p => p.local).join(', ');

  const title = pending.prod
    ? <span className="flex items-center" style={{ gap: 8 }}><span style={{ color: PF.er }}>▲</span>Forward to production?</span>
    : <span>Forward <span style={{ fontFamily: PF.mono, color: PF.dk }}>{ports.map(p => p.remote).join(', ')}</span> from {workload ?? pod}</span>;

  return (
    <ModalView
      open
      onClose={onCancel}
      size="sm"
      title={title}
      footerRight={
        <div style={{ display: 'flex', gap: 8 }}>
          <PfButton onClick={onCancel}>Cancel</PfButton>
          <PfButton tone={pending.prod ? 'danger' : 'solid'} disabled={!valid} onClick={() => onGo(ports)}>
            {pending.prod ? 'Forward to production' : `Forward on ${localLabel}`}
          </PfButton>
        </div>
      }
    >
      <div className="flex flex-col" style={{ gap: 10, fontSize: 12.5, color: PF.mu }}>
        {pending.prod && (
          <>
            <PfBar tone="er"><b>{context}</b> is marked as production.</PfBar>
            <p style={{ margin: 0 }}>
              Anything on this machine that calls <b style={{ color: PF.tx, fontFamily: PF.mono }}>localhost:{localLabel}</b> will
              reach <b style={{ color: PF.tx, fontFamily: PF.mono }}>{pod}</b> in production — including tests and load tools you forget are pointed there.
            </p>
            <PfCheck>Stop it after <b style={{ color: PF.tx }}>60 minutes</b></PfCheck>
            <PfCheck>Only this machine (127.0.0.1)</PfCheck>
          </>
        )}
        {taken.map(c => {
          /* The host answers in the order the ports were asked about. */
          const idx = pending.checks.indexOf(c);
          return (
            <div key={c.port} className="flex flex-col" style={{ gap: 10 }}>
              <PfBar tone="wa">
                <b style={{ fontFamily: PF.mono }}>localhost:{c.port}</b> is taken{c.holder ? <> — by <b>{c.holder.name ?? 'a process'}</b>{c.holder.pid ? ` (PID ${c.holder.pid})` : ''}</> : ''}.
              </PfBar>
              {idx >= 0 && (
                <label className="flex flex-col" style={{ gap: 4 }}>
                  <span style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: PF.mu }}>Local port</span>
                  <input value={String(ports[idx].local || '')} inputMode="numeric" aria-label={`Local port instead of ${c.port}`}
                         onChange={e => {
                           const n = Number(e.target.value.replace(/\D/g, '').slice(0, 5));
                           setPorts(ps => ps.map((p, j) => (j === idx ? { ...p, local: n } : p)));
                         }}
                         className="outline-none"
                         style={{ padding: '6px 9px', borderRadius: 7, fontFamily: PF.mono, fontSize: 12, color: PF.tx, border: `1px solid ${PF.bd}`, background: PF.well }} />
                </label>
              )}
              <p style={{ margin: 0 }}>
                {c.suggestion ? 'The next free port.' : 'No free port nearby — type one.'} Keep <b style={{ color: PF.tx }}>{c.port}</b> by stopping that process first, or use this one.
              </p>
            </div>
          );
        })}
      </div>
    </ModalView>
  );
}

