/**
 * `dk8s_search`: the logs, asked from the conversation.
 *
 * "requestDataId 4242 failed calling POST /api/v1/workflow/run with a 500 —
 * every thread, before and after." Answering that by hand is a search, then
 * opening each hit, then scrolling to find what that one thread was doing
 * either side of the failure, for every pod it touched. This is that, as one
 * call the model can make.
 *
 * ── What the model is and is not allowed to do ──
 *
 * It names a query. Daakia runs the search it already has, over the pods
 * already being watched — the model cannot widen the scope to a cluster the
 * user has not opened. The result goes back to the model as numbered lines
 * it can cite, capped, with secret-looking values masked; the card the user
 * sees is drawn from the structured result, not from the model's prose, so a
 * sentence the model invents cannot put a line on screen that is not in the
 * log.
 *
 * ── Why this does not go through `dk8s:searchLogs` ──
 *
 * The search handler keeps ONE active search, and a new one cancels the old.
 * An AI search through it would kill a search the user is running and pour
 * its hits into their results page. This calls the search engine directly,
 * with its own callbacks and its own cancellation.
 */
import type { SearchMatch, SearchOptions, SearchTarget, PodSearchResult, SearchCallbacks, SearchHandle } from '../../services/k8s/k8s-log-search';
import { searchArgs } from '../../services/k8s/k8s-log-search';
import type { PvMatch, PvPodResult } from '../../services/k8s/pv-search';
import { compileFormat, type CompiledFormat } from '../../services/k8s/log-format';
import { BUILTIN_FORMATS } from '../../services/k8s/log-format-builtins';
import type { AiToolDef } from '../ai-types';

// ── The tool, as the model sees it ─────────────────────────────────────────

export const DK8S_SEARCH_TOOL: AiToolDef = {
  id: 'dk8s_search',
  type: 'function',
  function: {
    name: 'dk8s_search',
    description:
      'Search the Kubernetes pod logs the user is watching in Daakia dk8s — live logs, and the '
      + 'archived log files on a volume when one is configured. Use it whenever the user asks '
      + 'about a request id, a logger, an endpoint, an error or a failure in their pods. '
      + 'Returns the matching lines grouped by pod and thread, with the lines before and after '
      + 'each failure on the same thread. Every line has a number [n]; cite those numbers.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What to find: an id WITH its key as the user gave it (requestDataId=4242 — '
            + 'a bare number also matches card digits, tokens and other ids), a thread, a logger name, '
            + 'an endpoint path, or a message fragment. Wrap in /slashes/ for a regular expression, e.g. '
            + '/requestDataId[=":]+4242\\b/ to catch both the log line and the JSON payload.',
        },
        failure: {
          type: 'string',
          description: 'What counts as the failure on those threads, as a regex. '
            + 'Default: ERROR, FATAL, an HTTP 5xx, "failed", or an exception.',
        },
        around: {
          type: 'integer',
          description: 'How many lines of the same thread to keep before and after each failure. '
            + 'Default 20, at most 500.',
        },
        archive: {
          type: 'boolean',
          description: 'Also search archived log files on a volume, when configured. Default true.',
        },
        pods: {
          type: 'string',
          description: 'Only pods whose name matches this glob, e.g. "zp-backend*". Default: every watched pod.',
        },
        thread: {
          type: 'string',
          description: 'Only lines written BY this thread, matched exactly — "scheduling-1" is not "scheduling-10". '
            + 'Use it (with from/to) for "what did this thread do"; "query" may then be left empty.',
        },
        from: {
          type: 'string',
          description: 'Only lines at or after this time — ISO 8601 in UTC, e.g. "2026-09-25T02:39:45Z". '
            + 'Use it with "to" for "what happened between" or "the minute before": inside a window far more '
            + 'lines come back, so a busy thread is not cut short.',
        },
        to: {
          type: 'string',
          description: 'Only lines at or before this time — ISO 8601 in UTC.',
        },
      },
      required: [],
    },
  },
};

export interface Dk8sSearchArgs {
  query: string;
  failure?: string;
  around?: number;
  archive?: boolean;
  pods?: string;
  thread?: string;
  from?: string;
  to?: string;
}

/**
 * The thread name as a whole token: not followed or preceded by a word
 * character or a hyphen, so `scheduling-1` never matches `scheduling-10`.
 * A substring search for a thread name was finding a dozen threads and filling
 * its cap with the other eleven before the window it was asked about ended.
 */
