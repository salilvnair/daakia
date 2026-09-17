/**
 * Whether the CPU and memory columns keep themselves up to date.
 *
 * Off, because a terminal does not do this. `kubectl get pods` then
 * `kubectl logs <pod>` is fast, and it is fast because it asks once and stops.
 * dk8s polled `top pods` every fifteen seconds per namespace forever — 324 of
 * the 494 calls in one measured session, two thirds of everything it did, for
 * one column, most of it while the reader was on another tab.
 *
 * So the numbers are fetched when somebody asks. This is for the case where
 * somebody genuinely wants them live — watching a pod climb towards its limit
 * — and it stays gated on the panel being in front, and still backs off while
 * the numbers stand still.
 */
import { useUiStateStore } from '../../store/ui-state-store';
import { CpuIcon } from '../../icons';

export const METRICS_AUTO_KEY = 'dk8s.metrics.auto';

const ACCENT = 'var(--color-dk8s)';

/** True when the reader has asked for live numbers. Off unless they have. */
export function useMetricsAuto(): boolean {
  return useUiStateStore(s => s.prefs[METRICS_AUTO_KEY]) === 'on';
}

export function MetricsRefreshSetting() {
  const on = useMetricsAuto();
  const setPref = useUiStateStore(s => s.setPref);

  return (
    <label
      className="flex items-start gap-3 px-4 py-3.5 rounded-lg cursor-pointer"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-surface-border)',
        maxWidth: '100%',
      }}
    >
      <input
        type="checkbox"
        checked={on}
        onChange={e => setPref(METRICS_AUTO_KEY, e.target.checked ? 'on' : 'off')}
        style={{ accentColor: ACCENT, marginTop: 2, width: 15, height: 15 }}
      />
      <span className="flex flex-col gap-1.5 flex-1 min-w-0">
        <span className="flex items-center gap-2">
          <CpuIcon size={14} style={{ color: ACCENT }} />
          <span className="text-[13px]"
                style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
            Keep CPU and memory up to date
          </span>
        </span>
        <span className="text-[11.5px] leading-relaxed"
              style={{ color: 'var(--color-text-secondary)' }}>
          Off by default, because nothing else in dk8s runs on a timer and this
          one was two thirds of every call it made &mdash; one{' '}
          <code style={{ fontFamily: 'var(--font-mono, monospace)' }}>kubectl top pods</code>{' '}
          per namespace every fifteen seconds, for a column, whether or not
          anybody was looking at it. Use the refresh beside the counts to ask
          once instead.
        </span>
        <span className="text-[11px] leading-relaxed"
              style={{ color: 'var(--color-text-muted)' }}>
          With it on the poll still stops when the dk8s tab is not in front, and
          still slows down while the numbers are not moving &mdash; it speeds
          back up the moment one does.
        </span>
      </span>
    </label>
  );
}
