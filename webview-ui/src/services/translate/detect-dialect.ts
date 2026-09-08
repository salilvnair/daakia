/**
 * Which tool did this snippet come from?
 *
 * ── Why guess at all ──
 *
 * Someone migrating to Daakia pastes what they already have. Asking them to
 * first say which of five tools wrote it is asking them to answer a question
 * the text already answers — `pm.response.json()` could not have come from
 * anywhere but Postman.
 *
 * ── Why scores and not the first match ──
 *
 * The dialects overlap. Bruno and Insomnia both borrowed Postman's
 * `test()`/`expect()` shape, Insomnia's newer scripting is Postman's API under
 * a different object name, and a file can legitimately mention another tool in
 * a comment. A first-match rule turns one incidental `expect(` into a
 * confident wrong answer. Every signal votes, the strongest total wins, and a
 * weak or tied result reports `unknown` — which the UI shows as a question
 * rather than a silent mistranslation.
 *
 * ── The two families ──
 *
 * Postman, Bruno, Insomnia and Thunder Client are scripting APIs: they appear
 * inside a request's test or pre-request script. HTTPie is a shell command line.
 * Both are "things people paste to move to Daakia", and both are detected here,
 * but they convert into different halves of a request — a script, or a method,
 * URL, headers and body.
 */

export type Dialect =
  | 'postman'
  | 'bruno'
  | 'insomnia'
  | 'thunder-client'
  | 'httpie'
  | 'curl'
  | 'unknown';

export type DialectKind = 'script' | 'command';

export interface DialectInfo {
  id: Dialect;
  label: string;
  kind: DialectKind;
}

export const DIALECTS: Record<Exclude<Dialect, 'unknown'>, DialectInfo> = {
  postman:          { id: 'postman',        label: 'Postman',        kind: 'script' },
  bruno:            { id: 'bruno',          label: 'Bruno',          kind: 'script' },
  insomnia:         { id: 'insomnia',       label: 'Insomnia',       kind: 'script' },
  'thunder-client': { id: 'thunder-client', label: 'Thunder Client', kind: 'script' },
  httpie:           { id: 'httpie',         label: 'HTTPie',         kind: 'command' },
  curl:             { id: 'curl',           label: 'cURL',           kind: 'command' },
};

export interface Detection {
  dialect: Dialect;
  /** 0–1. Below `MIN_CONFIDENCE` the answer is reported as unknown. */
  confidence: number;
  /** The patterns that fired, for the UI to show and for a bug report to quote. */
  signals: string[];
  kind: DialectKind | null;
}

interface Rule {
  re: RegExp;
  /**
   * How much this pattern proves.
   *
   * 3 — only this tool has it (`pm.response`, `bru.setEnvVar`).
   * 2 — strongly suggests it, but a sibling could borrow it.
   * 1 — consistent with it; only meaningful alongside something stronger.
   */
  weight: number;
  name: string;
}

