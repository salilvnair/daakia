/**
 * Turning a log into something you can look at.
 *
 * The density ribbon is the point of this file. Scrolling a 20,000-line buffer
 * hunting for the moment things broke is the slowest part of reading logs, so
 * the ribbon compresses the whole buffer into one strip: each column is a slice
 * of the buffer, its height is how much was logged, its colour is the worst
 * thing in it. The burst of red is visible without scrolling, and clicking it
 * jumps there.
 */
import type { LogLine, LogLevel } from '../../store/k8s-store';
import { yamlPayload, type LogPayload } from './log-payload';

export const LEVEL_ORDER: LogLevel[] = ['error', 'warn', 'info', 'debug', 'other'];

/** Rank for "worst level in this bucket" — lower is worse. */
const SEVERITY: Record<LogLevel, number> = {
  error: 0, warn: 1, info: 2, debug: 3, other: 4,
};

export function levelColor(level: LogLevel): string {
  switch (level) {
    case 'error': return 'var(--color-error)';
    case 'warn': return 'var(--color-warning)';
    case 'info': return 'var(--color-log-info, var(--color-info, #6aa9ff))';
    case 'debug': return 'var(--color-text-muted)';
    default: return 'var(--color-text-secondary)';
  }
}

export function levelLabel(level: LogLevel): string {
  return level === 'other' ? 'plain' : level;
}

/**
 * A filter on a field a format named, rather than on the line's text.
 *
 * Filtering by thread used to mean putting `[main]` in the search box, which
 * is a substring match over the whole line: it also matched any message that
 * mentioned `[main]`, and it could not express "everything EXCEPT this noisy
 * thread" at all. Matching the parsed field says what was meant.
 *
 * `*` is the only wildcard, because these are values picked from a menu and a
 * regex here would be a second syntax to learn for a control that is mostly
 * clicked. log-viewer's thread filter uses exactly this.
 */
export interface FieldFilter {
  /**
   * `thread`, `logger`, `app`, or any key a structured format carried.
   *
   * Widened from the three named slots when MDC arrived: `tenant` and
   * `orderId` are fields in exactly the same sense, they just do not have a
   * dedicated property on the line.
   */
  field: string;
  value: string;
  /** `exclude` hides matching lines; `include` hides everything else. */
  mode: 'include' | 'exclude';
}

export interface LogFilterSpec {
  /** Free text; case-insensitive substring, or /regex/ when it parses as one. */
  query: string;
  /** Empty means every level — a filter that hides everything by default is a trap. */
  levels: LogLevel[];
  /** Field filters, if any. Empty behaves exactly as before. */
  fields?: FieldFilter[];
  /**
   * Lines either side of a hit to keep, as context.
   *
   * Searching a log is almost never about the matching line on its own. You
   * look for a logger name to find the moment, and what you need is what
   * happened just before it and what it did next — a filter that shows only
   * the hits has answered "where" and thrown away "what".
   *
   * Zero, or absent, is the old behaviour exactly: hits and nothing else.
   */
  contextLines?: number;
}

/** `pool-*-thread-1` → a matcher. `*` is the only special character. */
function wildcard(value: string): (v: string) => boolean {
  if (!value.includes('*')) {
    const lower = value.toLowerCase();
    return v => v.toLowerCase() === lower;
  }
  const re = new RegExp(
    '^' + value.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$',
    'i',
  );
  return v => re.test(v);
}

/**
 * Does this line survive the field filters?
 *
 * Includes are OR'd within a field and AND'd across fields — picking two
 * threads means "either thread", and picking a thread and a logger means
 * "both". Excludes always win, because "hide this" is the stronger statement
 * and a line matching both an include and an exclude is one someone has
 * explicitly asked not to see.
 *
 * A continuation carries no fields, so it follows the event above it rather
 * than being judged on its own — otherwise filtering to one thread would show
 * that thread's errors with every stack trace stripped out from under them.
 */
/**
 * A field's value on a line, from its own slot or from the extras.
 *
 * One lookup for both so a filter does not have to know which kind of field
 * it holds — which is the whole point of widening `field` to a string.
 */
function valueOf(
  line: Pick<LogLine, 'thread' | 'logger' | 'app' | 'fields'>, field: string,
): string | undefined {
  if (field === 'thread' || field === 'logger' || field === 'app') return line[field];
  return line.fields?.[field];
}

