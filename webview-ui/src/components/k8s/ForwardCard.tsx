/**
 * One port forward, in the pod's Ports tab — drawn to the plan's mock.
 *
 * First line: the state, the address to use, what it reaches, and the
 * actions (Copy, Open, Stop). Second line: how long it has been up and what
 * has gone through it. A production forward is red-edged and says when it
 * stops on its own.
 */
import { useEffect, useState } from 'react';
import { usePortForwardStore, localAddress, isUp, type ForwardInfo, type ForwardPort } from '../../store/dk8s-port-forward-store';
import { copyText } from '../../utils/clipboard';
import { openExternal } from '../dkgh/open-external';
import { useCopyTick, CopyGlyph } from '../shared/CopyTick';
import { ExternalLinkIcon, StopSquareIcon, PlayIcon } from '../../icons';
import { PF, tint, PfButton, StatePill, ROLE } from './pf-ui';

/** Re-render on a slow clock, for "up 12 min" and "stops in 48 min". */
export function useNow(ms: number): number {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setT(Date.now()), ms); return () => clearInterval(i); }, [ms]);
  return t;
}

export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

export const STOPPED: Record<string, string> = {
  you: 'Stopped.',
  idle: 'Stopped after 30 minutes with nothing going through it.',
  limit: 'Stopped at the one-hour limit for production.',
  closed: 'Stopped when Daakia closed.',
  exit: 'kubectl stopped.',
};

/** "http · 8080" — what the forward reaches, the way the mock says it. */
export function reaches(p: ForwardPort): string {
  const role = p.role ? ROLE[p.role]?.label.toLowerCase().replace('http api', 'http') : p.name;
  return `${role ? `${role} · ` : ''}${p.remote}`;
}

export function ForwardCard({ f }: { f: ForwardInfo }) {
  const { stop, forget, start } = usePortForwardStore.getState();
  const now = useNow(15_000);
  const { copied, flash } = useCopyTick();
  const up = isUp(f);
  const first = f.ports[0];
  const opens = first && (!first.role || first.role === 'http' || first.role === 'actuator' || first.role === 'metrics');
  const edge = !up ? PF.bd : f.prod ? PF.er : PF.ok;

  return (
    <div className="flex flex-col"
         style={{
           gap: 8, padding: '10px 12px', borderRadius: 10,
           border: `1px solid ${up ? `color-mix(in srgb, ${edge} 40%, ${PF.bd})` : PF.bd}`,
           background: up ? `color-mix(in srgb, ${edge} 5%, ${PF.panel})` : PF.panel,
         }}>
      <div className="flex items-center flex-wrap" style={{ gap: 10 }}>
        {f.state === 'forwarding' ? <StatePill tone="ok">● forwarding</StatePill>
          : f.state === 'connecting' ? <StatePill tone="dk">connecting…</StatePill>
            : f.state === 'failed' ? <StatePill tone="er">failed</StatePill>
              : <StatePill tone="mu">stopped</StatePill>}
        {f.prod && <StatePill tone="er">PROD</StatePill>}
        <span className="flex flex-col" style={{ gap: 2 }}>
          {f.ports.map(p => (
            <span key={p.local} className="flex items-center flex-wrap" style={{ gap: 10 }}>
              <span style={{ fontFamily: PF.mono, fontSize: 13, fontWeight: 600, color: up ? PF.tx : PF.mu }}>{localAddress(p)}</span>
              <span style={{ color: PF.mu }}>→</span>
              <span style={{ fontFamily: PF.mono, fontSize: 12, color: PF.dk }}>{reaches(p)}</span>
            </span>
          ))}
        </span>
        <span className="flex-1" />
        {up ? (
          <span className="flex flex-wrap" style={{ gap: 6 }}>
            <PfButton icon={<CopyGlyph copied={copied} size={11} />} style={copied ? { color: PF.ok } : undefined}
                      onClick={async () => { if (await copyText(f.ports.map(localAddress).join('\n'))) flash(); }}>
              Copy
            </PfButton>
            {opens && f.state === 'forwarding' && (
              <PfButton icon={<ExternalLinkIcon size={11} />} onClick={() => openExternal(`http://localhost:${first.local}`)} title="Open it in your browser">
                Open
              </PfButton>
            )}
            <PfButton tone="stop" icon={<StopSquareIcon size={11} />} onClick={() => stop(f.id)} title="Stop this forward and free the local port">
              Stop
            </PfButton>
          </span>
        ) : (
          <span className="flex items-center" style={{ gap: 6 }}>
            <PfButton tone="dk" icon={<PlayIcon size={10} />} title="Start the same forward again"
                      onClick={() => { forget(f.id); start({ context: f.context, namespace: f.namespace, pod: f.pod, workload: f.workload, ports: f.ports }); }}>
              Start again
            </PfButton>
            <PfButton tone="ghost" onClick={() => forget(f.id)} title="Remove from the list" aria-label="Remove from the list" style={{ padding: '0 8px' }}>×</PfButton>
          </span>
        )}
      </div>

      <div className="flex flex-wrap" style={{ gap: '4px 14px', fontSize: 11, color: PF.mu }}>
        {f.state === 'forwarding' && f.upAt && <span>up <b style={{ color: PF.tx, fontWeight: 500 }}>{ago(now - f.upAt)}</b></span>}
        {up && (
          <span>
            <b style={{ color: PF.tx, fontWeight: 500 }}>{f.connections.toLocaleString()}</b> connection{f.connections === 1 ? '' : 's'}
            {f.lastActivity ? ` · last ${ago(now - f.lastActivity)} ago` : ''}
          </span>
        )}
        {up && f.stopsAt && <span style={{ color: PF.er }}>stops in {ago(f.stopsAt - now)}</span>}
        {!up && f.state === 'stopped' && <span>{STOPPED[f.stopReason ?? 'you']}</span>}
        {f.state === 'failed' && f.error && <span style={{ color: PF.er }}>{f.error}</span>}
      </div>

      {up && f.lastConnError && (
        <div style={{ fontSize: 11, color: PF.wa, background: tint(PF.wa, 8), padding: '5px 8px', borderRadius: 6 }} title={f.lastConnError}>
          A connection could not reach the pod — is anything listening on {f.ports.map(p => p.remote).join(', ')} inside it?
        </div>
      )}
    </div>
  );
}
