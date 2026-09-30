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
import { SkeletonView } from '@salilvnair/dui';
import { useK8sStore } from '../../store/k8s-store';
import {
  usePortForwardStore, forwardsFor, isUp, isProdContext, podPortsKey,
  type PodPorts, type ForwardPort, type PortRole,
} from '../../store/dk8s-port-forward-store';
import { ForwardCard } from './ForwardCard';
import { PortForwardIcon } from '../../icons';
import { PF, PfButton, StatePill, RoleChip, PfHeading, PfBar } from './pf-ui';
import { useStartForwards } from './StartForwards';

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
  const { begin: startMany, busy, dialog } = useStartForwards();
  const allPods = useK8sStore(s => s.pods);

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

  /** One forward from this pod — or through one of its Services. */
  function begin(ports: ForwardPort[], service?: string) {
    if (!detail?.context) return;
    setAnother(undefined);
    void startMany([{ context: detail.context, namespace: detail.namespace, pod: detail.name, workload: detail.workload, service, ports }]);
  }

  /* The workload's other pods, for "each replica on its own port". */
  const replicas = detail.workload
    ? allPods.filter(p => p.workload?.kind === detail.workload!.kind && p.workload.name === detail.workload!.name
        && p.namespace === detail.namespace && (p.context ?? '') === (detail.context ?? '') && !p.deleting && p.phase === 'Running')
      .sort((a, b) => a.name.localeCompare(b.name))
    : [];
  const eachPort = declared.find(p => p.role === 'http') ?? declared[0];
  const eachBase = eachPort ? portOf(localFor(eachPort.port)) ?? eachPort.port : 0;

  const cannot = !running
    ? phase === 'Succeeded' || phase === 'Completed'
      ? 'A finished run has nothing listening to forward to.'
      : `The pod is ${phase ?? 'not running'} — a forward needs a running pod.`
    : undefined;

  const forwardButton = (remote: number, name: string | undefined, role: PortRole, udp = false, service?: string, key = String(remote)) => {
    const local = portOf(locals[key] ?? localFor(remote));
    return (
      <PfButton tone="dk" icon={<PortForwardIcon size={12} />} style={{ justifySelf: 'end' }}
                disabled={!!cannot || udp || !local || busy}
                title={udp ? 'kubectl can forward TCP only' : cannot ?? (local ? `Forward ${service ? `svc/${service} ` : ''}${remote} to localhost:${local}` : 'Pick a local port between 1 and 65535')}
                onClick={() => local && begin([{ local, remote, name, role }], service)}>
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

        {replicas.length > 1 && eachPort && (
          <div className="flex items-center flex-wrap" style={{ gap: 8, padding: '8px 10px', borderRadius: 8, border: `1px dashed ${PF.bd}` }}>
            <span style={{ fontSize: 12, color: PF.mu }}>
              <b style={{ color: PF.tx }}>{detail.workload?.name}</b> has {replicas.length} replicas — forward <span style={{ fontFamily: PF.mono, color: PF.dk }}>{eachPort.port}</span> on each,
              on <span style={{ fontFamily: PF.mono, color: PF.tx }}>{replicas.map((_, i) => eachBase + i).join(', ')}</span>, to ask them the same question.
            </span>
            <span className="flex-1" />
            <PfButton tone="dk" icon={<PortForwardIcon size={12} />} disabled={!!cannot || busy}
                      onClick={() => void startMany(replicas.map((r, i) => ({
                        context: detail.context!, namespace: detail.namespace, pod: r.name, workload: detail.workload,
                        ports: [{ local: eachBase + i, remote: eachPort.port, name: eachPort.name, role: eachPort.role }],
                      })))}>
              Each replica
            </PfButton>
          </div>
        )}

        {info && !info.error && (info.services.length > 0 || info.servicesError) && (
          <div className="flex flex-col" style={{ gap: 6 }}>
            <PfHeading>Services that route here</PfHeading>
            {info.servicesError && <div style={NOTE}>{info.servicesError}</div>}
            {info.services.map(s => {
              const target = s.containerPort;
              /* Through the Service, kubectl picks the pod — the card says which one it landed on. */
              const key = `svc:${s.service}:${s.port}`;
              const viaSvc = up.find(f => f.service === s.service && f.ports.some(p => p.remote === s.port));
              const localDefault = String(s.port >= 1024 ? s.port : target ?? s.port + 8000);
              return (
                <div key={key} style={{ ...ROW, ...(viaSvc ? LIVE : {}) }}>
                  <span className="truncate" style={{ fontFamily: PF.mono, fontSize: 12, color: PF.tx }} title={`svc/${s.service}`}>svc/{s.service}</span>
                  <span style={{ fontFamily: PF.mono, fontSize: 12, color: PF.dk }}>{s.port}→{target ?? s.targetPort}</span>
                  <span style={{ fontSize: 11, color: PF.mu }}>TCP</span>
                  <RoleChip text={s.type} />
                  {viaSvc
                    ? <span style={{ fontFamily: PF.mono, fontSize: 11.5, color: PF.ok }}>→ {viaSvc.ports.find(p => p.remote === s.port)?.local}</span>
                    : <LocalBox value={locals[key] ?? localDefault} onChange={v => setLocals(l => ({ ...l, [key]: v }))} label={`Local port for svc/${s.service} ${s.port}`} />}
                  {viaSvc
                    ? <span style={{ justifySelf: 'end' }}><StatePill tone="ok">forwarding</StatePill></span>
                    : forwardButton(s.port, s.name ?? s.service, 'http', false, s.service, key)}
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

      {dialog}
    </div>
  );
}
