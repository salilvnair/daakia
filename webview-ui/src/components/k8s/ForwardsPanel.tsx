/**
 * Every forward, from the pods page.
 *
 * A "⇄ 3 forwarding" chip in the stats row, the Forwards panel it opens along
 * the right edge, and a small badge on each forwarded pod's card. A tunnel
 * into a cluster should never be something you forgot was open, so the chip
 * is there whenever one is.
 *
 * The panel draws each forward as what it is — a tunnel: this machine on one
 * end, the pod's port on the other, the line between them moving while it
 * carries traffic — with the three numbers worth a glance (connections, how
 * long it has been up, when it was last used) and, on production, the hour
 * running down.
 */
import { useEffect, useMemo, useState } from 'react';
import { usePortForwardStore, isUp, forwardsFor, localAddress, type ForwardInfo } from '../../store/dk8s-port-forward-store';
import { useK8sStore, type PodSummary } from '../../store/k8s-store';
import { ago, useNow, STOPPED, ForwardNotes } from './ForwardCard';
import { useStartForwards } from './StartForwards';
import { SaveToSetDialog } from './SaveToSet';
import { useSets, removeSet, parseSets, PF_SETS_PREF, type ForwardSet } from './port-forward-prefs';
import { useTeamDk8sSources, teamPrefValues } from '../../store/dk8s-team-store';
import type { ForwardRequest } from '../../store/dk8s-port-forward-store';
import { PF, tint, PfButton, StatePill } from './pf-ui';
import { copyText } from '../../utils/clipboard';
import { openExternal } from '../dkgh/open-external';
import { useCopyTick, CopyGlyph } from '../shared/CopyTick';
import { PortForwardIcon, StopSquareIcon, ExternalLinkIcon, PlayIcon, LockIcon, StarIcon } from '../../icons';
import { ForwardMenuButton } from './ForwardMenu';
import { OK, BAD, MUTED } from './tone';

const PROD_LIMIT_MS = 60 * 60_000;

/** The list, fetched once for the page — the host pushes every change after that. */
function useForwards() {
  const forwards = usePortForwardStore(s => s.forwards);
  const loaded = usePortForwardStore(s => s.loaded);
  useEffect(() => { if (!loaded) usePortForwardStore.getState().refresh(); }, [loaded]);
  return forwards;
}

export function ForwardsChip() {
  const forwards = useForwards();
  const open = usePortForwardStore(s => s.panelOpen);
  const up = forwards.filter(isUp);
  const restorable = usePortForwardStore(s => s.restorable);
  const sets = useSets();
  if (!forwards.length && !restorable.length && !sets.length) return null;
  const prod = up.some(f => f.prod);
  const tone = up.length ? (prod ? BAD : OK) : restorable.length ? PF.dk : MUTED;
  return (
    <button type="button" onClick={() => usePortForwardStore.getState().setPanelOpen(!open)}
            aria-pressed={open} title={up.length ? 'Every port forward — open the panel' : 'Recent port forwards'}
            className="flex items-center gap-1.5 rounded-full cursor-pointer text-[11px] font-semibold shrink-0"
            style={{ height: 24, padding: '0 10px', color: tone, border: `1px solid ${tint(tone, 45)}`, background: tint(tone, open ? 20 : 12) }}>
      {up.length > 0 && <span className="pf-live-dot on" style={{ ['--c' as string]: tone, width: 6, height: 6 }} />}
      <PortForwardIcon size={12} />
      {up.length ? `${up.length} forwarding${prod ? ' · PROD' : ''}` : restorable.length ? `Restore ${restorable.length}` : 'Forwards'}
    </button>
  );
}

function Stat({ n, label, tone }: { n: number | string; label: string; tone?: string }) {
  return (
    <div className="flex flex-col" style={{ gap: 2, padding: '8px 10px', borderRadius: 10, background: 'var(--color-bg, var(--color-panel))', border: `1px solid ${PF.bd}` }}>
      <span style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.1, color: tone ?? PF.tx, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
      <span style={{ fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: PF.mu }}>{label}</span>
    </div>
  );
}

