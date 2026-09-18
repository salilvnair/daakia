/**
 * Settings → DK8S → whether dk8s remembers what the cluster told it.
 *
 * ── Why this is yours to decide ──
 *
 * Caching a cluster read is a trade, and which side of it you want depends on
 * the cluster. Against a local kind every call is 80ms and freshness is free.
 * Through a VPN to a managed cluster the same call is 800ms and opening one
 * pod was firing fifty of them — there, remembering is the difference between
 * a tool and a stopwatch.
 *
 * And somebody debugging an RBAC change wants none of it: they granted a role
 * thirty seconds ago and need dk8s to stop repeating what was true before.
 * Turning it off restores exactly the behaviour that was here before any of
 * it existed.
 */
import { useState } from 'react';
import { CheckboxView, ButtonView } from '@salilvnair/dui';
import { useK8sStore } from '../../store/k8s-store';
import { MemoryIcon } from '../../icons';

const ACCENT = 'var(--color-dk8s)';

export const DEFAULT_CACHE_TTL_MINUTES = 60;
const MIN = 1;
const MAX = 24 * 60;

/** What is remembered, and for how long, in the reader's words. */
const REMEMBERED = [
  { what: 'Clusters and namespaces', why: 'read from your kubeconfig, which changes when you edit it' },
  { what: 'What you are allowed to do', why: 'seven auth can-i per namespace, answered by your token' },
  { what: 'A pod’s own spec', why: 'held briefly, so one pod-open costs one read instead of six' },
];

export function ClusterCacheSetting() {
  const enabled = useK8sStore(s => s.cacheEnabled);
  const ttl = useK8sStore(s => s.cacheTtlMinutes);
  const light = useK8sStore(s => s.lightLists);
  const setCache = useK8sStore(s => s.setCacheSettings);
  const [draft, setDraft] = useState(String(ttl));
  const [touched, setTouched] = useState(false);

  const parsed = Math.round(Number(draft));
  const valid = Number.isFinite(parsed) && parsed >= MIN && parsed <= MAX;

  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 rounded-lg"
         style={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)' }}>
      <label className="flex items-start gap-3 cursor-pointer">
        <CheckboxView
          checked={enabled}
          onChange={on => setCache({ enabled: on, ttlMinutes: ttl })}
          size="md" accentColor={ACCENT}
        />
        <span className="flex flex-col gap-1.5 flex-1 min-w-0">
          <span className="flex items-center gap-2">
            <MemoryIcon size={14} style={{ color: ACCENT }} />
            <span className="text-[13px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
              Remember what the cluster answers
            </span>
          </span>
          <span className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            Opening one pod used to cost around fifty <code style={{ fontFamily: 'var(--font-mono, monospace)' }}>kubectl</code>{' '}
            calls, because every part of the screen asked the cluster the same
            questions for itself. Most of those answers do not change while you
            work.
          </span>
        </span>
      </label>

      <div className="flex flex-col gap-1 pl-8">
        {REMEMBERED.map(r => (
          <span key={r.what} className="text-[11px] leading-relaxed"
                style={{ color: enabled ? 'var(--color-text-secondary)' : 'var(--color-text-muted)' }}>
            <b style={{ color: enabled ? 'var(--color-text-primary)' : 'inherit', fontWeight: 600 }}>{r.what}</b>
            {' — '}{r.why}
          </span>
        ))}
        {/*
          Said plainly and always, on or off. Somebody reading a log needs to
          know beyond doubt that it is not coming from a cache, and the one
          place to answer that is next to the switch.
        */}
        <span className="text-[11px] leading-relaxed mt-1" style={{ color: 'var(--color-text-muted)' }}>
          <b style={{ fontWeight: 600 }}>Logs are never remembered</b>, on or off, and neither is
          anything you press <b style={{ fontWeight: 600 }}>refresh</b> for. Calls already in
          flight are still shared, because four probes asking one question at
          the same instant cannot get different answers.
        </span>
      </div>

      {/*
        Separate from the cache, because it is a different trade.

        Caching is about WHEN dk8s asks. This is about how much it asks FOR,
        and it applies to every list whether anything is remembered or not.
      */}
      <label className="flex items-start gap-3 cursor-pointer pt-1"
             style={{ borderTop: '1px solid var(--color-surface-border)', paddingTop: 12 }}>
        <CheckboxView
          checked={light}
          onChange={on => setCache({ enabled, ttlMinutes: ttl, lightLists: on })}
          size="md" accentColor={ACCENT}
        />
        <span className="flex flex-col gap-1.5 flex-1 min-w-0">
          <span className="text-[13px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
            Light pod lists
          </span>
          <span className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            Ask for the fields the grid draws rather than the whole object.
            Measured on a namespace of six pods:{' '}
            <b style={{ color: 'var(--color-text-primary)' }}>565 bytes against 28,094</b> —
            same screen, fifty times smaller. On a hundred and fifty pods behind
            a VPN that is the difference between a pod list and a stopwatch.
          </span>
          <span className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            Off asks for the full object, which also carries when a pod last
            restarted. On a local cluster the extra costs nothing.
          </span>
        </span>
      </label>

      <div className="flex items-center gap-2 pl-8">
        <span className="text-[11.5px]" style={{ color: enabled ? 'var(--color-text-secondary)' : 'var(--color-text-muted)' }}>
          Forget after
        </span>
        <input
          value={draft}
          disabled={!enabled}
          onChange={e => { setDraft(e.target.value); setTouched(true); }}
          className="text-[12px] px-2 py-1 rounded w-16 text-right tabular-nums"
          style={{
            background: 'var(--color-panel)',
            border: `1px solid ${touched && !valid ? 'var(--color-error)' : 'var(--color-surface-border)'}`,
            color: 'var(--color-text-primary)',
            outline: 'none',
            opacity: enabled ? 1 : 0.5,
          }}
        />
        <span className="text-[11.5px]" style={{ color: enabled ? 'var(--color-text-secondary)' : 'var(--color-text-muted)' }}>
          minutes
        </span>

        {touched && (
          <>
            <ButtonView
              label="Save" size="xs" variant="secondary" accentColor={ACCENT}
              disabled={!valid || !enabled}
              onClick={() => { setCache({ enabled, ttlMinutes: parsed }); setTouched(false); }}
            />
            <ButtonView
              label="Default" size="xs" variant="secondary"
              onClick={() => {
                setDraft(String(DEFAULT_CACHE_TTL_MINUTES));
                setCache({ enabled, ttlMinutes: DEFAULT_CACHE_TTL_MINUTES });
                setTouched(false);
              }}
            />
          </>
        )}
      </div>

      {touched && !valid && (
        <span className="text-[11px] pl-8" style={{ color: 'var(--color-error)' }}>
          Between {MIN} and {MAX} minutes. Below that it stops being a cache; above it, honest.
        </span>
      )}
    </div>
  );
}
