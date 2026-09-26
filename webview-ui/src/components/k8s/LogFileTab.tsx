/**
 * A pod's whole log, downloaded — shown in the Logs tab's own view.
 *
 * Everything the Logs tab does works here, because it is the same component
 * over a different source: the filter box (text or /regex/), level chips, the
 * thread / logger / MDC field rail, Follow a value, payload chips, the density
 * ribbon, Summary, Analyze and Ask AI. The difference is underneath: the lines
 * come a window at a time from a file on the host, and a filter runs over the
 * whole file there — so "this thread" or "this request id" is every line of
 * it the download holds, not just what is on screen.
 *
 * The download is temporary. Closing this tab deletes it; so does Daakia
 * closing. A tab restored after a restart downloads again.
 */
import { useEffect, useMemo } from 'react';
import { ButtonView, ProgressBarView } from '@salilvnair/dui';
import { LogViewer } from './LogViewer';
import { LogSourceProvider, type LogSource } from './log-source';
import { useLogFiles, type LogFileView } from '../../store/dk8s-logfile-store';
import type { RequestTab } from '../../store/tabs-store';
import type { PodSummary } from '../../store/k8s-store';

const ACCENT = 'var(--color-dk8s)';

function mb(bytes: number): string {
  return bytes >= 1024 * 1024 * 1024 ? `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function LogFileTab({ tab }: { tab: RequestTab }) {
  const id = tab.id;
  const target = tab.logFile;
  const view = useLogFiles(s => s.views[id]);
  const store = useLogFiles.getState();

  /* A tab opened now, or one restored after a restart: its file does not exist yet. */
  useEffect(() => {
    if (target && !useLogFiles.getState().views[id]) store.start(id, target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!target) {
    return <div className="flex-1 flex items-center justify-center text-[12px]" style={{ color: 'var(--color-text-muted)' }}>This tab has no pod to download.</div>;
  }

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: 'var(--color-bg, var(--color-surface))' }}>
      <Header id={id} view={view} />
      {view?.status === 'ready' ? <Body id={id} view={view} /> : <Waiting id={id} view={view} />}
    </div>
  );
}

function Header({ id, view }: { id: string; view?: LogFileView }) {
  const t = view?.target;
  const info = view?.info;
  const run = view?.filterRun;
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 shrink-0 flex-wrap"
         style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
      <div className="flex flex-col min-w-0">
        <span className="font-mono text-[13px] font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>{t?.pod}</span>
        <span className="text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>
          {t?.namespace} · {t?.context}{t?.container ? ` · ${t.container}` : ''}
        </span>
      </div>
      <span className="flex-1" />
      {info && (
        <span className="text-[11.5px]" style={{ color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
          {info.lines.toLocaleString()} lines · {mb(info.bytes)}
          {info.archive.files > 0 && ` · live + ${info.archive.files} archive file${info.archive.files === 1 ? '' : 's'}`}
          {info.format && ` · ${info.format.name}`}
        </span>
      )}
      {run && !run.done && (
        <span className="text-[11.5px]" style={{ color: ACCENT, fontVariantNumeric: 'tabular-nums' }}>
          Filtering the whole file… {Math.round((run.scanned / Math.max(1, run.total)) * 100)}% · {run.matched.toLocaleString()} so far
        </span>
      )}
      {run?.done && view?.filtered && (
        <span className="text-[11.5px]" style={{ color: ACCENT, fontVariantNumeric: 'tabular-nums' }}>
          {run.matched.toLocaleString()} of {run.total.toLocaleString()} lines match, across the whole file
        </span>
      )}
      <span className="text-[11px] px-2 py-0.5 rounded"
            title="Stored in ~/.salilvnair/daakia-vsce/temp/logs and deleted when this tab closes, or when Daakia closes."
            style={{ color: 'var(--color-text-muted)', background: 'color-mix(in srgb, var(--color-text-primary) 6%, transparent)' }}>
        temporary — deleted when you close this tab
      </span>
      {view && (view.status === 'ready' || view.status === 'error' || view.status === 'gone') && (
        <ButtonView variant="ghost" size="sm" onClick={() => useLogFiles.getState().start(id, view.target)}>Download again</ButtonView>
      )}
      {info?.capped && (
        <div className="w-full text-[11.5px]" style={{ color: 'var(--color-warning)' }}>
          {info.liveBytes >= info.capBytes * 0.99
            ? `The live log alone reached the ${mb(info.capBytes)} limit, so its newest lines are not here.`
            : `The download reached the ${mb(info.capBytes)} limit, so the oldest archived files were left out.`}
          {' '}Raise the limit in Settings → DK8S → Logs → Downloaded logs, then Download again.
        </div>
      )}
    </div>
  );
}

function Waiting({ id, view }: { id: string; view?: LogFileView }) {
  if (view?.status === 'error' || view?.status === 'gone') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <span className="text-[13px]" style={{ color: 'var(--color-text-primary)' }}>
          {view.status === 'gone' ? 'This download is no longer on disk.' : 'The download failed.'}
        </span>
        {view.error && <span className="text-[12px] max-w-[560px]" style={{ color: 'var(--color-text-muted)' }}>{view.error}</span>}
        <ButtonView variant="secondary" size="sm" accentColor={ACCENT} onClick={() => useLogFiles.getState().start(id, view.target)}>
          Download again
        </ButtonView>
      </div>
    );
  }
  const p = view?.progress;
  const phase = !p ? 'Asking the pod for its log…'
    : p.phase === 'live' ? 'Downloading the live log…'
    : p.phase === 'archive' ? `Downloading archived files${p.files ? ` (${p.files})` : ''}…`
    : 'Putting it together…';
  const pct = p ? Math.min(100, (p.bytes / Math.max(1, p.capBytes)) * 100) : 0;
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
      <span className="text-[13px]" style={{ color: 'var(--color-text-primary)' }}>{phase}</span>
      <div style={{ width: 360 }}>
        <ProgressBarView value={p ? pct : undefined} color={ACCENT} />
      </div>
      {p && (
        <span className="text-[11.5px]" style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
          {mb(p.bytes)} of at most {mb(p.capBytes)}{p.lines ? ` · ${p.lines.toLocaleString()} lines` : ''}
        </span>
      )}
    </div>
  );
}

function Body({ id, view }: { id: string; view: LogFileView }) {
  const s = useLogFiles.getState();
  const t = view.target;

  /* Export and Ask AI name what they describe: the pod, as the Logs tab would. */
  const detail = useMemo(() => ({
    name: t.pod, namespace: t.namespace, context: t.context, uid: `logfile:${id}`,
    phase: 'Downloaded log', ready: { current: 0, total: 0 }, restarts: 0, containers: [],
    healthy: true, deleting: false,
  } as unknown as PodSummary), [t.pod, t.namespace, t.context, id]);

  const source = useMemo(() => ({
    logs: view.lines,
    logStatus: 'ended',
    logDetail: view.filtered ? 'matches from the whole downloaded file' : 'the whole downloaded log',
    logDropped: 0,
    logFilter: view.filter,
    logLevels: view.levels,
    logRequestedAt: 0,
    logFieldFilters: view.fields,
    addFieldFilter: (f: Parameters<typeof s.addField>[1]) => s.addField(id, f),
    removeFieldFilter: (field: string, value: string) => s.removeField(id, field, value),
    clearFieldFilters: () => s.clearFields(id),
    logFollow: false,
    logLive: false,
    logTail: 0,
    logDirection: 'last',
    logSince: 0,
    logWrap: view.wrap,
    logPrevious: false,
    logFrom: undefined,
    logTo: undefined,
    logLineNumbers: true,
    logContainer: t.container,
    logExportOpen: false,
    detail,
    runtime: undefined,
    setLogFilter: (v: string) => s.setFilter(id, v),
    toggleLogLevel: (l: Parameters<typeof s.toggleLevel>[1]) => s.toggleLevel(id, l),
    setLogWrap: (on: boolean) => s.setWrap(id, on),
    setLogFollow: () => {},
    setLogLive: () => {},
    setLogTail: () => {},
    setLogDirection: () => {},
    setLogSince: () => {},
    setLogPrevious: () => {},
    setLogWindow: () => {},
    setLogSelection: () => {},
    setLogContainer: () => {},
    fetchLogs: () => {},
    openLogExport: () => {},
    closeLogExport: () => {},
    closeDetail: () => {},
    isSnapshot: true,
    title: t.pod,
    paging: {
      first: view.first,
      total: view.total,
      partial: view.partial,
      loading: view.loading === 'jump' ? undefined : view.loading,
      searching: view.searching ? {
        query: [view.filter.trim() && `“${view.filter.trim()}”`, view.levels.length && view.levels.join(' / '),
          view.fields.length && `${view.fields.length} field filter${view.fields.length === 1 ? '' : 's'}`]
          .filter(Boolean).join(' · '),
        scanned: view.filterRun?.scanned ?? 0,
        total: view.info?.lines ?? view.total,
        matched: view.filterRun?.matched ?? 0,
      } : undefined,
      loadEarlier: () => s.loadEarlier(id),
      loadLater: () => s.loadLater(id),
    },
    focusSeq: view.focusSeq,
    onFindContext: (n: number) => s.setContext(id, n),
  } as unknown as LogSource), [view, detail, id, s, t.container, t.pod]);

  return (
    <LogSourceProvider value={source}>
      <div className="flex-1 flex flex-col min-h-0">
        <LogViewer />
      </div>
    </LogSourceProvider>
  );
}
