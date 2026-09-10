/**
 * The linked Project, and what it adds to the board.
 *
 * Status, Priority, Start date and Target date live on a Projects v2 board that
 * the issue is an item of — not on the issue. Every screen in this tab that
 * wanted them has shown a dash and said "needs the project scope"; this is
 * where they arrive.
 *
 * **Merged into `dimensions`, not bolted on beside them.** The board already
 * groups, filters, colours, charts and exports by dimension. A project field
 * that arrived as its own parallel concept would need all six of those taught
 * about it; one that arrives as a dimension needs none of them changed, and
 * that is why the columns view is a grouping rather than a new kind of board.
 *
 * **A repository with no project is the ordinary case.** It is not an error and
 * does not get one — the views that need a project say what is missing, in one
 * sentence, and everything else carries on.
 */
import { useEffect, useState } from 'react';
import { postMsg } from '../../vscode';
import type { BoardIssue, ProposedDimension } from './board-types';

export interface ProjectOption { id: string; name: string }

export interface ProjectField {
  id: string;
  name: string;
  dataType: string;
  options?: ProjectOption[];
}

export interface ProjectItem {
  id: string;
  number: number;
  values: Record<string, string>;
  optionIds: Record<string, string>;
}

export interface ProjectBoard {
  repo: string;
  id?: string;
  number?: number;
  title?: string;
  fields: ProjectField[];
  items: ProjectItem[];
  absent?: 'none' | 'scope' | string;
}

/** The fields worth putting on the board. A Title column is not one. */
const SKIP = new Set([
  'title', 'assignees', 'labels', 'milestone', 'repository', 'reviewers',
  'linked pull requests', 'parent issue', 'sub-issues progress', 'notes',
]);

export function isBoardField(f: ProjectField): boolean {
  return !SKIP.has(f.name.toLowerCase())
    && ['SINGLE_SELECT', 'DATE', 'ITERATION', 'NUMBER'].includes(f.dataType);
}

/** Read the project once per repository, and again when a write lands. */
export function useProject(repo: string, reload: number): ProjectBoard | null {
  const [board, setBoard] = useState<ProjectBoard | null>(null);

  useEffect(() => {
    setBoard(null);
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg.type !== 'dkgh:project:result') return;
      if (msg.repo !== repo) return;
      setBoard(msg as unknown as ProjectBoard);
    };
    window.addEventListener('message', handler);
    postMsg({ type: 'dkgh:project', repo });
    return () => window.removeEventListener('message', handler);
  }, [repo, reload]);

  return board;
}

/**
 * The project's own single-selects, as dimensions the board understands.
 *
 * In the order the project declares its options, which is the order somebody
 * arranged their columns in — and the order Todo · In progress · Done has to
 * come out in, because alphabetical would put Done first.
 */
export function projectDimensions(board: ProjectBoard | null): ProposedDimension[] {
  if (!board?.id) return [];
  return board.fields
    .filter(f => isBoardField(f) && f.dataType === 'SINGLE_SELECT')
    .map(f => ({
      dimension: f.name.toLowerCase(),
      heading: f.name,
      options: (f.options ?? []).map(o => o.name),
      files: [],
    }));
}

/**
 * The issues, with the project's values folded into their dimensions.
 *
 * Lower-cased keys, because that is what a dimension is keyed by everywhere
 * else in this tab. A project field whose name collides with a form heading
 * loses to the form: the form is in the repository and the project is a view
 * over it, so the repository's own word wins.
 */
export function withProject(issues: BoardIssue[], board: ProjectBoard | null): BoardIssue[] {
  if (!board?.id || board.items.length === 0) return issues;
  const by = new Map(board.items.map(i => [i.number, i]));
  const fields = board.fields.filter(isBoardField);

  return issues.map(issue => {
    const item = by.get(issue.number);
    if (!item) return issue;
    const dimensions = { ...issue.dimensions };
    for (const f of fields) {
      const value = item.values[f.name];
      if (!value) continue;
      const key = f.name.toLowerCase();
      if (dimensions[key]) continue;
      dimensions[key] = value;
    }
    return dimensions === issue.dimensions ? issue : { ...issue, dimensions };
  });
}

/** The date fields a roadmap can place an issue on, in the project's order. */
export function dateFields(board: ProjectBoard | null): ProjectField[] {
  return (board?.fields ?? []).filter(f => f.dataType === 'DATE');
}

/** One sentence about why there is no project view, or nothing. */
export function absentBecause(board: ProjectBoard | null): string {
  if (!board || board.id) return '';
  if (board.absent === 'none') {
    return 'This repository has no linked Project, so there is no Status to arrange by. '
      + 'A Project on github.com, with this repository added to it, is what fills this in.';
  }
  if (board.absent === 'scope') {
    return 'Reading a Project needs the read:project scope, which this credential does not '
      + 'have. `gh auth refresh --scopes read:project` adds it without signing you out.';
  }
  return board.absent ?? '';
}
