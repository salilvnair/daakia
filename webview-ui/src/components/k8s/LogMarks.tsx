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
import { ButtonView, CheckboxView } from '@salilvnair/dui';
import type { LogLine } from '../../store/k8s-store';
import { MARK_COLORS, type CataloguePattern } from '../../store/dk8s-logger-store';
import {
  compileMarks, indexMarks, countIndex, markFacets, markedLevels,
  type CompiledMark, type MarkHit, type MarkFacet,
} from './logger-marks';
import { shortName } from './logger-catalogue';
import { templateParts } from './logger-pattern';
import { CloseIcon, MarkFlagIcon } from '../../icons';
import { CARD, EDGE, TEXT, LABEL, QUIET, MONO, MARKS, MARKS_CHIP, OUTLINE_BUTTON } from './asklog-tone';

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

/**
 * "3 marked patterns highlighted ×", and Only marked beside it.
 *
 * As the LogsMarked board draws it: a hairline after the level chips, then a
 * purple pill with no edge — a flag, the count, the way out — so it reads as
 * a state the log is in rather than as one more filter chip. A value picked
 * in the rail is a second pill of the same kind, and Only marked is a plain
 * checkbox in the label colour, the same as Following at the other end.
 */
export function MarkedBar({ count, onlyMarked, onOnlyMarked, onClear, field, onClearField }: {
  count: number;
  onlyMarked: boolean;
  onOnlyMarked: (on: boolean) => void;
  onClear: () => void;
  field?: { field: string; value: string };
  onClearField: () => void;
}) {
  return (
    <div className="flex items-center shrink-0" style={{ gap: 8 }}>
      <span aria-hidden="true" className="shrink-0" style={{ width: 1, height: 18, background: EDGE }} />
      <span className="inline-flex items-center shrink-0" style={PILL}
            title="Marked in the Loggers tab. Each lights the lines it matches, in its own colour.">
        <MarkFlagIcon size={11} />
        {count} marked pattern{count === 1 ? '' : 's'} highlighted
        <button type="button" onClick={onClear} title="Clear every mark" aria-label="Clear marks"
                className="inline-flex border-none bg-transparent cursor-pointer p-0" style={{ color: MARKS }}>
          <CloseIcon size={11} />
        </button>
      </span>
      {field && (
        <span className="inline-flex items-center shrink-0" style={PILL}>
          <span style={{ fontFamily: MONO }}>{field.field} {field.value}</span>
          <button type="button" onClick={onClearField} title="Show every marked line again" aria-label="Clear this value"
                  className="inline-flex border-none bg-transparent cursor-pointer p-0" style={{ color: MARKS }}>
            <CloseIcon size={11} />
          </button>
        </span>
      )}
      <span className="inline-flex items-center shrink-0" style={{ gap: 7 }}>
        <CheckboxView checked={onlyMarked} onChange={onOnlyMarked} size="sm" accentColor={MARKS} />
        <span onClick={() => onOnlyMarked(!onlyMarked)} className="select-none cursor-pointer"
              style={{ fontSize: 11.5, color: LABEL }}>
          Only marked
        </span>
      </span>
    </div>
  );
}

/** The board's purple pill: 26px, fully round, 14% fill, no edge. */
const PILL = {
  gap: 7, height: 26, padding: '0 10px', borderRadius: 999,
  fontSize: 11.5, color: MARKS, background: MARKS_CHIP, whiteSpace: 'nowrap',
} as const;

/**
 * The map down the right edge: a tick per marked row, in its mark's colour,
 * placed where the row sits in the scroll — by its measured offset, so a
 * wrapped row takes its real share. Ticks that land on the same pixel are one
 * tick; a click jumps to the row it stands for.
 *
 * Drawn to the board: a 22px strip on the rail's colour with a hairline
 * edge, the ticks 10 by 3 with round ends, centred, and 6px clear at the top
 * and bottom so the first and last are not cut by the edge.
 */
