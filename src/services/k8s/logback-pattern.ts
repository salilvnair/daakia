/**
 * Reading a Logback or log4j conversion pattern.
 *
 * The point is that the answer already exists. An application's layout is
 * written down in its own `logback.xml` or `log4j2.xml`:
 *
 *     %d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n
 *
 * Someone who has that string should be able to paste it into Settings rather
 * than translate it into `%{TIMESTAMP} [%{THREAD}] %{LEVEL} %{LOGGER} - ...`
 * by hand — a translation that is tedious, easy to get subtly wrong, and
 * pointless when the mapping is mechanical.
 *
 * ── What is deliberately ignored ──
 *
 * Format modifiers (`%-5level`, `%.30logger`), the argument to a converter
 * (`%d{HH:mm:ss}`, `%logger{36}`) and colour wrappers (`%highlight(...)`) all
 * affect how WIDE a field is rendered, not where it sits or what it contains.
 * Our placeholders already match a run of spaces rather than a fixed column,
 * so honouring the widths would add precision nobody can use — and honouring
 * the date argument would mean implementing a date-format compiler to produce
 * a regex we already have.
 *
 * Anything unrecognised becomes `%{DATA}`, which matches lazily. That keeps an
 * exotic converter from breaking the whole pattern while still anchoring the
 * fields either side of it.
 */

/**
 * Conversion words, mapped to our placeholders.
 *
 * Both Logback's and log4j's spellings, since the two overlap and nobody
 * remembers which library used which alias.
 */
const CONVERTERS: Record<string, string> = {
  // Timestamp
  d: '%{TIMESTAMP}', date: '%{TIMESTAMP}',
  // Level
  p: '%{LEVEL}', le: '%{LEVEL}', level: '%{LEVEL}',
  // Logger
  c: '%{LOGGER}', lo: '%{LOGGER}', logger: '%{LOGGER}',
  // The class that called, which sits where a logger does.
  C: '%{LOGGER}', class: '%{LOGGER}',
  // Thread
  t: '%{THREAD}', thread: '%{THREAD}', tn: '%{THREAD}', threadName: '%{THREAD}',
  // Message — and the throwable, which is the continuation lines below it.
  m: '%{MESSAGE}', msg: '%{MESSAGE}', message: '%{MESSAGE}',
  // Process id, which Spring prints between the level and the `---`.
  pid: '%{NUM}', processId: '%{NUM}',
};

/**
 * Converters that produce output we cannot pin down, and that must not become
 * `%{DATA}` either.
 *
 * `%n` is the line break, which is where our pattern ends anyway. The
 * throwable converters expand to the stack trace — many lines, all of which
 * are continuations by the time they reach us, so a pattern that tried to
 * match them would be describing something it never sees.
 */
const DROPPED = new Set(['n', 'ex', 'throwable', 'exception', 'rEx', 'rootException', 'xEx', 'xThrowable']);

/** `%-5level`, `%.30logger`, `%20.30c` — a width spec before the word. */
const SPEC = String.raw`(?:-?\d+)?(?:\.-?\d+)?`;

/**
 * Does this look like a conversion pattern rather than one of ours?
 *
 * `%{NAME}` is ours; `%d`, `%-5level`, `%thread` are theirs. Told apart by the
 * brace, which our syntax always has and theirs never does.
 */
export function isConversionPattern(s: string): boolean {
  if (!s.includes('%')) return false;
  // Any `%` not followed by `{` is a conversion word.
  return /%[^{]/.test(s);
}

/**
 * Translate a Logback or log4j pattern into ours.
 *
 * Unrecognised converters become `%{DATA}` rather than an error: a pattern is
 * usually mostly recognisable, and the fields we did understand are still
 * worth having. A pattern that is entirely unrecognised comes out as a run of
 * `%{DATA}` and will simply fail to identify anything, which the probe then
 * reports honestly as a poor match.
 */
export function fromConversionPattern(pattern: string): string {
  let out = '';
  let i = 0;

  while (i < pattern.length) {
    const pc = pattern.indexOf('%', i);
    if (pc === -1) { out += pattern.slice(i); break; }
    out += pattern.slice(i, pc);
    i = pc + 1;

    if (pattern[i] === '%') { out += '%'; i++; continue; }   // an escaped percent

    // Skip the width spec, which changes padding and not position.
    const spec = new RegExp(`^${SPEC}`).exec(pattern.slice(i));
    i += spec?.[0].length ?? 0;

    const word = /^[A-Za-z]+/.exec(pattern.slice(i));
    if (!word) { out += '%'; continue; }
    const name = word[0];
    i += name.length;

    /*
      A converter's argument, in braces, and possibly nested.

      `%d{yyyy-MM-dd HH:mm:ss.SSS}` and `%replace(%msg){'a','b'}` both carry
      one. Counted rather than matched to the first `}`, because a date format
      can itself contain braces in some layouts.
    */
    if (pattern[i] === '{') {
      let depth = 0;
      while (i < pattern.length) {
        if (pattern[i] === '{') depth++;
        else if (pattern[i] === '}') { depth--; if (depth === 0) { i++; break; } }
        i++;
      }
    }

    /*
      A wrapping converter: `%highlight(...)`, `%green(...)`, `%replace(...)`.

      The parenthesised body is itself a pattern, so it is translated and
      inlined — the colour is a rendering concern and the fields inside it are
      real fields.
    */
    if (pattern[i] === '(') {
      let depth = 0;
      const start = i + 1;
      while (i < pattern.length) {
        if (pattern[i] === '(') depth++;
        else if (pattern[i] === ')') { depth--; if (depth === 0) break; }
        i++;
      }
      const body = pattern.slice(start, i);
      i++;                                  // past the ')'
      out += fromConversionPattern(body);
      continue;
    }

    if (DROPPED.has(name)) continue;
    out += CONVERTERS[name] ?? '%{DATA}';
  }

  // A trailing `%{DATA}` matches nothing useful and stops the pattern anchoring
  // on the message, so it is dropped.
  return out.replace(/%\{DATA\}\s*$/, '').trimEnd();
}
