/**
 * Deciding what to hide in a file read out of a pod, and what `copy` gives you.
 *
 * Pulled out of the viewer because this is the security-relevant part: a config
 * file opened from a production pod is exactly where a secret sits, and the
 * common case is somebody reading it while screen-sharing. A bug here is not a
 * rendering glitch.
 */

/**
 * Keys whose values get masked.
 *
 * Matched on the KEY, never on the value. Entropy is a bad signal in a config
 * file — half the base64 in one is a certificate thumbprint or an encoded URL
 * that nobody minds showing, and masking those trains people to hit reveal on
 * everything, which defeats the point.
 */
export const SECRET_KEY =
  /(pass(word|wd)?|secret|token|apikey|api[_-]?key|private[_-]?key|credential|auth[_-]?key)/i;

export interface RedactedLine {
  n: number;
  text: string;
  /** Index where the masked run starts. Absent when nothing is hidden. */
  secretFrom?: number;
}

/**
 * Split a file into lines, marking the ones holding a secret.
 *
 * A line counts when it has a `key = value` or `key: value` shape AND the key
 * side matches. The shape check is what keeps prose out of it: a comment
 * reading `# the password is rotated weekly` has no assignment and stays
 * visible, which is right — it is documentation, not a credential.
 */
export function redactLines(text: string): RedactedLine[] {
  return text.split('\n').map((raw, i) => {
    const n = i + 1;
    // A comment is never an assignment, whatever words are in it.
    if (/^\s*[#;]/.test(raw) || /^\s*\/\//.test(raw)) return { n, text: raw };

    const eq = raw.search(/[=:]/);
    if (eq <= 0) return { n, text: raw };
    if (!SECRET_KEY.test(raw.slice(0, eq))) return { n, text: raw };

    const from = eq + 1;
    // An empty value has nothing to hide, and masking it would claim a
    // credential is set where none is.
    if (!raw.slice(from).trim()) return { n, text: raw };
    return { n, text: raw, secretFrom: from };
  });
}

/**
 * What the clipboard gets.
 *
 * Copy takes what is on screen. That is the whole rule, and it is what makes
 * masking safe to offer at all: a masked value copies masked, so pasting into
 * a ticket cannot leak something the screen was hiding. Revealing is the
 * deliberate act, and a revealed line copies in full — because copy has not
 * stopped meaning "what I can see".
 *
 * The alternative, a clipboard quietly holding a secret the screen did not
 * show, is the version that gets somebody in trouble.
 */
export function copyText(lines: RedactedLine[], revealed: ReadonlySet<number>): string {
  return lines.map(l => {
    if (l.secretFrom === undefined || revealed.has(l.n)) return l.text;
    return l.text.slice(0, l.secretFrom) + '••••••••';
  }).join('\n');
}
