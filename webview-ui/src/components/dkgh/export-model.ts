/**
 * What the export writes — screen 15.
 *
 * **The file is the view.** Same filters, same columns, same order, same
 * grouping. That equivalence is the whole feature: you check the report on
 * screen and then press a button, rather than exporting and then checking
 * whether the file agrees with what you saw. So the columns here are the
 * table's own catalogue rather than a second list that can drift from it.
 *
 * **A cell knows its type.** An export that writes "11 Sep" into a spreadsheet
 * produces a text column nobody can sort, and one that writes `41` as a string
 * produces a number column nobody can sum. Every column declares `text`,
 * `number` or `date`, the screen keeps the friendly form, and the file gets
 * `2026-09-11` and a real number.
 *
 * **Nothing is offered that cannot be delivered.** The mock's column list
 * includes every comment on every issue; the board does not hold those, and a
 * column of blanks with a promising name is worse than an absent one. What is
 * here is what the board actually has — and `bodyText` says out loud that it is
 * the truncated copy the search box uses.
 */
import type { BoardIssue, ProposedDimension } from './board-types';
import { arrange, catalogue, type TableColumn } from './table-columns';

export type CellType = 'text' | 'number' | 'date';

export interface ExportColumn {
  key: string;
  label: string;
  type: CellType;
  /** What goes in the file. The screen's own formatting is not applied here. */
  value: (i: BoardIssue) => string | number;
  /** Why it is worth a tick, where the name does not say it. */
  note?: string;
}

export type Format = 'csv' | 'md' | 'xlsx' | 'pdf';

export interface FormatSpec {
  id: Format;
  name: string;
  ext: string;
  blurb: string;
  /** False while the writer for it does not exist. Said, never hidden. */
  live: boolean;
}

export const FORMATS: FormatSpec[] = [
  { id: 'xlsx', name: 'Excel', ext: 'xlsx', live: true,
    blurb: '.xlsx with a frozen header, filters on, and one sheet per group' },
  { id: 'pdf', name: 'PDF', ext: 'pdf', live: false,
    blurb: 'Landscape report for the status mail — not written yet' },
  { id: 'csv', name: 'CSV', ext: 'csv', live: true,
    blurb: 'UTF-8 BOM so Excel stops mangling names' },
  { id: 'md', name: 'Markdown', ext: 'md', live: true,
    blurb: 'A table to paste into a wiki or a chat thread' },
];

/** Which rows the file gets. */
export type Scope = 'view' | 'selected' | 'all';

/**
 * The columns available to an export, in the table's own order.
 *
 * The table's catalogue first — so "same columns" is true by construction —
 * then the handful that only make sense in a file. Nothing on screen is 700
 * characters of body text.
 */
export function exportColumns(dimensions: ProposedDimension[]): ExportColumn[] {
  const typed = (c: TableColumn): CellType => {
    if (c.key === 'created') return 'date';
    if (['number', 'comments', 'age', 'quiet'].includes(c.key)) return 'number';
    return 'text';
  };

  const fromTable: ExportColumn[] = catalogue(dimensions).map(c => ({
    key: c.key,
    label: c.label === '#' ? 'Number' : c.label,
    type: typed(c),
    value: c.value,
  }));

  const fileOnly: ExportColumn[] = [
    {
      key: 'updated', label: 'Last activity', type: 'date',
      value: i => i.updatedAt,
    },
    {
      key: 'body', label: 'Body text', type: 'text',
      value: i => i.bodyText ?? i.bodyFirstLine ?? '',
      note: 'The shortened copy the search box uses, not the whole body',
    },
    {
      key: 'evidence', label: 'Evidence URLs', type: 'text',
      value: i => i.evidence.join(' '),
    },
  ];

  return [...fromTable, ...fileOnly];
}

/** What a fresh export ticks: everything the table is showing, and nothing else. */
export function defaultColumns(chosen: string[], pinned?: string[]): string[] {
  return arrange(catalogue([]), chosen, pinned).map(c => c.key).length
    ? chosen
    : ['number', 'title', 'state'];
}

/**
 * One row of cells, ready for any writer.
 *
 * Dates come out ISO — `2026-09-11`, not `11 Sep` — because a spreadsheet
 * needs a real date and a wiki table reads fine either way. The one place the
 * friendly form belongs is the screen, and the screen keeps it.
 */
