/**
 * The pod header's Python marks: which interpreter, and whether pdb has this
 * pod stopped.
 *
 * `python 3.11` comes from the container's own `python3 -V` — the deep probe
 * or the Python tab's — never from the image name, which is how an image
 * called `python:3.11` with a 3.9 on its PATH would otherwise be reported.
 *
 * The paused marks exist because a process stopped at a breakpoint in a
 * production pod is a thing to be reminded of from every tab: the service's
 * request, or its health check, may be waiting on it.
 */
import { useEffect, useState } from 'react';
import { BadgeChipView } from '@salilvnair/dui';
import { useK8sStore } from '../../../store/k8s-store';
import { usePyStore } from '../../../store/dk8s-python-store';
import { shortPythonVersion, sessionClock } from './py-view';
import { INFO, WARN, ACCENT, MUTED } from '../tone';

export function PythonHeaderChips() {
  const detail = useK8sStore(s => s.detail);
  const caps = useK8sStore(s => s.capabilities);
  const probes = usePyStore(s => s.probes);
  const debug = usePyStore(s => s.debug);

  const prefix = detail?.context ? `${detail.context}/${detail.namespace}/${detail.name}/` : '';
  const fromTab = prefix
    ? Object.entries(probes).find(([k, p]) => k.startsWith(prefix) && p.python3Version)?.[1].python3Version
    : undefined;
  const version = shortPythonVersion(caps?.python3Version ?? fromTab);

  const here = !!debug && !debug.ended && !!detail && debug.target.pod === detail.name
    && debug.target.namespace === detail.namespace;

  return (
    <>
      {version && (
        <BadgeChipView tone={INFO} size="xs" title={caps?.python3Version ?? fromTab}>python {version}</BadgeChipView>
      )}
      {here && <PausedMarks />}
    </>
  );
}

function PausedMarks() {
  const debug = usePyStore(s => s.debug);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!debug) return null;
  const st = debug.state;
  const paused = st.status === 'paused';
  const file = (st.location?.file ?? debug.path ?? debug.scriptName).split('/').pop();
  const why = st.reason === 'exception' ? 'exception' : st.reason === 'breakpoint' ? 'breakpoint' : 'step';
  return (
    <span className="flex items-center gap-2 text-[11px]" style={{ fontVariantNumeric: 'tabular-nums' }}>
      <BadgeChipView tone={paused ? WARN : ACCENT} size="xs">{paused ? 'PAUSED' : 'DEBUGGING'}</BadgeChipView>
      {paused && st.location && (
        <span className="font-mono" style={{ color: WARN }}>{why} &middot; {file}:{st.location.line}</span>
      )}
      <span style={{ color: MUTED }}>session {sessionClock(now - debug.startedAt)}</span>
    </span>
  );
}
