/**
 * Moving a field map between repositories — screen 17E.
 *
 * An organisation with twelve product repositories and one template set should
 * configure this once, not twelve times.
 *
 * **Validated against the target before it is applied, dimension by
 * dimension.** Copying a map that mostly does not fit is worse than not copying
 * one, because the result *looks* configured: a board with four dimensions,
 * two of which render as empty columns nobody can explain. So the dialog does
 * the check and reports "3 of 7 apply" rather than claiming success.
 *
 * **Copied, not linked.** A later change to the source's map does not reach
 * here. A shared live map would mean one team's edit silently regrouping
 * another team's board, which is the kind of surprise that gets a tool turned
 * off.
 *
 * **What cannot be copied is skipped and named.** Dropped, not carried over as
 * dimensions that would render as empty columns — and said out loud, because a
 * silent drop is indistinguishable from a bug.
 */

/** One dimension, as either repository declares it. */
export interface MapField {
  dimension: string;
  /** The body heading it is read from — `### Module`. Absent for a Project field. */
  heading?: string;
  options: string[];
  /** Where it lives: the issue forms, or the linked Project. */
  source: 'form' | 'project';
}

export type Verdict = 'same' | 'extra' | 'missing' | 'no-project';

export interface Check {
  field: MapField;
  verdict: Verdict;
  /** The sentence the row shows. */
  said: string;
  /** Values this repository has that the source did not. */
  extra: string[];
  /** True when the field would actually be copied. */
  applies: boolean;
}

/** A file somebody exported, and can hand to the repository next door. */
export interface FieldMapFile {
  kind: 'dkgh-field-map';
  version: 1;
  repo: string;
  at: string;
  fields: MapField[];
}

/** This repository's own map, in the shape the file carries. */
export function mapOf(
  dimensions: { dimension: string; heading?: string; options: string[] }[],
  project: { name: string; options: string[] }[],
): MapField[] {
  return [
    ...dimensions.map(d => ({
      dimension: d.dimension, heading: d.heading, options: d.options, source: 'form' as const,
    })),
    ...project.map(p => ({
      dimension: p.name, options: p.options, source: 'project' as const,
    })),
  ];
}

export function exportable(repo: string, fields: MapField[], now = new Date()): FieldMapFile {
  return { kind: 'dkgh-field-map', version: 1, repo, at: now.toISOString(), fields };
}

/**
 * A file somebody handed us, or nothing.
 *
 * Strict about the marker on purpose: a JSON file that happens to have a
 * `fields` array is not a field map, and importing one would produce a board
 * grouped by whatever keys it contained.
 */
