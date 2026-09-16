/**
 * What this user is actually allowed to do.
 *
 * A read-only account is the normal case on a company cluster, not an edge
 * case: plenty of people can list pods and read logs and nothing else. Before
 * this, dk8s offered every tab to everyone and let the ones you cannot use
 * fail — Terminal opened a shell that died immediately, Describe and YAML
 * printed a wall of `Error from server (Forbidden): ... cannot get resource
 * "pods" in API group ""` into the pane, and none of it said what to ask for.
 *
 * Kubernetes answers this question directly. `kubectl auth can-i` is a
 * SelfSubjectAccessReview — the API server evaluates the same RBAC rules it
 * would apply to the real call and returns yes or no, without doing anything.
 * It is cheap, it needs no special permission of its own, and it is the only
 * honest way to know: parsing a 403 after the fact tells you too late, and
 * guessing from the account name tells you nothing.
 *
 * The rule everywhere here is to fail open. If the probe itself cannot run —
 * an old cluster, a proxy that mangles it, a timeout — every action stays
 * enabled. Offering something that then fails is a smaller sin than hiding
 * something that would have worked.
 */

import { run } from './kubectl';
import {
  ACCESS_CHECKS, canIArgs, type AccessCheck, type AccessKey,
} from './access-checks';

/*
  The list itself lives in `access-checks.ts`, which the webview also reads
  through an alias. There were three copies of it — the verbs probed here, the
  rule strings reported here, and a hand-typed duplicate of those rules in the
  webview — and three lists that have to agree stay agreed only for as long as
  somebody remembers all three.
*/
export type { AccessKey } from './access-checks';
export { ACCESS_RULE } from './access-checks';

export type Access = Record<AccessKey, boolean> & {
  /**
   * False when the probe could not run at all.
   *
   * Everything is reported as allowed in that case, and this is how the UI
   * knows not to claim it checked.
   */
  probed: boolean;
  /**
   * What the cluster said when it would not answer.
   *
   * "The cluster did not answer the permission check" is true and useless. A
   * credential plugin that timed out, an expired token and a proxy in the way
   * are three different problems with three different fixes, and kubectl says
   * which on stderr — so the one line it said is carried through rather than
   * replaced by a paragraph listing all the possibilities.
   */
  detail?: string;
};

const ALL_ALLOWED = (probed: boolean, detail?: string): Access => ({
  logs: true, exec: true, get: true, events: true,
  portForward: true, delete: true, patch: true, probed,
  ...(detail ? { detail } : {}),
});

/**
 * Permissions change rarely and this runs per pod open, so it is cached for
 * the session. Long enough that opening ten pods costs one probe; short enough
 * that a role granted while you are working is picked up without a restart.
 */
const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; access: Access }>();

export function clearAccessCache(): void {
  cache.clear();
}

/**
 * What one `auth can-i --quiet` result means.
 *
 * ── A refusal is silent. Anything that talks is an error. ──
 *
 * With `--quiet`, a genuine "no" prints nothing at all and exits 1. kubectl
 * also exits 1 when the *check itself* could not be made — the cluster refused
 * the SelfSubjectAccessReview, the credential had expired, a proxy mangled it,
 * an admission webhook answered instead of RBAC — and in every one of those
 * cases it says so on stderr first.
 *
 * This used to be a list of sentences that meant "could not tell", which is
 * the wrong way round: the list can never be complete, and everything it
 * missed was read as a denial. So a padlock appeared on a cluster where the
 * account had every permission, and dk8s told somebody to ask an administrator
 * for a role they already had — while `kubectl logs` in the next window worked,
 * and dk8s's own log search, which never asks permission, worked too.
 *
 * Separated from the call so it can be held to that rule by a test.
 */
export function readCanI(
  res: { ok: boolean; stderr?: string; failure?: string },
): boolean | undefined {
  if (res.ok) return true;
  const said = `${res.stderr ?? ''}${res.failure ?? ''}`.trim();
  /* It spoke, so it did not answer: unknown, and unknown restricts nothing. */
  if (said) return undefined;
  /* Silent and non-zero: the API server evaluated the rules and said no. That
     is the one case worth taking a button away for. */
  return false;
}

