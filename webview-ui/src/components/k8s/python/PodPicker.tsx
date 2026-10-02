/**
 * Which pods a script runs on — the Scripts screen's Pods popover.
 *
 * One row per app, not a checkbox per app and another per pod. An app with
 * one pod is one row: click it and that pod is in. An app with several shows
 * its pods as chips under its name, by the part of the name that tells them
 * apart (`7gpgz`, not `zp-backend-69fdd86674-7gpgz`), and the row's own
 * "all" takes or drops every one. A search narrows by app or pod name.
 *
 * Only running pods are offered: a script against a pod that is not up fails
 * at the exec. The order pods were picked in is kept, since the first one is
 * the pod Debug on first opens.
 */
import { useMemo, useState } from 'react';
import { SearchInputView, ButtonView } from '@salilvnair/dui';
import { PodHexIcon, CheckIcon } from '../../../icons';
import { ACCENT, ACCENT_SOFT, BAD, MUTED } from '../tone';
import { podShort } from './py-view';

export interface PickablePod {
  name: string;
  app: string;
  phase: string;
  containers?: string[];
}

const TEXT = 'var(--color-text-primary)';
const LABEL = 'var(--color-text-secondary)';
const EDGE = 'var(--color-surface-border)';
const HOVER = 'var(--color-surface-hover)';
const MONO = 'var(--font-mono, ui-monospace, Consolas, monospace)';
/** Names sit a step below the page's text until picked — a list of nine
    bright white names read as nine things shouting. */
const NAME = 'color-mix(in srgb, var(--color-text-primary) 72%, transparent)';
const ACCENT_EDGE = 'color-mix(in srgb, var(--color-dk8s) 40%, transparent)';
const ACCENT_FILL = 'color-mix(in srgb, var(--color-dk8s) 70%, var(--color-surface-bg, var(--color-bg)))';
const QUIET = 'color-mix(in srgb, var(--color-text-muted) 80%, transparent)';

