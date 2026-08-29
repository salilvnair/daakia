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
  if (!pod.restarts) return 'no restarts';
  const when = pod.lastRestartAt ? `${shortAge(pod.lastRestartAt, now)} ago` : 'time unknown';
  return `${pod.restarts} restart${pod.restarts === 1 ? '' : 's'} · ${when}`;
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
