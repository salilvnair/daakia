/**
 * Search several pods' logs at once.
 *
 * The results list is virtualised and hand-rolled rather than a Monaco
 * instance: Monaco holds a full text model per editor and has no notion of
 * "grouped by pod", so a dozen pods of results would be both heavier and less
 * useful than a flat list that knows what it is showing.
 *
 * Rows are flattened once, up front — headers and matches in one array — so
 * scrolling is a slice of a flat list rather than a nested map over groups on
 * every frame.
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  ModalView, ButtonView, SearchInputView, CheckboxView, SelectInputView,
  SegmentedControlView, FilterInputView, SearchFieldView, EmptyStateView,
  CheckSquareIcon, EmptySquareIcon, BadgeChipView, IconSize } from '@salilvnair/dui';
import {
  SearchIcon, SpinnerIcon, WarningTriangleIcon, ChevronDownIcon, ChevronRightIcon,
  FolderExportIcon,
} from '../../icons';
import { useK8sStore } from '../../store/k8s-store';
import { favoriteKey, useFavoriteKeys } from '../../store/dk8s-favorites-store';
import { useFileSearch, FileSearchResults, type HitTarget } from './FileSearchPane';
import { FileViewer } from './FileViewer';
import { TimeWindowPicker, describeWindow, windowError } from './TimeWindow';
import { ExportSearchModal } from './ExportSearchModal';
import { postMsg } from '../../vscode';
import {
  useDk8sSearchStore, groupKey, type SearchMatch, type PodGroup, type PvFileResult,
} from '../../store/dk8s-search-store';
import { levelColor } from './log-view';
import { severityOf, severityColor, shortAge } from './pod-view';
import { softPrimary } from './button-style';

import { ACCENT } from './tone';
const ROW_H = 19;
const OVERSCAN = 20;

type Row =
  | { kind: 'header'; group: PodGroup }
  | { kind: 'file'; file: PvFileResult; pod: string; key: string }
  | { kind: 'context'; text: string; pod: string; key: string }
  | { kind: 'match'; match: SearchMatch; key: string };

/**
 * Flatten groups into a single row list.
 *
 * Done once per result change rather than per render: nesting maps inside the
 * virtualiser is what makes a "virtualised" list scroll like an unvirtualised
 * one.
 */
function buildRows(
  groups: PodGroup[], collapsed: string[], contextLines: number, filesOpen: string[],
): Row[] {
  const rows: Row[] = [];
  for (const group of groups) {
    const key = groupKey(group);
    rows.push({ kind: 'header', group });
    if (collapsed.includes(key)) continue;

    // Which archived files the hits came from. A pod's logs can be spread
    // across a week of rotated files, and "3 hits" says nothing about whether
    // they are from today or from the restart you are actually chasing.
    if (group.source === 'archive' && filesOpen.includes(key)) {
      for (const f of group.files ?? []) {
        rows.push({ kind: 'file', file: f, pod: group.result.pod, key: `${key}:${f.rel}` });
      }
    }
    for (const m of group.matches) {
      const id = `${m.pod}:${m.line}`;
      if (contextLines > 0) {
        m.before.forEach((t, i) => rows.push({ kind: 'context', text: t, pod: m.pod, key: `${id}b${i}` }));
      }
      rows.push({ kind: 'match', match: m, key: id });
      if (contextLines > 0) {
        m.after.forEach((t, i) => rows.push({ kind: 'context', text: t, pod: m.pod, key: `${id}a${i}` }));
      }
    }
  }
  return rows;
}

function Highlighted({ text, hits }: { text: string; hits: [number, number][] }) {
  if (!hits.length) return <>{text}</>;
  const out: React.ReactNode[] = [];
  let at = 0;
  hits.forEach(([from, to], i) => {
    if (from > at) out.push(text.slice(at, from));
    out.push(
      <mark key={i} style={{
        background: `color-mix(in srgb, ${ACCENT} 38%, transparent)`,
        color: 'var(--color-text-primary)', borderRadius: 2, padding: '0 1px',
      }}>
        {text.slice(from, to)}
      </mark>,
    );
    at = to;
  });
  if (at < text.length) out.push(text.slice(at));
  return <>{out}</>;
}