const STRIP_PAD = 6;
const TICK_H = 3;

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
      const y = Math.min(height - TICK_H, Math.floor((offsets[i] / contentHeight) * height));
      if (!out.has(y)) out.set(y, { row: i, color: hit.color });
    }
    return out;
  }, [rows, offsets, contentHeight, index, height]);

  return (
    <div className="relative shrink-0" aria-label="Where the marked lines are"
         style={{ width: 22, borderLeft: `1px solid ${EDGE}`, background: CARD, padding: `${STRIP_PAD}px 0` }}>
      <div ref={ref} className="relative h-full">
        {[...ticks.entries()].map(([y, t]) => (
          <button
            key={y}
            type="button"
            onClick={() => onJump(t.row)}
            title="Go to this marked line"
            className="absolute border-none cursor-pointer p-0"
            style={{ top: y, left: 5, width: 10, height: TICK_H, borderRadius: 2, background: MARK_COLORS[t.color] ?? MARKS }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The rail's top: MARKED FROM LOGGERS, then LEVEL and a group per hole.
 *
 * A mark's row steps to its next line; a hole's value narrows the log to the
 * marked lines carrying it, and pressing it again lets go.
 *
 * Each mark is a card the way the board draws one: its colour as a 2px edge
 * on the left and an 8% wash behind, the template on one line in the text
 * colour — holes and all, since the edge on this card already says which
 * mark it is — and "Logger · N hits" under it.
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
    <div className="flex flex-col shrink-0" style={{ padding: '12px 0 4px' }}>
      <Heading color={MARKS}>MARKED FROM LOGGERS</Heading>
      {marked.map((p, i) => {
        const color = MARK_COLORS[p.color ?? 0];
        const n = idx.counts[p.id] ?? 0;
        return (
          <button key={p.id} type="button" onClick={() => onNext(p.id)} disabled={!n}
                  title={n ? 'Go to its next line' : 'Nothing in the buffer matches it'}
                  className="flex border-none text-left"
                  style={{
                    gap: 8, padding: '6px 12px', marginTop: i ? 4 : 0,
                    borderLeft: `2px solid ${color}`,
                    background: `color-mix(in srgb, ${color} 8%, transparent)`,
                    cursor: n ? 'pointer' : 'default',
                  }}>
            <span className="flex flex-col min-w-0">
              <span className="truncate" style={{ fontFamily: MONO, fontSize: 11, color: n ? TEXT : QUIET }}>
                {templateText(p.template)}
              </span>
              <span style={{ fontSize: 10.5, color: QUIET }}>
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
            <div key={level} className="flex" style={{ gap: 8, padding: '3px 12px', fontSize: 12, color: LABEL }}>
              <span className="flex-1">{level.toUpperCase()}</span>
              <span style={{ color: QUIET }}>{n.toLocaleString()}</span>
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
                      className="flex border-none cursor-pointer text-left"
                      style={{ gap: 8, padding: '3px 12px', fontSize: 12, background: on ? MARKS_CHIP : 'transparent' }}>
                <span className="flex-1 min-w-0 truncate" style={{ fontFamily: MONO, color: on ? MARKS : LABEL }}>{value}</span>
                <span style={{ color: QUIET }}>{n}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** `Order {orderId} rejected: {reason}`, as the one string the card shows. */
function templateText(template: string): string {
  return templateParts(template).map(p => (p.hole ? `{${p.text}}` : p.text)).join('');
}

function Heading({ children, top, color }: { children: string; top?: boolean; color?: string }) {
  return (
    <span style={{
      padding: `${top ? 16 : 0}px 12px 8px`, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em',
      color: color ?? LABEL,
    }}>
      {children}
    </span>
  );
}

/**
 * The footer's count: "24 match a marked pattern in view", right after the
 * line count it qualifies and in the footer's own quiet colour — the board
 * reads them as one sentence, "1,566 lines · 24 match a marked pattern".
 */
export function MarkedCount({ inView }: { inView: number }) {
  return (
    <span style={{ color: QUIET, fontVariantNumeric: 'tabular-nums' }}>
      {` · ${inView.toLocaleString()} match a marked pattern in view`}
    </span>
  );
}

/** The footer's jump, the board's outlined 24px button beside Ask AI. */
export function MarkedJump({ inView, onNext }: { inView: number; onNext: () => void }) {
  return (
    <ButtonView variant="secondary" accentColor={MARKS} disabled={!inView} onClick={onNext} style={OUTLINE_BUTTON}>
      Jump to next match
    </ButtonView>
  );
}
