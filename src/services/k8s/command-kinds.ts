/**
 * What kind of thing a kubectl call is, and whether it is worth a row.
 *
 * ── Why a kind, when the audit already has the command ──
 *
 * The audit's `what` is the first few words of the argv, which means a log
 * read on one pod and a log read on another are two different labels:
 * `logs reporting-api-547958c846-24rwc` and `logs reporting-worker-7fd4…`.
 * That is exactly right on a row and useless for grouping — you cannot say
 * "stop showing me permission probes" about a label that contains a pod name.
 *
 * So every call is also classified into one of a fixed set of kinds. The kind
 * is what Settings switches on and off and what the Commands tab groups by;
 * the command itself is unchanged and still the thing you copy and run.
 *
 * ── What is on by default ──
 *
 * The ones you caused. Listing pods, reading a log, searching files, opening a
 * shell, switching context — you pressed something and this is what it did.
 *
 * Off by default are the calls dk8s makes to answer its own questions:
 * permission probes before a button is drawn, a metrics poll every fifteen
 * seconds per namespace, a version check to see whether a cluster answers at
 * all. They are real, they are recorded, and there are hundreds of them —
 * leave them on the screen and the handful of commands you actually ran are
 * somewhere in the middle of four hundred rows.
 *
 * Nothing here stops a call being made or being written down. This is only
 * what the Commands tab shows.
 */

export interface CommandKind {
  id: string;
  /** Which section of the config page it sits under. */
  group: CommandGroup;
  /** What it is called, in the words of the thing you pressed. */
  label: string;
  /** Where in dk8s it comes from — the answer to "why did this run?". */
  where: string;
  /** The shape of the command, for somebody matching a row against this list. */
  command: string;
  /** On unless it is dk8s asking itself something. */
  defaultOn: boolean;
}

/**
 * The sections, in the order they are shown.
 *
 * Grouped by what the call touches rather than by whether it is noisy — the
 * noisy ones are already obvious from being off, and somebody asking "why is
 * it reading pods so often" wants every pod call in one place.
 */
export const COMMAND_GROUPS = [
  { id: 'pods', label: 'Pods', color: 'var(--color-dk8s)' },
  { id: 'logs', label: 'Logs', color: 'var(--color-info)' },
  { id: 'container', label: 'Inside a container', color: 'var(--color-method-post)' },
  { id: 'cluster', label: 'Cluster and context', color: 'var(--color-method-get)' },
  { id: 'changes', label: 'Changes to a pod', color: 'var(--color-warning)' },
  { id: 'probes', label: 'What dk8s asks on your behalf', color: 'var(--color-text-muted)' },
  { id: 'other', label: 'Everything else', color: 'var(--color-text-muted)' },
] as const;

export type CommandGroup = typeof COMMAND_GROUPS[number]['id'];

export function groupColor(id: string): string {
  return COMMAND_GROUPS.find(g => g.id === id)?.color ?? 'var(--color-text-muted)';
}

export function groupLabel(id: string): string {
  return COMMAND_GROUPS.find(g => g.id === id)?.label ?? id;
}

/**
 * Ordered most-used first, which is also roughly the order somebody meets
 * them. The list is the catalogue AND the classifier's precedence: the first
 * `match` that accepts an argv wins, so narrower patterns come before wider
 * ones — `config use-context` before `config`, `get pods` before `get`.
 */
