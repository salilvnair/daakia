/**
 * Working out a log's format from a sample of it.
 *
 * Ported from `sevdokimov/log-viewer`'s `LvDefaultFormatDetector`, which is the
 * best deterministic version of this I have read. Three ideas carry it, and all
 * three are the opposite of what dk8s did before:
 *
 *  1. **Infer a whole format, not individual fields.** A line is read
 *     positionally — find the date, then look for a level before or after it,
 *     then a bracketed thread between them, then a logger before the message
 *     separator. What comes out is a pattern, which is then compiled and used
 *     as the single authority on every line. Fields are never guessed per line.
 *
 *  2. **Vote, and require a clear majority.** Each line proposes a pattern; the
 *     commonest wins only if it holds more than two thirds of the sample. A log
 *     that half matches something is not that thing.
 *
 *  3. **Abstain out loud.** `UNKNOWN` means "there is a date or a level here,
 *     but I cannot express the shape" — which is different from "there is
 *     nothing here", and both are different from a guess. Returning nothing is
 *     a correct answer, and the caller falls back to a builtin or to no format
 *     at all rather than to something invented.
 *
 * Nothing here is asked of a model. The previous implementation sent sample
 * lines to an LLM: non-deterministic, unavailable without a configured
 * provider, a round trip per pod, and impossible to write a test for.
 */
import { DATE_SHAPES, type LogFormat } from './log-format';

/**
 * A line that has a date or a level but a shape this cannot express.
 *
 * Distinct from `undefined`, which means the line offered nothing at all. The
 * distinction matters for the vote: a log where every line is UNKNOWN has a
 * format that is simply not covered here, and the honest response is to decline
 * rather than to let two stray lines that DID parse decide for all of them.
 */
export const UNKNOWN = '???';

/** Levels as they are actually spelled, longest first so WARNING beats WARN. */
const LEVEL_WORD =
  '(?:EMERGENCY|INFORMATIONAL|CRITICAL|EMERG|SEVERE|WARNING|FINEST|CONFIG|NOTICE'
  + '|VERBOSE|FATAL|DEBUG|ERROR|TRACE|ALERT|PANIC|FINER|WARN|INFO|FINE|CRIT)';

const DATE_RE = new RegExp(DATE_SHAPES);
const LEVEL_RE = new RegExp(String.raw`\b${LEVEL_WORD}\b`);
/** `[main]`, `[  http-nio-8080-exec-3]` — a bracketed run with no nesting. */
const BRACKET_RE = /\[([^[\]\n]{1,60})\]/;

interface Span { start: number; end: number; }

function find(re: RegExp, line: string, from = 0, to = line.length): Span | undefined {
  const slice = line.slice(from, to);
  const m = re.exec(slice);
  return m ? { start: from + m.index, end: from + m.index + m[0].length } : undefined;
}

/**
 * What sits between two fields, if it is only spaces.
 *
 * Returning `undefined` for anything else is the discipline that keeps this
 * from inventing formats: if there is punctuation or a word between the date
 * and the level, this is not `date level` and no amount of wanting it to be
 * makes it so.
 */
function gap(line: string, start: number, end: number): string | undefined {
  if (start > end) return undefined;
  const between = line.slice(start, end);
  return /^ *$/.test(between) ? (between.length ? ' ' : '') : undefined;
}

/**
 * A class-like token, in the position a logger occupies.
 *
 * Safe here in a way it was not in the old facet heuristics, because the
 * position is already known — this is the run immediately before the message
 * separator, not a scan of the whole line looking for something class-shaped.
 */
function looksLikeLogger(token: string): boolean {
  if (!token || token.length > 120) return false;
  // Brackets are allowed inside, but not at the front — see the LOGGER
  // placeholder. Tomcat's logger is `o.a.c.c.C.[Tomcat].[localhost].[/]`.
  if (token.startsWith('[')) return false;
  if (token.includes('.')) return /^[\w$[\]/-]+(\.[\w$[\]/-]+)+$/.test(token);
  return /^[A-Z][A-Za-z0-9_$]{2,}$/.test(token);
}

/**
 * The tail of a line: an optional logger, then the separator, then the message.
 *
 * Both `logger : message` (Spring) and `logger - message` (Logback's common
 * pattern) are handled, and a tail with no logger returns just the message. The
 * separator has to be surrounded by spaces, so a colon inside the message —
 * `POST /v2/ledger: retrying` — is not mistaken for one.
 */
function tail(line: string, from: number): string {
  const rest = line.slice(from);

  const m = /^ +([^\s]+) +([:-]) +/.exec(rest);
  if (m && looksLikeLogger(m[1]!)) {
    return ` %{LOGGER} ${m[2]} %{MESSAGE}`;
  }

  // No logger: whatever follows is the message, after one space or none.
  return rest.startsWith(' ') ? ' %{MESSAGE}' : '%{MESSAGE}';
}

/**
 * The pattern one line suggests, or UNKNOWN, or nothing.
 *
 * Reads the line positionally, in the order the fields can actually appear.
 */
