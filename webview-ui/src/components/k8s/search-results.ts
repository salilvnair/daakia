/**
 * Search results, as lines a log view can draw.
 *
 * ── Why this exists ──
 *
 * The results modal shows a few hits per pod in a box you scroll inside a
 * dialog. That is the right shape for "did it find anything"; it is the wrong
 * one for the thing people actually do next, which is read. A search across
 * twenty pods is a log — it has levels, stack traces, threads and MDC, and it
 * wants the view that already knows how to show those.
 *
 * So a result set is turned into `LogLine`s here, and everything downstream is
 * the log view's own machinery: `filterLines`, `foldStackTraces`, `buildFacets`
 * and the same row markup. Nothing about levels, frames or fields is
 * reimplemented — this is a translation, and the only file that knows both
 * shapes.
 *
 * ── The one collision worth naming ──
 *
 * `SearchMatch.context` is a CLUSTER — `kind-dk8s-prod`. `LogLine.context` is
 * a boolean meaning "kept for what it sits next to". They are different things
 * with one name, and mixing them up silently marks every hit as context and
 * greys out the entire result. The cluster travels as `cluster` here.
 */
import type { LogLevel } from '../../store/k8s-store';
import type { SearchMatch, PodGroup, LineParse } from '../../store/dk8s-search-store';
import type { MatchedLine } from './log-view';

/**
 * A line in the results, with where it came from kept alongside it.
 *
 * Extends `MatchedLine` rather than `LogLine` so `hits` and `context` are the
 * log view's own fields and not a parallel pair with the same meaning.
 * `filterLines` spreads what it is given, so these extras survive a pass
 * through it and the rows still know which pod they came from.
 */
export interface ResultLine extends MatchedLine {
  /** Which pod said it. Every line has one; the view groups and filters on it. */
  pod: string;
  namespace: string;
  /** The cluster, under a name that cannot be confused with `context`. */
  cluster: string;
  /** `live` for a running pod's output, `archive` for a file on a volume. */
  source: 'live' | 'archive';
  /** The archived file this came from, where it came from one. */
  file?: string;
  rel?: string;
  /** The line's number in the pod's own log, which is not its number here. */
  sourceLine: number;
}

/**
 * Flatten a search's groups into one readable stream.
 *
 * Ordered by pod and then by line, never by relevance. A log read out of order
 * is not a log — and the ordering a reader is checking against is the one in
 * the pod, which is what `sourceLine` preserves.
 *
 * `seq` is assigned here and is the position in THIS view. It has to be unique
 * across pods, because everything downstream — selection, folding, the
 * expanded set — keys on it, and two pods both starting at line 1 is the
 * ordinary case rather than the exception.
 */
export function resultLines(groups: PodGroup[]): ResultLine[] {
  const out: ResultLine[] = [];
  let seq = 0;

  const push = (
    g: PodGroup, m: SearchMatch, text: string, isContext: boolean,
    hits?: [number, number][], lineNo?: number, parse?: LineParse | null,
  ) => {
    const shown = shownFor(text, hits, parse);
    out.push({
      /* The thread, logger and MDC the pod's format read — the same fields the Logs tab gives the line. */
      ...(parse ?? {}),
      message: shown.message,
      seq: seq++,
      ts: isContext ? undefined : m.ts,
      level: m.level,
      text,
      hits: shown.hits,
      context: isContext || undefined,
      pod: m.pod,
      namespace: m.namespace,
      cluster: m.context,
      source: g.source ?? 'live',
      file: (m as SearchMatch & { file?: string }).file,
      rel: (m as SearchMatch & { rel?: string }).rel,
      sourceLine: lineNo ?? m.line,
    });
  };

  for (const g of groups) {
    for (const m of g.matches) {
      /*
        Context first, then the hit, then the rest — the order they were in.

        The lines before a hit are numbered backwards from it so the gutter
        stays honest: a frame three above the match is `line - 3`, and a reader
        comparing this against `kubectl logs` has to find the same numbers.
      */
      m.before.forEach((t, i) => push(g, m, t, true, undefined, m.line - (m.before.length - i), m.beforeParse?.[i]));
      push(g, m, m.text, false, m.hits, undefined, m.parse);
      m.after.forEach((t, i) => push(g, m, t, true, undefined, m.line + i + 1, m.afterParse?.[i]));
    }
  }

  return out;
}

/**
 * What a row shows, and where its highlights fall on it.
 *
 * The host's hits are offsets into the raw line; a row with a parsed message
 * shows the message. Each hit is found again in the message, in order. A hit
 * that is only in the stripped prefix — a search for the thread name — cannot
 * be highlighted in the message, so that row shows the raw line instead: the
 * highlight is what says why the line is here.
 */
export function shownFor(
  text: string, hits: [number, number][] | undefined, parse: LineParse | null | undefined,
): { message?: string; hits?: [number, number][] } {
  const message = parse?.message;
  if (!message || !hits?.length) return { message, hits };
  const moved: [number, number][] = [];
  let from = 0;
  for (const [a, b] of hits) {
    const at = message.indexOf(text.slice(a, b), from);
    if (at < 0) return { message: undefined, hits };
    moved.push([at, at + (b - a)]);
    from = at + (b - a);
  }
  return { message, hits: moved };
}

/**
 * How the header names what was searched.
 *
 * One pod is its own name. Several is the first plus a count, because a header
 * that lists twenty pod names is not a header — and the first name is the one
 * a reader recognises, since it is what they were looking at when they
 * searched.
 */