export const COMMAND_KINDS: (CommandKind & { match: (words: string[], argv: string[]) => boolean })[] = [
  {
    id: 'logs',
    group: 'logs',
    label: 'Read a log',
    where: 'The Logs tab, log search, and exporting a log to a file.',
    command: 'kubectl logs <pod>',
    defaultOn: true,
    match: w => w[0] === 'logs',
  },
  {
    id: 'get-pods',
    group: 'pods',
    label: 'List the pods',
    where: 'The pod grid, and the watch that keeps it up to date.',
    command: 'kubectl get pods',
    defaultOn: true,
    match: w => w[0] === 'get' && (w[1] === 'pods' || w[1] === 'po'),
  },
  {
    id: 'get-pod',
    group: 'pods',
    label: 'Re-read one pod',
    where: 'Opening a pod, and every refresh of the one already open.',
    command: 'kubectl get pod <pod> -o json',
    // Fires on every open and every refresh; it is dk8s keeping a screen
    // current rather than anything anybody asked for.
    defaultOn: false,
    match: w => w[0] === 'get' && w[1] === 'pod',
  },
  {
    id: 'describe',
    group: 'pods',
    label: 'Describe a pod',
    where: 'The Describe tab, and the events listed under it.',
    command: 'kubectl describe pod <pod>',
    defaultOn: true,
    match: w => w[0] === 'describe',
  },
  {
    id: 'exec',
    group: 'container',
    label: 'Run something in a container',
    where: 'Terminal, Explorer, file search, and everything Doctor collects.',
    command: 'kubectl exec <pod> -- …',
    defaultOn: true,
    match: w => w[0] === 'exec',
  },
  {
    id: 'cp',
    group: 'container',
    label: 'Copy a file out',
    where: 'Downloading a file from Explorer, and collecting a dump.',
    command: 'kubectl cp <pod>:<path> <local>',
    defaultOn: true,
    match: w => w[0] === 'cp',
  },
  {
    id: 'port-forward',
    group: 'container',
    label: 'Forward a port',
    where: 'Reaching a port on a pod from this machine.',
    command: 'kubectl port-forward <pod> …',
    defaultOn: true,
    match: w => w[0] === 'port-forward',
  },
  {
    id: 'events',
    group: 'pods',
    label: 'Read the namespace events',
    where: 'The event list under Describe, where a scheduling failure explains itself.',
    command: 'kubectl get events',
    defaultOn: true,
    match: w => w[0] === 'get' && (w[1] === 'events' || w[1] === 'ev'),
  },
  {
    id: 'namespaces',
    group: 'pods',
    label: 'List the namespaces',
    where: 'The namespace picker.',
    command: 'kubectl get namespaces',
    defaultOn: true,
    match: w => w[0] === 'get' && (w[1] === 'namespaces' || w[1] === 'ns'),
  },
  {
    id: 'contexts',
    group: 'cluster',
    label: 'List the contexts',
    where: 'The cluster picker, and the list dk8s starts from.',
    command: 'kubectl config get-contexts',
    defaultOn: true,
    match: w => w[0] === 'config' && w[1] === 'get-contexts',
  },
  {
    id: 'use-context',
    group: 'cluster',
    label: 'Switch context',
    where: 'Choosing a different cluster.',
    command: 'kubectl config use-context <name>',
    defaultOn: true,
    match: w => w[0] === 'config' && w[1] === 'use-context',
  },
  {
    id: 'config-view',
    group: 'cluster',
    label: 'Read the kubeconfig',
    where: 'Working out which clusters exist and how they authenticate.',
    command: 'kubectl config view',
    defaultOn: false,
    match: w => w[0] === 'config',
  },
  {
    id: 'delete',
    group: 'changes',
    label: 'Delete a pod',
    where: 'Restarting a pod by letting its controller replace it.',
    command: 'kubectl delete pod <pod>',
    defaultOn: true,
    match: w => w[0] === 'delete',
  },
  {
    id: 'patch',
    group: 'changes',
    label: 'Change a pod’s labels',
    where: 'Detaching a pod from its Service before a heap dump.',
    command: 'kubectl patch pod <pod> …',
    defaultOn: true,
    match: w => w[0] === 'patch' || w[0] === 'label',
  },
  {
    id: 'can-i',
    group: 'probes',
    label: 'Check a permission',
    where: 'Before a button is drawn, so a refused action is not offered.',
    command: 'kubectl auth can-i <verb> <resource>',
    // Seven per namespace, before anything is shown.
    defaultOn: false,
    match: w => w[0] === 'auth',
  },
  {
    id: 'top',
    group: 'probes',
    label: 'Read CPU and memory',
    where: 'The usage column, refreshed on a timer because metrics have no watch API.',
    command: 'kubectl top pods',
    // Every fifteen seconds, per watched namespace, forever.
    defaultOn: false,
    match: w => w[0] === 'top',
  },
  {
    id: 'version',
    group: 'cluster',
    label: 'Check the cluster answers',
    where: 'Before dk8s trusts a context, and when one stops responding.',
    command: 'kubectl version',
    defaultOn: false,
    match: w => w[0] === 'version',
  },
];

/** Anything the list above does not name. Always shown; never silently lost. */
export const OTHER_KIND: CommandKind = {
  id: 'other',
  group: 'other',
  label: 'Everything else',
  where: 'Any call this list does not name yet.',
  command: 'kubectl …',
  defaultOn: true,
};

/**
 * The words of an argv with the flags and their values removed.
 *
 * `--context prod -n ns get pods` is a `get pods`, and both `prod` and `ns`
 * have to go or the verb is whatever flag happened to come first.
 */
export function verbWords(argv: string[]): string[] {
  const skip = new Set<number>();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('-') && argv[i + 1] && !argv[i + 1].startsWith('-')) skip.add(i + 1);
  }
  return argv.filter((a, i) => !a.startsWith('-') && !skip.has(i));
}

/** Which kind this call is. Never throws, and never returns nothing. */
export function commandKind(argv: string[]): string {
  const words = verbWords(argv);
  for (const k of COMMAND_KINDS) {
    try { if (k.match(words, argv)) return k.id; } catch { /* a bad matcher is not a failed call */ }
  }
  return OTHER_KIND.id;
}

/** The catalogue as the settings screen renders it, without the matchers. */
export function commandCatalogue(): CommandKind[] {
  return [...COMMAND_KINDS.map(({ match, ...rest }) => rest), OTHER_KIND];
}

/** Ids that are on when nobody has said otherwise. */
export function defaultEnabled(): string[] {
  return commandCatalogue().filter(k => k.defaultOn).map(k => k.id);
}

/**
 * Which kinds the Commands tab should show.
 *
 * A stored list is exactly what was chosen, including "none of them" — but a
 * value that is not a list at all, from a half-written write or an older
 * build, falls back to the defaults rather than to an empty screen.
 */
export function enabledKinds(stored: string | undefined): Set<string> {
  if (stored === undefined) return new Set(defaultEnabled());
  try {
    const v = JSON.parse(stored);
    if (!Array.isArray(v)) return new Set(defaultEnabled());
    const known = new Set(commandCatalogue().map(k => k.id));
    return new Set(v.filter((x): x is string => typeof x === 'string' && known.has(x)));
  } catch {
    return new Set(defaultEnabled());
  }
}
