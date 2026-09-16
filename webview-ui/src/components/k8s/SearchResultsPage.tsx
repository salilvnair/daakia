/**
 * A search result, in the pod detail's own clothes.
 *
 * ── Why it is not a lookalike ──
 *
 * The first version of this page reimplemented the log view: its own rows, its
 * own filter box, its own rail. It looked approximately right and was wrong in
 * every detail — no density ribbon, no field chips, no selection menu, no
 * Analyze, a toolbar that shared nothing with the one next door. A lookalike
 * is a promise to keep two implementations in step forever, and nobody keeps
 * it.
 *
 * So this is the real one. `LogViewer` takes its lines from a `LogSource` now,
 * defaulting to the pod store, and this provides a source built from the
 * result instead. Every control in that toolbar is the same control, because
 * it IS the same component — and the header and tab strip are the pod
 * detail's, for the same reason.
 *
 * ── What is different, and why it has to be ──
 *
 * The lines came from several pods and the search already happened. So there
 * is no Shell — a shell goes into one pod — and everything that reaches back
 * to the cluster is hidden by `isSnapshot`. What is left works on lines, and
 * works the same either way.
 */
import { useEffect, useMemo } from 'react';
import { IconSize } from '@salilvnair/dui';
import {
  ChevronLeftIcon, FileTextIcon, LayersIcon, SparkleIcon, SearchIcon,
  ServerIcon, ClockIcon, NetworkIcon,
} from '../../icons';
import { LogViewer } from './LogViewer';
import { LogSourceProvider, type LogSource } from './log-source';
import { useResultTabStore } from '../../store/dk8s-result-tab-store';
import { useK8sStore, type PodSummary } from '../../store/k8s-store';
import { useTabsStore } from '../../store/tabs-store';
import { useDk8sAiStore } from '../../store/dk8s-ai-store';
import { AiSplit } from './AiAnswerPanel';
import { resultLines, podsLabel, podsIn, timings, totals } from './search-results';
import { ACCENT, AI as AI_ACCENT } from './tone';

/* ── The pod detail's own header pieces, so the two read as one product ── */

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)]">{label}</span>
      <span className="text-[11.5px]" style={{ color: color ?? 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-1">
      <span className="text-[9.5px] uppercase tracking-wider shrink-0"
            style={{ width: 96, color: 'var(--color-text-muted)' }}>
        {label}
      </span>
      <span className="text-[11.5px] min-w-0" style={{ color: 'var(--color-text-primary)' }}>
        {children}
      </span>
    </div>
  );
}

