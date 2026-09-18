/**
 * Resolve `{{var}}` a second time, after the pre-request script has run.
 *
 * ── The bug this exists for ──
 *
 * A pre-request script sets a token — `dk.env.set('bearer-token', …)` — and
 * the Auth tab uses `{{bearer-token}}`. It did not work. Not intermittently:
 * the first run of a fresh variable never worked, and the second run did,
 * which is the worst possible shape for a bug to have.
 *
 * The webview resolves the whole request before it posts it: the URL, the
 * headers, the body and the auth data all come across already substituted.
 * The pre-request script then runs on the HOST, afterwards. So a variable the
 * script sets is set after everything that could have used it was already
 * rendered — and on the second run it appears to work, because the first run
 * persisted it and the webview had it before building the payload.
 *
 * ── Why this can be fixed here rather than by moving resolution ──
 *
 * Because an unresolved variable survives. `resolveWithEnv` returns the
 * literal `{{bearer-token}}` when it cannot find one, rather than an empty
 * string — so the template reaches the host intact and can be resolved again
 * once the script has had its say. Nothing about the payload has to change.
 *
 * A variable that WAS resolvable in the webview is already a value by the time
 * it gets here, so this only ever fills in what was genuinely missing. It
 * cannot re-substitute something the reader typed literally.
 *
 * ── Precedence ──
 *
 * Collection, then environment, then secret, then global. The same order the
 * webview uses, with secrets sitting inside the environment layer because
 * that is where `dk.env.get` looks for them: `envVars[key] ?? secretVars[key]`.
 */

/** The variable sets a script can have changed, in priority order. */
export interface VarLayers {
  collection?: Record<string, string>;
  env?: Record<string, string>;
  secret?: Record<string, string>;
  global?: Record<string, string>;
}

/**
 * The same pattern the webview resolves, including `${var}`.
 *
 * Hyphens and dots are in the character class because `bearer-token` and
 * `auth.token` are both names people actually use — and a pattern that missed
 * them would leave exactly those unresolved while appearing to work for
 * everything else.
 */
const VAR = /\{\{([\w.\-]+)\}\}|\$\{([\w.\-]+)\}/g;

/** The escape forms, which mean "leave this alone". */
const ESC_DBL = /\$daakia_\{([\w.\-]+)\}_\$/g;
const ESC_DLR = /\$daakia_\$([\w.\-]+)\$_\$/g;

function lookup(name: string, layers: VarLayers): string | undefined {
  for (const set of [layers.collection, layers.env, layers.secret, layers.global]) {
    const value = set?.[name];
    /*
      An empty value falls through to the next layer.

      Arguably wrong — a cleared token is not an unset one — but it is exactly
      what `resolveWithEnv` does in the webview, and these two resolve the same
      request between them. Two resolvers disagreeing about one variable is a
      worse bug than either behaviour alone. Change both together or neither.
    */
    if (value !== undefined && value !== '') return value;
  }
  return undefined;
}

/**
 * Fill in any `{{var}}` still left in `input`.
 *
 * Anything that cannot be resolved is left exactly as it was, for the same
 * reason the webview leaves it: a request that sends the literal
 * `{{bearer-token}}` fails in a way somebody can read, and one that sends an
 * empty Authorization header fails in a way nobody can.
 */
export function resolveVars(input: string, layers: VarLayers): string {
  if (!input || !input.includes('{') && !input.includes('$')) return input;

  let out = input.replace(ESC_DBL, (_m, name) => `\x00ESC_DBL{${name}}\x00`);
  out = out.replace(ESC_DLR, (_m, name) => `\x00ESC_DLR{${name}}\x00`);

  out = out.replace(VAR, (match, braceVar, dollarVar) => {
    const found = lookup(braceVar || dollarVar, layers);
    return found ?? match;
  });

  out = out.replace(/\x00ESC_DBL\{([\w.\-]+)\}\x00/g, (_m, name) => `{{${name}}}`);
  out = out.replace(/\x00ESC_DLR\{([\w.\-]+)\}\x00/g, (_m, name) => `\${${name}}`);
  return out;
}

/** Every string in a key/value list. */
export function resolveRows<T extends { key: string; value: string }>(
  rows: T[] | undefined, layers: VarLayers,
): T[] | undefined {
  if (!rows) return rows;
  return rows.map(r => ({
    ...r,
    key: resolveVars(r.key, layers),
    value: resolveVars(r.value, layers),
  }));
}

/**
 * Every string value in a flat object — auth data, in practice.
 *
 * Shallow on purpose: `authData` is a flat bag of strings (token, username,
 * key, header name), and walking deeper would risk rewriting something that
 * only looks like a template inside a structure nobody meant to resolve.
 */
export function resolveFields(
  obj: Record<string, unknown> | undefined, layers: VarLayers,
): Record<string, unknown> | undefined {
  if (!obj) return obj;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = typeof v === 'string' ? resolveVars(v, layers) : v;
  }
  return out;
}

/** Does anything here still carry an unresolved variable? */
export function hasUnresolved(input: string | undefined): boolean {
  if (!input) return false;
  VAR.lastIndex = 0;
  return VAR.test(input);
}
