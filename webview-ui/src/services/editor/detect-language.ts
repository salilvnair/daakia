/**
 * What language is this text, so the editor can colour it.
 *
 * ── Why it needed to be more than three cases ──
 *
 * The diff view guessed from the first character alone: `{` or `[` meant JSON,
 * `<` meant XML or HTML, and everything else was plaintext. That was fine when
 * the only thing it ever showed was a response body. Since "Compare with
 * clipboard" reaches every editor in the app, it is now just as likely to be
 * handed a pre-request script, a YAML manifest or a SQL statement — all of
 * which arrived monochrome, which reads as broken rather than as unrecognised.
 *
 * Ordered by how certain each test is: a shape that can only be one thing
 * first, keyword evidence after, plaintext when nothing is convincing. A wrong
 * language is worse than none — it colours the text as if it means something
 * else — so each rule wants real evidence, not a lucky character.
 */
import type { EditorLanguage } from '@salilvnair/dui';

/** Two or more of these, and the guess is worth making. */
function score(text: string, patterns: RegExp[]): number {
  return patterns.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);
}

export function detectLanguage(content: string): EditorLanguage {
  const text = content.trim();
  if (!text) return 'plaintext';

  // Parses as JSON: not a guess at all.
  if (/^[[{]/.test(text)) {
    try {
      JSON.parse(text);
      return 'json';
    } catch {
      /* Truncated or streaming JSON still reads best as JSON. */
      if (/^\s*[[{][\s\S]*["}\]]\s*$/.test(text) && /"\s*:/.test(text)) return 'json';
    }
  }

  if (text.startsWith('<')) {
    return /<!DOCTYPE html|<html|<body|<div\b/i.test(text) ? 'html' : 'xml';
  }

  // A GraphQL document — checked before JS, since `query {` would otherwise
  // look like a bare block.
  if (/^\s*(query|mutation|subscription|fragment)\s+\w|^\s*\{\s*\w+\s*(\(|\{)/.test(text)
      && !/[;=]/.test(text.slice(0, 80))) {
    return 'graphql';
  }

  if (score(text, [
    /\b(function|const|let|var|=>|await|async)\b/,
    /\b(dk|console|require|import|export|return)\b/,
    /[;{}]\s*$/m,
  ]) >= 2) {
    // The type annotations are what separate the two, and Monaco colours
    // TypeScript's extra syntax only if it is told.
    return /:\s*(string|number|boolean|any|unknown|void)\b|\binterface\s+\w|\btype\s+\w+\s*=/.test(text)
      ? 'typescript'
      : 'javascript';
  }

  if (score(text, [
    /\b(SELECT|INSERT INTO|UPDATE|DELETE FROM|CREATE TABLE|ALTER TABLE)\b/i,
    /\b(FROM|WHERE|JOIN|GROUP BY|ORDER BY|VALUES)\b/i,
  ]) >= 2) return 'sql';

  if (/^\s*(#.*\n)*\s*[\w.-]+:\s*(\S|$)/m.test(text) && !/[{};]\s*$/m.test(text)) {
    return 'yaml';
  }

  if (/^\s*(#{1,6}\s|\* |- |\d+\. |```)/m.test(text) && /\n/.test(text)) return 'markdown';

  if (/^[^{}]*\{[^{}]*:[^{};]*;[\s\S]*\}/.test(text) && !/\bfunction\b/.test(text)) return 'css';

  if (score(text, [/^\s*(def|class)\s+\w+/m, /^\s*(import|from)\s+\w+/m, /:\s*$/m]) >= 2) return 'python';

  return 'plaintext';
}
