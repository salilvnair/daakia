/**
 * Two texts, side by side, with the changed lines marked.
 *
 * ── Why this and not a Monaco diff ──
 *
 * Monaco's diff editor is a code editor first: it brings its own scrollbars,
 * its own minimap, its own selection model and a decoration pass that has to be
 * configured before it colours anything. For "show me what changed between
 * these two blobs" that is a lot of machinery to look at two hundred lines,
 * and every place that used it had to fight its sizing.
 *
 * This is the LCS result painted onto two aligned gutters. It started in the
 * schema comparison, where it replaced exactly that Monaco pair, and it reads
 * better for the same reason in every other place two texts are compared.
 *
 * ── Alignment is the whole point ──
 *
 * Both sides render the SAME row list. A line that exists only on one side is
 * drawn as an empty slot on the other, so a line sits opposite its counterpart
 * rather than opposite whatever happens to be nth in a file that gained three
 * rows higher up. Scrolling is shared for the same reason: two panes that drift
 * apart are two files, not a diff.
 */
import { useMemo, useRef, useCallback } from 'react';
import { SplitPanelView } from '@salilvnair/dui';
import { diffLines, tally, type DiffLine } from '../../../services/schema-diff/lcs';

const ROW = 17;

const TONE: Record<DiffLine['op'], { bg: string; fg: string }> = {
  add:    { bg: 'color-mix(in srgb, var(--color-success) 14%, transparent)', fg: 'var(--color-success)' },
  remove: { bg: 'color-mix(in srgb, var(--color-error) 14%, transparent)',   fg: 'var(--color-error)' },
  same:   { bg: 'transparent',                                               fg: 'var(--color-text-secondary)' },
};

/** One side of the pair. `side` decides which rows are real here and which are gaps. */
function Side({ lines, side, scrollRef, onScroll }: {
  lines: DiffLine[];
  side: 'left' | 'right';
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
}) {
  const gutterWidth = `${Math.max(2, String(lines.length).length)}ch`;

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="h-full overflow-auto font-mono"
      style={{ fontSize: 11, lineHeight: `${ROW}px`, background: 'var(--color-input-bg)' }}
    >
      {lines.map((l, i) => {
        /* A line the other side owns is a gap here — drawn, so the two gutters
           stay level, but with no number and no text. */
        const mine = side === 'left' ? l.op !== 'add' : l.op !== 'remove';
        const tone = mine ? TONE[l.op] : TONE.same;
        const no = side === 'left' ? l.sourceLine : l.targetLine;
        return (
          <div
            key={i}
            className="flex items-start"
            style={{
              minHeight: ROW,
              background: mine ? tone.bg : 'color-mix(in srgb, var(--color-text-primary) 3%, transparent)',
            }}
          >
            <span
              className="shrink-0 select-none text-right pr-2 pl-2"
              style={{
                width: gutterWidth, color: 'var(--color-text-muted)', opacity: 0.45,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {no ?? ''}
            </span>
            <span className="shrink-0 select-none pr-1" style={{ color: tone.fg, width: '1ch' }}>
              {mine && l.op !== 'same' ? (l.op === 'add' ? '+' : '-') : ''}
            </span>
            <span style={{ color: tone.fg, whiteSpace: 'pre' }}>{mine ? l.text : ''}</span>
          </div>
        );
      })}
    </div>
  );
}

export interface LineDiffPaneProps {
  left: string;
  right: string;
  leftLabel?: string;
  rightLabel?: string;
  /** Shown beside the label — e.g. the object name, or "not present". */
  leftNote?: string;
  rightNote?: string;
  /** A fixed height, or omit to fill a flex parent. */
  height?: number | string;
  /** Adds a "+n / −n" tally to the header. */
  showTally?: boolean;
}

export function LineDiffPane({
  left, right,
  leftLabel = 'Source', rightLabel = 'Target',
  leftNote, rightNote,
  height,
  showTally = false,
}: LineDiffPaneProps) {
  const lines = useMemo(() => diffLines(left, right), [left, right]);
  const counts = useMemo(() => tally(lines), [lines]);

  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  /* Without this the two onScroll handlers drive each other in a loop. */
  const syncing = useRef(false);

  const sync = useCallback((from: 'left' | 'right') => () => {
    if (syncing.current) return;
    const a = from === 'left' ? leftRef.current : rightRef.current;
    const b = from === 'left' ? rightRef.current : leftRef.current;
    if (!a || !b) return;
    syncing.current = true;
    b.scrollTop = a.scrollTop;
    b.scrollLeft = a.scrollLeft;
    requestAnimationFrame(() => { syncing.current = false; });
  }, []);

  const header = (text: string, sub: string | undefined, tone: string) => (
    <div
      className="flex items-baseline gap-2 px-2 py-1 shrink-0"
      style={{ borderBottom: '1px solid var(--color-surface-border)' }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: tone }}>{text}</span>
      {sub && <span className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>{sub}</span>}
      {showTally && (
        <span className="text-[10px] ml-auto font-mono shrink-0">
          <span style={{ color: 'var(--color-success)' }}>+{counts.added}</span>
          {' / '}
          <span style={{ color: 'var(--color-error)' }}>−{counts.removed}</span>
        </span>
      )}
    </div>
  );

  return (
    <div style={height !== undefined ? { height } : undefined} className="flex flex-col min-h-0 h-full">
      <SplitPanelView
        direction="horizontal"
        defaultSplit={50}
        minFirst={140}
        minSecond={140}
        style={{ flex: 1, minHeight: 0 }}
        first={
          <div className="flex flex-col h-full min-h-0">
            {header(leftLabel, leftNote, 'var(--color-error)')}
            <div className="flex-1 min-h-0">
              <Side lines={lines} side="left" scrollRef={leftRef} onScroll={sync('left')} />
            </div>
          </div>
        }
        second={
          <div className="flex flex-col h-full min-h-0">
            {header(rightLabel, rightNote, 'var(--color-success)')}
            <div className="flex-1 min-h-0">
              <Side lines={lines} side="right" scrollRef={rightRef} onScroll={sync('right')} />
            </div>
          </div>
        }
      />
    </div>
  );
}