export function matchesFieldFilters(
  line: Pick<LogLine, 'thread' | 'logger' | 'app' | 'fields'>,
  filters: FieldFilter[],
): boolean {
  if (!filters.length) return true;

  for (const f of filters) {
    if (f.mode !== 'exclude') continue;
    const v = valueOf(line, f.field);
    if (v && wildcard(f.value)(v)) return false;
  }

  const includes = filters.filter(f => f.mode === 'include');
  if (!includes.length) return true;

  const byField = new Map<string, FieldFilter[]>();
  for (const f of includes) {
    const list = byField.get(f.field) ?? [];
    list.push(f);
    byField.set(f.field, list);
  }

  for (const [field, list] of byField) {
    const v = valueOf(line, field);
    if (!v) return false;
    if (!list.some(f => wildcard(f.value)(v))) return false;
  }
  return true;
}

export interface MatchedLine extends LogLine {
  /** Character ranges of the query hit, in `displayText`. */
  hits?: [number, number][];
  /**
   * Kept for what is around it rather than for itself.
   *
   * The view dims these and the match navigation steps past them — otherwise
   * "next match" walks through context and the count means nothing.
   */
  context?: boolean;
}

/**
 * What a row should show.
 *
 * The parsed message where a format found one, the raw line otherwise. A JSON
 * log rendered as its own JSON is a wall of quoted keys with the sentence
 * buried in it — and by the time it is drawn, every key in that wall is
 * already a level, a column or a facet.
 *
 * `text` stays the raw line for Copy, Export and Ask AI, which all mean the
 * line as the pod wrote it.
 */
export function displayText(line: Pick<LogLine, 'text' | 'message'>): string {
  return line.message ?? line.text;
}

/**
 * Build a matcher from the query box.
 *
 * `/foo.*bar/` is treated as a regex because anyone reading logs at 3am
 * reaches for one, and requiring a separate toggle for it is friction at
 * exactly the wrong moment. An unparseable regex falls back to substring
 * rather than erroring — half-typed input should narrow, not explode.
 */
export function buildMatcher(query: string): ((text: string) => [number, number][] | null) | null {
  const q = query.trim();
  if (!q) return null;

  const asRegex = /^\/(.+)\/([gimsu]*)$/.exec(q);
  if (asRegex) {
    try {
      const re = new RegExp(asRegex[1], asRegex[2].replace('g', '') + 'g');
      return (text: string) => {
        re.lastIndex = 0;
        const hits: [number, number][] = [];
        let m: RegExpExecArray | null;
        while ((m = re.exec(text))) {
          hits.push([m.index, m.index + m[0].length]);
          // A zero-width match would spin here forever.
          if (m.index === re.lastIndex) re.lastIndex++;
          if (hits.length > 200) break;
        }
        return hits.length ? hits : null;
      };
    } catch {
      // Fall through to substring: a partially typed regex is still a search.
    }
  }

  const needle = q.toLowerCase();
  return (text: string) => {
    const hay = text.toLowerCase();
    const hits: [number, number][] = [];
    let at = hay.indexOf(needle);
    while (at !== -1 && hits.length < 200) {
      hits.push([at, at + needle.length]);
      at = hay.indexOf(needle, at + needle.length);
    }
    return hits.length ? hits : null;
  };
}