export function readMapFile(text: string): FieldMapFile | undefined {
  try {
    const raw = JSON.parse(text) as FieldMapFile;
    if (raw?.kind !== 'dkgh-field-map') return undefined;
    if (!Array.isArray(raw.fields)) return undefined;
    return {
      ...raw,
      fields: raw.fields
        .filter(f => f?.dimension)
        .map(f => ({
          dimension: String(f.dimension),
          heading: f.heading ? String(f.heading) : undefined,
          options: Array.isArray(f.options) ? f.options.map(String) : [],
          source: f.source === 'project' ? 'project' : 'form',
        })),
    };
  } catch {
    return undefined;
  }
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The source's map, checked field by field against this repository.
 *
 * A dimension applies when this repository has somewhere to read it from: the
 * heading for a form field, the Project for a Project field. A repository with
 * extra values is still a match — the source's map says which heading to read,
 * not which values are allowed.
 */
export function check(
  from: MapField[],
  here: { dimensions: MapField[]; hasProject: boolean },
): Check[] {
  return from.map(field => {
    const mine = here.dimensions.find(d => same(d.dimension, field.dimension));

    if (field.source === 'project' && !here.hasProject) {
      return {
        field, verdict: 'no-project', extra: [], applies: false,
        said: 'this repository has no Project; skipped',
      };
    }

    if (!mine) {
      return {
        field, verdict: 'missing', extra: [], applies: false,
        said: 'no such field here; skipped',
      };
    }

    const extra = mine.options.filter(o => !field.options.some(f => same(f, o)));
    if (extra.length > 0) {
      return {
        field, verdict: 'extra', extra, applies: true,
        said: extra.length === 1
          ? 'exists, this repo has one more value'
          : `exists, this repo has ${extra.length} more values`,
      };
    }

    const where = mine.heading ? `\`### ${mine.heading}\` exists here` : 'exists';
    return {
      field, verdict: 'same', extra: [], applies: true,
      said: `${where}, same ${field.options.length} value${field.options.length === 1 ? '' : 's'}`,
    };
  });
}

/** "3 of 7 apply · 4 skipped". */
export function tally(checks: Check[]): string {
  const apply = checks.filter(c => c.applies).length;
  const skipped = checks.length - apply;
  const head = `${apply} of ${checks.length} apply`;
  return skipped > 0 ? `${head} · ${skipped} skipped` : head;
}

/**
 * The two skipped groups, as the mock words them.
 *
 * Fields missing here are one row; Project fields with no Project are another,
 * because they are skipped for a different reason and the fix is different —
 * one is "add the heading", the other is "link a Project".
 */
export function skippedLines(checks: Check[]): { why: Verdict; names: string[] }[] {
  const out: { why: Verdict; names: string[] }[] = [];
  const missing = checks.filter(c => c.verdict === 'missing').map(c => c.field.dimension);
  const noProject = checks.filter(c => c.verdict === 'no-project').map(c => c.field.dimension);
  if (missing.length) out.push({ why: 'missing', names: missing });
  if (noProject.length) out.push({ why: 'no-project', names: noProject });
  return out;
}

/*
  ── Where a copied map lives ──

  In this browser's storage, per repository, and nowhere else. dkgh cannot put
  another repository's forms into this one without committing files to it —
  that is screen 18C, a different action with a different confirmation — so a
  copied map is a local override that says "read these headings here".

  Which is also what makes "copied, not linked" true: nothing reaches back to
  the repository it came from, and nothing reaches forward from it.
*/
const KEY = 'dkgh.fieldmap';

export function loadFieldMap(repo: string): MapField[] {
  try {
    const raw = window.localStorage.getItem(`${KEY}.${repo}`);
    if (!raw) return [];
    const stored = JSON.parse(raw) as MapField[];
    return Array.isArray(stored) ? stored.filter(f => f?.dimension) : [];
  } catch {
    return [];
  }
}

export function saveFieldMap(repo: string, fields: MapField[]): void {
  try {
    if (fields.length === 0) window.localStorage.removeItem(`${KEY}.${repo}`);
    else window.localStorage.setItem(`${KEY}.${repo}`, JSON.stringify(fields));
  } catch {
    /* Storage off. The copy lasts as long as the tab. */
  }
}

/**
 * The repository's own dimensions, with a copied map's headings laid over them.
 *
 * The repository always wins on *values* — those are what its own forms
 * actually offer, and a copied list would show options nobody here can pick.
 * What the copy contributes is the heading to read and the order to show them
 * in, which is the part that was configured twelve times.
 */
export function merged<T extends { dimension: string; heading?: string; options: string[] }>(
  own: T[],
  copied: MapField[],
): T[] {
  if (copied.length === 0) return own;
  const byName = new Map(own.map(d => [d.dimension.toLowerCase(), d]));
  const out: T[] = [];
  for (const c of copied) {
    const mine = byName.get(c.dimension.toLowerCase());
    if (!mine) continue;
    out.push({ ...mine, heading: c.heading ?? mine.heading });
    byName.delete(c.dimension.toLowerCase());
  }
  /* Anything this repository has that the copy did not name keeps its place at
     the end rather than disappearing — a copied map adds an order, it does not
     hide fields. */
  return [...out, ...own.filter(d => byName.has(d.dimension.toLowerCase()))];
}
