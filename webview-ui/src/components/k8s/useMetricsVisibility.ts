/**
 * Tell the host whether anybody is actually looking at the pod grid.
 *
 * ── Why ──
 *
 * Metrics have no watch API, so CPU and memory are polled. Measured over one
 * session: 324 of the 494 calls dk8s made were `top pods` — two thirds of
 * everything, for one column, and most of them fired while the reader was on
 * the Settings tab with the grid nowhere on screen. At 90ms nobody notices; at
 * the 800ms a cluster behind a VPN costs, it is minutes of cluster time spent
 * on a column nobody can see.
 *
 * ── What counts as looking ──
 *
 * Two things, and both have to be true. The dk8s tab has to be the active one
 * — the panel stays mounted behind other tabs, so being rendered proves
 * nothing. And the window itself has to be visible: a minimised editor, or one
 * behind a full-screen browser, is not somebody reading a memory column.
 *
 * Coming back polls once immediately, so the numbers on screen are current
 * rather than whatever was true when the tab was last in front.
 */
import { useEffect } from 'react';
import { postMsg } from '../../vscode';

export function useMetricsVisibility(tabIsActive: boolean): void {
  useEffect(() => {
    const send = () => postMsg({
      type: 'dk8s:metricsActive',
      active: tabIsActive && document.visibilityState !== 'hidden',
    });

    send();
    /* The tab can stay active while the whole window goes away, so the
       document's own visibility is a second signal rather than the same one. */
    document.addEventListener('visibilitychange', send);
    return () => {
      document.removeEventListener('visibilitychange', send);
      /*
        Unmounting is not "looking elsewhere", it is the panel going away —
        and leaving the host polling for a panel that no longer exists is the
        exact leak this hook was written to close.
      */
      postMsg({ type: 'dk8s:metricsActive', active: false });
    };
  }, [tabIsActive]);
}
