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
import { ClockIcon } from '../../icons';

const ACCENT = 'var(--color-dk8s)';

/** Mirrors services/k8s/k8s-timeouts.ts, which clamps the stored value too. */
const MIN = 5;
const MAX = 300;
const DEFAULT = 30;

export function ClusterTimeoutSetting() {
  const seconds = useK8sStore(s => s.clusterTimeoutSeconds);
  const setClusterTimeout = useK8sStore(s => s.setClusterTimeout);

  /*
    The unit lives inside the field.

    It was beside it — a fixed-width box with the word "seconds" next to it —
    and the input overlapped the word. A stepper fixed the overlap and brought
    its own: dui's value field is 37px at its largest, which fits "30" exactly
    and clips "300", and this setting goes to 300. So: one field, the unit as
    its suffix, and a width chosen for the longest value it can hold.
  */
  const [draft, setDraft] = useState(seconds);
  /* Follow the stored value until somebody changes it, so a change made
     elsewhere shows up without a reload. */
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (!touched) setDraft(seconds); }, [seconds, touched]);

  const dirty = draft !== seconds;

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

        <div className="flex items-center gap-2.5 flex-wrap">
          <span style={{ width: 150, display: 'inline-block' }}>
            <TextInputView
              value={String(draft)}
              onChange={e => {
                setTouched(true);
                /* Digits only: a spinner button is not worth a keyboard that
                   can type "3o" and a message explaining it. */
                const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 3);
                setDraft(digits === '' ? 0 : Number(digits));
              }}
              onBlur={() => setDraft(d => Math.min(MAX, Math.max(MIN, d || DEFAULT)))}
              size="sm"
              width="fullWidth"
              accentColor={ACCENT}
              suffixIcon={
                <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                  seconds
                </span>
              }
            />
          </span>
          <ButtonView
            label="Save"
            size="sm"
            variant="secondary"
            accentColor={ACCENT}
            color={dirty ? ACCENT : 'var(--color-text-muted)'}
            disabled={!dirty || draft < MIN || draft > MAX}
            onClick={() => { setClusterTimeout(draft); setTouched(false); }}
          />
          {(seconds !== DEFAULT || draft !== DEFAULT) && (
            <ButtonView
              label="Reset"
              size="sm"
              variant="secondary"
              onClick={() => { setDraft(DEFAULT); setClusterTimeout(DEFAULT); setTouched(false); }}
            />
          )}
        </div>

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