export function PodPicker({ pods, picked, onChange, onDone, error }: {
  pods: PickablePod[];
  picked: string[];
  onChange: (picked: string[]) => void;
  onDone: () => void;
  error?: string;
}) {
  const [query, setQuery] = useState('');
  const running = useMemo(() => pods.filter(p => p.phase === 'Running'), [pods]);
  const stopped = pods.length - running.length;

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byApp = new Map<string, PickablePod[]>();
    for (const p of running) {
      if (q && !p.app.toLowerCase().includes(q) && !p.name.toLowerCase().includes(q)) continue;
      byApp.set(p.app, [...(byApp.get(p.app) ?? []), p]);
    }
    return [...byApp.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [running, query]);

  const isOn = (name: string) => picked.includes(name);
  const toggle = (name: string) => onChange(isOn(name) ? picked.filter(n => n !== name) : [...picked, name]);
  const setApp = (mine: PickablePod[], on: boolean) => onChange(on
    ? [...picked, ...mine.map(p => p.name).filter(n => !picked.includes(n))]
    : picked.filter(n => !mine.some(p => p.name === n)));

  return (
    <div className="flex flex-col" style={{ width: 380, maxHeight: 'min(560px, 70vh)', color: TEXT }}>
      {/* ── Search, and what is picked ── */}
      <div className="flex flex-col shrink-0" style={{ gap: 8, padding: '12px 12px 10px', borderBottom: `1px solid ${EDGE}` }}>
        <SearchInputView value={query} onChange={setQuery} placeholder="Find an app or a pod" size="sm"
                         aria-label="Find an app or a pod" autoFocus />
        <div className="flex items-center" style={{ gap: 6, fontSize: 11, color: MUTED }}>
          <span>{running.length} running</span>
          {stopped > 0 && <span>· {stopped} not running, not offered</span>}
          <span className="flex-1" />
          {picked.length > 0 && (
            <>
              <span style={{ color: ACCENT, fontWeight: 600 }}>{picked.length} picked</span>
              <button type="button" onClick={() => onChange([])}
                      className="border-none bg-transparent cursor-pointer p-0"
                      style={{ fontSize: 11, color: LABEL, textDecoration: 'underline', textUnderlineOffset: 2 }}>
                clear
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Apps ── */}
      <div className="flex flex-col flex-1 min-h-0 overflow-auto" style={{ padding: 6, gap: 2 }}>
        {error && <div style={{ padding: '10px 8px', fontSize: 11.5, color: BAD }}>{error}</div>}
        {!error && groups.length === 0 && (
          <div style={{ padding: '14px 8px', fontSize: 11.5, color: MUTED }}>
            {running.length ? `No app or pod matches “${query.trim()}”.` : 'No running pods in this namespace.'}
          </div>
        )}
        {groups.map(([app, mine]) => mine.length === 1
          ? <SinglePod key={app} pod={mine[0]} on={isOn(mine[0].name)} onToggle={() => toggle(mine[0].name)} />
          : <ManyPods key={app} app={app} pods={mine} isOn={isOn} onToggle={toggle} onAll={on => setApp(mine, on)} />)}
      </div>

      <div className="flex items-center shrink-0" style={{ gap: 8, padding: '8px 12px', borderTop: `1px solid ${EDGE}` }}>
        <span style={{ fontSize: 11, color: MUTED }}>
          {picked.length ? 'Debug on first opens the first one picked' : 'Pick one or more pods to run on'}
        </span>
        <span className="flex-1" />
        <ButtonView size="sm" variant="secondary" onClick={onDone}
                    style={{ background: ACCENT_SOFT, color: ACCENT, border: `1px solid ${ACCENT_EDGE}`, fontWeight: 600 }}>
          Done
        </ButtonView>
      </div>
    </div>
  );
}

/** A round tick: filled in the accent with a check when on, an empty ring when off. */
function Tick({ on }: { on: boolean }) {
  return (
    <span className="inline-flex items-center justify-center shrink-0"
          style={{
            width: 16, height: 16, borderRadius: 999,
            border: `1.5px solid ${on ? ACCENT_FILL : EDGE}`, background: on ? ACCENT_FILL : 'transparent',
          }}>
      {on && <CheckIcon size={10} strokeWidth={3} color="var(--color-surface-bg, var(--color-bg))" />}
    </span>
  );
}

function rowStyle(on: boolean): React.CSSProperties {
  return {
    gap: 10, width: '100%', minHeight: 36, padding: '6px 8px', borderRadius: 7, border: 'none',
    background: on ? ACCENT_SOFT : 'transparent', color: on ? TEXT : NAME, textAlign: 'left', cursor: 'pointer',
  };
}

function SinglePod({ pod, on, onToggle }: { pod: PickablePod; on: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={on} title={pod.name}
            className="flex items-center"
            style={rowStyle(on)}
            onMouseEnter={e => { if (!on) e.currentTarget.style.background = HOVER; }}
            onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent'; }}>
      <PodHexIcon size={14} color={on ? ACCENT : QUIET} />
      <span className="flex-1 min-w-0 truncate" style={{ fontSize: 12.5, fontWeight: on ? 500 : 400 }}>{pod.app}</span>
      <span className="shrink-0" style={{ fontFamily: MONO, fontSize: 11, color: on ? ACCENT : QUIET }}>{podShort(pod.name)}</span>
      <Tick on={on} />
    </button>
  );
}

function ManyPods({ app, pods, isOn, onToggle, onAll }: {
  app: string; pods: PickablePod[]; isOn: (n: string) => boolean; onToggle: (n: string) => void; onAll: (on: boolean) => void;
}) {
  const n = pods.filter(p => isOn(p.name)).length;
  const all = n === pods.length;
  return (
    <div className="flex flex-col" style={{ padding: '6px 8px 8px', borderRadius: 7, background: n ? ACCENT_SOFT : 'transparent', gap: 7 }}>
      <div className="flex items-center" style={{ gap: 10 }}>
        <PodHexIcon size={14} color={n ? ACCENT : QUIET} />
        <span className="flex-1 min-w-0 truncate" style={{ fontSize: 12.5, fontWeight: n ? 500 : 400, color: n ? TEXT : NAME }}>{app}</span>
        <span style={{ fontSize: 11, color: n ? ACCENT : QUIET }}>{n ? `${n} of ${pods.length}` : `${pods.length} pods`}</span>
        <button type="button" onClick={() => onAll(!all)} aria-pressed={all}
                className="cursor-pointer"
                style={{
                  height: 20, padding: '0 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 600,
                  border: `1px solid ${all ? ACCENT_EDGE : EDGE}`, background: all ? ACCENT_SOFT : 'transparent',
                  color: all ? ACCENT : LABEL,
                }}>
          all
        </button>
      </div>
      <div className="flex flex-wrap" style={{ gap: 6, paddingLeft: 24 }}>
        {pods.map(p => {
          const on = isOn(p.name);
          return (
            <button key={p.name} type="button" onClick={() => onToggle(p.name)} aria-pressed={on} title={p.name}
                    className="inline-flex items-center cursor-pointer"
                    style={{
                      gap: 5, height: 24, padding: '0 9px', borderRadius: 999, fontFamily: MONO, fontSize: 11,
                      border: `1px solid ${on ? ACCENT_EDGE : EDGE}`,
                      background: on ? ACCENT_SOFT : 'transparent',
                      color: on ? ACCENT : QUIET,
                    }}>
              {on && <CheckIcon size={10} strokeWidth={3} color={ACCENT} />}
              {podShort(p.name)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
