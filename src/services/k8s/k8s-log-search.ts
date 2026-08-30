/**
 * Search many pods' logs at once.
 *
 * The whole design is about what NEVER happens:
 *
 *   - No log is ever held in full. Lines are matched as they stream off
 *     kubectl and dropped immediately if they do not match. Ten pods with
 *     50,000 lines each is 100MB of text; this holds a few kilobytes.
 *   - No log ever crosses the bridge to the webview. Only matches do, and only
 *     up to a cap. Posting a million lines into a webview to filter them there
 *     locks the tab solid, and that is exactly what the naive version of this
 *     feature does.
 *   - No unbounded fan-out. Twenty selected pods do not become twenty
 *     simultaneous kubectl processes against one API server.
 *
 * What the user sees is "select pods, type a string, get hits grouped by pod".
 * What makes that feel instant is that results stream back per pod as each one
 * finishes, rather than after all of them do.
 */
import type { ChildProcess } from 'child_process';
import { spawnKubectl } from './kubectl';
import { levelOf, parseLine, isContinuation, hasAppTimestamp, type LogLevel } from './k8s-log-stream';

export interface SearchTarget {
  context: string;
  namespace: string;
  pod: string;
  containers?: string[];
  /**
   * The owning workload's name, for resolving `{app}` against an archive.
   * Unused by the live search — kubectl needs only the pod.
   */
  workload?: string;
}

export interface SearchOptions {
  query: string;
  /** Treat the query as a regular expression rather than a substring. */
  regex: boolean;
  caseSensitive: boolean;
  /** Lines of context either side of a hit. */
  contextLines: number;
  /** How much of each pod's log to scan. */
  tailLines: number;
  sinceSeconds?: number;
  /** Also scan the previous container — where a crashlooper's failure is. */
  includePrevious: boolean;
  /** Stop storing matches for a pod past this many. Counting continues. */
  maxMatchesPerPod: number;
  /** Stop the whole search past this many stored matches. */
  maxMatchesTotal: number;
}

export interface SearchMatch {
  pod: string;
  namespace: string;
  context: string;
  /** 1-based line number within the scanned window. */
  line: number;
  ts?: number;
  level: LogLevel;
  text: string;
  /** Character ranges of the hit, for highlighting. */
  hits: [number, number][];
  before: string[];
  after: string[];
}

export interface PodSearchResult {
  pod: string;
  namespace: string;
  context: string;
  scanned: number;
  matched: number;
  /** True when more matched than were kept. */
  capped: boolean;
  elapsedMs: number;
  error?: string;
}

export interface SearchCallbacks {
  /** Fired per pod as it completes, so results appear progressively. */
  onPodDone: (result: PodSearchResult, matches: SearchMatch[]) => void;
  onProgress: (done: number, total: number, pod: string) => void;
  onFinished: (summary: { pods: number; matched: number; scanned: number; stopped: boolean }) => void;
}

export interface SearchHandle {
  cancel: () => void;
}

/**
 * How many pods to read at once.
 *
 * Every one of these is a streaming request against the API server, and the
 * API server is shared with everything else running in the cluster. Four is
 * fast enough that a dozen pods feel immediate and low enough that nobody
 * notices dk8s in their apiserver metrics.
 */
const CONCURRENCY = 4;

export const DEFAULT_SEARCH: SearchOptions = {
  query: '',
  regex: false,
  caseSensitive: false,
  contextLines: 2,
  tailLines: 5000,
  includePrevious: false,
  maxMatchesPerPod: 200,
  maxMatchesTotal: 2000,
};

// ── Matching ────────────────────────────────────────────────────────────────

export type Matcher = (text: string) => [number, number][] | null;

/**
 * Build the line matcher once, not per line.
 *
 * A regex compiled inside the loop is the single easiest way to make this
 * feature slow — at 500,000 lines it is half a million compilations.
 */
