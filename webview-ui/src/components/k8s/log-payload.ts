/**
 * The part of a log line that is not a sentence.
 *
 * Applications log two things at once: a message somebody wrote, and a payload
 * a machine produced. `BcblClient calling bcbl api for request:A-4470 payload
 * {"requestId":…}` is a sentence with 1.4 KB of JSON glued to its end, and a
 * log view that treats the whole thing as text makes the reader find the
 * structure by eye — or copy the line out to a JSON viewer, which is what
 * everyone actually does.
 *
 * So the line is split: the sentence stays a sentence, and the payload is
 * handed over as something that can be drawn as a tree.
 *
 * ── What is deliberately NOT here ──
 *
 * Nothing guesses. A payload is only claimed when it parses: JSON that
 * `JSON.parse` accepts, XML with a tag that closes, `k=v` pairs in the shape a
 * logfmt writer produces. A half-written line — the pod died mid-flush — is
 * left as text, because a tree built out of a guess is worse than the raw line
 * it replaced.
 *
 * Multi-line payloads (a YAML dump, a pretty-printed body over forty lines)
 * arrive as continuations and are folded by the stack-trace path instead. They
 * are not handled here, and `shape` has no `yaml` for that reason.
 */

export type PayloadShape = 'json' | 'xml' | 'kv';

export interface LogPayload {
  shape: PayloadShape;
  /** The message with the payload taken off — what the row still reads as. */
  prefix: string;
  /** The payload exactly as the pod wrote it. Copy and Raw both mean this. */
  source: string;
  /** Parsed, for `json` and `kv`. `xml` is drawn from its text. */
  value?: unknown;
  /** For the chip on the row: `14 keys`, `3 entries`, `soap:Fault`. */
  summary: string;
}

export interface PayloadOptions {
  /** Shapes to look for. A shape left out is never claimed. */
  shapes?: PayloadShape[];
  /**
   * Longest line worth parsing, in characters.
   *
   * A 4 MB line of base64 is not a payload anybody wants drawn, and parsing it
   * on every render of a 10,000-line buffer is how a log view stops scrolling.
   */
  maxChars?: number;
}

const DEFAULT_SHAPES: PayloadShape[] = ['json', 'xml', 'kv'];
const DEFAULT_MAX = 256 * 1024;

/** Keys whose values are not shown until the reader asks. */
const SECRET_KEY = /(^|[._-])(token|password|passwd|secret|authorization|auth|apikey|api_key|credential|cookie|pin|otp)([._-]|$)/i;

export function isSecretKey(key: string): boolean {
  return SECRET_KEY.test(key);
}

/**
 * Find the payload in one line, if it has one.
 *
 * Returns `undefined` for the overwhelming majority of lines, which are
 * sentences — so this runs on every visible row and has to fail fast: the
 * cheap character test comes before any parsing.
 */
export function findPayload(text: string, opts: PayloadOptions = {}): LogPayload | undefined {
  const shapes = opts.shapes ?? DEFAULT_SHAPES;
  const maxChars = opts.maxChars ?? DEFAULT_MAX;
  if (!text || text.length > maxChars) return undefined;

  if (shapes.includes('json')) {
    const json = findJson(text);
    if (json) return json;
  }
  if (shapes.includes('xml')) {
    const xml = findXml(text);
    if (xml) return xml;
  }
  if (shapes.includes('kv')) {
    const kv = findKeyValues(text);
    if (kv) return kv;
  }
  return undefined;
}

// ── JSON ────────────────────────────────────────────────────────────────────

/**
 * The first `{` or `[` that opens something parseable, to the end of the line.
 *
 * Scanning from each opener rather than only the first: a message like
 * `updating {} for order A-4470 {"id":…}` has a brace that opens nothing, and
 * stopping at it would miss the body two words later.
 */
function findJson(text: string): LogPayload | undefined {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== '{' && ch !== '[') continue;
    const end = matchingEnd(text, i);
    if (end === -1) continue;

    const source = text.slice(i, end + 1);
    // Two characters cannot be an object worth drawing, and `{}` in a message
    // is far more often a logger's own placeholder than a payload.
    if (source.length < 3) continue;

    let value: unknown;
    try {
      value = JSON.parse(source);
    } catch {
      continue;
    }
    if (value === null || typeof value !== 'object') continue;

    return {
      shape: 'json',
      prefix: text.slice(0, i).trimEnd(),
      source,
      value,
      summary: summarise(value),
    };
  }
  return undefined;
}

