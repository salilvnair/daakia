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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconSize, ModalView, ButtonView, CheckboxView, PopoverView, AvatarView, ChipView, SplitPanelView } from '@salilvnair/dui';
import { DownloadIcon, ChevronDownIcon, SidebarRightIcon } from '../../icons';
import { podHue, podInitials } from './pod-hue';
import { downloadMaxMb, LOG_DOWNLOAD_MAX_KEY } from './log-settings';
import type { PodGroup } from '../../store/dk8s-search-store';
import {
  TimeWindowPicker, windowError, windowOptions, type TimeWindow,
} from './TimeWindow';
import { postMsg } from '../../vscode';
import { logUiEvent } from '../../store/ui-audit-store';
import {
  ChevronLeftIcon, FileTextIcon, LayersIcon, SparkleIcon, SearchIcon,
  ServerIcon, ClockIcon, NetworkIcon, ColumnsIcon,
} from '../../icons';
import { logLineSettings } from './log-settings';
import { useUiStateStore, usePersistedPref } from '../../store/ui-state-store';
import { LogViewer } from './LogViewer';
import { LogSourceProvider, type LogSource } from './log-source';
import { useResultTabStore, type SearchedPod } from '../../store/dk8s-result-tab-store';
import { useSplitStore, MAX_PANES, type SplitMode } from '../../store/dk8s-split-store';
import { SPLIT_MODES } from './SplitLogs';
import { useK8sStore, type PodSummary } from '../../store/k8s-store';
import { useTabsStore } from '../../store/tabs-store';
import { useDk8sAiStore } from '../../store/dk8s-ai-store';
import { useDk8sSearchStore } from '../../store/dk8s-search-store';
import { AiSplit } from './AiAnswerPanel';
import { resultLines, podsLabel, podsIn, timings, totals, type ResultLine } from './search-results';
import { HitsByPodRail, HitFieldsRail } from './HitRails';
import { FollowView } from './FollowView';
import { useFieldReaders, useFollowPrefs, type SavedFollow } from './follow-prefs';
import { valueOf } from './field-readers';
import { atLeast } from './follow';
import { snapshotSource, standIn } from './snapshot-source';
import { filterLines } from './log-view';
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

/**
 * How much of the surrounding log to write per hit.
 *
 * Far bigger than the page can show, and deliberately. On screen ±5 is about
 * the limit of what anybody reads around a hit; in a file ±1,000 is how you
 * get the whole request that produced the error, and the cost is disk rather
 * than a view you cannot scroll.
 *
 * Anything past the first rung means going back to the cluster — the page
 * holds only what the search brought back — so the dialog says when it is
 * about to.
 */
const DOWNLOAD_CONTEXT = [0, 100, 500, 1000, 2000, 5000, 10000];