export function detectPatternOfLine(line: string): string | undefined {
  const date = find(DATE_RE, line);

  if (!date) {
    // No date, but something that says this IS a log line rather than prose.
    // Cannot express it, so say so rather than proposing a shape.
    return LEVEL_RE.test(line) ? UNKNOWN : undefined;
  }

  // ── "LEVEL date message" — the level leads ──
  if (date.start > 0) {
    const level = find(LEVEL_RE, line, 0, date.start);
    if (!level || level.start !== 0) return UNKNOWN;
    const sep = gap(line, level.end, date.start);
    if (sep === undefined) return UNKNOWN;
    return `%{LEVEL}${sep}%{TIMESTAMP}${tail(line, date.end)}`;
  }

  // ── The date leads. What follows decides the rest. ──
  const after = line.slice(date.end);

  /*
    Spring Boot, which is common enough to be worth naming exactly.

    `<pid> --- [app] [thread] logger : message`, or the same without the app
    name. The `---` marker is unambiguous, so anything matching this shape is
    Spring and nothing else looks like it.
  */
  const spring = /^\s+([A-Z]+)\s+\d+\s+---\s+(\[[^\]]*\]\s*)+/.exec(after);
  if (spring) {
    const brackets = (after.match(/\[[^\]]*\]/g) ?? []).length;
    const threadPart = brackets >= 2 ? '%{DATA}[%{THREAD}]' : '[%{THREAD}]';
    const afterBrackets = date.end + spring[0].length;
    return `%{TIMESTAMP} %{LEVEL} %{NUM} --- ${threadPart}${tail(line, afterBrackets - 1)}`;
  }

  const level = find(LEVEL_RE, line, date.end);
  if (!level) {
    // A date and then a message. Common for access logs and plain output.
    return `%{TIMESTAMP}${tail(line, date.end)}`;
  }

  /*
    A bracketed thread between the date and the level, or after it.

    Logback's default puts it before — `date [thread] LEVEL logger - msg` — and
    log4j's common layout puts it after. Both are read here; the bracket has to
    sit wholly in the gap, or it is part of the message and not a thread.
  */
  const before = find(BRACKET_RE, line, date.end, level.start);
  if (before) {
    const g1 = gap(line, date.end, before.start);
    const g2 = gap(line, before.end, level.start);
    if (g1 === undefined || g2 === undefined) return UNKNOWN;
    return `%{TIMESTAMP}${g1}[%{THREAD}]${g2}%{LEVEL}${tail(line, level.end)}`;
  }

  const sep = gap(line, date.end, level.start);
  if (sep === undefined) return UNKNOWN;

  const afterLevel = find(BRACKET_RE, line, level.end);
  if (afterLevel) {
    const g = gap(line, level.end, afterLevel.start);
    if (g !== undefined) {
      return `%{TIMESTAMP}${sep}%{LEVEL}${g}[%{THREAD}]${tail(line, afterLevel.end)}`;
    }
  }

  return `%{TIMESTAMP}${sep}%{LEVEL}${tail(line, level.end)}`;
}

/**
 * Lines that cannot be events, and must not vote.
 *
 * The same guard `probeFormat` uses, and for the same reason: a crashlooping
 * pod's tail is all stack frames, and letting them vote means the majority is
 * always "no format".
 */
function cannotBeAnEvent(line: string): boolean {
  if (!line.trim()) return true;
  if (/^\s/.test(line)) return true;
  return /^(at\s|Caused by:|Suppressed:|\.{3}\s*\d+\s)/.test(line);
}

/** How much of the sample the winner must hold. log-viewer uses the same. */
const MAJORITY = 2 / 3;

export interface DetectionResult {
  pattern: string;
  /** Share of the voting lines that proposed it, 0–1. */
  confidence: number;
  /** How many lines were eligible to vote. */
  votes: number;
}

/**
 * Infer a pattern from a sample, or decline.
 *
 * Declines rather than guesses in three cases: too few usable lines to judge,
 * a winner that is UNKNOWN, and a winner that did not clear the majority. Each
 * is a real state — "not enough to see", "a shape I cannot write", and "this
 * log has more than one shape" — and none of them is served by returning the
 * best of a bad set.
 */
export function detectPattern(lines: string[]): DetectionResult | undefined {
  const usable = lines.filter(l => !cannotBeAnEvent(l));
  if (usable.length < 3) return undefined;

  const votes = new Map<string, number>();
  let counted = 0;

  for (const line of usable) {
    const pattern = detectPatternOfLine(line);
    if (!pattern) continue;
    counted++;
    votes.set(pattern, (votes.get(pattern) ?? 0) + 1);
  }

  if (counted < 3) return undefined;

  let best: string | undefined;
  let bestCount = 0;
  for (const [pattern, n] of votes) {
    if (n > bestCount) { best = pattern; bestCount = n; }
  }

  if (!best || best === UNKNOWN) return undefined;
  const confidence = bestCount / counted;
  if (confidence <= MAJORITY) return undefined;

  return { pattern: best, confidence, votes: counted };
}

/**
 * The detected format, ready to use.
 *
 * Named after what it is rather than after the pod, because the same shape
 * turns up across a whole cluster and a name like "Detected — zp-backend"
 * would be wrong the moment it is reused.
 */
export function detectFormat(lines: string[]): LogFormat | undefined {
  const found = detectPattern(lines);
  if (!found) return undefined;

  return {
    id: 'detected',
    name: 'Detected from the log',
    kind: 'pattern',
    pattern: found.pattern,
  };
}