export function ForwardsPanel() {
  const forwards = useForwards();
  const open = usePortForwardStore(s => s.panelOpen);
  const sorted = useMemo(() => [...forwards].sort((a, b) => b.startedAt - a.startedAt), [forwards]);
  if (!open) return null;
  const up = sorted.filter(isUp);
  const recent = sorted.filter(f => !isUp(f));
  const restorable = usePortForwardStore.getState().restorable;
  const connections = up.reduce((n, f) => n + f.connections, 0);
  const prodUp = up.filter(f => f.prod).length;

  const openPod = (f: ForwardInfo) => {
    const k8s = useK8sStore.getState();
    const pod = k8s.pods.find(p => p.name === f.pod && p.namespace === f.namespace && (p.context ?? '') === f.context);
    if (!pod) return;
    k8s.openDetail(pod);
    useK8sStore.getState().setDetailTab('ports', { noHistory: true });
  };

  return (
    <aside className="pf-panel absolute top-0 right-0 bottom-0 z-20 flex flex-col"
           style={{ width: 372, maxWidth: '94%', background: 'var(--color-panel)', borderLeft: `1px solid ${PF.bd}`, boxShadow: '-24px 0 48px -28px rgba(0,0,0,.75)' }}
           aria-label="Port forwards">
      {/* Header: what this is, and the three numbers across every tunnel. */}
      <div className="shrink-0 flex flex-col relative" style={{ gap: 12, padding: '14px 16px', borderBottom: `1px solid ${PF.bd}`, background: `linear-gradient(180deg, ${tint(PF.dk, 7)}, transparent)` }}>
        {/* dui's own close — the same place, size and red-on-hover as every popup's. */}
        <button type="button" onClick={() => usePortForwardStore.getState().setPanelOpen(false)} aria-label="Close the panel" title="Close"
                className="dui_modal__close-btn absolute"
                style={{ top: 8, right: 8, width: 22, height: 22, borderRadius: 5, border: 'none', background: 'transparent', cursor: 'pointer',
                         display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, lineHeight: 1, padding: 0 }}>
          ✕
        </button>
        <div className="flex items-center" style={{ gap: 10 }}>
          <span className="grid place-items-center shrink-0" style={{ width: 32, height: 32, borderRadius: 10, color: PF.dk, background: tint(PF.dk, 14), border: `1px solid ${tint(PF.dk, 35)}` }}>
            <PortForwardIcon size={16} />
          </span>
          <div className="flex flex-col min-w-0">
            <b style={{ fontSize: 14, color: PF.tx }}>Port forwards</b>
            <span style={{ fontSize: 11, color: PF.mu }}>on this machine · 127.0.0.1</span>
          </div>
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          <Stat n={up.length} label="tunnels up" tone={up.length ? PF.ok : PF.mu} />
          <Stat n={connections.toLocaleString()} label="connections" />
          <Stat n={prodUp} label="to production" tone={prodUp ? PF.er : PF.mu} />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto flex flex-col" style={{ gap: 10, padding: 14 }}>
        {restorable.length > 0 && up.length === 0 && <RestoreCard reqs={restorable} />}

        {up.length === 0 && restorable.length === 0 && (
          <div className="flex flex-col items-center text-center" style={{ gap: 10, padding: '34px 16px 18px' }}>
            <span className="grid place-items-center" style={{ width: 64, height: 64, borderRadius: 20, color: PF.dk, background: tint(PF.dk, 10), border: `1px dashed ${tint(PF.dk, 45)}` }}>
              <PortForwardIcon size={26} />
            </span>
            <b style={{ fontSize: 14, color: PF.tx }}>No tunnels open</b>
            <span style={{ fontSize: 12, lineHeight: 1.6, color: PF.mu, maxWidth: 260 }}>
              Open a pod, go to <b style={{ color: PF.tx }}>Ports</b> and press <b style={{ color: PF.dk }}>Forward</b> — its port lands on localhost here.
            </span>
          </div>
        )}

        {up.map(f => <TunnelCard key={f.id} f={f} onOpenPod={() => openPod(f)}
                                 twin={up.some(o => o.id !== f.id && !o.service && !f.service && o.workload?.name === f.workload?.name && o.pod !== f.pod)} />)}

        <SetsSection />

        {recent.length > 0 && (
          <div className="flex flex-col" style={{ gap: 6, marginTop: up.length ? 6 : 0 }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: PF.mu }}>Recent</div>
            {recent.map(f => <RecentRow key={f.id} f={f} onOpenPod={() => openPod(f)} />)}
          </div>
        )}
      </div>

      <div className="shrink-0 flex flex-col" style={{ gap: 8, padding: '10px 14px 12px', borderTop: `1px solid ${PF.bd}` }}>
        {up.length > 0 && (
          <PfButton tone="stop" icon={<StopSquareIcon size={12} />} onClick={() => usePortForwardStore.getState().stopAll()}
                    style={{ height: 30, justifyContent: 'center', width: '100%', fontSize: 12 }}>
            Stop all{up.length > 1 ? ` ${up.length} tunnels` : ''}
          </PfButton>
        )}
        <div className="flex items-center flex-wrap" style={{ gap: '4px 12px', fontSize: 10.5, color: PF.mu }}>
          <span className="flex items-center" style={{ gap: 4 }}><LockIcon size={10} /> this machine only</span>
          <span>idle stop 30 min</span>
          <span>production 1 h</span>
        </div>
      </div>
    </aside>
  );
}