/** `YYYY-MM-DDTHH:mm` on the reader's own clock, which is what the picker takes. */
function localInput(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    + `T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * When the hits happened — the first and the last, to the minute.
 *
 * This is the window the dialog opens on, because it is the one the reader
 * already has: they searched, they got hits between 10:00 and 10:30, and what
 * they want on disk is that half hour. Widening it from there is a decision
 * made against a real number rather than a guess at one.
 *
 * Lines with no timestamp of their own are skipped, and their neighbours with
 * them: a window stretched by a line that was only kept for being nearby is a
 * window nobody asked for. A log whose format carries no timestamps gives no
 * span at all, and the dialog opens on everything — which is true, rather than
 * a range invented from nothing.
 */
export function hitSpan(lines: { ts?: number; context?: boolean }[]):
{ from: number; to: number } | undefined {
  let from: number | undefined;
  let to: number | undefined;
  for (const l of lines) {
    if (l.context || l.ts === undefined) continue;
    if (from === undefined || l.ts < from) from = l.ts;
    if (to === undefined || l.ts > to) to = l.ts;
  }
  return from !== undefined && to !== undefined ? { from, to } : undefined;
}

/**
 * Downloading the result.
 *
 * Two different acts behind one button, and the dialog is honest about which
 * one it is doing. Left alone it writes what is on screen — already fetched,
 * already filtered, instant. Ask for more surrounding lines or a different
 * window and there is nothing on the page to widen from: the search runs
 * again, against the cluster, with the wider question.
 */
function DownloadModal({ lines, name, onClose }: {
  lines: ResultLine[]; name: string; onClose: () => void;
}) {
  const { query, regex, caseSensitive, searched } = useResultTabStore();
  const [keepTimestamps, setKeepTimestamps] = useState(true);
  const [contextLines, setContextLines] = useState(0);
  const exportLines = useK8sStore(s => s.exportLines);
  const exportState = useK8sStore(s => s.exportState);
  const busy = exportState?.phase === 'running';

  const span = useMemo(() => hitSpan(lines), [lines]);
  const [window_, setWindow] = useState<TimeWindow>(() => (span
    ? { kind: 'between', from: localInput(span.from), to: localInput(span.to) }
    : { kind: 'all', from: '', to: '' }));

  const problem = windowError(window_);
  /* Untouched, and no extra context: the page already holds the answer. */
  const asShown = contextLines === 0 && span !== undefined
    && window_.kind === 'between'
    && window_.from === localInput(span.from)
    && window_.to === localInput(span.to);

  const body = useMemo(() => lines.map(l => (
    keepTimestamps && l.ts !== undefined
      ? `${new Date(l.ts).toISOString()} ${l.text}`
      : l.text
  )), [lines, keepTimestamps]);

  const submit = () => {
    if (asShown) {
      exportLines(name, searched[0]?.namespace ?? '', body);
      onClose();
      return;
    }
    logUiEvent('dk8s.results_export_refetch', {
      query, contextLines, window: window_.kind, pods: searched.length,
    });
    postMsg({
      type: 'dk8s:exportSearch',
      targets: searched.map(t => ({
        context: t.context, namespace: t.namespace, pod: t.pod,
        containers: t.containers,
      })),
      options: {
        query, regex, caseSensitive,
        contextLines,
        combine: true,
        includePrevious: false,
        keepTimestamps,
        ...windowOptions(window_),
      },
    });
    onClose();
  };

  return (
    <ModalView
      open onClose={onClose} size="lg"
      title="Download these results"
      subtitle={asShown
        ? `${lines.length.toLocaleString()} line${lines.length === 1 ? '' : 's'}, exactly as shown`
        : `${searched.length} pod${searched.length === 1 ? '' : 's'}, read again for this`}
      headerColor={ACCENT}
      footerRight={
        <div className="flex items-center gap-2">
          <ButtonView label="Cancel" size="sm" variant="secondary" onClick={onClose} />
          <ButtonView
            label={busy ? 'Writing…' : 'Download'}
            size="sm" variant="secondary"
            disabled={busy || !!problem || (asShown && !lines.length)}
            accentColor={ACCENT} color={ACCENT}
            onClick={submit}
          />
        </div>
      }
    >
      <div className="flex flex-col gap-4 py-1">
        <div className="flex flex-col gap-1.5">
          <span className="text-[9.5px] uppercase tracking-wider"
                style={{ color: 'var(--color-text-muted)' }}>
            when
          </span>
          <TimeWindowPicker value={window_} onChange={setWindow} accent={ACCENT} />
          <span className="text-[10.5px]"
                style={{ color: problem ? 'var(--color-error)' : 'var(--color-text-muted)' }}>
            {problem ?? (span
              ? `The hits run from ${new Date(span.from).toLocaleTimeString()} to `
                + `${new Date(span.to).toLocaleTimeString()}. Change it and the pods are read again.`
              : 'These lines carry no timestamps, so there is no window to open on.')}
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[9.5px] uppercase tracking-wider"
                style={{ color: 'var(--color-text-muted)' }}>
            lines around each hit
          </span>
          <div className="flex flex-wrap gap-1">
            {DOWNLOAD_CONTEXT.map(n => (
              <button
                key={n} type="button"
                onClick={() => setContextLines(n)}
                className="text-[11px] px-2 py-1 rounded-md cursor-pointer"
                style={{
                  color: contextLines === n ? ACCENT : 'var(--color-text-secondary)',
                  background: contextLines === n
                    ? `color-mix(in srgb, ${ACCENT} 16%, transparent)`
                    : 'transparent',
                  border: `1px solid ${contextLines === n
                    ? `color-mix(in srgb, ${ACCENT} 42%, transparent)`
                    : 'var(--color-surface-border)'}`,
                  fontWeight: contextLines === n ? 600 : 400,
                }}
              >
                {n === 0 ? 'as shown' : `±${n.toLocaleString()}`}
              </button>
            ))}
          </div>
        </div>

        <CheckboxView
          label="Keep timestamps"
          checked={keepTimestamps}
          onChange={setKeepTimestamps}
          size="md" accentColor={ACCENT}
        />

        <div className="flex flex-col gap-1 px-3 py-2 rounded-md"
             style={{ background: 'var(--color-surface-hover)' }}>
          <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
            {asShown ? (
              <>
                Written as{' '}
                <code style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                  {name.replace(/[^A-Za-z0-9._-]/g, '_')}.log
                </code>
                {' '}&mdash; every pod&rsquo;s matches in the one file, in the order they
                are on screen. Nothing is fetched.
              </>
            ) : (
              <>
                One file per pod. The search runs again against {searched.length}{' '}
                pod{searched.length === 1 ? '' : 's'} for this, because the page
                holds only the lines the first search brought back &mdash; so it
                reads from the cluster and takes as long as a search does.
              </>
            )}
            {' '}You will be asked where to put it.
          </span>
        </div>
      </div>
    </ModalView>
  );
}

/* ── The page ── */


/**
 * Open the searched pods as live panes.
 *
 * ── Why it belongs on this page ──
 *
 * A search is how you find out which pods are involved; following them is what
 * you do next. Without this the route there is: read the result, remember three
 * pod names, go back to the grid, find them among thirty, select them, split
 * open. The page already knows exactly which pods it searched, so it can do
 * that in one press.
 *
 * ── What it opens ──
 *
 * Live tails, not the result. The result is a snapshot of lines that already
 * happened and is on the tab behind this button; a pane is `kubectl logs` from
 * now on. They answer different questions and both are worth having, which is
 * why this opens beside the result rather than replacing it.
 *
 * Four at most, and the grid is the only mode that holds four — the submenu
 * says how many each arrangement will take, before it is chosen, because a
 * search over six pods and a mode that holds three is a decision about which
 * three, and it should not be a surprise.
 */
/**
 * "Open logs": a searched pod's whole log, downloaded, in a new tab.
 *
 * A result holds each hit and a few lines around it — never the whole story of
 * one thread or one request. This opens the pod's full log (live, and its
 * archive where one is configured) in the Logs tab's own view, landed on the
 * pod's first hit, where the filter runs over the whole download. Pods with
 * hits come first; one pod opens straight away.
 */
function OpenFullLogs({ searched, groups }: { searched: SearchedPod[]; groups: PodGroup[] }) {
  const [menu, setMenu] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const openTab = useTabsStore(st => st.openDk8sLogFileTab);
  const livePods = useK8sStore(st => st.pods);

  const pods = useMemo(() => {
    const firstHit = (t: SearchedPod) => groups
      .find(g => g.result.pod === t.pod && g.result.namespace === t.namespace && g.result.context === t.context && g.matches.length)
      ?.matches[0];
    return searched
      .map(t => ({ t, hit: firstHit(t), hits: groups.filter(g => g.result.pod === t.pod).reduce((n, g) => n + g.matches.length, 0) }))
      .sort((a, b) => b.hits - a.hits);
  }, [searched, groups]);

  const open = (t: SearchedPod, hit?: { ts?: number; text: string }) => {
    setMenu(false);
    const live = livePods.find(p => p.name === t.pod && p.namespace === t.namespace && (p.context ?? '') === t.context);
    logUiEvent('dk8s.results_open_full_log', { hit: !!hit });
    openTab({
      context: t.context, namespace: t.namespace, pod: t.pod,
      container: t.containers.length === 1 ? t.containers[0] : undefined,
      workload: live?.workload?.name,
      focus: hit ? { ts: hit.ts, text: hit.text } : undefined,
    });
  };

  if (!pods.length) return null;

  return (
    <span ref={anchor}>
      <ButtonView
        variant="secondary"
        size="sm"
        accentColor={ACCENT}
        color={ACCENT}
        iconLeft={<FileTextIcon size={IconSize.action} />}
        iconRight={pods.length > 1 ? <ChevronDownIcon size={IconSize.action} /> : undefined}
        title="Download a pod's whole log to a temporary file and open it in a new tab — deleted when you close the tab"
        onClick={() => (pods.length === 1 ? open(pods[0].t, pods[0].hit) : setMenu(m => !m))}
      >
        Open logs
      </ButtonView>
      <PopoverView
        testId="dk8s-open-full-logs"
        open={menu}
        onClose={() => setMenu(false)}
        anchorEl={anchor.current}
        placement="bottom"
        borderRadius={12}
      >
        <OpenLogsMenu pods={pods} onOpen={open} />
      </PopoverView>
    </span>
  );
}

/** The "Open logs" list: which pod, how much it matched, and what opening it does. */
function OpenLogsMenu({ pods, onOpen }: {
  pods: { t: SearchedPod; hit?: { ts?: number; text: string }; hits: number }[];
  onOpen: (t: SearchedPod, hit?: { ts?: number; text: string }) => void;
}) {
  const capMb = downloadMaxMb(useUiStateStore(st => st.prefs[LOG_DOWNLOAD_MAX_KEY]));
  const cap = capMb >= 1024 ? `${+(capMb / 1024).toFixed(2)} GB` : `${capMb} MB`;
  const most = Math.max(1, ...pods.map(p => p.hits));
  return (
    <div className="flex flex-col" style={{ width: 380, maxWidth: '80vw', overflow: 'hidden', borderRadius: 12 }}>
      <div className="flex items-center gap-2.5 px-3.5 py-3"
           style={{
             background: `linear-gradient(135deg, color-mix(in srgb, ${ACCENT} 22%, transparent), color-mix(in srgb, ${ACCENT} 4%, transparent))`,
             borderBottom: `1px solid color-mix(in srgb, ${ACCENT} 25%, var(--color-surface-border))`,
           }}>
        <span className="inline-flex items-center justify-center rounded-lg"
              style={{ width: 28, height: 28, background: `color-mix(in srgb, ${ACCENT} 24%, transparent)`, color: ACCENT }}>
          <DownloadIcon size={15} />
        </span>
        <div className="flex flex-col min-w-0">
          <span className="text-[12.5px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Open a pod&rsquo;s whole log</span>
          <span className="text-[10.5px]" style={{ color: 'var(--color-text-secondary)' }}>
            live + archive, in a new tab · up to {cap}
          </span>
        </div>
      </div>

      <div className="flex flex-col p-1.5 gap-0.5" style={{ maxHeight: 360, overflowY: 'auto' }}>
        {pods.map(({ t, hit, hits }) => {
          const hue = podHue(t.pod);
          return (
            <button
              key={`${t.context}/${t.namespace}/${t.pod}`}
              type="button"
              onClick={() => onOpen(t, hit)}
              className="dk8s-open-row flex items-center gap-2.5 w-full text-left rounded-lg cursor-pointer border-none"
              style={{
                padding: '8px 10px',
                background: 'transparent',
                opacity: hits ? 1 : 0.62,
                ['--row-hue' as string]: hue,
              }}
            >
              <AvatarView initials={podInitials(t.pod)} name={t.pod} size="sm" color={hue} />
              <span className="flex flex-col min-w-0 flex-1 gap-1">
                <span className="font-mono text-[12px] truncate" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{t.pod}</span>
                <span className="flex items-center gap-1.5 min-w-0">
                  {/* How much of the result this pod holds, against the busiest. */}
                  <span className="rounded-full overflow-hidden shrink-0" style={{ width: 54, height: 4, background: 'var(--color-surface-border)' }}>
                    <span className="block h-full rounded-full" style={{ width: `${Math.round((hits / most) * 100)}%`, background: hue }} />
                  </span>
                  <span className="text-[10.5px] truncate" style={{ color: 'var(--color-text-muted)' }}>
                    {hits ? 'opens at its first hit' : 'no hits — opens at the end'} · {t.namespace}
                  </span>
                </span>
              </span>
              <ChipView
                size="xs"
                rounded
                label={hits ? `${hits.toLocaleString()} hit${hits === 1 ? '' : 's'}` : 'no hits'}
                color={hits ? hue : 'var(--color-text-muted)'}
              />
            </button>
          );
        })}
      </div>

      <div className="px-3.5 py-2 text-[10.5px]"
           style={{ color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-surface-border)' }}>
        Saved to a temporary file and deleted when you close the tab.
      </div>
      <style>{`.dk8s-open-row:hover { background: color-mix(in srgb, var(--row-hue) 12%, transparent) !important; }
.dk8s-open-row:focus-visible { outline: 2px solid var(--row-hue); outline-offset: -2px; }`}</style>
    </div>
  );
}

function SplitOpenResults({ searched }: { searched: SearchedPod[] }) {
  const [menu, setMenu] = useState(false);
  const openSplit = useSplitStore(s => s.open);
  /* The panes live on the dk8s surface, which is where this goes: a split is
     the pod view, and the result stays on its own tab to come back to. */
  const openDk8sTab = useTabsStore(s => s.openDk8sTab);
  const livePods = useK8sStore(s => s.pods);
  /* The same tail Settings gives the detail view, so a pane opened from a
     result starts on the number of lines everything else does. */
  const prefs = useUiStateStore(s => s.prefs);
  const tailDefault = useMemo(() => logLineSettings(prefs).tailDefault, [prefs]);

  /*
    The grid's own pod when it still has one, because it carries the health
    dot, the workload badge and the real container list. A pod the grid has
    never seen — a different namespace, a watch since stopped — is opened from
    what the search recorded about it, which is enough to tail.
  */
  const podsToOpen = useMemo(() => searched.map(t => livePods.find(
    p => p.name === t.pod && p.namespace === t.namespace && (p.context ?? '') === t.context,
  ) ?? ({
    name: t.pod,
    namespace: t.namespace,
    context: t.context,
    uid: `${t.context}/${t.namespace}/${t.pod}`,
    phase: 'Unknown',
    ready: { current: 0, total: 0 },
    restarts: 0,
    containers: t.containers.map(name => ({ name, ready: false, restarts: 0, image: '' })),
    healthy: false,
    deleting: false,
  } as PodSummary)), [searched, livePods]);

  if (podsToOpen.length < 2) return null;

  const openAs = (mode: SplitMode) => {
    setMenu(false);
    logUiEvent('dk8s.results_split_open', { mode, pods: podsToOpen.length });
    /* Marked as coming from here, so the split's own Back lands on this page
       rather than on the grid — one step back, not two. */
    openSplit(podsToOpen, mode, tailDefault, 'results');
    openDk8sTab();
  };

  return (
    <div className="relative">
      <ButtonView
        variant="secondary"
        size="sm"
        accentColor={ACCENT}
        color={ACCENT}
        iconLeft={<ColumnsIcon size={IconSize.action} strokeWidth={2} />}
        iconRight={<ChevronDownIcon size={IconSize.action} />}
        onClick={() => setMenu(v => !v)}
        title={`Follow these ${podsToOpen.length} pods side by side`}
      >
        Split open
      </ButtonView>

      {menu && (
        <div
          className="absolute right-0 top-full mt-1.5 rounded-lg overflow-hidden z-40"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-surface-border)',
            boxShadow: '0 8px 24px rgba(0,0,0,.34)',
            minWidth: 214,
          }}
        >
          {SPLIT_MODES.map(({ id, label, Icon }) => {
            const room = Math.min(podsToOpen.length, MAX_PANES[id]);
            return (
              <button
                key={id} type="button"
                onClick={() => openAs(id)}
                className="flex items-center gap-2 w-full px-3 py-2 text-[11.5px] cursor-pointer border-none bg-transparent text-left"
                style={{ color: 'var(--color-text-primary)' }}
                onMouseEnter={e => { e.currentTarget.style.background = `color-mix(in srgb, ${ACCENT} 12%, transparent)`; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <Icon size={IconSize.item} color={ACCENT} />
                <span className="flex-1">{label}</span>
                <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                  {room < podsToOpen.length ? `first ${room}` : `${room} panes`}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * "Window": the minutes around the line you clicked, in a tab of their own.
 *
 * A hit at 11:00 and the question is what else the service did between 10:55
 * and 11:05 — every API, every downstream, every retry. The Window tab reads
 * that stretch on the pods this search covered and summarises it.
 */
function OpenWindow({ line, searched, query }: { line?: ResultLine; searched: SearchedPod[]; query: string }) {
  const open = useTabsStore(s => s.openDk8sWindowTab);
  const usable = !!line && line.ts !== undefined;
  return (
    <ButtonView
      variant="secondary" size="sm" accentColor={ACCENT} color={usable ? ACCENT : undefined}
      disabled={!usable}
      iconLeft={<ClockIcon size={IconSize.action} />}
      title={usable
        ? 'What ran in the ten minutes around this line, on every pod searched — in a new tab'
        : line ? 'This line has no timestamp to put a window around' : 'Click a line first — the window is around it'}
      onClick={() => {
        if (!line || line.ts === undefined) return;
        logUiEvent('dk8s.results_open_window', { pods: searched.length });
        open({
          anchor: {
            pod: line.pod, ts: line.ts, text: line.text, level: line.level,
            message: line.message, thread: line.thread, fields: line.fields,
          },
          pods: searched, half: 300, query,
        });
      }}
    >
      Window
    </ButtonView>
  );
}

/** The fields panel's floor: the longest field name and a value beside it, the left rail's own minimum. */
const FIELDS_MIN = 260;

/**
 * The right panel's switch, drawn like the left panel's: the same size, the
 * same pressed look — the two panels are one idea on two sides of the lines.
 */
function FieldsRailToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={open ? 'Hide the fields panel' : 'Show the fields panel'}
      aria-pressed={open}
      className="flex items-center justify-center shrink-0 border-none cursor-pointer"
      style={{
        width: 30, height: 26, borderRadius: 6, marginLeft: 'auto', alignSelf: 'center',
        color: open ? ACCENT : 'var(--color-text-muted)',
        background: open ? 'color-mix(in srgb, var(--color-dk8s) 16%, transparent)' : 'transparent',
        border: open ? '1px solid color-mix(in srgb, var(--color-dk8s) 34%, transparent)' : '1px solid transparent',
      }}
    >
      <SidebarRightIcon size={15} />
    </button>
  );
}

export function SearchResultsPage() {
  /* Open or closed, kept — the width is the split's own. */
  const [fieldsRail, setFieldsRail] = usePersistedPref<'open' | 'closed'>('dk8s.search.fieldsRail', 'open', ['open', 'closed']);
  const fieldsOpen = fieldsRail === 'open';
  const {
    query, groups, at, scanned, searched,
    tab, setTab, filter, setFilter, levels, setLevels, contextLines,
    fields, addField, removeField, clearFields, wrap, setWrap,
    pods: shownPods, setPods, selected, setSelected, columns, toggleColumn,
    floors, setFloor, charts, toggleChart, follow, setFollow,
  } = useResultTabStore();
  const openDk8sTab = useTabsStore(s => s.openDk8sTab);
  /*
    Back reopens the dialog this page came out of.

    The page IS the result of that search, so the thing behind it is the
    search — with its other pods, its tabs and its options — not the pod grid
    two screens further back. `cameFromSearch` is set by "Open as page" for
    exactly this, and is false for a page restored on a fresh session, where
    there is no dialog to go back to and the grid is the honest answer.
  */
  const cameFromSearch = useDk8sSearchStore(s => s.cameFromSearch);
  const returnToSearch = useDk8sSearchStore(s => s.returnToSearch);
  const goBack = useCallback(() => {
    if (cameFromSearch) {
      openDk8sTab();
      returnToSearch();
      return;
    }
    openDk8sTab();
  }, [cameFromSearch, openDk8sTab, returnToSearch]);
  const logLineNumbers = useK8sStore(s => s.logLineNumbers);
  const aiOpen = useDk8sAiStore(s => s.open);
  const openAi = useDk8sAiStore(s => s.openPanel);
  const closeAi = useDk8sAiStore(s => s.closePanel);
  const answers = useDk8sAiStore(s => s.answers);
  const readers = useFieldReaders();
  const { order, askAbove, views } = useFollowPrefs();

  const allLines = useMemo(() => resultLines(groups), [groups]);
  const podNames = useMemo(
    () => [...new Set([...podsIn(groups), ...searched.map(s => s.pod)])],
    [groups, searched],
  );
  const sums = useMemo(() => totals(groups, searched), [groups, searched]);

  /*
    What the rails narrow, before the view's own filters run.

    A pod picked in "hits by pod", and a floor from "Only when ≥ N" on a
    numeric card. The floor keeps a hit's neighbours with it — the lines around
    a slow call are why anybody asked for the slow calls.
  */
  const lines = useMemo(() => {
    let out = shownPods.length ? allLines.filter(l => shownPods.includes(l.pod)) : allLines;
    if (floors.length) {
      const keep = new Set<string>();
      for (const l of out) {
        if (l.context) continue;
        const ok = floors.every(f => atLeast([l], f.field, f.min, readers).length > 0);
        if (ok) keep.add(`${l.pod}\u0000${l.sourceLine}`);
      }
      out = out.filter(l => {
        for (let d = -contextLines; d <= contextLines; d++) if (keep.has(`${l.pod}\u0000${l.sourceLine + d}`)) return true;
        return false;
      });
    }
    return out;
  }, [allLines, shownPods, floors, readers, contextLines]);

  const selectedLine = useMemo(() => allLines.find(l => l.seq === selected), [allLines, selected]);

  const [downloadOpen, setDownloadOpen] = useState(false);

  /*
    What the download writes: what is on screen, not what came back.

    The same spec the view filters by, so the file and the page cannot
    disagree — somebody who narrowed to one logger and pressed Download meant
    that logger.
  */
  const onScreen = useMemo(
    () => filterLines(lines, {
      query: filter, levels, fields, contextLines: 0,
    }) as ResultLine[],
    [lines, filter, levels, fields],
  );

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
  const asPod = useMemo(() => standIn(
    query || 'search',
    [...new Set(searched.map(s => s.namespace))].join(', ') || '—',
    groups[0]?.result.context ?? '',
    `search:${at}`,
    'Search result',
    { current: sums.podsWithHits, total: sums.pods },
  ), [query, searched, groups, at, sums]);

  const startFollow = useCallback((field: string, value: string) => {
    if (!selectedLine) return;
    logUiEvent('dk8s.results_follow', { field, pods: searched.length });
    setFollow({
      conds: [{ field, value, on: true }],
      anchor: { pod: selectedLine.pod, ts: selectedLine.ts, text: selectedLine.text },
      width: 90,
      oneTimeline: true,
      onlyPod: false,
      tag: `follow:${Date.now()}`,
    });
  }, [selectedLine, searched.length, setFollow]);

  const openView = useCallback((v: SavedFollow) => {
    setFollow({
      conds: v.conds, anchor: v.anchor, width: v.width, oneTimeline: v.oneTimeline, onlyPod: v.onlyPod,
      tag: `follow:${Date.now()}`, pods: v.pods,
    });
  }, [setFollow]);

  const source = useMemo(() => snapshotSource({
    lines,
    view: {
      filter, setFilter, levels, setLevels, fields, addField, removeField, clearFields, wrap, setWrap,
    },
    detail: asPod,
    logDetail: `${sums.matches} match${sums.matches === 1 ? '' : 'es'} across ${sums.pods} pods`,
    requestedAt: at,
    lineNumbers: logLineNumbers,
    onExport: () => setDownloadOpen(true),
    onClose: goBack,
    title: query,
    /* The page can only show neighbours the search brought back. */
    contextCap: contextLines,
    extra: {
      selectedSeq: selected,
      onSelectLine: (l) => setSelected(l.seq === selected ? undefined : l.seq),
      selectedLabel: 'the line you clicked',
      podColumn: podNames.length > 1,
      columns: columns.map(key => ({
        key,
        value: (l) => valueOf(l, key, readers),
        onRemove: () => toggleColumn(key),
      })),
      railLead: (
        <HitsByPodRail
          lines={allLines}
          pods={podNames}
          shown={shownPods}
          current={selectedLine?.pod}
          onTogglePod={pod => setPods(shownPods.includes(pod) ? shownPods.filter(p => p !== pod) : [pod])}
          onLogger={logger => addField({ field: 'logger', value: logger, mode: 'include' })}
        />
      ),
      footerNote: 'Fields come from the logger’s own pattern and its MDC — nothing is guessed.',
    },
  }), [
    lines, allLines, filter, levels, fields, wrap, logLineNumbers, asPod, at, sums, query,
    addField, removeField, clearFields, setFilter, setLevels, setWrap, goBack, contextLines,
    selected, setSelected, podNames, columns, readers, toggleColumn, shownPods, setPods, selectedLine,
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
        <button type="button" onClick={goBack}
                title={cameFromSearch ? 'Back to the search' : 'Back to pods'}
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
            several. Following them all at once, though, is exactly what a
            result over several pods leads to — so that is offered here. */}
        <OpenFullLogs searched={searched} groups={groups} />
        <OpenWindow line={selectedLine} searched={searched} query={query} />
        <SplitOpenResults searched={searched} />

        <ButtonView
          variant={aiOpen ? 'accent' : 'secondary'}
          size="sm"
          accentColor={AI_ACCENT}
          color={aiOpen ? undefined : 'var(--color-text-secondary)'}
          iconLeft={<SparkleIcon size={IconSize.action} color={aiOpen ? undefined : AI_ACCENT} />}
          onClick={() => (aiOpen ? closeAi() : openAi())}
          title={aiOpen ? 'Hide AI analysis' : 'Show AI analysis'}
        >
          AI{answers.length > 0 ? ` · ${answers.length}` : ''}
        </ButtonView>
      </div>

      <AiSplit>
        {follow ? <FollowView /> : (
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
            {tab === 'logs' && columns.length > 0 && (
              <span className="flex items-center gap-1.5 ml-3 text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
                columns
                {columns.map(c => (
                  <ChipView key={c} size="xs" rounded label={c} color={ACCENT} onRemove={() => toggleColumn(c)} />
                ))}
              </span>
            )}
            {tab === 'logs' && (
              <FieldsRailToggle open={fieldsOpen} onToggle={() => setFieldsRail(fieldsOpen ? 'closed' : 'open')} />
            )}
          </div>

          <div className="flex-1 min-h-0 flex">
            {tab === 'overview' ? <SearchOverview /> : (
              /*
                The lines and the fields panel, split the way the Logs tab splits
                its left rail: dragged to a width, collapsed rather than unmounted
                so it opens again at that width, and switched from the top.
              */
              <SplitPanelView
                direction="horizontal"
                defaultSplit={76}
                minFirst={420}
                minSecond={FIELDS_MIN}
                collapsed={!fieldsOpen}
                collapsedSide="second"
                accentColor={ACCENT}
                style={{ flex: 1, minWidth: 0, minHeight: 0 }}
                first={
                <div className="flex-1 min-w-0 min-h-0 flex flex-col h-full">
                  <LogSourceProvider value={source}>
                    <LogViewer />
                  </LogSourceProvider>
                </div>
                }
                second={
                <HitFieldsRail
                  line={selectedLine}
                  lines={allLines}
                  readers={readers}
                  order={order}
                  askAbove={askAbove}
                  columns={columns}
                  floors={floors}
                  charts={charts}
                  views={views}
                  onFollow={startFollow}
                  onToggleColumn={toggleColumn}
                  onFloor={setFloor}
                  onToggleChart={toggleChart}
                  onOpenView={openView}
                />
                }
              />
            )}
          </div>
        </div>
        )}
      </AiSplit>

      {downloadOpen && (
        <DownloadModal
          lines={onScreen}
          name={query || 'search'}
          onClose={() => setDownloadOpen(false)}
        />
      )}
    </div>
  );
}