/** Index of the brace that closes the one at `start`, or -1. */
function matchingEnd(text: string, start: number): number {
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function summarise(value: unknown): string {
  if (Array.isArray(value)) {
    return `${value.length} ${value.length === 1 ? 'entry' : 'entries'}`;
  }
  const keys = Object.keys(value as Record<string, unknown>);
  return `${keys.length} ${keys.length === 1 ? 'key' : 'keys'}`;
}

// ── XML ─────────────────────────────────────────────────────────────────────

/**
 * A tag that closes itself, somewhere in the line.
 *
 * Named after the first element, because that is what identifies it in a log:
 * `soap:Envelope` and `CreditCheckResponse` are the two questions a reader has.
 * The body is kept as text — an XML tree is drawn from the source by the
 * renderer, and re-serialising it here would lose the attribute order the pod
 * wrote.
 */
function findXml(text: string): LogPayload | undefined {
  const open = /<([A-Za-z_][\w.:-]*)(\s[^<>]*)?>/.exec(text);
  if (!open) return undefined;

  const name = open[1];
  const closeTag = `</${name}>`;
  const closeAt = text.lastIndexOf(closeTag);
  if (closeAt < open.index) return undefined;

  const source = text.slice(open.index, closeAt + closeTag.length);
  return {
    shape: 'xml',
    prefix: text.slice(0, open.index).trimEnd(),
    source,
    summary: name,
  };
}

// ── key=value ───────────────────────────────────────────────────────────────

/**
 * `status=504 took=30001ms upstream="ledger-svc:8080"` — logfmt, more or less.
 *
 * Three pairs at minimum. Two is a sentence with an equals sign in it
 * (`active=10 idle=0` reads fine as prose), and drawing that as a table is
 * noise where the line was already clear.
 */
const KV_PAIR = /([A-Za-z_][\w.-]*)=("([^"\\]|\\.)*"|[^\s]+)/g;
const MIN_PAIRS = 3;

function findKeyValues(text: string): LogPayload | undefined {
  KV_PAIR.lastIndex = 0;
  const pairs: [string, string][] = [];
  let first = -1;
  let last = -1;
  let m: RegExpExecArray | null;

  while ((m = KV_PAIR.exec(text)) !== null) {
    if (first === -1) first = m.index;
    last = m.index + m[0].length;
    const raw = m[2];
    const value = raw.startsWith('"') && raw.endsWith('"')
      ? unquote(raw)
      : raw;
    pairs.push([m[1], value]);
  }
  if (pairs.length < MIN_PAIRS) return undefined;

  return {
    shape: 'kv',
    prefix: text.slice(0, first).trimEnd(),
    source: text.slice(first, last),
    value: Object.fromEntries(pairs),
    summary: `${pairs.length} fields`,
  };
}

function unquote(raw: string): string {
  try {
    return JSON.parse(raw) as string;
  } catch {
    return raw.slice(1, -1);
  }
}

/**
 * One-line XML broken onto its own lines, indented by nesting.
 *
 * Text-level, not a parse: the source came off a pod and may well be a
 * fragment, and a parser's answer to a fragment is an error where a reader
 * wants the four lines they can already almost read. Every character of the
 * original survives — this only decides where the newlines go.
 */
export function prettyXml(source: string): string[] {
  const parts = source.replace(/>\s*</g, '>\n<').split('\n');
  const out: string[] = [];
  let depth = 0;

  for (const part of parts) {
    const piece = part.trim();
    if (!piece) continue;
    const closing = piece.startsWith('</');
    const selfContained = /^<[^>]+\/>$/.test(piece) || /^<([^\s>]+)[^>]*>.*<\/\1>$/.test(piece);
    const declaration = piece.startsWith('<?') || piece.startsWith('<!');

    if (closing) depth = Math.max(0, depth - 1);
    out.push('  '.repeat(depth) + piece);
    if (!closing && !selfContained && !declaration && piece.startsWith('<')) depth++;
  }
  return out;
}

// ── Secrets ─────────────────────────────────────────────────────────────────

/** What a hidden value is replaced by, so the shape of the payload survives. */
export const HIDDEN = '••••••';

/**
 * A copy with secret-looking values replaced.
 *
 * The copy, not the original: Copy, Raw and Export all mean the line as the pod
 * wrote it, and a reader who asks to see a token has to get the token. This is
 * only what is drawn.
 */
export function maskSecrets(value: unknown, depth = 0): unknown {
  if (depth > 12 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(v => maskSecrets(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSecretKey(key) && v !== null && typeof v !== 'object'
      ? HIDDEN
      : maskSecrets(v, depth + 1);
  }
  return out;
}
