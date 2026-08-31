/**
 * Strip secrets out of evidence before it leaves the machine.
 *
 * Logs are full of credentials. Not because anyone meant to log them — because
 * a connection string appears in a startup line, a request logger prints an
 * Authorization header, a retry logs the URL it retried, and a stack trace
 * carries the arguments that caused it. Any of those can end up in a stretch of
 * log someone highlights and sends to a model.
 *
 * ── The trade this makes ──
 *
 * Over-redaction is also a failure. A model asked to explain a connection
 * error cannot do it if the host, the port and the database name have all been
 * replaced by asterisks, and someone who finds the answer useless simply stops
 * using the feature — which protects nothing.
 *
 * So this only removes things that are secret by CONSTRUCTION: a value behind a
 * key that names it a secret, a token in a format that exists only to be a
 * token, a PEM block. It deliberately does not touch IP addresses, host names,
 * pod names, ports, UUIDs or long hex strings — those are the diagnosis, and a
 * request id is not a credential.
 *
 * Where a key names the value, the KEY IS KEPT. `password=«redacted»` tells the
 * model a password was supplied, which is frequently the answer — an empty
 * password and a wrong one fail differently, and both differ from none at all.
 */

/** What was taken out, for the UI to report honestly. */
export type RedactionCounts = Record<string, number>;

export interface RedactionResult {
  text: string;
  /** Kind → how many were replaced. Empty when nothing matched. */
  found: RedactionCounts;
  /** Total replacements, for the common "was anything removed" question. */
  total: number;
}

export const REDACTED = '«redacted»';

interface Rule {
  /**
   * Shown to the person, so it reads as a category rather than a regex name —
   * and SINGULAR, because `describeRedactions` pluralises it. A kind named
   * "url credentials" came out as "1 url credentials".
   */
  kind: string;
  re: RegExp;
  /** Build the replacement, keeping whatever context is safe to keep. */
  replace: (...groups: string[]) => string;
}

/**
 * Words that introduce a credential without being one.
 *
 * `Authorization: Bearer <token>` has a secret key, a separator, and a value
 * that is not the secret — the secret is the token after it, which the
 * auth-header rule has already removed. Without this the generic rule replaces
 * `Bearer`, discarding the one word that says a token was present at all, and
 * counts a second redaction that did not happen.
 */
const AUTH_SCHEME = /^(?:Bearer|Basic|Digest|Negotiate|APIKey|Token)$/i;

/*
  Keys whose value is a secret by definition.

  Matched case-insensitively as a whole word, so `password` matches but
  `password_policy_enabled` does not — a boolean about passwords is not a
  password, and redacting it would hide a genuine cause.
*/
const SECRET_KEY = String.raw`(?:pass(?:word|wd)?|pwd|secret|token|api[-_]?key|apikey|access[-_]?key|auth|authorization|credential|client[-_]?secret|private[-_]?key|session[-_]?id|cookie)`;

