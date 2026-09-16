/**
 * A search result, on a page you can actually read.
 *
 * ── Why a page and not the dialog ──
 *
 * The dialog answers "did it find anything". Reading is the thing people do
 * next, and a few hits per pod in a scrolling box inside a modal is a bad
 * place to do it: the pods you searched are off screen, the filter that would
 * narrow it does not exist, and closing the dialog to look at something loses
 * the answer.
 *
 * So the result comes out into a tab of its own, in the log view's own clothes
 * — same rows, same level colours, same stack folding, same field rail — and
 * the reader keeps the pods tab beside it.
 *
 * ── What is deliberately the same ──
 *
 * Everything about a line. `filterLines`, `foldStackTraces`, `levelColor`,
 * `displayText` and `frameOrigin` are the log view's, imported rather than
 * reimplemented, so a stack trace folds here exactly as it folds there and a
 * format's parsed message is what gets drawn in both. A second implementation
 * of any of that would drift within a week.
 *
 * ── What is deliberately different ──
 *
 * The lines came from several pods, so each one says which. And the search's
 * own hits are highlighted differently from the page filter's: the thing you
 * searched the cluster for is the point of the page, and a filter you typed
 * afterwards is a way of getting around it.
 */
import { useMemo, useState } from 'react';
import { ButtonView, TextInputView } from '@salilvnair/dui';
import {
  filterLines, foldStackTraces, levelColor, levelLabel, displayText,
  frameOrigin, formatLogTime, LEVEL_ORDER, type FieldFilter,
} from './log-view';
import { buildFacets, facetLabel } from './log-facets';
import {
  resultLines, podsLabel, podsIn, timings, totals, levelsIn, type ResultLine,
} from './search-results';
import { useResultTabStore } from '../../store/dk8s-result-tab-store';
import { useK8sStore, type LogLevel } from '../../store/k8s-store';
import { useTabsStore } from '../../store/tabs-store';
import { ACCENT } from './tone';
import { SearchIcon, CloseIcon, FileTextIcon, TimelineIcon } from '../../icons';

/**
 * The colour a matched line's query text takes.
 *
 * Not the accent. The accent marks the line — the row's rule and its text —
 * and a highlight in the same colour inside a line already wearing it is
 * invisible. Orange against the accent's teal is the pairing the search dialog
 * already uses for the same two jobs.
 */
const HIT_BG = 'color-mix(in srgb, var(--color-warning) 42%, transparent)';

/** A dim row of everything the search was, for the header. */
function Meta({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
      {children}
    </span>
  );
}

