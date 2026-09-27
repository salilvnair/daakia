/**
 * What a logger can say, and how to find it again in the log.
 *
 * A tester cannot know which loggers an application has, let alone what each
 * one prints — that lives in source nobody hands them. What they do have is the
 * call itself, which somebody can paste in seconds:
 *
 *     log.info("checking bcbl api for request:{}", reqId)
 *
 * The line that reaches the log never contains the `{}`. It contains the value,
 * and the value is different every time — which is exactly why searching for
 * the message as text finds nothing, and searching for the value finds one
 * line. A pattern is the shape between those two: the literal parts matched
 * exactly, the holes named after the arguments that fill them.
 *
 *     checking bcbl api for request:A-4470   →  { reqId: "A-4470" }
 *
 * So one paste gives a tester three things at once: every line this logger has
 * written, a name for the value inside it, and a field to group and filter by.
 *
 * ── This is not the log FORMAT ──
 *
 * `src/services/k8s/log-format.ts` on the host parses the layout — timestamp,
 * level, thread, logger name, MDC — off the front of every line, and it is
 * compiled once and run on everything. This is about the MESSAGE that is left
 * after all of that, it belongs to one logger rather than to a pod, and it is
 * matched only against lines somebody is looking at. Keeping them apart is
 * deliberate: a pattern that is wrong here costs a highlight, not a stream.
 */

export type PatternSource = 'paste' | 'line' | 'scan' | 'manual' | 'regex';

export interface LoggerPattern {
  /** The message with its holes named: `checking bcbl api for request:{reqId}`. */
  template: string;
  /** Hole names, in the order they appear. */
  holes: string[];
  /** The logger that writes it, when the source said so. */
  logger?: string;
  /** The level it was logged at, when the source said so. */
  level?: string;
  /** Where the pattern came from, because it decides how much to trust it. */
  source: PatternSource;
  /**
   * A regular expression instead of a template, when somebody wrote one.
   *
   * For the line whose shape `{}` cannot say — a value that is optional, two
   * spellings of one message, a number that is sometimes followed by a unit.
   * Its NAMED groups are the holes, so `(?<status>\d{3})` fills `status` the
   * way `{status}` would. With this set the template is only the text shown
   * for the pattern; matching never reads it.
   */
  regex?: string;
}

/** A hole in a template: `{name}`. Names are identifier-ish, never empty. */
const HOLE = /\{([A-Za-z_][\w.]*)\}/g;

// ── Reading a logger call ───────────────────────────────────────────────────

/**
 * Java and friends: `log.info("... {} ...", a, b)`.
 *
 * The level comes from the method name, the logger from the receiver when it
 * is not the usual `log`/`logger`, and the holes from the arguments in order.
 */
const JAVA_CALL = new RegExp(
  '(?:([A-Za-z_][\\w.]*)\\s*\\.\\s*)?'
  + '(trace|debug|info|warn|warning|error|fatal)\\s*\\(\\s*'
  /* Python's string prefixes — `f"…"`, `rb"…"` — sit between the paren and the
     quote, and a template literal's quote is a backtick. Both are how the two
     languages that are NOT Java spell the same call, so both belong here. */
  + '(?:[fFrRbBuU]{1,2})?'
  + '(["\'`])((?:[^\\\\]|\\\\.)*?)\\3\\s*'
  + '(?:,\\s*([\\s\\S]*?))?\\s*\\)\\s*;?\\s*$',
);

