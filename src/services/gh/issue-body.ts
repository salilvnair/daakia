/**
 * Reading a submitted issue form back out of the issue body.
 *
 * This is the half of the field model that runs on every issue, and it is the
 * reason the board can group by Module and Environment when GitHub has no such
 * fields. When somebody submits an issue *form*, GitHub does not store the
 * answers anywhere structured — it renders them into an ordinary Markdown body
 * as `### Heading` blocks and keeps that. So the schema is in the YAML and the
 * value is in the body, and both are ours to read.
 *
 * Deliberately forgiving in one direction and strict in the other: a heading it
 * does not recognise is kept and ignored, but a value it cannot find is absent
 * rather than guessed. An issue whose body was hand-edited until the heading no
 * longer parses is reported as unmapped, never bucketed somewhere plausible.
 */

/** One `### Heading` and everything under it, trimmed. */
export interface BodyField {
  /** The heading text, exactly as written. */
  heading: string;
  /** The block beneath it. Empty string when the field was left blank. */
  value: string;
}

/*
  GitHub renders form answers at level 3. Levels 1 and 2 are accepted too
  because a hand-written template sometimes uses them and the intent is
  identical — but a `####` sub-heading inside an answer is content, not a new
  field, so the match stops at three.
*/
const HEADING = /^(#{1,3})\s+(.+?)\s*$/;

/** GitHub's literal text for a field somebody left blank. */
const NO_RESPONSE = /^_no response_$/i;

/**
 * Split a body into its heading blocks.
 *
 * Anything before the first heading is dropped: it is either empty or prose
 * somebody added above the form, and in neither case is it a field.
 */
export function parseIssueBody(body: string): BodyField[] {
  const lines = (body || '').split(/\r?\n/);
  const out: BodyField[] = [];
  let current: { heading: string; lines: string[] } | undefined;

  const flush = () => {
    if (!current) return;
    const value = current.lines.join('\n').trim();
    out.push({
      heading: current.heading,
      value: NO_RESPONSE.test(value) ? '' : value,
    });
    current = undefined;
  };

  let fenced = false;
  for (const line of lines) {
    /*
      A fenced block can contain anything, including a line starting with ###.
      Treating that as a heading splits a stack trace into two fields — which is
      exactly the kind of bug that only shows up on the one issue that pasted a
      Markdown document into "Steps to reproduce".
    */
    if (/^\s*```/.test(line)) fenced = !fenced;

    const m = !fenced ? line.match(HEADING) : null;
    if (m) {
      flush();
      current = { heading: m[2], lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  flush();
  return out;
}

/**
 * The value under one heading, or undefined.
 *
 * Matching is case- and whitespace-insensitive because a template's label and
 * the rendered heading have differed by a trailing space often enough to be
 * worth absorbing. It is NOT fuzzy beyond that: "Module" does not match
 * "Modules", because a near-miss that silently succeeds is worse than one that
 * shows up as unmapped and gets fixed.
 */
export function fieldValue(fields: BodyField[], heading: string): string | undefined {
  const want = heading.trim().toLowerCase();
  const hit = fields.find(f => f.heading.trim().toLowerCase() === want);
  if (!hit) return undefined;
  return hit.value === '' ? undefined : hit.value;
}

/**
 * Read every mapped dimension off one issue.
 *
 * `map` is heading -> dimension, so several headings can feed one dimension —
 * which is what keeps a repository readable after somebody renames a field and
 * splits its history in half.
 */
export function readDimensions(
  body: string,
  map: Record<string, string>,
): Record<string, string> {
  const fields = parseIssueBody(body);
  const out: Record<string, string> = {};
  for (const [heading, dimension] of Object.entries(map)) {
    if (out[dimension]) continue; // First heading that answers wins.
    const value = fieldValue(fields, heading);
    if (value) out[dimension] = value;
  }
  return out;
}
