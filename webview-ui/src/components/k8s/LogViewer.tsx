/**
 * The log view.
 *
 * Built to the mock, and the mock is right about the things that matter:
 *
 *   - The density ribbon runs down the RIGHT side, not across the top. It is a
 *     map of a vertical scroll, so it has to share that axis — a horizontal
 *     strip asks you to mentally rotate it every time you use it. It also
 *     carries a "you are here" marker, which is what makes it a map rather
 *     than a picture.
 *   - Selecting text raises a toolbar AT the selection, not a bar at the
 *     bottom of the panel. The gesture and the action belong in the same place.
 *   - Stack traces fold to one row. An unfolded Java exception costs a screen
 *     and a half, so three of them mean you never see the fourth.
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  SearchInputView, SelectInputView, SegmentedControlView, CheckboxView, ButtonView,
} from '@salilvnair/dui';
import { WandIcon, SearchIcon, HelpCircleIcon, ChevronRightIcon, ChevronDownIcon } from '../../icons';
import { useK8sStore, type LogLevel } from '../../store/k8s-store';
import { useDk8sAiStore } from '../../store/dk8s-ai-store';
import {
  filterLines, densityBuckets, describeBucket, levelCounts, levelColor,
  formatLogTime, selectionText, LEVEL_ORDER, foldStackTraces, bufferBytes,
  compactCount, type MatchedLine,
} from './log-view';

const ACCENT = 'var(--color-dk8s)';
/**
 * Two tones, and the split is the point: cyan for anything that talks to the
 * cluster, the AI tone for the one button that sends data to a model. Colour
 * here tells you what a control will DO, which is worth more than making the
 * row pretty.
 */
const AI_ACCENT = 'var(--color-protocol-ai)';
const LIVE_ACCENT = 'var(--color-success)';
const ACCENT_SOFT = 'color-mix(in srgb, var(--color-dk8s) 16%, transparent)';
const ACCENT_FILL = 'color-mix(in srgb, var(--color-dk8s) 20%, transparent)';
const ACCENT_EDGE = 'color-mix(in srgb, var(--color-dk8s) 55%, transparent)';
const ROW_HEIGHT = 19;
const OVERSCAN = 25;
/** Width of the ribbon column, including its gutter. */
const RIBBON_W = 38;
/** The bands themselves. Thick enough to read as colour and to click. */
const RIBBON_BAND_W = 20;

const LEVEL_SHORT: Record<LogLevel, string> = {
  error: 'err', warn: 'wrn', info: 'info', debug: 'dbg', other: 'plain',
};

// ── Density ribbon: vertical, on the right ──────────────────────────────────

