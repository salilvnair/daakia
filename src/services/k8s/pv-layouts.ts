/**
 * The shapes a mounted log volume is actually laid out in.
 *
 * A path template is the one piece of PV configuration nobody can guess and
 * everybody has to write, and writing it means knowing that `{app}` is the pod
 * name with its ReplicaSet hash removed, that `**` matches no directories as
 * well as many, and that the file being written now usually sits beside the
 * rotated ones rather than among them. That is a lot to know before the
 * feature does anything at all.
 *
 * So the common layouts ship. Picking one fills the template in, and it stays
 * an ordinary editable string afterwards — these are a starting point, not a
 * closed set, and a volume laid out some other way is still described by
 * typing a template as before.
 *
 * ── What makes a layout worth shipping ──
 *
 * Each of these is a real convention rather than a permutation: a Helm chart
 * that mounts a claim per app and environment, a Logback rolling policy
 * writing beside its own archive, the directory kubelet itself uses on a node.
 * Listing every combination of the tokens would be a worse menu than no menu.
 */
export interface PvLayout {
  id: string;
  /** Shown in the picker. */
  name: string;
  /** The template it fills in. */
  template: string;
  /** One line on when this is the right one. */
  hint?: string;
  /**
   * Two paths it matches, so the shape is legible without parsing globs.
   *
   * Shipped layouts carry these and a test checks each one against its own
   * examples. A layout somebody saves does not — it came from a real volume,
   * which is a better example than any that could be written for it.
   */
  example?: [string, string];
  /** Saved by the user rather than shipped. Only these can be removed. */
  custom?: boolean;
}

export const BUILTIN_LAYOUTS: PvLayout[] = [
  {
    id: 'pvc-per-app-env',
    name: 'Claim per app and environment, with archived/',
    template: '{app}-{env}-pvc/**/{app}*.log*',
    hint: 'A claim named for the app and environment, the live file at its root '
      + 'and rotated files in a subdirectory. The trailing * catches compressed '
      + 'rotations, which is what most of an archive is.',
    example: [
      'my-app-prod-pvc/my-app.log',
      'my-app-prod-pvc/archived/my-app-2026-08-30.log.gz',
    ],
  },
  {
    id: 'pvc-per-app-env-flat',
    name: 'Claim per app and environment, flat',
    template: '{app}-{env}-pvc/{app}*.log*',
    hint: 'The same claim, with the rotated files sitting next to the live one '
      + 'rather than in a subdirectory.',
    example: [
      'my-app-prod-pvc/my-app.log',
      'my-app-prod-pvc/my-app.log.2026-08-30.gz',
    ],
  },
  {
    id: 'namespace-app',
    name: 'Namespace, then app',
    template: '{namespace}/{app}/**/*.log*',
    hint: 'One volume shared by a cluster, partitioned by namespace and then by '
      + 'application.',
    example: [
      'payments/my-app/my-app.log',
      'payments/my-app/archived/my-app-2026-08-30.log',
    ],
  },
  {
    id: 'app-date',
    name: 'App, then one directory per day',
    template: '{app}/{date}/*.log*',
    hint: 'A directory per day, which is what a date-based rolling policy '
      + 'produces when it rolls into folders.',
    example: [
      'my-app/2026-08-31/app.log',
      'my-app/2026-08-30/app.log',
    ],
  },
  {
    id: 'app-logs-dir',
    name: 'App, with a logs/ directory',
    template: '{app}/logs/{app}*.log*',
    hint: 'The layout an application gets when it writes to ./logs and that '
      + 'directory is the mount.',
    example: [
      'my-app/logs/my-app.log',
      'my-app/logs/my-app.log.1',
    ],
  },
  {
    id: 'per-container',
    name: 'Claim per app, directory per container',
    template: '{app}-{env}-pvc/{container}/**/*.log*',
    hint: 'Each container keeps its own directory. Only the container you are '
      + 'looking at is searched, so a sidecar’s logs appear when you switch to '
      + 'it rather than mixed in with the application’s.',
    example: [
      'my-app-prod-pvc/app/my-app.log',
      'my-app-prod-pvc/app/archived/my-app-2026-08-30.log',
    ],
  },
  {
    id: 'pod-named',
    name: 'One file per pod',
    template: '**/{pod}*.log*',
    hint: 'Files named after the pod itself. Precise while a pod lives, and '
      + 'finds nothing once it is replaced — a rollout changes the name.',
    example: [
      'my-app-7f9455548d-xm6kc.log',
      'archive/my-app-7f9455548d-xm6kc.log.gz',
    ],
  },
  {
    id: 'kubelet-node',
    name: 'Node directory (/var/log/pods)',
    template: '{namespace}_{pod}_*/**/*.log',
    hint: 'The layout kubelet writes on the node itself, for a volume that '
      + 'mounts a node’s log directory.',
    example: [
      'payments_my-app-7f9455548d-xm6kc_a1b2/app/0.log',
      'payments_my-app-7f9455548d-xm6kc_a1b2/app/1.log',
    ],
  },
  {
    id: 'app-anywhere',
    name: 'Anything named after the app',
    template: '**/{app}*.log*',
    hint: 'The broadest option: any file anywhere under the mount whose name '
      + 'starts with the application. Useful for a volume with no convention, '
      + 'and slower, because it walks the whole tree.',
    example: [
      'whatever/nesting/my-app.log',
      'other/place/my-app-2026-08-30.log.gz',
    ],
  },
];

/**
 * Everything the picker offers: what ships, then what has been saved.
 *
 * Saved layouts come last so the shipped ones keep their positions — a picker
 * whose buttons move as you add to it is one you have to re-read every time.
 */
export function allLayouts(custom: PvLayout[] = []): PvLayout[] {
  return [...BUILTIN_LAYOUTS, ...custom.map(l => ({ ...l, custom: true }))];
}

/**
 * A layout id from a name, stable enough to delete by and unique enough not to
 * collide with a shipped one.
 */
export function layoutIdFor(name: string, existing: PvLayout[] = []): string {
  const base = 'custom.' + (name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'layout');
  if (!existing.some(l => l.id === base)) return base;
  let n = 2;
  while (existing.some(l => l.id === `${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/**
 * Which layout a template came from, if any.
 *
 * Compared as text rather than tracked as a field, so a template that was
 * picked and then edited correctly reads as custom — and one typed by hand
 * that happens to match a shipped layout is recognised as that layout, which
 * is true and worth showing.
 */
export function layoutFor(
  template: string | undefined, custom: PvLayout[] = [],
): PvLayout | undefined {
  const t = (template ?? '').trim();
  if (!t) return undefined;
  return allLayouts(custom).find(l => l.template.trim() === t);
}
