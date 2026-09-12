/**
 * Taking a label set from somewhere else — screen 19D.
 *
 * A new repository starts with GitHub's nine defaults, none of which a testing
 * team uses. The set they want already exists on the repository next door.
 *
 * **Only additions and colour changes. Nothing here is deleted.** An import
 * that made this repository match the other one exactly would strip labels
 * somebody is using, and "sync" is not what anybody means when they ask for
 * this. Deleting is a separate, deliberate act on the Labels tab.
 *
 * **Staged, not pushed.** The additions land in the same amber not-pushed
 * state as a hand edit, so an import and a manual change go through one review
 * and one push — and an import can be reconsidered before it reaches the
 * repository.
 *
 * **Descriptions come across too.** A label with no description is a label
 * people guess at.
 */

export interface Label {
  name: string;
  /** Six hex digits, no `#`, as GitHub gives them. */
  color: string;
  description?: string;
}

export interface Clash {
  name: string;
  /** What this repository has. */
  mine: Label;
  /** What the other one has. */
  theirs: Label;
}

export interface LabelDiff {
  /** Labels the other repository has and this one does not. */
  additions: Label[];
  /** Same name, same colour — nothing to do. */
  identical: Label[];
  /** Same name, different colour. */
  clashes: Clash[];
  /** How many each side has, for the heading. */
  there: number;
  here: number;
}

const key = (name: string) => name.trim().toLowerCase();
const hex = (c: string) => c.replace(/^#/, '').trim().toLowerCase();

/**
 * What importing that set would mean here.
 *
 * Names are compared case-insensitively because GitHub treats `Bug` and `bug`
 * as the same label — creating the second is an error, not a second label, and
 * an import that tried would fail halfway through.
 */
export function diff(theirs: Label[], mine: Label[]): LabelDiff {
  const byName = new Map(mine.map(l => [key(l.name), l]));
  const additions: Label[] = [];
  const identical: Label[] = [];
  const clashes: Clash[] = [];

  for (const t of theirs) {
    const m = byName.get(key(t.name));
    if (!m) { additions.push(t); continue; }
    if (hex(m.color) === hex(t.color)) { identical.push(t); continue; }
    clashes.push({ name: m.name, mine: m, theirs: t });
  }

  return { additions, identical, clashes, there: theirs.length, here: mine.length };
}

/** Which side of a clash wins. `mine` is the default, and stays the default. */
export type Side = 'mine' | 'theirs';

/**
 * The edits to stage, as the Labels tab's own shape.
 *
 * An addition is an edit with no `readAs` — that is what makes the tab draw it
 * as "new here" and what makes the plan turn it into a POST. A clash resolved
 * in the other repository's favour is a colour change on a label that already
 * exists, which is a PATCH, so it carries the label it was read as.
 */
export function stage(
  d: LabelDiff,
  sides: Record<string, Side>,
): Record<string, { was?: string; name: string; color: string; description?: string;
                   readAs?: Label }> {
  const out: Record<string, {
    was?: string; name: string; color: string; description?: string; readAs?: Label;
  }> = {};

  for (const l of d.additions) {
    out[`import:${l.name}`] = {
      name: l.name,
      color: `#${hex(l.color)}`,
      description: l.description,
    };
  }

  for (const c of d.clashes) {
    if ((sides[c.name] ?? 'mine') === 'mine') continue;
    out[c.mine.name] = {
      was: c.mine.name,
      name: c.mine.name,
      color: `#${hex(c.theirs.color)}`,
      description: c.theirs.description ?? c.mine.description,
      readAs: c.mine,
    };
  }

  return out;
}

/** "9 to create · 2 clashes, both keeping yours". */
export function summary(d: LabelDiff, sides: Record<string, Side>): string {
  const taking = d.clashes.filter(c => (sides[c.name] ?? 'mine') === 'theirs').length;
  const bits = [`${d.additions.length} to create`];
  if (d.clashes.length > 0) {
    const which = taking === 0 ? 'all keeping yours'
      : taking === d.clashes.length ? 'all taking theirs'
      : `${taking} taking theirs`;
    bits.push(`${d.clashes.length} clash${d.clashes.length === 1 ? '' : 'es'}, ${which}`);
  }
  return bits.join(' · ');
}

/** The first few names on the "N new" row, and how many are left. */
export function preview(additions: Label[], show = 3): { shown: Label[]; more: number } {
  return { shown: additions.slice(0, show), more: Math.max(0, additions.length - show) };
}