/** Python's printf style: `logger.info("... %s ...", a)`. */
const PY_HOLE = /%[-+ #0]*\d*(?:\.\d+)?[sdifgeExXor]/g;

/** A JavaScript template literal or a Python f-string: `${a}` / `{a}`. */
const JS_HOLE = /\$\{\s*([\w.]+)\s*\}/g;

/**
 * Turn a pasted call into a pattern.
 *
 * Deliberately forgiving about what is pasted: people copy a line out of an
 * editor with its indentation, its trailing semicolon, sometimes half of the
 * next line. What it will not do is invent a pattern from something that is not
 * a call — `undefined` is a better answer than a pattern that matches nothing,
 * because the reader can see the first and cannot see the second.
 */
export function fromLoggerCall(code: string): LoggerPattern | undefined {
  const line = code.trim().replace(/\s+/g, ' ');
  const m = JAVA_CALL.exec(line);
  if (!m) return undefined;

  const [, receiver, method, , rawMessage, rawArgs] = m;
  const message = unescape(rawMessage);
  const args = splitArgs(rawArgs ?? '');

  /*
    An f-string or a template literal carries its own names, so the arguments
    are not consulted at all — `f"settling batch {batchId}"` has one hole and
    no argument list, and reading the names out of the string is the only way
    to get them.
  */
  if (JS_HOLE.test(message) || looksLikeFString(message)) {
    JS_HOLE.lastIndex = 0;
    return named(message, receiver, method);
  }

  const holes = countHoles(message);
  if (holes === 0) {
    return {
      template: message,
      holes: [],
      logger: loggerOf(receiver),
      level: levelOf(method),
      source: 'paste',
    };
  }

  /*
    Names come from the arguments, positionally. An argument that is an
    expression rather than a name — `order.getId()`, `list.size()` — is reduced
    to something readable rather than dropped, because a hole called `arg2`
    tells a reader nothing about the value in it.
  */
  const names = args.slice(0, holes).map((a, i) => nameOf(a, i));
  while (names.length < holes) names.push(`arg${names.length + 1}`);

  let i = 0;
  const template = message
    .replace(/\{\}/g, () => `{${names[i++]}}`)
    .replace(PY_HOLE, () => `{${names[i++] ?? `arg${i}`}}`);

  return {
    template,
    holes: names,
    logger: loggerOf(receiver),
    level: levelOf(method),
    source: 'paste',
  };
}

function named(message: string, receiver: string | undefined, method: string): LoggerPattern {
  const holes: string[] = [];
  const template = message
    .replace(JS_HOLE, (_, name: string) => {
      const clean = tidy(name);
      holes.push(clean);
      return `{${clean}}`;
    })
    .replace(/\{\s*([\w.]+)\s*\}/g, (whole, name: string) => {
      if (holes.includes(tidy(name))) return whole;
      const clean = tidy(name);
      holes.push(clean);
      return `{${clean}}`;
    });
  return { template, holes, logger: loggerOf(receiver), level: levelOf(method), source: 'paste' };
}

/** `f"... {x} ..."` — Python's own named holes, which are not `{}` pairs. */
function looksLikeFString(message: string): boolean {
  return /\{\s*[A-Za-z_][\w.]*\s*\}/.test(message);
}

function countHoles(message: string): number {
  const braces = (message.match(/\{\}/g) ?? []).length;
  PY_HOLE.lastIndex = 0;
  const printf = (message.match(PY_HOLE) ?? []).length;
  return braces + printf;
}

/**
 * Arguments, split on the commas that are not inside something.
 *
 * `log.info("{} {}", order.getId(), items.get(0, "x"))` has two arguments and
 * four commas; splitting on all of them produces four holes named after halves
 * of expressions.
 */
function splitArgs(raw: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | undefined;
  let current = '';

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (quote) {
      current += ch;
      if (ch === '\\') { current += raw[++i] ?? ''; continue; }
      if (ch === quote) quote = undefined;
      continue;
    }
    if (ch === '"' || ch === '\'') { quote = ch; current += ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { out.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out.filter(a => a.length > 0);
}

/**
 * A readable name for the value an argument produces.
 *
 * `order.getId()` is `orderId`, `e` is `error`, `items.size()` is `itemsSize`.
 * The point is that the field the tester ends up filtering by reads like
 * something they could have asked for.
 */
function nameOf(arg: string, index: number): string {
  const getter = /([\w.]+)\s*\.\s*get([A-Z]\w*)\s*\(/.exec(arg);
  if (getter) return tidy(lowerFirst(getter[2]));

  const call = /([\w.]+)\s*\.\s*(\w+)\s*\(/.exec(arg);
  if (call) return tidy(`${lastSegment(call[1])}${upperFirst(call[2])}`);

  const plain = /^[A-Za-z_][\w.]*$/.exec(arg.trim());
  if (plain) {
    const name = tidy(lastSegment(arg.trim()));
    return name === 'e' || name === 'ex' ? 'error' : name;
  }
  return `arg${index + 1}`;
}

function tidy(name: string): string {
  return lastSegment(name).replace(/[^\w]/g, '') || 'value';
}

function lastSegment(name: string): string {
  const parts = name.split('.');
  return parts[parts.length - 1] || name;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function loggerOf(receiver: string | undefined): string | undefined {
  if (!receiver) return undefined;
  const bare = lastSegment(receiver).toLowerCase();
  return bare === 'log' || bare === 'logger' || bare === 'console' || bare === 'self'
    ? undefined
    : receiver;
}

function levelOf(method: string): string {
  const level = method.toLowerCase();
  if (level === 'warning') return 'warn';
  if (level === 'fatal') return 'error';
  return level;
}

function unescape(raw: string): string {
  return raw
    .replace(/\\n/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, '\'')
    .replace(/\\\\/g, '\\');
}

// ── Reading a line instead ──────────────────────────────────────────────────

/** Things that are a value rather than a word: ids, numbers, uuids, hex. */
const VARIABLE = /\b(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[A-Za-z]{1,4}-\d+|\d+(?:\.\d+)?(?:ms|s|kb|mb|%)?|0x[0-9a-fA-F]+)\b/g;

/**
 * A pattern learned from one line, for when there is no source to paste.
 *
 * Every value-shaped token becomes a hole. It is a guess and says so — the
 * source is `line`, and the UI is expected to show what it will match before
 * anybody keeps it.
 */
export function fromLogLine(message: string): LoggerPattern {
  const holes: string[] = [];
  VARIABLE.lastIndex = 0;

  const template = message.replace(VARIABLE, (value) => {
    const name = `value${holes.length + 1}`;
    holes.push(name);
    return `{${name}}`;
  });

  return { template, holes, source: 'line' };
}

// ── Writing a regex instead ─────────────────────────────────────────────────

/** A named group: `(?<status>…)`. The name is what the hole is called. */
const NAMED_GROUP = /\(\?<([A-Za-z_][\w]*)>/g;

/**
 * A pattern from a regular expression somebody typed.
 *
 * The last resort, and treated as one: it is the only way in that can be
 * wrong in a way the reader cannot see, so a regex that does not compile is
 * an error with the engine's own words rather than a pattern that silently
 * matches nothing. A regex with no named group is allowed — it can be counted
 * — but it has no holes, so there is nothing in it to group by.
 */
export function fromRegex(source: string): LoggerPattern | { error: string } {
  const text = source.trim();
  if (!text) return { error: 'Write the expression first.' };
  try {
    new RegExp(text);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const holes: string[] = [];
  NAMED_GROUP.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NAMED_GROUP.exec(text)) !== null) {
    if (!holes.includes(m[1])) holes.push(m[1]);
  }
  return { template: text, holes, source: 'regex', regex: text };
}

// ── Matching ────────────────────────────────────────────────────────────────

export interface CompiledPattern {
  /** Anchored: the template is the whole message a logger wrote. */
  whole: RegExp;
  /** Unanchored, for finding the shape inside a line that carries more. */
  anywhere: RegExp;
  holes: string[];
  /** Holes come from named groups rather than from group positions. */
  named?: boolean;
}

/** Matches nothing, ever — what a regex that does not compile becomes. */
const NEVER = /(?!)/;

/**
 * Compile once, match many.
 *
 * A hole matches as little as it can (`.+?`), so `{a} for {b}` against
 * `x for y for z` gives `a=x` rather than `a=x for y`. A hole never matches
 * nothing at all: an empty hole makes a pattern that matches every line with
 * its literal parts adjacent, which is not what anybody meant by "the value
 * goes here".
 */
export function compilePattern(pattern: LoggerPattern): CompiledPattern {
  /*
    A written regex is used as written. Its groups are read by NAME, because
    somebody writing `(GET|POST) (?<path>\S+)` has an unnamed group in front of
    the one they care about, and reading by position would hand them the verb.
    One that no longer compiles — a catalogue synced from a build with a
    different engine — matches nothing rather than taking the view down.
  */
  if (pattern.regex !== undefined) {
    const read = fromRegex(pattern.regex);
    const holes = 'error' in read ? [] : read.holes;
    try {
      return {
        whole: new RegExp(`^\\s*(?:${pattern.regex})\\s*$`),
        anywhere: new RegExp(pattern.regex),
        holes,
        named: true,
      };
    } catch {
      return { whole: NEVER, anywhere: NEVER, holes: [], named: true };
    }
  }

  const holes: string[] = [];
  let body = '';
  let last = 0;

  HOLE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HOLE.exec(pattern.template)) !== null) {
    body += escapeRe(pattern.template.slice(last, m.index));
    body += '(.+?)';
    holes.push(m[1]);
    last = m.index + m[0].length;
  }
  body += escapeRe(pattern.template.slice(last));

  return {
    whole: new RegExp(`^\\s*${body}\\s*$`),
    anywhere: new RegExp(body),
    holes,
  };
}

export interface PatternHit {
  fields: Record<string, string>;
  /** Where the pattern sits in the text, for highlighting. */
  start: number;
  end: number;
}

/**
 * Does this line come from that logger, and with what values.
 *
 * The anchored match is tried first: a logger's message is normally the whole
 * message, and an anchored hit cannot have been found by accident inside
 * something longer. The unanchored one is the fallback for a line that carries
 * a prefix the format did not take off.
 */
export function matchPattern(compiled: CompiledPattern, message: string): PatternHit | undefined {
  const whole = compiled.whole.exec(message);
  if (whole) return hitOf(compiled, whole, message);

  const anywhere = compiled.anywhere.exec(message);
  if (anywhere) return hitOf(compiled, anywhere, message);

  return undefined;
}

function hitOf(compiled: CompiledPattern, m: RegExpExecArray, message: string): PatternHit {
  const fields: Record<string, string> = {};
  compiled.holes.forEach((name, i) => {
    const value = compiled.named ? m.groups?.[name] : m[i + 1];
    if (value !== undefined) fields[name] = value.trim();
  });
  const start = m.index + (m[0].length - m[0].trimStart().length);
  return { fields, start, end: Math.min(message.length, start + m[0].trim().length) };
}

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** What the pattern looks like to a reader, with the holes marked. */
export function templateParts(template: string): { text: string; hole: boolean }[] {
  const parts: { text: string; hole: boolean }[] = [];
  let last = 0;
  HOLE.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = HOLE.exec(template)) !== null) {
    if (m.index > last) parts.push({ text: template.slice(last, m.index), hole: false });
    parts.push({ text: m[1], hole: true });
    last = m.index + m[0].length;
  }
  if (last < template.length) parts.push({ text: template.slice(last), hole: false });
  return parts;
}
