/**
 * The redaction gate.
 *
 * A heap dump is the most sensitive artifact a production system emits. It
 * contains every string that was in memory at the moment it was taken: session
 * tokens, passwords held in char[] before being cleared, customer records,
 * private keys, whole request bodies. Sending that to a hosted model would be a
 * data breach, and any tool that does it casually is one disclosure away from a
 * very bad day.
 *
 * So this module exists to make one guarantee: **string contents never leave the
 * machine.** What crosses the boundary is shape — length, character classes,
 * duplication counts — which is enough for a model to reason about a
 * duplicate-string problem or an oversized cache without ever seeing a value.
 *
 * The scan is also useful in its own right. Credentials sitting in a heap are
 * worth reporting as a finding, so "142,000 values match a JWT pattern" is
 * surfaced to the user even though the values themselves are not.
 */

/** Patterns worth naming when they show up in memory. */
const SECRET_PATTERNS: { kind: string; test: RegExp; note: string }[] = [
  { kind: 'JWT', test: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./, note: 'JSON Web Token' },
  { kind: 'AWS access key', test: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/, note: 'AWS access key id' },
  { kind: 'Private key', test: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/, note: 'PEM private key block' },
  { kind: 'Bearer token', test: /\bBearer\s+[A-Za-z0-9._~+/-]{16,}/, note: 'Authorization header value' },
  { kind: 'Basic auth', test: /\bBasic\s+[A-Za-z0-9+/]{16,}={0,2}/, note: 'Base64 basic-auth credentials' },
  { kind: 'GitHub token', test: /\bgh[pousr]_[A-Za-z0-9]{16,}\b/, note: 'GitHub personal access token' },
  { kind: 'Slack token', test: /\bxox[baprs]-[A-Za-z0-9-]{10,}/, note: 'Slack API token' },
  { kind: 'Google API key', test: /\bAIza[0-9A-Za-z_-]{35}\b/, note: 'Google API key' },
  { kind: 'Connection string', test: /\b(?:jdbc|mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqp):\/\/[^\s"']*:[^\s"'@]+@/, note: 'URL with inline credentials' },
  { kind: 'Password field', test: /"(?:password|passwd|pwd|secret|api_?key|access_?token|client_?secret)"\s*:\s*"[^"]{3,}"/i, note: 'Credential in a JSON payload' },
  { kind: 'Email address', test: /\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,255}\.[A-Za-z]{2,}\b/, note: 'Personal data' },
  { kind: 'Card number', test: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/, note: 'Possible payment card number' },
];

export interface SecretFinding {
  kind: string;
  note: string;
  /** How many sampled values matched. A sample, not a census — see `scanned`. */
  matches: number;
}

export interface DuplicateShape {
  /** Character-class silhouette, never the value. */
  shape: string;
  length: number;
  count: number;
  /** Bytes wasted on the copies beyond the first, assuming 2 bytes/char. */
  wastedBytes: number;
}

export interface StringScan {
  scanned: number;
  /** Total textual arrays in the dump — `scanned` is a uniform sample of these. */
  population: number;
  /** scanned / population, so counts below can be extrapolated honestly. */
  coverage: number;
  /** Distinct shapes seen — a rough measure of how varied the text is. */
  distinctShapes: number;
  secrets: SecretFinding[];
  duplicates: DuplicateShape[];
  /** True when the sample hit its cap, so counts are a floor rather than a total. */
  truncated: boolean;
}

/**
 * Collapse a value to its silhouette: runs of the same character class become
 * one symbol with a length. "user-4821@acme.io" becomes "a4-9 4@a4.a2".
 *
 * This is what a model gets instead of the string. It is enough to recognise a
 * uuid, a base64 blob or an email-shaped value, and not enough to reconstruct
 * one.
 */
export function shapeOf(value: string, maxRuns = 12): string {
  const classOf = (c: string) =>
    /[a-z]/.test(c) ? 'a' : /[A-Z]/.test(c) ? 'A' : /[0-9]/.test(c) ? '9' : /\s/.test(c) ? '_' : c;

  let out = '';
  let runs = 0;
  let i = 0;
  while (i < value.length && runs < maxRuns) {
    const cls = classOf(value[i]);
    let n = 1;
    while (i + n < value.length && classOf(value[i + n]) === cls) n++;
    // Punctuation is structural and kept as-is; letters and digits get a count.
    out += 'aA9_'.includes(cls) ? `${cls}${n}` : cls.repeat(Math.min(n, 3));
    i += n;
    runs++;
  }
  if (i < value.length) out += '…';
  return out;
}

/**
 * Scan sampled contents for credentials and duplication.
 *
 * Runs entirely in the worker process. Nothing it reads is retained beyond the
 * counts and shapes it returns.
 */
export function scanStrings(samples: string[], sampleLimit: number, population = samples.length): StringScan {
  const secretCounts = new Map<string, number>();
  const exact = new Map<string, number>();

  for (const value of samples) {
    for (const p of SECRET_PATTERNS) {
      if (p.test.test(value)) secretCounts.set(p.kind, (secretCounts.get(p.kind) ?? 0) + 1);
    }
    exact.set(value, (exact.get(value) ?? 0) + 1);
  }

  const secrets: SecretFinding[] = SECRET_PATTERNS
    .filter(p => secretCounts.has(p.kind))
    .map(p => ({ kind: p.kind, note: p.note, matches: secretCounts.get(p.kind)! }))
    .sort((a, b) => b.matches - a.matches);

  // Duplicates are reported by shape, so the report says "12,000 copies of a
  // 37-character lowercase-and-dash value" rather than printing the value.
  const duplicates: DuplicateShape[] = [];
  for (const [value, count] of exact) {
    if (count < 2) continue;
    duplicates.push({
      shape: shapeOf(value),
      length: value.length,
      count,
      wastedBytes: (count - 1) * value.length * 2,
    });
  }
  duplicates.sort((a, b) => b.wastedBytes - a.wastedBytes);

  return {
    scanned: samples.length,
    population,
    coverage: population > 0 ? Number((samples.length / population).toFixed(4)) : 1,
    distinctShapes: new Set(samples.map(s => shapeOf(s))).size,
    secrets,
    duplicates: duplicates.slice(0, 15),
    truncated: samples.length >= sampleLimit,
  };
}

/**
 * Last line of defence before anything is sent.
 *
 * Walks an arbitrary structure and asserts nothing in it looks like a
 * credential or a long free-text value. The evidence pack is built to be safe
 * by construction; this catches the case where a future change adds a field
 * that carries content without anyone noticing. It throws rather than
 * redacting, because a silent scrub would hide the mistake.
 */
export function assertNoRawContent(pack: unknown, path = '$'): void {
  if (typeof pack === 'string') {
    for (const p of SECRET_PATTERNS) {
      if (p.test.test(pack)) {
        throw new Error(`Redaction gate: ${path} contains something matching ${p.kind}. Refusing to send.`);
      }
    }
    // Class names, shapes and labels are short. Anything long is suspect.
    if (pack.length > 300) {
      throw new Error(`Redaction gate: ${path} is ${pack.length} characters — too long to be a label. Refusing to send.`);
    }
    return;
  }
  if (Array.isArray(pack)) {
    pack.forEach((v, i) => assertNoRawContent(v, `${path}[${i}]`));
    return;
  }
  if (pack && typeof pack === 'object') {
    for (const [k, v] of Object.entries(pack)) assertNoRawContent(v, `${path}.${k}`);
  }
}
