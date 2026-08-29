/**
 * Ordering, formatting, and severity for the pod grid.
 *
 * Kept out of the components so it can be reasoned about — and tested —
 * without rendering anything. The sort in particular is the difference between
 * a grid that answers "what should I look at" and one that just lists pods
 * alphabetically and leaves the reading to you.
 */
import type { PodSummary } from '../../store/k8s-store';

export type Severity = 'critical' | 'warning' | 'ok' | 'quiet';

/** Reasons that mean the pod is failing now, not that it once did. */
const CRITICAL = /CrashLoopBackOff|ImagePull|ErrImage|OOMKilled|Evicted|CreateContainerError|RunContainerError|InvalidImageName/i;

/** A restart is only interesting while it is recent. */
const RECENT_RESTART_MS = 30 * 60 * 1000;

export function isRecentRestart(pod: PodSummary, now = Date.now()): boolean {
  if (!pod.lastRestartAt) return false;
  const t = Date.parse(pod.lastRestartAt);
  return Number.isFinite(t) && now - t < RECENT_RESTART_MS;
}

/**
 * How much attention a pod deserves.
 *
 * `quiet` is the important one: a healthy pod should visually recede so the two
 * that matter are findable in a namespace of two hundred.
 */
export function severityOf(pod: PodSummary, now = Date.now()): Severity {
  if (pod.deleting) return 'quiet';
  if (pod.reason && CRITICAL.test(pod.reason)) return 'critical';
  if (pod.phase === 'Failed') return 'critical';
  if (pod.ready.current < pod.ready.total && pod.phase !== 'Succeeded') return 'warning';
  if (pod.phase === 'Pending') return 'warning';
  if (isRecentRestart(pod, now)) return 'warning';
  if (pod.healthy) return 'quiet';
  return 'ok';
}

const RANK: Record<Severity, number> = { critical: 0, warning: 1, ok: 2, quiet: 3 };

export function severityColor(s: Severity): string {
  switch (s) {
    case 'critical': return 'var(--color-error)';
    case 'warning': return 'var(--color-warning)';
    case 'ok': return 'var(--color-method-get)';
    case 'quiet': return 'var(--color-method-get)';
  }
}

/**
 * Needs-attention order.
 *
 * Not alphabetical, and deliberately not by restart count either — a pod with
 * 312 restarts from six days ago would sit at the top forever and train people
 * to ignore the top. Within a severity band, the most recently restarted comes
 * first, then the name so the order is stable between renders.
 */
export function sortPods(pods: PodSummary[], now = Date.now()): PodSummary[] {
  return pods.slice().sort((a, b) => {
    const ra = RANK[severityOf(a, now)];
    const rb = RANK[severityOf(b, now)];
    if (ra !== rb) return ra - rb;

    const ta = a.lastRestartAt ? Date.parse(a.lastRestartAt) : 0;
    const tb = b.lastRestartAt ? Date.parse(b.lastRestartAt) : 0;
    if (ta !== tb) return tb - ta;

    return a.name.localeCompare(b.name);
  });
}

/** Fuzzy-ish match across the fields someone would actually type. */
export function matchesFilter(pod: PodSummary, filter: string): boolean {
  const q = filter.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    pod.name, pod.workload?.name, pod.node, pod.phase, pod.reason, pod.image,
  ].filter(Boolean).join(' ').toLowerCase();
  return q.split(/\s+/).every(term => hay.includes(term));
}

// ── Formatting ──────────────────────────────────────────────────────────────

export function shortAge(iso?: string, now = Date.now()): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function formatBytes(n?: number): string {
  if (n === undefined) return '—';
  if (n < 1024) return `${n} B`;
  const mib = n / 1024 / 1024;
  if (mib < 1024) return `${mib.toFixed(mib < 10 ? 1 : 0)} MiB`;
  return `${(mib / 1024).toFixed(2)} GiB`;
}

export function formatCpu(milli?: number): string {
  if (milli === undefined) return '—';
  return milli < 1000 ? `${milli}m` : `${(milli / 1000).toFixed(2)}`;
}

/**
 * The sentence a restart count alone cannot say.
 *
 * "7 restarts, 40s ago" makes you look; "7 restarts" on a pod that last failed
 * in March does not deserve to.
 */
export function restartLabel(pod: PodSummary, now = Date.now()): string {
  // "0 restarts" rather than "no restarts": it sits in the same column as
  // "26 restarts" on the card next to it, and a number scans against a number.
  if (!pod.restarts) return '0 restarts';
  const when = pod.lastRestartAt ? `${shortAge(pod.lastRestartAt, now)} ago` : 'time unknown';
  return `${pod.restarts} restart${pod.restarts === 1 ? '' : 's'} · ${when}`;
}

