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
import { useDk8sSearchStore, type SearchMatch, type PodGroup } from '../../store/dk8s-search-store';
import { levelColor } from './log-view';
import { softPrimary } from './button-style';

const ACCENT = 'var(--color-dk8s)';
const ROW_H = 19;
const OVERSCAN = 20;

type Row =
  | { kind: 'header'; group: PodGroup }
  | { kind: 'context'; text: string; pod: string; key: string }
  | { kind: 'match'; match: SearchMatch; key: string };

/**
 * Flatten groups into a single row list.
 *
 * Done once per result change rather than per render: nesting maps inside the
 * virtualiser is what makes a "virtualised" list scroll like an unvirtualised
 * one.
 */
function buildRows(groups: PodGroup[], collapsed: string[], contextLines: number): Row[] {
  const rows: Row[] = [];
  for (const group of groups) {
    rows.push({ kind: 'header', group });
    if (collapsed.includes(group.result.pod)) continue;
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
    setOptions, run, cancel, toggleCollapsed,
  } = useDk8sSearchStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(360);

  const chosen = pods.filter(p => selected.includes(p.uid));

  const rows = useMemo(
    () => buildRows(groups, collapsed, options.contextLines),
    [groups, collapsed, options.contextLines],
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
    })));
  }, [chosen, run]);

  // Enter searches. Anyone who has typed a query expects it to.
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !running && options.query.trim()) submit();
  };

  const jumpToPod = (m: SearchMatch) => {
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
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,.55)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
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
                ? `Scanning ${progress.done} of ${progress.total}${progress.pod ? ` · ${progress.pod}` : ''}`
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
                          </>
                        )}
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
          whole and nothing leaves. Click any hit to open that pod&rsquo;s log.
        </span>
      </div>
    </ModalView>
    </div>
    </div>
  );
}
