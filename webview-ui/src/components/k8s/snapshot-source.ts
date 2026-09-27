/**
 * A log view over lines that already happened.
 *
 * The results page, a Follow and a Window all show the pod's own log view over
 * lines they brought back — never a lookalike. Each needs the same `LogSource`
 * with everything that reaches the cluster stubbed and hidden by `isSnapshot`,
 * so it is built once here, and each page supplies only what differs: its
 * lines, its filters, and what it has to say about them.
 */
import { useCallback, useMemo, useState } from 'react';
import type { LogLevel, LogLine, PodSummary } from '../../store/k8s-store';
import type { FieldFilter } from './log-view';
import type { LogSource } from './log-source';

export interface SnapshotView {
  filter: string;
  setFilter: (q: string) => void;
  levels: LogLevel[];
  setLevels: (l: LogLevel[]) => void;
  fields: FieldFilter[];
  addField: (f: FieldFilter) => void;
  removeField: (field: string, value: string) => void;
  clearFields: () => void;
  wrap: boolean;
  setWrap: (w: boolean) => void;
}

/** The reader's own filters, for a view whose page has no store of its own. */
export function useSnapshotView(initial: Partial<Pick<SnapshotView, 'filter' | 'wrap'>> = {}): SnapshotView {
  const [filter, setFilter] = useState(initial.filter ?? '');
  const [levels, setLevels] = useState<LogLevel[]>([]);
  const [fields, setFields] = useState<FieldFilter[]>([]);
  const [wrap, setWrap] = useState(initial.wrap ?? false);
  const addField = useCallback((f: FieldFilter) => setFields(prev => {
    const existing = prev.find(x => x.field === f.field && x.value === f.value);
    if (!existing) return [...prev, f];
    if (existing.mode === f.mode && f.mode === 'include') return prev;
    return prev.map(x => (x === existing ? { ...x, mode: x.mode === 'include' ? 'exclude' as const : 'include' as const } : x));
  }), []);
  const removeField = useCallback((field: string, value: string) =>
    setFields(prev => prev.filter(x => !(x.field === field && x.value === value))), []);
  const clearFields = useCallback(() => setFields([]), []);
  return { filter, setFilter, levels, setLevels, fields, addField, removeField, clearFields, wrap, setWrap };
}

export interface SnapshotInput {
  lines: LogLine[];
  view: SnapshotView;
  /** What the view is about, named: the search, the value followed, the window. */
  detail: PodSummary;
  /** The footer's right-hand sentence. */
  logDetail: string;
  requestedAt: number;
  lineNumbers: boolean;
  onExport: () => void;
  onClose: () => void;
  title?: string;
  contextCap?: number;
  extra?: Partial<LogSource>;
}

const nothing = () => {};

export function snapshotSource(i: SnapshotInput): LogSource {
  const { view } = i;
  return {
    logs: i.lines,
    logStatus: 'ended',
    logDetail: i.logDetail,
    logDropped: 0,
    logFilter: view.filter,
    logLevels: view.levels,
    logRequestedAt: i.requestedAt,
    logFieldFilters: view.fields,
    addFieldFilter: view.addField,
    removeFieldFilter: view.removeField,
    clearFieldFilters: view.clearFields,
    logFollow: false,
    logLive: false,
    logTail: 0,
    logDirection: 'last',
    logSince: 0,
    logWrap: view.wrap,
    logPrevious: false,
    logFrom: undefined,
    logTo: undefined,
    logLineNumbers: i.lineNumbers,
    logContainer: undefined,
    logExportOpen: false,
    detail: i.detail,
    runtime: undefined,
    setLogFilter: view.setFilter,
    toggleLogLevel: (level: LogLevel) => view.setLevels(
      view.levels.includes(level) ? view.levels.filter(l => l !== level) : [...view.levels, level],
    ),
    setLogWrap: view.setWrap,
    /* Everything below reaches the cluster, and lines that already happened
       cannot. `isSnapshot` is what keeps any of them off the screen. */
    setLogFollow: nothing,
    setLogLive: nothing,
    setLogTail: nothing,
    setLogDirection: nothing,
    setLogSince: nothing,
    setLogPrevious: nothing,
    setLogWindow: nothing,
    setLogSelection: nothing,
    setLogContainer: nothing,
    fetchLogs: nothing,
    openLogExport: i.onExport,
    closeLogExport: nothing,
    closeDetail: i.onClose,
    isSnapshot: true,
    contextCap: i.contextCap ?? 0,
    title: i.title,
    ...i.extra,
  } as unknown as LogSource;
}

/** A pod-shaped name for lines that are not one pod's — what Export and Ask AI say they describe. */
export function standIn(name: string, namespace: string, context: string, uid: string, phase: string, ready?: { current: number; total: number }): PodSummary {
  return {
    name, namespace, context, uid, phase,
    ready: ready ?? { current: 0, total: 0 },
    restarts: 0,
    containers: [],
    healthy: true,
    deleting: false,
  } as PodSummary;
}

/** Memoised `snapshotSource`, for the common case. */
export function useSnapshotSource(i: SnapshotInput, deps: unknown[]): LogSource {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => snapshotSource(i), deps);
}
