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
} from '@salilvnair/dui';
import {
  SearchIcon, SpinnerIcon, WarningTriangleIcon, ChevronDownIcon, ChevronRightIcon,
} from '../../icons';
import { useK8sStore } from '../../store/k8s-store';
import { postMsg } from '../../vscode';
import {
  useDk8sSearchStore, type SearchMatch, type PodGroup, type PvFileResult,
} from '../../store/dk8s-search-store';
import { levelColor } from './log-view';
import { severityOf, severityColor, shortAge } from './pod-view';
import { softPrimary } from './button-style';

const ACCENT = 'var(--color-dk8s)';
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
    rows.push({ kind: 'header', group });
    if (collapsed.includes(group.result.pod)) continue;

    // Which archived files the hits came from. A pod's logs can be spread
    // across a week of rotated files, and "3 hits" says nothing about whether
    // they are from today or from the restart you are actually chasing.
    if (group.source === 'archive' && filesOpen.includes(group.result.pod)) {
      for (const f of group.files ?? []) {
        rows.push({ kind: 'file', file: f, pod: group.result.pod, key: `${group.result.pod}:${f.rel}` });
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
  const { pods, selected, openDetail } = useK8sStore();
  const {
    options, running, progress, groups, summary, collapsed,
    picked, pickerOpen, setPicked, setPickerOpen,
    archiveSearched, scanningArchive, filesOpen, toggleFiles,
    setOptions, run, cancel, toggleCollapsed,
  } = useDk8sSearchStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(360);

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
  const pickable = useMemo(() => {
    const q = podFilter.trim().toLowerCase();
    if (!q) return pods;
    return pods.filter(p =>
      p.name.toLowerCase().includes(q) || p.namespace.toLowerCase().includes(q));
  }, [pods, podFilter]);

  const rows = useMemo(
    () => buildRows(groups, collapsed, options.contextLines, filesOpen),
    [groups, collapsed, options.contextLines, filesOpen],
  );

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
    run(chosen.map(p => ({
      context: p.context!, namespace: p.namespace, pod: p.name,
      containers: p.containers.map(c => c.name),
      // Kubernetes' own answer for what this pod belongs to, so the archive
      // search does not have to guess it back out of the pod name.
      workload: p.workload?.name,
    })));
  }, [chosen, run]);

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

  const canSearch = !!options.query.trim() && chosen.length > 0;
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
      title="Search logs"
      subtitle={`${chosen.length} pod${chosen.length === 1 ? '' : 's'} selected`}
      headerColor={ACCENT}
      footerRight={
        <div className="flex items-center gap-2">
          <ButtonView label="Close" size="sm" variant="secondary" onClick={onClose} />
          {running
            ? <ButtonView label="Stop" size="sm" variant="secondary"
                          accentColor="var(--color-error)" color="var(--color-error)"
                          onClick={cancel} />
            : <ButtonView label="Search" size="sm" variant="secondary" accentColor={ACCENT}
                          color={canSearch ? ACCENT : 'var(--color-text-muted)'}
                          disabled={!canSearch}
                          iconLeft={<SearchIcon size={12} color={canSearch ? ACCENT : 'var(--color-text-muted)'} />}
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
              size={12}
              color="var(--color-text-muted)"
              style={{ transform: pickerOpen ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }}
            />
            <span className="text-[11.5px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
              {chosen.length} pod{chosen.length === 1 ? '' : 's'} selected
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
                <div className="flex-1">
                  <SearchInputView value={podFilter} onChange={setPodFilter}
                                   placeholder="Filter pods" size="md" width="100%" />
                </div>
                <ButtonView
                  label={pickable.every(p => picked.includes(p.uid)) ? 'Clear all' : 'Select all'}
                  size="sm" variant="secondary"
                  onClick={() => setPicked(
                    pickable.every(p => picked.includes(p.uid))
                      ? picked.filter(u => !pickable.some(p => p.uid === u))
                      : [...new Set([...picked, ...pickable.map(p => p.uid)])],
                  )}
                  style={{ background: 'transparent' }}
                />
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
                            }}>
                          {h}
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
                            <CheckboxView checked={on} size="md" accentColor={ACCENT} onChange={() => {}} />
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

        {/* ── Query and options ── */}
        <SearchInputView
          value={options.query}
          onChange={(v: string) => setOptions({ query: v })}
          placeholder="Search across the selected pods’ logs"
          size="md"
          width="100%"
        />

        <div className="flex items-center gap-3 flex-wrap">
          <CheckboxView label="regex" checked={options.regex} size="md" accentColor={ACCENT}
                        onChange={v => setOptions({ regex: v })} />
          <CheckboxView label="match case" checked={options.caseSensitive} size="md" accentColor={ACCENT}
                        onChange={v => setOptions({ caseSensitive: v })} />
          <CheckboxView label="previous runs" checked={options.includePrevious} size="md"
                        accentColor="var(--color-warning)"
                        onChange={v => setOptions({ includePrevious: v })} />
          <div className="flex-1" />
          <SelectInputView
            value={String(options.tailLines)}
            onChange={v => setOptions({ tailLines: Number(v) })}
            options={[1000, 5000, 20000, 100000].map(v => ({
              value: String(v), label: `last ${v.toLocaleString()}`,
            }))}
            size="md" width={148} accentColor={ACCENT}
          />
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
        </div>

        {/* ── Progress and summary ── */}
        {(running || summary) && (
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-md text-[11.5px]"
               style={{ background: 'var(--color-surface-hover)' }}>
            {running && <SpinnerIcon size={12} color={ACCENT} />}
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
          </div>
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
            <div className="flex items-center justify-center h-full px-8 text-center"
                 style={{ minHeight: 280 }}>
              <span className="text-[12px]" style={{ color: 'var(--color-text-muted)', fontFamily: 'inherit' }}>
                {running
                  ? 'Scanning…'
                  : summary
                    ? 'No pod matched. The search reads each log on the host and only sends hits back, so nothing was transferred.'
                    : chosen.length
                      ? `Type a string and search. ${chosen.length} pod${chosen.length === 1 ? '' : 's'} will be scanned on the host — only the matching lines come back.`
                      : 'Select some pods first.'}
              </span>
            </div>
          ) : (
            <div style={{ height: rows.length * ROW_H, position: 'relative' }}>
              <div style={{ position: 'absolute', top: first * ROW_H, left: 0, right: 0 }}>
                {slice.map((row, i) => {
                  if (row.kind === 'header') {
                    const r = row.group.result;
                    const isCollapsed = collapsed.includes(r.pod);
                    return (
                      <div
                        key={`h${r.pod}${i}`}
                        onClick={() => toggleCollapsed(r.pod)}
                        className="flex items-center gap-2 px-2 cursor-pointer"
                        style={{
                          height: ROW_H,
                          background: 'var(--color-surface-hover)',
                          borderTop: '1px solid var(--color-surface-border)',
                        }}
                      >
                        {isCollapsed ? <ChevronRightIcon size={10} /> : <ChevronDownIcon size={10} />}
                        <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
                          {r.pod}
                        </span>
                        <span style={{ color: 'var(--color-text-muted)' }}>{r.namespace}</span>
                        {/* Live or archived. A hit in a rotated file from last
                            week means something different from one in a pod
                            that is running now. */}
                        {row.group.source === 'archive' && (
                          <span className="px-1.5 rounded shrink-0"
                                style={{
                                  fontSize: 9.5,
                                  background: 'color-mix(in srgb, var(--color-warning) 18%, transparent)',
                                  color: 'var(--color-warning)',
                                  textTransform: 'uppercase',
                                  letterSpacing: '.04em',
                                }}>
                            archive
                          </span>
                        )}
                        {r.error ? (
                          <span className="flex items-center gap-1" style={{ color: 'var(--color-error)' }}>
                            <WarningTriangleIcon size={10} color="var(--color-error)" />
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
                                onClick={e => { e.stopPropagation(); toggleFiles(r.pod); }}
                                className="cursor-pointer border-none bg-transparent px-1"
                                style={{ color: ACCENT, fontSize: 10.5, fontFamily: 'inherit' }}
                              >
                                {filesOpen.includes(r.pod) ? 'hide' : 'show'}{' '}
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

        <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
          Logs are read and matched on this machine, a line at a time — nothing is buffered
          whole and nothing leaves. Click a live hit to open that pod&rsquo;s log
          {archiveSearched && ', or an archived one to open the file it came from'}.
          {archiveSearched && ' Archived logs on the mounted volume are searched too.'}
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