export function buildSearchMatcher(opts: Pick<SearchOptions, 'query' | 'regex' | 'caseSensitive'>): Matcher | null {
  const q = opts.query;
  if (!q) return null;

  if (opts.regex) {
    let re: RegExp;
    try {
      re = new RegExp(q, opts.caseSensitive ? 'g' : 'gi');
    } catch {
      // An invalid pattern falls back to a literal search rather than failing
      // the whole run — someone mid-typing should get fewer results, not an error.
      return literalMatcher(q, opts.caseSensitive);
    }
    return (text: string) => {
      re.lastIndex = 0;
      const hits: [number, number][] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        hits.push([m.index, m.index + m[0].length]);
        // A zero-width match would spin here forever.
        if (m.index === re.lastIndex) re.lastIndex++;
        if (hits.length >= 50) break;
      }
      return hits.length ? hits : null;
    };
  }

  return literalMatcher(q, opts.caseSensitive);
}

function literalMatcher(q: string, caseSensitive: boolean): Matcher {
  const needle = caseSensitive ? q : q.toLowerCase();
  return (text: string) => {
    const hay = caseSensitive ? text : text.toLowerCase();
    // indexOf on a lowered copy is far cheaper than a case-insensitive regex,
    // and this runs once per line across every pod.
    let at = hay.indexOf(needle);
    if (at === -1) return null;
    const hits: [number, number][] = [];
    while (at !== -1 && hits.length < 50) {
      hits.push([at, at + needle.length]);
      at = hay.indexOf(needle, at + needle.length);
    }
    return hits;
  };
}

// ── One pod ─────────────────────────────────────────────────────────────────

/**
 * A fixed-size window of the lines just seen.
 *
 * Context lines are the reason a search result is readable at all, and this is
 * the only thing that has to be remembered while scanning. Two lines of
 * context costs two strings, not a copy of the log.
 */
class Ring {
  private buf: string[] = [];
  constructor(private size: number) {}
  push(line: string): void {
    if (this.size === 0) return;
    this.buf.push(line);
    if (this.buf.length > this.size) this.buf.shift();
  }
  snapshot(): string[] {
    return this.buf.slice();
  }
}

function searchArgs(t: SearchTarget, opts: SearchOptions, previous: boolean): string[] {
  return [
    '--context', t.context, '-n', t.namespace, 'logs', t.pod,
    ...(t.containers && t.containers.length > 1 ? ['--all-containers=true', '--prefix'] : []),
    ...(previous ? ['--previous'] : []),
    '--timestamps',
    ...(opts.sinceSeconds ? [`--since=${opts.sinceSeconds}s`] : []),
    `--tail=${opts.tailLines}`,
  ];
}

interface PodScan {
  result: PodSearchResult;
  matches: SearchMatch[];
}

