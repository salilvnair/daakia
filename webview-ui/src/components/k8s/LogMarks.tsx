/**
 * Marks in the Logs tab — everything beyond the tinted row.
 *
 * Mark a logger or a pattern in the Loggers tab and the Logs tab lights every
 * line that matches, a colour per mark. What that needs, besides the tint the
 * rows already had:
 *
 *   - a MAP down the right edge, one tick per marked line in its colour, so
 *     "where are they" is answered before anybody scrolls — the same idea as
 *     the density ribbon beside it, for marks instead of levels;
 *   - a CHIP in the toolbar saying how many marks are lit, with the way out;
 *   - ONLY MARKED, which hides the rest — a mark leaves the log intact, and
 *     this is the one switch that stops it doing so, on purpose;
 *   - the RAIL's "MARKED FROM LOGGERS", each mark with its hits, and the holes
 *     of the marked patterns as facets: a pattern already knows where the
 *     order id is in its line, so the log can be split by it without a log
 *     format having named it;
 *   - JUMP TO NEXT MATCH, in the footer beside the count.
 *
 * All of it reads one index of the whole buffer (`indexMarks`), remembered
 * per line so a following log costs one match per new line. LogViewer owns
 * the state; these are the pieces it draws, kept here so the shared view
 * grows by a few hooks rather than a few hundred lines.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ButtonView, CheckboxView, IconSize } from '@salilvnair/dui';
import type { LogLine } from '../../store/k8s-store';
import { MARK_COLORS, type CataloguePattern } from '../../store/dk8s-logger-store';
import {
  compileMarks, indexMarks, countIndex, markFacets, markedLevels,
  type CompiledMark, type MarkHit, type MarkFacet,
} from './logger-marks';
import { shortName } from './logger-catalogue';
import { PatternTemplate } from './PatternTemplate';
import { CloseIcon } from '../../icons';
import { LOGGERS, LOGGERS_SOFT } from './tone';

export interface MarkIndex {
  marks: CompiledMark[];
  /** Line seq → the mark that claims it, over the whole buffer. */
  index: Map<number, MarkHit>;
  counts: Record<string, number>;
  facets: MarkFacet[];
  levels: [string, number][];
}

/**
 * The marks, and the whole buffer's index of them.
 *
 * The per-line cache is thrown away when the marks change — the only thing
 * that can change a line's answer — and kept across new lines otherwise.
 */
export function useMarkIndex(catalogue: CataloguePattern[], logs: LogLine[]): MarkIndex {
  const marks = useMemo(() => compileMarks(catalogue), [catalogue]);
  const cache = useRef<{ marks: CompiledMark[]; lines: Map<number, MarkHit | null> }>({ marks, lines: new Map() });
  if (cache.current.marks !== marks) cache.current = { marks, lines: new Map() };
  /* A buffer that was replaced (a new fetch) reuses seqs from 0; a cache much
     larger than the buffer is one describing lines that are gone. */
  if (cache.current.lines.size > logs.length * 2 + 1000) cache.current.lines = new Map();

  const index = useMemo(
    () => indexMarks(logs, marks, cache.current.lines),
    [logs, marks],
  );
  const counts = useMemo(() => countIndex(index), [index]);
  const facets = useMemo(() => markFacets(index), [index]);
  const levels = useMemo(() => markedLevels(logs, index), [logs, index]);
  return { marks, index, counts, facets, levels };
}

/** "3 marked patterns highlighted ×", and Only marked beside it. */
export function MarkedBar({ count, onlyMarked, onOnlyMarked, onClear, field, onClearField }: {
  count: number;
  onlyMarked: boolean;
  onOnlyMarked: (on: boolean) => void;
  onClear: () => void;
  field?: { field: string; value: string };
  onClearField: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 shrink-0">
      <span className="flex items-center rounded overflow-hidden"
            style={{ height: 26, border: `1px solid color-mix(in srgb, ${LOGGERS} 40%, transparent)`, background: LOGGERS_SOFT }}>
        <span className="px-2 text-[11px]" style={{ color: LOGGERS, fontWeight: 600 }}
              title="Marked in the Loggers tab. Each lights the lines it matches, in its own colour.">
          {count} marked pattern{count === 1 ? '' : 's'} highlighted
        </span>
        <button type="button" onClick={onClear} title="Clear every mark" aria-label="Clear every mark"
                className="flex items-center h-full px-1.5 border-none bg-transparent cursor-pointer"
                style={{ color: LOGGERS }}>
          <CloseIcon size={IconSize.chip} />
        </button>
      </span>
      {field && (
        <span className="flex items-center rounded overflow-hidden"
              style={{ height: 26, border: `1px solid color-mix(in srgb, ${LOGGERS} 40%, transparent)` }}>
          <span className="px-2 text-[11px] font-mono" style={{ color: LOGGERS }}>{field.field} {field.value}</span>
          <button type="button" onClick={onClearField} title="Show every marked line again" aria-label="Clear this value"
                  className="flex items-center h-full px-1.5 border-none bg-transparent cursor-pointer" style={{ color: LOGGERS }}>
            <CloseIcon size={IconSize.chip} />
          </button>
        </span>
      )}
      <CheckboxView checked={onlyMarked} onChange={onOnlyMarked} size="md" accentColor={LOGGERS} label="Only marked" />
    </div>
  );
}

/**
 * The map down the right edge: a tick per marked row, in its mark's colour,
 * placed where the row sits in the scroll — by its measured offset, so a
 * wrapped row takes its real share. Ticks that land on the same pixel are one
 * tick; a click jumps to the row it stands for.
 */