function time(ts?: number): string {
  if (ts === undefined) return '';
  const d = new Date(ts);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function LogSearchModal({ onClose }: { onClose: () => void }) {
  const { pods, selected, openDetail, setDetailTab, openExplorerAt } = useK8sStore();
  const {
    options, running, progress, groups, summary, collapsed,
    picked, pickerOpen, setPicked, setPickerOpen,
    archiveSearched, scanningArchive, filesOpen, toggleFiles,
    setOptions, run, cancel, toggleCollapsed,
    timeWindow, setTimeWindow,
  } = useDk8sSearchStore();

  // A range whose end precedes its start cannot match anything. Better to say
  // so and hold the button than to run a search that is guaranteed to be empty
  // and let the empty result imply the logs are.
  const windowProblem = windowError(timeWindow);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(360);

  /*
    Which result groups are ticked for export.

    Separate from `picked`, which chooses what to SEARCH. Once a search has
    run, the interesting subset is usually smaller than what was scanned —
    twenty-eight pods go in and five come back with hits — so the thing you
    want to keep is picked from the results, not from the pod list.

    Undefined means "not touched yet", which is what lets the default be
    "every pod that matched" without having to re-tick them each time a search
    finishes with a different set.
  */
  const [exportPicked, setExportPicked] = useState<string[] | undefined>();
  const [exportOpen, setExportOpen] = useState(false);

  /**
   * Which pods get searched.
   *
   * `picked` when the search chose its own — Search Everywhere starts from
   * inside one pod's log, where the grid's selection is not what you meant —
   * and the grid's selection otherwise, so opening this from the pod list
   * still just works.
   */
  const useGrid = picked.length === 0 && !pickerOpen;
  const chosen = useGrid
    ? pods.filter(p => selected.includes(p.uid))
    : pods.filter(p => picked.includes(p.uid));

  const [podFilter, setPodFilter] = useState('');
  /** The hit being read in place, over the results. */
  const [preview, setPreview] = useState<HitTarget | null>(null);
  /*
    How deep each pod walks, adjustable here too.

    Quick Search starts at `/` because it is opened without a pod in mind, so
    depth is the only thing standing between a name and a walk of every
    filesystem in the namespace. Announcing the cap and not offering it was the
    worst of both: you could see why a result was short and do nothing about it.
  */
  const [fileDepth, setFileDepth] = useState(8);

  /*
    Logs or files, over the same pod selection.

    One panel rather than two: the pod picking, the pattern and the
    regex/case switches are identical either way, and the question people
    arrive with is "where is this", not "which subsystem should I ask".
  */
  const searchIn = useDk8sSearchStore(s => s.searchIn);
  const setSearchIn = useDk8sSearchStore(s => s.setSearchIn);
  const fileSearch = useFileSearch();
  /*
    The picker offers what the list behind it is showing.

    On the starred tab it offered every pod in the cluster, so the choice on
    screen had nothing to do with the four pods you had been looking at — and
    picking from thirty to search four is the work starring was meant to save.
    Falls back to everything when nothing is starred, which is the same rule
    the list itself follows.
  */
  const podScope = useK8sStore(s => s.podScope);
  const favKeys = useFavoriteKeys();
  const scoped = useMemo(() => {
    if (podScope !== 'fav' || favKeys.length === 0) return pods;
    return pods.filter(p => favKeys.includes(favoriteKey(p)));
  }, [pods, podScope, favKeys]);

  const pickable = useMemo(() => {
    const q = podFilter.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter(p =>
      p.name.toLowerCase().includes(q) || p.namespace.toLowerCase().includes(q));
  }, [pods, podFilter]);

  const rows = useMemo(
    () => buildRows(groups, collapsed, options.contextLines, filesOpen),
    [groups, collapsed, options.contextLines, filesOpen],
  );

  /*
    The pods that actually matched, and which of them are ticked.

    A group with zero hits is not offered: exporting "no matches from this pod"
    is a file nobody wants, and having it tickable makes the count in the
    button wrong.
  */
  const matchedKeys = useMemo(
    () => groups.filter(g => g.result.matched > 0 && !g.result.error).map(groupKey),
    [groups],
  );
  const ticked = exportPicked ?? matchedKeys;
  /*
    The pods behind the ticked rows, deduplicated.

    A pod ticked in both its halves is still one pod to export — the exporter
    writes each source it finds for the pods it is given, so handing it the
    same pod twice would write the same pair of files twice.
  */
  const tickedPods = useMemo(() => {
    const names = new Set(ticked.map((k: string) => k.slice(k.indexOf(':') + 1)));
    return pods.filter(p => names.has(p.name));
  }, [pods, ticked]);
  const allTicked = matchedKeys.length > 0 && matchedKeys.every(k => ticked.includes(k));

  const toggleTick = (key: string) => setExportPicked(
    ticked.includes(key) ? ticked.filter(k => k !== key) : [...ticked, key],
  );
  const toggleAllTicks = () => setExportPicked(allTicked ? [] : matchedKeys);

  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((scrollTop + viewportH) / ROW_H) + OVERSCAN);
  const slice = rows.slice(first, last);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
    ro.observe(el);
    setViewportH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const submit = useCallback(() => {
    if (searchIn === 'files') {
      /*
        Files search from `/`, not from a remembered path.

        Quick Search is opened without a pod in mind, so there is no current
        directory to inherit — and the depth cap in `find` is what keeps that
        honest rather than expensive.
      */
      fileSearch.run(
        chosen.map(p => ({
          uid: p.uid, name: p.name, namespace: p.namespace, context: p.context!,
        })),
        options.query, '/', options.caseSensitive, fileDepth,
      );
      return;
    }
    run(chosen.map(p => ({
      context: p.context!, namespace: p.namespace, pod: p.name,
      containers: p.containers.map(c => c.name),
      // Kubernetes' own answer for what this pod belongs to, so the archive
      // search does not have to guess it back out of the pod name.
      workload: p.workload?.name,
    })));
  }, [chosen, run, searchIn, fileSearch, options.query, options.caseSensitive]);

  // Enter searches. Anyone who has typed a query expects it to.
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !running && options.query.trim()) submit();
  };

  const jumpToPod = (m: SearchMatch) => {
    /*
      An archived hit opens the file, not the pod.

      The pod behind an archive hit has usually been replaced — that is why the
      log is on the volume in the first place — so sending you to a live log
      would either land on a different container or do nothing at all. The file
      opens in the editor at the line that matched.
    */
    const archive = m as SearchMatch & { source?: string; file?: string };
    if (archive.source === 'archive' && archive.file) {
      postMsg({ type: 'dk8s:openLogFile', file: archive.file, line: m.line });
      return;
    }

    const pod = pods.find(p => p.name === m.pod && p.namespace === m.namespace);
    if (!pod) return;
    // Not onClose(): that is the deliberate-exit path, which forgets where you
    // were. This one records it so the pod's Back returns to these results.
    useDk8sSearchStore.getState().jumpedToPod(scrollRef.current?.scrollTop ?? 0);
    openDetail(pod);
  };

  // Reopened from a pod's Back — put the list back where it was. One frame
  // late because the rows have to exist before there is anything to scroll.
  useEffect(() => {
    const y = useDk8sSearchStore.getState().resultScroll;
    if (!y) return;
    const id = requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = y;
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const allPicked = pickable.length > 0 && pickable.every(p => picked.includes(p.uid));
  const canSearch = !!options.query.trim() && chosen.length > 0
    // The time window only constrains a log search; a bad one must not disable
    // a file search that never reads it.
    && (searchIn === 'files' || !windowProblem);
  const totalHits = groups.reduce((n, g) => n + g.result.matched, 0);
  const anyCapped = groups.some(g => g.result.capped);

  return (
    /* dui's widest preset is a hard 920px inline, which truncates most hits
       mid-message — and this dialog exists to let you read them. `inline` mode
       is dui's own escape hatch for "the parent handles positioning", so the
       backdrop and centring are ours and the width is whatever the content
       actually needs. */
    <div
      // Centred on the page, both ways. This was top-aligned on the argument
      // that the query box should not start halfway down — but the dialog is
      // tall enough that top-aligning put it against the tab bar and left the
      // slack at the bottom, which reads as a panel that has come loose rather
      // than a dialog. The padding below is the minimum margin, so on a short
      // window it still cannot touch the edges.
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: 'rgba(0,0,0,.55)', paddingTop: '3vh', paddingBottom: '3vh' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
    {/* Back to sizing from content with the original 90vh ceiling. Forcing a
        viewport-relative height made the dialog the whole screen; only the
        vertical alignment above needed to change. */}
    <div className="flex" style={{ width: 'min(1500px, 94vw)', maxHeight: '90vh' }}>
    <ModalView
      open
      mode="inline"
      onClose={onClose}
      title="Quick Search"
      subtitle={`${chosen.length} pod${chosen.length === 1 ? '' : 's'} selected`}
      headerColor={ACCENT}
      footerRight={
        <div className="flex items-center gap-2">
          <ButtonView label="Close" size="sm" variant="secondary" onClick={onClose} />
          {(searchIn === 'logs' ? running : fileSearch.running)
            ? <ButtonView label="Stop" size="sm" variant="secondary"
                          accentColor="var(--color-error)" color="var(--color-error)"
                          onClick={cancel} />
            : <ButtonView label="Search" size="sm" variant="secondary" accentColor={ACCENT}
                          color={canSearch ? ACCENT : 'var(--color-text-muted)'}
                          disabled={!canSearch}
                          iconLeft={<SearchIcon size={IconSize.action} color={canSearch ? ACCENT : 'var(--color-text-muted)'} />}
                          onClick={submit}
                          style={softPrimary(ACCENT, canSearch)} />}
        </div>
      }
    >
      <div className="flex flex-col gap-3" style={{ minHeight: 520 }} onKeyDown={onKey}>
        {/* ── Which pods ──
            Started from a pod's log there is no grid selection to inherit, so
            the choice has to be made here. Shown as a strip when the pods are
            already settled, and expanded when they are not. */}
        <div className="rounded-md overflow-hidden shrink-0"
             style={{ border: '1px solid var(--color-surface-border)' }}>
          <button
            type="button"
            onClick={() => {
              // Opening the table for the first time carries the grid's
              // selection in, so expanding it never silently clears a choice.
              if (!pickerOpen && picked.length === 0 && chosen.length > 0) {
                setPicked(chosen.map(p => p.uid));
              }
              setPickerOpen(!pickerOpen);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 cursor-pointer border-none text-left"
            style={{ background: 'var(--color-surface-hover)' }}
          >
            <ChevronRightIcon
              size={IconSize.action}
              color="var(--color-text-muted)"
              style={{ transform: pickerOpen ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }}
            />
            {/*
              How many of how many.

              "0 pods selected" said nothing about what there was to choose
              from, so the one number that matters — is this 0 of 4 or 0 of
              300 — was missing. The counts carry the colour and the size; the
              words between them are scaffolding and recede.
            */}
            <span className="flex items-baseline gap-1 shrink-0">
              <span className="text-[14px] font-bold tabular-nums"
                    style={{ color: chosen.length ? ACCENT : 'var(--color-text-muted)' }}>
                {chosen.length}
              </span>
              <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>of</span>
              <span className="text-[14px] font-bold tabular-nums"
                    style={{ color: 'var(--color-text-secondary)' }}>
                {scoped.length}
              </span>
              <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>selected</span>
            </span>
            <span className="text-[10.5px] truncate" style={{ color: 'var(--color-text-muted)' }}>
              {chosen.length === 0
                ? 'pick the pods to search'
                : chosen.slice(0, 3).map(p => p.name).join(', ')
                  + (chosen.length > 3 ? ` and ${chosen.length - 3} more` : '')}
            </span>
            <div className="flex-1" />
            <span className="text-[10.5px]" style={{ color: ACCENT }}>
              {pickerOpen ? 'done' : 'change'}
            </span>
          </button>

          {pickerOpen && (
            <div className="flex flex-col" style={{ borderTop: '1px solid var(--color-surface-border)' }}>
              <div className="flex items-center gap-2 px-3 py-2">
                {/*
                  Select-all moved into the table, as the header checkbox.

                  It was a button beside the filter, which put the control that
                  ticks every row a long way from the rows it ticks and made the
                  filter bar taller than it needed to be. A checkbox at the head
                  of the column of checkboxes is where people already look for
                  it, and it can show a third state the button could not: some
                  picked, not all.
                */}
                <div className="flex-1">
                  <FilterInputView value={podFilter} onChange={setPodFilter}
                                   placeholder="Filter pods" size="sm"
                                   accentColor={ACCENT} />
                </div>
              </div>

              <div className="overflow-auto" style={{ maxHeight: 260 }}>
                <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--color-surface)' }}>
                      {['', 'pod', 'namespace', 'status', 'restarts', 'age'].map((h, i) => (
                        <th key={i}
                            className="text-left text-[9.5px] uppercase tracking-wider px-2 py-1.5 sticky top-0"
                            style={{
                              color: 'var(--color-text-muted)', fontWeight: 500,
                              background: 'var(--color-surface)',
                              borderBottom: '1px solid var(--color-surface-border)',
                              width: i === 0 ? 28 : undefined,
                            }}>
                          {/*
                            The header cell gets the same square the pod grid
                            uses to enter selection mode, not dui's filled
                            checkbox: this row is a header, and it should look
                            like the control people already know rather than
                            like a nineteenth pod.
                          */}
                          {i === 0 ? (
                            <button
                              type="button"
                              title={allPicked ? 'Clear all' : 'Select all'}
                              aria-label={allPicked ? 'Clear all' : 'Select all'}
                              className="flex items-center justify-center cursor-pointer border-none bg-transparent p-0"
                              style={{ width: 18, height: 18 }}
                              onClick={() => setPicked(
                                allPicked
                                  ? picked.filter(u => !pickable.some(p => p.uid === u))
                                  : [...new Set([...picked, ...pickable.map(p => p.uid)])],
                              )}
                            >
                              {allPicked
                                ? <CheckSquareIcon size={IconSize.row} color={ACCENT} />
                                : <EmptySquareIcon size={IconSize.row} color="var(--color-text-muted)" />}
                            </button>
                          ) : h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pickable.map(p => {
                      const on = picked.includes(p.uid);
                      return (
                        <tr
                          key={p.uid}
                          onClick={() => setPicked(on ? picked.filter(u => u !== p.uid) : [...picked, p.uid])}
                          className="cursor-pointer"
                          style={{
                            background: on ? `color-mix(in srgb, ${ACCENT} 8%, transparent)` : 'transparent',
                          }}
                        >
                          <td className="px-2 py-1.5" style={{ width: 28 }}>
                            <CheckboxView checked={on} size="xs" accentColor={ACCENT} onChange={() => {}} />
                          </td>
                          <td className="px-2 py-1.5 text-[11px] font-mono"
                              style={{ color: 'var(--color-text-primary)' }}>{p.name}</td>
                          <td className="px-2 py-1.5 text-[10.5px]"
                              style={{ color: 'var(--color-text-muted)' }}>{p.namespace}</td>
                          <td className="px-2 py-1.5 text-[10.5px]"
                              style={{ color: severityColor(severityOf(p)) }}>{p.phase}</td>
                          <td className="px-2 py-1.5 text-[10.5px]"
                              style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                            {p.restarts}
                          </td>
                          <td className="px-2 py-1.5 text-[10.5px]"
                              style={{ color: 'var(--color-text-muted)' }}>{shortAge(p.startedAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {pickable.length === 0 && (
                  <div className="px-3 py-4 text-[11px] text-center"
                       style={{ color: 'var(--color-text-muted)' }}>
                    No pod matches that filter.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── What to search, then the query ── */}
        <div className="flex items-center gap-3 flex-wrap">
          <SegmentedControlView
            options={[
              { value: 'logs', label: 'Logs' },
              { value: 'files', label: 'Files' },
            ]}
            value={searchIn}
            onChange={v => setSearchIn(v as 'logs' | 'files')}
            size="sm" density="compact" accentColor={ACCENT}
          />
          <span className="flex-1" style={{ minWidth: 220 }}>
            <SearchFieldView
              value={options.query}
              onChange={(v: string) => setOptions({ query: v })}
              onSearch={() => { if (canSearch) submit(); }}
              placeholder={searchIn === 'logs'
                ? 'Search across the selected pods’ logs — Enter to search'
                : 'File name, glob or regex — *invoice*, \.ya?ml$ — Enter to search'}
              size="md"
              accentColor={ACCENT}
            />
          </span>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <CheckboxView label="regex" checked={options.regex} size="md" accentColor={ACCENT}
                        onChange={v => setOptions({ regex: v })} />
          <CheckboxView label="match case" checked={options.caseSensitive} size="md" accentColor={ACCENT}
                        onChange={v => setOptions({ caseSensitive: v })} />
          {searchIn === 'files' && (
            <span title="How many directories deep each pod walks">
              <SelectInputView
                value={String(fileDepth)}
                onChange={v => setFileDepth(Number(v))}
                options={[2, 4, 6, 8, 12].map(d => ({ value: String(d), label: `depth ${d}` }))}
                size="md" width={112} accentColor={ACCENT}
              />
            </span>
          )}
          {/*
            Log-only switches, and the reason they disappear rather than grey
            out: a disabled control on a Files search still asks the reader to
            work out why it is there. `previous runs`, a tail length and
            surrounding lines are all properties of a log stream, and a
            filesystem has none of them.
          */}
          {searchIn === 'logs' && (
          <CheckboxView label="previous runs" checked={options.includePrevious} size="md"
                        accentColor="var(--color-warning)"
                        onChange={v => setOptions({ includePrevious: v })} />
          )}
          <div className="flex-1" />
          {searchIn === 'logs' && (
          <SelectInputView
            value={String(options.tailLines)}
            onChange={v => setOptions({ tailLines: Number(v) })}
            options={[1000, 5000, 20000, 100000].map(v => ({
              value: String(v), label: `last ${v.toLocaleString()}`,
            }))}
            size="md" width={148} accentColor={ACCENT}
          />
          )}
          {searchIn === 'logs' && (
          <SelectInputView
            value={String(options.contextLines)}
            onChange={v => setOptions({ contextLines: Number(v) })}
            options={[
              { value: '0', label: 'no surrounding lines' },
              { value: '1', label: '\u00b11 line around' },
              { value: '2', label: '\u00b12 lines around' },
              { value: '5', label: '\u00b15 lines around' },
            ]}
            size="md" width={192} accentColor={ACCENT}
          />
          )}
        </div>

        {/*
          The window sits below the switches, not above them.

          Files puts its two switches directly under the Logs|Files toggle, and
          Logs put six time choices and two date fields there instead — so the
          same gesture landed on a different control depending on which half of
          the toggle was lit. The switches are the shared row and they go
          first; the window is what Logs adds, and additions go after.

          It stays on its own line regardless: six choices and two date fields
          do not fit beside the checkboxes, and this is the control most likely
          to be the reason a search comes back empty.
        */}
        {searchIn === 'logs' && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-wider"
                style={{ color: 'var(--color-text-muted)' }}>
            how far back
          </span>
          <TimeWindowPicker value={timeWindow} onChange={setTimeWindow} accent={ACCENT} />
          <span className="text-[10.5px]"
                style={{ color: windowProblem ? 'var(--color-error)' : 'var(--color-text-muted)' }}>
            {describeWindow(timeWindow)}
          </span>
        </div>
        )}

        {/* ── Progress and summary ── */}
        {searchIn === 'files' && (fileSearch.running || fileSearch.ran) && (
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-md text-[11.5px]"
               style={{ background: 'var(--color-surface-hover)' }}>
            {fileSearch.running && <SpinnerIcon size={IconSize.action} color={ACCENT} />}
            <span style={{ color: fileSearch.running ? ACCENT : 'var(--color-text-secondary)' }}>
              {fileSearch.running
                ? `Scanning ${fileSearch.scanned} of ${fileSearch.total} pods`
                : `${fileSearch.matched.toLocaleString()} match${fileSearch.matched === 1 ? '' : 'es'} `
                  + `in ${fileSearch.podsWithHits} of ${fileSearch.scanned} pods`}
            </span>
            {!fileSearch.running && (
              <span style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                · {fileSearch.results.reduce((a, r) => a + r.hits.length, 0).toLocaleString()} files listed
              </span>
            )}
            {fileSearch.running && (
              <div className="flex-1" style={{ height: 3, borderRadius: 2, background: 'var(--color-surface)' }}>
                <div style={{
                  height: '100%', borderRadius: 2, background: ACCENT,
                  width: `${fileSearch.total ? (fileSearch.scanned / fileSearch.total) * 100 : 0}%`,
                  transition: 'width .2s ease',
                }} />
              </div>
            )}
          </div>
        )}

        {searchIn === 'logs' && (running || summary) && (
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-md text-[11.5px]"
               style={{ background: 'var(--color-surface-hover)' }}>
            {running && <SpinnerIcon size={IconSize.action} color={ACCENT} />}
            <span style={{ color: running ? ACCENT : 'var(--color-text-secondary)' }}>
              {running
                // The archive pass is the slow half and runs after the live
                // one, so it says so — otherwise a long scan reads as a hang
                // right after the live results have already appeared.
                ? `${scanningArchive ? 'Searching archived logs' : 'Scanning'} `
                  + `${progress.done} of ${progress.total}${progress.pod ? ` · ${progress.pod}` : ''}`
                : summary?.stopped
                  ? `Stopped. ${totalHits.toLocaleString()} matches in ${groups.length} pod${groups.length === 1 ? '' : 's'}.`
                  : `${totalHits.toLocaleString()} match${totalHits === 1 ? '' : 'es'} in ${groups.length} of ${summary?.pods ?? 0} pods`}
            </span>
            {!running && summary && (
              <span style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                · {summary.scanned.toLocaleString()} lines scanned
              </span>
            )}
            {running && (
              <div className="flex-1" style={{ height: 3, borderRadius: 2, background: 'var(--color-surface)' }}>
                <div style={{
                  height: '100%', borderRadius: 2, background: ACCENT,
                  width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%`,
                  transition: 'width .2s ease',
                }} />
              </div>
            )}

            {/*
              Keeping the results.

              On the same row as the counts rather than in the footer, because
              it acts on what that sentence just described — and because the
              footer already has Search, which is the other, opposite thing you
              do from here.
            */}
            {!running && matchedKeys.length > 0 && (
              <>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={toggleAllTicks}
                  className="cursor-pointer border-none bg-transparent px-1 shrink-0"
                  style={{ color: ACCENT, fontSize: 11, fontFamily: 'inherit' }}
                >
                  {allTicked ? 'clear' : `select all ${matchedKeys.length}`}
                </button>
                <ButtonView
                  label={`Export ${ticked.length || ''}`.trim()}
                  size="sm" variant="secondary"
                  iconLeft={<FolderExportIcon size={IconSize.inline} />}
                  disabled={!ticked.length}
                  onClick={() => setExportOpen(true)}
                  title={ticked.length
                    ? `Write every match from ${ticked.length} pod${ticked.length === 1 ? '' : 's'} to disk`
                    : 'Tick a pod to export its matches'}
                  style={{
                    height: 24,
                    background: ticked.length
                      ? 'color-mix(in srgb, var(--color-warning) 16%, transparent)'
                      : 'transparent',
                    borderColor: ticked.length
                      ? 'color-mix(in srgb, var(--color-warning) 45%, transparent)'
                      : 'var(--color-surface-border)',
                    color: ticked.length ? 'var(--color-warning)' : 'var(--color-text-muted)',
                    fontWeight: 600,
                  }}
                />
              </>
            )}
          </div>
        )}

        {exportOpen && (
          <ExportSearchModal pods={tickedPods} onClose={() => setExportOpen(false)} />
        )}

        {/* The caps are stated where the counts are, so a truncated list is
            never mistaken for a complete one. */}
        {anyCapped && (
          <span className="text-[10.5px]" style={{ color: 'var(--color-warning)' }}>
            Some pods matched more than could be listed. The counts are the real totals;
            narrow the query to see the rest.
          </span>
        )}

        {/* ── Results ── */}
        {searchIn === 'files' ? (
          <div className="flex-1 flex flex-col rounded-md overflow-hidden relative"
               style={{
                 minHeight: 340, maxHeight: 520,
                 background: 'var(--color-surface)',
                 border: '1px solid var(--color-surface-border)',
               }}>
            {preview?.path && (
              <FileViewer
                context={preview.context}
                namespace={preview.namespace}
                pod={preview.pod}
                path={preview.path}
                name={preview.path.slice(preview.path.lastIndexOf('/') + 1)}
                onClose={() => setPreview(null)}
              />
            )}
            <FileSearchResults
              state={fileSearch}
              onOpenExplorer={r => {
                /*
                  A hit is a place, not just a pod. Handing the Explorer the
                  file's directory means it opens where the reader already is,
                  rather than making them navigate back to the folder they just
                  searched — which was the whole point of finding it.
                */
                const pod = pods.find(p => p.name === r.pod && p.namespace === r.namespace);
                if (!pod) return;
                openExplorerAt({
                  path: r.path ? dirOf(r.path) : undefined,
                  highlight: r.path,
                });
                // The same way back the log hits use: this records the scroll
                // so returning lands on the row you left.
                useDk8sSearchStore.getState().jumpedToPod(scrollRef.current?.scrollTop ?? 0);
                openDetail(pod);
                // openDetail restores the tab last read on that pod, so the
                // Explorer has to be asked for after it, not instead.
                setDetailTab('explorer');
              }}
              onView={r => {
                /*
                  The eye opens the file. It does not go anywhere.

                  This was a copy of `onOpenExplorer` and behaved like one:
                  clicking it left the search, opened the pod, switched to the
                  Explorer and highlighted the row — every part of a journey
                  nobody asked for. Reading one file is the cheapest thing in
                  the panel and the most common reason to click a hit, and it
                  has no business costing you your place in 2,275 results.

                  The viewer is its own overlay over the results, so closing it
                  puts the list back exactly as it was.
                */
                if (!r.path) return;
                setPreview(r);
              }}
              onDownload={r => {
                // Straight to disk, without leaving the search — the common
                // case is grabbing the same file off several pods in a row.
                if (!r.path) return;
                postMsg({
                  type: 'files:download',
                  context: r.context, namespace: r.namespace, pod: r.pod,
                  path: r.path, name: r.path.slice(r.path.lastIndexOf('/') + 1),
                });
              }}
            />
          </div>
        ) : (
        <div
          ref={scrollRef}
          onScroll={() => setScrollTop(scrollRef.current?.scrollTop ?? 0)}
          className="flex-1 overflow-auto rounded-md font-mono"
          style={{
            minHeight: 340, maxHeight: 520,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-surface-border)',
            fontSize: 11, lineHeight: `${ROW_H}px`,
          }}
        >
          {rows.length === 0 ? (
            /*
              Four states, and they are not the same message.

              "nothing selected", "nothing typed", "still scanning" and
              "searched and found nothing" were one grey sentence apiece in the
              middle of a large empty box, which made the panel read as broken
              in three of the four. The medallion gives each one a shape and
              room to say what to do next — and the last one room to say that
              nothing was transferred, which is the part people actually want
              to know about a search that reads their production logs.
            */
            <div className="flex-1 grid place-items-center px-8" style={{ minHeight: 280 }}>
              {running ? (
                <EmptyStateView
                  variant="medallion"
                  icon={<SpinnerIcon size={IconSize.medallion} />}
                  title="Scanning"
                  message={`Reading ${chosen.length} pod${chosen.length === 1 ? '' : 's'} on this machine, a line at a time.`}
                  accentColor={ACCENT}
                />
              ) : summary ? (
                <EmptyStateView
                  variant="medallion"
                  icon={<SearchIcon size={IconSize.medallion} />}
                  title="No pod matched"
                  message="Nothing left this machine — the logs were read and matched here, and only hits would have come back."
                  accentColor={ACCENT}
                  hints={[
                    { key: 'window', text: 'the time window is the commonest reason a search comes back empty' },
                    { key: 'regex', text: 'off by default — a pattern typed as one is matched literally' },
                    { key: 'runs', text: 'previous runs looks in the log a crash left behind' },
                  ]}
                />
              ) : chosen.length ? (
                <EmptyStateView
                  variant="medallion"
                  icon={<SearchIcon size={IconSize.medallion} />}
                  title="Search these pods' logs"
                  message={`${chosen.length} pod${chosen.length === 1 ? '' : 's'} selected. Type a string and search — the logs are read here and only the matching lines come back.`}
                  accentColor={ACCENT}
                />
              ) : (
                <EmptyStateView
                  variant="medallion"
                  icon={<SearchIcon size={IconSize.medallion} />}
                  title="Pick the pods to search"
                  message="Nothing is selected yet. Open the list above and choose, or take the lot."
                  accentColor={ACCENT}
                  hints={[
                    { key: 'checkbox', text: 'the one at the head of the column selects every pod listed' },
                    { key: 'filter', text: 'filter first, then select all, to take a subset' },
                  ]}
                />
              )}
            </div>
          ) : (
            <div style={{ height: rows.length * ROW_H, position: 'relative' }}>
              <div style={{ position: 'absolute', top: first * ROW_H, left: 0, right: 0 }}>
                {slice.map((row, i) => {
                  if (row.kind === 'header') {
                    const r = row.group.result;
                    // Keyed by source as well as pod: the same pod's live and
                    // archived rows are two rows, and shared state made them
                    // behave as one.
                    const gk = groupKey(row.group);
                    const isCollapsed = collapsed.includes(gk);
                    return (
                      <div
                        key={`h${gk}${i}`}
                        onClick={() => toggleCollapsed(gk)}
                        className="flex items-center gap-2 px-2 cursor-pointer"
                        style={{
                          height: ROW_H,
                          background: 'var(--color-surface-hover)',
                          borderTop: '1px solid var(--color-surface-border)',
                        }}
                      >
                        {isCollapsed ? <ChevronRightIcon size={IconSize.inline} /> : <ChevronDownIcon size={IconSize.inline} />}
                        {/* Ticking a pod must not also collapse it — the row
                            behind this is the expand/collapse target. */}
                        {r.matched > 0 && !r.error && (
                          <span onClick={e => { e.stopPropagation(); toggleTick(gk); }}
                                className="flex items-center shrink-0">
                            <CheckboxView checked={ticked.includes(gk)} size="xs"
                                          accentColor={ACCENT} onChange={() => {}} />
                          </span>
                        )}
                        <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
                          {r.pod}
                        </span>
                        <span style={{ color: 'var(--color-text-muted)' }}>{r.namespace}</span>
                        {/* Live or archived. A hit in a rotated file from last
                            week means something different from one in a pod
                            that is running now. */}
                        {row.group.source === 'archive' && (
                          /* `xs` because it has to sit INSIDE the row rather
                             than set its height: the row is a 19px line of
                             monospace, and the 15px chip clears it where the
                             17px one would not. */
                          <BadgeChipView tone="var(--color-warning)" size="xs">
                            archive
                          </BadgeChipView>
                        )}
                        {r.error ? (
                          <span className="flex items-center gap-1" style={{ color: 'var(--color-error)' }}>
                            <WarningTriangleIcon size={IconSize.inline} color="var(--color-error)" />
                            {r.error}
                          </span>
                        ) : (
                          <>
                            <span style={{ color: ACCENT, fontVariantNumeric: 'tabular-nums' }}>
                              {r.matched.toLocaleString()} hit{r.matched === 1 ? '' : 's'}
                            </span>
                            {r.capped && (
                              <span style={{ color: 'var(--color-warning)' }}>
                                (showing first {row.group.matches.length})
                              </span>
                            )}
                            <span style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                              {r.scanned.toLocaleString()} lines
                            </span>
                            {row.group.source === 'archive' && (row.group.files?.length ?? 0) > 0 && (
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  /*
                                    Showing the files has to reveal them.

                                    On a collapsed row the list was toggled
                                    open underneath and nothing appeared —
                                    the control reported success and showed
                                    nothing, which reads as broken.
                                  */
                                  if (isCollapsed) toggleCollapsed(gk);
                                  toggleFiles(gk);
                                }}
                                className="cursor-pointer border-none bg-transparent px-1"
                                style={{ color: ACCENT, fontSize: 10.5, fontFamily: 'inherit' }}
                              >
                                {filesOpen.includes(gk) ? 'hide' : 'show'}{' '}
                                {row.group.files!.length} file{row.group.files!.length === 1 ? '' : 's'}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    );
                  }

                  if (row.kind === 'file') {
                    const f = row.file;
                    return (
                      <div key={row.key}
                           className="flex items-center gap-2 px-2"
                           style={{
                             height: ROW_H,
                             background: 'color-mix(in srgb, var(--color-warning) 5%, transparent)',
                           }}>
                        <span style={{ width: 14 }} />
                        <span className="truncate flex-1" style={{ color: 'var(--color-text-secondary)' }}>
                          {f.rel}
                        </span>
                        <span className="shrink-0" style={{ color: ACCENT, fontVariantNumeric: 'tabular-nums' }}>
                          {f.matched.toLocaleString()} hit{f.matched === 1 ? '' : 's'}
                        </span>
                        <span className="shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                          {fileSize(f.bytes)}
                        </span>
                        <span className="shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                          {new Date(f.mtime).toISOString().slice(0, 10)}
                        </span>
                      </div>
                    );
                  }

                  if (row.kind === 'context') {
                    return (
                      <div key={row.key} className="px-2 truncate"
                           style={{ height: ROW_H, color: 'var(--color-text-muted)', opacity: 0.6, paddingLeft: 26 }}>
                        {row.text}
                      </div>
                    );
                  }

                  const m = row.match;
                  return (
                    <div
                      key={row.key}
                      onClick={() => jumpToPod(m)}
                      className="flex gap-2 px-2 cursor-pointer hover:bg-[var(--color-surface-hover)]"
                      style={{
                        height: ROW_H,
                        paddingLeft: 26,
                        borderLeft: `2px solid ${levelColor(m.level)}`,
                      }}
                      title="Open this pod's log"
                    >
                      <span className="shrink-0" style={{ color: 'var(--color-text-muted)', opacity: 0.7 }}>
                        {time(m.ts)}
                      </span>
                      <span className="truncate" style={{ color: 'var(--color-text-primary)' }}>
                        <Highlighted text={m.text} hits={m.hits} />
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        )}

        <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
          {searchIn === 'files' ? (
            <>
              Each pod walks its own filesystem — there is no filesystem API to query, so this
              is one <code>find</code> per pod, capped by depth and result count. A pod with no
              shell says so and the rest still search. Click a hit to open that pod&rsquo;s
              Explorer.
            </>
          ) : (
            <>
              Logs are read and matched on this machine, a line at a time — nothing is buffered
              whole and nothing leaves. Click a live hit to open that pod&rsquo;s log
              {archiveSearched && ', or an archived one to open the file it came from'}.
              {archiveSearched && ' Archived logs on the mounted volume are searched too.'}
            </>
          )}
        </span>
      </div>
    </ModalView>
    </div>
    </div>
  );
}

/** Bytes for the archived-file rows. */
function fileSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

/** The directory a file lives in — where the Explorer should open. */
function dirOf(p: string): string {
  const cut = p.replace(/\/+$/, '').lastIndexOf('/');
  return cut <= 0 ? '/' : p.slice(0, cut);
}