export function filterLines(lines: LogLine[], spec: LogFilterSpec): MatchedLine[] {
  const match = buildMatcher(spec.query);
  const levelSet = spec.levels.length ? new Set(spec.levels) : null;
  const fields = spec.fields ?? [];
  /*
    Whether the event a continuation belongs to survived the field filters.

    The starting value is the interesting part, and it decides what happens to
    the lines before the FIRST event — the JVM's startup notice and the Spring
    banner, which belong to no event at all.

    An include is a membership test: "show me this thread" cannot be satisfied
    by a line that has no thread, so those lines go. An exclude is only a
    rejection: "hide this logger" says nothing about the banner, so it stays.
    Treating both the same dropped eight lines of startup output every time
    somebody excluded one noisy logger.
  */
  let keepingEvent = !fields.some(f => f.mode === 'include');
  /* Every line that survived the level and field filters, plus which of them
     were hits — the context pass needs both, and needs them in order. */
  /* Context only means something around a hit. With no query every surviving
     line is shown, and treating context as active would send the whole view
     through a pass that collects windows around no hits at all — which is an
     empty log for somebody who simply has not typed anything yet. */
  const context = match ? Math.max(0, Math.round(spec.contextLines ?? 0)) : 0;
  const candidates: MatchedLine[] = [];
  const hitAt = new Set<number>();

  const out: MatchedLine[] = [];
  for (const line of lines) {
    /*
      A line whose message is empty.

      Logback writes one before a stack trace, and `kubectl --timestamps`
      prefixes it like any other, so it arrives as a timestamp with nothing
      after it. Rendered, that is a row carrying a clock and no content, which
      reads as the viewer having failed rather than as the blank line it is.

      Dropped from the view only. The buffer keeps it, so a download and an
      export are still byte-for-byte what the pod wrote.
    */
    if (!line.text.trim()) continue;
    if (levelSet && !levelSet.has(line.level)) continue;
    /*
      Field filters apply to events; a continuation inherits its event's fate.

      Judging a stack frame on its own would strip every trace out from under
      the errors that produced them — the filter would appear to work and the
      evidence would be gone.
    */
    if (fields.length) {
      if (line.continuation) {
        if (!keepingEvent) continue;
      } else {
        keepingEvent = matchesFieldFilters(line, fields);
        if (!keepingEvent) continue;
      }
    }
    /* No query: every surviving line is shown, and context means nothing. */
    if (!match) { out.push(line); continue; }
    /*
      Matched against the raw line, highlighted in the shown one.

      A search has to reach a value that only appears inside the JSON — that is
      half of why anyone searches a structured log. But the ranges a matcher
      returns are offsets into what it was given, so highlighting needs its own
      pass over the string actually on screen. A query that only matches a key
      name keeps the row and highlights nothing, which is the honest result.
    */
    if (!match(line.text)) {
      /* Not a hit, but it may be worth keeping for one nearby. Held rather
         than dropped, and resolved in the pass below where both sides of
         every hit are known. */
      if (context > 0) candidates.push(line);
      continue;
    }
    const shown = displayText(line);
    const hit: MatchedLine = {
      ...line,
      hits: (shown === line.text ? null : match(shown)) ?? match(line.text) ?? undefined,
    };
    if (context > 0) { candidates.push(hit); hitAt.add(candidates.length - 1); }
    else out.push(hit);
  }

  if (context === 0) return out;

  /*
    Keep a hit and the lines around it, and nothing else.

    Windows overlap and must not duplicate a line: two hits three apart with
    two lines of context share one. So the indices to keep are collected as a
    set and emitted once, in order — not by concatenating a window per hit.
  */
  /* Lines from several pods — a search result — keep a hit's context to its
     own pod: the line after the last hit in one pod is another pod's first. */
  const podOf = (l: MatchedLine) => (l as { pod?: string }).pod;
  const keep = new Set<number>();
  for (const i of hitAt) {
    const pod = podOf(candidates[i]);
    keep.add(i);
    for (let j = i - 1; j >= Math.max(0, i - context) && podOf(candidates[j]) === pod; j--) keep.add(j);
    for (let j = i + 1; j <= Math.min(candidates.length - 1, i + context) && podOf(candidates[j]) === pod; j++) keep.add(j);
  }
  return [...keep].sort((a, b) => a - b).map(i => (
    hitAt.has(i) ? candidates[i] : { ...candidates[i], context: true }
  ));
}

/**
 * The lines a page counts as hits, and up to `n` either side of each — the
 * search page's ±N, now that its term is marked rather than typed into the
 * filter. Neighbours stay inside the hit's own pod, and are flagged `context`
 * so they draw quieter. `n` 0 is the hits alone.
 */
export function keepAround(lines: MatchedLine[], isHit: (l: MatchedLine) => boolean, n: number): MatchedLine[] {
  const podOf = (l: MatchedLine) => (l as { pod?: string }).pod;
  const keep = new Map<number, boolean>();
  lines.forEach((l, i) => {
    if (!isHit(l)) return;
    keep.set(i, true);
    const pod = podOf(l);
    for (let j = i - 1; j >= Math.max(0, i - n) && podOf(lines[j]) === pod; j--) if (!keep.has(j)) keep.set(j, false);
    for (let j = i + 1; j <= Math.min(lines.length - 1, i + n) && podOf(lines[j]) === pod; j++) if (!keep.has(j)) keep.set(j, false);
  });
  return [...keep.keys()].sort((a, b) => a - b).map(i => (keep.get(i) ? { ...lines[i], context: undefined } : { ...lines[i], context: true }));
}

// ── Density ribbon ──────────────────────────────────────────────────────────