function Card({ title, Icon, children }: {
  title: string; Icon: typeof LayersIcon; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 px-3.5 py-3 rounded-lg"
         style={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)' }}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={IconSize.action} color={ACCENT} />
        <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

const TABS = [
  { id: 'overview' as const, label: 'Overview', Icon: LayersIcon },
  { id: 'logs' as const, label: 'Logs', Icon: FileTextIcon },
];

/* ── Overview ── */

function SearchOverview() {
  const { query, groups, at, scanned, archiveRoots, searched, regex, caseSensitive } =
    useResultTabStore();
  const rows = useMemo(() => timings(groups, searched), [groups, searched]);
  const sums = useMemo(() => totals(groups, searched), [groups, searched]);

  const cell: React.CSSProperties = {
    padding: '6px 10px', textAlign: 'left', fontSize: 11,
    borderBottom: '1px solid var(--color-surface-border)',
  };

  return (
    <div className="flex-1 overflow-auto px-4 py-3 flex flex-col gap-3 h-full min-h-0">
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <Card title="the search" Icon={SearchIcon}>
          <Row label="term">
            <code style={{ fontFamily: 'var(--font-mono, monospace)', color: ACCENT }}>{query}</code>
          </Row>
          <Row label="matched">
            <span style={{ color: sums.matches ? ACCENT : 'var(--color-text-muted)', fontWeight: 600 }}>
              {sums.matches.toLocaleString()}
            </span>
            {' in '}{sums.podsWithHits} of {sums.pods} pod{sums.pods === 1 ? '' : 's'}
          </Row>
          <Row label="read">
            {/* Only the half that counts lines. `grep` inside a pod reports
                what matched and never how much it read. */}
            {scanned ? `${scanned.toLocaleString()} lines` : 'not counted'}
          </Row>
          <Row label="ran at">{new Date(at).toLocaleString()}</Row>
        </Card>

        <Card title="how it looked" Icon={LayersIcon}>
          <Row label="matching">{regex ? 'regular expression' : 'literal text'}</Row>
          <Row label="case">{caseSensitive ? 'matched exactly' : 'ignored'}</Row>
          <Row label="live logs">what each pod is printing now</Row>
          <Row label="archives">
            {archiveRoots.length
              ? <span style={{ color: 'var(--color-text-secondary)' }}>
                  read with <code style={{ fontFamily: 'var(--font-mono, monospace)' }}>grep</code> inside the pod
                </span>
              : <span style={{ color: 'var(--color-text-muted)' }}>none configured</span>}
          </Row>
        </Card>
      </div>

      {archiveRoots.length > 0 && (
        <Card title="archive paths, inside the pods" Icon={ServerIcon}>
          {archiveRoots.map(r => (
            <code key={r} className="text-[11px] block py-0.5"
                  style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--color-text-secondary)' }}>
              {r}
            </code>
          ))}
        </Card>
      )}

      <Card title="pods it searched" Icon={NetworkIcon}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--color-text-muted)', fontSize: 9.5, textTransform: 'uppercase' }}>
              <th style={cell}>Pod</th>
              <th style={cell}>Namespace</th>
              <th style={cell}>Where</th>
              <th style={cell}>Hits</th>
              <th style={cell}>Read</th>
              <th style={cell}>Took</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.pod}:${r.source}:${i}`}>
                <td style={{ ...cell, fontFamily: 'var(--font-mono, monospace)', color: 'var(--color-text-primary)' }}>
                  {r.pod}
                  {r.error && (
                    <div className="text-[10.5px]" style={{ color: 'var(--color-warning)' }}>{r.error}</div>
                  )}
                </td>
                <td style={{ ...cell, color: 'var(--color-text-secondary)' }}>{r.namespace}</td>
                <td style={{ ...cell, color: 'var(--color-text-secondary)' }}>
                  {r.source === 'archive' ? 'archive, in pod' : 'live log'}
                </td>
                <td style={{ ...cell, color: r.matched ? ACCENT : 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {r.matched.toLocaleString()}
                </td>
                <td style={{ ...cell, color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {r.scannedKnown ? `${r.scanned.toLocaleString()} lines`
                    : r.matched ? 'grep in pod' : 'no matches'}
                </td>
                <td style={{ ...cell, color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {r.elapsedMs !== undefined ? `${(r.elapsedMs / 1000).toFixed(1)}s` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="what came back" Icon={ClockIcon}>
        <span className="text-[11.5px]" style={{ color: 'var(--color-text-muted)' }}>
          {sums.matches
            ? 'Every matching line, with what surrounded it, is on the Logs tab.'
            : 'Nothing matched. The pods and paths above are where it looked — an '
              + 'empty result and a wrong path are the same empty list without them.'}
        </span>
      </Card>
    </div>
  );
}

/* ── The page ── */

export function SearchResultsPage() {
  const {
    query, groups, at, scanned, searched,
    tab, setTab, filter, setFilter, levels, setLevels,
    fields, addField, removeField, wrap, setWrap,
  } = useResultTabStore();
  const openDk8sTab = useTabsStore(s => s.openDk8sTab);
  const logLineNumbers = useK8sStore(s => s.logLineNumbers);
  const aiOpen = useDk8sAiStore(s => s.open);
  const openAi = useDk8sAiStore(s => s.openPanel);
  const closeAi = useDk8sAiStore(s => s.closePanel);
  const answers = useDk8sAiStore(s => s.answers);

  const lines = useMemo(() => resultLines(groups), [groups]);
  const podNames = useMemo(
    () => [...new Set([...podsIn(groups), ...searched.map(s => s.pod)])],
    [groups, searched],
  );
  const sums = useMemo(() => totals(groups, searched), [groups, searched]);

  /*
    Opening puts the search term in the filter box.

    It is what the page is about, so it is what the box should say — and it
    means the highlight, the hit counter and the step-between-matches arrows
    all work on the term without a second mechanism beside them. Clearing it
    shows every line that came back, neighbours included, which is the other
    thing people want here.
  */
  useEffect(() => {
    if (query) setFilter(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, at]);

  /*
    A pod-shaped stand-in for the thing these lines are about.

    Export and Ask AI both want to name what they are describing. There is no
    one pod to name, so this names the search — which is true, and better than
    quietly attributing a result spanning twelve pods to whichever happened to
    come back first.
  */
  const asPod = useMemo(() => ({
    name: query || 'search',
    namespace: [...new Set(searched.map(s => s.namespace))].join(', ') || '—',
    context: groups[0]?.result.context ?? '',
    uid: `search:${at}`,
    phase: 'Search result',
    ready: { current: sums.podsWithHits, total: sums.pods },
    restarts: 0,
    containers: [],
    healthy: true,
    deleting: false,
  } as PodSummary), [query, searched, groups, at, sums]);

  const source = useMemo(() => ({
    logs: lines,
    logStatus: 'ended',
    logDetail: `${sums.matches} match${sums.matches === 1 ? '' : 'es'} across ${sums.pods} pods`,
    logDropped: 0,
    logFilter: filter,
    logLevels: levels,
    logRequestedAt: at,
    logFieldFilters: fields,
    addFieldFilter: addField,
    removeFieldFilter: removeField,
    clearFieldFilters: () => fields.forEach(removeField),
    logFollow: false,
    logLive: false,
    logTail: 0,
    logDirection: 'last',
    logSince: 0,
    logWrap: wrap,
    logPrevious: false,
    logFrom: undefined,
    logTo: undefined,
    logLineNumbers,
    logContainer: undefined,
    logExportOpen: false,
    detail: asPod,
    runtime: undefined,
    setLogFilter: setFilter,
    toggleLogLevel: (level: (typeof levels)[number]) => setLevels(
      levels.includes(level) ? levels.filter(l => l !== level) : [...levels, level],
    ),
    setLogWrap: setWrap,
    /* Everything below reaches the cluster, and a result that already happened
       cannot. They exist because the view's shape says they do; `isSnapshot`
       is what stops any of them being on screen. */
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
    closeDetail: openDk8sTab,
    isSnapshot: true,
    title: query,
  } as unknown as LogSource), [
    lines, filter, levels, fields, wrap, logLineNumbers, asPod, at, sums, query,
    addField, removeField, setFilter, setLevels, setWrap, openDk8sTab,
  ]);

  if (!groups.length && !searched.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2">
        <SearchIcon size={22} style={{ color: 'var(--color-text-muted)' }} />
        <span className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
          No search has been opened here yet.
        </span>
        <button type="button" onClick={openDk8sTab}
                className="text-[11px] px-2.5 py-1.5 rounded-md cursor-pointer"
                style={{
                  color: ACCENT,
                  background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`,
                  border: 'none',
                }}>
          Go to Dk8s
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0"
         style={{ background: 'var(--color-bg, var(--color-surface))' }}>
      {/* ── Header — the pod detail's, with a search where the pod goes ── */}
      <div className="flex items-center gap-3 px-4 py-3 shrink-0"
           style={{
             borderBottom: '1px solid var(--color-surface-border)',
             background: `linear-gradient(to right, color-mix(in srgb, ${ACCENT} 8%, transparent), transparent 60%)`,
           }}>
        <button type="button" onClick={openDk8sTab} title="Back to pods"
                className="p-1 rounded cursor-pointer border-none bg-transparent">
          <ChevronLeftIcon size={IconSize.nav} color="var(--color-text-secondary)" />
        </button>

        <span style={{ width: 7, height: 7, borderRadius: 7, background: ACCENT, boxShadow: `0 0 8px ${ACCENT}` }} />

        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[13.5px] font-mono truncate" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
            {query}
          </span>
          <span className="text-[10.5px] text-[var(--color-text-muted)] truncate">
            {podsLabel(podNames)} · {groups[0]?.result.context ?? ''}
          </span>
        </div>

        <div className="flex items-center gap-5 ml-4 flex-wrap">
          <Stat label="matches" value={sums.matches.toLocaleString()}
                color={sums.matches ? ACCENT : undefined} />
          <Stat label="pods" value={`${sums.podsWithHits}/${sums.pods}`} />
          <Stat label="read" value={scanned ? `${scanned.toLocaleString()} lines` : '—'} />
          <Stat label="ran" value={new Date(at).toLocaleTimeString()} />
        </div>

        <div className="flex-1" />

        {/* No Shell: a shell goes into one pod, and this is a result from
            several. The AI toggle is the pod detail's own. */}
        <button
          type="button"
          onClick={() => (aiOpen ? closeAi() : openAi())}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] cursor-pointer"
          style={{
            background: aiOpen ? `color-mix(in srgb, ${AI_ACCENT} 22%, transparent)` : 'transparent',
            border: `1px solid ${aiOpen ? `color-mix(in srgb, ${AI_ACCENT} 55%, transparent)` : 'var(--color-surface-border)'}`,
            color: aiOpen ? '#fff' : 'var(--color-text-secondary)',
            fontWeight: aiOpen ? 600 : 400,
          }}
          title={aiOpen ? 'Hide AI analysis' : 'Show AI analysis'}
        >
          <SparkleIcon size={IconSize.action} color={AI_ACCENT} />
          AI{answers.length > 0 && ` · ${answers.length}`}
        </button>
      </div>

      <AiSplit>
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          <div className="flex items-center gap-1 px-4 pt-2 shrink-0"
               style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
            {TABS.map(({ id, label, Icon }) => {
              const on = tab === id;
              return (
                <button
                  key={id} type="button" data-tab={id}
                  onClick={() => setTab(id)}
                  className="flex items-center gap-1.5 px-3 py-2 text-[11.5px] cursor-pointer border-none bg-transparent transition-colors"
                  style={{
                    color: on ? ACCENT : 'var(--color-text-secondary)',
                    fontWeight: on ? 600 : 400,
                    borderBottom: `2px solid ${on ? ACCENT : 'transparent'}`,
                    marginBottom: -1,
                  }}
                >
                  <Icon size={IconSize.action} color={on ? ACCENT : 'var(--color-text-muted)'} />
                  {label}
                </button>
              );
            })}
          </div>

          <div className="flex-1 min-h-0">
            {tab === 'overview' ? <SearchOverview /> : (
              <LogSourceProvider value={source}>
                <LogViewer />
              </LogSourceProvider>
            )}
          </div>
        </div>
      </AiSplit>
    </div>
  );
}