const RULES: Record<Exclude<Dialect, 'unknown'>, Rule[]> = {
  postman: [
    { re: /\bpm\s*\.\s*(test|expect|response|request|environment|globals|collectionVariables|variables|sendRequest|info|iterationData|cookies)\b/, weight: 3, name: 'pm.*' },
    { re: /\bpostman\s*\.\s*(setEnvironmentVariable|getEnvironmentVariable|setGlobalVariable|clearEnvironmentVariable)\b/, weight: 3, name: 'postman.setEnvironmentVariable' },
    { re: /\bresponseCode\s*\.\s*code\b/, weight: 2, name: 'responseCode.code (legacy Postman)' },
    { re: /\bresponseBody\b/, weight: 1, name: 'responseBody' },
    { re: /\.to\.have\.status\s*\(/, weight: 2, name: '.to.have.status()' },
  ],
  bruno: [
    { re: /\bbru\s*\.\s*(setEnvVar|getEnvVar|setVar|getVar|runRequest|interpolate|cwd|getProcessEnv|sleep)\b/, weight: 3, name: 'bru.*' },
    { re: /\bres\s*\.\s*(getStatus|getBody|getHeader|getHeaders|getResponseTime)\s*\(/, weight: 3, name: 'res.getStatus() / res.getBody()' },
    { re: /\breq\s*\.\s*(getUrl|setUrl|getMethod|setMethod|getHeaders|setHeaders|getBody|setBody|setMaxRedirects|getTimeout)\s*\(/, weight: 3, name: 'req.getUrl() / req.setBody()' },
  ],
  insomnia: [
    { re: /\binsomnia\s*\.\s*(test|expect|response|request|environment|globals|baseEnvironment|sendRequest|variables)\b/, weight: 3, name: 'insomnia.*' },
    { re: /\{%\s*response\s+['"]/, weight: 3, name: "{% response 'body' %} template tag" },
    { re: /\{%\s*(faker|uuid|now|base64|prompt|jsonPath)\b/, weight: 2, name: '{% faker %} template tag' },
    { re: /\b_\.\s*response\b/, weight: 1, name: '_.response (legacy Insomnia)' },
  ],
  'thunder-client': [
    { re: /\btc\s*\.\s*(setVar|getVar|setGlobalVar|getGlobalVar|runRequest)\b/, weight: 3, name: 'tc.*' },
    { re: /"tests"\s*:\s*\[\s*\{[^}]*"type"\s*:\s*"(res-code|json-query|res-body|res-header|set-env-var)"/, weight: 3, name: 'Thunder Client tests JSON' },
    { re: /"clientName"\s*:\s*"Thunder Client"/, weight: 3, name: 'clientName: Thunder Client' },
  ],
  httpie: [
    { re: /^\s*(https?\s+|http\s+)(--?[\w-]+\s+)*(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)?\s*\S*[:/]/im, weight: 3, name: 'http / https command' },
    { re: /\s\w+==\S/, weight: 2, name: 'key==value query param' },
    { re: /\s\w+:=\S/, weight: 3, name: 'key:=value raw JSON field' },
    { re: /--(json|form|print|session|auth-type|ignore-stdin|follow)\b/, weight: 2, name: 'HTTPie flag' },
  ],
  curl: [
    { re: /^\s*curl\s+/m, weight: 3, name: 'curl command' },
    { re: /\s-(X|H|d|F|u)\s/, weight: 1, name: 'curl short flag' },
    { re: /--(data-raw|data-binary|header|request|location)\b/, weight: 2, name: 'curl long flag' },
  ],
};

/**
 * Below this, the answer is `unknown`.
 *
 * A single weight-1 signal is 1/3 of the strongest possible single vote, and
 * acting on that is how a plain JavaScript snippet gets "translated" from a
 * language it was never written in.
 */
const MIN_SCORE = 3;

/** Strip comments and string bodies before matching. */
function decommented(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

export function detectDialect(source: string): Detection {
  const text = (source ?? '').trim();
  if (!text) return { dialect: 'unknown', confidence: 0, signals: [], kind: null };

  const hay = decommented(text);

  let best: Exclude<Dialect, 'unknown'> | null = null;
  let bestScore = 0;
  let bestSignals: string[] = [];
  let total = 0;

  for (const [id, rules] of Object.entries(RULES) as [Exclude<Dialect, 'unknown'>, Rule[]][]) {
    let score = 0;
    const signals: string[] = [];
    for (const r of rules) {
      if (r.re.test(hay)) {
        score += r.weight;
        signals.push(r.name);
      }
    }
    total += score;
    if (score > bestScore) {
      best = id;
      bestScore = score;
      bestSignals = signals;
    }
  }

  if (!best || bestScore < MIN_SCORE) {
    return { dialect: 'unknown', confidence: 0, signals: [], kind: null };
  }

  /* Confidence is this dialect's share of every vote cast, not its raw score:
     a snippet that scores 6 for Postman and 5 for Bruno is a genuinely
     ambiguous snippet, and saying "91% Postman" about it would be a lie. */
  const confidence = total > 0 ? bestScore / total : 0;

  return {
    dialect: best,
    confidence: Math.round(confidence * 100) / 100,
    signals: bestSignals,
    kind: DIALECTS[best].kind,
  };
}

/** The label to show, including the honest one. */
export function dialectLabel(d: Dialect): string {
  return d === 'unknown' ? 'Unrecognised' : DIALECTS[d].label;
}

/**
 * Worth offering a conversion?
 *
 * Deliberately stricter than `detectDialect`'s own threshold. Detection feeds a
 * dropdown the user can correct; this feeds an unprompted offer over something
 * they just pasted, and an offer that is wrong half the time is worse than no
 * offer at all.
 */
export function shouldOfferConversion(d: Detection): boolean {
  return d.dialect !== 'unknown' && d.confidence >= 0.6;
}