export interface DensityBucket {
  /** Index of the first line in this bucket, for scroll-to. */
  startIndex: number;
  count: number;
  /** 0..1 against the busiest bucket. */
  height: number;
  worst: LogLevel;
  errors: number;
  warns: number;
  /**
   * Events in the bucket — lines, less the stack frames folded into them.
   * The share of errors is errors over THIS: over `count`, a filter showing
   * only errors drew half-calm bands, because each timeout's frames counted
   * as calm lines beside it.
   */
  events: number;
  /** Wall-clock span, when the lines carried timestamps. */
  fromTs?: number;
  toTs?: number;
}

/**
 * Slice the buffer into `columns` even chunks.
 *
 * Even chunks by line index, not by time: a pod that logged nothing for an
 * hour and then screamed for two seconds is exactly the case you are looking
 * for, and bucketing by time would squeeze the interesting part into a sliver
 * one pixel wide while a flat hour took the whole width.
 */
export function densityBuckets(lines: LogLine[], columns: number): DensityBucket[] {
  if (!lines.length || columns < 1) return [];
  const size = Math.max(1, Math.ceil(lines.length / columns));
  // `size` is already floored at 1, so a column count above the line count
  // silently produces fewer buckets than asked for. That is the intent.

  const buckets: DensityBucket[] = [];

  for (let start = 0; start < lines.length; start += size) {
    const slice = lines.slice(start, start + size);
    let worst: LogLevel = 'other';
    let errors = 0;
    let warns = 0;
    let events = 0;
    let fromTs: number | undefined;
    let toTs: number | undefined;

    for (const l of slice) {
      /* Events only, the same rule the chips count by: a folded trace is one
         error in the ribbon's tooltip too, however many frames it left here. */
      if (!foldsInto(l)) {
        events++;
        if (l.level === 'error') errors++;
        else if (l.level === 'warn') warns++;
      }
      if (SEVERITY[l.level] < SEVERITY[worst]) worst = l.level;
      if (l.ts !== undefined) {
        if (fromTs === undefined) fromTs = l.ts;
        toTs = l.ts;
      }
    }

    buckets.push({ startIndex: start, count: slice.length, height: 0, worst, errors, warns, events, fromTs, toTs });
  }

  const busiest = Math.max(...buckets.map(b => b.count));
  const quietest = Math.min(...buckets.map(b => b.count));

  // When every bucket holds the same number of lines — which is what happens
  // whenever the buffer is smaller than the ribbon is wide — height carries no
  // information at all. Drawing them all at full height then reads as "maximum
  // density everywhere", which is a solid wall of colour that says nothing.
  // Half height instead, so it reads as what it actually is: a severity strip.
  const uniform = busiest === quietest;

  for (const b of buckets) {
    b.height = uniform ? 0.45 : Math.max(0.12, b.count / busiest);
  }
  return buckets;
}

/**
 * The same ribbon, drawn to a clock instead of to the line count.
 *
 * `densityBuckets` slices by line index on purpose — a quiet hour and a loud
 * two seconds both get room, and the loud part is what you are looking for.
 * That is the right scale for one log and the wrong one for a split: each pane
 * scales to its own lines, so the same height means a different instant in
 * each, and a burst that hit three pods at 14:02 is drawn at three different
 * heights. Lining those up is the whole reason to put pods side by side.
 *
 * So this is the other scale, used only when the panes share a clock: bands
 * are equal slices of TIME between `from` and `to`, a band with no lines in it
 * is drawn empty rather than skipped, and every pane given the same range
 * draws the same instant at the same height.
 *
 * Lines with no timestamp cannot be placed on a clock and are left out; the
 * ribbon says nothing about them rather than guessing where they belong.
 */
export function timeBuckets(
  lines: LogLine[],
  columns: number,
  range: { from: number; to: number },
): DensityBucket[] {
  if (columns < 1) return [];
  const span = Math.max(1, range.to - range.from);
  const width = span / columns;

  const buckets: DensityBucket[] = Array.from({ length: columns }, (_, i) => ({
    startIndex: -1,
    count: 0,
    height: 0,
    worst: 'other' as LogLevel,
    errors: 0,
    warns: 0,
    events: 0,
    fromTs: range.from + i * width,
    toTs: range.from + (i + 1) * width,
  }));

  lines.forEach((l, index) => {
    if (l.ts === undefined || l.ts < range.from || l.ts > range.to) return;
    const i = Math.min(columns - 1, Math.floor((l.ts - range.from) / width));
    const b = buckets[i];
    if (b.startIndex === -1) b.startIndex = index;
    b.count++;
    if (!foldsInto(l)) {
      b.events++;
      if (l.level === 'error') b.errors++;
      else if (l.level === 'warn') b.warns++;
    }
    if (SEVERITY[l.level] < SEVERITY[b.worst]) b.worst = l.level;
  });

  const busiest = Math.max(1, ...buckets.map(b => b.count));
  for (const b of buckets) {
    /* An empty slice of time is information on a shared clock — "this pod
       said nothing while the others were failing" — so it is drawn at zero
       rather than given the floor a sparse bucket gets on the line scale. */
    b.height = b.count === 0 ? 0 : Math.max(0.12, b.count / busiest);
  }
  return buckets;
}

