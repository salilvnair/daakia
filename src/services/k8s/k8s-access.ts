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

/** The verbs dk8s needs, named by what they let you do. */
export type AccessKey =
  | 'logs'       // read a pod's log
  | 'exec'       // open a shell, and everything the Doctor collects
  | 'get'        // describe and YAML
  | 'events'     // the event list under Describe
  | 'portForward'
  | 'delete'
  | 'patch';     // label a pod — the detach-before-heap-dump flow

interface Check {
  verb: string;
  resource: string;
}

const CHECKS: Record<AccessKey, Check> = {
  logs: { verb: 'get', resource: 'pods/log' },
  exec: { verb: 'create', resource: 'pods/exec' },
  get: { verb: 'get', resource: 'pods' },
  events: { verb: 'list', resource: 'events' },
  portForward: { verb: 'create', resource: 'pods/portforward' },
  delete: { verb: 'delete', resource: 'pods' },
  patch: { verb: 'patch', resource: 'pods' },
};

export type Access = Record<AccessKey, boolean> & {
  /**
   * False when the probe could not run at all.
   *
   * Everything is reported as allowed in that case, and this is how the UI
   * knows not to claim it checked.
   */
  probed: boolean;
};

const ALL_ALLOWED = (probed: boolean): Access => ({
  logs: true, exec: true, get: true, events: true,
  portForward: true, delete: true, patch: true, probed,
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

/** One `kubectl auth can-i`. Never throws; a failure reads as allowed. */
async function canI(
  context: string, namespace: string, check: Check,
): Promise<boolean | undefined> {
  const res = await run(
    [
      '--context', context, '-n', namespace,
      'auth', 'can-i', check.verb, check.resource,
      // Without this kubectl prints a warning and still exits 0 on "no",
      // which would read as allowed.
      '--quiet',
    ],
    { timeoutMs: 10_000 },
  );

  // `--quiet` makes this purely an exit code: 0 yes, 1 no. Anything else —
  // the subcommand missing on an old kubectl, a network failure — is unknown,
  // and unknown means do not restrict.
  if (res.ok) return true;
  const err = `${res.stderr ?? ''} ${res.failure ?? ''}`.toLowerCase();
  if (err.includes('unknown command') || err.includes('unable to connect')
      || err.includes('timed out') || err.includes('enoent')) {
    return undefined;
  }
  return false;
}

export async function probeAccess(
  context: string, namespace: string, now = Date.now(),
): Promise<Access> {
  if (!context || !namespace) return ALL_ALLOWED(false);

  const key = `${context}/${namespace}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.access;

  const keys = Object.keys(CHECKS) as AccessKey[];
  let results: (boolean | undefined)[];
  try {
    // In parallel: seven SelfSubjectAccessReviews are cheap, and doing them in
    // turn would put a visible pause in front of the first pod you open.
    results = await Promise.all(keys.map(k => canI(context, namespace, CHECKS[k])));
  } catch {
    return ALL_ALLOWED(false);
  }

  const access = ALL_ALLOWED(true);
  let anyKnown = false;
  keys.forEach((k, i) => {
    const r = results[i];
    if (r === undefined) return;      // unknown: leave it allowed
    anyKnown = true;
    access[k] = r;
  });

  // Not a single definite answer means the probe did not really work, whatever
  // the exit codes said.
  if (!anyKnown) return ALL_ALLOWED(false);

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

/** What to tell someone an action needs, in RBAC terms they can pass on. */
export const ACCESS_RULE: Record<AccessKey, string> = {
  logs: 'get on pods/log',
  exec: 'create on pods/exec',
  get: 'get on pods',
  events: 'list on events',
  portForward: 'create on pods/portforward',
  delete: 'delete on pods',
  patch: 'patch on pods',
};