/** One `kubectl auth can-i`. Never throws; anything unclear reads as allowed. */
async function canI(
  context: string, namespace: string, check: AccessCheck,
): Promise<{ answer: boolean | undefined; said?: string }> {
  const res = await run(canIArgs(check, context, namespace), { timeoutMs: 10_000 });
  const said = `${res.stderr ?? ''}${res.failure ?? ''}`.trim();
  return { answer: readCanI(res), said: said || undefined };
}

/** The checks one after another, for when firing them together did not work. */
async function inTurn(
  context: string, namespace: string,
): Promise<{ answer: boolean | undefined; said?: string }[]> {
  const out: { answer: boolean | undefined; said?: string }[] = [];
  for (const c of ACCESS_CHECKS) out.push(await canI(context, namespace, c));
  return out;
}

export async function probeAccess(
  context: string, namespace: string, now = Date.now(),
): Promise<Access> {
  if (!context || !namespace) return ALL_ALLOWED(false);

  const key = `${context}/${namespace}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.access;

  const keys = ACCESS_CHECKS.map(c => c.key);
  let results: { answer: boolean | undefined; said?: string }[];
  try {
    /*
      The first one alone, then the rest together.

      Seven SelfSubjectAccessReviews are cheap and firing them at once keeps a
      visible pause off the first pod you open — but on a cluster reached
      through an exec credential plugin (EKS, AKS, a corporate SSO helper)
      kubectl runs that helper once per call, and seven at once contend on the
      one token cache the helper keeps. They then time out together, and seven
      timeouts read as seven unknowns: "0 allowed, 7 not established" on a
      cluster where you have everything.

      One call first warms the token. The other six find it already there.
    */
    const [first, ...rest] = ACCESS_CHECKS;
    const firstResult = await canI(context, namespace, first);
    results = [
      firstResult,
      ...await Promise.all(rest.map(c => canI(context, namespace, c))),
    ];
  } catch {
    return ALL_ALLOWED(false);
  }

  /*
    Nothing definite from the whole batch is a probe that did not work, whatever
    the exit codes said — so try once more, one at a time. A helper that choked
    on six at once usually answers fine in turn, and the alternative is telling
    somebody with full access that the cluster would not say.
  */
  if (results.every(r => r.answer === undefined)) {
    try { results = await inTurn(context, namespace); } catch { /* keep what we have */ }
  }

  const access = ALL_ALLOWED(true);
  let anyKnown = false;
  keys.forEach((k, i) => {
    const r = results[i]?.answer;
    if (r === undefined) return;      // unknown: leave it allowed
    anyKnown = true;
    access[k] = r;
  });

  if (!anyKnown) {
    /* What kubectl actually said, so the panel can name the problem rather
       than list every problem this could be. */
    return ALL_ALLOWED(false, firstLine(results.find(r => r.said)?.said));
  }

  cache.set(key, { at: now, access });
  return access;
}

/**
 * Is this stderr a permission problem, and what does it say plainly?
 *
 * Used for the calls that fail anyway — a role can be revoked between the
 * probe and the click, and some clusters deny through an admission webhook
 * that `can-i` does not model.
 */
export function forbiddenReason(stderr: string): string | undefined {
  const s = (stderr || '').trim();
  if (!/forbidden|cannot (get|list|create|delete|patch|watch)|unauthorized/i.test(s)) {
    return undefined;
  }

  // `pods "x" is forbidden: User "u" cannot create resource "pods/exec" in API
  // group "" in the namespace "n"` — the useful half is the resource.
  const res = /cannot (\w+) resource "([^"]+)"/i.exec(s);
  const ns = /in the namespace "([^"]+)"/i.exec(s);
  if (res) {
    return `Your account cannot ${res[1]} ${res[2]}`
      + (ns ? ` in ${ns[1]}.` : '.');
  }
  if (/unauthorized/i.test(s)) {
    return 'The cluster rejected your credentials. They may have expired — '
      + 'refresh them and try again.';
  }
  return 'Your account does not have permission for this.';
}

/** The first line of what kubectl said, capped for a panel. */
function firstLine(text: string | undefined): string | undefined {
  const line = (text ?? '').split(/\r?\n/).map(l => l.trim()).find(Boolean);
  return line ? line.slice(0, 200) : undefined;
}