/**
 * The stretch of time EVERY pane has lines for — the span a shared clock uses.
 *
 * Not the union. The union was the first version, and a split of a chatty pod
 * beside a quiet one showed why it is wrong: the chatty pod's 5,000 lines
 * covered 75 seconds, the quiet pod's 200 covered an hour, and on an hour-long
 * clock the chatty pod's whole buffer was drawn into the last sliver of its
 * ribbon. The rest was empty slices — under a filter showing nothing but
 * errors, a ribbon that said "errors only at the very end".
 *
 * Lining pods up is a question about the time they can ALL speak for, so the
 * clock spans the overlap: the latest first line to the earliest last line.
 * Returns `undefined` when there is no overlap worth drawing — the caller then
 * falls back to each pane's own scale rather than draw a clock that is empty
 * in every pane.
 */
export function sharedSpan(
  logs: LogLine[][],
  minSpanMs = 1000,
): { from: number; to: number } | undefined {
  let from = -Infinity;
  let to = Infinity;
  for (const lines of logs) {
    const own = timeRange(lines);
    /* A pane with no timestamps has no place on any clock; it cannot narrow
       the span, and it draws on its own scale whatever the others do. */
    if (!own) continue;
    from = Math.max(from, own.from);
    to = Math.min(to, own.to);
  }
  if (!Number.isFinite(from) || !Number.isFinite(to)) return undefined;
  return to - from >= minSpanMs ? { from, to } : undefined;
}

/** The earliest and latest timestamp in a set of logs, if any line has one. */
export function timeRange(...logs: LogLine[][]): { from: number; to: number } | undefined {
  let from = Infinity;
  let to = -Infinity;
  for (const lines of logs) {
    for (const l of lines) {
      if (l.ts === undefined) continue;
      if (l.ts < from) from = l.ts;
      if (l.ts > to) to = l.ts;
    }
  }
  return from === Infinity ? undefined : { from, to };
}

/**
 * Below this, the ribbon stops being a density plot.
 *
 * Density needs room to mean anything: forty 2px bands in a 150px track is a
 * barcode. A pane this short — the small ones in a four-way grid — gets marks
 * instead: one tick per error or warning run, which says the only thing a
 * glance at a small pane is for.
 */
export const COMPACT_RIBBON_PX = 180;

export interface RibbonTick {
  /** Where in the track, 0..1. */
  at: number;
  level: 'error' | 'warn';
  /** First line of the run, for scroll-to. */
  startIndex: number;
  /** How many events the tick stands for. */
  count: number;
}

/**
 * Errors and warnings as ticks, placed by their position in the buffer.
 *
 * Neighbours that would land on the same pixel merge into one tick that takes
 * the worse level and the total count — two ticks drawn on top of each other
 * is one tick that lies about how many it hides.
 */
export function ribbonTicks(
  lines: LogLine[],
  heightPx: number,
  minGapPx = 4,
  /**
   * The split's shared clock, when there is one.
   *
   * Without it a tick sits where its line is in the buffer; with it, where its
   * TIME is on the span every pane shares. The small panes of a grid are the
   * ones that go compact, and they are exactly the panes a shared clock is for
   * — placing their ticks by index would make the clock do nothing where it
   * matters most.
   */
  range?: { from: number; to: number },
): RibbonTick[] {
  if (!lines.length || heightPx <= 0) return [];
  const ticks: RibbonTick[] = [];
  const gap = minGapPx / heightPx;
  const span = range ? Math.max(1, range.to - range.from) : 0;

  lines.forEach((l, index) => {
    if (foldsInto(l)) return;
    if (l.level !== 'error' && l.level !== 'warn') return;
    let at: number;
    if (range) {
      /* No time, no place on a clock — left out rather than guessed. */
      if (l.ts === undefined) return;
      at = Math.min(1, Math.max(0, (l.ts - range.from) / span));
    } else {
      at = lines.length === 1 ? 0 : index / (lines.length - 1);
    }
    const last = ticks[ticks.length - 1];
    /* `abs`: on a clock, a buffer merged from two sources can step back in
       time, and a tick behind its neighbour still shares its pixel. */
    if (last && Math.abs(at - last.at) < gap) {
      last.count++;
      if (l.level === 'error') last.level = 'error';
      return;
    }
    ticks.push({ at, level: l.level, startIndex: index, count: 1 });
  });
  return ticks;
}

