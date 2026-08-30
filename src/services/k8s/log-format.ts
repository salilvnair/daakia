/**
 * Understanding an application's log lines.
 *
 * kubectl prefixes every line with its own RFC3339 stamp, which is guaranteed
 * and stripped elsewhere. Everything after that prefix is the application's,
 * and dk8s previously only sniffed it for an uppercase level word — which
 * works for Java and Python and leaves JSON, logfmt, Go and nginx entirely
 * grey, so the level chips, the density ribbon and the error rails all go
 * blank on those pods.
 *
 * This runs on EVERY LINE of every stream, so the whole file is written around
 * not being slow:
 *
 *   - A format is compiled once, when it is saved or first used — never per
 *     line. A regex built inside the loop is five thousand compilations a
 *     fetch, and is the easiest way to make this feature the reason the UI
 *     stutters.
 *   - JSON and logfmt never touch a regex. They are the two highest-volume
 *     shapes in practice and both have a parser that beats any pattern.
 *   - Patterns are anchored and only ever run against the head of a line. The
 *     timestamp and level live at the front; a 40KB JSON payload should not be
 *     scanned to its end to discover that.
 *   - A format that turns out to be slow is dropped rather than tolerated.
 *     See `FormatMeter`.
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'other';

/**
 * How a format is parsed.
 *
 * The kind is what makes this fast: `json` and `logfmt` skip regex entirely,
 * and `pattern` is the general fallback.
 */
export type FormatKind = 'json' | 'logfmt' | 'pattern';

export interface LogFormat {
  id: string;
  name: string;
  kind: FormatKind;

  /**
   * For `pattern`: a template or raw regex.
   *
   * Templates use `%{NAME}` placeholders and compile to a regex — friendlier
   * to write, identical to run. A value starting with `/` is treated as a raw
   * regex for anything the templates cannot express.
   */
  pattern?: string;

  /** For `json`: which properties hold each field. Dotted paths allowed. */
  fields?: {
    timestamp?: string;
    level?: string;
    logger?: string;
    message?: string;
  };

  /**
   * Raw level value -> canonical level.
   *
   * Needed far more often than it looks: syslog uses numbers, Go's slog uses
   * mixed case, Python says WARNING, bunyan says 40.
   */
  levelMap?: Record<string, LogLevel>;

  /** When to apply this automatically. Every present field must match. */
  match?: {
    /** Substring of the container image. */
    image?: string;
    namespace?: string;
    /** `key=value` on the pod's labels. */
    label?: string;
    /** Substring of the pod name. */
    pod?: string;
  };

  /** Shipped formats cannot be deleted, only disabled. */
  builtin?: boolean;
  enabled?: boolean;
}

export interface ParsedLine {
  ts?: number;
  level: LogLevel;
  logger?: string;
  /** The message, with the parsed fields removed where the format found them. */
  message: string;
}

// ── Level normalisation ─────────────────────────────────────────────────────

/** Canonical names, plus the spellings every common logger actually emits. */
const LEVEL_ALIASES: Record<string, LogLevel> = {
  error: 'error', err: 'error', severe: 'error', fatal: 'error', critical: 'error',
  crit: 'error', panic: 'error', emerg: 'error', alert: 'error',
  warn: 'warn', warning: 'warn',
  info: 'info', notice: 'info', log: 'info',
  debug: 'debug', trace: 'debug', verbose: 'debug', fine: 'debug', finer: 'debug',
  // Numeric severities: syslog 0-7, and bunyan/pino's 10-60 scale.
  '0': 'error', '1': 'error', '2': 'error', '3': 'error',
  '4': 'warn', '5': 'info', '6': 'info', '7': 'debug',
  '10': 'debug', '20': 'debug', '30': 'info', '40': 'warn', '50': 'error', '60': 'error',
};

export function normaliseLevel(raw: unknown, map?: Record<string, LogLevel>): LogLevel {
  if (raw === undefined || raw === null) return 'other';
  const key = String(raw).trim().toLowerCase();
  if (!key) return 'other';
  // A format's own map wins — it is the escape hatch for anything in-house.
  return map?.[key] ?? LEVEL_ALIASES[key] ?? 'other';
}

// ── Templates ───────────────────────────────────────────────────────────────

/**
 * `%{NAME}` placeholders, so nobody has to hand-write a regex to say
 * "timestamp, level, message".
 */
