/**
 * How the board is arranged, and which half of that survives a repository.
 *
 * The split is the whole point of this file, and it is the thing screen 03E
 * exists to tell people before they find out the hard way:
 *
 * - **Shape travels.** Cards or table, comfortable or dense, which elements are
 *   on a card, the order of the columns, whether long titles wrap. None of it
 *   names a repository, so none of it should be lost by changing one.
 * - **Meaning does not.** A grouping on `module`, a sort on `env`, a search
 *   term. `module:checkout` has no meaning in a repository whose templates
 *   never declared a Module, and carrying it across would silently produce an
 *   empty board with a filter nobody remembers setting.
 *
 * So the shape is one global record and the meaning is one record per
 * repository, and a column that names a dimension the current repository does
 * not have is simply not rendered — kept, because it will mean something again
 * when you go back, and not shown as broken, because it is not broken. It is
 * somewhere else.
 *
 * Stored in `localStorage` rather than through the host. These are view
 * preferences, not data: losing them costs a reader four clicks, and putting
 * them in the settings database would mean a round trip on every density
 * toggle.
 */
import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_PINNED } from './table-columns';

/** Everything on a card that can be switched off. The title cannot. */
export const CARD_FIELDS = [
  { id: 'number', label: 'Number', why: 'The only thing you can say out loud in a standup.' },
  { id: 'chips', label: 'Type · Environment', why: 'The two chips that decide whether you care right now.' },
  { id: 'evidence', label: 'Evidence thumbnail', why: 'How you recognise the bug you already know about.' },
  { id: 'assignee', label: 'Assignee', why: 'Who.' },
  { id: 'priority', label: 'Priority', why: 'How bad.' },
  { id: 'age', label: 'Age', why: 'How long it has been true.' },
  { id: 'comments', label: 'Comment count', why: 'A 21-day issue with no comments is a different problem from one with nine.' },
  { id: 'module', label: 'Module', why: 'Off while the board is grouped by it — a card repeating its own group header is noise.' },
  { id: 'milestone', label: 'Milestone', why: 'Which release it is meant to be in.' },
  { id: 'labels', label: 'Labels', why: 'What GitHub itself carries.' },
  { id: 'body', label: 'First line of the body', why: 'The sentence the title had to leave out.' },
] as const;

export type CardField = (typeof CARD_FIELDS)[number]['id'];

/** On by default: the seven the anatomy in screen 04B calls out. */
const DEFAULT_CARD_FIELDS: CardField[] = [
  'number', 'chips', 'evidence', 'assignee', 'priority', 'age', 'comments',
];

export type Density = 'comfortable' | 'compact' | 'dense';
export type BoardView = 'cards' | 'table' | 'columns' | 'roadmap';

/** One level of the table's sort. Two of them is the "urgent, then oldest" case. */
export interface SortLevel { key: string; dir: 'asc' | 'desc' }

/** The half that travels. */
export interface ShapePrefs {
  view: BoardView;
  density: Density;
  cardFields: CardField[];
  /** Ordered, and the export writes them in this order. See screen 05A. */
  columns: string[];
  /** Frozen at the left while the rest scrolls sideways. See screen 05A. */
  pinnedColumns: string[];
  /** A long title wraps rather than being cut. See screen 05E. */
  wrapTitles: boolean;
}

/** The half that does not. Keyed by `owner/name`. */
export interface MeaningPrefs {
  groupBy: string;
  sort: SortLevel[];
}

const SHAPE_KEY = 'dkgh.shape';
const MEANING_KEY = 'dkgh.meaning';

/**
 * The columns that are on by default, in the order 05A shows them.
 *
 * `number` and `title` lead because they are pinned — a row you cannot identify
 * is not a row — and the rest are ordered the way a lead reads them: what kind
 * of thing, where, how far along, how bad, whose, when.
 *
 * Some of these name a dimension a given repository may never have declared.
 * That is deliberate: an unknown key is skipped rather than dropped, so a
 * repository with a Module column keeps it in that position and one without
 * simply closes the gap. See `arrange` in table-columns.
 */
export const DEFAULT_COLUMNS = [
  'number', 'title', 'type', 'module', 'environment',
  'status', 'priority', 'assignee', 'labels', 'age', 'quiet',
];

const DEFAULT_SHAPE: ShapePrefs = {
  view: 'cards',
  density: 'comfortable',
  cardFields: DEFAULT_CARD_FIELDS,
  columns: DEFAULT_COLUMNS,
  pinnedColumns: DEFAULT_PINNED,
  wrapTitles: true,
};

const DEFAULT_MEANING: MeaningPrefs = { groupBy: 'none', sort: [] };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    /* Spread over the default rather than replacing it: a preference file
       written by an older build is missing whatever was added since, and a
       board that renders with `columns: undefined` is a blank screen. */
    return { ...fallback, ...(JSON.parse(raw) as object) };
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* A webview with storage disabled still works, it just forgets. Nothing
       here is worth an error message. */
  }
}

/** The shape, and a setter that persists. Shared by every repository. */
export function useShapePrefs(): [ShapePrefs, (patch: Partial<ShapePrefs>) => void] {
  const [shape, setShape] = useState<ShapePrefs>(() => read(SHAPE_KEY, DEFAULT_SHAPE));
  const update = useCallback((patch: Partial<ShapePrefs>) => {
    setShape(prev => {
      const next = { ...prev, ...patch };
      write(SHAPE_KEY, next);
      return next;
    });
  }, []);
  return [shape, update];
}

/** The meaning, for one repository. Reset when the repository changes. */
export function useMeaningPrefs(repo: string): [MeaningPrefs, (patch: Partial<MeaningPrefs>) => void] {
  const key = `${MEANING_KEY}.${repo}`;
  const [meaning, setMeaning] = useState<MeaningPrefs>(() => read(key, DEFAULT_MEANING));

  /* Re-read on a repository change rather than carrying the last one's
     grouping across — which is exactly the mistake screen 03E warns about. */
  useEffect(() => { setMeaning(read(key, DEFAULT_MEANING)); }, [key]);

  const update = useCallback((patch: Partial<MeaningPrefs>) => {
    setMeaning(prev => {
      const next = { ...prev, ...patch };
      write(key, next);
      return next;
    });
  }, [key]);

  return [meaning, update];
}

/** Whether a repository has anything saved under it — screen 03E's second list. */
export function meaningFor(repo: string): MeaningPrefs | undefined {
  try {
    const raw = window.localStorage.getItem(`${MEANING_KEY}.${repo}`);
    return raw ? { ...DEFAULT_MEANING, ...(JSON.parse(raw) as object) } : undefined;
  } catch {
    return undefined;
  }
}

/** Row padding by density, in the one place both views can agree on it. */
export const DENSITY_PAD: Record<Density, string> = {
  comfortable: '7px 10px',
  compact: '4px 9px',
  dense: '2px 8px',
};
