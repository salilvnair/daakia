/**
 * Whether the CPU and memory columns keep themselves up to date.
 *
 * Off, because a terminal does not do this. `kubectl get pods` then
 * `kubectl logs <pod>` is fast, and it is fast because it asks once and stops.
 * dk8s polled `top pods` every fifteen seconds per namespace forever — 324 of
 * the 494 calls in one measured session, two thirds of everything it did, for
 * one column, most of it while the reader was on another tab.
 *
 * So the numbers are fetched when somebody asks. The `live` button beside the
 * counts is for the case where somebody genuinely wants them kept up to date —
 * watching a pod climb towards its limit — and it stays gated on the panel
 * being in front, and still backs off while the numbers stand still.
 *
 * ── Why the switch is on the grid and not in Settings ──
 *
 * It is a thing you turn on for the next two minutes and off again, which is
 * the same bargain the log view's Following makes, in the same place: beside
 * the numbers it affects. A Settings page for it was written and thrown away —
 * a second control for one switch, two screens from the column it changes.
 */
import { useUiStateStore } from '../../store/ui-state-store';

export const METRICS_AUTO_KEY = 'dk8s.metrics.auto';

/** True when the reader has asked for live numbers. Off unless they have. */
export function useMetricsAuto(): boolean {
  return useUiStateStore(s => s.prefs[METRICS_AUTO_KEY]) === 'on';
}
