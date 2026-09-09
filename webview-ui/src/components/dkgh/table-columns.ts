/**
 * Every column the table can show, and where each one comes from.
 *
 * **A column knows its source.** The badge beside each name in the picker is not
 * decoration: hiding the columns that depend on something you do not have is
 * exactly what you do on a repository with no issue forms, and seeing at a
 * glance that five of your eleven columns come from templates this repository
 * never declared explains an otherwise baffling row of dashes.
 *
 * **`#` and `Title` are pinned.** They stay while the rest scrolls sideways,
 * because a row you cannot identify is not a row. They are also the only two
 * that cannot be switched off, for the same reason.
 *
 * The catalogue is built per repository, because the form-sourced half of it is
 * whatever that repository's templates happened to declare. `Project`-sourced
 * columns — Status, Priority, Start and Target date on a linked Project — are
 * not in here yet; they arrive with the project scope work, and offering a
 * column that can only ever be blank would be worse than not offering it.
 */
import { cap, type BoardIssue, type ProposedDimension } from './board-types';

export type ColumnSource = 'native' | 'form' | 'computed';

export interface TableColumn {
  key: string;
  label: string;
  source: ColumnSource;
  /** Stays put while the rest scrolls sideways, and cannot be hidden. */
  pinned?: boolean;
  width: number;
  align?: 'left' | 'right';
  /** How it sorts, and what the export writes. */
  value: (i: BoardIssue) => string | number;
  /** Single-valued and list-backed, so it can be changed in the cell it is in. */
  editable?: 'assignee' | 'milestone';
}

/** What GitHub itself carries, plus what dkgh computed on the way in. */
const BASE: TableColumn[] = [
  { key: 'number', label: '#', source: 'native', pinned: true, width: 54, align: 'right',
    value: i => i.number },
  { key: 'title', label: 'Title', source: 'native', pinned: true, width: 340,
    value: i => i.title },
  { key: 'state', label: 'State', source: 'native', width: 76,
    value: i => (i.state === 'OPEN' ? 'Open' : 'Closed') },
  { key: 'assignee', label: 'Assignee', source: 'native', width: 118,
    value: i => i.assignees[0] ?? '', editable: 'assignee' },
  { key: 'author', label: 'Author', source: 'native', width: 110,
    value: i => i.author ?? '' },
  { key: 'labels', label: 'Labels', source: 'native', width: 150,
    value: i => i.labels.map(l => l.name).join(', ') },
  { key: 'milestone', label: 'Milestone', source: 'native', width: 120,
    value: i => i.milestone ?? '', editable: 'milestone' },
  { key: 'comments', label: 'Comments', source: 'native', width: 84, align: 'right',
    value: i => i.commentCount },
  { key: 'age', label: 'Age', source: 'computed', width: 62, align: 'right',
    value: i => i.ageDays },
  { key: 'quiet', label: 'Quiet', source: 'computed', width: 68, align: 'right',
    value: i => i.quietDays },
  { key: 'created', label: 'Created', source: 'computed', width: 90,
    value: i => i.createdAt },
  { key: 'url', label: 'Issue URL', source: 'native', width: 200,
    value: i => i.url },
];

/**
 * The catalogue for one repository.
 *
 * Form dimensions are spliced in after Title rather than appended, because they
 * are the columns a lead reads first — what kind of thing, in which module,
 * on which environment — and a default arrangement that buried them behind
 * Author would be a default nobody keeps.
 */
export function catalogue(dimensions: ProposedDimension[]): TableColumn[] {
  const fromForms: TableColumn[] = dimensions.map(d => ({
    key: d.dimension,
    label: cap(d.dimension),
    source: 'form' as const,
    width: 108,
    value: (i: BoardIssue) => i.dimensions[d.dimension] ?? '',
  }));
  return [BASE[0], BASE[1], ...fromForms, ...BASE.slice(2)];
}

/** The columns that are on, in the order they were arranged. */
export function arrange(all: TableColumn[], chosen: string[]): TableColumn[] {
  const byKey = new Map(all.map(c => [c.key, c]));
  const out: TableColumn[] = [];
  const seen = new Set<string>();

  for (const key of chosen) {
    const col = byKey.get(key);
    /*
      A key with no column is not an error. It is a column that means something
      in a different repository — kept in the arrangement, not rendered here,
      and waiting when you go back. See board-prefs.
    */
    if (!col || seen.has(key)) continue;
    seen.add(key);
    out.push(col);
  }

  /* The pinned pair is not optional. An arrangement that lost them — an old
     preference, a hand-edited store — still renders a table you can read. */
  for (const col of all) {
    if (col.pinned && !seen.has(col.key)) out.unshift(col);
  }
  return out;
}

export const SOURCE_LABEL: Record<ColumnSource, string> = {
  native: 'github',
  form: 'form',
  computed: 'computed',
};