export function threadPattern(thread: string): string {
  const esc = thread.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  /* Explicit ranges rather than \w: the archive search runs this through
     grep -E, where \w inside brackets is a backslash and a "w". */
  return `(^|[^A-Za-z0-9_-])${esc}($|[^A-Za-z0-9_-])`;
}

/** An ISO time, or undefined for anything that does not read as one. */
export function parseWhen(v: string | undefined): number | undefined {
  if (!v?.trim()) return undefined;
  const ms = Date.parse(v.trim());
  return Number.isFinite(ms) ? ms : undefined;
}

// ── What comes back ────────────────────────────────────────────────────────

export type LineRole = 'before' | 'hit' | 'failure' | 'after';

export interface ResultLine {
  ts?: number;
  level: string;
  text: string;
  role: LineRole;
  /** The citation number, on hits and failures only. */
  n?: number;
  /**
   * A neighbour that reads like a failure — an ERROR, a 5xx, a timeout.
   *
   * Only ever on context. It is not a failure of THIS search: on a busy pool a
   * thread serves many requests in turn, and the line before a hit is as likely
   * to be another request's timeout as this one's. Flagged so the card can
   * tint it; never numbered, never counted, never sorted on.
   */
  alarm?: boolean;
  /** Line in the archive file, for an archive hit. */
  fileLine?: number;
  /**
   * The line read through its layout — the card draws `time LEVEL message`
   * instead of the raw line, the way the Logs tab does. Absent for a line no
   * known layout reads; the card then shows `text` as it is.
   */
  msg?: string;
  logger?: string;
  /** Stack frames and continuations that belong to this line, folded under it. */
  frames?: string[];
  /**
   * `text` with credentials masked, when masking changed it — what the card
   * shows for a line no layout reads. `text` itself stays raw: Open in dk8s
   * finds the line in the pod's buffer by it.
   */
  masked?: string;
}

export interface ThreadGroup {
  pod: string;
  namespace: string;
  context: string;
  thread?: string;
  source: 'live' | 'archive';
  /** Absolute path inside the pod, for an archive hit. */
  file?: string;
  /** The deployment (or other owner) the pod belonged to — how its replacement is found after a rollout. */
  workload?: string;
  failures: number;
  lines: ResultLine[];
}

export interface Dk8sSearchResult {
  query: string;
  around: number;
  groups: ThreadGroup[];
  /** `archiveFiles`: the rotated files that held a hit, across every pod. */
  scanned: { pods: number; lines: number; archivePods: number; archiveFiles?: number };
  /** Pods that could not be read, and why — said, not dropped. */
  errors: { pod: string; error: string }[];
  truncated: boolean;
  elapsedMs: number;
  /** The time window searched, when one was asked for (ISO, UTC). */
  window?: { from?: string; to?: string };
  /**
   * What actually ran against the cluster, per pod, in the order it ran.
   *
   * The card shows these under "What ran on the cluster" so an answer can be
   * reproduced by hand and argued with — the commands are the ones executed,
   * built by the same functions that executed them, not a paraphrase.
   */
  runs?: Dk8sRun[];
  /** Wall time of each half; the archive is 0 when it was not searched. */
  liveMs?: number;
  archiveMs?: number;
}

export interface Dk8sRun {
  kind: 'live' | 'archive';
  pod: string;
  command: string;
  matched: number;
  elapsedMs: number;
  error?: string;
}

// ── Reading a line ─────────────────────────────────────────────────────────

let compiled: CompiledFormat[] | undefined;

/** The thread a line names, if any known layout can find one. Never guessed. */
export function threadOf(text: string): string | undefined {
  compiled ??= BUILTIN_FORMATS.map(f => compileFormat(f));
  for (const format of compiled) {
    const parsed = format.parse(text);
    if (parsed?.thread) return parsed.thread;
  }
  return undefined;
}

/** The line read through the first known layout that reads it. */
export function readLine(text: string): { ts?: number; message: string; logger?: string } | undefined {
  compiled ??= BUILTIN_FORMATS.map(f => compileFormat(f));
  for (const format of compiled) {
    const parsed = format.parse(text);
    if (parsed && (parsed.thread || parsed.logger || parsed.ts)) {
      return { ts: parsed.ts, message: parsed.message, logger: parsed.logger };
    }
  }
  return undefined;
}

