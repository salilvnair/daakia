/**
 * Logger levels on the running app, from the Loggers tab — through a port
 * forward to the pod's actuator, so nothing is redeployed.
 *
 * Off until a forward to this pod is up and its actuator lists `loggers`;
 * then each row's level becomes a picker. A change can go back on its own
 * after a set time (the host keeps that timer, so it survives this tab
 * closing), and on a production context it asks first.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ModalView } from '@salilvnair/dui';
import { usePortForwardStore, forwardsFor, type ForwardInfo } from '../../store/dk8s-port-forward-store';
import { useUiStateStore } from '../../store/ui-state-store';
import { logUiEvent } from '../../store/ui-audit-store';
import { findActuator, parseJson, type Actuator } from './actuator';
import { Picker, LevelPill } from './loggers-parts';
import { LOGGERS } from './tone';
import { EDGE, LABEL, QUIET, TEXT, AMBER, tint } from './loggers-tone';
import { PF, PfButton, PfBar } from './pf-ui';

export const LEVEL_REVERT_PREF = 'dk8s.pf.levelRevertMinutes';
const REVERT_OPTIONS = [
  { value: '5', label: '5 min' }, { value: '10', label: '10 min' }, { value: '30', label: '30 min' },
  { value: '60', label: '1 hour' }, { value: '0', label: 'never' },
];

type LoggerLevels = Record<string, { configuredLevel?: string | null; effectiveLevel?: string }>;

export interface Live {
  f: ForwardInfo;
  a: Actuator;
  levels: string[];
  loggers: LoggerLevels;
  /** When each changed logger goes back, by name. */
  revertAt: Record<string, number>;
  revertMinutes: number;
  busy?: string;
  error?: string;
  set: (name: string, level: string | null) => void;
}

type Pending = { name: string; level: string | null; from?: string | null };