function DensityRibbon({
  lines, scrollTop, contentHeight, viewportHeight, onJump, onScrollTo, onDragStart, onDragEnd,
}: {
  lines: MatchedLine[];
  /**
   * The marker is derived from the scroll position, NOT from the
   * virtualisation indices.
   *
   * Those indices count folded rows while the bands count unfiltered lines —
   * two different scales — and they are clamped by the overscan at both ends.
   * Mapping the marker through them put it near the top while the scrollbar
   * sat at the bottom, and made the last bands unreachable. Scroll fraction is
   * the same quantity the scrollbar itself uses, so this agrees with it by
   * construction.
   */
  scrollTop: number;
  contentHeight: number;
  viewportHeight: number;
  onJump: (index: number) => void;
  /** Absolute scroll, for drag. The ribbon replaces the native scrollbar. */
  onScrollTo: (top: number) => void;
  /**
   * Dragging has to suspend tail-following.
   *
   * Without this, dragging near the bottom sets scrollTop, the scroll handler
   * sees "at bottom" and turns following back on, the follow effect yanks the
   * view to the end, and the next pointer move drags it back — which reads as
   * the content flickering up and down under the cursor.
   */
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(400);
  const [dragging, setDragging] = useState(false);
  /**
   * Whether this gesture actually moved.
   *
   * `dragging` is already false by the time a click fires, so a band's onClick
   * cannot use it to tell a drag from a click — the drag would end by also
   * jumping to whichever band the pointer happened to be over.
   */
  const movedRef = useRef(false);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver(() => setHeight(Math.max(60, el.clientHeight)));
    ro.observe(el);
    setHeight(Math.max(60, el.clientHeight));
    return () => ro.disconnect();
  }, []);

  // One band per ~7px of height. Coarser than the horizontal version was,
  // because a band has to be clickable and readable as a colour.
  const bands = Math.max(8, Math.floor(height / 7));
  const buckets = useMemo(() => densityBuckets(lines, bands), [lines, bands]);

  // Exactly what the scrollbar shows: how much of the content is visible, and
  // how far down it we are.
  const scrollable = Math.max(0, contentHeight - viewportHeight);
  const visibleFraction = contentHeight > 0
    ? Math.min(1, viewportHeight / contentHeight)
    : 1;
  const scrolledFraction = scrollable > 0 ? Math.min(1, scrollTop / scrollable) : 0;

  const viewH = Math.max(8, visibleFraction * height);
  // Travel is the track minus the marker, so at scrollTop = max the marker's
  // BOTTOM lands on the track's bottom rather than its top overshooting it.
  const viewTop = scrolledFraction * (height - viewH);

  /**
   * Drag like a scrollbar thumb.
   *
   * The pointer grabs the CENTRE of the marker and the marker follows, which is
   * how every scrollbar behaves — anchoring the marker's top to the pointer
   * instead makes it jump downward by half its height the moment you touch it.
   */
  const scrollToPointer = useCallback((clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const travel = Math.max(1, rect.height - viewH);
    const y = clientY - rect.top - viewH / 2;
    const fraction = Math.min(1, Math.max(0, y / travel));
    onScrollTo(fraction * scrollable);
  }, [viewH, scrollable, onScrollTo]);

  const onPointerDown = (e: React.PointerEvent) => {
    // Capture on the TRACK, not on whichever band was under the pointer, so
    // every subsequent move is measured against the same element.
    ref.current?.setPointerCapture?.(e.pointerId);
    movedRef.current = false;
    setDragging(true);
    onDragStart();
    scrollToPointer(e.clientY);
  };

  const endDrag = (e: React.PointerEvent) => {
    ref.current?.releasePointerCapture?.(e.pointerId);
    setDragging(false);
    onDragEnd();
  };

  return (
    <div className="relative shrink-0 flex flex-col items-stretch py-1"
         style={{ width: RIBBON_W }}>
      <div
        ref={ref}
        className="relative flex-1 flex flex-col gap-px mx-auto"
        style={{ width: RIBBON_BAND_W, cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={e => {
          if (!dragging) return;
          movedRef.current = true;
          scrollToPointer(e.clientY);
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {buckets.map(b => (
          <div
            key={b.startIndex}
            // A click that did not turn into a drag jumps to the band — the
            // precise gesture, kept alongside the coarse one.
            onClick={() => { if (!movedRef.current) onJump(b.startIndex); }}
            title={describeBucket(b)}
            className="transition-opacity hover:opacity-100"
            style={{
              flex: 1,
              minHeight: 2,
              borderRadius: 2,
              background: levelColor(b.worst),
              // Errors at full strength, calm stretches receded to texture —
              // the ribbon exists to make trouble findable, not to be even.
              opacity: b.worst === 'error' ? 0.95 : b.worst === 'warn' ? 0.72 : 0.3,
            }}
          />
        ))}

        {/* You are here. Without this the ribbon shows the shape of the buffer
            but not your place in it, which is half of what makes it useful. */}
        {contentHeight > 0 && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: -4, right: -4,
              top: viewTop,
              height: viewH,
              border: `1.5px solid ${ACCENT}`,
              borderRadius: 3,
              background: `color-mix(in srgb, ${ACCENT} 10%, transparent)`,
              boxShadow: `0 0 6px color-mix(in srgb, ${ACCENT} 45%, transparent)`,
              // No transition while dragging, or the marker lags the pointer.
              transition: dragging ? 'none' : 'top .12s linear',
            }}
          />
        )}
      </div>
    </div>
  );
}

// ── Level chips ─────────────────────────────────────────────────────────────