/**
 * Fold continuations into the line they belong to, and read each line.
 *
 * Done once, on the host, so the card and the model see the same structure:
 * a failure with thirty frames is one line with thirty frames, not thirty-one
 * lines that push its neighbours off the card.
 */
export function foldAndRead(lines: ResultLine[]): ResultLine[] {
  const out: ResultLine[] = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    if (prev && isContinuation(line.text)) {
      (prev.frames ??= []).push(maskForModel(line.text.replace(/^\s+/, '')));
      continue;
    }
    /* What the card draws is masked like what the model reads: a token in a
       payload line is no less a secret for being on screen. */
    const read = readLine(line.text);
    const masked = maskForModel(line.text);
    out.push(read ? {
      ...line, ts: line.ts ?? read.ts, msg: maskForModel(read.message.trim()),
      ...(read.logger ? { logger: read.logger } : {}),
    } : { ...line, ...(masked !== line.text ? { masked } : {}) });
  }
  return out;
}

/** A stack frame or a continuation: it belongs to the line above it. */
function isContinuation(text: string): boolean {
  return /^\s+at\s|^\s*\.\.\.\s+\d+\s+(more|common frames omitted)|^\t/.test(text);
}

const DEFAULT_FAILURE = /\bERROR\b|\bFATAL\b| -> 5\d\d\b|\bfailed\b|Exception\b/i;

export function failureMatcher(spec?: string): RegExp {
  if (!spec?.trim()) return DEFAULT_FAILURE;
  try {
    return new RegExp(spec, 'i');
  } catch {
    /* A model's regex that does not compile is still a list of words. */
    const words = spec.split('|').map(w => w.trim()).filter(Boolean)
      .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return words.length ? new RegExp(words.join('|'), 'i') : DEFAULT_FAILURE;
  }
}

/**
 * Values that must not leave the machine.
 *
 * The same rule the payload card follows, at the level of text: a key that
 * looks like a credential keeps its name and loses its value. What the USER
 * sees in the card is unmasked — it is their log on their screen; only what
 * is sent to the model is masked.
 */
