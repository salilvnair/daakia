/**
 * What each tool's API becomes in Daakia.
 *
 * ── Why these live in code, not in the prompt ──
 *
 * The prompt is one editable template shared by every dialect. Putting five
 * mapping tables in it would mean the model reads four irrelevant ones on every
 * request — and a reader editing the prompt to fix a Bruno mapping would be
 * scrolling past Postman's. The template asks for a translation and takes the
 * table as a variable; this file is the table.
 *
 * ── Why a table at all, rather than trusting the model ──
 *
 * `pm.expect(x).to.equal(y)` → `dk.expect(x).toBe(y)` is not something to
 * rediscover per request. Given the pairs, the model's job is the parts that
 * are genuinely judgement — control flow, an API with no equivalent, a helper
 * that has to be written out — and it stops inventing `dk.assert` for the parts
 * that are not.
 */
import type { Dialect } from './detect-dialect';

/** Shared by every scripting dialect: what Daakia offers to translate *into*. */
const DAAKIA_SURFACE = [
  'dk.test(name, fn)            — declare a test',
  'dk.expect(v).toBe(x)         — strict equality',
  'dk.expect(v).toEqual(x)      — deep equality',
  'dk.expect(v).toContain(x)    — substring / member',
  'dk.expect(v).toBeDefined()   — presence',
  'dk.expect(v).toBeGreaterThan(x)',
  'dk.response.status           — status code (number)',
  'dk.response.body             — raw body (string)',
  'dk.response.headers          — header map',
  'dk.response.time             — elapsed ms',
  'dk.env.get(k) / dk.env.set(k, v)      — active environment',
  'dk.global.get(k) / dk.global.set(k, v) — global variables',
  'dk.request.url / dk.request.headers    — the outgoing request',
].join('\n');

const PAIRS: Partial<Record<Dialect, string[]>> = {
  postman: [
    'pm.test(n, fn)                     -> dk.test(n, fn)',
    'pm.expect(v).to.equal(x)           -> dk.expect(v).toBe(x)',
    'pm.expect(v).to.eql(x)             -> dk.expect(v).toEqual(x)',
    'pm.expect(v).to.include(x)         -> dk.expect(v).toContain(x)',
    'pm.expect(v).to.be.a("array")      -> dk.expect(Array.isArray(v)).toBe(true)',
    'pm.expect(v).to.be.above(x)        -> dk.expect(v).toBeGreaterThan(x)',
    'pm.response.to.have.status(n)      -> dk.expect(dk.response.status).toBe(n)',
    'pm.response.json()                 -> JSON.parse(dk.response.body)',
    'pm.response.code                   -> dk.response.status',
    'pm.response.responseTime           -> dk.response.time',
    'pm.response.headers.get(h)         -> dk.response.headers[h]',
    'pm.environment.get/set(k[, v])     -> dk.env.get/set(k[, v])',
    'pm.globals.get/set(k[, v])         -> dk.global.get/set(k[, v])',
    'pm.collectionVariables.get/set     -> dk.env.get/set  (Daakia has no separate collection scope)',
    'pm.request.url.toString()          -> dk.request.url',
    'postman.setEnvironmentVariable     -> dk.env.set  (legacy form)',
    'responseCode.code                  -> dk.response.status  (legacy form)',
    'responseBody                       -> dk.response.body    (legacy form)',
  ],
  bruno: [
    'test(n, fn)                        -> dk.test(n, fn)',
    'expect(v).to.equal(x)              -> dk.expect(v).toBe(x)',
    'expect(v).to.eql(x)                -> dk.expect(v).toEqual(x)',
    'res.getStatus()                    -> dk.response.status',
    'res.getBody()                      -> JSON.parse(dk.response.body)',
    'res.getHeader(h)                   -> dk.response.headers[h]',
    'res.getResponseTime()              -> dk.response.time',
    'req.getUrl() / req.setUrl(u)       -> dk.request.url',
    'req.getHeaders() / req.setHeaders  -> dk.request.headers',
    'bru.getEnvVar(k) / bru.setEnvVar   -> dk.env.get(k) / dk.env.set(k, v)',
    'bru.getVar(k) / bru.setVar(k, v)   -> dk.global.get(k) / dk.global.set(k, v)',
    'bru.sleep(ms)                      -> await new Promise(r => setTimeout(r, ms))',
  ],
  insomnia: [
    'insomnia.test(n, fn)               -> dk.test(n, fn)',
    'insomnia.expect(v).to.equal(x)     -> dk.expect(v).toBe(x)',
    'insomnia.response.code             -> dk.response.status',
    'insomnia.response.json()           -> JSON.parse(dk.response.body)',
    'insomnia.environment.get/set       -> dk.env.get/set',
    'insomnia.baseEnvironment.get/set   -> dk.global.get/set',
    "{% response 'body', id, '$.path' %} -> chain the value in Daakia with dk.env.set from the earlier request's script",
    '{% uuid %} / {% now %}             -> {{$guid}} / {{$timestamp}} in the URL or body',
    '{% faker ... %}                    -> Daakia has no faker tag; generate in the pre-request script',
  ],
  'thunder-client': [
    'tc.setVar(k, v) / tc.getVar(k)     -> dk.env.set(k, v) / dk.env.get(k)',
    'tc.setGlobalVar / tc.getGlobalVar  -> dk.global.set / dk.global.get',
    'tests: [{ type: "res-code" }]      -> dk.test("status", () => dk.expect(dk.response.status).toBe(n))',
    'tests: [{ type: "json-query" }]    -> dk.test(name, () => dk.expect(<jsonpath on the parsed body>).toBe(value))',
    'tests: [{ type: "res-body" }]      -> dk.expect(dk.response.body).toContain(value)',
    'tests: [{ type: "res-header" }]    -> dk.expect(dk.response.headers[name]).toBe(value)',
    'tests: [{ type: "set-env-var" }]   -> dk.env.set(name, <value from the body>)',
  ],
  httpie: [
    'http METHOD url                    -> the request method and URL',
    'name==value                        -> a query parameter',
    'name=value                         -> a JSON body field (string)',
    'name:=value                        -> a JSON body field (raw: number, boolean, array, object)',
    'Header:value                       -> a request header',
    'name@/path/to/file                 -> a form-data file part',
    '--form / -f                        -> body mode form-data instead of JSON',
    '--auth user:pass / -a              -> basic auth',
    '--json / -j                        -> body mode raw JSON (the default)',
  ],
  curl: [
    '-X METHOD / --request              -> the request method',
    '-H "K: V" / --header               -> a request header',
    '-d / --data / --data-raw           -> a raw body (and POST unless -X says otherwise)',
    '--data-urlencode                   -> body mode x-www-form-urlencoded',
    '-F / --form                        -> body mode form-data',
    '-u user:pass / --user              -> basic auth',
    '-L / --location                    -> follow redirects (a Daakia setting, not a header)',
  ],
};

/** The mapping table for a dialect, ready to drop into the prompt. */
export function mappingsFor(dialect: Dialect): string {
  const pairs = PAIRS[dialect];
  if (!pairs) {
    return 'No mapping table for this source — infer the intent from the code and '
      + 'express it with the Daakia API below.\n\n' + DAAKIA_SURFACE;
  }
  return pairs.join('\n') + '\n\nThe Daakia API available to you:\n' + DAAKIA_SURFACE;
}