function LevelChips() {
  const { logs, logLevels, toggleLogLevel } = useK8sStore();
  const counts = useMemo(() => levelCounts(logs), [logs]);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {LEVEL_ORDER.filter(l => counts[l] > 0).map(level => {
        const on = logLevels.includes(level);
        // Nothing selected means everything, so no chip is dimmed until the
        // user picks — all-chips-off with all-lines-showing is a lie.
        const idle = logLevels.length === 0;
        const color = levelColor(level);
        return (
          <button
            key={level}
            type="button"
            onClick={() => toggleLogLevel(level)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10.5px] cursor-pointer transition-all"
            style={{
              background: on ? `color-mix(in srgb, ${color} 18%, transparent)` : 'transparent',
              border: `1px solid ${on ? `color-mix(in srgb, ${color} 50%, transparent)` : 'var(--color-surface-border)'}`,
              color: on || idle ? color : 'var(--color-text-muted)',
              fontWeight: on ? 600 : 400,
              opacity: idle || on ? 1 : 0.5,
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: 5, background: color }} />
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{compactCount(counts[level])}</span>
            {LEVEL_SHORT[level]}
          </button>
        );
      })}
    </div>
  );
}

// ── One line ────────────────────────────────────────────────────────────────

function Highlighted({ text, hits }: { text: string; hits?: [number, number][] }) {
  if (!hits?.length) return <>{text}</>;
  const out: React.ReactNode[] = [];
  let at = 0;
  hits.forEach(([from, to], i) => {
    if (from > at) out.push(text.slice(at, from));
    out.push(
      <mark key={i} style={{
        background: `color-mix(in srgb, ${ACCENT} 34%, transparent)`,
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

/** The level token, coloured, in its own column so lines align. */
function LevelTag({ level }: { level: LogLevel }) {
  if (level === 'other') return <span className="shrink-0" style={{ width: 42 }} />;
  return (
    <span className="shrink-0 select-none uppercase"
          style={{ width: 42, color: levelColor(level), fontWeight: 600, fontSize: '10.5px' }}>
      {level === 'debug' ? 'DEBUG' : level}
    </span>
  );
}

// ── Selection toolbar ───────────────────────────────────────────────────────

/**
 * Raised at the selection itself.
 *
 * A bar pinned to the bottom of the panel makes you look away from what you
 * just highlighted to find the button that acts on it. This appears beside the
 * line, which is where your eye already is.
 */
function SelectionToolbar({ rect, lineCount, onAsk, onExplain, onGrep }: {
  rect: { top: number; left: number };
  lineCount: number;
  onAsk: () => void;
  onExplain: () => void;
  onGrep: () => void;
}) {
  return (
    <div
      className="absolute z-30 flex items-center gap-1.5 px-2 py-1.5 rounded-lg"
      style={{
        top: rect.top, left: rect.left,
        // A solid strip, not floating chips. Over a dense log the buttons had
        // log text showing between and behind them and were barely findable.
        background: 'var(--color-surface)',
        border: '1px solid var(--color-surface-border)',
        boxShadow: '0 6px 20px rgba(0,0,0,.55)',
      }}
      onMouseDown={e => e.preventDefault()}   // keep the selection alive
    >
      <span className="text-[10px] px-1 select-none whitespace-nowrap"
            style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
        {lineCount} line{lineCount === 1 ? '' : 's'}
      </span>

      <ButtonView
        label="Ask AI why"
        size="xs"
        variant="secondary"
        accentColor={AI_ACCENT}
        color={AI_ACCENT}
        onClick={onAsk}
        iconLeft={<WandIcon size={10} color={AI_ACCENT} />}
        style={{
          background: 'color-mix(in srgb, var(--color-protocol-ai) 18%, transparent)',
          borderColor: 'color-mix(in srgb, var(--color-protocol-ai) 48%, transparent)',
          fontWeight: 600,
        }}
      />
      <ButtonView
        label="Explain"
        size="xs"
        variant="secondary"
        accentColor={AI_ACCENT}
        onClick={onExplain}
        iconLeft={<HelpCircleIcon size={10} />}
        style={{ background: 'transparent' }}
      />
      <ButtonView
        label="Grep"
        size="xs"
        variant="secondary"
        accentColor={ACCENT}
        onClick={onGrep}
        iconLeft={<SearchIcon size={10} />}
        style={{ background: 'transparent' }}
      />
    </div>
  );
}

// ── The viewer ──────────────────────────────────────────────────────────────

export function LogViewer() {
  const {
    logs, logStatus, logDetail, logDropped, logFilter, logLevels,
    logFollow, logLive, logTail, logDirection, logSince, logWrap, logPrevious,
    detail, runtime,
    setLogFilter, setLogFollow, setLogLive, setLogTail, setLogDirection,
    setLogSince, setLogWrap, setLogPrevious, setLogSelection,
    fetchLogs, openLogExport,
  } = useK8sStore();
  const ask = useDk8sAiStore(s => s.ask);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  /** True while the ribbon is being dragged; freezes the follow logic. */
  const draggingRef = useRef(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(400);
  const [foldTraces, setFoldTraces] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [toolbar, setToolbar] = useState<{ top: number; left: number } | null>(null);
  const selectionRef = useRef<{ text: string; first: number; last: number; count: number } | null>(null);

  const visible = useMemo(
    () => filterLines(logs, { query: logFilter, levels: logLevels }),
    [logs, logFilter, logLevels],
  );

  // Fold, then expand the ones the user opened. Expansion is keyed on the
  // heading line's seq so it survives new lines arriving above it.
  const rows = useMemo(() => {
    const folded = foldStackTraces(visible, foldTraces);
    const out: { line: MatchedLine; folded?: MatchedLine[]; isFrame?: boolean }[] = [];
    for (const r of folded) {
      out.push({ line: r.line, folded: r.folded });
      if (r.folded && expanded.has(r.line.seq)) {
        for (const f of r.folded) out.push({ line: f, isFrame: true });
      }
    }
    return out;
  }, [visible, foldTraces, expanded]);

  const total = rows.length;
  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(total, Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + OVERSCAN);
  const slice = rows.slice(first, last);

  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
    ro.observe(el);
    setViewportH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  // Follow the tail, but only from the bottom. Yanking the view down while
  // someone is reading history is the worst thing a log viewer can do.
  useEffect(() => {
    if (!logFollow || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [total, logFollow]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    setToolbar(null);
    // While the ribbon is being dragged, the scroll position is an OUTPUT of
    // the gesture. Feeding it back into the follow decision makes the two
    // fight each other, which is what the flicker was.
    if (draggingRef.current) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (atBottom !== logFollow) setLogFollow(atBottom);
  }, [logFollow, setLogFollow]);

  /**
   * Jump to a band.
   *
   * The band's index counts FILTERED LINES; the scroll position counts RENDERED
   * ROWS, and folding collapses a stack trace's forty lines into one. Scrolling
   * to `index * ROW_HEIGHT` therefore lands progressively further past the
   * target the more traces are folded above it. Translate through the line's
   * seq, which is stable across both.
   */
  const jumpTo = useCallback((visibleIndex: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const seq = visible[Math.min(visibleIndex, visible.length - 1)]?.seq;
    if (seq === undefined) return;

    let rowIndex = rows.findIndex(r =>
      r.line.seq === seq || r.folded?.some(f => f.seq === seq));
    if (rowIndex === -1) rowIndex = Math.min(visibleIndex, rows.length - 1);

    setLogFollow(false);
    el.scrollTop = Math.max(0, rowIndex * ROW_HEIGHT - el.clientHeight / 3);
  }, [visible, rows, setLogFollow]);

  // ── Selection ──
  //
  // Captured while it exists: clicking a button collapses the selection, so
  // reading it at click time returns nothing.
  const captureSelection = useCallback(() => {
    const sel = window.getSelection();
    const host = bodyRef.current;
    if (!sel || sel.isCollapsed || !sel.toString().trim() || !host) {
      setToolbar(null);
      selectionRef.current = null;
      setLogSelection(undefined);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!host.contains(range.commonAncestorContainer)) return;

    const seqOf = (node: Node | null): number | undefined => {
      let el: HTMLElement | null =
        node instanceof HTMLElement ? node : (node?.parentElement ?? null);
      while (el && !el.dataset.seq) el = el.parentElement;
      return el?.dataset.seq ? Number(el.dataset.seq) : undefined;
    };
    const a = seqOf(sel.anchorNode);
    const b = seqOf(sel.focusNode);
    if (a === undefined || b === undefined) { setToolbar(null); return; }

    const firstSeq = Math.min(a, b);
    const lastSeq = Math.max(a, b);
    // Rebuilt from the buffer, not from the DOM: the rendered text has no
    // timestamps and would drag the gutter along with it.
    const text = selectionText(logs, firstSeq, lastSeq);
    const count = lastSeq - firstSeq + 1;
    selectionRef.current = { text, first: firstSeq, last: lastSeq, count };
    setLogSelection({ text, firstSeq, lastSeq, lineCount: count });

    const r = range.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    setToolbar({
      // Above the selection where there is room, below it at the very top.
      top: Math.max(4, r.top - hostRect.top - 38),
      left: Math.min(Math.max(8, r.left - hostRect.left), Math.max(8, hostRect.width - 400)),
    });
  }, [logs, setLogSelection]);

  useEffect(() => {
    document.addEventListener('selectionchange', captureSelection);
    return () => document.removeEventListener('selectionchange', captureSelection);
  }, [captureSelection]);

  const sendToAi = (promptKey: string, title: string) => {
    const sel = selectionRef.current;
    if (!sel || !detail) return;
    setToolbar(null);
    ask({
      promptKey, title,
      evidence: sel.text,
      evidenceLabel: `SELECTED LOG (${sel.count} line${sel.count === 1 ? '' : 's'})`,
      podContext: {
        pod: detail.name, namespace: detail.namespace, phase: detail.phase,
        restarts: detail.restarts, reason: detail.reason,
        runtime: runtime?.runtime, image: detail.containers[0]?.image,
      },
    });
  };

  /** The whole buffer, summarised. The mock's Analyze button. */
  const analyzeBuffer = () => {
    if (!logs.length || !detail) return;
    // Head and tail rather than the middle: a 5000-line buffer will not fit
    // in a prompt, and the start and end of a window are where the story is.
    const body = visible.length > 1200
      ? [
          ...visible.slice(0, 600).map(l => l.text),
          '\u2026 ' + (visible.length - 1200).toLocaleString() + ' lines omitted \u2026',
          ...visible.slice(-600).map(l => l.text),
        ].join('\n')
      : visible.map(l => l.text).join('\n');

    ask({
      promptKey: 'dk8s.log.summarise',
      title: 'Summarise this log',
      evidence: body,
      evidenceLabel: 'LOG BUFFER (' + visible.length.toLocaleString() + ' lines)',
      podContext: {
        pod: detail.name, namespace: detail.namespace, phase: detail.phase,
        restarts: detail.restarts, reason: detail.reason, runtime: runtime?.runtime,
      },
    });
  };

  const grepSelection = () => {
    const sel = selectionRef.current;
    if (!sel) return;
    // The first line, trimmed to something that will actually match again —
    // a whole multi-line selection as a filter matches nothing.
    const firstLine = sel.text.split('\n')[0].replace(/^\S+\s/, '').trim();
    setLogFilter(firstLine.slice(0, 60));
    setToolbar(null);
    window.getSelection()?.removeAllRanges();
  };

  const containers = detail?.containers ?? [];
  const oldest = logs.find(l => l.ts !== undefined)?.ts;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Controls: every strip lives up here ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 flex-wrap shrink-0"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <LevelChips />

        <div style={{ width: 230 }}>
          <SearchInputView
            value={logFilter}
            onChange={(v: string) => setLogFilter(v)}
            placeholder="Filter — text, or /regex/"
            size="sm"
          />
        </div>

        {containers.length > 1 && (
          <div className="flex items-center gap-1">
            {containers.map(c => <ContainerChip key={c.name} name={c.name} />)}
          </div>
        )}

        <div className="flex-1" />

        <CheckboxView label="wrap" checked={logWrap} onChange={setLogWrap}
                      size="sm" accentColor={ACCENT} />
        <CheckboxView label="fold traces" checked={foldTraces} onChange={setFoldTraces}
                      size="sm" accentColor={ACCENT} />

        {/* Which end, and how much. Nothing is fetched until Fetch is pressed —
            a selector that reloads on change is the "it keeps refreshing"
            behaviour this whole view exists to avoid. */}
        <SegmentedControlView
          value={logDirection}
          onChange={v => setLogDirection(v as 'last' | 'first')}
          options={[{ value: 'last', label: 'last' }, { value: 'first', label: 'first' }]}
          size="sm"
          accentColor={ACCENT}
        />

        <SelectInputView
          value={String(logTail)}
          onChange={v => setLogTail(Number(v))}
          options={[100, 200, 500, 1000, 5000].map(v => ({ value: String(v), label: String(v) + ' lines' }))}
          size="sm"
          width={106}
          accentColor={ACCENT}
        />

        <SelectInputView
          value={logSince}
          onChange={v => setLogSince(v as 'all' | 'restart' | '15m' | '1h' | '6h')}
          options={[
            { value: 'all', label: 'all time' },
            { value: 'restart', label: 'since last restart' },
            { value: '15m', label: 'last 15 min' },
            { value: '1h', label: 'last hour' },
            { value: '6h', label: 'last 6 hours' },
          ]}
          size="sm"
          width={138}
          accentColor={ACCENT}
        />

        <ButtonView
          label="Fetch"
          size="sm"
          variant="secondary"
          accentColor={ACCENT}
          color={logLive ? 'var(--color-text-muted)' : ACCENT}
          disabled={logLive}
          onClick={fetchLogs}
          title={logLive ? 'Following already refetches continuously' : 'Load these lines now'}
          style={{
            background: logLive ? 'transparent' : 'color-mix(in srgb, var(--color-dk8s) 12%, transparent)',
            borderColor: logLive
              ? 'var(--color-surface-border)'
              : 'color-mix(in srgb, var(--color-dk8s) 38%, transparent)',
          }}
        />

        {/* Following is a decision, not a default. A pod doing hundreds of
            lines a second buries whatever you opened the log to read. */}
        {/* Following is a decision, not a default. A pod doing hundreds of
            lines a second buries whatever you opened the log to read. */}
        <ButtonView
          label="Following"
          size="sm"
          variant="secondary"
          accentColor={LIVE_ACCENT}
          color={logLive ? LIVE_ACCENT : 'var(--color-text-secondary)'}
          onClick={() => setLogLive(!logLive)}
          title={logLive ? 'Stop following' : 'Keep fetching the newest lines'}
          style={{
            background: logLive
              ? 'color-mix(in srgb, var(--color-success) 14%, transparent)'
              : 'transparent',
            borderColor: logLive
              ? 'color-mix(in srgb, var(--color-success) 42%, transparent)'
              : 'var(--color-surface-border)',
            fontWeight: logLive ? 600 : 400,
          }}
          iconLeft={
            <span style={{
              display: 'inline-block', width: 6, height: 6, borderRadius: 6,
              background: logLive ? LIVE_ACCENT : 'var(--color-text-muted)',
              boxShadow: logLive ? '0 0 7px ' + LIVE_ACCENT : 'none',
            }} />
          }
        />

        <ButtonView
          label="Download"
          size="sm"
          variant="secondary"
          onClick={openLogExport}
          title="Write this pod's log to a file, with the same options as a bulk export"
          style={{ background: 'transparent' }}
        />

        <ButtonView
          label="Analyze"
          size="sm"
          variant="secondary"
          accentColor={AI_ACCENT}
          color={logs.length ? AI_ACCENT : 'var(--color-text-muted)'}
          disabled={!logs.length}
          onClick={analyzeBuffer}
          title="Ask AI for a timeline of what this log shows"
          iconLeft={<WandIcon size={11} color={logs.length ? AI_ACCENT : 'var(--color-text-muted)'} />}
          style={{
            background: logs.length
              ? 'color-mix(in srgb, var(--color-protocol-ai) 16%, transparent)'
              : 'transparent',
            borderColor: logs.length
              ? 'color-mix(in srgb, var(--color-protocol-ai) 45%, transparent)'
              : 'var(--color-surface-border)',
            fontWeight: 600,
          }}
        />

        {/* Only for a pod that has actually restarted — for one that has not,
            --previous just errors, and offering it invites that. */}
        {(detail?.restarts ?? 0) > 0 && (
          <CheckboxView label="previous run" checked={logPrevious} onChange={setLogPrevious}
                        size="sm" accentColor="var(--color-warning)" />
        )}

        {logStatus === 'error' && (
          <span className="text-[11px]" style={{ color: 'var(--color-error)' }}>error</span>
        )}
      </div>

      {/* ── Notices, also on top ── */}
      {logDropped > 0 && (
        <div className="mx-4 mt-2 px-3 py-2 rounded-md text-[11px] shrink-0"
             style={{
               background: 'color-mix(in srgb, var(--color-warning) 10%, var(--color-surface))',
               border: '1px solid color-mix(in srgb, var(--color-warning) 28%, transparent)',
               color: 'var(--color-warning)',
             }}>
          {logDropped.toLocaleString()} earlier lines dropped — this pod logs faster than the
          view can hold. Narrow the filter, or export the full log to disk.
        </div>
      )}

      {logStatus === 'error' && logDetail && (
        <div className="mx-4 mt-2 px-3 py-2 rounded-md text-[11px] font-mono shrink-0"
             style={{
               background: 'color-mix(in srgb, var(--color-error) 10%, var(--color-surface))',
               border: '1px solid color-mix(in srgb, var(--color-error) 28%, transparent)',
               color: 'var(--color-error)',
             }}>
          {logDetail}
        </div>
      )}

      {/* ── Lines, with the ribbon down the right ── */}
      <div ref={bodyRef} className="relative flex flex-1 min-h-0">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex-1 overflow-auto pl-4 pr-1 py-2 font-mono min-h-0 dk8s-no-scrollbar"
          style={{ fontSize: 11.5, lineHeight: `${ROW_HEIGHT}px` }}
        >
          {total === 0 ? (
            <div className="flex items-center justify-center h-full">
              <span className="text-[12px] text-[var(--color-text-muted)]" style={{ fontFamily: 'inherit' }}>
                {logs.length === 0
                  ? logStatus === 'streaming' ? 'Connected — waiting for the pod to say something.' : 'No output yet.'
                  : `No line matches. ${logs.length.toLocaleString()} hidden by the filter.`}
              </span>
            </div>
          ) : (
            <div style={{ height: total * ROW_HEIGHT, position: 'relative' }}>
              <div style={{ position: 'absolute', top: first * ROW_HEIGHT, left: 0, right: 0 }}>
                {slice.map((row, i) => {
                  const line = row.line;
                  const isOpen = expanded.has(line.seq);
                  return (
                    <div
                      key={`${line.seq}-${i}`}
                      data-seq={line.seq}
                      className="flex gap-2.5 items-start"
                      style={{
                        minHeight: ROW_HEIGHT,
                        whiteSpace: logWrap ? 'pre-wrap' : 'pre',
                        background: line.level === 'error'
                          ? 'color-mix(in srgb, var(--color-error) 7%, transparent)'
                          : line.level === 'warn'
                            ? 'color-mix(in srgb, var(--color-warning) 5%, transparent)'
                            : 'transparent',
                        borderLeft: `2px solid ${
                          line.level === 'error' ? 'var(--color-error)'
                          : line.level === 'warn' ? 'var(--color-warning)' : 'transparent'
                        }`,
                        paddingLeft: row.isFrame ? 22 : 6,
                        opacity: row.isFrame ? 0.75 : 1,
                      }}
                    >
                      {line.ts !== undefined && !row.isFrame && (
                        <span className="shrink-0 select-none"
                              style={{ color: 'var(--color-text-muted)', opacity: 0.6, fontVariantNumeric: 'tabular-nums' }}>
                          {formatLogTime(line.ts)}
                        </span>
                      )}
                      {!row.isFrame && <LevelTag level={line.level} />}

                      <span style={{
                        color: line.level === 'error' ? 'var(--color-error)'
                          : line.level === 'warn' ? 'var(--color-warning)'
                          : line.level === 'debug' ? 'var(--color-text-muted)'
                          : 'var(--color-text-primary)',
                        flex: logWrap ? 1 : undefined,
                        minWidth: 0,
                      }}>
                        <Highlighted text={line.text} hits={line.hits} />
                      </span>

                      {/* The fold. One row instead of forty, and the count is
                          on it so you know what you are choosing to open. */}
                      {row.folded && row.folded.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setExpanded(prev => {
                            const next = new Set(prev);
                            if (next.has(line.seq)) next.delete(line.seq); else next.add(line.seq);
                            return next;
                          })}
                          className="shrink-0 flex items-center gap-1 px-1.5 rounded cursor-pointer border-none self-center"
                          style={{
                            background: 'var(--color-surface-hover)',
                            color: 'var(--color-text-muted)',
                            fontSize: 10, lineHeight: '15px',
                          }}
                        >
                          {isOpen ? <ChevronDownIcon size={9} /> : <ChevronRightIcon size={9} />}
                          {isOpen ? 'hide' : `… ${row.folded.length} more frames`}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DensityRibbon
          lines={visible}
          scrollTop={scrollTop}
          contentHeight={total * ROW_HEIGHT}
          viewportHeight={viewportH}
          onJump={jumpTo}
          onScrollTo={(top) => {
            const el = scrollRef.current;
            if (!el) return;
            el.scrollTop = top;
          }}
          onDragStart={() => { draggingRef.current = true; setLogFollow(false); }}
          onDragEnd={() => {
            draggingRef.current = false;
            const el = scrollRef.current;
            if (!el) return;
            // Resume following only if the drag actually finished at the end.
            const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            if (atBottom) setLogFollow(true);
          }}
        />

        {toolbar && (
          <SelectionToolbar
            rect={toolbar}
            lineCount={selectionRef.current?.count ?? 0}
            onAsk={() => sendToAi('dk8s.log.askWhy', 'Ask AI why')}
            onExplain={() => sendToAi('dk8s.log.explainError', 'Explain this error')}
            onGrep={grepSelection}
          />
        )}
      </div>

      {/* ── Footer: what is held, and where you are ── */}
      <div className="flex items-center gap-3 px-4 py-1.5 text-[10.5px] shrink-0"
           style={{ borderTop: '1px solid var(--color-surface-border)', color: 'var(--color-text-muted)' }}>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {logs.length.toLocaleString()} lines buffered
          {logs.length > 0 && ` · ${(bufferBytes(logs) / 1024 / 1024).toFixed(1)} MB`}
          {oldest !== undefined && ` · oldest ${formatLogTime(oldest)}`}
        </span>
        {visible.length !== logs.length && (
          <span style={{ color: ACCENT, fontVariantNumeric: 'tabular-nums' }}>
            {visible.length.toLocaleString()} shown
          </span>
        )}
        <div className="flex-1" />
        <span>
          {logLive
            ? 'following — new lines append as they arrive'
            : `snapshot of the last ${logTail} lines`}
        </span>
        {logLive && !logFollow && total > 0 && (
          <button
            type="button"
            onClick={() => setLogFollow(true)}
            className="cursor-pointer bg-transparent border-none px-0 text-[10.5px]"
            style={{ color: ACCENT }}
          >
            ↓ jump to newest
          </button>
        )}
        <span>select any text to ask AI about it</span>
      </div>
    </div>
  );
}

function ContainerChip({ name }: { name: string }) {
  const { logContainer, setLogContainer } = useK8sStore();
  const on = logContainer === name;
  return (
    <ButtonView
      label={name}
      size="xs"
      variant={on ? 'primary' : 'secondary'}
      accentColor={ACCENT}
      onClick={() => setLogContainer(on ? undefined : name)}
    />
  );
}
