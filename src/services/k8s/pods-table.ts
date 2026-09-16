/**
 * The cheap pod list — the one the terminal is fast at.
 *
 * ── Why this exists ──
 *
 * `kubectl get pods -o json` asks the API server for every pod in full. On a
 * four-pod namespace that is 38,706 bytes against the 249 that
 * `kubectl get pods --no-headers` prints — about 10 KB per pod against 62
 * bytes a row. The grid needs what is in the JSON: owner references for the
 * workload badge, container states, last-restart times, images. So the JSON
 * has to be fetched.
 *
 * It does not have to be fetched *first*. `--no-headers` and `-o wide` are
 * served by the API server's Table endpoint — the server does the summarising
 * and sends back rows, which is exactly why the same namespace comes back in
 * a second or two in a terminal while dk8s was still pulling megabytes. The
 * two calls go out together: the rows paint the grid at terminal speed, and
 * the JSON replaces them with the full picture when it lands.
 *
 * A row cannot say everything. There is no uid, no owner, no per-container
 * detail and no image in a table — so a pod from here is marked `partial`,
 * and nothing downstream may treat a missing field as an absent one.
 */
import { run } from './kubectl';
import { clusterTimeoutMs } from './k8s-timeouts';
import type { PodSummary } from './k8s-watch';

/**
 * One row of `kubectl get pods -o wide --no-headers`.
 *
 * NAME READY STATUS RESTARTS AGE IP NODE NOMINATED READINESS
 *
 * RESTARTS is the trap: kubectl prints `0` for a pod that has never restarted
 * and `1 (171m ago)` for one that has, so the column is one token or three and
 * splitting on whitespace by position puts the age in the IP's place for every
 * pod that ever crashed — which is every pod anybody is looking for.
 */
const ROW = new RegExp(
  '^(\\S+)'                    // name
  + '\\s+(\\d+)/(\\d+)'        // ready, as current/total
  + '\\s+(\\S+)'               // status
  + '\\s+(\\d+)'               // restarts
  + '(?:\\s+\\([^)]*\\))?'     // ...and the "(171m ago)" kubectl adds to it
  + '\\s+(\\S+)'               // age
  + '(?:\\s+(\\S+))?'          // ip      (only with -o wide)
  + '(?:\\s+(\\S+))?',         // node    (only with -o wide)
);

/**
 * A pod as far as a table row knows.
 *
 * Deliberately not a full `PodSummary` cast: the fields a row cannot carry are
 * left undefined rather than invented, and `partial` says so out loud.
 */
export function parsePodRow(line: string, namespace: string): PodSummary | undefined {
  const m = ROW.exec(line.trim());
  if (!m) return undefined;

  const [, name, readyNow, readyTotal, status, restarts, , ip, node] = m;
  const current = Number(readyNow);
  const total = Number(readyTotal);

  /* `Terminating` is a status the table prints and the JSON does not — there
     it is a deletion timestamp on a pod still phased `Running`. Both roads
     lead to the same word on the card. */
  const deleting = status === 'Terminating';

  return {
    name,
    namespace,
    /* No uid in a table. The name is unique within a namespace at any one
       moment, which is all a key on screen needs until the JSON arrives with
       the real one. */
    uid: name,
    phase: status,
    ready: { current, total },
    restarts: Number(restarts),
    /* Empty, not invented. A row says how many containers are ready, never
       which ones — so the chips stay away until the JSON says. */
    containers: [],
    node: node && node !== '<none>' ? node : undefined,
    healthy: !deleting && status === 'Running' && current === total && total > 0,
    deleting,
    partial: true,
  };
}

export interface PodTable {
  pods: PodSummary[];
  command: string;
  error?: string;
}

/**
 * List a namespace's pods the cheap way.
 *
 * `-o wide` rather than the default: the node is worth the handful of extra
 * bytes, because it is the one field the grid shows that a plain table leaves
 * out and it costs nothing to carry.
 */
export async function podsTable(context: string, namespace: string): Promise<PodTable> {
  const args = [
    '--context', context, '-n', namespace,
    'get', 'pods', '-o', 'wide', '--no-headers',
  ];
  const command = `kubectl ${args.join(' ')}`;
  const r = await run(args, { timeoutMs: clusterTimeoutMs() });

  if (!r.ok) {
    return { pods: [], command, error: firstLine(r.stderr) || r.failure };
  }

  const pods: PodSummary[] = [];
  for (const line of (r.stdout ?? '').split('\n')) {
    /* An empty namespace prints this on stdout and exits 0 — it is an answer,
       not a row, and certainly not an error. */
    if (/^No resources found/i.test(line.trim())) break;
    const p = parsePodRow(line, namespace);
    if (p) pods.push(p);
  }
  return { pods, command };
}

function firstLine(s: string | undefined): string | undefined {
  return (s ?? '').split('\n').map(l => l.trim()).find(Boolean)?.slice(0, 200);
}
