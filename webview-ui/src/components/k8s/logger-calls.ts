/**
 * Many logger calls at once — a paste of four lines out of an editor, a
 * dropped `.java` file, a whole repository's worth from a scan.
 *
 * `logger-pattern.ts` turns ONE call into a pattern and is the only place that
 * decides what `{}` means. This file is everything around it: finding the
 * calls in a block of text, the call shapes that are not `log.info("…", a)` —
 * pino's object first, slog's key/value pairs, a message glued together with
 * `+` — and the plain-text templates somebody types without any call at all.
 * Each of those ends in the same parser, so a pattern means the same thing
 * however it arrived.
 *
 * ── The four dialects the Add patterns page names ──
 *
 *     SLF4J {}          log.info("request:{}", reqId)
 *     printf %s         logger.info("request:%s", req_id)
 *     python f-string   logger.info(f"request:{req_id}")   (and JS `${…}`)
 *     plain text        request:{reqId}  — a template with the holes named
 *
 * `dialectsOf` says which ones a paste used, so the chips above the box light
 * up for what was actually recognised rather than for what might have been.
 */
import {
  fromLoggerCall, fromLogLine, compilePattern, type LoggerPattern,
} from './logger-pattern';

/**
 * A logger call, at its opening paren — the host scanner's rule, repeated
 * here because a paste never goes to the host. The receiver has to look like
 * a logger: `response.info(` is not one.
 */
const CALL = /(?:^|[^\w$])((?:[\w$]*(?:log|logger|logging|slf4j|console)[\w$]*)\s*(?:\.\s*[\w$]+\s*)*?)\.\s*(trace|debug|info|warn|warning|error|fatal|exception)\s*\(/gi;

/** From the opening paren to the one that closes it, strings respected. */
function callAt(text: string, openParen: number): string | undefined {
  let depth = 0;
  let quote: string | undefined;
  for (let i = openParen; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = undefined;
      continue;
    }
    if (ch === '"' || ch === '\'' || ch === '`') { quote = ch; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return text.slice(openParen, i + 1);
    }
    if (i - openParen > 4000) return undefined;
  }
  return undefined;
}

export interface FoundCall {
  code: string;
  /** 1-based line the call starts on, for "BcblClient.java:42". */
  line: number;
  /** Character range in the pasted text, so what was not a call can be told apart. */
  start: number;
  end: number;
}

/** Every logger call in a block of source text. */
export function findCalls(text: string): FoundCall[] {
  const out: FoundCall[] = [];
  CALL.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CALL.exec(text)) !== null) {
    const openParen = text.indexOf('(', m.index + m[0].length - 1);
    if (openParen === -1) continue;
    const args = callAt(text, openParen);
    if (!args) continue;
    const at = m.index + Math.max(0, m[0].indexOf(m[1]));
    out.push({
      code: `${m[1].replace(/\s+/g, '')}.${m[2]}${args}`.replace(/\s*\n\s*/g, ' '),
      line: text.slice(0, at).split('\n').length,
      start: at,
      end: openParen + args.length,
    });
    CALL.lastIndex = openParen + 1;
  }
  return out;
}