const PLACEHOLDERS: Record<string, string> = {
  TIMESTAMP: String.raw`(?<timestamp>\d{4}[-/]\d{2}[-/]\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)`,
  LEVEL: String.raw`(?<level>[A-Za-z]{3,8})`,
  LOGGER: String.raw`(?<logger>[\w.$/-]+)`,
  MESSAGE: String.raw`(?<message>.*)`,
  THREAD: String.raw`(?<thread>[^\]]+)`,
  NUM: String.raw`\d+`,
  WORD: String.raw`\S+`,
  SPACE: String.raw`\s+`,
  DATA: String.raw`.*?`,
};

/**
 * Everything a regex would treat as syntax, outside a placeholder.
 *
 * A run of spaces becomes `\s+` rather than that many literal spaces. Log
 * columns are padded to align, so the gap after a level is one space on
 * `ERROR` and three on `WARN` — a template written against one line has to
 * match the next.
 */
function escapeLiteral(s: string): string {
  return s
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/ +/g, '\\s+');
}

/**
 * Compile a template to an anchored regex.
 *
 * Anchored deliberately: an unanchored pattern that does not match scans the
 * whole line looking for a start position, which on a long line is the
 * difference between a microsecond and a millisecond.
 */
export function compileTemplate(template: string): RegExp {
  if (template.startsWith('/')) {
    // Raw regex escape hatch: /.../flags
    const end = template.lastIndexOf('/');
    const body = template.slice(1, end);
    const flags = template.slice(end + 1).replace(/[gy]/g, '');
    return new RegExp(body.startsWith('^') ? body : '^' + body, flags);
  }

  let out = '';
  let i = 0;
  while (i < template.length) {
    const open = template.indexOf('%{', i);
    if (open === -1) { out += escapeLiteral(template.slice(i)); break; }
    out += escapeLiteral(template.slice(i, open));
    const close = template.indexOf('}', open);
    if (close === -1) { out += escapeLiteral(template.slice(open)); break; }
    const name = template.slice(open + 2, close).trim().toUpperCase();
    // A literal run of spaces in a template should match any run of spaces —
    // log columns are aligned with padding that varies line to line.
    out += PLACEHOLDERS[name] ?? escapeLiteral(template.slice(open, close + 1));
    i = close + 1;
  }
  return new RegExp('^' + out);
}

/**
 * Refuse a pattern that can blow up.
 *
 * Nested unbounded quantifiers backtrack catastrophically: on a line that
 * nearly matches, `(a+)+$` runs for longer than the heat death. One such
 * pattern saved against a busy pod would hang the extension host, so it is
 * rejected at save time rather than discovered at 3am.
 */
export function validatePattern(template: string): string | null {
  let re: RegExp;
  try {
    re = compileTemplate(template);
  } catch (err) {
    return `That pattern will not compile: ${(err as Error).message}`;
  }
  if (/\([^)]*[+*][^)]*\)\s*[+*]/.test(re.source)) {
    return 'That pattern nests one unbounded repeat inside another, which can '
      + 'take effectively forever on a line that almost matches. Anchor the '
      + 'inner part or make it specific.';
  }
  return null;
}

// ── Parsers ─────────────────────────────────────────────────────────────────

/**
 * How much of a line to look at.
 *
 * Timestamps, levels and logger names are always at the front. A single line
 * can be a 40KB serialised payload, and scanning all of it to find a level in
 * the first forty characters is pure waste at a few thousand lines a second.
 */
const HEAD = 256;

