/**
 * What Ask AI in the Scripts tab tells the model, and how it reads the answer.
 *
 * ── Why the API is spelled out here ──
 *
 * A model asked for "a script that gets an Azure token" writes Postman, or
 * Node with `fetch` and `setTimeout` — none of which runs in Daakia's sandbox.
 * So the prompt carries the runtime as it actually is (read from
 * `src/services/script-runtime/core`), the snippet library as worked examples,
 * and the Postman and Bruno tables for code pasted in from either.
 *
 * ── Why a fence per destination ──
 *
 * The answer has to land in the right editor. The model tags each block
 * ```pre-request or ```post-response, the same way the mock generator asks for
 * ```routes, so the dialog offers to inject each block where it belongs
 * without guessing from the code.
 */
import { SNIPPETS } from '../../components/shared/editors/SnippetsPanel';
import { dialectPairs } from '../translate/mappings';

export type ScriptTarget = 'pre-request' | 'post-response';

export const SCRIPT_TARGET_LABEL: Record<ScriptTarget, string> = {
  'pre-request': 'Pre-request',
  'post-response': 'Post-response',
};

/**
 * The script runtime, as `src/services/script-runtime/core` builds it.
 * Keep in step with those providers, as `dk-repl.ts` is.
 */
export const DK_SCRIPT_API = `Scripts run inside an async function, so top-level \`await\` works.
A \`return\` ends the script, nothing more: the request is still sent.
\`throw new Error("why")\` in a pre-request script stops the request and shows "Pre-request script failed: why".

Variables (all values are strings)
  dk.env.get(k) / dk.env.set(k, v) / dk.env.has(k) / dk.env.toObject()   active environment
  dk.env.secret(k, v)                       store a value masked in the console (tokens, keys)
  dk.globals.get(k) / dk.globals.set(k, v)  global variables
  dk.collectionVariables.get(k) / .set(k, v)
  dk.interpolate("{{baseUrl}}/path")        resolve {{variables}} and template helpers in a string

The outgoing request (pre-request: change it before it is sent)
  dk.request.method / dk.request.url / dk.request.body   readable and assignable
  dk.request.headers.set(k, v) / .get(k) / .has(k) / .remove(k) / .each((k, v) => ...)

The response (post-response only)
  dk.response.status / .statusText / .headers / .body (string) / .time (ms) / .size
  dk.response.json()                        parsed body, or null

Requests from a script
  const res = await dk.sendRequest({ method, url, headers: {...}, body: "string" })
  res.status / res.headers / res.body / res.json()     never throws: a failure is status 0
  10 second timeout. The body is a string: JSON.stringify an object, or build a form body
  with require('querystring').stringify({...}) and Content-Type application/x-www-form-urlencoded.

Tests (post-response)
  dk.test("name", () => { dk.expect(value).toBe(x) })
  matchers: toBe, toEqual, toBeTruthy, toBeFalsy, toBeNull, toBeUndefined, toBeDefined,
  toContain, toBeGreaterThan, toBeLessThan, toBeGreaterThanOrEqual, toBeLessThanOrEqual,
  toBeWithin(min, max), toBeOneOf([...]), toBeType("string"), toHaveLength(n), toMatch(re),
  toHaveProperty(key), toHaveStatus(n), toMatchSchema(schema | "#/components/schemas/Name")

Also available
  console.log / info / warn / error
  crypto.randomUUID(), crypto.createHash(algo), crypto.createHmac(algo, key), crypto.randomBytes(n)
  atob, btoa, JSON, Math, Date, encodeURIComponent, decodeURIComponent
  URL, URLSearchParams (a form body: new URLSearchParams({...}).toString()), TextEncoder, TextDecoder, structuredClone
  require() of: crypto, buffer, url, querystring, path, util — nothing else

Not available: fetch, XMLHttpRequest, setTimeout, setInterval, import, the file system, pm.*, bru.*`;

/** The snippet library, as worked examples of the API in use. */
export function scriptExamples(): string {
  return SNIPPETS
    .filter(s => s.category !== 'dynamic')
    .map(s => `// ${s.label} — ${s.description}\n${s.code}`)
    .join('\n\n');
}

/** Postman and Bruno, for a script the user pastes in from either. */
export function dialectTables(): string {
  return [
    'Postman', ...dialectPairs('postman').map(p => `  ${p}`),
    '', 'Bruno', ...dialectPairs('bruno').map(p => `  ${p}`),
  ].join('\n');
}

export interface ScriptBlock {
  target: ScriptTarget;
  code: string;
}

const TAGGED = /```(pre-request|post-response)[^\n]*\n([\s\S]*?)```/gi;
const PLAIN = /```(?:javascript|js)?[^\n]*\n([\s\S]*?)```/gi;

/**
 * The scripts in an answer, each with where it goes.
 *
 * Tagged fences first. A model that ignored the format and wrote a plain
 * ```js block still answered — that code goes to `fallback`, the script the
 * user was looking at when they asked.
 */
export function parseScriptBlocks(text: string, fallback: ScriptTarget): ScriptBlock[] {
  const tagged = [...text.matchAll(TAGGED)]
    .map(m => ({ target: m[1].toLowerCase() as ScriptTarget, code: m[2].trim() }))
    .filter(b => b.code);
  if (tagged.length) return tagged;
  return [...text.matchAll(PLAIN)]
    .map(m => ({ target: fallback, code: m[1].trim() }))
    .filter(b => b.code);
}

/** The answer without its scripts — the explanation around them. */
export function proseOf(text: string): string {
  return text.replace(TAGGED, '').replace(PLAIN, '').replace(/\n{3,}/g, '\n\n').trim();
}

/** Append to what is already there, a blank line between. */
export function appendScript(current: string, code: string): string {
  const base = current.replace(/\s+$/, '');
  return base ? `${base}\n\n${code}\n` : `${code}\n`;
}
