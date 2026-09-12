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
 * The rows to show: what has been saved, or what ships.
 *
 * `undefined` means untouched, and yields the shipped list. An empty array
 * means every row was deleted, which is a real state a user can reach and not
 * the same thing — falling back to the defaults for it would make deleting the
 * last row look like it failed.
 *
 * The shipped list is copied on the way out so an edit to a row cannot reach
 * back and change the constant for the rest of the session.
 */
export function layoutList(saved?: PvLayout[]): PvLayout[] {
  return saved ? saved.map(l => ({ ...l })) : BUILTIN_LAYOUTS.map(l => ({ ...l }));
}

/**
 * Whether the list is still the shipped one, so Restore defaults can say so by
 * being disabled rather than by doing nothing when pressed.
 *
 * Compared field by field rather than by reference: the list is materialised
 * into the config the moment any row is edited, so by the time this is asked
 * the two are never the same object even when they hold the same rows.
 */
export function isDefaultLayouts(saved?: PvLayout[]): boolean {
  if (!saved) return true;
  if (saved.length !== BUILTIN_LAYOUTS.length) return false;
  return saved.every((l, i) => {
    const b = BUILTIN_LAYOUTS[i]!;
    return l.id === b.id && l.name === b.name && l.template === b.template;
  });
}

/**
 * A layout id from a name, stable enough to delete by and unique within the
 * list it is going into.
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
 * Which row a template came from, if any.
 *
 * Compared as text rather than tracked as a field, so the highlight is a
 * statement about what will actually be searched: a row edited to something
 * else stops claiming to be selected, and a template typed by hand that
 * happens to equal a row's is recognised as that row, which is true.
 */
export function layoutFor(
  template: string | undefined, saved?: PvLayout[],
): PvLayout | undefined {
  const t = (template ?? '').trim();
  if (!t) return undefined;
  return layoutList(saved).find(l => l.template.trim() === t);
}

/*
  Does a template describe this path, whoever the pod is?

  Searching substitutes a real pod into a template and walks the disk for it.
  A probe has no pod — it is asking the prior question, "is this the shape my
  volume is laid out in", and the answer has to hold for every pod at once. So
  every token is a wildcard here rather than a name, and the match runs against
  paths already walked instead of touching the disk again.

  That is what turns the layout table from documentation into evidence: rather
  than an invented `my-app-prod-pvc/my-app.log` beside every row, each row
  shows the files on your volume it actually claims — and the rows that claim
  nothing say so, which is the fastest way to find the one that fits.
*/

/**
 * A template as a pattern over mount-relative paths.
 *
 * Two properties make this agree with the walker rather than merely resemble
 * it:
 *
 * `**` spans any number of directories including none, which is what lets one
 * row cover a live file at a claim's root and the rotated ones under
 * `archived/`.
 *
 * A token repeated in one template has to resolve to the same text every
 * time. `{app}-{env}-pvc/**\/{app}*.log*` says the directory and the filename
 * name the same application, because the walker substitutes one app into both.
 * Matching each occurrence independently made that row claim
 * `pv-checkout-prod-pvc/archived/pv-billing-2026-08-30.log` — a real file, a
 * real template, and a pairing the search would never produce. So the first
 * occurrence captures and the rest are backreferences.
 */
export function shapeRegExp(template: string): RegExp {
  const segs = template.split(/[/\\]/).filter(Boolean);
  /** Token name to capture-group number, for the backreferences. */
  const group = new Map<string, number>();
  let groups = 0;

  /*
    Escaped first, then the wildcards are re-opened. `*` and `?` survive
    escaping untouched, and a token comes out the other side as `\{app\}` —
    which is what the pattern below looks for, so no placeholder juggling is
    needed to keep wildcards apart from the literal text around them.
  */
  const segment = (seg: string) => seg
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\{(namespace|pod|app|env|container|date)\\\}/g, (_m, name: string) => {
      const seen = group.get(name);
      if (seen !== undefined) return `\\${seen}`;
      group.set(name, ++groups);
      return '([^/]+)';
    })
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]');

  let out = '^';
  segs.forEach((seg, i) => {
    const last = i === segs.length - 1;
    if (seg === '**') {
      // Non-capturing, so `**` does not shift the backreference numbering.
      // Trailing `**` means "anything below here", files included.
      out += last ? '.+' : '(?:[^/]+/)*';
      return;
    }
    out += segment(seg);
    if (!last) out += '/';
  });
  return new RegExp(out + '$', 'i');
}

/** Which of `paths` a template claims, and how many there were in all. */
export function filesForLayout(
  template: string, paths: string[], keep = 2,
): { rel: string[]; count: number } {
  const t = template.trim();
  if (!t) return { rel: [], count: 0 };
  let rx: RegExp;
  try {
    rx = shapeRegExp(t);
  } catch {
    // A template can be half-typed; a bad pattern claims nothing rather than
    // taking the probe down with it.
    return { rel: [], count: 0 };
  }
  const hit = paths.filter(p => rx.test(p));
  return { rel: hit.slice(0, keep), count: hit.length };
}