/**
 * A stable, washed-out colour for a namespace.
 *
 * Groups need to be told apart at a glance without the colour meaning anything
 * — semantic colour is reserved entirely for pod health, and a namespace tint
 * that competed with it would make a red pod harder to find, which is the one
 * thing the grid must never do.
 *
 * So: a hue from the name (stable across sessions and machines), then held at
 * low saturation and mixed heavily into the surface. The result reads as a
 * tint, not a colour.
 */
function hashOf(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/**
 * Hue for the group at `index` of `total`.
 *
 * Three attempts at deriving this from a hash all failed the same way, and the
 * third makes the reason obvious: hashing to a hue is a random draw, so
 * collisions are a birthday problem, not bad luck. `hash % 12` collided
 * outright (`dk8s-test` and `payments` both hit bucket 5); the golden angle on
 * the raw hash put `dk8s-test` and `zp-platform` 0.4 degrees apart.
 *
 * The number of groups is known at render time, so they can simply be spread
 * evenly instead. Maximum separation, guaranteed, for whatever is on screen.
 *
 * The trade is that a namespace's colour depends on how many groups are
 * showing, so adding one can shift the others. That is worth it: telling this
 * namespace from that one on the screen in front of you is the job, and a
 * colour that is stable but indistinguishable does not do it.
 */
export function groupHue(index: number, total: number): number {
  // Start at 45 so a tint can never land in the red band and read as an alert.
  return 45 + (index * 290) / Math.max(1, total);
}

export interface NamespaceTint {
  hue: number;
  /** For the group's hairline border. */
  border: string;
  /** For the group's header text. */
  label: string;
  /** A barely-there fill, so the box reads as one object. */
  wash: string;
}

export function namespaceTint(index: number, total: number): NamespaceTint {
  const hue = groupHue(index, total);
  // Alternating saturation gives neighbouring groups a second difference, so
  // even a crowded palette does not rely on hue alone.
  const sat = index % 2 === 0 ? 62 : 45;
  return {
    hue,
    // Strong enough to tell groups apart, weak enough that a red pod inside
    // one still wins the eye. Semantic colour must stay the loudest thing.
    border: `hsl(${hue} ${sat}% 58% / 0.5)`,
    label: `hsl(${hue} ${sat}% 68%)`,
    wash: `hsl(${hue} ${sat}% 50% / 0.11)`,
  };
}

/** Group pods by the namespace (and cluster) they came from. */
export interface PodGroup {
  key: string;
  context?: string;
  namespace: string;
  pods: PodSummary[];
  tint: NamespaceTint;
}

export function groupPods(pods: PodSummary[], now = Date.now()): PodGroup[] {
  const byKey = new Map<string, PodGroup>();
  for (const pod of pods) {
    const key = `${pod.context ?? ''}/${pod.namespace}`;
    let g = byKey.get(key);
    if (!g) {
      // Tint is filled in below: it depends on the group's position in the
      // final ordering, which is not known until every pod has been placed.
      g = { key, context: pod.context, namespace: pod.namespace, pods: [], tint: namespaceTint(0, 1) };
      byKey.set(key, g);
    }
    g.pods.push(pod);
  }
  // Namespace first, then cluster. Ordering by severity moved a group every
  // time a pod changed state, so the thing you were reading slid out from
  // under you; a stable alphabetical order is worth more than putting the
  // broken group on top, and the header already says how many need attention.
  // Pods inside each group are still severity-ordered.
  const ordered = [...byKey.values()]
    .map(g => ({ ...g, pods: sortPods(g.pods, now) }))
    .sort((a, b) => {
      const d = a.namespace.localeCompare(b.namespace);
      return d !== 0 ? d : (a.context ?? '').localeCompare(b.context ?? '');
    });

  return ordered.map((g, i) => ({ ...g, tint: namespaceTint(i, ordered.length) }));
}

export interface PulseCounts {
  total: number;
  ready: number;
  degraded: number;
  critical: number;
  restartsLastHour: number;
}

export function pulse(pods: PodSummary[], now = Date.now()): PulseCounts {
  const hourAgo = now - 60 * 60 * 1000;
  let ready = 0, degraded = 0, critical = 0, restartsLastHour = 0;
  for (const p of pods) {
    const s = severityOf(p, now);
    if (s === 'critical') critical++;
    else if (s === 'warning') degraded++;
    else ready++;
    if (p.lastRestartAt && Date.parse(p.lastRestartAt) > hourAgo) restartsLastHour++;
  }
  return { total: pods.length, ready, degraded, critical, restartsLastHour };
}
