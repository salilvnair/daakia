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
 * Multi-line payloads arrive as continuations. A YAML dump — a config printed
 * at startup — is joined back into one event by the fold (`foldStackTraces`)
 * and read here by `yamlPayload`; anything else multi-line stays text.
 */

export type PayloadShape = 'json' | 'xml' | 'kv' | 'yaml';

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

const DEFAULT_SHAPES: PayloadShape[] = ['json', 'xml', 'kv', 'yaml'];
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
/**
 * The line as a sentence: the payload taken out, since the chip beside it
 * stands for it. `keepFrom` is where the first search hit starts — a hit
 * inside the payload keeps the whole line, because a match the reader cannot
 * see is a match they will think is wrong. A line that is nothing but its
 * payload keeps it too.
 */
export function sentenceWithout(full: string, payload: LogPayload | undefined, keepFrom?: (at: number) => boolean): string {
  if (!payload || payload.shape === 'yaml' || !payload.prefix) return full;
  const at = full.indexOf(payload.source);
  if (at < 0) return full;
  if (keepFrom?.(at)) return full;
  const after = full.slice(at + payload.source.length).trim();
  return after ? `${full.slice(0, at).trimEnd()} ${after}` : full.slice(0, at).trimEnd();
}

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

// ── Why a line was not drawn ────────────────────────────────────────────────

/**
 * A line that looks like it carries a payload but will not be drawn — and why.
 *
 * Two reasons, and a reader needs to be told either one: a line longer than
 * the limit in Settings is not parsed at all, and a line cut at 32 KB when it
 * was read has lost the end of its body, so it can no longer parse. Silence
 * would read as "there is no payload here".
 */
export function payloadNote(
  text: string, opts: PayloadOptions & { truncated?: boolean } = {},
): string | undefined {
  const shapes = opts.shapes ?? DEFAULT_SHAPES;
  const looks = (shapes.includes('json') && /[{[]/.test(text)) || (shapes.includes('xml') && /<[A-Za-z_]/.test(text));
  if (!looks) return undefined;
  const maxChars = opts.maxChars ?? DEFAULT_MAX;
  if (text.length > maxChars) {
    return `${Math.round(text.length / 1024)} KB — over the ${Math.round(maxChars / 1024)} KB limit set in Settings → DK8S → Logs, so it stays raw`;
  }
  if (opts.truncated) return 'cut at 32 KB when it was read — the payload is incomplete, so it stays raw';
  return undefined;
}

// ── XML, as a tree ──────────────────────────────────────────────────────────

export interface XmlNode {
  name: string;
  attrs: [string, string][];
  children: XmlNode[];
  /** Text directly inside, trimmed; a leaf is a node with text and no children. */
  text?: string;
}

/**
 * The element tree of an XML payload, or `undefined` if it does not close.
 *
 * Tolerant where a log is untidy (a declaration, comments, CDATA, stray
 * whitespace) and strict where a guess would mislead: a tag that closes the
 * wrong element, or one that never closes, and there is no tree — the view
 * falls back to indented text, which is still every character the pod wrote.
 */
export function parseXmlTree(source: string): XmlNode | undefined {
  const root: XmlNode = { name: '#root', attrs: [], children: [] };
  const stack: XmlNode[] = [root];
  const token = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = token.exec(source)) !== null) {
    if (m.index !== consumed) return undefined;
    consumed = m.index + m[0].length;
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) { top.text = ((top.text ?? '') + m[1]).trim() || undefined; continue; }
    if (m[3] === undefined && m[6] === undefined) continue; // comment, declaration, doctype
    if (m[6] !== undefined) {
      const t = m[6].trim();
      if (t) top.text = top.text ? `${top.text} ${t}` : t;
      continue;
    }
    const closing = m[2];
    const name = m[3];
    const rawAttrs = m[4];
    const selfClosing = m[5];
    if (closing) {
      if (top.name !== name || stack.length === 1) return undefined;
      stack.pop();
      continue;
    }
    const attrs: [string, string][] = [];
    for (const a of (rawAttrs ?? '').matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs.push([a[1], a[2] ?? a[3] ?? '']);
    const node: XmlNode = { name, attrs, children: [] };
    top.children.push(node);
    if (!selfClosing) stack.push(node);
  }
  if (consumed !== source.length || stack.length !== 1 || root.children.length !== 1) return undefined;
  return root.children[0];
}

// ── YAML, from a multi-line block ───────────────────────────────────────────

/**
 * A config dump, read as YAML — or `undefined` if any line is not YAML.
 *
 * Deliberately a small reader, not a YAML library: the only YAML a log line
 * carries is the block-style dump an application prints at startup (`key:
 * value`, nesting by indent, `- item` lists). Every line has to fit that, so a
 * paragraph of prose with a colon in it is never claimed; two keys at least,
 * because one `key: value` line is a sentence.
 */
export function parseYamlBlock(lines: string[]): Record<string, unknown> | undefined {
  const rows = lines.filter(l => l.trim() && !/^\s*#/.test(l));
  if (rows.length < 2) return undefined;
  const indentOf = (l: string) => l.length - l.trimStart().length;
  const base = Math.min(...rows.map(indentOf));
  type Frame = { indent: number; value: Record<string, unknown> | unknown[] };
  const root: Record<string, unknown> = {};
  const stack: Frame[] = [{ indent: -1, value: root }];
  let pendingKey: { obj: Record<string, unknown>; key: string; indent: number } | undefined;
  let keys = 0;

  for (const line of rows) {
    const indent = indentOf(line) - base;
    const body = line.trim();

    /* A key with nothing after it opens a block: a map, or a list if the next line is `- `. */
    if (pendingKey) {
      if (indent <= pendingKey.indent) {
        pendingKey.obj[pendingKey.key] = null;
      } else {
        const child: Record<string, unknown> | unknown[] = body.startsWith('- ') || body === '-' ? [] : {};
        pendingKey.obj[pendingKey.key] = child;
        stack.push({ indent: pendingKey.indent, value: child });
      }
      pendingKey = undefined;
    }
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].value;

    const item = /^-\s+(.*)$/.exec(body);
    if (item) {
      if (!Array.isArray(parent)) return undefined;
      parent.push(yamlScalar(item[1]));
      continue;
    }
    const kv = /^("[^"]+"|'[^']+'|[A-Za-z_$][\w.$-]*)\s*:(?:\s+(.*))?$/.exec(body);
    if (!kv || Array.isArray(parent)) return undefined;
    const key = kv[1].replace(/^["']|["']$/g, '');
    keys++;
    if (kv[2] === undefined || kv[2] === '') pendingKey = { obj: parent, key, indent };
    else parent[key] = yamlScalar(kv[2]);
  }
  if (pendingKey) pendingKey.obj[pendingKey.key] = null;
  return keys >= 2 ? root : undefined;
}

function yamlScalar(raw: string): unknown {
  const v = raw.replace(/\s+#.*$/, '').trim();
  if (/^".*"$|^'.*'$/.test(v)) return v.slice(1, -1);
  if (v === 'true' || v === 'false') return v === 'true';
  if (v === 'null' || v === '~') return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

/** A YAML block under a line, as a payload the row can offer like any other. */
export function yamlPayload(prefix: string, lines: string[]): LogPayload | undefined {
  const value = parseYamlBlock(lines);
  if (!value) return undefined;
  const n = Object.keys(value).length;
  return {
    shape: 'yaml',
    prefix: prefix.trimEnd(),
    source: lines.join('\n'),
    value,
    summary: `${n} ${n === 1 ? 'key' : 'keys'} · ${lines.length} lines`,
  };
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
