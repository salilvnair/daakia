/**
 * Where the log view gets its lines.
 *
 * ── Why this exists ──
 *
 * `LogViewer` is the log view: the filter box, the level chips, the field
 * rail, the density ribbon, wrap, stack folding, download, Analyze, the
 * selection menu, the virtualised rows. All of it read straight from
 * `useK8sStore`, which meant it could only ever show the pod that was open.
 *
 * Search results want exactly that view over different lines. The alternative
 * was a second component that looks like this one — and a lookalike is a
 * promise to keep two implementations in step forever, which nobody does. The
 * first version of the results page was one, and every difference between them
 * was a bug.
 *
 * So the lines become a dependency. The default is the pod store, so the pod's
 * Logs tab is unchanged and passes nothing; a caller that has its own lines
 * provides them and gets the same view.
 *
 * ── What a provider must be honest about ──
 *
 * `isSnapshot`. A live pod can be re-fetched, followed, asked for its previous
 * run and asked for a different window; a search result that happened at
 * 1:16 AM can do none of those. The controls for them are hidden rather than
 * wired to nothing, because a Fetch button that cannot fetch is worse than no
 * Fetch button.
 */
import { createContext, useContext } from 'react';
import { useK8sStore } from '../../store/k8s-store';

type K8sStore = ReturnType<typeof useK8sStore.getState>;

/**
 * Everything `LogViewer` reads. Listed rather than widened to the whole store,
 * so adding a store read to the view is a compile error here — which is the
 * moment to decide what a snapshot should do about it.
 */
export type LogSource = Pick<K8sStore,
  | 'logs' | 'logStatus' | 'logDetail' | 'logDropped' | 'logFilter' | 'logLevels'
  | 'logRequestedAt' | 'logFieldFilters' | 'addFieldFilter' | 'removeFieldFilter'
  | 'logFollow' | 'logLive' | 'logTail' | 'logDirection' | 'logSince' | 'logWrap'
  | 'logPrevious' | 'logFrom' | 'logTo' | 'setLogWindow' | 'detail' | 'runtime'
  | 'setLogFilter' | 'setLogFollow' | 'setLogLive' | 'setLogTail' | 'setLogDirection'
  | 'setLogSince' | 'setLogWrap' | 'setLogPrevious' | 'setLogSelection'
  | 'fetchLogs' | 'openLogExport' | 'logExportOpen' | 'closeLogExport'
  | 'toggleLogLevel' | 'clearFieldFilters' | 'logLineNumbers'
  | 'logContainer' | 'setLogContainer' | 'closeDetail'
> & {
  /**
   * True when these lines are a result that already happened.
   *
   * Everything that reaches back to the cluster — Fetch, Following, previous
   * run, the tail size, the time window, first/last/between — is hidden under
   * it. They are not disabled: a greyed row of controls that can never work is
   * clutter pretending to be a feature.
   */
  isSnapshot?: boolean;
  /** What the view calls this log, where it is not one pod's. */
  title?: string;
  /**
   * The most surrounding lines this buffer can supply.
   *
   * A live log holds everything it fetched, so any rung of the context ladder
   * can be satisfied from it. A search result holds each hit plus the few
   * lines the search asked for either side — so the rungs above that would
   * change the dropdown and not the page, which is the worst kind of control.
   * Set it and the ladder stops where the lines do.
   */
  contextCap?: number;
  /**
   * One clock for every pane of a split, when the reader asks for it.
   *
   * Each ribbon otherwise scales to its own lines, which is right for one log
   * and wrong for three side by side: the same height meant a different
   * instant in each, so a burst that hit all three pods at 14:02 was drawn at
   * three different heights. With this set, every pane's ribbon spans the same
   * start and end and the burst lines up across the split.
   */
  sharedRange?: { from: number; to: number };
  /**
   * These lines are one window onto a longer list — a downloaded log of
   * millions of lines the view could never hold at once.
   *
   * `first` is where `logs[0]` sits in the whole list and `total` how long it
   * is. Scrolling near either edge asks for the next window, and the line at
   * the top of the screen stays put while lines arrive above it or are dropped.
   */
  paging?: {
    first: number;
    total: number;
    /** The list is still growing (a download or a filter still running). */
    partial?: boolean;
    loading?: 'earlier' | 'later';
    loadEarlier: () => void;
    loadLater: () => void;
  };
  /** A line to bring on screen and mark, for a source with no pod link to carry it. */
  focusSeq?: number;
  /**
   * Told when the reader picks "±N lines around" — a paged source filters on
   * the host, and has to bring those surrounding lines back with the hits.
   */
  onFindContext?: (n: number) => void;
};

const Ctx = createContext<LogSource | null>(null);

export const LogSourceProvider = Ctx.Provider;

/**
 * The lines this view is showing.
 *
 * Both hooks run every time — a hook behind a condition is the other way this
 * could have been written and it is not allowed to be. The store subscription
 * costs nothing extra when a provider wins, because the view was subscribing
 * to the whole store already.
 */
export function useLogSource(): LogSource {
  const provided = useContext(Ctx);
  const store = useK8sStore();
  return provided ?? (store as unknown as LogSource);
}
