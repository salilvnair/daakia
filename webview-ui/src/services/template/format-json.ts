/**
 * Prettifying a JSON body that has templates in it.
 *
 * ── Why `JSON.parse` is not enough ──
 *
 * `{"n": {{randomInt 1 9}}}` is a body somebody will write, and no JSON
 * parser will ever accept it. Formatting is exactly when you want the
 * template there — you are tidying a request you are still writing — so the
 * only version of this that helps is one that can format around them.
 *
 * Each `{{…}}` is swapped for a placeholder before parsing and swapped back
 * after: bare in a value position it goes in quoted, so the document is valid
 * JSON; inside a string it goes in as-is, so the string it was part of stays
 * one string. The formatter never sees a template and the output never loses
 * one.
 *
 * A template may hold quotes of its own — `{{pickRandom 'a' "b"}}` — so the
 * scan steps over a whole template rather than reading through it. Reading
 * through was the version that decided a body had an unterminated string.
 */

const OPEN = '{{';
const CLOSE = '}}';
const MARK = '__DK_TPL_';

interface Found {
  /** The template exactly as written, braces included. */
  text: string;
  /** It was already inside a JSON string, so its stand-in must not be quoted. */
  inString: boolean;
}

/**
 * Every template in the text, and whether it sits inside a string.
 *
 * Returns null when the text cannot be scanned safely — an unclosed `{{`, or
 * text that already contains the placeholder. Neither is worth guessing at.
 */
export function findTemplates(text: string): { found: Found[]; masked: string } | null {
  if (text.includes(MARK)) return null;

  const found: Found[] = [];
  let masked = '';
  let inString = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === '\\' && inString) {
      masked += text.slice(i, i + 2);
      i += 2;
      continue;
    }

    if (text.startsWith(OPEN, i)) {
      const end = text.indexOf(CLOSE, i + OPEN.length);
      const nl = text.indexOf('\n', i);
      /* A `{{` with no `}}` after it on the same line is not a template — it
         is half-typed, and rewriting it would surprise somebody mid-word. */
      if (end === -1 || (nl !== -1 && nl < end)) return null;

      const whole = text.slice(i, end + CLOSE.length);
      const stand = `${MARK}${found.length}__`;
      masked += inString ? stand : `"${stand}"`;
      found.push({ text: whole, inString });
      i = end + CLOSE.length;
      continue;
    }

    if (ch === '"') inString = !inString;
    masked += ch;
    i++;
  }

  if (inString) return null;
  return { found, masked };
}

/**
 * The body, formatted, with every template where it was.
 *
 * `null` means the body is not JSON even once the templates are accounted
 * for — a missing comma, an unclosed brace — and the caller should leave the
 * text alone rather than mangle it.
 */
export function formatJsonWithTemplates(text: string, indent = 2): string | null {
  if (!text.trim()) return null;

  if (!text.includes(OPEN)) {
    try {
      return JSON.stringify(JSON.parse(text), null, indent);
    } catch {
      return null;
    }
  }

  const scan = findTemplates(text);
  if (!scan) return null;

  let out: string;
  try {
    out = JSON.stringify(JSON.parse(scan.masked), null, indent);
  } catch {
    return null;
  }

  scan.found.forEach((t, i) => {
    const stand = `${MARK}${i}__`;
    /*
      A bare template went in quoted, so its quotes come back out with it.
      Doing this before the unquoted pass matters: the quoted form contains
      the unquoted one, and replacing the inner text first would leave the
      quotes behind and turn a number into a string.
    */
    out = t.inString
      ? out.replace(stand, t.text)
      : out.replace(`"${stand}"`, t.text);
  });

  return out;
}
