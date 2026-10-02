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
 *   - Selecting text raises the context menu AT the selection, not a bar at
 *     the bottom of the panel. The gesture and the action belong in the same
 *     place. It was a bespoke floating strip until that strip and the
 *     right-click menu started fighting over the same gesture.
 *   - Stack traces fold to one row. An unfolded Java exception costs a screen
 *     and a half, so three of them mean you never see the fourth.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback, useDeferredValue } from 'react';
import {
  FilterInputView, SelectInputView, SegmentedControlView, CheckboxView, ButtonView,
  BadgeChipView, IconSize, SplitPanelView, DateTimeInputView, ProgressBarView } from '@salilvnair/dui';
import {
  SparkleIcon, ChevronRightIcon, ChevronDownIcon,
  WrapLinesIcon, LayersIcon, RefreshIcon, DownloadIcon, FilterClearIcon, CloseIcon,
  ChevronLeftIcon, SidebarLeftIcon, SearchIcon, LinkIcon, ClockIcon, EraserIcon, PauseIcon, PlayIcon,
} from '../../icons';
import { CopyGlyph, COPY_TICK_MS } from '../shared/CopyTick';
import { copyText } from '../../utils/clipboard';
import { podLogLink } from './pod-link';
import { useTabsStore } from '../../store/tabs-store';
import { useK8sStore, type LogLevel } from '../../store/k8s-store';
import { useLogSource } from './log-source';
import {
  useLogFoldDefault, useLogWrapDefault, rememberLogMode,
  LOG_FOLD_PREF, LOG_WRAP_PREF,
} from './log-view-prefs';
import { useDk8sSearchStore } from '../../store/dk8s-search-store';
import { useDk8sAiStore } from '../../store/dk8s-ai-store';
import { buildFacets, filterTermFor } from './log-facets';
import { useUiStateStore } from '../../store/ui-state-store';
import { logLineSettings, onLadder, tailLabel, contextLabel } from './log-settings';
import { findPayload, payloadNote, sentenceWithout, type LogPayload } from './log-payload';
import { markOf, keepMarked, nextMarked, type MarkHit } from './logger-marks';
import { useMarkIndex, MarkedBar, MarkMapStrip, MarkedRail, MarkedCount, MarkedJump } from './LogMarks';
import { OUTLINE_BUTTON } from './asklog-tone';
import { LineFieldsView } from './LineFieldsView';
import { useDeterminantsFor } from './use-determinants';
import { SummaryPanel } from './SummaryPanel';
import { usePatternsFor, MARK_COLORS, clearMarks } from '../../store/dk8s-logger-store';
import { scopeOf } from './LoggersTab';
import { payloadPrefs, openLoggers, setOpenLogger } from './log-payload-prefs';
import { LogPayloadView } from './LogPayloadView';
import { FacetRail } from './FacetRail';
import { podHue, podTail } from './pod-hue';
import { readFields } from './field-readers';
import { useFieldReaders } from './follow-prefs';
import { LogSkeleton } from './LogSkeleton';
import {
  setFilterProvider, clearFilterProvider,
  type FilterMenu, type FilterGroup,
} from '../shared/menus/filter-provider';
import {
  filterLines, densityBuckets, levelCounts, levelColor, ribbonBands,
  timeBuckets, ribbonTicks, COMPACT_RIBBON_PX, type DensityBucket, type RibbonTick,
  formatLogTime, selectionText, LEVEL_ORDER, foldStackTraces, bufferBytes,
  compactCount, grepTermFor, frameOrigin, type MatchedLine, type FieldFilter,
  displayText, ownFramesFirst, buildMatcher, keepAround,
} from './log-view';
import {
  AnalyzeModal, planAnalyze, ANALYZE_HEAD, ANALYZE_TAIL, type AnalyzePlan,
} from './AnalyzeModal';
import { ExportLogsModal } from './ExportLogsModal';

import { ACCENT } from './tone';
import {
  BAND_FLOOR_PX, BAND_GAP_PX, markerBox, bandAt, hoverCardPlacement, type CardPlacement,
  GUTTER_W, GUTTER_BLOCK_W, bandFill, tickColor, MARKER_EDGE,
} from './ribbon-layout';
import { RibbonHover, HOVER_CARD_W } from './RibbonHover';
import { LineCard, cardRowStyle, type LineCardKind } from './ClickedLine';
import { FOLLOW } from './follow-tone';
/**
 * One size for every control in the toolbar.
 *
 * `md`, not `sm`: a segment control's inner pill sits inside the track's
 * padding, so at the same nominal height it reads visibly daintier than the
 * select beside it. Matching the token is not enough — the row has to be sized
 * so the pill itself lands near the select's box.
 */
const CTL_SIZE = 'md';
/**
 * Two tones, and the split is the point: cyan for anything that talks to the
 * cluster, the AI tone for the one button that sends data to a model. Colour
 * here tells you what a control will DO, which is worth more than making the
 * row pretty.
 */
import { AI as AI_ACCENT } from './tone';
const LIVE_ACCENT = 'var(--color-success)';



const ROW_HEIGHT = 19;

/**
 * How wide the view must be before the field rail is worth its space.
 *
 * The rail is about 330px. Below this the lines beside it are too narrow to
 * read, which is the whole point of the screen — so the rail steps aside and
 * comes back when there is room. Measured rather than guessed at a breakpoint:
 * a pane in a split, the detail view and a narrow window are all the same
 * question, and only the element's own width answers it.
 */
const RAIL_MIN_WIDTH = 720;
const OVERSCAN = 25;
/**
 * The ribbon's width, and its blocks'.
 *
 * A single log pane gets the full ribbon — 38px with 20px blocks, a picture
 * you can read the trouble off at a glance. The narrow gutter (`ribbon-layout`,
 * 16px with 8px blocks) is for a split, where three panes side by side cannot
 * each give up a word of every line to it.
 */
const RIBBON_W = 38;
const RIBBON_BAND_W = 20;
const SPLIT_RIBBON_W = GUTTER_W;
const SPLIT_RIBBON_BAND_W = GUTTER_BLOCK_W;
const LEVEL_SHORT: Record<LogLevel, string> = {
  error: 'err', warn: 'wrn', info: 'info', debug: 'dbg', other: 'plain',
};

/**
 * An applied field filter, as a chip.
 *
 * The chip exists because a filter you cannot see is a filter you cannot
 * undo. Choosing a thread from the menu used to write a term into the search
 * box, which said what was filtered only if you could read the term and knew
 * it had been put there by a menu.
 *
 * Clicking the body flips include ↔ exclude, which is the other thing anyone
 * wants to do with a filter they just applied; the × removes it. Amber for an
 * include and red for an exclude, matching the funnel and the clear mark.
 */
function FieldFilterChip({ filter, onFlip, onRemove }: {
  filter: FieldFilter;
  onFlip: () => void;
  onRemove: () => void;
}) {
  const excluded = filter.mode === 'exclude';
  const color = excluded ? 'var(--color-error)' : 'var(--color-warning)';

  return (
    <span
      className="flex items-center rounded overflow-hidden shrink-0"
      style={{
        border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        height: 22,
      }}
    >
      <button
        type="button"
        onClick={onFlip}
        title={excluded
          ? `Hiding ${filter.field} ${filter.value} — click to show only it`
          : `Showing only ${filter.field} ${filter.value} — click to hide it instead`}
        className="flex items-center gap-1 px-1.5 cursor-pointer border-none bg-transparent h-full"
        style={{ color, fontSize: 10.5, fontFamily: 'inherit' }}
      >
        <span style={{ opacity: 0.7 }}>{excluded ? 'not' : ''}</span>
        <span className="font-mono truncate" style={{ maxWidth: 150, fontWeight: 600 }}>
          {filter.value}
        </span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        title="Remove this filter"
        aria-label={`Remove filter ${filter.value}`}
        className="flex items-center px-1 cursor-pointer border-none bg-transparent h-full"
        style={{ color, opacity: 0.75 }}
      >
        <CloseIcon size={IconSize.chip} />
      </button>
    </span>
  );
}

/**
 * The applied filters, on a row of their own.
 *
 * They used to sit inline with the search box, so each one added pushed the
 * box further right until it was a sliver against the toolbar — the control
 * you type in kept moving because of things you had already applied. Filters
 * get their own row above it now, and the box stays where it was.
 *
 * The row scrolls rather than wraps. Wrapping would grow the header downward
 * without limit and shove the log itself off screen, and the log is the thing
 * being read; the arrows are the same ones the tab bar uses, for the same
 * reason and with the same behaviour.
 */
function FieldFilterStrip({ filters, onFlip, onRemove, onClearAll }: {
  filters: FieldFilter[];
  onFlip: (f: FieldFilter) => void;
  onRemove: (f: FieldFilter) => void;
  onClearAll: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const check = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 0);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    check();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', check);
    // The arrows depend on the width available, not only on how many chips
    // there are — collapsing the AI panel changes one without the other.
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', check); ro.disconnect(); };
  }, [check, filters.length]);

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -180 : 180, behavior: 'smooth' });
  };

  if (!filters.length) return null;

  const arrow = (dir: 'left' | 'right', enabled: boolean) => (
    <button
      type="button"
      onClick={() => scroll(dir)}
      disabled={!enabled}
      title={`Scroll filters ${dir}`}
      aria-label={`Scroll filters ${dir}`}
      className="flex items-center justify-center w-5 h-5 shrink-0 rounded cursor-pointer
                 border-none bg-transparent transition-colors disabled:cursor-default"
      style={{ color: enabled ? 'var(--color-text-secondary)' : 'var(--color-text-muted)',
               opacity: enabled ? 1 : 0.35 }}
    >
      {dir === 'left' ? <ChevronLeftIcon size={IconSize.inline} /> : <ChevronRightIcon size={IconSize.inline} />}
    </button>
  );

  return (
    <div className="flex items-center gap-1.5 px-4 pt-2 pb-1.5 shrink-0">
      {/* Present only once there is somewhere to scroll, so a single chip does
          not sit between two dead controls. */}
      {(canLeft || canRight) && arrow('left', canLeft)}

      <div ref={scrollRef}
           className="flex items-center gap-1.5 overflow-x-auto scrollbar-none flex-1 min-w-0">
        {filters.map(f => (
          <FieldFilterChip
            key={`${f.field}:${f.value}`}
            filter={f}
            onFlip={() => onFlip(f)}
            onRemove={() => onRemove(f)}
          />
        ))}
      </div>

      {(canLeft || canRight) && arrow('right', canRight)}

      {/* Outside the scroller: the way to undo all of this should not be the
          one thing you have to scroll to reach. */}
      <button
        type="button"
        onClick={onClearAll}
        title="Remove every filter"
        className="flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded cursor-pointer
                   border-none bg-transparent text-[10.5px] transition-opacity"
        style={{ color: 'var(--color-error)', opacity: 0.85 }}
      >
        <FilterClearIcon size={IconSize.inline} />
        Clear all
      </button>
    </div>
  );
}


// ── Density ribbon: vertical, on the right ──────────────────────────────────

/** A band's smallest drawn height, and the gap under it. Both in px — see `ribbon-layout`. */
const BAND_MIN = BAND_FLOOR_PX;
const BAND_GAP = BAND_GAP_PX;

function DensityRibbon({
  lines, scrollTop, contentHeight, viewportHeight, onJump, onScrollTo, onDragStart, onDragEnd,
  sharedRange, viewTimes, onCompact,
}: {
  lines: MatchedLine[];
  /** One clock across a split: bands become equal slices of this span. */
  sharedRange?: { from: number; to: number };
  /** When the first and last rows on screen were logged — the marker, on a clock. */
  viewTimes?: { from?: number; to?: number };
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
  /** Told when the gutter goes compact or back — a split pane says so in its title strip. */
  onCompact?: (compact: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  /* Only a split pane listens for compact — that is how the ribbon knows it is in one. */
  const inSplit = !!onCompact;
  const ribbonW = inSplit ? SPLIT_RIBBON_W : RIBBON_W;
  const bandW = inSplit ? SPLIT_RIBBON_BAND_W : RIBBON_BAND_W;
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
    /* The track's own height, whatever it is. The floor here used to be 60,
       which is taller than the track gets in a short pane of a four-way split —
       and a marker placed on a 60px scale inside a 44px track is off by a
       quarter of the log. */
    const measure = () => setHeight(Math.max(1, el.clientHeight));
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  // Never more bands than this track can hold — see `ribbonBands`.
  const bands = ribbonBands(height, BAND_MIN, BAND_GAP);
  /* Too short for density to mean anything: marks instead of bands. */
  const compact = height < COMPACT_RIBBON_PX;
  useEffect(() => { onCompact?.(compact); }, [compact, onCompact]);
  const buckets = useMemo(
    () => (compact ? [] : sharedRange
      ? timeBuckets(lines, bands, sharedRange)
      : densityBuckets(lines, bands)),
    [lines, bands, compact, sharedRange],
  );
  const ticks = useMemo(
    () => (compact ? ribbonTicks(lines, height, 4, sharedRange) : []),
    [compact, lines, height, sharedRange],
  );

  // Exactly what the scrollbar shows: how much of the content is visible, and
  // how far down it we are.
  const scrollable = Math.max(0, contentHeight - viewportHeight);

  /*
    On a shared clock the bands are drawn by TIME, so the marker and the drag
    have to be as well. Left on scroll position, the box said "you are at 90%"
    of a strip whose 90% meant a different instant — two scales on one ribbon,
    each right about itself and wrong about the other.

    Clamped to this track and never thinner than 6px — see `markerBox`, which
    is where the rule is tested at every height a pane can have.
  */
  const { top: viewTop, height: viewH } = markerBox({
    trackPx: height, scrollTop, contentHeight, viewportHeight, range: sharedRange, viewTimes,
  });

  /*
    The hover card, anchored to the pane.

    Each band carried a `title`, which the browser places against the page:
    in the right-hand panes of a split it opened past the edge and was
    clipped, and it said the same thing at the same size whether the pane was
    a whole screen or a sliver. The card is drawn inside this column instead,
    measured against the pane's own body, on whichever side has room.
  */
  const columnRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ y: number; bucket?: DensityBucket; tick?: RibbonTick }>();
  const [card, setCard] = useState<CardPlacement>();

  const hoverAt = (clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const y = clientY - el.getBoundingClientRect().top;
    if (compact) {
      /* The nearest tick within a few pixels — a tick is 3px tall and a
         pointer that has to land on it exactly is a pointer that misses. */
      let best: RibbonTick | undefined;
      let bestDist = 6;
      for (const t of ticks) {
        const d = Math.abs(t.at * height - y);
        if (d <= bestDist) { best = t; bestDist = d; }
      }
      setHover(best ? { y, tick: best } : undefined);
      return;
    }
    const i = bandAt(y, height, buckets.length);
    setHover(i >= 0 ? { y, bucket: buckets[i] } : undefined);
  };

  useLayoutEffect(() => {
    const column = columnRef.current;
    const body = column?.parentElement;
    if (!hover || !column || !body) { setCard(undefined); return; }
    const c = column.getBoundingClientRect();
    const b = body.getBoundingClientRect();
    const track = ref.current?.getBoundingClientRect();
    setCard(hoverCardPlacement({
      /* The track is inset in the column by its padding; the card is placed
         against the column, so the pointer is too. */
      pointerY: hover.y + (track ? track.top - c.top : 0),
      columnPx: c.height,
      cardHeight: cardRef.current?.offsetHeight ?? 56,
      cardWidth: HOVER_CARD_W,
      roomLeft: c.left - b.left,
      roomRight: b.right - c.right,
    }));
  }, [hover]);

  /**
   * Drag like a scrollbar thumb.
   *
   * The pointer grabs the CENTRE of the marker and the marker follows, which is
   * how every scrollbar behaves — anchoring the marker's top to the pointer
   * instead makes it jump downward by half its height the moment you touch it.
   *
   * On a clock the pointer names an instant, and the view goes to the first
   * line at or after it.
   */
  const scrollToPointer = useCallback((clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (sharedRange) {
      const fraction = Math.min(1, Math.max(0, (clientY - rect.top) / Math.max(1, rect.height)));
      const at = sharedRange.from + fraction * (sharedRange.to - sharedRange.from);
      const index = lines.findIndex(l => l.ts !== undefined && l.ts >= at);
      onJump(index === -1 ? Math.max(0, lines.length - 1) : index);
      return;
    }
    const travel = Math.max(1, rect.height - viewH);
    const y = clientY - rect.top - viewH / 2;
    const fraction = Math.min(1, Math.max(0, y / travel));
    onScrollTo(fraction * scrollable);
  }, [viewH, scrollable, onScrollTo, sharedRange, lines, onJump]);

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
    <div ref={columnRef} className="relative shrink-0 flex flex-col items-stretch"
         style={{ width: ribbonW, padding: '3px 0', borderLeft: '1px solid var(--color-surface-border)' }}>
      <div
        ref={ref}
        /* `min-h-0`: the track measures the pane it is in, never the bands it
           holds. Without it a flex child stays as tall as its content and the
           number this reads back is one no pane ever had.

           NOT `overflow-hidden`, though it looks like it belongs with it. The
           you-are-here box is drawn 4px wider than the track on each side and
           glows past that; clipping the track cut its sides and its glow off
           and left two floating lines. `ribbonBands` already guarantees the
           bands fit, so there is nothing for a clip to catch. */
        className="relative flex-1 min-h-0 flex flex-col mx-auto"
        style={{ width: bandW, gap: BAND_GAP, cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}
        onPointerDown={e => { setHover(undefined); onPointerDown(e); }}
        onPointerMove={e => {
          if (!dragging) { hoverAt(e.clientY); return; }
          movedRef.current = true;
          scrollToPointer(e.clientY);
        }}
        onPointerLeave={() => setHover(undefined)}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {buckets.map((b, i) => (
          <div
            key={`${i}-${b.startIndex}`}
            // A click that did not turn into a drag jumps to the band — the
            // precise gesture, kept alongside the coarse one. An empty slice
            // of time has nowhere to jump to.
            onClick={() => { if (!movedRef.current && b.startIndex >= 0) onJump(b.startIndex); }}
            className="transition-opacity hover:opacity-100"
            style={{
              flex: 1,
              minHeight: BAND_MIN,
              borderRadius: 2,
              /* On a shared clock an empty slice is drawn as a faint slot
                 rather than skipped, so "silent here" stays visible. */
              /* Its lines in proportion — red, amber, calm, left to right
                 (`bandFill`) — not its worst line, which turned a mostly-INFO
                 log solid red. Only an empty slot is faded, so it reads as a
                 slot and not as a block. */
              background: bandFill(b),
              opacity: !b.count ? 0.25 : 1,
            }}
          />
        ))}

        {/*
          Compact: a pane too short for density — the small panes of a grid —
          gets one tick per error or warning run, placed where it is in the
          buffer. Density in 150px is a barcode; a tick is still a fact.
        */}
        {compact && ticks.map(t => (
          <div
            key={t.startIndex}
            onClick={() => { if (!movedRef.current) onJump(t.startIndex); }}
            className="absolute cursor-pointer"
            style={{
              left: -1, right: -1,
              top: `calc(${(t.at * 100).toFixed(2)}% - 1.5px)`,
              height: 3,
              borderRadius: 2,
              background: tickColor(t.level),
            }}
          />
        ))}

        {/* You are here. Without this the ribbon shows the shape of the buffer
            but not your place in it, which is half of what makes it useful. */}
        {contentHeight > 0 && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: -MARKER_EDGE, right: -MARKER_EDGE,
              top: viewTop,
              height: viewH,
              boxSizing: 'border-box',
              border: `2px solid ${FOLLOW}`,
              borderRadius: 3,
              // No transition while dragging, or the marker lags the pointer.
              transition: dragging ? 'none' : 'top .12s linear',
            }}
          />
        )}
      </div>

      {hover && !dragging && (
        <div
          ref={cardRef}
          role="tooltip"
          className="absolute pointer-events-none z-20 flex flex-col gap-0.5 px-2.5 py-1.5 rounded-md text-[11px]"
          style={{
            top: card?.top ?? 0,
            ...(card?.side === 'right' ? { left: '100%' } : { right: '100%' }),
            width: card ? card.maxWidth : HOVER_CARD_W,
            visibility: card ? 'visible' : 'hidden',
            background: 'var(--color-panel)',
            border: '1px solid var(--color-surface-border)',
            boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
            color: 'var(--color-text-secondary)',
          }}
        >
          <RibbonHover bucket={hover.bucket} tick={hover.tick} lines={lines} />
        </div>
      )}
    </div>
  );
}

