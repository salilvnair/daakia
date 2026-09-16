/**
 * The archive half of a search, run where the archive actually is.
 *
 * ── Why this replaces the `fs` walk ──
 *
 * `pv-search` reads archived logs with `createReadStream`, which needs the
 * volume mounted on this machine. That is the rare case. The usual one is a
 * PersistentVolumeClaim that exists only inside the cluster: asked to search
 * `/prodapp-prod-pvc/prodapp_prod_logs` it resolved the path against the local
 * filesystem, found `C:\prodapp-prod-pvc\…`, and reported no matches — which
 * is indistinguishable from an archive that holds nothing.
 *
 * So the search goes to the pod. One `grep -rn` inside the container walks and
 * matches in a single pass on the node, and only the lines that matched come
 * back over the wire. For a gigabyte of rotated logs that is the difference
 * between a search and a download.
 *
 * ── What this cannot do, and says so ──
 *
 * `grep` reports what matched, never how much it read. A line count would have
 * to be bought with a second pass over every byte, which is the cost this whole
 * approach exists to avoid — so `scanned` stays 0, `inPod` is set, and the
 * result list says so where it would otherwise print a number it does not
 * have. A measurement nobody took is worse than no measurement.
 *
 * The time window is applied here rather than in the shell, because `grep`
 * cannot read a timestamp. A window narrower than the archive therefore still
 * transfers every textual match before discarding what falls outside it —
 * worth knowing when the term is common and the window is small.
 */
import {
  buildSearchMatcher, levelOf, isContinuation, hasAppTimestamp,
  type SearchOptions,
} from './k8s-log-search';
import type { LogLevel } from './k8s-log-stream';
import { parseLogTime } from './log-time';
import { mountsOf, mountApplies, type PvLogConfig, type PodRef } from './pv-logs';
import { cleanPath, searchInPod, type PvMatch as GrepLine } from './pv-in-pod';
import type { PvPodResult, PvFileResult, PvMatch } from './pv-search';

/** The lower edge of the window, however it was asked for. */
export function cutoffFor(opts: SearchOptions): number | undefined {
  if (opts.fromMs !== undefined) return opts.fromMs;
  return opts.sinceSeconds && opts.sinceSeconds > 0
    ? Date.now() - opts.sinceSeconds * 1000
    : undefined;
}

