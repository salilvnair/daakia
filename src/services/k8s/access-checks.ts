/**
 * The permissions dk8s asks about, in one place both halves of the app read.
 *
 * ── Why this is its own module ──
 *
 * There were three copies of this list: the verbs the host probes
 * (`k8s-access.ts`), the rule strings the host reports, and a hand-typed
 * duplicate of those rules in the webview's pod detail so a padlocked tab
 * could name what to ask for. Three lists that have to agree, kept in step by
 * remembering to.
 *
 * Now there is one, and it is import-free on purpose — that is the condition
 * for the webview to alias it (`@daakia/access-checks`) rather than copy it,
 * the same arrangement `log-format.ts` and `pv-layouts.ts` already have.
 *
 * It also carries what the host never needed but the reader always did: what
 * each permission is called in plain words, and what stops working without it.
 * The Access tab is built from this, so a permission added here appears there
 * with no further work.
 */

export type AccessKey =
  | 'logs'
  | 'exec'
  | 'get'
  | 'events'
  | 'portForward'
  | 'delete'
  | 'patch';

export interface AccessCheck {
  key: AccessKey;
  /** The verb and resource `kubectl auth can-i` is asked about. */
  verb: string;
  resource: string;
  /** The RBAC rule, phrased so it can be pasted to whoever grants it. */
  rule: string;
  /** What this permission is, in the reader's words. */
  title: string;
  /** What dk8s cannot do without it — named by the screens it gates. */
  gates: string;
}

/**
 * Order is deliberate: what people use most, first.
 *
 * Reading logs is the reason most people open dk8s at all, and `get pods` is
 * what they must already have to be looking at a pod. The destructive ones sit
 * at the bottom, where a read-only account can see them greyed out without
 * having to scroll past them to find the row it came for.
 */
export const ACCESS_CHECKS: readonly AccessCheck[] = [
  {
    key: 'logs', verb: 'get', resource: 'pods/log',
    rule: 'get on pods/log',
    title: 'Read a pod’s log',
    gates: 'The Logs tab, log search, and exporting a log to a file.',
  },
  {
    key: 'get', verb: 'get', resource: 'pods',
    rule: 'get on pods',
    title: 'Read a pod’s definition',
    gates: 'Describe and YAML — and the pod list itself, which you needed to get here.',
  },
  {
    key: 'exec', verb: 'create', resource: 'pods/exec',
    rule: 'create on pods/exec',
    title: 'Run a command inside a container',
    gates: 'Terminal, Explorer, and everything Doctor collects — thread dumps, '
      + 'heap dumps, flight recordings. All of them are one exec.',
  },
  {
    key: 'events', verb: 'list', resource: 'events',
    rule: 'list on events',
    title: 'Read the namespace’s events',
    gates: 'The event list under Describe, which is where a scheduling or image-pull '
      + 'failure actually explains itself.',
  },
  {
    key: 'portForward', verb: 'create', resource: 'pods/portforward',
    rule: 'create on pods/portforward',
    title: 'Forward a port from the pod',
    gates: 'Reaching a port on this pod from your own machine.',
  },
  {
    key: 'patch', verb: 'patch', resource: 'pods',
    rule: 'patch on pods',
    title: 'Change a pod’s labels',
    gates: 'Detaching a pod from its Service before a heap dump, so the dump does not '
      + 'stall live traffic.',
  },
  {
    key: 'delete', verb: 'delete', resource: 'pods',
    rule: 'delete on pods',
    title: 'Delete a pod',
    gates: 'Restarting a pod by deleting it and letting its controller replace it.',
  },
];

/** What to ask an administrator for, by permission. */
export const ACCESS_RULE: Record<AccessKey, string> = ACCESS_CHECKS.reduce(
  (out, c) => { out[c.key] = c.rule; return out; },
  {} as Record<AccessKey, string>,
);

/**
 * The exact argv dk8s runs to answer one of these.
 *
 * Shared so the Access tab can show the line that produced the answer beside
 * the answer. `--quiet` is not decoration: without it kubectl prints "no" and
 * still exits 0, which reads as allowed.
 */
export function canIArgs(check: AccessCheck, context: string, namespace: string): string[] {
  return [
    '--context', context, '-n', namespace,
    'auth', 'can-i', check.verb, check.resource,
    '--quiet',
  ];
}

/** The same call as a line you can paste into a terminal. */
export function canILine(check: AccessCheck, context: string, namespace: string): string {
  return `kubectl ${canIArgs(check, context, namespace).join(' ')}`;
}