// ── Level chips ─────────────────────────────────────────────────────────────

function LevelChips() {
  const { logs, logLevels, toggleLogLevel, detail } = useLogSource();
  const counts = useMemo(() => levelCounts(logs), [logs]);
  /*
    A level keeps its chip for the pod once it has been seen. Shown only while
    its count was above 0, every chip went out on Clear and came back one by
    one as lines arrived — the whole toolbar shifting left and right with them.
  */
  const podKey = `${detail?.context ?? ''}/${detail?.namespace ?? ''}/${detail?.name ?? ''}`;
  const seen = useRef<{ pod: string; levels: Set<LogLevel> }>({ pod: podKey, levels: new Set() });
  if (seen.current.pod !== podKey) seen.current = { pod: podKey, levels: new Set() };
  for (const l of LEVEL_ORDER) if (counts[l] > 0) seen.current.levels.add(l);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {LEVEL_ORDER.filter(l => seen.current.levels.has(l) || logLevels.includes(l)).map(level => {
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

// ── Selection ────────────────────────────────────────────────────

/*
  There is no floating strip any more.

  A strip over the selection and the right-click menu were two panels fighting
  over one gesture: the strip had to hide itself on right-click, the menu had to
  keep out of the strip's way, and neither could hold much before it grew wider
  than the thing it was pointing at. Both sets of actions now live in the one
  menu, which opens on selection and on double-click as well as on right-click —
  so the gesture that makes a selection is the gesture that offers to act on it.

  See `aiItems` in RightClickMenu for what the menu carries.
*/

/** A hairline between groups of controls — see the note on the toolbar. */
function Sep() {
  return (
    <span aria-hidden
          style={{
            width: 1, height: 18, flexShrink: 0,
            background: 'var(--color-surface-border)',
            margin: '0 2px',
          }} />
  );
}

/**
 * A square icon control, sized to the buttons beside it.
 *
 * Two uses, one shape. `on` present makes it a toggle — wrap and folding
 * change how the lines are drawn rather than fetching anything, and as
 * labelled checkboxes they were the only things in the bar with a different
 * shape and hit target. `on` absent makes it a plain action, and the missing
 * aria-pressed is the point: Download is not a state.
 */
/**
 * The find bar — the editor's Ctrl+F, in the log view's own look: the term,
 * where you are among its matches, case and regex, up, down, close.
 */
function FindBar({ inputRef, text, onText, matchCase, onMatchCase, regex, onRegex, at, total, onStep, onClose }: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  text: string; onText: (v: string) => void;
  matchCase: boolean; onMatchCase: () => void;
  regex: boolean; onRegex: () => void;
  at: number; total: number;
  onStep: (d: number) => void; onClose: () => void;
}) {
  const toggle = (on: boolean): React.CSSProperties => ({
    width: 24, height: 22, borderRadius: 5, fontSize: 11, fontFamily: 'var(--font-mono, ui-monospace, monospace)',
    border: `1px solid ${on ? `color-mix(in srgb, ${ACCENT} 45%, transparent)` : 'transparent'}`,
    background: on ? `color-mix(in srgb, ${ACCENT} 16%, transparent)` : 'transparent',
    color: on ? ACCENT : 'var(--color-text-secondary)',
  });
  const plain: React.CSSProperties = { width: 24, height: 22, borderRadius: 5, border: 'none', background: 'transparent', color: 'var(--color-text-secondary)' };
  return (
    <div role="search" className="absolute z-30 flex items-center"
         style={{
           top: 8, right: 28, gap: 2, padding: '4px 5px 4px 8px', borderRadius: 9,
           background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)',
           boxShadow: '0 10px 28px -12px rgba(0,0,0,.65)',
         }}
         onKeyDown={e => {
           if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
           else if (e.key === 'Enter') { e.preventDefault(); onStep(e.shiftKey ? -1 : 1); }
         }}>
      <SearchIcon size={12} color="var(--color-text-muted)" />
      <input ref={inputRef} value={text} onChange={e => onText(e.target.value)} placeholder="Find in log" aria-label="Find in log"
             spellCheck={false} className="outline-none"
             style={{
               width: 210, height: 24, padding: '0 8px', marginLeft: 4, borderRadius: 6, fontSize: 12,
               fontFamily: 'var(--font-mono, ui-monospace, monospace)', color: 'var(--color-text-primary)',
               background: 'var(--color-bg, var(--color-input-bg))',
               border: `1px solid ${text && !total ? 'color-mix(in srgb, var(--color-error) 60%, transparent)' : 'var(--color-surface-border)'}`,
             }} />
      <span className="select-none" style={{ minWidth: 64, padding: '0 6px', textAlign: 'center', fontSize: 11, fontVariantNumeric: 'tabular-nums',
                                            color: text && !total ? 'var(--color-error)' : 'var(--color-text-muted)' }}>
        {!text ? '' : total ? `${at + 1} of ${total.toLocaleString()}` : 'No results'}
      </span>
      <button type="button" title="Match case" aria-pressed={matchCase} onClick={onMatchCase} className="cursor-pointer" style={toggle(matchCase)}>Aa</button>
      <button type="button" title="Regular expression" aria-pressed={regex} onClick={onRegex} className="cursor-pointer" style={toggle(regex)}>.*</button>
      <span style={{ width: 1, height: 16, margin: '0 3px', background: 'var(--color-surface-border)' }} />
      <button type="button" title="Previous match (Shift+Enter)" disabled={!total} onClick={() => onStep(-1)}
              className="flex items-center justify-center cursor-pointer disabled:opacity-40" style={plain}>
        <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}><ChevronDownIcon size={13} /></span>
      </button>
      <button type="button" title="Next match (Enter)" disabled={!total} onClick={() => onStep(1)}
              className="flex items-center justify-center cursor-pointer disabled:opacity-40" style={plain}>
        <ChevronDownIcon size={13} />
      </button>
      <button type="button" title="Close (Esc)" onClick={onClose} className="dk-row-close flex items-center justify-center cursor-pointer" style={plain}>
        <CloseIcon size={12} />
      </button>
    </div>
  );
}

function IconButton({ on, onClick, title, icon, tone = ACCENT }: {
  on?: boolean; onClick: () => void; title: string; icon: React.ReactNode;
  /** The colour it lights in when on — amber for a read that is not the usual one. */
  tone?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className="flex items-center justify-center cursor-pointer shrink-0"
      style={{
        // 28 square with a 4px radius, because that is exactly what dui
        // renders every button and select in this bar at. Both numbers were
        // eyeballed before and both were wrong — 30 tall and 6 round — which
        // is the kind of thing you see without being able to name.
        width: 28, height: 28, borderRadius: 4,
        color: on ? tone : 'var(--color-text-secondary)',
        background: on ? `color-mix(in srgb, ${tone} 14%, transparent)` : 'transparent',
        border: `1px solid ${on ? `color-mix(in srgb, ${tone} 38%, transparent)` : 'var(--color-surface-border)'}`,
      }}
    >
      {icon}
    </button>
  );
}

// ── The viewer ──────────────────────────────────────────────────────────────

/** The field rail's width, in the pixels that decide whether a value fits. */
const RAIL_MIN = 208;
const RAIL_MAX = RAIL_MIN * 2;

/** Find-in-log's marking: yellow, apart from the level colours. */
const FIND_TONE = 'var(--color-find, #e2b93d)';
/** A search result's hits: a pale lavender, light enough to read through, used nowhere else in the log view. */
const HIT_TONE = 'var(--color-hit, #b8adf6)';

/** The log view Ctrl+F opens find in: the one last clicked or focused. */
let activeViewer: { id: symbol; el: HTMLElement } | null = null;

/** The filter's share of a one-row toolbar, and the least it may be. */
const FILTER_MIN = 180;

export function LogViewer() {
  const {
    logs, logStatus, logDetail, logDropped, logReceived, logFilter, logLevels, logRequestedAt,
    logFieldFilters, addFieldFilter, removeFieldFilter,
    logFollow, logLive, logTail, logDirection, logSince, logWrap, logPrevious,
    logFrom, logTo, setLogWindow, logContainer,
    detail, runtime,
    setLogFilter, setLogFollow, setLogLive, setLogTail, setLogDirection,
    setLogSince, setLogWrap, setLogPrevious, setLogSelection,
    fetchLogs, openLogExport, logExportOpen, closeLogExport,
    /* From the source, not the store: a results page clears ITS filters and
       closes ITS view, and reaching past the source for either would act on
       whichever pod happened to be open behind it. */
    clearFieldFilters, closeDetail, isSnapshot, contextCap, sharedRange,
    paging, focusSeq, onFindContext, isHit, highlightQuery, clearLogs, logPaused, setLogPaused,
    focusLabel, selectedSeq, onSelectLine, selectedLabel, podColumn, podColor, columns, railLead, footerNote,
    onGutterCompact,
  } = useLogSource();

  /* Every "how many lines" ladder in this view, from Settings → DK8S → Logs. */
  const prefs = useUiStateStore(p => p.prefs);
  const lineSettings = useMemo(() => logLineSettings(prefs), [prefs]);
  /* How a JSON, XML or key=value payload is drawn, from the same screen. */
  const payloadOpts = useMemo(() => payloadPrefs(prefs), [prefs]);
  /* The patterns catalogued for this workload — the marked ones highlight,
     and the ones with a summary answer "what ran in this window". */
  const catalogue = usePatternsFor(scopeOf(detail));
  /* Yours and your team's that apply to this pod and are on — the same set
     the Summary panel answers, so the button never offers an empty panel. */
  const determinants = useDeterminantsFor(detail).enabled;
  /* Every pattern's holes and every named field — what decides whether a row has fields to open. */
  const fieldReaders = useFieldReaders();
  const [summaryOpen, setSummaryOpen] = useState(false);
  /* The marks over the whole buffer — the map, the rail, Only marked. See LogMarks. */
  const markIdx = useMarkIndex(catalogue, logs);
  const marks = markIdx.marks;
  const [onlyMarked, setOnlyMarked] = useState(false);
  const [markField, setMarkField] = useState<{ field: string; value: string } | undefined>();
  useEffect(() => {
    if (!marks.length) { setOnlyMarked(false); setMarkField(undefined); }
  }, [marks.length]);
  /*
    The first moment after asking, when an empty view means nothing yet.

    "No output yet" and "waiting for the pod to say something" are both claims
    about the POD. Neither can be made until we have actually waited: the
    stream reports `streaming` the instant it opens, which is before the tail
    has come back, so for the half second in between every pod was being
    described as silent. Under this window the view says what is true — that it
    is still reading.

    A timer rather than a status because there is no message that means "the
    initial read is done"; the stream just starts and lines arrive or they
    don't. Only armed while there is nothing to show, so it costs nothing on a
    pod that is talking.
  */
  const SETTLE_MS = 900;
  /*
    A short window that smooths the common case, and nothing more.

    900ms is the right length for a local cluster, where the lines are already
    on their way — it stops the view flickering through an empty state on the
    way to a full one. It is the wrong length for a cluster in another region:
    the timer expires, the skeleton goes, and the rest of the wait is drawn as
    plain text on an empty pane. So the skeleton below is shown for this window
    OR while the store still says the read is in flight, whichever lasts
    longer.
  */
  const [settling, setSettling] = useState(false);
  /*
    The rail is on by default and remembered.

    It answers "what is this log" before anything is clicked, which is the
    question people arrive with — but a narrow panel is a real constraint, and
    208px is a lot of it. Stored per person rather than per pod: whether you
    want a facet rail is a preference about how you read.
  */
  const [facetsWanted, setFacetsWanted] = useState(() => {
    try { return localStorage.getItem('dk8s.logs.facets') !== 'off'; }
    catch { return true; }
  });

  /*
    The rail only exists when there are fields to put in it.

    Its contents come from a configured log FORMAT — thread, logger, MDC — and
    nothing is ever guessed. A pod whose lines are plain text, which is most of
    them, has no fields at all, so the rail was 330 pixels of empty panel taking
    a sixth of the width away from the lines somebody came to read. Worse, the
    toggle looked broken: pressing it did nothing visible either way.

    So it is opened by what is there, and the preference only decides whether to
    show a rail that has something in it.
  */
  /* Marks open it too: their holes are facets no format had to name. */
  const hasFacets = useMemo(() => buildFacets(logs).length > 0, [logs]) || marks.length > 0;

  /*
    ── And only when there is room for it ──

    The rail is a fixed ~330px beside the lines, which is most of a pane in a
    three-way split or of the whole view on a narrow window. At 640px across,
    a pane gave the rail two hundred and sixty pixels and the log about thirty:
    the field counts were perfectly readable and not one log line was, which is
    the exact opposite of what the screen is for.

    So the rail is the part that yields. It is an aid to reading the lines, and
    an aid that leaves no lines to read has stopped being one — the toggle is
    still there, and widening the pane brings it straight back.
  */
  const viewerRef = useRef<HTMLDivElement>(null);
  const [roomForRail, setRoomForRail] = useState(true);
  useEffect(() => {
    const el = viewerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      setRoomForRail(entry.contentRect.width >= RAIL_MIN_WIDTH);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const facetsOpen = facetsWanted && hasFacets && roomForRail;
  const toggleFacets = () => setFacetsWanted(v => {
    try { localStorage.setItem('dk8s.logs.facets', v ? 'off' : 'on'); } catch { /* private mode */ }
    return !v;
  });
  useEffect(() => {
    if (!logRequestedAt) { setSettling(false); return; }
    const left = SETTLE_MS - (Date.now() - logRequestedAt);
    if (left <= 0) { setSettling(false); return; }
    setSettling(true);
    const t = setTimeout(() => setSettling(false), left);
    return () => clearTimeout(t);
  }, [logRequestedAt]);

  /*
    What this view can filter itself by, offered to the context menu.

    Built from the lines currently in the buffer rather than from a schema,
    because that is the only place the values exist — a thread name is not
    configuration, it is whatever the application happened to call its threads
    this run. Formats configured in Settings are passed in so a pattern that
    names `%{THREAD}` wins over the heuristics.

    Registered rather than exported: the menu is shared with surfaces that have
    no notion of a log, and it asks whoever is mounted instead of importing
    from here.
  */
  useEffect(() => {
    const provide = (): FilterMenu | null => {
      /*
        Fields the HOST parsed, never fields this view inferred.

        `buildFacets` no longer reads text — it reads `line.thread`,
        `line.logger` and `line.app`, which exist only where a configured
        format named them. With no format configured there are no groups, and
        the menu falls back to filtering by the selection alone. That is the
        honest state, and it is exactly the state the old heuristics filled
        with jar tags out of stack frames.
      */
      const facets = buildFacets(logs);
      const groups: FilterGroup[] = facets.map(facet => ({
        id: facet.field,
        label: facet.label,
        /*
          What the numbers count, stated once.

          They are counts of the events currently on screen, not of the pod's
          log — the buffer holds a few hundred lines out of millions — and a
          bare number would be read as a total. Saying so per row cost more
          width than the values themselves had.
        */
        note: `of ${facet.scanned.toLocaleString()} events on screen`,
        options: facet.values.map(v => ({
          label: v.value,
          hint: v.count.toLocaleString(),
          /*
            Applied as a FILTER on the field, not as text in the search box.

            The box was a substring match over the whole line, so filtering by
            thread `main` also matched every message that mentioned it, and
            there was no way at all to say "everything except this thread".
            Choosing the same value again flips it to an exclude.
          */
          apply: () => addFieldFilter({ field: facet.field, value: v.value, mode: 'include' }),
        })),
      }));

      // Whatever is selected, as a filter. A double-click selects a word, and
      // this is the shortest path from "that token looks interesting" to a log
      // showing only the lines containing it.
      const picked = (window.getSelection()?.toString() ?? '').trim();
      const oneLine = picked && !picked.includes('\n') && picked.length <= 120
        ? picked
        : undefined;

      const anyFilter = !!logFilter || logFieldFilters.length > 0;
      if (!groups.length && !oneLine && !anyFilter) return null;
      return {
        groups,
        selection: oneLine
          ? { label: `"${oneLine}"`, apply: () => setLogFilter(oneLine) }
          : undefined,
        // Clears both kinds. Two ways to be filtered and one way out of it —
        // someone who wants the whole log back does not care which is which.
        clear: anyFilter
          ? () => { setLogFilter(''); clearFieldFilters(); }
          : undefined,
      };
    };

    setFilterProvider(provide);
    return () => clearFilterProvider(provide);
  }, [logs, logFilter, logFieldFilters, addFieldFilter, setLogFilter]);

  const ask = useDk8sAiStore(s => s.ask);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  /**
   * The same element, as state, so measuring it can be an effect.
   *
   * A ref alone is not enough: the pane's first commit is the skeleton, so a
   * mount-time effect reading `scrollRef.current` finds null and, with an empty
   * dependency list, never looks again. Holding the node in state gives the
   * effect below something to depend on that changes when the node arrives.
   */
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const attachScroll = useCallback((el: HTMLDivElement | null) => {
    scrollRef.current = el;
    setScrollEl(el);
  }, []);
  const bodyRef = useRef<HTMLDivElement>(null);

  /*
    How wide the row is, so the rail's ceiling can be expressed in pixels.

    The split takes a minimum for each side and no maximum, so a cap on the
    rail has to be written as a floor under the lines: `row - RAIL_MAX`. That
    needs the row's width, and it has to keep needing it — the panel is
    resizable and a number measured once is a cap that drifts the moment
    somebody drags the window.

    Clamping in `onResize` instead was the first attempt and it does not work:
    the split follows the pointer with its own internal position during a drag
    and only reads the controlled value back between drags, so the rail
    stretched as far as you pulled and snapped to the limit when you let go.
    Enforced as a minimum it never gets there in the first place.
  */
  const [rowWidth, setRowWidth] = useState(0);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setRowWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** True while the ribbon is being dragged; freezes the follow logic. */
  const draggingRef = useRef(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(400);
  const [viewportW, setViewportW] = useState(0);
  /* Both modes open on whatever was chosen last — see `log-view-prefs`.
     Held as plain state they were re-decided on every mount: turn folding
     off to read a trace in full, open the next pod, and it is folded
     again. */
  const foldDefault = useLogFoldDefault();
  const [foldTraces, setFoldTraces] = useState(foldDefault);

  /*
    The line a link asked for.

    Only on the pod's own view: a pane and a search result are not where a
    link lands, and a highlight on the wrong screen would be a mark nobody put
    there.
  */
  const linkedLine = useK8sStore(s => s.linkedLine);
  const pendingLink = useK8sStore(s => s.pendingLink);
  const clearLinkedLine = useK8sStore(s => s.clearLinkedLine);
  const linkedSeq = focusSeq ?? (isSnapshot ? undefined : linkedLine?.seq);


  const chooseFold = useCallback((on: boolean) => {
    setFoldTraces(on);
    rememberLogMode(LOG_FOLD_PREF, on);
  }, []);
  const chooseWrap = useCallback((on: boolean) => {
    setLogWrap(on);
    rememberLogMode(LOG_WRAP_PREF, on);
  }, [setLogWrap]);

  /*
    Wrapping lives in the store the view is reading from — the pod store for
    the detail, the pane's own for a split — so the remembered choice is
    applied to it once, on the way in. Once only: after that the view is the
    reader's to point wherever they like, and two panes are allowed to differ.
  */
  const wrapDefault = useLogWrapDefault();
  const seededWrap = useRef(false);
  useEffect(() => {
    if (seededWrap.current) return;
    seededWrap.current = true;
    if (logWrap !== wrapDefault) setLogWrap(wrapDefault);
  }, [wrapDefault, logWrap, setLogWrap]);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  /** The most recent non-empty selection — see the note in captureSelection. */
  const lastSelRef = useRef<{ text: string; raw: string; first: number; last: number; count: number } | null>(null);
  const [analyzePlan, setAnalyzePlan] = useState<AnalyzePlan | null>(null);
  const [analyzeContext, setAnalyzeContext] = useState(true);
  /**
   * Two readings of the same selection, because two consumers want different
   * things from it.
   *
   * `text` is rebuilt from the buffer as whole lines with timestamps — what the
   * AI needs, since "these two lines are 400ms apart" is often the diagnosis.
   * `raw` is literally what the user highlighted, which is what Grep needs: if
   * they picked out a port number, they want that port, not the line it was
   * sitting in.
   */
  const selectionRef = useRef<
    { text: string; raw: string; first: number; last: number; count: number } | null
  >(null);

  /*
    The lines selected, as a range — not as the browser's selection.

    The list draws only the rows on screen, so a selection dragged over
    forty lines and then scrolled lost the rows it was anchored in: it
    vanished, or jumped onto whatever text the reused rows held next. The
    range is kept here instead and the rows draw it themselves, so it
    survives any scroll; Shift+click a row extends it from where it began,
    a line number selects that line, Esc lets go. Copy writes these lines
    as they read — time, level, message — whatever is on screen.
  */
  const [lineRange, setLineRange] = useState<{ anchor: number; first: number; last: number } | null>(null);
  const lineRangeRef = useRef(lineRange); lineRangeRef.current = lineRange;
  const pointerDownRef = useRef(false);
  const extendRange = (seq: number) => setLineRange(r => {
    const anchor = r?.anchor ?? seq;
    return { anchor, first: Math.min(anchor, seq), last: Math.max(anchor, seq) };
  });

  /*
    How much of a hit's surroundings the filter keeps.

    Searching a log is almost never about the matching line on its own: you
    look for a logger name to find the moment, and what you need is what
    happened just before it and what it did next. Filtering to the hits alone
    answers "where" and throws away "what".

    Starts at 0 — the old behaviour — so nobody's filter changes under them.
  */
  /* A search result opens at the width it was searched with: the neighbours it
     fetched are on screen from the start, not hidden until ±N is picked. */
  const [findContext, setFindContext] = useState(contextCap ?? 0);
  useEffect(() => { onFindContext?.(findContext); }, [findContext, onFindContext]);

  /*
    Which widths this buffer can actually honour — see the note on the
    selector below.
  */
  const contextRungs = useMemo(() => {
    const all = lineSettings.contextLadder;
    if (contextCap === undefined) return all;
    const within = all.filter(v => v <= contextCap);
    /* Always "none" and the width it was searched at, even when the cap falls
       between two rungs — a search at ±3 on a 0/5/10 ladder offered only 0. */
    return [...new Set([0, ...within, contextCap])].sort((a, b) => a - b);
  }, [lineSettings.contextLadder, contextCap]);

  /*
    The filter, a beat behind the box.

    Twenty thousand lines filtered and redrawn on every keystroke froze the
    page while somebody typed. The box keeps its own text and hands it on
    when they pause; the view then filters at React's lower priority, so a
    keystroke is never waiting on the last one's redraw.
  */
  const [filterDraft, setFilterDraft] = useState(logFilter);
  const draftPending = useRef(false);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { if (!draftPending.current) setFilterDraft(logFilter); }, [logFilter]);
  useEffect(() => () => clearTimeout(draftTimer.current), []);
  const typeFilter = (v: string) => {
    setFilterDraft(v);
    draftPending.current = true;
    clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => { draftPending.current = false; setLogFilter(v); }, 220);
  };
  const clearFilterNow = () => {
    clearTimeout(draftTimer.current);
    draftPending.current = false;
    setFilterDraft('');
    setLogFilter('');
  };
  const filterQuery = useDeferredValue(logFilter);

  const visible = useMemo(
    () => {
      const filtered = filterLines(logs, {
        query: filterQuery, levels: logLevels, fields: logFieldFilters,
        contextLines: findContext,
      });
      /* No term typed, but the page has hits of its own (a search result):
         ±N works on those, so "no surrounding lines" means the hits alone. */
      const shown = !filterQuery.trim() && isHit ? keepAround(filtered, isHit, findContext) : filtered;
      /* Only marked, or one hole's value from the rail: the marked lines and their frames. */
      return (onlyMarked || markField) && marks.length ? keepMarked(shown, markIdx.index, markField) : shown;
    },
    [logs, filterQuery, logLevels, logFieldFilters, findContext, onlyMarked, markField, marks.length, markIdx.index, isHit],
  );

  /* A term to mark in the text without filtering by it — a search result's own term. */
  const highlightMatcher = useMemo(
    () => (highlightQuery && !filterQuery.trim() ? buildMatcher(highlightQuery) : null),
    [highlightQuery, filterQuery],
  );

  /* The hits themselves, for the counter and for stepping between them. */
  const hits = useMemo(() => visible.filter(l => !l.context), [visible]);

  // Fold, then expand the ones the user opened. Expansion is keyed on the
  // heading line's seq so it survives new lines arriving above it.
  const rowsRef = useRef<{ line: MatchedLine; folded?: MatchedLine[]; isFrame?: boolean; yaml?: LogPayload }[]>([]);
  const offsetsRef = useRef<Float64Array>(new Float64Array(1));
  const rowAtRef = useRef<(y: number) => number>(() => 0);
  const yamlOn = payloadOpts.shapes.includes('yaml');
  const rows = useMemo(() => {
    const folded = foldStackTraces(visible, foldTraces, { yaml: yamlOn });
    const out: { line: MatchedLine; folded?: MatchedLine[]; isFrame?: boolean; yaml?: LogPayload }[] = [];
    for (const r of folded) {
      out.push({ line: r.line, folded: r.folded, yaml: r.yaml });
      /* A YAML block is drawn as its payload, never as frames. An opened trace
         lists the reader's own frames first when Settings says so. */
      if (r.folded && !r.yaml && expanded.has(r.line.seq)) {
        const frames = payloadOpts.appFirst ? ownFramesFirst(r.folded, payloadOpts.homePackages) : r.folded;
        for (const f of frames) out.push({ line: f, isFrame: true });
      }
    }
    return out;
  }, [visible, foldTraces, expanded, yamlOn, payloadOpts.appFirst, payloadOpts.homePackages]);

  const total = rows.length;
  // Sized from the largest number it will hold, so the column does not shift
  // as you scroll from line 99 to line 100.
  const gutterWidth = `${Math.max(2, String(rows.length).length)}ch`;

  /**
   * Real heights for the rows that have been on screen.
   *
   * With wrap on a row is not one line tall — a stack frame or a long JSON
   * payload takes two or three — so treating every row as ROW_HEIGHT made the
   * spacer shorter than the content. The last rows then fell outside the
   * scrollable area: the view stopped short of the end, and setting a
   * scrollTop past the (too-short) spacer got clamped by the browser, which
   * read as the scrollbar flickering and snapping back.
   */
  const heightsRef = useRef<number[]>([]);
  const [measuredAt, setMeasuredAt] = useState(0);
  const remeasure = useRef<number | undefined>(undefined);

  // Rows are re-derived on filter, fold and new lines, so old measurements
  // would be attached to different content.
  useEffect(() => {
    heightsRef.current = [];
    setMeasuredAt(v => v + 1);
  }, [visible, foldTraces, expanded, logWrap, viewportW]);

  /**
   * Where each row starts. Recomputed only when heights change — never on
   * scroll, which is the path that has to stay cheap.
   */
  const offsets = useMemo(() => {
    const out = new Float64Array(rows.length + 1);
    const known = heightsRef.current;
    for (let i = 0; i < rows.length; i++) {
      out[i + 1] = out[i] + (known[i] || ROW_HEIGHT);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, measuredAt]);

  const contentHeight = offsets[rows.length] || 0;
  /* Read by onScroll, which is declared before these and must not re-create on every row change. */
  rowsRef.current = rows;
  offsetsRef.current = offsets;

  /** Binary search rather than a divide: heights are no longer uniform. */
  const rowAt = useCallback((y: number) => {
    let lo = 0;
    let hi = rows.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (offsets[mid + 1] <= y) lo = mid + 1; else hi = mid;
    }
    return Math.min(lo, Math.max(0, rows.length - 1));
  }, [offsets, rows.length]);

  rowAtRef.current = rowAt;
  const first = Math.max(0, rowAt(scrollTop) - OVERSCAN);
  const last = Math.min(total, rowAt(scrollTop + viewportH) + 1 + OVERSCAN);
  const slice = rows.slice(first, last);
  /* The instants at the top and bottom of the screen, for a ribbon on a clock.
     Taken past the overscan, so it is what is visible rather than what is
     rendered around it. */
  const viewTimes = useMemo(() => {
    const top = rows[Math.min(rows.length - 1, first + OVERSCAN)]?.line.ts;
    const bottom = rows[Math.max(0, last - 1 - OVERSCAN)]?.line.ts;
    return { from: top, to: bottom };
  }, [rows, first, last]);

  /*
    Which of the rows on screen carry a payload.

    Over the SLICE, never over the buffer: parsing is cheap for one line and
    ruinous for two hundred thousand, and a row nobody can see has no chip to
    put a verdict on. The window moves as you scroll and this moves with it.
  */
  /*
    Detection is per event and cached: a line is parsed once for the settings
    it was parsed under, not on every scroll past it — which is what lets the
    footer count payloads across the whole buffer rather than the screen.
  */
  const payloadCache = useRef(new Map<number, { text: string; key: string; p: LogPayload | null }>());
  const payloadKey = `${payloadOpts.shapes.join(',')}|${payloadOpts.maxChars}`;
  const payloadOf = useCallback((line: MatchedLine): LogPayload | undefined => {
    if (!payloadOpts.shapes.length) return undefined;
    const text = displayText(line);
    const hit = payloadCache.current.get(line.seq);
    if (hit && hit.key === payloadKey && hit.text === text) return hit.p ?? undefined;
    const p = findPayload(text, { shapes: payloadOpts.shapes, maxChars: payloadOpts.maxChars }) ?? null;
    if (payloadCache.current.size > 60_000) payloadCache.current.clear();
    payloadCache.current.set(line.seq, { text, key: payloadKey, p });
    return p ?? undefined;
  }, [payloadKey, payloadOpts.shapes, payloadOpts.maxChars]);

  const payloads = useMemo(() => {
    const found = new Map<number, LogPayload>();
    if (!payloadOpts.shapes.length) return found;
    for (const row of slice) {
      if (row.isFrame) continue;
      const p = row.yaml ?? payloadOf(row.line);
      if (p) found.set(row.line.seq, p);
    }
    return found;
    // `slice` is a new array every render; its identity is the window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first, last, rows, payloadOf]);

  /* A line that looks like it carries one but will not be drawn says why. */
  const payloadNotes = useMemo(() => {
    const found = new Map<number, string>();
    if (!payloadOpts.shapes.length) return found;
    for (const row of slice) {
      if (row.isFrame || payloads.has(row.line.seq)) continue;
      const note = payloadNote(displayText(row.line), {
        shapes: payloadOpts.shapes, maxChars: payloadOpts.maxChars, truncated: row.line.truncated,
      });
      if (note) found.set(row.line.seq, note);
    }
    return found;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloads, payloadOpts.shapes, payloadOpts.maxChars]);

  /* Events, not lines: a folded trace or a YAML block is one, and its frames are none. */
  const eventStats = useMemo(() => {
    let events = 0;
    let withPayload = 0;
    for (const row of rows) {
      if (row.isFrame) continue;
      events++;
      if (row.yaml || payloadOf(row.line)) withPayload++;
    }
    return { events, withPayload };
  }, [rows, payloadOf]);

  /*
    Marked patterns from the Loggers tab, matched over the same window.

    A mark leaves the log intact and says where to look in it — so it paints
    the row's edge rather than filtering anything, and it is computed here,
    beside the payloads, because both are questions about what is on screen.
  */
  const markHits = useMemo(() => {
    const found = new Map<number, MarkHit>();
    if (!marks.length) return found;
    for (const row of slice) {
      /* The buffer's index has most of them already; a line it has not seen
         yet (it arrived this render) is matched here. */
      const hit = markIdx.index.get(row.line.seq) ?? markOf(displayText(row.line), marks);
      if (hit) found.set(row.line.seq, hit);
    }
    return found;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first, last, rows, marks, markIdx.index]);

  /* How many of the lines in view a mark claims, and the jump between them. */
  const markedInView = useMemo(
    () => (marks.length ? visible.reduce((n, l) => n + (markIdx.index.has(l.seq) ? 1 : 0), 0) : 0),
    [visible, marks.length, markIdx.index],
  );
  const jumpToRow = useCallback((rowIndex: number) => {
    const el = scrollRef.current;
    if (!el) return;
    setLogFollow(false);
    el.scrollTop = Math.max(0, offsets[rowIndex] - el.clientHeight / 3);
  }, [offsets, setLogFollow]);
  /*
    Find in this log — Ctrl+F.

    Not the filter: every line stays where it is, and the ones that match
    are marked down the gutter and across the row, the current one stronger,
    Enter and Shift+Enter stepping between them. A filter answers "show me
    only these"; find answers "where is it, and what is around it".
  */
  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState('');
  const [findCase, setFindCase] = useState(false);
  const [findRegex, setFindRegex] = useState(false);
  const [findAt, setFindAt] = useState(0);
  const findInputRef = useRef<HTMLInputElement>(null);
  const findQuery = useDeferredValue(findText);
  const findRows = useMemo(() => {
    if (!findOpen || !findQuery) return [] as number[];
    let test: (s: string) => boolean;
    if (findRegex) {
      try { const re = new RegExp(findQuery, findCase ? '' : 'i'); test = s => re.test(s); } catch { return []; }
    } else if (findCase) {
      test = s => s.includes(findQuery);
    } else {
      const q = findQuery.toLowerCase();
      test = s => s.toLowerCase().includes(q);
    }
    const out: number[] = [];
    rows.forEach((r, i) => {
      if (test(r.line.text) || r.folded?.some(f => test(f.text))) out.push(i);
    });
    return out;
  }, [findOpen, findQuery, findCase, findRegex, rows]);
  const findSeqs = useMemo(() => new Set(findRows.map(i => rows[i]?.line.seq)), [findRows, rows]);
  const findIdx = findRows.length ? Math.min(findAt, findRows.length - 1) : -1;
  const findCurrentSeq = findIdx >= 0 ? rows[findRows[findIdx]]?.line.seq : undefined;
  /* A new term starts at the first match from where the reader is looking. */
  useEffect(() => {
    if (!findRows.length) return;
    const el = scrollRef.current;
    const from = el ? rowAt(el.scrollTop) : 0;
    const k = findRows.findIndex(i => i >= from);
    setFindAt(k === -1 ? 0 : k);
    jumpToRow(findRows[k === -1 ? 0 : k]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findQuery, findCase, findRegex, findOpen]);
  const stepFind = (d: number) => {
    const n = findRows.length;
    if (!n) return;
    const next = ((findIdx < 0 ? 0 : findIdx) + d + n) % n;
    setFindAt(next);
    jumpToRow(findRows[next]);
  };
  const closeFind = () => { setFindOpen(false); };
  const findId = useRef(Symbol('log-view'));
  useEffect(() => {
    const root = viewerRef.current;
    if (!root) return;
    const mark = () => { activeViewer = { id: findId.current, el: root }; };
    root.addEventListener('mousedown', mark, true);
    root.addEventListener('focusin', mark);
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'f') return;
      if (root.offsetParent === null) return;
      const other = activeViewer && activeViewer.id !== findId.current
        && activeViewer.el.isConnected && activeViewer.el.offsetParent !== null;
      if (other) return;
      e.preventDefault();
      e.stopPropagation();
      setFindOpen(true);
      const picked = window.getSelection()?.toString().trim();
      if (picked && !picked.includes('\n') && picked.length < 200) setFindText(picked);
      setTimeout(() => { findInputRef.current?.focus(); findInputRef.current?.select(); }, 0);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      root.removeEventListener('mousedown', mark, true);
      root.removeEventListener('focusin', mark);
      window.removeEventListener('keydown', onKey, true);
      if (activeViewer?.id === findId.current) activeViewer = null;
    };
  }, []);

  /* As wide as the pod names are — a fixed 104px left a band of air after a five-letter tail. */
  const podColWidth = useMemo(() => {
    if (!podColumn) return 0;
    let n = 4;
    for (const l of logs) { const p = (l as { pod?: string }).pod; if (p) n = Math.max(n, podTail(p).length); }
    return `calc(${Math.min(n, 24)}ch + 4px)`;
  }, [podColumn, logs]);

  /* From the row a jump lands on — a third of the way down — so pressing it
     again moves on rather than finding the same line. */
  const jumpToNextMark = useCallback((markId?: string) => {
    const el = scrollRef.current;
    const from = el ? rowAt(el.scrollTop + el.clientHeight / 3) : 0;
    const next = nextMarked(rows, markIdx.index, from, markId);
    if (next !== undefined) jumpToRow(next);
  }, [rows, markIdx.index, rowAt, jumpToRow]);

  /* Opened by the reader, keyed on seq so new lines above do not shift it. */
  /*
    A payload is open when the reader said so on that line; else when Settings
    draws payloads open; else when its logger's payloads were left open and
    "remember" is on.
  */
  const [payloadToggles, setPayloadToggles] = useState<Map<number, boolean>>(new Map());
  /*
    The loggers remembered open, as they stood when this read began.

    Remembering is for the NEXT read — open a payload today and that logger's
    payloads open when the pod is read again. Read live, it applied the moment
    one was clicked: opening one "provider said" opened every other one on the
    screen, and expanding a line looked like it expanded a different one. So
    the set is taken once per read, and a click opens the line that was
    clicked, nothing else.
  */
  const loggersAtRead = useRef<{ at: number; open: Set<string> }>({ at: -1, open: new Set() });
  if (loggersAtRead.current.at !== logRequestedAt) loggersAtRead.current = { at: logRequestedAt, open: openLoggers(prefs) };
  const loggersOpen = loggersAtRead.current.open;
  const isPayloadOpen = useCallback((line: MatchedLine): boolean => {
    const own = payloadToggles.get(line.seq);
    if (own !== undefined) return own;
    if (!payloadOpts.collapsed) return true;
    return payloadOpts.remember && !!line.logger && loggersOpen.has(line.logger);
  }, [payloadToggles, payloadOpts.collapsed, payloadOpts.remember, loggersOpen]);
  const [openFields, setOpenFields] = useState<Set<number>>(new Set());
  /*
    What was opened belongs to the read it was opened in.

    Payloads, fields and folded traces are kept by line number, and every
    read numbers its lines from the start again — so a payload opened on
    line 7, then a Fetch or another pod, left whatever is line 7 now open.
    A new read starts with everything closed (or as remembered, above).
  */
  const openedIn = useRef(logRequestedAt);
  useEffect(() => {
    if (openedIn.current === logRequestedAt) return;
    openedIn.current = logRequestedAt;
    setPayloadToggles(new Map());
    setOpenFields(new Set());
    setExpanded(new Set());
  }, [logRequestedAt]);

  /*
    A link to one line, copied from its own row.

    The tick belongs to the line that was copied, not to the pointer: it stays
    on that row for its second and a half while the pointer has already moved
    on and the next row is offering its own link.
  */
  const [linkCopiedSeq, setLinkCopiedSeq] = useState<number>();
  const linkTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(linkTimer.current), []);
  const lineTarget = (line: MatchedLine) => {
    /* A search result's line names its cluster `cluster`: its `context` is the
       log view's yes/no for a neighbour line, and read as a cluster name it
       built links to a cluster called "true". */
    const own = line as MatchedLine & { pod?: string; namespace?: string; cluster?: string };
    const pod = own.pod ?? detail?.name;
    const namespace = own.namespace ?? detail?.namespace;
    const context = own.cluster ?? detail?.context;
    return pod && namespace && context ? { pod, namespace, context } : undefined;
  };
  const rowLink = (line: MatchedLine) => (
    <button
      type="button"
      onClick={() => copyLineLink(line)}
      title={linkCopiedSeq === line.seq ? 'Copied' : 'Copy a link to this line — it opens here in dk8s'}
      aria-label="Copy a link to this line"
      className={`dk-row-link flex items-center justify-center border-none bg-transparent cursor-pointer p-0${linkCopiedSeq === line.seq ? ' is-copied' : ''}`}
      style={{ width: 14, height: 16 }}
    >
      {linkCopiedSeq === line.seq ? <CopyGlyph copied size={12} /> : <LinkIcon size={12} />}
    </button>
  );
  /* The line itself, from the end of its row — the same tick as the link. */
  const [lineCopiedSeq, setLineCopiedSeq] = useState<number>();
  const lineTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(lineTimer.current), []);
  const rowCopy = (line: MatchedLine) => (
    <button
      type="button"
      onClick={e => {
        e.stopPropagation();
        void copyText(line.text).then(ok => {
          if (!ok) return;
          setLineCopiedSeq(line.seq);
          clearTimeout(lineTimer.current);
          lineTimer.current = setTimeout(() => setLineCopiedSeq(undefined), COPY_TICK_MS);
        });
      }}
      title={lineCopiedSeq === line.seq ? 'Copied' : 'Copy this line'}
      aria-label="Copy this line"
      className={`dk-row-link flex items-center justify-center border-none bg-transparent cursor-pointer p-0${lineCopiedSeq === line.seq ? ' is-copied' : ''}`}
      style={{ width: 14, height: 16 }}
    >
      <CopyGlyph copied={lineCopiedSeq === line.seq} size={12} />
    </button>
  );
  const copyLineLink = (line: MatchedLine) => {
    const t = lineTarget(line);
    if (!t) return;
    void copyText(podLogLink({ ...t, ts: line.ts, text: line.text.slice(0, 200) })).then(ok => {
      if (!ok) return;
      setLinkCopiedSeq(line.seq);
      clearTimeout(linkTimer.current);
      linkTimer.current = setTimeout(() => setLinkCopiedSeq(undefined), COPY_TICK_MS);
    });
  };
  const toggleFields = useCallback((seq: number) => {
    setOpenFields(prev => {
      const next = new Set(prev);
      if (next.has(seq)) next.delete(seq); else next.add(seq);
      return next;
    });
  }, []);
  const togglePayload = useCallback((line: MatchedLine) => {
    const open = !isPayloadOpen(line);
    setPayloadToggles(prev => new Map(prev).set(line.seq, open));
    if (payloadOpts.remember && line.logger) setOpenLogger(line.logger, open);
  }, [isPayloadOpen, payloadOpts.remember]);

  /*
    Put the linked line on screen, once.

    The highlight stays until the reader does something else with the view —
    it is the answer to "which line did they mean", and clearing it after a
    second would take it away while they were still reading around it.
    Scrolling happens once: dragging away from it and being dragged back would
    be the view arguing.
  */
  const scrolledToLink = useRef<number | undefined>(undefined);
  const jumpedToLink = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (linkedSeq === undefined || scrolledToLink.current === linkedSeq) return;
    const el = document.querySelector(`[data-seq="${linkedSeq}"][data-linked="1"]`);
    if (el) {
      scrolledToLink.current = linkedSeq;
      el.scrollIntoView({ block: 'center' });
      return;
    }
    /*
      Not drawn yet: the list only renders the rows near the viewport, and a
      link into a window of thousands of lines lands far from the bottom
      where the view opens. Move there first — the next render draws the row
      and the branch above centres it.
    */
    /* Keeps trying while the log streams in, until the row is drawn and the
       branch above centres it. Only the scroll repeats: turning follow off is
       a store write, and one on every render of the list is a loop — React
       stops it with "Maximum update depth exceeded" and the view goes blank.
       So follow is turned off once per link, and only if it is on. */
    const box = scrollRef.current;
    const rowIndex = rows.findIndex(r => r.line.seq === linkedSeq || r.folded?.some(f => f.seq === linkedSeq));
    if (!box || rowIndex === -1) return;
    if (jumpedToLink.current !== linkedSeq && useK8sStore.getState().logFollow) setLogFollow(false);
    jumpedToLink.current = linkedSeq;
    box.scrollTop = Math.max(0, offsets[rowIndex] - box.clientHeight / 2);
  }, [linkedSeq, slice, rows, offsets, setLogFollow]);

  /**
   * Record what a row actually measured.
   *
   * Batched into one frame: a row reporting its height triggers a re-layout
   * that can make its neighbours report theirs, and applying each
   * individually would re-render per row.
   */
  const measureRow = useCallback((index: number, el: HTMLDivElement | null) => {
    if (!el) return;
    const h = el.offsetHeight;
    if (!h || heightsRef.current[index] === h) return;
    heightsRef.current[index] = h;
    if (remeasure.current === undefined) {
      remeasure.current = window.requestAnimationFrame(() => {
        remeasure.current = undefined;
        setMeasuredAt(v => v + 1);
      });
    }
  }, []);

  useEffect(() => () => {
    if (remeasure.current !== undefined) cancelAnimationFrame(remeasure.current);
  }, []);

  useEffect(() => {
    const el = scrollEl;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setViewportH(el.clientHeight);
      // A width change re-wraps every line, so every measured height is stale.
      setViewportW(el.clientWidth);
    });
    ro.observe(el);
    setViewportH(el.clientHeight);
    setViewportW(el.clientWidth);
    return () => ro.disconnect();
  }, [scrollEl]);

  // Follow the tail, but only from the bottom. Yanking the view down while
  // someone is reading history is the worst thing a log viewer can do.
  /*
    Pinned until the rows have settled. One `scrollTop = scrollHeight` landed
    short whenever the rows it revealed measured taller than estimated (an
    open payload, a wrapped line) — the view sat a little above the newest
    line, the scroll handler read that as the reader scrolling up, and
    following quietly stopped following. So it re-pins for a few frames, and
    the handler ignores scrolls this effect made.
  */
  const pinning = useRef(false);
  useEffect(() => {
    if (!logFollow || !scrollRef.current) return;
    pinning.current = true;
    let frames = 0;
    let raf = 0;
    const pin = () => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
      if (++frames < 5) raf = requestAnimationFrame(pin);
      else pinning.current = false;
    };
    pin();
    return () => { cancelAnimationFrame(raf); pinning.current = false; };
  }, [total, logFollow]);

  /*
    A paged source: where the top of the screen is, as a line and an offset
    into it — so when lines arrive above (the previous window) or are dropped
    (the far end of a long scroll), the same line stays in the same place.
  */
  const anchorRef = useRef<{ seq: number; delta: number } | undefined>(undefined);
  const PAGE_EDGE_PX = 1200;

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    if (lineRangeRef.current && !pointerDownRef.current) {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && el.contains(sel.anchorNode)) sel.removeAllRanges();
    }
    if (paging) {
      const i = rowAtRef.current(el.scrollTop);
      const row = rowsRef.current[i];
      if (row) anchorRef.current = { seq: row.line.seq, delta: el.scrollTop - offsetsRef.current[i] };
      if (!paging.loading) {
        if (el.scrollTop < PAGE_EDGE_PX && paging.first > 0) paging.loadEarlier();
        else if (el.scrollHeight - el.scrollTop - el.clientHeight < PAGE_EDGE_PX
          && paging.first + logs.length < paging.total) paging.loadLater();
      }
      return;
    }
    // While the ribbon is being dragged, the scroll position is an OUTPUT of
    // the gesture. Feeding it back into the follow decision makes the two
    // fight each other, which is what the flicker was.
    if (draggingRef.current) return;
    if (pinning.current) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (atBottom !== logFollow) setLogFollow(atBottom);
  }, [logFollow, setLogFollow, paging, logs.length]);

  /* After the window moves, put the anchored line back where it was. */
  useLayoutEffect(() => {
    if (!paging) return;
    const el = scrollRef.current;
    const a = anchorRef.current;
    if (!el || !a) return;
    const i = rows.findIndex(r => r.line.seq === a.seq || r.folded?.some(f => f.seq === a.seq));
    if (i < 0) return;
    const want = offsets[i] + a.delta;
    if (Math.abs(el.scrollTop - want) > 1) el.scrollTop = want;
  }, [rows, offsets, paging]);

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
    el.scrollTop = Math.max(0, offsets[rowIndex] - el.clientHeight / 3);
  }, [visible, rows, offsets, setLogFollow]);

  // ── Selection ──
  //
  // Captured while it exists: clicking a button collapses the selection, so
  // reading it at click time returns nothing.
  /**
   * Track what is selected. Says nothing about showing the toolbar.
   *
   * selectionchange fires on every mouse move during a drag, so positioning
   * the strip from here made it chase the cursor across the log while the user
   * was still choosing what to select — and land on top of the lines they had
   * just highlighted.
   */
  const captureSelection = useCallback(() => {
    const sel = window.getSelection();
    const host = bodyRef.current;
    if (!sel || sel.isCollapsed || !sel.toString().trim() || !host) {
      // `lastSelRef` deliberately survives this. Choosing a menu entry
      // collapses the selection before the handler runs, so the thing the user
      // picked the menu for is gone by the time we go to act on it.
      /* A range of lines outlives the browser's selection — see `lineRange`. */
      if (lineRangeRef.current) return null;
      selectionRef.current = null;
      setLogSelection(undefined);
      return null;
    }
    const range = sel.getRangeAt(0);
    if (!host.contains(range.commonAncestorContainer)) return null;

    const seqOf = (node: Node | null): number | undefined => {
      let el: HTMLElement | null =
        node instanceof HTMLElement ? node : (node?.parentElement ?? null);
      while (el && !el.dataset.seq) el = el.parentElement;
      return el?.dataset.seq ? Number(el.dataset.seq) : undefined;
    };
    const a = seqOf(sel.anchorNode);
    const b = seqOf(sel.focusNode);
    if (a === undefined || b === undefined) return null;

    const firstSeq = Math.min(a, b);
    const lastSeq = Math.max(a, b);
    if (lineRangeRef.current?.first !== firstSeq || lineRangeRef.current?.last !== lastSeq) {
      setLineRange({ anchor: a, first: firstSeq, last: lastSeq });
    }
    // Rebuilt from the buffer, not from the DOM: the rendered text has no
    // timestamps and would drag the gutter along with it.
    const text = selectionText(logs, firstSeq, lastSeq);
    const count = lastSeq - firstSeq + 1;
    selectionRef.current = { text, raw: sel.toString(), first: firstSeq, last: lastSeq, count };
    lastSelRef.current = selectionRef.current;
    setLogSelection({ text, firstSeq, lastSeq, lineCount: count });
    return range;
  }, [logs, setLogSelection]);

  useEffect(() => {
    const onChange = () => { captureSelection(); };
    document.addEventListener('selectionchange', onChange);
    return () => document.removeEventListener('selectionchange', onChange);
  }, [captureSelection]);

  /* The range is what the rest of the view reads as "the selection": Ask AI,
     the menu, the footer's count. */
  useEffect(() => {
    if (!lineRange) return;
    const text = selectionText(logs, lineRange.first, lineRange.last);
    const count = logs.filter(l => l.seq >= lineRange.first && l.seq <= lineRange.last).length;
    const prev = selectionRef.current;
    selectionRef.current = { text, raw: prev?.raw ?? text, first: lineRange.first, last: lineRange.last, count };
    lastSelRef.current = selectionRef.current;
    setLogSelection({ text, firstSeq: lineRange.first, lastSeq: lineRange.last, lineCount: count });
  }, [lineRange, logs, setLogSelection]);

  /* Copy: the lines as they read. A word picked out of one line copies as itself. */
  const logsRef = useRef(logs); logsRef.current = logs;
  useEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      const r = lineRangeRef.current;
      if (!r) return;
      if ((document.activeElement as HTMLElement | null)?.closest('input, textarea, [contenteditable="true"]')) return;
      const sel = window.getSelection();
      const host = bodyRef.current;
      if (sel && !sel.isCollapsed && host && !host.contains(sel.anchorNode)) return;
      if (sel && !sel.isCollapsed && r.first === r.last) return;
      e.clipboardData?.setData('text/plain', selectionText(logsRef.current, r.first, r.last));
      e.preventDefault();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !lineRangeRef.current) return;
      /* An open menu takes Esc first; the next one lets go of the lines. */
      if (document.querySelector('body > .fixed[class*="z-[9999]"]')) return;
      /* Esc lets go of the lines — and only that, not the pod behind them. */
      e.stopPropagation();
      setLineRange(null);
      selectionRef.current = null;
      setLogSelection(undefined);
      window.getSelection()?.removeAllRanges();
    };
    const up = () => { pointerDownRef.current = false; };
    document.addEventListener('copy', onCopy);
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('mouseup', up);
    return () => {
      document.removeEventListener('copy', onCopy);
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mouseup', up);
    };
  }, [setLogSelection]);

  /**
   * Open the context menu on the selection that just ended.
   *
   * By synthesising a `contextmenu` event rather than calling into the menu:
   * RightClickMenu listens globally and builds its items from the target and
   * the live selection, so a real event gets the identical menu a right-click
   * would. A second path into it would be a second thing to keep in step.
   *
   * Anchored at the end of the selection — the caret is where you stopped
   * dragging, and a menu at the start would sit on top of what you chose.
   */
  const openMenuForSelection = useCallback(() => {
    const range = captureSelection();
    const host = bodyRef.current;
    if (!range || !host) return;

    const rects = range.getClientRects();
    const at = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();

    host.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true, clientX: at.right, clientY: at.bottom,
    }));
  }, [captureSelection]);

  const sendToAi = (promptKey: string, title: string) => {
    const sel = selectionRef.current ?? lastSelRef.current;
    if (!sel || !detail) return;
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

  /**
   * Ask about one exception, without anyone having to select it.
   *
   * A trace's extent is already known — the message line and the frames folded
   * under it — so the evidence is assembled rather than harvested from a
   * selection. It is capped at the frames that carry the diagnosis: the top of
   * a Java stack is where the cause is, and forty lines of framework beneath
   * it are tokens spent to say "and then Spring called Spring".
   */
  const askAboutTrace = (line: MatchedLine, frames: MatchedLine[]) => {
    if (!detail) return;
    const HEAD = 40;
    const kept = frames.slice(0, HEAD);
    const body = [line.text, ...kept.map(f => f.text)];
    if (frames.length > kept.length) {
      body.push(`… ${frames.length - kept.length} further frames not sent`);
    }
    ask({
      promptKey: 'dk8s.log.explainError',
      title: 'Explain this error',
      evidence: body.join('\n'),
      evidenceLabel: `STACK TRACE (${frames.length + 1} line${frames.length ? 's' : ''}`
        + `${frames.length > kept.length ? `, first ${kept.length + 1} sent` : ''})`,
      podContext: {
        pod: detail.name, namespace: detail.namespace, phase: detail.phase,
        restarts: detail.restarts, reason: detail.reason,
        runtime: runtime?.runtime, image: detail.containers[0]?.image,
      },
    });
  };

  /**
   * Analyze asks first.
   *
   * This is the only control in dk8s that takes text off the machine, and at
   * 5,000 lines it also truncates. Both are things to say BEFORE sending, not
   * afterwards in a footnote under the answer.
   */
  const analyzeBuffer = () => {
    if (!visible.length || !detail) return;
    setAnalyzePlan(planAnalyze(visible));
  };

  const sendAnalyze = () => {
    if (!analyzePlan || !detail) return;
    const body = analyzePlan.truncated
      ? [
          ...visible.slice(0, ANALYZE_HEAD).map(l => l.text),
          '\u2026 ' + analyzePlan.omittedLines.toLocaleString() + ' lines omitted \u2026',
          ...visible.slice(-ANALYZE_TAIL).map(l => l.text),
        ].join('\n')
      : visible.map(l => l.text).join('\n');

    ask({
      promptKey: 'dk8s.log.summarise',
      title: 'Summarise this log',
      evidence: body,
      evidenceLabel: 'LOG BUFFER (' + analyzePlan.sentLines.toLocaleString() + ' of '
        + analyzePlan.totalLines.toLocaleString() + ' lines)',
      // Opting out has to actually opt out, or the checkbox is a lie.
      podContext: analyzeContext
        ? {
            pod: detail.name, namespace: detail.namespace, phase: detail.phase,
            restarts: detail.restarts, reason: detail.reason, runtime: runtime?.runtime,
          }
        : { pod: detail.name },
    });
    setAnalyzePlan(null);
  };

  /**
   * Search chosen from the right-click menu.
   *
   * Finding a request id in one pod's log and wanting to know which other pod
   * touched it is the whole reason multi-pod search exists, and getting there
   * meant leaving the pod, remembering the string and typing it again.
   * Everywhere closes this pod first, so the dialog is not stacked on top of
   * the detail overlay it was opened from.
   *
   * The menu dispatches rather than calling in, so it stays a generic
   * selection menu and this stays the only place that knows what searching a
   * log means. The event carries the selected text because the menu's own
   * click will have collapsed the selection by the time this runs.
   */
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const onAction = (e: Event) => {
      const { action, text } = (e as CustomEvent<{ action: string; text: string }>).detail ?? {};

      /* Copy from the menu: the selected lines as they read — see `lineRange`. */
      if (action === 'copy') {
        const r = lineRangeRef.current;
        if (!r || r.first === r.last && (text ?? '').trim()) return;
        e.preventDefault();
        void copyText(selectionText(logsRef.current, r.first, r.last));
        return;
      }

      // The AI entries act on whole lines, so they run before the search term
      // is derived — `grepTermFor` rejects a multi-line selection as a search
      // term, and returning early on that would have taken these with it.
      if (action === 'ai:askWhy') {
        sendToAi('dk8s.log.askWhy', 'Ask AI why');
        window.getSelection()?.removeAllRanges();
        return;
      }
      if (action === 'ai:explain') {
        sendToAi('dk8s.log.explainError', 'Explain this error');
        window.getSelection()?.removeAllRanges();
        return;
      }

      const term = grepTermFor(text ?? '');
      if (!term) return;
      if (action === 'search:here') {
        setLogFilter(term);
      } else if (action === 'search:everywhere') {
        closeDetail();
        useDk8sSearchStore.getState().searchEverywhere(term);
      }
      window.getSelection()?.removeAllRanges();
    };
    el.addEventListener('daakia:selection-action', onAction);
    return () => el.removeEventListener('daakia:selection-action', onAction);
  }, [setLogFilter]);

  const { logLineNumbers } = useLogSource();
  const containers = detail?.containers ?? [];
  const oldest = logs.find(l => l.ts !== undefined)?.ts;

  /*
    One toolbar row or two — see the note on the controls group below. The
    controls need their own width; the filter takes the rest of the row. Two rows only when even its minimum will not fit.
  */
  const barRef = useRef<HTMLDivElement>(null);
  const filterBoxRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const [stacked, setStacked] = useState(false);
  useLayoutEffect(() => {
    const bar = barRef.current, group = groupRef.current, filterBox = filterBoxRef.current;
    if (!bar || !group || !filterBox) return;
    const measure = () => {
      const cs = getComputedStyle(bar);
      const gap = parseFloat(cs.columnGap) || 12;
      const avail = bar.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const others = [...bar.children].filter(c => c !== filterBox && c !== group);
      const fixed = others.reduce((w, c) => w + c.getBoundingClientRect().width + gap, 0);
      const ggap = parseFloat(getComputedStyle(group).columnGap) || 8;
      const parts = [...group.children].filter(c => !c.classList.contains('flex-1'));
      const need = parts.reduce((w, c) => w + c.getBoundingClientRect().width, 0) + ggap * Math.max(0, parts.length - 1);
      /* The filter takes what the controls leave; it gives way down to its
         minimum before the controls are sent to a row of their own. */
      setStacked(fixed + FILTER_MIN + gap + need > avail);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    for (const c of group.children) ro.observe(c);
    return () => ro.disconnect();
  });

  return (
    <div ref={viewerRef} className="flex flex-col h-full min-h-0">
      {/* ── Controls: every strip lives up here ── */}
      <div className="flex flex-col shrink-0"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
      {/* In one row nothing wraps and nothing shrinks but the filter, which
          gives way down to its minimum — its own style overrides the rule. */}
      <div ref={barRef} className={`flex items-center gap-3 px-4 py-2.5 shrink-0 ${stacked ? 'flex-wrap' : 'flex-nowrap [&>*]:shrink-0'}`}>
        {/* First, the field panel's switch: it governs the rail beside the lines
            rather than the rows, and a control that hides a whole column should
            not be buried at the end of a toolbar. */}
        <button
          type="button"
          onClick={toggleFacets}
          title={!hasFacets
            ? 'No fields on these lines — the panel appears when a log format names some'
            : facetsOpen ? 'Hide the field panel' : 'Show the field panel'}
          aria-pressed={facetsOpen}
          disabled={!hasFacets}
          className="flex items-center justify-center rounded shrink-0 border-none cursor-pointer"
          /* Sized to the chips beside it rather than to its glyph. It was the
             smallest control in the toolbar and it governs a whole column. */
          style={{
            width: 30, height: 26, borderRadius: 6,
            color: facetsOpen ? ACCENT : 'var(--color-text-muted)',
            background: facetsOpen
              ? 'color-mix(in srgb, var(--color-dk8s) 16%, transparent)' : 'transparent',
            border: facetsOpen
              ? '1px solid color-mix(in srgb, var(--color-dk8s) 34%, transparent)'
              : '1px solid transparent',
          }}
        >
          <SidebarLeftIcon size={15} />
        </button>

        <LevelChips />

        {marks.length > 0 && <Sep />}
        {marks.length > 0 && (
          <MarkedBar
            count={marks.length}
            onlyMarked={onlyMarked}
            onOnlyMarked={setOnlyMarked}
            onClear={() => clearMarks(scopeOf(detail))}
            field={markField}
            onClearField={() => setMarkField(undefined)}
          />
        )}

        {/* The filter takes the rest of the row, after the switch and the chips
            that shape what it searches. */}
        <div ref={filterBoxRef} className={stacked ? 'flex-1' : undefined}
             style={stacked ? { minWidth: 220 } : { flex: '1 1 auto', minWidth: FILTER_MIN }}>
          <FilterInputView
            value={filterDraft}
            onChange={(v: string) => typeFilter(v)}
            placeholder="Filter — text, or /regex/"
            size="sm"
            width="100%"
            accentColor={ACCENT}
            /*
              A way out of the filter, inside the filter.

              Filter By writes its term in here, and a term like
              `[http-nio-8080-exec-3]` is long enough that clearing it meant
              selecting the field and deleting — for something applied with one
              click. Red because clearing is the one destructive thing this
              control does, and only present when there is something to clear,
              so it never sits there as decoration.
            */
            /* The match count sits in the box too, so it costs the toolbar no
               width — held there empty, it was a gap after the context picker. */
            suffix={logFilter || isHit ? (
              <span className="flex items-center gap-2">
              <span
                className="text-[11px] tabular-nums whitespace-nowrap"
                style={{ color: hits.length ? ACCENT : 'var(--color-text-muted)' }}
                title={findContext > 0
                  ? `${hits.length} matching lines, with ${findContext} either side`
                  : `${hits.length} matching lines`}
              >
                {hits.length.toLocaleString()} {hits.length === 1 ? 'match' : 'matches'}
              </span>
              {logFilter && (
              <button
                type="button"
                onClick={clearFilterNow}
                title="Clear filter"
                aria-label="Clear filter"
                className="flex items-center justify-center cursor-pointer border-none bg-transparent p-0"
                style={{ color: 'var(--color-text-secondary)', lineHeight: 0 }}
              >
                {/* The same mark the menu's Clear filter carries, so the two
                    ways out of a filter look like one idea. */}
                <FilterClearIcon size={IconSize.item} />
              </button>
              )}
              </span>
            ) : undefined}
          />
        </div>


        {/*
          How much of each hit's surroundings to keep, and how many there are.

          Only while there is something to find: a context selector beside an
          empty filter box is a control for a state that does not exist, and
          the count would read "0 matches" for a log nobody has searched.
        */}
        {/* Always there, so typing in the filter never moves the toolbar; idle
            and quiet with nothing to find. */}
        {(
          <div
            className="flex items-center gap-1.5 shrink-0"
            title={contextCap !== undefined
              ? `This result was searched with ${contextCap} line${contextCap === 1 ? '' : 's'} either side, `
                + 'so that is as wide as it goes here. Search again with more to see further.'
              : undefined}
          >
            {/*
              The ladder stops where the lines do.

              A live log holds everything it fetched, so every rung can be
              satisfied from the buffer. A search result holds each hit plus
              the few lines the search asked for either side — and offering
              "±100 lines around" over a buffer that has two would change the
              dropdown and nothing else. A control that does nothing is worse
              than one that is not there.
            */}
            <SelectInputView
              value={String(onLadder(findContext, contextRungs, 0))}
              onChange={v => setFindContext(Number(v))}
              options={contextRungs.map(v => ({
                value: String(v), label: contextLabel(v),
              }))}
              size={CTL_SIZE}
              accentColor={ACCENT}
            />
          </div>
        )}

        {containers.length > 1 && (
          <div className="flex items-center gap-1">
            {containers.map(c => <ContainerChip key={c.name} name={c.name} />)}
          </div>
        )}


        {/*
          Grouped by what each control does, not by the order they were added.

          It was nine controls in one undifferentiated row, so nothing read as
          related to anything else, and the two checkboxes were the only
          non-button shapes in a row of buttons. Now there are three jobs, with
          a hairline between each:

            view    how the lines are drawn — wrap, folding
            query   what to fetch, ending in the one button that fetches it
            output  what to do with what came back

          One wrapping unit, because as siblings of the spacer these wrapped
          individually and a narrow panel flung Download and Analyze onto their
          own row at the far left — reading as a second, broken toolbar.

          One row when there is room for it: the filter at about forty per cent
          and these to its right, ending in what to do with the lines. A second
          row only when they would not fit beside it — a narrow panel, a split
          pane — and then the filter takes the whole first row. Measured, not a
          breakpoint: a pane in a split is narrow on a wide screen.
        */}
        {/* Tight gaps, and no control squeezed below its own width — so it reads
            as one toolbar, and measures the same in either layout. */}
        <div ref={groupRef} className="flex items-center gap-1.5 [&>*]:shrink-0"
             style={stacked ? { flexBasis: '100%', flexWrap: 'wrap' } : { flex: '0 0 auto', flexWrap: 'nowrap' }}>
        {/* Modes, not actions, so they are icon toggles rather than labelled
            buttons — and they sit apart from the controls that fetch. */}
        <IconButton on={logWrap} onClick={() => chooseWrap(!logWrap)}
                    title={logWrap ? 'Wrapping long lines' : 'Long lines run off the right'}
                    icon={<WrapLinesIcon size={IconSize.item} />} />
        <IconButton on={foldTraces} onClick={() => chooseFold(!foldTraces)}
                    title={foldTraces ? 'Stack traces are folded' : 'Stack traces shown in full'}
                    icon={<LayersIcon size={IconSize.item} />} />

        {/*
          Everything that reaches back to the cluster.

          Hidden, not disabled, when these lines are a result that already
          happened: a search finished at 1:16 cannot be followed, refetched,
          asked for a previous run or given a different window, and a greyed
          row of controls that can never work is clutter pretending to be a
          feature. What is left — the filter, the levels, wrap, folding,
          download, Analyze — all works on lines, and works the same either way.
        */}
        {/* Find in this log — always here, not only behind Ctrl+F. */}
        <IconButton on={findOpen} onClick={() => { setFindOpen(true); setTimeout(() => { findInputRef.current?.focus(); findInputRef.current?.select(); }, 0); }}
                    title="Find in this log (Ctrl+F)" icon={<SearchIcon size={IconSize.item} />} />

        {/*
          While following, the controls that shape a read have nothing to
          shape: there is no end, no line count and no window to a stream, and
          Fetch would only stop it. So that whole group gives way to what a
          stream does need — clearing what has piled up on screen.
        */}
        {!isSnapshot && logLive && (
          <>
            <Sep />
            {/* Hold the screen still to read; the stream carries on, and Resume lets it in. */}
            {setLogPaused && (
              <ButtonView
                label={logPaused ? `Resume${(logReceived ?? 0) > 0 ? ` · ${compactCount(logReceived ?? 0)} new` : ''}` : 'Pause'}
                size={CTL_SIZE} variant="secondary" accentColor={ACCENT}
                onClick={() => setLogPaused(!logPaused)}
                title={logPaused ? 'Add what arrived while paused, and follow the newest line again' : 'Hold the screen still to read — the stream keeps running'}
                iconLeft={logPaused ? <PlayIcon size={IconSize.action} /> : <PauseIcon size={IconSize.action} />}
                style={{
                  minWidth: 118,
                  ...(logPaused ? {
                    color: 'var(--color-warning)',
                    borderColor: 'color-mix(in srgb, var(--color-warning) 45%, transparent)',
                    background: 'color-mix(in srgb, var(--color-warning) 10%, transparent)',
                  } : {}),
                }}
              />
            )}
            {clearLogs && (
              <IconButton onClick={clearLogs} title="Clear the screen — Following carries on, from here"
                          icon={<EraserIcon size={IconSize.item} />} />
            )}
          </>
        )}
        {!isSnapshot && !logLive && (
          <>
        <Sep />

        {/* Which end, and how much. Nothing is fetched until Fetch is pressed —
            a selector that reloads on change is the "it keeps refreshing"
            behaviour this whole view exists to avoid. */}
        {/* Part of WHAT is fetched, so it belongs with the query controls
            rather than stranded past Analyze at the far right. */}
        {/* An icon, lit amber while on, so the row fits beside the filter. */}
        {(detail?.restarts ?? 0) > 0 && (
          <IconButton on={logPrevious} onClick={() => setLogPrevious(!logPrevious)} tone="var(--color-warning)"
                      title={logPrevious ? 'Reading the previous run — the container before its last restart' : 'Read the previous run — the container before its last restart'}
                      icon={<ClockIcon size={IconSize.item} />} />
        )}

        {/* A third choice, because "last 15 minutes" cannot answer what
            happened during an incident that ended on Tuesday — by the time you
            look, the window has moved past it. */}
        <SegmentedControlView
          value={logDirection}
          onChange={v => setLogDirection(v as 'last' | 'first' | 'between')}
          options={[
            { value: 'last', label: 'last' },
            { value: 'first', label: 'first' },
            { value: 'between', label: 'btw' },
          ]}
          size={CTL_SIZE}
          // dui defaults to `pill`, and a fully round track next to a row of
          // rounded-rectangle selects and buttons is the one shape that does
          // not belong.
          variant="rounded"
          borderRadius="sm"
          // The track's own radius is `thumb + 3px` padding, which is the
          // textbook concentric rule and still lands on 6px against every
          // other control's 4px. Side by side that reads as a different size
          // even though the boxes are the same 28px to the pixel, so the outer
          // edge is pinned to 4 and the thumb keeps its 3.
          style={{ borderRadius: 4 }}
          accentColor={ACCENT}
        />

        {/* The rungs come from Settings → DK8S → Logs. A service that writes
            four lines a request and one that writes four hundred are both
            normal, and no ladder written in here is right for both. */}
        <SelectInputView
          value={String(onLadder(logTail, lineSettings.tailLadder, lineSettings.tailDefault))}
          onChange={v => setLogTail(Number(v))}
          options={lineSettings.tailLadder.map(v => ({ value: String(v), label: tailLabel(v) }))}
          size={CTL_SIZE}
          accentColor={ACCENT}
        />

        {logDirection === 'between' ? (
          /* The window itself, where the relative presets would have been —
             the same place in the bar, because it answers the same question. */
          <div className="flex items-center gap-1.5">
            <DateTimeInputView
              value={logFrom}
              onChange={(v: string) => setLogWindow(v, logTo)}
              size={CTL_SIZE}
            />
            <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>to</span>
            <DateTimeInputView
              value={logTo}
              onChange={(v: string) => setLogWindow(logFrom, v)}
              size={CTL_SIZE}
            />
          </div>
        ) : (
        <SelectInputView
          value={logSince}
          onChange={v => setLogSince(v as 'all' | 'restart' | '15m' | '1h' | '2h' | '6h')}
          options={[
            { value: 'all', label: 'all time' },
            { value: 'restart', label: 'since last restart' },
            { value: '15m', label: 'last 15 min' },
            { value: '1h', label: 'last hour' },
            { value: '2h', label: 'last 2 hours' },
            { value: '6h', label: 'last 6 hours' },
          ]}
          size={CTL_SIZE}
          accentColor={ACCENT}
        />
        )}

        {/* The only accented button in the bar: it is what acts on the query
            the three controls to its left just composed. Everything else is
            quiet, so this reads as the thing to press. */}
        <ButtonView
          label="Fetch"
          size={CTL_SIZE}
          variant="secondary"
          accentColor={ACCENT}
          color={logLive ? 'var(--color-text-muted)' : ACCENT}
          disabled={logLive}
          onClick={fetchLogs}
          title={logLive ? 'Following already refetches continuously' : 'Load these lines now'}
          iconLeft={<RefreshIcon size={IconSize.action} color={logLive ? 'var(--color-text-muted)' : ACCENT} />}
          style={{
            background: logLive ? 'transparent' : 'color-mix(in srgb, var(--color-dk8s) 14%, transparent)',
            borderColor: logLive
              ? 'var(--color-surface-border)'
              : 'color-mix(in srgb, var(--color-dk8s) 38%, transparent)',
            fontWeight: 600,
          }}
        />
          </>
        )}
        {!isSnapshot && (
          <>
        {/* What to do with what came back sits at the right end of the row. */}
        <span className="flex-1" />
        <Sep />

        {/* Following is a decision, not a default. A pod doing hundreds of
            lines a second buries whatever you opened the log to read. */}
        <ButtonView
          label="Following"
          size={CTL_SIZE}
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
          </>
        )}

        {isSnapshot && <span className="flex-1" />}
        <Sep />

        {/* Icon only. A quiet outlined button next to Analyze's filled one
            read as two buttons that could not agree what they were; as an
            icon it is plainly a different class of thing. */}
        <IconButton
          onClick={openLogExport}
          title="Download — write this pod's log to a file, with the same options as a bulk export"
          icon={<DownloadIcon size={IconSize.item} />}
        />

        {/* Counted rather than asked: the summary is arithmetic over the
            window, so it is offered beside Analyze and costs nothing. Only
            where there is something to count. */}
        {determinants.length > 0 && (
          <ButtonView
            label="Summary"
            size={CTL_SIZE}
            variant="secondary"
            accentColor={ACCENT}
            color={summaryOpen ? ACCENT : 'var(--color-text-secondary)'}
            onClick={() => setSummaryOpen(v => !v)}
            title={`What ran in this window, by ${determinants.length} pattern${determinants.length === 1 ? '' : 's'}`}
            style={{
              background: summaryOpen
                ? `color-mix(in srgb, ${ACCENT} 16%, transparent)`
                : 'transparent',
            }}
          />
        )}

        <ButtonView
          label="Analyze"
          size={CTL_SIZE}
          variant="secondary"
          accentColor={AI_ACCENT}
          color={logs.length ? AI_ACCENT : 'var(--color-text-muted)'}
          disabled={!logs.length}
          onClick={analyzeBuffer}
          title="Ask AI for a timeline of what this log shows"
          iconLeft={<SparkleIcon size={IconSize.inline} color={logs.length ? AI_ACCENT : 'var(--color-text-muted)'} />}
          style={{
            background: logs.length
              ? `color-mix(in srgb, ${AI_ACCENT} 16%, transparent)`
              : 'transparent',
            borderColor: logs.length
              ? `color-mix(in srgb, ${AI_ACCENT} 45%, transparent)`
              : 'var(--color-surface-border)',
            fontWeight: 600,
          }}
        />

        {logStatus === 'error' && (
          <span className="text-[11px]" style={{ color: 'var(--color-error)' }}>error</span>
        )}
        </div>
      </div>
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
      <div
        ref={bodyRef}
        className="relative flex flex-1 min-h-0"
        // Hide on the way down so the strip is never in the way of the drag,
        // and place it on the way up once the selection is settled.
        onPointerUp={e => {
          // Right-click already opens the menu on its own; opening a second one
          // from here would fight the first.
          if (e.button === 2) return;
          // After the event loop turn, so the selection the browser is about to
          // settle is the one we read.
          window.setTimeout(openMenuForSelection, 0);
        }}
        // Double-click selects a word and raises the menu on it, which is the
        // fastest way to ask about one order id in a wall of them.
        onDoubleClick={() => window.setTimeout(openMenuForSelection, 0)}
        // Opts this surface into the AI and Search groups on the selection
        // menu; the menu dispatches back here rather than knowing about logs.
        data-selection-actions="ai search filter"
      >
        {/* While the first read is in flight the whole body is drawn as a
            skeleton — rail, divider and rows together. Drawing only the rows
            meant the loading state had one column and the loaded state had
            two, so the rail arrived from nowhere and pushed the lines you had
            started reading sideways. */}
        {findOpen && (
          <FindBar
            inputRef={findInputRef}
            text={findText} onText={setFindText}
            matchCase={findCase} onMatchCase={() => setFindCase(v => !v)}
            regex={findRegex} onRegex={() => setFindRegex(v => !v)}
            at={findIdx} total={findRows.length}
            onStep={stepFind} onClose={closeFind}
          />
        )}
        {/* A snapshot still arriving keeps the skeleton — it lands whole. */}
        {(settling || logStatus === 'loading' || (logStatus === 'streaming' && !logLive && (logReceived ?? 0) > 0)) && logs.length === 0 ? (
          <LogSkeleton railOpen={facetsOpen} rowHeight={ROW_HEIGHT} received={logReceived} />
        ) : (
        <>
        {/* The rail sits inside the body rather than above it, so it scrolls
            with the log's own region and disappears with it — it is about
            these lines, and following them to another tab would be a panel
            describing something that is no longer on screen.

            Three siblings in one flex row, not a split: the ribbon is a column
            beside the log and takes its height from this row. Inside a split's
            pane it had none, so it drew at the height of the whole document
            and stopped scrolling with the lines it indexes. */}
        {/*
          The rail and the lines, as a split somebody can drag.

          It was a fixed 208px, which is the width that fits `settle-worker-0`
          and not the width that fits an order id or a tenant name — and the
          values in this rail are exactly the kind of thing that runs long. The
          ribbon stays a sibling of the split rather than a third pane: it is a
          column beside the log and takes its height from this row, and inside
          a pane it had none, so it drew at the height of the whole document
          and stopped scrolling with the lines it indexes.

          The split is always mounted and collapses instead of unmounting, so
          closing the rail and opening it again returns it to the width you
          dragged it to rather than to the default.
        */}
        <SplitPanelView
          direction="horizontal"
          /*
            The rail's old fixed width is the floor and twice it is the
            ceiling: wide enough for the longest field value a pod is likely to
            log, never wide enough to take the lines down to a column. The lines are what the screen is for, and
            a rail that can eat half of it is one somebody drags by accident
            once and has to drag back.

            Both bounds are the component's own minimums, so it enforces them
            while the divider is moving rather than after. The ceiling is a
            floor under the lines, which is the same statement read from the
            other end. A percentage would have been the easy version and the
            wrong one: 416px of rail is half a narrow panel and a fifth of a
            wide one, and the number that decides this is how many characters
            of `ORD-88403` fit.
          */
          defaultSplit={17}
          minFirst={RAIL_MIN}
          minSecond={Math.max(0, rowWidth - RAIL_MAX)}
          collapsed={!facetsOpen}
          collapsedSide="first"
          accentColor={ACCENT}
          style={{ flex: 1, minWidth: 0, minHeight: 0 }}
          first={
            /* The raised surface, as on the board — the rail reads as one panel
               beside the lines, marks and fields alike. */
            <div className="flex flex-col h-full min-h-0" style={{ background: 'var(--color-elevated)' }}>
          {railLead}
          <MarkedRail
            patterns={catalogue}
            idx={markIdx}
            field={markField}
            onNext={id => jumpToNextMark(id)}
            onField={(field, value) => setMarkField(f =>
              (f?.field === field && f.value === value ? undefined : { field, value }))}
          />
          <FacetRail
            lines={logs}
            filters={logFieldFilters}
            onToggle={f => addFieldFilter(f)}
            onClear={(field, value) => removeFieldFilter(field, value)}
            /*
              Hands the value to the search that reads the pod's log rather
              than the buffer. `filterTermFor` brackets a thread where the log
              writes it that way — the buffer is passed so it can tell, because
              a JSON log spells the same thread `"thread_name":"..."` and a
              bracketed search of one finds nothing at all.
            */
            onSearchEverywhere={(field, value) =>
              useDk8sSearchStore.getState().searchEverywhere(filterTermFor(field, value, logs))}
          />
            </div>
          }
          second={
            <div className="flex flex-col h-full min-w-0 min-h-0">
          {summaryOpen && <SummaryPanel onClose={() => setSummaryOpen(false)} />}

          <FieldFilterStrip
            filters={logFieldFilters}
            onFlip={f => addFieldFilter(f)}
            onRemove={f => removeFieldFilter(f.field, f.value)}
            onClearAll={() => clearFieldFilters()}
          />

          <div
            ref={attachScroll}
            onScroll={onScroll}
            onMouseDown={e => {
              if (e.button !== 0) return;
              const t = e.target as HTMLElement;
              if (t.closest('button, a, input, textarea, [contenteditable="true"]')) return;
              const row = t.closest('[data-seq]') as HTMLElement | null;
              /* Shift+click: the lines from where the selection began to this one. */
              if (e.shiftKey && row && lineRangeRef.current) {
                e.preventDefault();
                window.getSelection()?.removeAllRanges();
                extendRange(Number(row.dataset.seq));
                return;
              }
              pointerDownRef.current = true;
              /* A fresh press starts a fresh selection. */
              if (lineRangeRef.current) setLineRange(null);
            }}
            /* Once, here, rather than on every row: thirty rows carrying the
               same three strings is thirty copies of one fact. A snapshot is
               left out — a search result is not a place a link can point. */
            data-log-pod={isSnapshot ? undefined : detail?.name}
            data-log-ns={isSnapshot ? undefined : detail?.namespace}
            data-log-ctx={isSnapshot ? undefined : (detail?.context ?? '')}
            data-log-container={logContainer}
            className="flex-1 overflow-auto pl-4 pr-1 py-2 font-mono min-h-0 dk8s-no-scrollbar"
            style={{ fontSize: 11.5, lineHeight: `${ROW_HEIGHT}px` }}
          >
            {paging?.searching ? (
              <SearchingState {...paging.searching} />
            ) : total === 0 ? (
              <div className="flex items-center justify-center h-full">
                <span className="text-[12px] text-[var(--color-text-muted)]" style={{ fontFamily: 'inherit' }}>
                  {logs.length === 0
                    ? logStatus === 'streaming' ? 'Connected — waiting for the pod to say something.'
                      /* A link into a window the pod no longer holds: say why it is empty.
                         kubectl serves only the current log file, and a busy pod's is
                         rotated away within minutes. */
                      : pendingLink && logDirection === 'between' && logStatus === 'ended'
                        ? 'Nothing in this window — the pod has rotated its log since, and kubectl logs only has what came after. The archive search can still find the line.'
                        /* An Errors read that found none — a good answer, said as one. */
                        : logStatus === 'ended' && logDirection === 'between' && logLevels.length === 1 && logLevels[0] === 'error'
                          ? `No errors between ${logFrom.replace('T', ' ').slice(0, 16)} and ${logTo.replace('T', ' ').slice(0, 16)}.`
                          : 'No output yet.'
                    : `No line matches. ${logs.length.toLocaleString()} hidden by the filter.`}
                </span>
              </div>
            ) : (
              <div style={{ height: contentHeight, position: 'relative' }}>
                <div style={{ position: 'absolute', top: offsets[first], left: 0, right: 0 }}>
                  {slice.map((row, i) => {
                    const line = row.line;
                    const isOpen = expanded.has(line.seq);
                    const payload = row.isFrame ? undefined : payloads.get(line.seq);
                    const payloadIsOpen = payload ? isPayloadOpen(line) : false;
                    const note = row.isFrame ? undefined : payloadNotes.get(line.seq);
                    const shownText = sentenceOf(line, payload);
                    const mark = row.isFrame ? undefined : markHits.get(line.seq);
                    const markColor = mark ? MARK_COLORS[mark.color] : undefined;
                    const fieldsAreOpen = openFields.has(line.seq);
                    /* The line the page is about — "the line you clicked", "you
                       came from here" — drawn as a card, see `ClickedLine`. */
                    const card: LineCardKind | undefined = row.isFrame ? undefined
                      : line.seq === selectedSeq && selectedLabel ? 'clicked'
                      : line.seq === focusSeq && focusLabel ? 'from' : undefined;
                    // Position in what is on screen, so it reads 1..N and the
                    // last number is the count — the same thing an editor's
                    // gutter tells you at a glance.
                    const lineNo = first + i + 1;
                    return (
                      <div
                        key={`${line.seq}-${i}`}
                        ref={el => measureRow(first + i, el)}
                        data-seq={line.seq}
                        data-linked={line.seq === linkedSeq ? '1' : undefined}
                        /*
                          What this line is, for whoever right-clicks it.

                          Declared on the row rather than handled here: the app
                          has one context menu, `RightClickMenu`, and it listens
                          on `document` in the CAPTURE phase so that Monaco
                          cannot open its own. A handler on this row is
                          therefore always too late — it fires during bubbling,
                          after the global menu has already decided what to
                          show, so the row's menu never appeared at all.

                          So the row says what it is and the global menu adds
                          the verb. That also keeps the selection actions the
                          footer advertises — Ask AI, Search, Filter — on the
                          same menu, instead of replacing them with a shorter
                          one about links.
                        */
                        data-log-ts={line.ts}
                        data-log-text={line.text}
                        /* A page that shows what a line names beside the log
                           is told which line was clicked. Not a drag that
                           selected text, and not a press on one of the row's
                           own chips — those mean something else. */
                        onClick={onSelectLine && !row.isFrame ? (e) => {
                          if ((e.target as HTMLElement).closest('button, a, input')) return;
                          if (window.getSelection()?.toString()) return;
                          onSelectLine(line);
                        } : undefined}
                        /* A column, so a payload can be drawn under the line it
                           came on. The row is what the virtualiser measures, so
                           the card's height is accounted for by growing it. */
                        className="dk-log-row flex flex-col"
                        style={{
                          minHeight: ROW_HEIGHT,
                          whiteSpace: logWrap ? 'pre-wrap' : 'pre',
                          /* The linked line takes the accent outright — a
                             level tint over it would leave the one line
                             somebody was sent looking like every other
                             warning on screen. */
                          cursor: onSelectLine && !row.isFrame ? 'pointer' : undefined,
                          /* A hit or a find match: a bar in the gutter, the whole line tinted. */
                          boxShadow: findCurrentSeq === line.seq ? `inset 3px 0 0 ${FIND_TONE}`
                            : findSeqs.has(line.seq) ? `inset 3px 0 0 color-mix(in srgb, ${FIND_TONE} 70%, transparent)`
                              : isHit?.(line) ? `inset 2px 0 0 color-mix(in srgb, ${HIT_TONE} 70%, transparent)` : undefined,
                          background: findCurrentSeq === line.seq
                            ? `color-mix(in srgb, ${FIND_TONE} 26%, transparent)`
                          : findSeqs.has(line.seq)
                            ? `color-mix(in srgb, ${FIND_TONE} 11%, transparent)`
                          : line.seq === linkedSeq
                            ? `color-mix(in srgb, ${ACCENT} 22%, transparent)`
                            : lineRange && line.seq >= lineRange.first && line.seq <= lineRange.last
                              ? 'color-mix(in srgb, var(--color-log-info, #3b82f6) 22%, transparent)'
                            : line.seq === selectedSeq
                              ? `color-mix(in srgb, ${ACCENT} 12%, transparent)`
                            /* A mark is drawn on the message it matched (below),
                               not across the row — so the row keeps its level
                               tint, and the time, level and logger stay plain. */
                            : isHit?.(line) && !line.context
                              ? `color-mix(in srgb, ${HIT_TONE} 9%, transparent)`
                            : line.level === 'error'
                              ? 'color-mix(in srgb, var(--color-error) 7%, transparent)'
                              : line.level === 'warn'
                                ? 'color-mix(in srgb, var(--color-warning) 5%, transparent)'
                                : 'transparent',
                          borderLeft: `2px solid ${
                            line.seq === linkedSeq || line.seq === selectedSeq ? ACCENT
                            : line.level === 'error' ? 'var(--color-error)'
                            : line.level === 'warn' ? 'var(--color-warning)' : 'transparent'
                          }`,
                          paddingLeft: row.isFrame ? 22 : 6,
                          opacity: row.isFrame ? 0.75 : 1,
                          ...(card ? cardRowStyle(card) : {}),
                        }}
                      >
                        <LineCard kind={card} line={line} readers={fieldReaders}>
                        <div className="flex gap-2.5 items-start">
                        {/* With no line numbers, the link keeps a slot of its own first on the row. */}
                        {!logLineNumbers && (
                          <span className="shrink-0 flex items-center justify-end" style={{ width: 34, gap: 2, height: ROW_HEIGHT - 4 }}>
                            {!row.isFrame && rowCopy(line)}
                            {!row.isFrame && lineTarget(line) && rowLink(line)}
                          </span>
                        )}
                        {/* Lines from several pods say which one, first on
                            every row: the same thread name can be reused by
                            another pod, and the pod is what tells them apart. */}
                        {podColumn && !row.isFrame && (line as { pod?: string }).pod && (
                          <span className="shrink-0 select-none truncate"
                                title={(line as { pod?: string }).pod}
                                style={{ width: podColWidth, color: (podColor ?? podHue)((line as { pod?: string }).pod!) }}>
                            {podTail((line as { pod?: string }).pod!)}
                          </span>
                        )}
                        {/* Off is a real preference: on a narrow panel the
                            gutter is width a long line needs more. */}
                        {logLineNumbers && (
                          /* The link sits just before the number it belongs to —
                             inside the gutter, in a slot the row always keeps, so
                             nothing shifts when it appears. */
                          <span className="shrink-0 select-none flex items-center justify-end"
                                style={{
                                  /* `gutterWidth` is a `ch` length — added to a number it was "5ch18", which is no width at all. */
                                  width: `calc(${gutterWidth} + 36px)`,
                                  gap: 4,
                                  fontVariantNumeric: 'tabular-nums',
                                }}>
                            {/* Copy the line, then link to it — both on hover, in a slot the row keeps. */}
                            <span className="shrink-0 flex items-center justify-end" style={{ width: 32, gap: 2 }}>
                              {!row.isFrame && rowCopy(line)}
                              {!row.isFrame && lineTarget(line) && rowLink(line)}
                            </span>
                            {/* Click: this line. Shift+click: every line from the one selected to here. */}
                            <span className="cursor-pointer" title="Select this line — Shift+click another to take the lines between"
                                  onMouseDown={e => { if (!e.shiftKey) e.preventDefault(); }}
                                  onClick={e => {
                                    if (e.shiftKey) return;
                                    window.getSelection()?.removeAllRanges();
                                    setLineRange({ anchor: line.seq, first: line.seq, last: line.seq });
                                  }}
                                  style={{ color: 'var(--color-text-muted)', opacity: lineRange && line.seq >= lineRange.first && line.seq <= lineRange.last ? 0.9 : 0.45 }}>
                              {lineNo}
                            </span>
                          </span>
                        )}

                        {line.ts !== undefined && !row.isFrame && (
                          <span className="shrink-0 select-none"
                                style={{ color: 'var(--color-text-muted)', opacity: 0.6, fontVariantNumeric: 'tabular-nums' }}>
                            {formatLogTime(line.ts)}
                          </span>
                        )}
                        {!row.isFrame && <LevelTag level={line.level} />}

                        {columns && !row.isFrame && columns.map(c => {
                          const v = c.value(line);
                          return (
                            <span key={c.key} className="shrink-0 truncate"
                                  title={v === undefined ? `no ${c.key} on this line` : `${c.key} = ${v}`}
                                  style={{ maxWidth: 150, color: v === undefined ? 'var(--color-text-muted)' : 'var(--color-info, #9cdcfe)', opacity: v === undefined ? 0.4 : 1 }}>
                              {v ?? '—'}
                            </span>
                          );
                        })}

                        <span style={{
                          /* A marked message: its pattern's colour at 16% behind it
                             and a 2px edge in that colour, the text in the plain
                             text colour so the mark, not the level, is what reads. */
                          ...(markColor ? {
                            background: `color-mix(in srgb, ${markColor} 16%, transparent)`,
                            borderLeft: `2px solid ${markColor}`,
                            paddingLeft: 5, marginLeft: -5,
                          } : {}),
                          color: markColor ? 'var(--color-text-primary)'
                            : line.level === 'error' ? 'var(--color-error)'
                            : line.level === 'warn' ? 'var(--color-warning)'
                            : line.level === 'debug' ? 'var(--color-text-muted)'
                            : 'var(--color-text-primary)',
                          /*
                            Library frames recede so the application's own stand
                            out. Dimmed rather than hidden: the framework's stack
                            is often how you tell WHICH of your calls failed, so
                            removing it would take away the context that makes
                            your frames mean something.
                          */
                          /*
                            A line kept only for what it is next to recedes too
                            — otherwise a search for one logger returns a
                            screenful in which nothing marks the thing you
                            searched for.
                          */
                          opacity: line.context ? 0.5
                            : row.isFrame && frameOrigin(line.text, payloadOpts.homePackages) === 'library' ? 0.55 : 1,
                          flex: logWrap ? 1 : undefined,
                          minWidth: 0,
                        }}>
                          <Highlighted text={shownText} hits={line.hits ?? highlightMatcher?.(shownText) ?? undefined} />
                          {/*
                            A cut line says it was cut.

                            Lines past 32KB are truncated on ingest, because a
                            serialised payload on one line costs every stage that
                            touches it. Silently dropping the tail is the part
                            that would be unacceptable — someone searching for a
                            string that was in the discarded half needs to know
                            it could have been there.
                          */}
                          {line.truncated && (
                            <BadgeChipView
                              tone="var(--color-warning)"
                              size="xs"
                              title="This line was longer than 32 KB and has been cut here."
                              style={{ marginLeft: 6 }}
                            >cut</BadgeChipView>
                          )}
                        </span>

                        {/* The fold. One row instead of forty, and the count is
                            on it so you know what you are choosing to open. */}
                        {row.folded && row.folded.length > 0 && !row.yaml && (
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
                            {isOpen ? <ChevronDownIcon size={IconSize.chip} /> : <ChevronRightIcon size={IconSize.chip} />}
                            {isOpen ? 'hide' : (() => {
                              /*
                                How many of the hidden frames are known library
                                frames.

                                Not "how many are yours" — that needs home
                                packages nobody has stated, and the first version
                                of this claimed thirteen of yours in a trace that
                                contained none. Counting what can be RECOGNISED
                                is honest and still useful: "70 frames, 66 of
                                them framework" says the same thing about where
                                to look without inventing the other number.
                              */
                              const home = payloadOpts.homePackages;
                              /* With your packages stated, the count that matters: how many are yours. */
                              if (home.length) {
                                const mine = row.folded!.filter(f => frameOrigin(f.text, home) === 'app').length;
                                return `${row.folded!.length} frames · ${mine} of yours`;
                              }
                              const lib = row.folded!.filter(f => frameOrigin(f.text) === 'library').length;
                              return lib
                                ? `… ${row.folded!.length} more frames · ${lib} framework`
                                : `… ${row.folded!.length} more frames`;
                            })()}
                          </button>
                        )}

                        {/*
                          Ask AI, on the row that has something to ask about.

                          The existing Ask AI acts on a SELECTION, which means
                          reading an exception, dragging across forty frames and
                          then finding the menu — for the one thing in a log
                          anybody actually wants explained. A stack trace already
                          knows its own extent: the message line plus the frames
                          folded under it. So the chip goes where the fold is and
                          sends exactly that, no selecting.

                          Same height as the fold beside it, because two chips on
                          one line at two heights is the first thing the eye
                          notices about a row it was meant to read.
                        */}
                        {row.folded && row.folded.length > 0 && !row.yaml && (
                          <button
                            type="button"
                            onClick={() => askAboutTrace(line, row.folded!)}
                            title="Ask AI what this exception means"
                            className="shrink-0 flex items-center gap-1 px-1.5 rounded cursor-pointer border-none self-center"
                            style={{
                              /* The same tone as the panel this opens. It was
                                 `--color-primary`, so the chip that asks and the
                                 answer it produces were different colours. */
                              background: `color-mix(in srgb, ${AI_ACCENT} 16%, transparent)`,
                              color: AI_ACCENT,
                              fontSize: 10, lineHeight: '15px',
                            }}
                          >
                            <SparkleIcon size={IconSize.chip} /> Ask AI
                          </button>
                        )}

                        {/*
                          The machine half of the line, offered rather than
                          drawn: one chip, and the payload stays where it was
                          logged until somebody wants it. The same bargain the
                          fold beside it makes, for the same reason — a body
                          opened by default costs the screen the next ten lines
                          were using.
                        */}
                        {payload && (
                          <button
                            type="button"
                            onClick={() => togglePayload(line)}
                            title={payloadIsOpen
                              ? 'Fold this payload back into the line'
                              : `Draw this ${payload.shape.toUpperCase()} payload`}
                            className="shrink-0 flex items-center gap-1 px-1.5 rounded cursor-pointer border-none self-center"
                            style={{
                              background: `color-mix(in srgb, ${ACCENT} 16%, transparent)`,
                              color: ACCENT,
                              fontSize: 10, lineHeight: '15px',
                            }}
                          >
                            {payloadIsOpen
                              ? <ChevronDownIcon size={IconSize.chip} />
                              : <ChevronRightIcon size={IconSize.chip} />}
                            {payload.shape.toUpperCase()} · {payload.summary}
                          </button>
                        )}

                        {/* A line that looks like it carries a payload, and why it is not drawn. */}
                        {note && (
                          <BadgeChipView tone="var(--color-warning)" size="xs" title={note} style={{ alignSelf: 'center' }}>
                            payload not drawn
                          </BadgeChipView>
                        )}

                        {/*
                          What the line names, offered rather than re-typed.

                          On every row that names anything at all — which is
                          the rows a format parsed, a pattern claimed, or a
                          payload came on. A row that names nothing has no
                          chip, because a chip that opens "nothing here" is a
                          chip that teaches people not to press it.
                        */}
                        {/* Only a line with keys of its own — MDC, a payload's leaves, a pattern's
                            holes. Thread and logger are in the rail for every line already. */}
                        {!row.isFrame && (Object.keys(line.fields ?? {}).length > 0
                          || payload?.value !== undefined || Object.keys(mark?.fields ?? {}).length > 0
                          || readFields(line, fieldReaders).length > 0) && (
                          <button
                            type="button"
                            onClick={() => toggleFields(line.seq)}
                            title={fieldsAreOpen ? 'Hide the fields' : 'What this line names, and what to follow'}
                            className="shrink-0 flex items-center gap-1 px-1.5 rounded cursor-pointer border-none self-center"
                            style={{
                              background: 'var(--color-surface-hover)',
                              color: 'var(--color-text-muted)',
                              fontSize: 10, lineHeight: '15px',
                            }}
                          >
                            {fieldsAreOpen
                              ? <ChevronDownIcon size={IconSize.chip} />
                              : <ChevronRightIcon size={IconSize.chip} />}
                            fields
                          </button>
                        )}
                        <span className="ml-auto shrink-0 flex items-center self-center" style={{ gap: 8, paddingLeft: 8 }}>
                          {((line.seq === selectedSeq && selectedLabel) || (line.seq === focusSeq && focusLabel)) && (
                            <span className="select-none"
                                  style={{ color: FOLLOW, fontSize: 10.5, fontFamily: 'var(--font-sans, system-ui)' }}>
                              {line.seq === focusSeq && focusLabel ? focusLabel : selectedLabel}
                            </span>
                          )}
                        </span>
                        </div>
                        </LineCard>

                        {fieldsAreOpen && (
                          <LineFieldsView line={line} payload={payload} mark={mark} />
                        )}

                        {payload && payloadIsOpen && (
                          <LogPayloadView
                            payload={payload}
                            mode={payloadOpts.mode}
                            depth={payloadOpts.depth}
                            hideSecrets={payloadOpts.hideSecrets}
                            keepRaw={payloadOpts.keepRaw}
                            title={[line.logger, line.ts !== undefined ? formatLogTime(line.ts) : undefined, detail?.name].filter(Boolean).join(' · ')}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
            </div>
          }
        />


        {marks.length > 0 && (
          <MarkMapStrip rows={rows} offsets={offsets} contentHeight={contentHeight}
                        index={markIdx.index} onJump={jumpToRow} />
        )}
        <DensityRibbon
          lines={visible}
          sharedRange={sharedRange}
          viewTimes={viewTimes}
          scrollTop={scrollTop}
          contentHeight={contentHeight}
          viewportHeight={viewportH}
          onJump={jumpTo}
          onScrollTo={(top) => {
            const el = scrollRef.current;
            if (!el) return;
            el.scrollTop = top;
          }}
          onCompact={onGutterCompact}
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
        </>
        )}

      </div>

      {/* Rendered here rather than in PodDetail because "On screen" exports
          `visible` — the filtered buffer this component owns. */}
      {/* A snapshot has no pod to re-read and no range to fetch, so its
          download is its own dialog with the one choice that applies. The
          source opens it; see `SearchResultsPage`. */}
      {logExportOpen && !isSnapshot && (
        <ExportLogsModal
          onClose={closeLogExport}
          visibleLines={visible.map(l =>
            l.ts !== undefined ? `${new Date(l.ts).toISOString()} ${l.text}` : l.text)}
        />
      )}

      {analyzePlan && detail && (
        <AnalyzeModal
          plan={analyzePlan}
          podName={detail.name}
          includeContext={analyzeContext}
          onIncludeContext={setAnalyzeContext}
          onCancel={() => setAnalyzePlan(null)}
          onConfirm={sendAnalyze}
        />
      )}

      {/* ── Footer: what is held, and where you are ── */}
      {/* 32px and 11.5px, the LogsMarked board's footer, so its 24px
          buttons stand in it with room either side. */}
      <div className="flex items-center gap-3 px-4 py-1 text-[11.5px] shrink-0"
           style={{ minHeight: 32, borderTop: '1px solid var(--color-surface-border)', color: 'var(--color-text-muted)' }}>
        {/*
          What is held, said as a fraction of what was asked for.

          "161 lines buffered" reads as "this is the log". It is the tail of a
          pod that may have written millions, and the number that makes it
          legible is the one next to it: 161 OF THE LAST 200 requested. Live
          pods cannot say how many lines exist — kubectl does not offer a count
          and asking for one means reading the whole log, which is the thing
          being avoided — so the denominator is the request, which is a fact,
          rather than the total, which would be a guess.
        */}
        {/*
          A snapshot has no tail to be a fraction of.

          "161 of the last 0 lines · at the limit" is what the live wording
          becomes when there was never a `--tail` — three claims, all false,
          about a result that simply is what it is.
        */}
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {paging
            ? `lines ${(paging.first + 1).toLocaleString()}–${(paging.first + logs.length).toLocaleString()} of ${paging.total.toLocaleString()}${paging.partial ? '…' : ''}`
            : isSnapshot
              ? `${logs.length.toLocaleString()} line${logs.length === 1 ? '' : 's'}`
              /* Following starts empty, so there is no tail to be a fraction of either. */
              : logLive
                ? `${logs.length.toLocaleString()} line${logs.length === 1 ? '' : 's'} since following began`
                /* The screen kept while a read replaces it — not yet "of the last N". */
                : logStatus === 'loading' || logStatus === 'streaming'
                  ? `reading the last ${logTail.toLocaleString()} lines…`
                  : `${logs.length.toLocaleString()} of the last ${logTail.toLocaleString()} lines`}
          {!isSnapshot && !logLive && logStatus !== 'loading' && logStatus !== 'streaming' && logs.length >= logTail && ' · at the limit'}
          {logs.length > 0 && ` · ${(bufferBytes(logs) / 1024 / 1024).toFixed(1)} MB`}
          {oldest !== undefined && ` · oldest ${formatLogTime(oldest)}`}
          {marks.length > 0 && <MarkedCount inView={markedInView} />}
        </span>
        {visible.length !== logs.length && (
          <span style={{ color: ACCENT, fontVariantNumeric: 'tabular-nums' }}>
            {visible.length.toLocaleString()} shown
          </span>
        )}
        {payloadOpts.draw && eventStats.events > 0 && (
          <span style={{ fontVariantNumeric: 'tabular-nums' }}
                title="Events, not lines: a folded stack trace or a YAML block is one event.">
            {eventStats.events.toLocaleString()} event{eventStats.events === 1 ? '' : 's'}
            {` · ${eventStats.withPayload.toLocaleString()} carry a payload`} · parsed on this machine, never sent anywhere
          </span>
        )}
        {footerNote && <span>{footerNote}</span>}
        <div className="flex-1" />
        <span>
          {isSnapshot ? (logDetail ?? 'a search result')
            : logLive && logPaused
              ? `paused — ${(logReceived ?? 0).toLocaleString()} new line${logReceived === 1 ? '' : 's'} waiting`
            : logLive
              ? 'following — new lines append as they arrive'
              : `snapshot of the last ${logTail} lines`}
        </span>
        {logLive && !logFollow && total > 0 && (
          <button
            type="button"
            onClick={() => setLogFollow(true)}
            className="cursor-pointer bg-transparent border-none px-0 text-[11.5px]"
            style={{ color: ACCENT }}
          >
            ↓ jump to newest
          </button>
        )}
        {/* Says the link landed, and offers the way out of it — a highlight
            somebody else put there should be removable by the person reading. */}
        {linkedSeq !== undefined && (
          <button
            type="button"
            onClick={clearLinkedLine}
            title="Clear the highlight this link left"
            className="cursor-pointer bg-transparent border-none px-0 text-[11.5px]"
            style={{ color: ACCENT }}
          >
            linked line · clear
          </button>
        )}
        <span>select any text to ask AI about it</span>
        {/* The board's pair, side by side and alike: Jump to next match, then
            the window on screen asked about as a whole — the Ask the log tab. */}
        {marks.length > 0 && <MarkedJump inView={markedInView} onNext={() => jumpToNextMark()} />}
        {!isSnapshot && (
          <ButtonView variant="secondary" accentColor={AI_ACCENT}
                      disabled={!logs.length}
                      title="Ask a question of this pod's log over a window, with the lines behind every answer"
                      onClick={() => useK8sStore.getState().setDetailTab('ask')}
                      style={OUTLINE_BUTTON}>
            Ask AI about this window
          </ButtonView>
        )}
        <ButtonView variant="secondary" accentColor={ACCENT}
                    title="Settings → DK8S → Logs: payloads, stack traces and what the counters count"
                    onClick={() => useTabsStore.getState().openSettingsTab('dk8s-logs')}
                    style={OUTLINE_BUTTON}>
          Rendering settings
        </ButtonView>
      </div>

    </div>
  );
}

/**
 * What the row reads: the message, with the payload lifted off it.
 *
 * The chip beside it stands for the payload, so the row stays a sentence. The
 * whole line comes back when a search hit falls inside the payload — a match
 * the reader cannot see is a match they will think is wrong — and for a line
 * that is nothing but its payload.
 */
function sentenceOf(line: MatchedLine, payload: LogPayload | undefined): string {
  return sentenceWithout(displayText(line), payload, at => !!line.hits?.some(([, to]) => to > at));
}

function ContainerChip({ name }: { name: string }) {
  const { logContainer, setLogContainer } = useLogSource();
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
/**
 * A whole-file filter on its way: the subject of the pane until it answers.
 *
 * The same moment as the search dialog's "Scanning", drawn at the size of the
 * pane it fills — a big glass with a ring running round it, what is being
 * looked for, and how far through the file the host has read.
 */
function SearchingState({ query, scanned, total, matched }: { query: string; scanned: number; total: number; matched: number }) {
  const accent = 'var(--color-dk8s)';
  const pct = total ? Math.min(100, (scanned / total) * 100) : 0;
  return (
    <div data-testid="log-searching" className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center"
         style={{ fontFamily: 'var(--font-sans, system-ui, sans-serif)', lineHeight: 1.4 }}>
      <span className="relative grid place-items-center" style={{ width: 96, height: 96 }}>
        <span className="absolute inset-0 rounded-full"
              style={{ background: `radial-gradient(circle, color-mix(in srgb, ${accent} 22%, transparent), color-mix(in srgb, ${accent} 6%, transparent) 70%)` }} />
        <span className="absolute inset-0 rounded-full animate-spin"
              style={{
                border: `3px solid color-mix(in srgb, ${accent} 16%, transparent)`,
                borderTopColor: accent, borderRightColor: accent, animationDuration: '0.9s',
              }} />
        <SearchIcon size={IconSize.hero} color={accent} />
      </span>
      <span className="flex flex-col gap-1 items-center">
        <span className="text-[16px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Searching</span>
        <span className="text-[12px] max-w-[520px]" style={{ color: 'var(--color-text-secondary)' }}>
          {query ? <>Looking for <span className="font-mono" style={{ color: accent }}>{query}</span> in </> : 'Reading '}
          all {total.toLocaleString()} lines of the download
        </span>
      </span>
      <span className="flex flex-col gap-1.5 items-center" style={{ width: 300 }}>
        <span className="w-full"><ProgressBarView value={scanned ? pct : undefined} color={accent} /></span>
        <span className="text-[11px]" style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
          {scanned ? `${Math.round(pct)}% read · ${matched.toLocaleString()} match${matched === 1 ? '' : 'es'} so far` : 'Starting…'}
        </span>
      </span>
    </div>
  );
}