/**
 * How many bands a ribbon that tall can actually draw.
 *
 * One per ~7px is the readable size — a band has to be clickable and legible as
 * a colour. The second ceiling is the one a split pane needs: a band is at
 * least `min` px with a `gap` under it, and asking a 150px track for 170px of
 * bands does not shrink them, it makes the track overflow. A flex child whose
 * min-height is `auto` then keeps the height its content demanded, and every
 * measurement taken from it — the marker's position, the drag's scale — is
 * against a track taller than the pane it is drawn in.
 */
export function ribbonBands(height: number, min = 2, gap = 1): number {
  const fits = Math.floor((height + gap) / (min + gap));
  return Math.max(4, Math.min(Math.floor(height / 7), fits));
}

/** Tooltip for a ribbon column. */
export function describeBucket(b: DensityBucket): string {
  const parts = [`${b.count} line${b.count === 1 ? '' : 's'}`];
  if (b.errors) parts.push(`${b.errors} error${b.errors === 1 ? '' : 's'}`);
  if (b.warns) parts.push(`${b.warns} warning${b.warns === 1 ? '' : 's'}`);
  if (b.fromTs !== undefined) parts.push(new Date(b.fromTs).toLocaleTimeString());
  return parts.join(' · ');
}

/**
 * Per-level totals for the filter chips, so counts are visible before filtering.
 *
 * Events, never frames. A stack frame carries the level of the exception it
 * belongs to, so counting lines made one timeout with 34 frames read as 35
 * errors — and the chip then disagreed with the rows on screen, where those 34
 * are folded into one. The number has to mean what the eye can count.
 */
export function levelCounts(lines: LogLine[]): Record<LogLevel, number> {
  const counts: Record<LogLevel, number> = { error: 0, warn: 0, info: 0, debug: 0, other: 0 };
  for (const l of lines) if (!foldsInto(l)) counts[l.level]++;
  return counts;
}