/** One live tunnel. */
/** `twin`: another tunnel goes to a different pod of the same workload — each replica. */
function TunnelCard({ f, onOpenPod, twin }: { f: ForwardInfo; onOpenPod: () => void; twin?: boolean }) {
  const now = useNow(5_000);
  const { copied, flash } = useCopyTick();
  const tone = f.prod ? PF.er : f.state === 'reconnecting' ? PF.wa : PF.ok;
  const flowing = f.state === 'forwarding';
  const [saving, setSaving] = useState(false);
  const who = f.service ? `svc/${f.service}`
    : f.workload ? (twin ? `${f.workload.name}·${f.pod.split('-').pop()}` : f.workload.name) : f.pod;
  const first = f.ports[0];
  const opens = first && (!first.role || first.role === 'http' || first.role === 'actuator' || first.role === 'metrics');
  const left = f.stopsAt ? Math.max(0, f.stopsAt - now) : undefined;

  return (
    <div className="flex flex-col"
         style={{
           gap: 12, padding: 12, borderRadius: 14,
           border: `1px solid color-mix(in srgb, ${tone} 34%, ${PF.bd})`,
           background: `linear-gradient(180deg, color-mix(in srgb, ${tone} 9%, var(--color-panel)), var(--color-panel) 70%)`,
         }}>
      {/* The address, first and largest: it is what gets pasted somewhere. */}
      <div className="flex items-center" style={{ gap: 9 }}>
        <span className={`pf-live-dot${flowing ? ' on' : ''}`} style={{ ['--c' as string]: flowing ? tone : PF.dk }} />
        <span className="truncate" style={{ fontFamily: PF.mono, fontSize: 15, fontWeight: 700, color: PF.tx }}>
          localhost:{f.ports.map(p => p.local).join(', ')}
        </span>
        <button type="button" onClick={async () => { if (await copyText(f.ports.map(localAddress).join('\n'))) flash(); }}
                title={copied ? 'Copied' : 'Copy the address'} aria-label="Copy the address"
                className="pf-icon-btn grid place-items-center border-none cursor-pointer shrink-0"
                style={{ width: 24, height: 24, borderRadius: 6, background: 'transparent', color: copied ? PF.ok : PF.mu }}>
          <CopyGlyph copied={copied} size={12} />
        </button>
        <span className="flex-1" />
        {f.state === 'connecting' ? <StatePill tone="dk">connecting…</StatePill>
          : f.state === 'reconnecting' ? <StatePill tone="wa">↻ {f.attempt ?? 1}/{f.reconnectTries ?? 5}</StatePill>
            : f.prod ? <StatePill tone="er">PROD</StatePill> : <StatePill tone="ok">live</StatePill>}
      </div>

      {/* The tunnel itself. */}
      {f.ports.map(p => (
        <div key={p.local} className="flex items-center" style={{ gap: 8 }}>
          <span className="shrink-0" style={{ fontSize: 10.5, padding: '3px 8px', borderRadius: 7, color: PF.tx, background: 'var(--color-bg, var(--color-panel))', border: `1px solid ${PF.bd}`, fontFamily: PF.mono }}>
            :{p.local}
          </span>
          <span className={`pf-tunnel${flowing ? ' flowing' : ''}`} style={{ ['--c' as string]: tone }}>
            <span className="pf-tunnel-icon" style={{ color: tone }}><PortForwardIcon size={11} /></span>
          </span>
          <span className="truncate" title={`${f.pod} · ${f.context} / ${f.namespace}`}
                style={{ fontSize: 10.5, padding: '3px 8px', borderRadius: 7, color: PF.dk, background: tint(PF.dk, 10), border: `1px solid ${tint(PF.dk, 30)}`, fontFamily: PF.mono, maxWidth: 170 }}>
            {who} :{p.remote}
          </span>
        </div>
      ))}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
        {[
          ['connections', f.connections.toLocaleString()],
          ['up', f.upAt ? ago(now - f.upAt) : '—'],
          ['last used', f.lastActivity ? `${ago(now - f.lastActivity)} ago` : 'not yet'],
        ].map(([k, v]) => (
          <div key={k} className="flex flex-col" style={{ gap: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: PF.tx, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
            <span style={{ fontSize: 9.5, letterSpacing: '.06em', textTransform: 'uppercase', color: PF.mu }}>{k}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap" style={{ gap: '3px 12px', fontSize: 10.5, color: PF.mu }}>
        <ForwardNotes f={f} now={now} />
      </div>

      {left !== undefined && (
        <div className="flex flex-col" style={{ gap: 5 }}>
          <div className="flex justify-between" style={{ fontSize: 10.5, color: PF.er }}>
            <span>production limit</span><span>stops in {ago(left)}</span>
          </div>
          <div style={{ height: 4, borderRadius: 99, background: tint(PF.er, 15), overflow: 'hidden' }}>
            <div style={{ width: `${Math.round((left / PROD_LIMIT_MS) * 100)}%`, height: '100%', borderRadius: 99, background: PF.er, transition: 'width .6s ease' }} />
          </div>
        </div>
      )}

      {f.lastConnError && (
        <div style={{ fontSize: 11, color: PF.wa, background: tint(PF.wa, 9), padding: '6px 8px', borderRadius: 8 }} title={f.lastConnError}>
          A connection could not reach the pod — is anything listening on :{f.ports.map(p => p.remote).join(', :')}?
        </div>
      )}

      <div className="flex" style={{ gap: 6 }}>
        {opens && flowing && (
          <PfButton icon={<ExternalLinkIcon size={11} />} onClick={() => openExternal(`http://localhost:${first.local}`)} style={{ flex: 1, justifyContent: 'center' }}>
            Open
          </PfButton>
        )}
        <PfButton onClick={onOpenPod} style={{ flex: 1, justifyContent: 'center' }} title={`${f.pod} — its Ports tab`}>Pod</PfButton>
        <PfButton icon={<StarIcon size={11} />} onClick={() => setSaving(true)} style={{ flex: 1, justifyContent: 'center' }} title="Save into a set">Save</PfButton>
        <PfButton tone="stop" icon={<StopSquareIcon size={11} />} onClick={() => usePortForwardStore.getState().stop(f.id)} style={{ flex: 1, justifyContent: 'center' }}>
          Stop
        </PfButton>
        <ForwardMenuButton f={f} />
      </div>
      {saving && (
        <SaveToSetDialog onClose={() => setSaving(false)}
                         item={{ context: f.context, namespace: f.namespace, pod: f.pod, workload: f.workload, service: f.service, ports: f.ports }} />
      )}
    </div>
  );
}

/** "Start the 3 forwards you had open?" — after Daakia restarts. Never production. */
function RestoreCard({ reqs }: { reqs: ForwardRequest[] }) {
  const { begin, busy, dialog } = useStartForwards();
  return (
    <div className="flex flex-col" style={{ gap: 10, padding: 12, borderRadius: 14, border: `1px solid ${tint(PF.dk, 40)}`, background: `linear-gradient(180deg, ${tint(PF.dk, 10)}, transparent)` }}>
      <b style={{ fontSize: 13, color: PF.tx }}>Start the {reqs.length} forward{reqs.length === 1 ? '' : 's'} you had open?</b>
      <div className="flex flex-col" style={{ gap: 3, fontFamily: PF.mono, fontSize: 11.5, color: PF.mu }}>
        {reqs.map((r, i) => (
          <span key={i} className="truncate">localhost:{r.ports.map(p => p.local).join(', ')} → {r.service ? `svc/${r.service}` : r.workload?.name ?? r.pod}</span>
        ))}
      </div>
      <div className="flex" style={{ gap: 6 }}>
        <PfButton tone="dk" icon={<PlayIcon size={10} />} disabled={busy} onClick={() => void begin(reqs)} style={{ flex: 1, justifyContent: 'center' }}>Start them</PfButton>
        <PfButton onClick={() => usePortForwardStore.getState().dismissRestore()} style={{ flex: 1, justifyContent: 'center' }}>Not now</PfButton>
      </div>
      {dialog}
    </div>
  );
}

/** Saved sets — yours, and the ones your team saved with the workspace. */
function SetsSection() {
  const mine = useSets();
  const sources = useTeamDk8sSources();
  const team = useMemo(() => teamPrefValues(sources, PF_SETS_PREF)
    .flatMap(({ source, value }) => parseSets(value).map(s => ({ ...s, owner: source.ownerName }))), [sources]);
  const { begin, busy, dialog } = useStartForwards();
  const [confirm, setConfirm] = useState<string>();
  if (!mine.length && !team.length) return null;

  const startSet = (s: ForwardSet) => void begin(s.items.map(i => ({
    context: i.context, namespace: i.namespace, pod: i.pod, workload: i.workload, service: i.service,
    ports: i.ports.map(p => ({ local: p.local, remote: p.remote, name: p.name, role: p.role as ForwardRequest['ports'][number]['role'] })),
  })));
  const row = (s: ForwardSet & { owner?: string }) => (
    <div key={`${s.owner ?? 'me'}:${s.id}`} className="pf-row flex items-center" style={{ gap: 8, padding: '8px 10px', borderRadius: 10, border: `1px dashed ${PF.bd}` }}>
      <span style={{ color: PF.dk }}>▶</span>
      <div className="flex flex-col min-w-0 flex-1">
        <b className="truncate" style={{ fontSize: 12.5, color: PF.tx }}>{s.name}{s.owner ? <span style={{ fontWeight: 400, color: PF.mu }}> · {s.owner}</span> : null}</b>
        <span className="truncate" style={{ fontSize: 10.5, color: PF.mu }}>
          {s.items.map(i => `${i.service ? `svc/${i.service}` : i.workload?.name ?? i.pod}:${i.ports.map(p => p.local).join(',')}`).join(' · ')}
        </span>
      </div>
      <PfButton tone="dk" disabled={busy} onClick={() => startSet(s)}>Start</PfButton>
      {!s.owner && (confirm === s.id
        ? <PfButton tone="stop" onClick={() => { removeSet(s.id); setConfirm(undefined); }}>Delete</PfButton>
        : <button type="button" aria-label={`Delete ${s.name}`} title="Delete this set" onClick={() => setConfirm(s.id)}
                  className="pf-icon-btn grid place-items-center border-none cursor-pointer" style={{ width: 22, height: 22, borderRadius: 6, background: 'transparent', color: PF.mu }}>×</button>)}
    </div>
  );
  return (
    <div className="flex flex-col" style={{ gap: 6 }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: PF.mu }}>Saved sets</div>
      {mine.map(s => row(s))}
      {team.map(s => row(s))}
      {dialog}
    </div>
  );
}

/** A forward that ended: dimmer, with why, and a way to start it again. */
function RecentRow({ f, onOpenPod }: { f: ForwardInfo; onOpenPod: () => void }) {
  const { start, forget } = usePortForwardStore.getState();
  const failed = f.state === 'failed';
  const why = failed ? f.error : STOPPED[f.stopReason ?? 'you'];
  return (
    <div className="pf-row flex items-center" style={{ gap: 8, padding: '8px 10px', borderRadius: 10, border: `1px solid ${PF.bd}`, background: 'var(--color-bg, var(--color-panel))' }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, flexShrink: 0, background: failed ? PF.er : PF.mu }} />
      <button type="button" onClick={onOpenPod} className="flex flex-col min-w-0 flex-1 text-left border-none bg-transparent cursor-pointer p-0" title={why}>
        <span className="truncate" style={{ fontFamily: PF.mono, fontSize: 12, fontWeight: 600, color: PF.tx }}>
          localhost:{f.ports.map(p => p.local).join(', ')} <span style={{ fontWeight: 400, color: PF.mu }}>→ {f.workload?.name ?? f.pod}</span>
        </span>
        <span className="truncate" style={{ fontSize: 10.5, color: failed ? PF.er : PF.mu }}>{why}</span>
      </button>
      <PfButton tone="dk" icon={<PlayIcon size={9} />} title="Start the same forward again"
                onClick={() => { forget(f.id); start({ context: f.context, namespace: f.namespace, pod: f.pod, workload: f.workload, service: f.service, ports: f.ports }); }}>
        Again
      </PfButton>
      <button type="button" onClick={() => forget(f.id)} aria-label="Remove from the list" title="Remove from the list"
              className="pf-icon-btn grid place-items-center border-none cursor-pointer" style={{ width: 22, height: 22, borderRadius: 6, background: 'transparent', color: PF.mu }}>×</button>
    </div>
  );
}

/** On a pod's card: the local ports it is forwarded to, when it is. */
export function PodForwardBadge({ pod }: { pod: PodSummary }) {
  const forwards = usePortForwardStore(s => s.forwards);
  const up = forwardsFor(forwards, pod).filter(isUp);
  if (!up.length) return null;
  const ports = up.flatMap(f => f.ports.map(p => p.local));
  const tone = up.some(f => f.prod) ? BAD : OK;
  return (
    <span className="self-start inline-flex items-center font-mono text-[10px] rounded shrink-0"
          title={`Forwarded to ${ports.map(p => `localhost:${p}`).join(', ')}`}
          style={{ gap: 5, padding: '0 6px', color: tone, background: tint(tone, 13), lineHeight: '16px' }}>
      <span className="pf-live-dot on" style={{ ['--c' as string]: tone, width: 5, height: 5 }} />
      ⇄ {ports.map(p => `:${p}`).join(' ')}
    </span>
  );
}