/** Which configured roots are worth asking this pod about. */
export function rootsFor(cfg: PvLogConfig, ref: PodRef): string[] {
  const out: string[] = [];
  for (const m of mountsOf(cfg)) {
    if (!mountApplies(m, ref)) continue;
    const p = cleanPath(m.path);
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

/**
 * grep's output, back into lines that belong to each other.
 *
 * `grep -C` prints a hit and its neighbours as separate lines, and the only
 * thing joining them is the line number. Rebuilding `before` and `after` from
 * the numbers rather than from position means a `--` separator, two files
 * interleaved, or a context line that was itself a hit all come out right —
 * and none of those are hypothetical in an archive of rotated logs.
 */
export function groupByFile(lines: GrepLine[]): Map<string, Map<number, GrepLine>> {
  const byFile = new Map<string, Map<number, GrepLine>>();
  for (const l of lines) {
    let m = byFile.get(l.file);
    if (!m) byFile.set(l.file, (m = new Map()));
    /* A line grep printed twice — once as a hit, once as somebody else's
       context — is a hit. Keeping the weaker copy would lose the match. */
    const had = m.get(l.line);
    if (!had || (had.context && !l.context)) m.set(l.line, l);
  }
  return byFile;
}

/** The lines either side of `at` that grep actually gave us, in order. */
export function neighbours(
  file: Map<number, GrepLine>, at: number, want: number, dir: -1 | 1,
): string[] {
  const out: string[] = [];
  for (let i = 1; i <= want; i++) {
    const l = file.get(at + i * dir);
    /* Stop at the first gap rather than stepping over it: lines shown as
       consecutive have to be consecutive, and the gap is usually where the
       reason was. */
    if (!l) break;
    out.push(l.text);
  }
  return dir === -1 ? out.reverse() : out;
}

/**
 * The level of a line that arrived without its file around it.
 *
 * A live or `fs` search reads every line in order, so a stack frame inherits
 * the level of the event above it. Here only the matched lines and their
 * context came back, so the inheritance reaches exactly as far as the context
 * does — the honest limit, and better than calling every frame `other`.
 */
export function levelFor(text: string, before: string[]): LogLevel {
  const own = levelOf(text);
  if (own !== 'other') return own;

  /* Nearest line above that declared one. `before` is already in order. */
  for (let i = before.length - 1; i >= 0; i--) {
    const l = levelOf(before[i]);
    if (l !== 'other') {
      return isContinuation(text) || !hasAppTimestamp(text) ? l : 'other';
    }
  }
  return isContinuation(text) ? 'error' : 'other';
}

/**
 * Search one pod's archive, through the pod.
 *
 * Same shape in and out as `searchPvForPod`, so the two are interchangeable at
 * the call site and a hit renders through the component that already exists.
 */
export async function searchPvInPod(
  cfg: PvLogConfig, ref: PodRef, opts: SearchOptions, signal: { cancelled: boolean },
): Promise<{ result: PvPodResult; matches: PvMatch[] }> {
  const started = Date.now();
  const result: PvPodResult = {
    pod: ref.pod, namespace: ref.namespace,
    scanned: 0, matched: 0, capped: false, elapsedMs: 0, files: [],
    inPod: true, roots: [], commands: [],
  };
  const matches: PvMatch[] = [];

  const match = buildSearchMatcher(opts);
  if (!match) {
    result.elapsedMs = Date.now() - started;
    return { result, matches };
  }

  const roots = rootsFor(cfg, ref);
  /* Reported whether or not anything is found in them: an empty result and a
     wrong path look identical, and this is what separates them. */
  result.roots = roots;
  if (!roots.length) {
    result.elapsedMs = Date.now() - started;
    return { result, matches };
  }

  const cutoffMs = cutoffFor(opts);
  const untilMs = opts.toMs;
  // Configured beside the paths, because it describes the log rather than the
  // search. UTC when unset: that is what a container writes.
  const logZone = cfg.logTimeZone || 'UTC';
  const budget = { left: opts.maxMatchesPerPod };
  const errors: string[] = [];

  for (const root of roots) {
    if (signal.cancelled) break;

    const found = await searchInPod(
      {
        context: ref.context ?? '',
        namespace: ref.namespace,
        pod: ref.pod,
        container: ref.container,
      },
      root, opts.query,
      {
        contextLines: opts.contextLines,
        caseSensitive: opts.caseSensitive,
        regex: opts.regex,
        /* Room for the context lines, which grep counts against the same cap
           — otherwise a search with five lines either side comes back with a
           fraction of the matches it was asked for. */
        maxLines: opts.maxMatchesPerPod * (1 + 2 * Math.max(0, opts.contextLines)),
      },
    );

    result.commands!.push(...found.commands);
    if (found.error) { errors.push(found.error); continue; }
    if (found.capped) result.capped = true;

    for (const [file, lines] of groupByFile(found.matches)) {
      if (signal.cancelled) break;

      const hitLines = [...lines.values()]
        .filter(l => !l.context)
        .sort((a, b) => a.line - b.line);
      if (!hitLines.length) continue;

      const fileResult: PvFileResult = {
        rel: hitLines[0].rel, file,
        /* Neither is in grep's output, and neither is worth a second exec per
           file to go and find. */
        bytes: 0, mtime: 0,
        scanned: 0, matched: 0,
      };

      for (const hit of hitLines) {
        const before = neighbours(lines, hit.line, opts.contextLines, -1);

        /*
          The window, applied on the line because the shell could not.

          A line with no time of its own takes the nearest one above it, so a
          stack frame is kept or dropped with the event that printed it — and a
          format carrying no timestamp at all is never filtered away.
        */
        let ts = parseLogTime(hit.text, logZone);
        for (let i = before.length - 1; i >= 0 && ts === undefined; i--) {
          ts = parseLogTime(before[i], logZone);
        }
        const inRange = ts === undefined
          || ((cutoffMs === undefined || ts >= cutoffMs)
            && (untilMs === undefined || ts <= untilMs));
        if (!inRange) continue;

        result.matched++;
        fileResult.matched++;
        if (budget.left <= 0) continue;
        budget.left--;

        matches.push({
          source: 'archive',
          rel: hit.rel,
          file: hit.file,
          pod: ref.pod,
          namespace: ref.namespace,
          /* The context the pod was reached through. It renders the same as a
             live hit either way, but this is also the only way back INTO the
             pod — which is where the file it names actually lives. */
          context: ref.context ?? '',
          line: hit.line,
          ts,
          level: levelFor(hit.text, before),
          text: hit.text,
          /* grep already decided this line matched; this is only where, for
             the highlight. An ERE that JavaScript reads differently leaves the
             row unhighlighted rather than dropping it. */
          hits: match(hit.text) ?? [],
          before,
          after: neighbours(lines, hit.line, opts.contextLines, 1),
        });
      }

      if (fileResult.matched > 0) result.files.push(fileResult);
    }
  }

  /* Only when every root failed. One unreadable path beside a working one is
     not a failed search, and reporting it as one would hide the matches. */
  if (errors.length && !result.files.length) result.error = errors[0];
  if (result.matched > matches.length) result.capped = true;
  result.elapsedMs = Date.now() - started;
  return { result, matches };
}