export function useLiveLevels(pod?: { name: string; namespace: string; context?: string }): {
  live?: Live; status: 'off' | 'finding' | 'none' | 'on'; reason?: string; confirm: React.ReactNode;
} {
  const forwards = usePortForwardStore(s => s.forwards);
  const reverted = usePortForwardStore(s => s.reverted);
  const f = pod ? forwardsFor(forwards, pod).find(x => x.state === 'forwarding') : undefined;
  const revertMinutes = Number(useUiStateStore(s => s.prefs[LEVEL_REVERT_PREF]) ?? '10') || 0;
  const [a, setA] = useState<Actuator>();
  const [reason, setReason] = useState<string>();
  const [finding, setFinding] = useState(false);
  const [loggers, setLoggers] = useState<LoggerLevels>({});
  const [levels, setLevels] = useState<string[]>([]);
  const [revertAt, setRevertAt] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<Pending>();
  const fRef = useRef(f); fRef.current = f;

  const load = useCallback(async (fw: ForwardInfo, act: Actuator) => {
    const r = await usePortForwardStore.getState().call(fw, act.port, `${act.base}/loggers`);
    const v = parseJson<{ levels?: string[]; loggers?: LoggerLevels }>(r.body);
    if (r.status === 200 && v?.loggers) { setLoggers(v.loggers); setLevels(v.levels ?? []); setError(undefined); } else setError(r.error ?? `The actuator answered ${r.status} to ${act.base}/loggers.`);
  }, []);

  /* Find the actuator once per forward. */
  useEffect(() => {
    setA(undefined); setLoggers({}); setReason(undefined);
    if (!f) return;
    let live = true;
    setFinding(true);
    void findActuator(f).then(async found => {
      if (!live) return;
      setFinding(false);
      if ('error' in found) { setReason(found.error); return; }
      if (!found.links.includes('loggers')) { setReason(`The actuator on :${found.port} does not expose loggers.`); return; }
      setA(found);
      await load(f, found);
    });
    return () => { live = false; };
  }, [f?.id, load]); // eslint-disable-line react-hooks/exhaustive-deps

  /* A level the host put back: read the levels again. */
  const lastReverted = reverted[reverted.length - 1];
  useEffect(() => {
    if (!lastReverted || !f || !a || lastReverted.id !== f.id) return;
    setRevertAt(r => { const n = { ...r }; delete n[lastReverted.logger]; return n; });
    if (lastReverted.error) setError(`${lastReverted.logger}: ${lastReverted.error}`);
    void load(f, a);
  }, [lastReverted]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = useCallback(async (p: Pending, confirmed: boolean) => {
    const fw = fRef.current; if (!fw || !a) return;
    setBusy(p.name); setError(undefined);
    const previous = p.from === undefined ? loggers[p.name]?.configuredLevel ?? null : p.from;
    const r = await usePortForwardStore.getState().call(fw, a.port, `${a.base}/loggers/${p.name}`, {
      method: 'POST', json: { configuredLevel: p.level }, confirmed,
      revertMs: revertMinutes && p.level !== previous ? revertMinutes * 60_000 : undefined, previous,
    });
    setBusy(undefined);
    if (r.status >= 200 && r.status < 300) {
      logUiEvent('dk8s.logger_level_set', { level: p.level ?? 'inherit', prod: fw.prod, revertMinutes });
      setRevertAt(m => { const n = { ...m }; if (r.revertAt) n[p.name] = r.revertAt; else delete n[p.name]; return n; });
      await load(fw, a);
    } else setError(r.error ?? `The actuator answered ${r.status}.`);
  }, [a, loggers, revertMinutes, load]);

  const set = useCallback((name: string, level: string | null) => {
    const p = { name, level };
    if (fRef.current?.prod) setPending(p); else void apply(p, false);
  }, [apply]);

  const confirm = pending && f ? (
    <ModalView open onClose={() => setPending(undefined)} size="sm"
               title={<span className="flex items-center" style={{ gap: 8 }}><span style={{ color: PF.er }}>▲</span>Change a production logger?</span>}
               footerRight={
                 <div style={{ display: 'flex', gap: 8 }}>
                   <PfButton onClick={() => setPending(undefined)}>Cancel</PfButton>
                   <PfButton tone="danger" onClick={() => { const p = pending; setPending(undefined); void apply(p, true); }}>Change it</PfButton>
                 </div>
               }>
      <div className="flex flex-col" style={{ gap: 10, fontSize: 12.5, color: PF.mu }}>
        <PfBar tone="er"><b>{f.context}</b> is production.</PfBar>
        <p style={{ margin: 0 }}>
          <b style={{ fontFamily: PF.mono, color: PF.tx }}>{pending.name}</b> goes to <b style={{ color: PF.tx }}>{pending.level ?? 'inherit'}</b> on {f.pod},
          now. {revertMinutes ? <>It goes back after <b style={{ color: PF.tx }}>{revertMinutes} minutes</b>.</> : <>It stays until you change it back or the pod restarts.</>}
          {' '}A DEBUG logger on a busy service writes a lot.
        </p>
      </div>
    </ModalView>
  ) : null;

  const status = !f ? 'off' : finding ? 'finding' : a ? 'on' : 'none';
  return {
    status, reason, confirm,
    live: f && a ? { f, a, levels, loggers, revertAt, revertMinutes, busy, error, set } : undefined,
  };
}

/** The strip above the table: where the levels come from, and how long a change lasts. */
export function LiveLevelsBar({ live, status, reason, now, onPorts }: {
  live?: Live; status: 'off' | 'finding' | 'none' | 'on'; reason?: string; now: number; onPorts: () => void;
}) {
  const setPref = useUiStateStore(s => s.setPref);
  const box: React.CSSProperties = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '7px 14px', borderBottom: `1px solid ${EDGE}`, fontSize: 11.5, color: LABEL };
  if (status === 'off') {
    return (
      <div style={box}>
        <span>Forward the pod's HTTP or management port and levels here can be changed on the running app.</span>
        <button type="button" onClick={onPorts} className="cursor-pointer border-none" style={{ background: 'none', color: LOGGERS, fontSize: 11.5, padding: 0 }}>Ports tab</button>
      </div>
    );
  }
  if (status === 'finding') return <div style={box}>Looking for the actuator through the forward…</div>;
  if (status === 'none' || !live) return <div style={box}>{reason ?? 'No actuator answered through the forward.'}</div>;
  const changed = Object.entries(live.revertAt);
  return (
    <div style={{ ...box, background: tint(LOGGERS, 6) }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: PF.ok, boxShadow: `0 0 6px ${PF.ok}` }} />
      <span style={{ color: TEXT }}>Live levels</span>
      <span>through <span style={{ fontFamily: PF.mono }}>localhost:{live.a.port}{live.a.base}</span> — a change applies to the running pod until it restarts.</span>
      <span className="flex-1" />
      <span>Put a change back after</span>
      <Picker height={22} fontSize={11} value={String(live.revertMinutes)} options={REVERT_OPTIONS} onChange={v => setPref(LEVEL_REVERT_PREF, v)} />
      {changed.length > 0 && (
        <span style={{ width: '100%', color: QUIET }}>
          {changed.map(([n, at]) => `${n.split('.').pop()} back in ${Math.max(1, Math.round((at - now) / 60_000))} min`).join(' · ')}
        </span>
      )}
      {live.error && <span style={{ width: '100%', color: AMBER }}>{live.error}</span>}
    </div>
  );
}

/** A row's LEVEL cell when levels are live: the running level, as a picker. */
export function LiveLevelCell({ live, name, fallback }: { live: Live; name: string; fallback?: string }) {
  const cur = live.loggers[name];
  if (!name) return <LevelPill level={fallback} />;
  const eff = cur?.effectiveLevel;
  const options = [
    ...(cur?.configuredLevel ? [{ value: '__inherit', label: 'inherit' }] : []),
    ...(live.levels.length ? live.levels : ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'OFF']).map(l => ({ value: l, label: l })),
  ];
  return (
    <span className="inline-flex items-center" style={{ gap: 4 }} onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}
          title={cur ? `Running: ${eff ?? '?'}${cur.configuredLevel ? ` (set to ${cur.configuredLevel})` : ' (inherited)'}` : 'Not a logger the app has created yet — setting it creates it'}>
      <Picker height={22} fontSize={10.5} mono radius={5}
              value={eff ?? fallback ?? ''} display={live.busy === name ? '…' : eff ?? fallback ?? 'set'}
              options={options} onChange={v => live.set(name, v === '__inherit' ? null : v)} />
      {live.revertAt[name] && <span aria-label="goes back on its own" style={{ fontSize: 10, color: QUIET }}>↩</span>}
    </span>
  );
}
