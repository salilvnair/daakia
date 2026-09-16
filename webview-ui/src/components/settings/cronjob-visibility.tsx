/**
 * Whether finished CronJob runs are in the pod list to begin with.
 *
 * A namespace with a CronJob firing every five minutes accumulates completed
 * pods, and they sit in the same list as the services that are meant to be
 * up. "Is anything broken" and "did last night's billing job work" are two
 * different questions, and one list answers neither well.
 *
 * This is only the starting point. The pods / cronjobs switch is still in the
 * grid, because somebody who hides them by default will still want to look
 * eventually — and a setting that removed the control would make that
 * impossible without coming back here.
 */
import { useUiStateStore } from '../../store/ui-state-store';
import { ClockIcon } from '../../icons';

export const HIDE_CRONJOBS_PREF = 'dk8s.hideCronJobs';

const ACCENT = 'var(--color-dk8s)';

export function CronJobVisibilitySetting() {
  const on = useUiStateStore(s => s.prefs[HIDE_CRONJOBS_PREF]) === 'on';
  const setPref = useUiStateStore(s => s.setPref);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        <span className="text-[9.5px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
          the pod list
        </span>
        <div className="flex-1 h-px" style={{ background: 'var(--color-surface-border)' }} />
      </div>

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
          onChange={e => setPref(HIDE_CRONJOBS_PREF, e.target.checked ? 'on' : 'off')}
          style={{ accentColor: ACCENT, marginTop: 2, width: 15, height: 15 }}
        />
        <span className="flex flex-col gap-1.5 flex-1 min-w-0">
          <span className="flex items-center gap-2">
            <ClockIcon size={14} style={{ color: ACCENT }} />
            <span className="text-[13px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
              Hide CronJob runs from the pod list
            </span>
          </span>
          <span className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            A schedule firing every five minutes leaves a finished pod behind each time, and they
            sit among the services that are meant to be up. With this on, the Pods tab opens on
            the services alone &mdash; the <em>cronjobs</em> switch is still there when you want to
            see the runs, and it says how many there are either way.
          </span>
        </span>
      </label>
    </div>
  );
}