async function searchOnePod(
  t: SearchTarget,
  opts: SearchOptions,
  match: Matcher,
  budget: { remaining: number },
  signal: { cancelled: boolean },
  previous = false,
): Promise<PodScan> {
  const started = Date.now();
  const result: PodSearchResult = {
    pod: t.pod, namespace: t.namespace, context: t.context,
    scanned: 0, matched: 0, capped: false, elapsedMs: 0,
  };
  const matches: SearchMatch[] = [];

  let child: ChildProcess;
  try {
    child = await spawnKubectl(searchArgs(t, opts, previous));
  } catch (err) {
    result.error = (err as Error).message;
    result.elapsedMs = Date.now() - started;
    return { result, matches };
  }

  const before = new Ring(opts.contextLines);
  // Matches still waiting for their trailing context.
  let awaitingAfter: SearchMatch[] = [];
  let carry = '';
  let lineNo = 0;

  const handleLine = (raw: string) => {
    lineNo++;
    result.scanned++;
    const parsed = parseLine(raw, lineNo, true);

    // Fill in trailing context for earlier hits before considering this line.
    if (awaitingAfter.length) {
      awaitingAfter = awaitingAfter.filter(m => {
        m.after.push(parsed.text);
        return m.after.length < opts.contextLines;
      });
    }

    const hits = match(parsed.text);
    if (hits) {
      result.matched++;
      if (matches.length < opts.maxMatchesPerPod && budget.remaining > 0) {
        const m: SearchMatch = {
          pod: t.pod, namespace: t.namespace, context: t.context,
          line: lineNo, ts: parsed.ts, level: parsed.level, text: parsed.text,
          hits, before: before.snapshot(), after: [],
        };
        matches.push(m);
        budget.remaining--;
        if (opts.contextLines > 0) awaitingAfter.push(m);
      } else {
        // Still counted, no longer stored. The count is what makes "4,812
        // matches in this pod" an honest answer instead of "200".
        result.capped = true;
      }
    }

    before.push(parsed.text);
  };

  await new Promise<void>((resolve) => {
    const finish = () => resolve();

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      if (signal.cancelled) { child.kill(); return; }
      const parts = (carry + chunk).split('\n');
      carry = parts.pop() ?? '';
      for (const raw of parts) {
        if (raw) handleLine(raw);
      }
    });

    let stderrTail = '';
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (d: string) => { stderrTail = (stderrTail + d).slice(-400); });

    child.on('error', (err) => { result.error = err.message; finish(); });
    child.on('exit', (code) => {
      if (carry) handleLine(carry);
      if (code !== 0 && !signal.cancelled) {
        const first = stderrTail.split('\n').map(l => l.trim()).filter(Boolean)[0];
        // A pod that has never restarted has no previous container; that is a
        // fact about the pod, not a failure of the search.
        if (!(previous && /previous terminated container|not found/i.test(first ?? ''))) {
          result.error = first || `kubectl exited ${code}`;
        }
      }
      finish();
    });
  });

  result.elapsedMs = Date.now() - started;
  return { result, matches };
}

// ── The run ─────────────────────────────────────────────────────────────────

export function searchLogs(
  targets: SearchTarget[],
  opts: SearchOptions,
  cb: SearchCallbacks,
): SearchHandle {
  const match = buildSearchMatcher(opts);
  const signal = { cancelled: false };
  const budget = { remaining: opts.maxMatchesTotal };

  if (!match) {
    cb.onFinished({ pods: 0, matched: 0, scanned: 0, stopped: false });
    return { cancel: () => {} };
  }

  void (async () => {
    let done = 0;
    let totalMatched = 0;
    let totalScanned = 0;

    // A simple worker pool. Promise.all over every target would open one
    // kubectl per pod at once, which is exactly the thundering herd this
    // avoids.
    const queue = [...targets];
    const worker = async () => {
      for (;;) {
        if (signal.cancelled) return;
        const t = queue.shift();
        if (!t) return;

        cb.onProgress(done, targets.length, t.pod);
        const scan = await searchOnePod(t, opts, match, budget, signal);

        if (opts.includePrevious) {
          const prev = await searchOnePod(t, opts, match, budget, signal, true);
          if (!prev.result.error && prev.result.scanned > 0) {
            scan.result.scanned += prev.result.scanned;
            scan.result.matched += prev.result.matched;
            scan.result.capped = scan.result.capped || prev.result.capped;
            // Marked so a hit from a dead container is never mistaken for one
            // from the running process.
            for (const m of prev.matches) m.text = `[previous] ${m.text}`;
            scan.matches.push(...prev.matches);
          }
        }

        done++;
        totalMatched += scan.result.matched;
        totalScanned += scan.result.scanned;
        // Per pod, not at the end: a dozen pods should fill in one by one
        // rather than sit blank and then appear all at once.
        cb.onPodDone(scan.result, scan.matches);
        cb.onProgress(done, targets.length, t.pod);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker),
    );

    cb.onFinished({
      pods: done,
      matched: totalMatched,
      scanned: totalScanned,
      stopped: signal.cancelled,
    });
  })();

  return { cancel: () => { signal.cancelled = true; } };
}

/** Re-export so the handler does not need two imports for one concept. */
export { levelOf, isContinuation, hasAppTimestamp };