export function podsLabel(pods: string[]): string {
  const seen = [...new Set(pods.filter(Boolean))];
  if (!seen.length) return 'no pods';
  if (seen.length === 1) return seen[0];
  return `${seen[0]}  +${seen.length - 1} other${seen.length === 2 ? '' : 's'}`;
}

/** Every pod a result set touched, in the order they were searched. */
export function podsIn(groups: PodGroup[]): string[] {
  return [...new Set(groups.map(g => g.result.pod).filter(Boolean))];
}

export interface ResultTiming {
  pod: string;
  namespace: string;
  cluster: string;
  source: 'live' | 'archive';
  matched: number;
  /** Lines read, where that is knowable. `grep` in a pod never reports it. */
  scanned: number;
  /** True when the count above is a real measurement rather than an absence. */
  scannedKnown: boolean;
  elapsedMs?: number;
  error?: string;
  /** Archive roots this pod was searched under, when it was. */
  roots?: string[];
}

/**
 * What the Overview tab reports, one row per pod.
 *
 * Built from the results rather than measured again, so the page cannot
 * disagree with itself: the number beside a pod here is the number of lines
 * under that pod in the Logs tab.
 */
export function timings(
  groups: PodGroup[],
  /** Every pod the search covered, so the ones that matched nothing appear. */
  searched: { pod: string; namespace: string }[] = [],
): ResultTiming[] {
  const rows: ResultTiming[] = groups.map((g) => {
    const r = g.result as typeof g.result & {
      inPod?: boolean; roots?: string[]; elapsedMs?: number;
    };
    return {
      pod: r.pod,
      namespace: r.namespace,
      cluster: r.context ?? '',
      source: g.source ?? 'live',
      matched: r.matched,
      scanned: r.scanned,
      /* `grep` inside a pod says what matched and never how much it read, so a
         0 here is an absence rather than a measurement. Printing it as "0
         lines scanned" would be reporting a number nobody took. */
      scannedKnown: !r.inPod,
      elapsedMs: r.elapsedMs,
      error: r.error,
      roots: r.roots,
    };
  });

  /*
    A pod that was searched and matched nothing still gets a row.

    It is the row somebody looks for when they expected a hit in that pod, and
    leaving it out turns "there was nothing there" into "was it even searched?"
    — which is exactly the doubt this page exists to settle.
  */
  for (const t of searched) {
    if (rows.some(r => r.pod === t.pod)) continue;
    rows.push({
      pod: t.pod,
      namespace: t.namespace,
      cluster: '',
      source: 'live',
      matched: 0,
      scanned: 0,
      scannedKnown: false,
      elapsedMs: undefined,
    });
  }

  return rows;
}

/**
 * Totals for the header, counted once so every tab quotes the same figure.
 *
 * `pods` is how many were SEARCHED, not how many are in `groups`. A pod that
 * matched nothing never reaches `groups`, so counting them there produced
 * "2 matches in 2 of 2 pods" for a search across three — which reads as a
 * complete hit rate and hides the pod somebody is actually asking about.
 */
export function totals(
  groups: PodGroup[],
  searched: { pod: string }[] = [],
): { matches: number; pods: number; podsWithHits: number; errors: number } {
  const names = new Set([...groups.map(g => g.result.pod), ...searched.map(s => s.pod)]);
  return {
    matches: groups.reduce((n, g) => n + g.result.matched, 0),
    pods: names.size,
    podsWithHits: new Set(
      groups.filter(g => g.result.matched > 0).map(g => g.result.pod),
    ).size,
    errors: groups.filter(g => g.result.error).length,
  };
}

/** Levels present in a result set, for the chips above the list. */
export function levelsIn(lines: ResultLine[]): Record<LogLevel, number> {
  const out = { error: 0, warn: 0, info: 0, debug: 0, other: 0 } as Record<LogLevel, number>;
  for (const l of lines) {
    /* Context lines are not events of their own — counting them would say a
       search for one ERROR found nine, because it kept eight neighbours. */
    if (l.context) continue;
    out[l.level] = (out[l.level] ?? 0) + 1;
  }
  return out;
}

/**
 * The search term as the page's filter box has to say it.
 *
 * The box treats `/…/` as a regex and anything else as a case-blind
 * substring. A regex search (`timeout|refused`) went in bare and matched
 * nothing — the page opened on "No line matches" over the very hits it was
 * showing — and a case-sensitive search quietly became case-blind.
 */
export function searchFilterOf(query: string, regex: boolean, caseSensitive: boolean): string {
  if (!query) return '';
  if (regex) return `/${query}/${caseSensitive ? '' : 'i'}`;
  if (caseSensitive) return `/${query.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}/`;
  return query;
}

/**
 * Where a result's lines came from — the running pod's log, archived files on
 * a volume, or both — said once in the header. A hit in last week's rotated
 * file reads like one from a minute ago unless something says otherwise.
 */
export function sourceSummary(lines: Pick<ResultLine, 'source' | 'file' | 'rel'>[]): { live: boolean; files: number; label: string } {
  let live = false;
  const files = new Set<string>();
  for (const l of lines) {
    if (l.source === 'archive') files.add(l.rel ?? l.file ?? '');
    else live = true;
  }
  const n = files.size;
  const archive = n ? `archive · ${n} file${n === 1 ? '' : 's'}` : '';
  return { live, files: n, label: live && n ? `live + ${archive}` : n ? archive : 'live log' };
}

/** Where a line sits in its own source: one pod's live log, or one archived file. */
export function sourceKey(l: Pick<ResultLine, 'pod' | 'source' | 'file' | 'rel'>, line: number): string {
  return `${l.pod}\u0000${l.source}\u0000${l.rel ?? l.file ?? ''}\u0000${line}`;
}