export function MarkMapStrip({ rows, offsets, contentHeight, index, onJump }: {
  rows: { line: { seq: number }; isFrame?: boolean }[];
  offsets: Float64Array;
  contentHeight: number;
  index: Map<number, MarkHit>;
  onJump: (rowIndex: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setHeight(e.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ticks = useMemo(() => {
    const out = new Map<number, { row: number; color: number }>();
    if (!height || !contentHeight) return out;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].isFrame) continue;
      const hit = index.get(rows[i].line.seq);
      if (!hit) continue;
      const y = Math.min(height - 2, Math.floor((offsets[i] / contentHeight) * height));
      if (!out.has(y)) out.set(y, { row: i, color: hit.color });
    }
    return out;
  }, [rows, offsets, contentHeight, index, height]);

  return (
    <div ref={ref} className="relative shrink-0" aria-label="Where the marked lines are"
         style={{ width: 8, borderLeft: '1px solid var(--color-surface-border)' }}>
      {[...ticks.entries()].map(([y, t]) => (
        <button
          key={y}
          type="button"
          onClick={() => onJump(t.row)}
          title="Go to this marked line"
          className="absolute border-none cursor-pointer p-0"
          style={{ top: y, left: 1, width: 6, height: 2, background: MARK_COLORS[t.color] ?? LOGGERS }}
        />
      ))}
    </div>
  );
}

/**
 * The rail's top: MARKED FROM LOGGERS, then LEVEL and a group per hole.
 *
 * A mark's row steps to its next line; a hole's value narrows the log to the
 * marked lines carrying it, and pressing it again lets go.
 */
export function MarkedRail({ patterns, idx, field, onNext, onField }: {
  patterns: CataloguePattern[];
  idx: MarkIndex;
  field?: { field: string; value: string };
  onNext: (markId: string) => void;
  onField: (field: string, value: string) => void;
}) {
  const marked = patterns.filter(p => p.marked);
  if (!marked.length) return null;
  return (
    <div className="flex flex-col shrink-0 py-2" style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
      <Heading>MARKED FROM LOGGERS</Heading>
      {marked.map(p => {
        const color = MARK_COLORS[p.color ?? 0];
        const n = idx.counts[p.id] ?? 0;
        return (
          <button key={p.id} type="button" onClick={() => onNext(p.id)} disabled={!n}
                  title={n ? 'Go to its next line' : 'Nothing in the buffer matches it'}
                  className="flex items-stretch gap-2 px-2.5 py-1 border-none bg-transparent text-left"
                  style={{ cursor: n ? 'pointer' : 'default' }}>
            <span className="shrink-0 rounded-sm" style={{ width: 3, background: color }} />
            <span className="flex flex-col min-w-0">
              <span className="font-mono text-[10.5px] truncate"><PatternTemplate template={p.template} dim={!n} /></span>
              <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                {p.logger ? `${shortName(p.logger)} · ` : ''}{n.toLocaleString()} hit{n === 1 ? '' : 's'}
              </span>
            </span>
          </button>
        );
      })}

      {idx.levels.length > 0 && (
        <>
          <Heading top>LEVEL</Heading>
          {idx.levels.map(([level, n]) => (
            <div key={level} className="flex items-center gap-2 px-2.5 py-0.5 text-[10.5px] font-mono">
              <span className="flex-1" style={{ color: level === 'error' ? 'var(--color-error)' : level === 'warn' ? 'var(--color-warning)' : 'var(--color-text-secondary)' }}>
                {level.toUpperCase()}
              </span>
              <span style={{ color: 'var(--color-text-muted)' }}>{n.toLocaleString()}</span>
            </div>
          ))}
        </>
      )}

      {idx.facets.map(f => (
        <div key={f.field} className="flex flex-col">
          <Heading top>{f.field.toUpperCase()}</Heading>
          {f.values.map(([value, n]) => {
            const on = field?.field === f.field && field.value === value;
            return (
              <button key={value} type="button" onClick={() => onField(f.field, value)}
                      title={on ? 'Show every marked line again' : `Only the marked lines where ${f.field} is ${value}`}
                      className="flex items-center gap-2 px-2.5 py-0.5 border-none cursor-pointer text-left text-[10.5px] font-mono"
                      style={{ background: on ? LOGGERS_SOFT : 'transparent' }}>
                <span className="flex-1 min-w-0 truncate" style={{ color: on ? LOGGERS : 'var(--color-text-secondary)' }}>{value}</span>
                <span style={{ color: 'var(--color-text-muted)' }}>{n}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Heading({ children, top }: { children: string; top?: boolean }) {
  return (
    <span className="px-2.5 pb-1 text-[9px] font-bold"
          style={{ paddingTop: top ? 8 : 0, letterSpacing: '0.06em', color: 'var(--color-text-muted)' }}>
      {children}
    </span>
  );
}

/** The footer's half: "24 match a marked pattern in view" and the jump. */
export function MarkedFooter({ inView, onNext }: { inView: number; onNext: () => void }) {
  return (
    <>
      <span style={{ color: LOGGERS, fontVariantNumeric: 'tabular-nums' }}>
        {inView.toLocaleString()} match a marked pattern in view
      </span>
      <ButtonView variant="secondary" size="xs" accentColor={LOGGERS} disabled={!inView} onClick={onNext}>
        Jump to next match
      </ButtonView>
    </>
  );
}