function Highlighted({ text, hits, search }: {
  text: string; hits?: [number, number][]; search?: boolean;
}) {
  if (!hits?.length) return <>{text}</>;
  const out: React.ReactNode[] = [];
  let at = 0;
  hits.forEach(([from, to], i) => {
    if (from > at) out.push(text.slice(at, from));
    out.push(
      <mark key={i} style={{
        background: search ? HIT_BG : `color-mix(in srgb, ${ACCENT} 34%, transparent)`,
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

function LevelTag({ level }: { level: LogLevel }) {
  if (level === 'other') return <span className="shrink-0" style={{ width: 42 }} />;
  return (
    <span className="shrink-0 select-none uppercase"
          style={{ width: 42, color: levelColor(level), fontWeight: 600, fontSize: '10.5px' }}>
      {level === 'debug' ? 'DEBUG' : level}
    </span>
  );
}

/* ── The left rail ───────────────────────────────────────────────────────── */

function Rail({ lines, all }: { lines: ResultLine[]; all: ResultLine[] }) {
  const {
    levels, setLevels, pods, setPods, fields, addField, removeField,
  } = useResultTabStore();

  /* Counted over what the OTHER filters left, not over the whole result: a
     facet that still offers 400 of a pod you have already filtered out is
     offering to narrow something that is not on screen. */
  const podCounts = useMemo(() => {
    const out = new Map<string, number>();
    for (const l of lines) if (!l.context) out.set(l.pod, (out.get(l.pod) ?? 0) + 1);
    return out;
  }, [lines]);

  const counts = useMemo(() => levelsIn(lines), [lines]);
  const facets = useMemo(() => buildFacets(lines), [lines]);
  const everyPod = useMemo(() => podsIn2(all), [all]);

  return (
    <div className="flex flex-col gap-4 overflow-y-auto px-3 py-3 shrink-0 dk8s-no-scrollbar"
         style={{
           width: 232,
           borderRight: '1px solid var(--color-surface-border)',
           background: 'var(--color-panel)',
         }}>
      <Section title="level">
        <div className="flex flex-wrap gap-1">
          {LEVEL_ORDER.filter(l => counts[l] > 0).map((level) => {
            const on = levels.includes(level);
            return (
              <button
                key={level} type="button"
                onClick={() => setLevels(on ? levels.filter(x => x !== level) : [...levels, level])}
                className="text-[10px] px-1.5 py-0.5 rounded cursor-pointer uppercase"
                style={{
                  color: on ? 'var(--color-text-primary)' : levelColor(level),
                  background: on
                    ? `color-mix(in srgb, ${levelColor(level)} 30%, transparent)`
                    : `color-mix(in srgb, ${levelColor(level)} 10%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${levelColor(level)} ${on ? 60 : 24}%, transparent)`,
                  fontWeight: 600,
                }}
              >
                {levelLabel(level)} {counts[level]}
              </button>
            );
          })}
        </div>
      </Section>

      {everyPod.length > 1 && (
        <Section title={`pods · ${everyPod.length}`}>
          <div className="flex flex-col gap-0.5">
            {everyPod.map((pod) => {
              const on = pods.includes(pod);
              const n = podCounts.get(pod) ?? 0;
              return (
                <button
                  key={pod} type="button"
                  onClick={() => setPods(on ? pods.filter(p => p !== pod) : [...pods, pod])}
                  className="flex items-baseline gap-2 text-[10.5px] px-1.5 py-1 rounded cursor-pointer text-left"
                  style={{
                    background: on ? `color-mix(in srgb, ${ACCENT} 16%, transparent)` : 'transparent',
                    color: on ? ACCENT : 'var(--color-text-secondary)',
                    fontFamily: 'var(--font-mono, monospace)',
                    /* A pod the search reached and found nothing in is still
                       worth showing — "it looked and there was nothing" is an
                       answer, and hiding the row loses it. */
                    opacity: n ? 1 : 0.5,
                  }}
                >
                  <span className="truncate flex-1">{pod}</span>
                  <span className="shrink-0" style={{ fontVariantNumeric: 'tabular-nums' }}>{n}</span>
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {facets.map(f => (
        <Section key={f.field} title={facetLabel(f.field)}>
          <div className="flex flex-col gap-0.5">
            {f.values.slice(0, 12).map(v => {
              const on = fields.some(x => x.field === f.field && x.value === v.value);
              return (
                <button
                  key={v.value} type="button"
                  onClick={() => {
                    const spec: FieldFilter = { field: f.field, value: v.value, mode: 'include' };
                    if (on) removeField(spec); else addField(spec);
                  }}
                  className="flex items-baseline gap-2 text-[10.5px] px-1.5 py-1 rounded cursor-pointer text-left"
                  style={{
                    background: on ? `color-mix(in srgb, ${ACCENT} 16%, transparent)` : 'transparent',
                    color: on ? ACCENT : 'var(--color-text-secondary)',
                    fontFamily: 'var(--font-mono, monospace)',
                  }}
                >
                  <span className="truncate flex-1">{v.value}</span>
                  <span className="shrink-0" style={{ fontVariantNumeric: 'tabular-nums' }}>{v.count}</span>
                </button>
              );
            })}
          </div>
        </Section>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[9.5px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
        {title}
      </span>
      {children}
    </div>
  );
}

/** Every pod in a result set, including the ones that matched nothing. */
function podsIn2(lines: ResultLine[]): string[] {
  return [...new Set(lines.map(l => l.pod))];
}

/* ── Overview ────────────────────────────────────────────────────────────── */

function Overview() {
  const { groups, query, at, archiveRoots, searched } = useResultTabStore();
  const rows = useMemo(() => timings(groups, searched), [groups, searched]);

  const cell: React.CSSProperties = {
    padding: '7px 10px', textAlign: 'left', fontSize: 11,
    borderBottom: '1px solid var(--color-surface-border)',
  };

  return (
    <div className="flex-1 overflow-auto px-5 py-4 flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-[12.5px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
          What this search did
        </span>
        <Meta>
          <code style={{ fontFamily: 'var(--font-mono, monospace)' }}>{query}</code>
          {' · '}{new Date(at).toLocaleString()}
        </Meta>
      </div>

      {archiveRoots.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[9.5px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
            archive paths, inside the pods
          </span>
          {archiveRoots.map(r => (
            <code key={r} className="text-[11px]"
                  style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--color-text-secondary)' }}>
              {r}
            </code>
          ))}
        </div>
      )}

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
                {/* `grep` in a pod says what matched and never how much it
                    read, so this says so rather than printing a 0 nobody
                    measured. */}
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
    </div>
  );
}

/* ── The page ────────────────────────────────────────────────────────────── */

export function SearchResultsPage() {
  const {
    query, groups, at, scanned, archiveRoots,
    tab, setTab, filter, setFilter, levels, pods, fields, wrap, setWrap, searched,
  } = useResultTabStore();
  const openDk8sTab = useTabsStore(s => s.openDk8sTab);
  const logLineNumbers = useK8sStore(s => s.logLineNumbers);

  const all = useMemo(() => resultLines(groups), [groups]);
  /* Named from what was searched, so a pod with no hits is still in the
     header's list — it is part of what this page is a record of. */
  const podNames = useMemo(
    () => [...new Set([...podsIn(groups), ...searched.map(s => s.pod)])],
    [groups, searched],
  );
  const sums = useMemo(() => totals(groups, searched), [groups, searched]);

  /* The pod filter first, then everything the log view already knows how to
     do — so `filterLines` sees only lines that are still in play. */
  const scoped = useMemo(
    () => (pods.length ? all.filter(l => pods.includes(l.pod)) : all),
    [all, pods],
  );

  const shown = useMemo(() => filterLines(scoped, {
    query: filter, levels, fields, contextLines: 0,
  }) as ResultLine[], [scoped, filter, levels, fields]);

  const rows = useMemo(() => foldStackTraces(shown, true), [shown]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  if (!groups.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2">
        <SearchIcon size={22} style={{ color: 'var(--color-text-muted)' }} />
        <span className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
          No search has been opened here yet.
        </span>
        <ButtonView label="Go to Dk8s" size="sm" variant="secondary"
                    accentColor={ACCENT} color={ACCENT} onClick={openDk8sTab} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: 'var(--color-panel)' }}>
      {/* ── Header ── */}
      <div className="flex flex-col gap-2 px-4 pt-3 pb-2"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-[13px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
            <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>results for </span>
            <code style={{ fontFamily: 'var(--font-mono, monospace)', color: ACCENT }}>{query}</code>
          </span>
          {/* Every pod it touched, named the way the spec asked: the one you
              recognise, and how many others came with it. */}
          <Meta>
            <code style={{ fontFamily: 'var(--font-mono, monospace)' }}>{podsLabel(podNames)}</code>
          </Meta>
          <span className="flex-1" />
          <Meta>
            {sums.matches.toLocaleString()} match{sums.matches === 1 ? '' : 'es'} in{' '}
            {sums.podsWithHits} of {sums.pods} pods
            {scanned > 0 && ` · ${scanned.toLocaleString()} lines scanned`}
            {' · '}{new Date(at).toLocaleTimeString()}
          </Meta>
        </div>

        {archiveRoots.length > 0 && (
          <Meta>
            searched in-pod under{' '}
            <code style={{ fontFamily: 'var(--font-mono, monospace)' }}>
              {archiveRoots.join('  ')}
            </code>
          </Meta>
        )}

        {/* ── Subtabs ── */}
        <div className="flex items-center gap-1">
          {([['logs', 'Logs', <FileTextIcon key="l" size={12} />],
             ['overview', 'Overview', <TimelineIcon key="o" size={12} />]] as const).map(([id, label, icon]) => (
            <button
              key={id} type="button"
              onClick={() => setTab(id as 'logs' | 'overview')}
              className="flex items-center gap-1.5 text-[11.5px] px-2.5 py-1 rounded-md cursor-pointer"
              style={{
                color: tab === id ? ACCENT : 'var(--color-text-secondary)',
                background: tab === id ? `color-mix(in srgb, ${ACCENT} 14%, transparent)` : 'transparent',
                fontWeight: tab === id ? 600 : 400,
              }}
            >
              {icon}{label}
            </button>
          ))}

          <span className="flex-1" />

          {tab === 'logs' && (
            <>
              <div style={{ width: 260 }}>
                <TextInputView
                  value={filter} size="sm" accentColor={ACCENT}
                  placeholder="narrow these results…"
                  onChange={e => setFilter(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
              <ButtonView
                label={wrap ? 'No wrap' : 'Wrap'} size="sm" variant="secondary"
                onClick={() => setWrap(!wrap)}
              />
              {filter && (
                <ButtonView label="Clear" size="sm" variant="secondary"
                            iconLeft={<CloseIcon size={10} />}
                            onClick={() => setFilter('')} />
              )}
            </>
          )}
        </div>
      </div>

      {tab === 'overview' ? <Overview /> : (
        <div className="flex-1 flex min-h-0">
          <Rail lines={shown} all={all} />

          <div className="flex-1 overflow-auto font-mono min-h-0 px-3 py-2 dk8s-no-scrollbar"
               style={{ fontSize: 11.5, lineHeight: '18px' }}>
            {rows.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <span className="text-[12px]" style={{ color: 'var(--color-text-muted)', fontFamily: 'inherit' }}>
                  {all.length
                    ? `No line matches. ${all.length.toLocaleString()} hidden by the filter.`
                    : 'This search matched nothing.'}
                </span>
              </div>
            ) : rows.map((row, i) => {
              const line = row.line as ResultLine;
              const prev = i > 0 ? (rows[i - 1].line as ResultLine) : undefined;
              /* A pod heading wherever the pod changes. The lines came from
                 several logs, and a wall with no divisions is one log that
                 contradicts itself. */
              const newPod = !prev || prev.pod !== line.pod;
              const isFrame = !!row.folded?.length || false;
              const open = expanded.has(line.seq);

              return (
                <div key={line.seq}>
                  {newPod && (
                    <div className="flex items-baseline gap-2 mt-3 mb-1 px-1.5 py-1 rounded"
                         style={{
                           background: `color-mix(in srgb, ${ACCENT} 9%, transparent)`,
                           borderLeft: `2px solid ${ACCENT}`,
                         }}>
                      <span style={{ color: ACCENT, fontWeight: 600 }}>{line.pod}</span>
                      <span style={{ color: 'var(--color-text-muted)' }}>{line.namespace}</span>
                      <span className="text-[10px] px-1.5 rounded" style={{
                        color: 'var(--color-text-muted)',
                        background: 'color-mix(in srgb, var(--color-text-muted) 12%, transparent)',
                      }}>
                        {line.source === 'archive' ? (line.rel ?? 'archive') : 'live'}
                      </span>
                    </div>
                  )}

                  <div
                    className="flex gap-2.5 items-start"
                    style={{
                      whiteSpace: wrap ? 'pre-wrap' : 'pre',
                      /*
                        The matched line is the point of the page, so it wears
                        the accent; the lines kept beside it recede. Level still
                        wins for an error, because "this is the line you
                        searched for" and "this line is an error" are both worth
                        knowing and the second is the more urgent.
                      */
                      background: line.level === 'error'
                        ? 'color-mix(in srgb, var(--color-error) 7%, transparent)'
                        : line.level === 'warn'
                          ? 'color-mix(in srgb, var(--color-warning) 5%, transparent)'
                          : !line.context
                            ? `color-mix(in srgb, ${ACCENT} 6%, transparent)`
                            : 'transparent',
                      borderLeft: `2px solid ${
                        line.level === 'error' ? 'var(--color-error)'
                          : line.level === 'warn' ? 'var(--color-warning)'
                            : !line.context ? ACCENT : 'transparent'
                      }`,
                      paddingLeft: 6,
                    }}
                  >
                    {logLineNumbers && (
                      <span className="shrink-0 select-none text-right"
                            style={{
                              width: 52, color: 'var(--color-text-muted)', opacity: 0.45,
                              fontVariantNumeric: 'tabular-nums',
                            }}>
                        {/* The pod's own line number, not this page's. It is
                            what a reader checks against `kubectl logs`. */}
                        {line.sourceLine}
                      </span>
                    )}

                    {line.ts !== undefined && (
                      <span className="shrink-0 select-none"
                            style={{ color: 'var(--color-text-muted)', opacity: 0.6, fontVariantNumeric: 'tabular-nums' }}>
                        {formatLogTime(line.ts)}
                      </span>
                    )}
                    <LevelTag level={line.level} />

                    <span style={{
                      color: line.level === 'error' ? 'var(--color-error)'
                        : line.level === 'warn' ? 'var(--color-warning)'
                          : line.level === 'debug' ? 'var(--color-text-muted)'
                            : 'var(--color-text-primary)',
                      /* A line kept for what it sits next to recedes, so the
                         thing that was searched for is the thing that stands
                         out — the same rule the search dialog uses. */
                      opacity: line.context ? 0.55
                        : frameOrigin(line.text) === 'library' ? 0.6 : 1,
                      flex: wrap ? 1 : undefined,
                      minWidth: 0,
                    }}>
                      <Highlighted
                        text={displayText(line)}
                        /* The page filter's hits when one is typed, the
                           search's own otherwise — and they are coloured
                           differently, because one is what you asked the
                           cluster and the other is how you are getting around
                           the answer. */
                        hits={filter ? row.line.hits : line.hits}
                        search={!filter}
                      />
                    </span>

                    {isFrame && (
                      <button
                        type="button"
                        onClick={() => setExpanded((s) => {
                          const next = new Set(s);
                          if (next.has(line.seq)) next.delete(line.seq); else next.add(line.seq);
                          return next;
                        })}
                        className="shrink-0 text-[10px] px-1.5 rounded cursor-pointer"
                        style={{
                          color: 'var(--color-text-muted)',
                          background: 'color-mix(in srgb, var(--color-text-muted) 10%, transparent)',
                        }}
                      >
                        {open ? 'hide' : `+${row.folded!.length} frames`}
                      </button>
                    )}
                  </div>

                  {isFrame && open && row.folded!.map(f => (
                    <div key={f.seq} className="flex gap-2.5 items-start"
                         style={{ paddingLeft: 28, whiteSpace: wrap ? 'pre-wrap' : 'pre' }}>
                      <span style={{
                        color: 'var(--color-text-secondary)',
                        opacity: frameOrigin(f.text) === 'library' ? 0.55 : 0.85,
                      }}>
                        {displayText(f)}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