const RULES: Rule[] = [
  /*
    PEM blocks first, and whole.

    A private key spans many lines, and any later rule that matched a fragment
    of it would leave the rest of the key in the text — a partially redacted
    key is a leaked key.
  */
  {
    kind: 'private key',
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replace: () => `-----BEGIN PRIVATE KEY----- ${REDACTED} -----END PRIVATE KEY-----`,
  },

  // Credentials inside a URL or JDBC string: scheme://user:secret@host
  {
    kind: 'url credential',
    re: /\b([a-z][a-z0-9+.-]*:\/\/)([^\s:/@]+):([^\s@/]+)@/gi,
    replace: (_m, scheme, user) => `${scheme}${user}:${REDACTED}@`,
  },

  // Authorization: Bearer <token>, Basic <base64>, and bare JWTs.
  {
    kind: 'auth header',
    re: /\b(Bearer|Basic|Digest|Negotiate|APIKey)\s+([A-Za-z0-9._~+/=-]{8,})/gi,
    replace: (_m, scheme) => `${scheme} ${REDACTED}`,
  },
  {
    kind: 'jwt',
    // Three base64url segments. Nothing else looks like this.
    re: /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g,
    replace: () => REDACTED,
  },

  // Cloud keys, which have fixed prefixes precisely so they can be spotted.
  {
    kind: 'aws key',
    re: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/g,
    replace: () => REDACTED,
  },
  {
    kind: 'github token',
    re: /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g,
    replace: () => REDACTED,
  },
  {
    kind: 'slack token',
    re: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g,
    replace: () => REDACTED,
  },

  /*
    key=value and key: value, in that order.

    The value stops at whitespace, a quote, a comma or a closing brace, which
    covers logfmt, JSON, query strings and Java's `toString()` alike without
    needing to know which it is looking at.
  */
  {
    kind: 'secret value',
    re: new RegExp(String.raw`(?<![.\w])(${SECRET_KEY})([ ]?[=:][ ]?)("[^"]*"|'[^']*'|[^\s,;&}\])]+)`, 'gi'),
    /*
      Declines when the value is not the secret.

      Two cases. Already redacted — a rule above got there first. Or the value
      is a scheme word: `Authorization: Bearer <token>` has a secret key and a
      separator, but `Bearer` is not the secret, the token after it is, and the
      auth-header rule has already removed that. Replacing `Bearer` throws away
      the one word saying a token was present and counts a second redaction
      that never happened.
    */
    replace: (m, key, sep, value) => {
      if (value.includes(REDACTED) || AUTH_SCHEME.test(value)) return m;
      return `${key}${sep}${REDACTED}`;
    },
  },
  // The same, as a JSON key with a quoted name: "password": "hunter2"
  {
    kind: 'secret value',
    re: new RegExp(String.raw`("(?:${SECRET_KEY})"\s*:\s*)("(?:[^"\\]|\\.)*")`, 'gi'),
    replace: (m, key, value) => (value.includes(REDACTED) ? m : `${key}"${REDACTED}"`),
  },

  /*
    Email addresses — the one piece of ordinary PII common in application logs,
    via user records, audit lines and SMTP errors.

    The domain is kept. "which tenant" is often the whole question, and the
    local part is the identifying half.
  */
  {
    kind: 'email',
    re: /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g,
    replace: (_m, domain) => `${REDACTED}@${domain}`,
  },

  /*
    Card numbers, checked with Luhn rather than by shape alone.

    Without the check this matches order ids, correlation ids and timestamps
    concatenated together — all of which are 13-19 digits and none of which is
    a card. The check is what makes this rule safe to run at all.
  */
  {
    kind: 'card number',
    re: /\b(?:\d[ -]?){12,18}\d\b/g,
    replace: (m) => (luhn(m.replace(/[ -]/g, '')) ? REDACTED : m),
  },
];

/** The checksum every card number carries, and almost nothing else does. */
export function luhn(digits: string): boolean {
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Redact a block of evidence.
 *
 * Rules run in order and each sees the output of the last, which is why the
 * PEM rule is first and the broad key=value rule is late: an earlier, more
 * specific rule has already removed the thing a later one might have half
 * matched.
 */
export function redact(text: string): RedactionResult {
  if (!text) return { text, found: {}, total: 0 };

  const found: RedactionCounts = {};
  let out = text;

  for (const rule of RULES) {
    out = out.replace(rule.re, (...args) => {
      // `replace` is passed (match, ...groups, offset, string); drop the tail.
      const groups = args.slice(0, -2) as string[];
      const replacement = rule.replace(...groups);
      // A rule may decline — the Luhn check does — and an unchanged string is
      // not a redaction and must not be counted as one.
      if (replacement !== groups[0]) {
        found[rule.kind] = (found[rule.kind] ?? 0) + 1;
      }
      return replacement;
    });
  }

  const total = Object.values(found).reduce((n, v) => n + v, 0);
  return { text: out, found, total };
}

/**
 * One line describing what was removed, for the answer panel and the audit.
 *
 * Says nothing when nothing matched, rather than "0 secrets removed" — a
 * reassurance printed on every log would stop being read by the second one.
 */
export function describeRedactions(found: RedactionCounts): string | undefined {
  const parts = Object.entries(found)
    .sort((a, b) => b[1] - a[1])
    .map(([kind, n]) => `${n} ${kind}${n === 1 ? '' : 's'}`);
  return parts.length ? `Removed before sending: ${parts.join(', ')}.` : undefined;
}