/** `14:32:07.412` — date omitted, since a log view is always about "recently". */
export function formatLogTime(ts?: number): string {
  if (ts === undefined) return '';
  const d = new Date(ts);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

/**
 * Assemble the text for a selection so it reads like a log, not like a blob.
 *
 * The AI gets timestamps back, because "these three lines are 400ms apart" is
 * often the whole answer and a naive innerText copy loses it.
 */
export function selectionText(lines: LogLine[], firstSeq: number, lastSeq: number): string {
  /* As the row reads — its time, its level, its message — so a pasted line
     says when and how bad, not only what. A stack frame carries no level of
     its own, so it goes in bare under the line it belongs to. */
  return lines
    .filter(l => l.seq >= firstSeq && l.seq <= lastSeq)
    .map(l => {
      const frame = l.continuation || isStackFrame(l.text);
      const parts = [
        l.ts !== undefined ? new Date(l.ts).toISOString() : '',
        !frame && l.level !== 'other' ? l.level.toUpperCase() : '',
        frame ? l.text : displayText(l),
      ];
      return parts.filter(Boolean).join(' ');
    })
    .join('\n');
}

// ── Stack-trace folding ─────────────────────────────────────────────────────

/**
 * A stack trace is one event, not forty.
 *
 * An unfolded Java exception costs a screen and a half, so scrolling past three
 * of them means you never see the fourth. Folding the frames to a single row
 * keeps the exception message — the part that identifies it — at full weight
 * and puts the frames one click away.
 */
export interface FoldedRow {
  line: MatchedLine;
  /** Frames folded under this row, if it heads a stack trace. */
  folded?: MatchedLine[];
  /**
   * The lines under this row were a YAML block, joined back into its event.
   * `folded` then holds those lines, and this is how they are drawn — as a
   * payload, never as frames.
   */
  yaml?: LogPayload;
}

export interface FoldOptions {
  /** Join a YAML block that follows a line back into that line's event. */
  yaml?: boolean;
}

/**
 * A continuation frame: `at com.x.Y.z(...)`, `... 34 more`, or a bare tab.
 *
 * Kept only for lines that arrived without a verdict. The host now decides
 * this exactly — a line is a continuation when the configured format failed to
 * parse it — and `foldsInto` prefers that answer wherever it exists. This
 * remains the fallback for a pod with no format configured, where a guess is
 * all anyone has.
 */
export function isStackFrame(text: string): boolean {
  return /^\s+at\s|^\s*\.\.\.\s+\d+\s+(more|common frames omitted)/.test(text);
}

/**
 * Does this line belong to the one above it?
 *
 * The host's `continuation` flag when there is one, the text heuristic when
 * there is not. Preferring the flag matters because the heuristic only knows
 * Java: a Python traceback, a Go panic and a block of wrapped SQL are all
 * continuations that `isStackFrame` calls events, so they stayed unfolded and
 * pushed the message that caused them off the screen.
 */
function foldsInto(line: Pick<LogLine, 'continuation' | 'text'>): boolean {
  return line.continuation ?? isStackFrame(line.text);
}

/**
 * Where a stack frame came from.
 *
 * ── Why this returns `unknown` ──
 *
 * The first version of this read the jar tag the JVM appends — `~[app.jar]`,
 * `~[na:na]`, `~[hibernate-core-6.6.4.Final.jar!/]` — and called anything
 * without a version "the application's". Against the real crashloop log that
 * claimed thirteen frames were yours. Every one was wrong: the `na:na` frames
 * are JDK classes (`java.base/java.net.Socket.connect`) and the `app.jar`
 * frames are Spring Boot's own launcher, which lives in your jar without being
 * your code.
 *
 * So the jar tag is gone. What is left is two things that can be known:
 *
 *  - The runtime and the frameworks announce themselves by package. `java.base/`
 *    and `org.springframework.` are not yours, whoever you are.
 *  - Everything else is `unknown` unless someone has SAID which packages are
 *    theirs, because there is no way to tell your `com.acme` from a vendor's.
 *
 * `unknown` is a real answer and the UI treats it as one: no dimming, no count.
 * Claiming thirteen of your frames are in a trace that contains none of them is
 * worse than saying nothing.
 */
export type FrameOrigin = 'app' | 'library' | 'unknown';

/**
 * Packages that belong to the runtime or to a framework, never to you.
 *
 * Deliberately short and deliberately certain. Anything arguable is left out —
 * a package that MIGHT be a library is `unknown`, and unknown frames are shown
 * at full weight.
 */
const NOT_YOURS = [
  'java.', 'javax.', 'jakarta.', 'jdk.', 'sun.', 'com.sun.',
  'org.springframework.', 'org.hibernate.', 'org.apache.', 'org.eclipse.',
  'ch.qos.logback.', 'org.slf4j.', 'io.netty.', 'reactor.', 'com.zaxxer.hikari.',
  'org.postgresql.', 'com.mysql.', 'org.mongodb.', 'redis.clients.',
  'org.junit.', 'org.mockito.', 'com.fasterxml.jackson.', 'kotlin.', 'scala.',
];

/** The class a frame names, with any JPMS module prefix removed. */
function frameClass(text: string): string | undefined {
  return /^\s*at\s+(?:[\w.$]+\/)?([\w.$]+)\.[\w$<>]+\(/.exec(text)?.[1];
}

export function frameOrigin(text: string, homePackages: string[] = []): FrameOrigin {
  const cls = frameClass(text);
  if (!cls) return 'unknown';

  // A stated home package is the best answer available and wins outright.
  if (homePackages.some(p => cls.startsWith(p))) return 'app';
  if (NOT_YOURS.some(p => cls.startsWith(p))) return 'library';
  return homePackages.length ? 'library' : 'unknown';
}

/**
 * `Caused by:` heads a new section of the SAME trace, so it stays visible —
 * the root cause is the useful half and folding it away would defeat the point.
 */
function isTraceHeader(text: string): boolean {
  // The throwable's own first line heads a fold too. Without it the frames
  // folded under the *logged* line above — typically a WARN from a different
  // logger — so expanding an error opened frames that looked like they
  // belonged to the warning before it.
  return /^Caused by:|^Suppressed:/.test(text)
    || /^[\w$]+(\.[\w$]+)*(Exception|Error|Throwable)(:|\s|$)/.test(text);
}

export function foldStackTraces(lines: MatchedLine[], enabled: boolean, opts: FoldOptions = {}): FoldedRow[] {
  if (!enabled && !opts.yaml) return lines.map(line => ({ line }));

  const rows: FoldedRow[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    /*
      A YAML dump — the config an application prints at startup — is one event
      written as forty lines. Joined back under the line that introduced it, it
      is drawn as a tree like any other payload. Checked before the trace fold,
      and only for lines that are not frames: a trace is never YAML.
    */
    if (opts.yaml && !foldsInto(line)) {
      let j = i + 1;
      const block: MatchedLine[] = [];
      while (j < lines.length && lines[j].continuation && !isStackFrame(lines[j].text)) { block.push(lines[j]); j++; }
      const yaml = block.length >= 2 ? yamlPayload(line.message ?? line.text, block.map(b => b.text)) : undefined;
      if (yaml) {
        rows.push({ line, folded: block, yaml });
        i = j - 1;
        continue;
      }
    }
    if (!enabled) { rows.push({ line }); continue; }

    if (foldsInto(line)) {
      // A run of frames with no header above it — can happen after a filter
      // hides the header. Keep the first so the run is not invisible.
      const start = i;
      while (i + 1 < lines.length && foldsInto(lines[i + 1])) i++;
      const run = lines.slice(start, i + 1);
      rows.push({ line: run[0], folded: run.slice(1) });
      continue;
    }

    // A header line takes the frames that follow it.
    const folded: MatchedLine[] = [];
    let j = i + 1;
    while (j < lines.length && foldsInto(lines[j])) { folded.push(lines[j]); j++; }
    if (folded.length && (line.level === 'error' || isTraceHeader(line.text))) {
      rows.push({ line, folded });
      i = j - 1;
    } else {
      rows.push({ line });
    }
  }
  return rows;
}

/**
 * The frames of an opened trace, the reader's own first.
 *
 * With packages stated, those frames lead; without, whatever is not known to
 * be framework leads — the same honesty as the fold's count, which never calls
 * a frame yours without being told. Order is kept within each part: a stack
 * read top to bottom still means what it meant.
 */
export function ownFramesFirst(frames: MatchedLine[], homePackages: string[] = []): MatchedLine[] {
  const mine: MatchedLine[] = [];
  const rest: MatchedLine[] = [];
  for (const f of frames) {
    const origin = frameOrigin(f.text, homePackages);
    (origin === 'app' || (!homePackages.length && origin === 'unknown') ? mine : rest).push(f);
  }
  return [...mine, ...rest];
}

/** Bytes held, for the footer. Rough by design — it is a scale, not an audit. */
export function bufferBytes(lines: LogLine[]): number {
  let n = 0;
  for (const l of lines) n += l.text.length + 24;
  return n;
}

export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

// ── Selection toolbar placement ─────────────────────────────────────────────

export interface Rect { top: number; bottom: number; left: number; height: number; width: number; }

/**
 * Where to put the strip so it does not cover what was just selected.
 *
 * Below the selection by default. Above only when there is no room below —
 * covering the lines you highlighted defeats the point of highlighting them,
 * and the first version did exactly that by always sitting above.
 *
 * Kept pure so the arithmetic can be tested; the component supplies the rects.
 */
export function placeSelectionToolbar(
  selection: Rect,
  host: Rect,
  toolbar: { width: number; height: number },
  gutterRight = 0,
  gap = 10,
): { top: number; left: number } {
  const below = selection.bottom - host.top + gap;
  const above = selection.top - host.top - toolbar.height - gap;
  const fitsBelow = below + toolbar.height <= host.height;

  // When neither side fits — a selection taller than the viewport — prefer
  // below and let it clip at the bottom rather than covering the text.
  const top = fitsBelow ? below : Math.max(4, above);

  const maxLeft = Math.max(8, host.width - toolbar.width - gutterRight - 8);
  const left = Math.min(Math.max(8, selection.left - host.left), maxLeft);

  return { top, left };
}

/**
 * Turn a selection into a filter term.
 *
 * Uses what was actually highlighted, never the line it came from. Grepping a
 * whole log line finds that one line and nothing else — the same line rarely
 * repeats — while the fragment someone bothered to select (a port, a request
 * id, an exception name) is exactly the thing they want every occurrence of.
 */
export function grepTermFor(rawSelection: string): string | null {
  const picked = rawSelection.trim();
  if (!picked) return null;

  // A selection spanning lines cannot match any single line, so take its first
  // non-empty one rather than searching for something guaranteed to miss.
  const term = picked.includes('\n')
    ? (picked.split('\n').map(l => l.trim()).find(Boolean) ?? '')
    : picked;

  if (!term) return null;
  // Long enough for a stack frame, short enough not to paste an essay into the
  // filter box.
  return term.slice(0, 120);
}