/** Top-level comma split, for a call's argument list. */
function topLevel(raw: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | undefined;
  let cur = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (quote) {
      cur += ch;
      if (ch === '\\') { cur += raw[++i] ?? ''; continue; }
      if (ch === quote) quote = undefined;
      continue;
    }
    if (ch === '"' || ch === '\'' || ch === '`') { quote = ch; cur += ch; continue; }
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth--;
    if (ch === sep && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** `recv.level(` and the argument list, or undefined for something else. */
function parts(code: string): { receiver: string; method: string; args: string[] } | undefined {
  const m = /^\s*([\w$.]+)\s*\.\s*(\w+)\s*\(([\s\S]*)\)\s*;?\s*$/.exec(code);
  if (!m) return undefined;
  return { receiver: m[1], method: m[2], args: topLevel(m[3], ',') };
}

/** One string literal and nothing else — `"a" + b + "c"` is three pieces, not one. */
const STRING = /^(?:[fFrRbBuU]{1,2})?(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`)$/;
const stringBody = (m: RegExpExecArray) => m[1] ?? m[2] ?? m[3] ?? '';

/**
 * `"user " + user + " logged in"` → `user {user} logged in`.
 *
 * Also Python's `"…%s" % x`, which is the same idea spelled differently.
 * Everything that is not a string literal becomes a hole named after the
 * expression, the way an argument would have been.
 */
function glue(expr: string): { template: string; holes: string[] } | undefined {
  const pyPercent = /^(["'])((?:[^\\]|\\.)*?)\1\s*%\s*(.+)$/.exec(expr);
  if (pyPercent) {
    const values = pyPercent[3].replace(/^\(|\)$/g, '').split(',').map(v => v.trim()).filter(Boolean);
    let i = 0;
    const holes: string[] = [];
    const template = pyPercent[2].replace(/%[-+ #0]*\d*(?:\.\d+)?[sdifr]/g, () => {
      const name = nameOf(values[i++] ?? `arg${i}`);
      holes.push(name);
      return `{${name}}`;
    });
    return holes.length ? { template, holes } : undefined;
  }

  const pieces = topLevel(expr, '+');
  if (pieces.length < 2) return undefined;
  let template = '';
  const holes: string[] = [];
  let sawString = false;
  for (const piece of pieces) {
    const s = STRING.exec(piece);
    if (s) { template += stringBody(s); sawString = true; continue; }
    const name = nameOf(piece);
    holes.push(name);
    template += `{${name}}`;
  }
  return sawString && holes.length ? { template, holes } : undefined;
}

function nameOf(expr: string): string {
  const getter = /\.\s*get([A-Z]\w*)\s*\(/.exec(expr);
  if (getter) return getter[1].charAt(0).toLowerCase() + getter[1].slice(1);
  const last = expr.replace(/\(.*\)$/, '').split('.').pop() ?? expr;
  return last.replace(/[^\w]/g, '') || 'value';
}

const LEVEL_OF: Record<string, string> = {
  trace: 'trace', debug: 'debug', info: 'info', warn: 'warn', warning: 'warn',
  error: 'error', fatal: 'error', exception: 'error',
};

/**
 * Any call shape the catalogue can use, or undefined for one it cannot.
 *
 * The ordinary call goes to `fromLoggerCall` untouched. The others are
 * rewritten into that shape first — the message pulled out of an object,
 * a Go method lower-cased — so the rules for holes stay in one place.
 */
export function fromAnyCall(code: string): LoggerPattern | undefined {
  const p = parts(code);
  if (!p) return fromLoggerCall(code);
  const method = p.method.toLowerCase();
  const level = LEVEL_OF[method];
  if (!level) return fromLoggerCall(code);

  /* pino and bunyan: the object comes first, the message second. The
     object's keys are fields the line carries beside the message. */
  if (p.args[0]?.startsWith('{') && p.args.length >= 2) {
    const keys = topLevel(p.args[0].slice(1, -1), ',')
      .map(k => /^(?:\.\.\.)?\s*([\w$]+)/.exec(k)?.[1])
      .filter((k): k is string => !!k && !k.startsWith('...'));
    const rest = fromAnyCall(`${p.receiver}.${method}(${p.args.slice(1).join(', ')})`);
    if (!rest) return undefined;
    return { ...rest, objectFields: keys.length ? keys : undefined };
  }

  /* A message built with `+` or `%` has no literal first argument. */
  const first = p.args[0] ?? '';
  if (!STRING.test(first)) {
    const g = glue(first);
    if (!g) return undefined;
    return {
      template: g.template, holes: g.holes, level, source: 'paste', glued: true,
      logger: /^(?:log|logger|self\.logger|self\.log|console|slog)$/i.test(p.receiver) ? undefined : p.receiver,
    };
  }

  /* Python's `log.exception` is an ERROR with the traceback attached. */
  const pattern = fromLoggerCall(`${p.receiver}.${method === 'exception' ? 'error' : method}(${p.args.join(', ')})`);
  if (!pattern) return undefined;

  /* slog: `slog.Info("msg", "key", v, "key2", v2)` — the string literals in
     the even places after the message are field names, not arguments. */
  const rest = p.args.slice(1);
  if (pattern.holes.length === 0 && rest.length >= 2 && rest.length % 2 === 0
    && rest.every((a, i) => i % 2 === 1 || /^"[\w.-]+"$/.test(a))) {
    return { ...pattern, objectFields: rest.filter((_, i) => i % 2 === 0).map(a => a.slice(1, -1)) };
  }
  return pattern;
}

/**
 * A message template typed as text: `request:{reqId} took {}ms`.
 *
 * `{}` and `%s` still work here — somebody who copies the string out of the
 * call without the call is pasting a template — and they are named `arg1`,
 * `arg2` because there is no argument list to name them after.
 */
export function fromPlainText(text: string): LoggerPattern | undefined {
  const line = text.trim().replace(/^["'`]|["'`]$/g, '');
  if (!line) return undefined;
  const holes: string[] = [];
  let n = 0;
  const template = line
    .replace(/\$\{\s*([\w.]+)\s*\}/g, (_, name: string) => {
      const clean = name.split('.').pop()!;
      holes.push(clean);
      return `{${clean}}`;
    })
    .replace(/\{\}|%[-+ #0]*\d*(?:\.\d+)?[sdifr]/g, () => {
      const name = `arg${++n}`;
      holes.push(name);
      return `{${name}}`;
    })
    .replace(/\{([A-Za-z_][\w.]*)\}/g, (whole, name: string) => {
      if (!holes.includes(name)) holes.push(name);
      return whole;
    });
  return { template, holes, source: 'manual' };
}

export interface Dialects {
  slf4j: boolean;
  printf: boolean;
  fstring: boolean;
  plain: boolean;
}

/** Which of the four the text used — what the chips above the box light. */
export function dialectsOf(text: string): Dialects {
  const calls = findCalls(text);
  const rest = leftovers(text, calls);
  return {
    slf4j: /\{\}/.test(text),
    printf: /%[-+ #0]*\d*(?:\.\d+)?[sdif]/.test(text),
    fstring: /(?:^|[(\s,])[fF]["']|\$\{/.test(text),
    plain: rest.length > 0,
  };
}

/** The non-blank lines of a paste that are not inside any call. */
function leftovers(text: string, calls: FoundCall[]): string[] {
  let masked = text;
  for (const c of [...calls].reverse()) {
    masked = masked.slice(0, c.start) + ' '.repeat(c.end - c.start) + masked.slice(c.end);
  }
  return masked.split(/\r?\n/)
    .map(l => l.trim().replace(/;$/, '').trim())
    .filter(l => l && !/^(?:\/\/|#|\*|\/\*)/.test(l) && !/^[{}()[\];,]+$/.test(l));
}

export interface ParsedPaste {
  pattern: LoggerPattern;
  /** The source text it came from, for the row's tooltip. */
  from: string;
}

/**
 * A whole paste, as patterns: every call in it, and every other line as a
 * plain template. Duplicates collapse — the same message logged in two
 * branches is one pattern.
 */
export function parsePaste(text: string): ParsedPaste[] {
  const calls = findCalls(text);
  const out: ParsedPaste[] = [];
  const seen = new Set<string>();
  const push = (pattern: LoggerPattern | undefined, from: string) => {
    if (!pattern || seen.has(pattern.template)) return;
    seen.add(pattern.template);
    out.push({ pattern, from });
  };
  for (const c of calls) push(fromAnyCall(c.code), c.code);
  /* Only when the paste is not source: a `.java` file's other lines are
     code, not templates, and reading them as templates would offer
     `private final OrderRepository repo` as something the log might say. */
  const looksLikeSource = calls.length > 0 && /\b(?:class|def|function|import|package|public|private|return)\b/.test(text);
  if (!looksLikeSource) {
    for (const line of leftovers(text, calls)) push(fromPlainText(line), line);
  }
  return out;
}

/**
 * What the pattern matches on, as a reader would write it.
 *
 * The compiled regex uses anonymous groups (named groups cannot carry every
 * name a hole might have). This is the same expression with the names put
 * back, for "Show what it matches on" — it is shown, never run.
 */
export function regexSource(pattern: Pick<LoggerPattern, 'template'>): string {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let out = '^';
  let last = 0;
  const re = /\{([A-Za-z_][\w.]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pattern.template)) !== null) {
    out += esc(pattern.template.slice(last, m.index));
    out += `(?<${m[1].replace(/\W/g, '_')}>.+)`;
    last = m.index + m[0].length;
  }
  return `${out}${esc(pattern.template.slice(last))}$`;
}

export interface LearnedShape {
  pattern: LoggerPattern;
  count: number;
  /** One line it was learned from, to show beside it. */
  sample: string;
  level?: string;
  logger?: string;
}

/**
 * The shapes a buffer's lines fall into — "Learn from the log".
 *
 * Every line is reduced to a template the way a single pasted line would be,
 * and lines with the same template are one shape. The commonest come first:
 * a tester learning what a pod says wants its vocabulary, and a shape seen
 * once is usually a value `fromLogLine` did not recognise as one.
 */
export function learnShapes(
  lines: { text: string; message?: string; level?: string; logger?: string; continuation?: boolean }[],
  limit = 200,
): LearnedShape[] {
  const by = new Map<string, LearnedShape>();
  for (const line of lines) {
    if (line.continuation) continue;
    const text = (line.message ?? line.text).trim();
    if (!text || text.length > 400) continue;
    const pattern = fromLogLine(text);
    const hit = by.get(pattern.template);
    if (hit) { hit.count++; continue; }
    by.set(pattern.template, {
      pattern: { ...pattern, logger: line.logger, level: line.level && line.level !== 'other' ? line.level : undefined },
      count: 1, sample: text, level: line.level, logger: line.logger,
    });
  }
  return [...by.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

/** A hole whose values are all numbers is a measurement: "slowest 10" can sort it. */
export function numericHoles(pattern: LoggerPattern, samples: Record<string, string>[]): string[] {
  return pattern.holes.filter(h => {
    const values = samples.map(s => s[h]).filter(v => v !== undefined);
    return values.length > 0 && values.every(v => /^-?\d+(?:\.\d+)?(?:ms|s)?$/.test(v));
  });
}

/**
 * Why a scanned call starts switched off, or undefined when it starts on.
 *
 * A scan of a Spring Boot service finds several hundred calls, and adding all
 * of them makes a catalogue nobody reads. DEBUG and TRACE rarely run in the
 * pod anybody is testing; test source never does; a message glued from
 * strings has a shape somebody can break by editing either half; and a call
 * with no hole in it is a banner or a lifecycle line, findable by its text.
 * Each is one click to turn on, and the reason is shown beside it.
 */
export function reasonOff(pattern: LoggerPattern, test: boolean): string | undefined {
  if (test) return 'test source';
  if (pattern.level === 'debug' || pattern.level === 'trace') return pattern.level.toUpperCase();
  if (pattern.glued) return 'built by joining strings, no fixed shape';
  if (pattern.holes.length === 0 && !pattern.objectFields?.length) return 'no values in it';
  return undefined;
}

/** True when the pattern would compile to something that can match. */
export function isUsable(pattern: LoggerPattern): boolean {
  return compilePattern(pattern).needle.length >= 3 || pattern.holes.length === 0;
}
