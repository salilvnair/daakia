/**
 * Settings → DK8S → General — how long to wait for a cluster.
 *
 * ── Why this is a setting and not a number in the code ──
 *
 * It was four numbers in the code, picked one at a time: the pod list at 30
 * seconds, namespaces at 20, the reachability check at 15 with its own
 * `--request-timeout=8s`, and a 25-second stopwatch in the pod grid that
 * announced "no answer from the cluster".
 *
 * Twenty-five is less than thirty, so the screen gave up five seconds before
 * the call it was waiting on had finished — a cluster that was merely slow got
 * called dead while its answer was on the way.
 *
 * One ceiling now, everything derives from it, and it is here because the right
 * value is a property of somebody's cluster and network, not of dk8s. A cluster
 * in another region behind a VPN is not misbehaving when it takes forty
 * seconds; it is just far away.
 */
import { useEffect, useState } from 'react';
import { ButtonView, TextInputView } from '@salilvnair/dui';
import { useK8sStore } from '../../store/k8s-store';
import { ClockIcon, WarningTriangleIcon } from '../../icons';

const ACCENT = 'var(--color-dk8s)';

/** Mirrors services/k8s/k8s-timeouts.ts, which clamps the stored value too. */
const MIN = 5;
const MAX = 300;
const DEFAULT = 30;

export function ClusterTimeoutSetting() {
  const seconds = useK8sStore(s => s.clusterTimeoutSeconds);
  const setClusterTimeout = useK8sStore(s => s.setClusterTimeout);

  const [draft, setDraft] = useState(String(seconds));
  /* Follow the stored value until somebody types, so a change made elsewhere
     shows up without a reload. */
  const [typed, setTyped] = useState(false);
  useEffect(() => { if (!typed) setDraft(String(seconds)); }, [seconds, typed]);

  const parsed = Number(draft);
  const valid = Number.isFinite(parsed) && parsed >= MIN && parsed <= MAX;
  const dirty = valid && Math.round(parsed) !== seconds;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        <span className="text-[9.5px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
          waiting
        </span>
        <div className="flex-1 h-px" style={{ background: 'var(--color-surface-border)' }} />
      </div>

      <div className="flex flex-col gap-3 px-4 py-3.5 rounded-lg"
           style={{
             background: 'var(--color-surface)',
             border: '1px solid var(--color-surface-border)',
             maxWidth: '92ch',
           }}>
        <div className="flex items-start gap-3">
          <ClockIcon size={15} style={{ color: ACCENT, marginTop: 2, flexShrink: 0 }} />
          <div className="flex flex-col gap-1.5 min-w-0 flex-1">
            <span className="text-[13px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
              How long to wait for a cluster
            </span>
            <span className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              One ceiling for every call dk8s makes to a cluster — listing pods, listing
              namespaces, checking one answers at all. Raise it for a cluster in another region
              or behind a VPN, which is far away rather than broken. Lower it if you would
              rather be told quickly.
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span style={{ width: 110 }}>
            <TextInputView
              value={draft}
              onChange={e => { setTyped(true); setDraft(e.target.value); }}
              placeholder={String(DEFAULT)}
              size="sm"
              accentColor={ACCENT}
            />
          </span>
          <span className="text-[11.5px]" style={{ color: 'var(--color-text-muted)' }}>seconds</span>
          <ButtonView
            label="Save"
            size="sm"
            variant="secondary"
            accentColor={ACCENT}
            color={dirty ? ACCENT : 'var(--color-text-muted)'}
            disabled={!dirty}
            onClick={() => { setClusterTimeout(Math.round(parsed)); setTyped(false); }}
          />
          {seconds !== DEFAULT && (
            <ButtonView
              label="Reset"
              size="sm"
              variant="secondary"
              onClick={() => { setClusterTimeout(DEFAULT); setTyped(false); }}
            />
          )}
        </div>

        {!valid && (
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--color-warning)' }}>
            <WarningTriangleIcon size={12} />
            Between {MIN} and {MAX} seconds. Below {MIN} a normal call cannot finish; above
            {' '}{MAX} nobody is still waiting.
          </span>
        )}

        {/*
          What the number actually governs, said plainly — the screens quote it
          back, and a setting whose effect is invisible gets changed at random
          until something works.
        */}
        <span className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
          A screen says it has heard nothing only after {seconds + 8} seconds — deliberately
          longer than the calls it is waiting on, so it can never call a cluster dead while the
          answer is still on its way. A refusal is reported the moment it arrives, whatever this
          is set to.
        </span>
      </div>
    </div>
  );
}