const SECRET = /((?:"|')?(?:token|password|passwd|secret|authorization|api[_-]?key|cookie)(?:"|')?\s*[:=]\s*(?:"|')?(?:Bearer\s+)?)([^\s"',}]+)/gi;

export function maskForModel(text: string): string {
  return text.replace(SECRET, '$1••••••');
}

// ── Grouping ───────────────────────────────────────────────────────────────

type AnyMatch = SearchMatch | PvMatch;

function isArchive(m: AnyMatch): m is PvMatch {
  return (m as PvMatch).source === 'archive';
}

/**
 * Hits grouped by pod and thread, each with the thread's own lines around it.
 *
 * The search hands back neighbours from the whole log — every thread,
 * interleaved — so a match's "before" on a busy pod is mostly other requests.
 * The neighbours are filtered to the hit's own thread (and the stack frames
 * that belong to its lines), which is the question: what was THIS thread
 * doing before and after.
 */
export function groupByThread(
  matches: AnyMatch[],
  opts: { around: number; failure: RegExp; maxGroups?: number },
): { groups: ThreadGroup[]; truncated: boolean } {
  const byKey = new Map<string, { group: ThreadGroup; seen: Set<string> }>();
  const maxGroups = opts.maxGroups ?? 12;
  let truncated = false;

  for (const m of matches) {
    const thread = threadOf(m.text);
    const source = isArchive(m) ? 'archive' : 'live';
    const file = isArchive(m) ? m.file : undefined;
    const key = [m.context, m.namespace, m.pod, source, file ?? '', thread ?? '?'].join('\u0000');

    let entry = byKey.get(key);
    if (!entry) {
      if (byKey.size >= maxGroups) { truncated = true; continue; }
      entry = {
        group: {
          pod: m.pod, namespace: m.namespace, context: m.context,
          thread, source, file, failures: 0, lines: [],
        },
        seen: new Set(),
      };
      byKey.set(key, entry);
    }

    const add = (line: ResultLine) => {
      const id = `${line.ts ?? ''}\u0000${line.text}`;
      if (entry!.seen.has(id)) {
        /* A line that arrived as context and then as a hit is the hit. */
        const existing = entry!.group.lines.find(l => `${l.ts ?? ''}\u0000${l.text}` === id);
        if (existing && (line.role === 'hit' || line.role === 'failure') && existing.role !== 'failure') {
          existing.role = line.role;
          delete existing.alarm;
          existing.fileLine = line.fileLine ?? existing.fileLine;
        }
        return;
      }
      entry!.seen.add(id);
      entry!.group.lines.push(line);
    };

    const sameThread = (lines: string[], take: number, fromEnd: boolean): string[] => {
      const kept: string[] = [];
      const ordered = fromEnd ? [...lines].reverse() : lines;
      /* Frames follow their line, so when walking backwards a frame is only
         known to be ours once the line above it is — held until then. */
      let pendingFrames: string[] = [];
      let lastWasOurs = false;
      for (const text of ordered) {
        if (kept.length >= take) break;
        if (isContinuation(text)) {
          if (fromEnd) pendingFrames.push(text);
          else if (lastWasOurs) kept.push(text);
          continue;
        }
        const ours = thread !== undefined && threadOf(text) === thread;
        if (ours) {
          if (fromEnd) { kept.push(...pendingFrames); }
          kept.push(text);
        }
        pendingFrames = [];
        lastWasOurs = ours;
      }
      return fromEnd ? kept.reverse() : kept;
    };

    for (const text of sameThread(m.before, opts.around, true)) {
      add({ level: levelOfText(text), text, role: 'before', ...(opts.failure.test(text) ? { alarm: true } : {}) });
    }
    const hitIsFailure = opts.failure.test(m.text) || m.level === 'error';
    add({
      ts: m.ts, level: m.level, text: m.text,
      role: hitIsFailure ? 'failure' : 'hit',
      fileLine: isArchive(m) ? m.line : undefined,
    });
    for (const text of sameThread(m.after, opts.around, false)) {
      add({ level: levelOfText(text), text, role: 'after', ...(opts.failure.test(text) ? { alarm: true } : {}) });
    }
  }

  const groups = [...byKey.values()].map(e => e.group);
  for (const g of groups) g.lines = foldAndRead(g.lines);
  for (const g of groups) g.failures = g.lines.filter(l => l.role === 'failure').length;

  /* Failures first, then the busiest: the group a reader opens first is the
     one that answers "what went wrong". */
  groups.sort((a, b) => (b.failures - a.failures) || (b.lines.length - a.lines.length));

  /* Citations are numbered in reading order, across every group, so [3] means
     the same line in the answer and on the card. */
  let n = 1;
  for (const g of groups) {
    for (const line of g.lines) {
      if (line.role === 'hit' || line.role === 'failure') line.n = n++;
    }
  }
  return { groups, truncated };
}

function levelOfText(text: string): string {
  const m = /\b(ERROR|WARN|INFO|DEBUG|TRACE|FATAL)\b/.exec(text);
  return m ? m[1].toLowerCase() : 'other';
}

// ── What the model reads ───────────────────────────────────────────────────

/**
 * The result as text the model can cite, and nothing it should not see.
 *
 * Capped: a model does not need four hundred lines to explain a failure, and
 * every line is paid for twice — once to send, once in the answer's latency.
 * Numbered lines are always included; context fills what room is left.
 */
export function toModelText(result: Dk8sSearchResult, maxLines = result.window ? 400 : 160): string {
  const out: string[] = [];
  out.push(`dk8s_search for ${JSON.stringify(result.query)} — `
    + `${result.groups.length} thread group(s), `
    + `${result.scanned.pods} pod(s) searched live`
    + (result.scanned.archivePods ? `, ${result.scanned.archivePods} pod archive(s)` : '')
    + (result.window ? `, window ${result.window.from ?? 'start'} → ${result.window.to ?? 'now'}` : '')
    + `, ${result.elapsedMs}ms.`);

  if (!result.groups.length) {
    out.push('NO LINE MATCHED. Say so plainly. Do not guess a cause for a failure that was not found.');
  }
  for (const e of result.errors) out.push(`(could not read ${e.pod}: ${e.error})`);

  let budget = maxLines;
  for (const g of result.groups) {
    if (budget <= 0) { out.push('(more groups omitted)'); break; }
    out.push('');
    out.push(`## pod ${g.pod} · thread ${g.thread ?? 'unknown'} · ${g.source}${g.file ? ` · ${g.file}` : ''}`);
    for (const line of g.lines) {
      const cited = line.n !== undefined;
      if (!cited && budget <= 8) continue;
      const time = line.ts !== undefined ? new Date(line.ts).toISOString() : '';
      const tag = cited ? `[${line.n}]` : '   ';
      out.push(`${tag} ${line.role.padEnd(7)} ${time} ${maskForModel(line.text).slice(0, 400)}`);
      budget--;
      /* The top of a trace names the cause; the rest is framework. */
      if (line.frames?.length && cited) {
        for (const f of line.frames.slice(0, 4)) out.push(`        ${maskForModel(f).slice(0, 200)}`);
        if (line.frames.length > 4) out.push(`        (${line.frames.length - 4} more frames)`);
        budget -= Math.min(5, line.frames.length);
      }
    }
  }
  if (result.truncated) out.push('(more threads matched than are shown)');
  out.push('');
  out.push('Answer from these lines only, and cite them as [n].');
  return out.join('\n');
}

// ── Running it ─────────────────────────────────────────────────────────────

export interface Dk8sSearchDeps {
  targets: SearchTarget[];
  searchLogs: (targets: SearchTarget[], opts: SearchOptions, cb: SearchCallbacks) => SearchHandle;
  /** The archive, when one is configured. Absent means live only. */
  searchArchive?: (target: SearchTarget, opts: SearchOptions, signal: { cancelled: boolean })
    => Promise<{ result: PvPodResult; matches: PvMatch[] }>;
  timeoutMs?: number;
  /** Each half as it starts and ends, so the conversation can show where it is. */
  onPhase?: (p: Dk8sPhase) => void;
}

export interface Dk8sPhase {
  phase: 'live' | 'archive';
  state: 'running' | 'done';
  pods: number;
  hits: number;
  ms: number;
  /** The archive half, pod by pod: which one it is reading, and where. */
  pod?: string;
  podIndex?: number;
  roots?: string[];
  /** Files that held a hit so far. */
  files?: number;
}

function podGlob(glob: string | undefined): (pod: string) => boolean {
  if (!glob?.trim()) return () => true;
  const re = new RegExp('^' + glob.trim().split('*').map(p => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i');
  return pod => re.test(pod);
}

export async function runDk8sSearch(args: Dk8sSearchArgs, deps: Dk8sSearchDeps): Promise<Dk8sSearchResult> {
  const started = Date.now();
  const around = Math.max(1, Math.min(500, Math.round(args.around ?? 20)));
  const thread = args.thread?.trim() || undefined;
  /* A thread with no query searches for the thread itself, as a whole token. */
  const query = (args.query ?? '').trim() || (thread ? `/${threadPattern(thread)}/` : '');
  const asRegex = /^\/(.+)\/$/.exec(query);

  const targets = deps.targets.filter(t => podGlob(args.pods)(t.pod));
  const empty: Dk8sSearchResult = {
    query, around, groups: [], errors: [], truncated: false,
    scanned: { pods: 0, lines: 0, archivePods: 0 }, elapsedMs: 0,
  };
  if (!query || !targets.length) return { ...empty, elapsedMs: Date.now() - started };

  /*
    Neighbours are fetched wider than `around`, because they come from every
    thread and only this thread's are kept. Eight times over is enough on a
    busy pod; 500 is the ceiling because every match carries its neighbours.
  */
  /*
    A window asks a different question: not "the latest hits" but "everything
    in these minutes". Its caps are higher — a thread writes a line every few
    hundred milliseconds, and forty matches ended a one-minute window half a
    minute early — and the live read is not limited to the newest lines,
    because the window may be older than they are.
  */
  const fromMs = parseWhen(args.from);
  const toMs = parseWhen(args.to);
  const windowed = fromMs !== undefined || toMs !== undefined;
  const opts: SearchOptions = {
    query: asRegex ? asRegex[1] : query,
    regex: !!asRegex,
    caseSensitive: false,
    /* A thread-only search has no neighbours to find: every hit IS the thread's line. */
    contextLines: thread && !(args.query ?? '').trim() ? 0 : Math.min(500, around * 8),
    tailLines: windowed ? 500_000 : 20000,
    includePrevious: false,
    maxMatchesPerPod: windowed ? 500 : 40,
    maxMatchesTotal: windowed ? 800 : 120,
    ...(fromMs !== undefined ? { fromMs } : {}),
    ...(toMs !== undefined ? { toMs } : {}),
  };

  const matches: (SearchMatch | PvMatch)[] = [];
  const errors: { pod: string; error: string }[] = [];
  const runs: Dk8sRun[] = [];
  const byPod = new Map(targets.map(t => [t.pod, t]));
  let scannedLines = 0;
  let archivePods = 0;
  let archiveFiles = 0;

  const signal = { cancelled: false };
  const timeout = deps.timeoutMs ?? 60_000;
  deps.onPhase?.({ phase: 'live', state: 'running', pods: targets.length, hits: 0, ms: 0 });

  await new Promise<void>(resolve => {
    let handle: SearchHandle | undefined;
    const timer = setTimeout(() => { handle?.cancel(); resolve(); }, timeout);
    handle = deps.searchLogs(targets, opts, {
      onPodDone: (r: PodSearchResult, m: SearchMatch[]) => {
        scannedLines += r.scanned;
        if (r.error) errors.push({ pod: r.pod, error: r.error });
        const t = byPod.get(r.pod);
        if (t) {
          runs.push({
            kind: 'live', pod: r.pod, command: ['kubectl', ...searchArgs(t, opts, false)].join(' '),
            matched: r.matched, elapsedMs: r.elapsedMs, ...(r.error ? { error: r.error } : {}),
          });
        }
        matches.push(...m);
      },
      onProgress: () => {},
      onFinished: () => { clearTimeout(timer); resolve(); },
    });
  });

  const liveMs = Date.now() - started;
  const liveHits = matches.length;
  deps.onPhase?.({ phase: 'live', state: 'done', pods: targets.length, hits: liveHits, ms: liveMs });
  const archiveStarted = Date.now();
  if (args.archive !== false && deps.searchArchive) {
    deps.onPhase?.({ phase: 'archive', state: 'running', pods: targets.length, hits: 0, ms: 0 });
    /* The roots are the same for most pods of a workload: the last pod's are the best guess for the next. */
    let roots: string[] | undefined;
    for (const [i, t] of targets.entries()) {
      if (Date.now() - started > timeout) break;
      deps.onPhase?.({
        phase: 'archive', state: 'running', pods: targets.length, hits: matches.length - liveHits,
        ms: Date.now() - archiveStarted, pod: t.pod, podIndex: i + 1, roots, files: archiveFiles,
      });
      try {
        const { result, matches: m } = await deps.searchArchive(t, opts, signal);
        if (result.roots?.length) roots = result.roots;
        if (result.files.length) archivePods++;
        archiveFiles += result.files.length;
        if (result.error) errors.push({ pod: t.pod, error: result.error });
        for (const command of result.commands ?? []) {
          runs.push({
            kind: 'archive', pod: t.pod, command, matched: result.matched,
            elapsedMs: result.elapsedMs, ...(result.error ? { error: result.error } : {}),
          });
        }
        matches.push(...m);
      } catch (err) {
        errors.push({ pod: t.pod, error: (err as Error).message });
      }
    }
    deps.onPhase?.({
      phase: 'archive', state: 'done', pods: targets.length,
      hits: matches.length - liveHits, ms: Date.now() - archiveStarted, roots, files: archiveFiles,
    });
  }

  /* Only the lines that thread wrote — a message that merely names it is someone else's line. */
  if (thread) {
    for (let i = matches.length - 1; i >= 0; i--) {
      if (threadOf(matches[i].text) !== thread) matches.splice(i, 1);
    }
  }

  const { groups, truncated } = groupByThread(matches, {
    around, failure: failureMatcher(args.failure),
  });
  for (const g of groups) {
    const workload = byPod.get(g.pod)?.workload;
    if (workload) g.workload = workload;
  }

  return {
    query, around, groups, errors, truncated,
    scanned: { pods: targets.length, lines: scannedLines, archivePods, archiveFiles },
    elapsedMs: Date.now() - started,
    runs, liveMs, archiveMs: Date.now() - archiveStarted,
    ...(windowed ? { window: { from: fromMs !== undefined ? new Date(fromMs).toISOString() : undefined,
                               to: toMs !== undefined ? new Date(toMs).toISOString() : undefined } } : {}),
  };
}