function pick(obj: Record<string, unknown>, path?: string): unknown {
  if (!path) return undefined;
  if (!path.includes('.')) return obj[path];
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** Seconds, milliseconds or a date string, all seen in the wild. */
function toMillis(raw: unknown): number | undefined {
  if (typeof raw === 'number') {
    // Anything below this is seconds — 1e12 ms is the year 2001, and no log
    // line predates that.
    return raw < 1e12 ? Math.round(raw * 1000) : Math.round(raw);
  }
  if (typeof raw === 'string') {
    const n = Date.parse(raw);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function parseJsonLine(text: string, fmt: LogFormat): ParsedLine | null {
  // Cheapest possible rejection, before paying for JSON.parse.
  const head = text.trimStart();
  if (head.charCodeAt(0) !== 123 /* { */) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(head) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null) return null;

  const f = fmt.fields ?? {};
  const message = pick(obj, f.message ?? 'msg') ?? pick(obj, 'message') ?? '';
  return {
    ts: toMillis(pick(obj, f.timestamp ?? 'ts') ?? pick(obj, 'time') ?? pick(obj, 'timestamp')),
    level: normaliseLevel(pick(obj, f.level ?? 'level') ?? pick(obj, 'severity'), fmt.levelMap),
    logger: (pick(obj, f.logger ?? 'logger') ?? pick(obj, 'caller')) as string | undefined,
    message: typeof message === 'string' ? message : JSON.stringify(message),
  };
}

/**
 * `key=value key="quoted value"` — Go's logfmt, and Heroku's.
 *
 * Scanned rather than regexed: only the handful of keys that matter are
 * extracted, and the scan stops as soon as it has them.
 */
function parseLogfmtLine(text: string, fmt: LogFormat): ParsedLine | null {
  const head = text.slice(0, HEAD);
  if (!head.includes('=')) return null;

  const read = (key: string): string | undefined => {
    const at = head.indexOf(key + '=');
    // Must be at the start or preceded by a space, or `sublevel=` matches
    // a search for `level=`.
    if (at === -1 || (at > 0 && head[at - 1] !== ' ')) return undefined;
    const from = at + key.length + 1;
    if (head[from] === '"') {
      const end = head.indexOf('"', from + 1);
      return end === -1 ? head.slice(from + 1) : head.slice(from + 1, end);
    }
    const end = head.indexOf(' ', from);
    return end === -1 ? head.slice(from) : head.slice(from, end);
  };

  const f = fmt.fields ?? {};
  const level = read(f.level ?? 'level') ?? read('lvl') ?? read('severity');
  if (level === undefined) return null;

  const msgFull = (() => {
    const key = (f.message ?? 'msg') + '=';
    const at = text.indexOf(key);
    if (at === -1) return text;
    const from = at + key.length;
    if (text[from] === '"') {
      const end = text.indexOf('"', from + 1);
      return end === -1 ? text.slice(from + 1) : text.slice(from + 1, end);
    }
    const end = text.indexOf(' ', from);
    return end === -1 ? text.slice(from) : text.slice(from, end);
  })();

  return {
    ts: toMillis(read(f.timestamp ?? 'ts') ?? read('time')),
    level: normaliseLevel(level, fmt.levelMap),
    logger: read(f.logger ?? 'logger') ?? read('component'),
    message: msgFull,
  };
}

function parsePatternLine(text: string, fmt: LogFormat, re: RegExp): ParsedLine | null {
  const m = re.exec(text.slice(0, HEAD));
  if (!m?.groups) return null;
  const g = m.groups;
  return {
    ts: g.timestamp ? toMillis(g.timestamp.replace(',', '.')) : undefined,
    level: normaliseLevel(g.level, fmt.levelMap),
    logger: g.logger,
    // The regex only saw the head, so take the message from the full line —
    // otherwise anything past 256 chars would be silently truncated.
    message: g.message !== undefined && m.index + m[0].length >= Math.min(text.length, HEAD)
      ? text.slice(text.length - g.message.length)
      : (g.message ?? text),
  };
}

// ── Compiled formats ────────────────────────────────────────────────────────

export interface CompiledFormat {
  format: LogFormat;
  parse: (text: string) => ParsedLine | null;
}

/**
 * Compile once. The returned closure is what runs per line.
 */
export function compileFormat(fmt: LogFormat): CompiledFormat {
  if (fmt.kind === 'json') {
    return { format: fmt, parse: (t) => parseJsonLine(t, fmt) };
  }
  if (fmt.kind === 'logfmt') {
    return { format: fmt, parse: (t) => parseLogfmtLine(t, fmt) };
  }
  const re = compileTemplate(fmt.pattern ?? '%{MESSAGE}');
  return { format: fmt, parse: (t) => parsePatternLine(t, fmt, re) };
}

// ── Choosing a format for a pod ─────────────────────────────────────────────

export interface PodContext {
  namespace: string;
  pod: string;
  image?: string;
  labels?: Record<string, string>;
}

/**
 * Which format applies, resolved ONCE when a stream opens.
 *
 * Because this runs per pod rather than per line, the cost of the rules is
 * irrelevant to throughput — which is what makes a global list with match
 * rules the right shape rather than a per-namespace list.
 */
export function resolveFormat(formats: LogFormat[], ctx: PodContext): LogFormat | undefined {
  for (const f of formats) {
    if (f.enabled === false) continue;
    const m = f.match;
    // No rule means "only when chosen by hand" — an unconditional format would
    // capture every pod and hide the ones that follow it.
    if (!m || (!m.image && !m.namespace && !m.label && !m.pod)) continue;
    if (m.namespace && m.namespace !== ctx.namespace) continue;
    if (m.pod && !ctx.pod.includes(m.pod)) continue;
    if (m.image && !(ctx.image ?? '').includes(m.image)) continue;
    if (m.label) {
      const [k, v] = m.label.split('=');
      if (!k || (ctx.labels?.[k.trim()] ?? undefined) !== (v ?? '').trim()) continue;
    }
    return f;
  }
  return undefined;
}

// ── Keeping a slow format from ruining the view ─────────────────────────────

/**
 * Watches what a format actually costs and gives up on it if it is expensive.
 *
 * Validation catches the pathological patterns; this catches the merely slow
 * ones — a format someone wrote that happens to backtrack a little on every
 * line is invisible in a test and ruinous at ten thousand lines. Falling back
 * to the keyword sniff loses colour on some lines; not falling back loses the
 * whole view.
 */
export class FormatMeter {
  private lines = 0;
  private nanos = 0;
  private tripped = false;

  constructor(
    /** Give up above this average, in microseconds per line. */
    private readonly budgetUs = 25,
    /** Measure over this many lines before judging. */
    private readonly sample = 500,
  ) {}

  /** True while the format is still worth using. */
  get healthy(): boolean {
    return !this.tripped;
  }

  get averageUs(): number {
    return this.lines ? this.nanos / this.lines / 1000 : 0;
  }

  run<T>(fn: () => T): T {
    if (this.tripped) return fn();
    // Sampling the clock per line would itself cost more than the parse, so
    // only the first `sample` lines are measured; after that the verdict
    // stands and the meter costs one boolean.
    if (this.lines >= this.sample) return fn();

    const started = process.hrtime.bigint();
    const out = fn();
    this.nanos += Number(process.hrtime.bigint() - started);
    this.lines++;

    if (this.lines === this.sample && this.averageUs > this.budgetUs) {
      this.tripped = true;
    }
    return out;
  }
}

// ── Working it out without being told ───────────────────────────────────────

export interface ProbeResult {
  format: LogFormat;
  /** Fraction of the sampled lines this format parsed. */
  hitRate: number;
  /** How many of those yielded a real level rather than `other`. */
  levelled: number;
}

/**
 * Try the candidates against a sample and pick the one that actually fits.
 *
 * This is what makes the feature work with no configuration at all, which
 * matters more than the settings page: most people will never open it, and a
 * pod whose format nobody has described should still get coloured levels.
 *
 * Cheap enough to be unconditional — eight formats over twenty lines is a
 * hundred and sixty parses, about a tenth of a millisecond, paid once when the
 * stream opens rather than per line.
 */
export function probeFormat(
  lines: string[],
  candidates: LogFormat[],
  minHitRate = 0.6,
): ProbeResult | undefined {
  const sample = lines.filter(l => l.trim()).slice(0, 20);
  if (sample.length < 3) return undefined;

  let best: ProbeResult | undefined;
  for (const format of candidates) {
    if (format.enabled === false) continue;
    const compiled = compileFormat(format);
    let hits = 0;
    let levelled = 0;
    for (const line of sample) {
      const p = compiled.parse(line);
      if (!p) continue;
      hits++;
      if (p.level !== 'other') levelled++;
    }
    const hitRate = hits / sample.length;
    if (hitRate < minHitRate) continue;

    // Prefer the format that reads a LEVEL, not merely the one that matches.
    // Several patterns will match a given line; the useful one is whichever
    // gets the colour right, since that is the whole point.
    const better = !best
      || levelled > best.levelled
      || (levelled === best.levelled && hitRate > best.hitRate);
    if (better) best = { format, hitRate, levelled };
  }
  return best;
}

/**
 * The whole resolution order, in one place.
 *
 * Explicit beats configured beats guessed, and anything unresolved falls back
 * to the caller's own heuristic rather than to nothing.
 */
export function chooseFormat(
  opts: {
    /** Chosen by hand for this pod, this session. */
    pinned?: LogFormat;
    saved: LogFormat[];
    builtins: LogFormat[];
    ctx: PodContext;
    /** First lines off the stream, for probing. */
    sample?: string[];
  },
): { format?: LogFormat; via: 'pinned' | 'rule' | 'probed' | 'none' } {
  if (opts.pinned) return { format: opts.pinned, via: 'pinned' };

  const byRule = resolveFormat(opts.saved, opts.ctx);
  if (byRule) return { format: byRule, via: 'rule' };

  if (opts.sample?.length) {
    const probed = probeFormat(opts.sample, [...opts.saved, ...opts.builtins]);
    if (probed) return { format: probed.format, via: 'probed' };
  }
  return { via: 'none' };
}
