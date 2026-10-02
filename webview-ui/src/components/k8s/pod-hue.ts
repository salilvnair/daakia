/**
 * A colour and two letters per app, for the lists that name pods.
 *
 * From the theme, so it follows light and dark; by app rather than by pod, so
 * three replicas read as a family and a rollout does not repaint them. The
 * same app is the same colour wherever a list shows it — Open logs, the Daakia
 * AI pod picker.
 */
const POD_HUES = [
  'var(--color-dk8s)', 'var(--color-protocol-graphql)', 'var(--color-protocol-grpc)',
  'var(--color-success)', 'var(--color-warning)', 'var(--color-info)', 'var(--color-accent)',
];

/** A pod's app: its name without the replica-set and pod hashes a deployment adds. */
export function podApp(pod: string): string {
  return pod.replace(/(-[a-z0-9]{8,10})?-[a-z0-9]{5}$/, '');
}

export function podHue(pod: string): string {
  let h = 0;
  for (const ch of podApp(pod)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return POD_HUES[h % POD_HUES.length];
}

export function podInitials(pod: string): string {
  const parts = podApp(pod).split('-').filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

/**
 * One colour per pod, where replicas of one app have to be told apart.
 *
 * `podHue` is by app on purpose, so three replicas read as a family. A Follow
 * across those three is the opposite question — which replica said this line —
 * so each pod takes the next colour in the order the pods are listed.
 */
const REPLICA_HUES = [
  'var(--color-error)', 'var(--color-warning)', 'var(--color-info)', 'var(--color-success)',
  'var(--color-protocol-graphql)', 'var(--color-protocol-grpc)', 'var(--color-dk8s)', 'var(--color-accent)',
];

export function replicaHue(pod: string, pods: string[]): string {
  const i = pods.indexOf(pod);
  return REPLICA_HUES[(i < 0 ? 0 : i) % REPLICA_HUES.length];
}

/** The part of a pod's name that tells replicas apart: `payments-7d9f2` → `7d9f2`. */
export function podTail(pod: string): string {
  const parts = pod.split('-');
  return parts.length > 1 ? parts[parts.length - 1] : pod;
}