export function cells(issue: BoardIssue, columns: ExportColumn[]): (string | number)[] {
  return columns.map(c => {
    const raw = c.value(issue);
    if (c.type === 'date') return isoDay(String(raw));
    if (c.type === 'number') return typeof raw === 'number' ? raw : Number(raw) || 0;
    return String(raw ?? '');
  });
}

/** `2026-09-11T08:04:00Z` → `2026-09-11`. Anything unparseable is left alone. */
export function isoDay(at: string): string {
  const m = at.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : at;
}

/**
 * CSV, with the BOM.
 *
 * Excel reads a BOM-less UTF-8 file as the system codepage, which is how a
 * report of somebody's issues comes out with their name spelled in mojibake.
 * Three bytes fix it and nothing else reads them as content.
 */
export function toCsv(rows: BoardIssue[], columns: ExportColumn[]): string {
  const line = (values: (string | number)[]) => values.map(csvCell).join(',');
  return '﻿' + [
    line(columns.map(c => c.label)),
    ...rows.map(r => line(cells(r, columns))),
  ].join('\r\n') + '\r\n';
}

function csvCell(v: string | number): string {
  const s = String(v ?? '');
  /*
    A leading `=`, `+`, `-` or `@` makes Excel treat the cell as a formula.
    Somebody's issue title beginning with a minus sign should not execute, and
    the apostrophe is the prefix Excel itself uses to say "this is text".
  */
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** A GitHub-flavoured table, for a wiki page or a chat thread. */
export function toMarkdown(rows: BoardIssue[], columns: ExportColumn[]): string {
  const line = (values: (string | number)[]) => `| ${values.map(mdCell).join(' | ')} |`;
  return [
    line(columns.map(c => c.label)),
    `| ${columns.map(c => (c.type === 'number' ? '---:' : '---')).join(' | ')} |`,
    ...rows.map(r => line(cells(r, columns))),
  ].join('\n') + '\n';
}

function mdCell(v: string | number): string {
  /* A pipe inside a cell ends the cell, and a newline ends the row. Both are
     ordinary things to find in an issue title. */
  return String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/**
 * What the file is called.
 *
 * The repository, what was on screen, and the day — which is the three things
 * somebody needs when they find it in Downloads a fortnight later.
 */
export function filename(repo: string, view: string, ext: string, on = new Date()): string {
  const day = on.toISOString().slice(0, 10);
  const name = [repo.split('/')[1] || repo, view, day]
    .map(part => part.trim())
    .filter(Boolean)
    .join(' — ');
  return `${name.replace(/[\\/:*?"<>|]/g, '-')}.${ext}`;
}

/**
 * The rows, grouped for a workbook's sheets.
 *
 * One sheet per group is the mock's default, and it is the reason grouping is
 * worth carrying into the file at all: a spreadsheet with a Module column is a
 * spreadsheet somebody has to filter, and a workbook with a Module tab is one
 * they can hand to the module's owner.
 */
export function sheets(
  rows: BoardIssue[], by: string | undefined, dimensions: ProposedDimension[],
): { name: string; rows: BoardIssue[] }[] {
  if (!by) return [{ name: 'Issues', rows }];
  const known = dimensions.find(d => d.dimension === by)?.options ?? [];
  const groups = new Map<string, BoardIssue[]>();
  for (const r of rows) {
    const key = valueFor(r, by) || `No ${by}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const order = [...known, ...[...groups.keys()].filter(k => !known.includes(k))];
  return order
    .filter(k => groups.has(k))
    .map(name => ({ name: sheetName(name), rows: groups.get(name)! }));
}

function valueFor(issue: BoardIssue, field: string): string {
  if (field === 'assignee') return issue.assignees[0] ?? '';
  if (field === 'milestone') return issue.milestone ?? '';
  if (field === 'state') return issue.state === 'OPEN' ? 'Open' : 'Closed';
  return issue.dimensions[field] ?? '';
}

/**
 * A sheet name Excel will accept.
 *
 * Thirty-one characters, and none of `[]:*?/\`. A workbook that will not open
 * because a module was called `api/v2` is a bug people cannot diagnose.
 */
export function sheetName(name: string): string {
  const clean = name.replace(/[[\]:*?/\\]/g, '-').trim() || 'Sheet';
  return clean.length > 31 ? clean.slice(0, 31) : clean;
}
