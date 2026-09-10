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
  { id: 'pdf', name: 'PDF', ext: 'pdf', live: true,
    blurb: 'Landscape report with a cover that says what it means' },
  { id: 'csv', name: 'CSV', ext: 'csv', live: true,
    blurb: 'UTF-8 BOM so Excel stops mangling names' },
  { id: 'md', name: 'Markdown', ext: 'md', live: true,
    blurb: 'A table to paste into a wiki or a chat thread' },
];

/** Which rows the file gets. */
/**
 * Where the rows come from.
 *
 * The first three are all off what the board already holds. `repository` is
 * 15D: everything there has ever been, which no board read has, so it is paged
 * from GitHub before the file can be written.
 */
export type Scope = 'view' | 'selected' | 'all' | 'repository';

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

/* ── The PDF's own shape ──────────────────────────────────────────────────── */

export type Tone = 'plain' | 'good' | 'warn' | 'bad' | 'muted';

export interface Report {
  title: string;
  subtitle: string;
  tiles: { n: string; label: string; tone: Tone }[];
  sentence: string;
  bars: { label: string; total: number; parts: { share: number; tone: Tone }[] }[];
  ages: { label: string; count: number; tone: Tone }[];
  columns: string[];
  groups: { name: string; rows: { cells: string[]; tones?: Record<number, Tone> }[] }[];
  footer: string;
}

/**
 * The status report — screen 15B.
 *
 * The audience is the person who will not open a spreadsheet, so the cover
 * carries a **sentence** and not only three numbers. It is generated from the
 * same counts the tiles are, which is what stops it from being a nice line that
 * disagrees with the figures beside it.
 */
export function report(
  rows: BoardIssue[],
  columns: ExportColumn[],
  opts: {
    repo: string;
    view: string;
    /** The grouping the board is on, so the sections match the screen. */
    groupBy?: string;
    dimensions: ProposedDimension[];
    /** The filter, in words, for the footer. */
    query: string;
    on?: Date;
  },
): Report {
  const open = rows.filter(i => i.state === 'OPEN');
  const dims = opts.dimensions;

  const priority = dims.find(d => /priority/i.test(d.dimension));
  const urgent = priority
    ? open.filter(i => i.dimensions[priority.dimension] === priority.options[0]).length
    : 0;
  const unowned = open.filter(i => i.assignees.length === 0).length;
  const stale = open.filter(i => i.quietDays >= 14).length;

  const tiles: Report['tiles'] = [
    ...(priority ? [{ n: String(urgent), label: priority.options[0] ?? 'urgent',
      tone: (urgent ? 'bad' : 'muted') as Tone }] : []),
    { n: String(unowned), label: 'unowned', tone: (unowned ? 'warn' : 'muted') as Tone },
    { n: String(stale), label: 'quiet 14 days', tone: (stale ? 'warn' : 'muted') as Tone },
  ].slice(0, 3);

  /* The bars are the first dimension the repository has, which is the one its
     own templates put first — the same order the board groups by. */
  const by = dims[0];
  const split = dims[1];
  const bars = by ? countBy(open, i => i.dimensions[by.dimension] || `No ${by.dimension}`)
    .slice(0, 8)
    .map(([label, issues]) => ({
      label,
      total: issues.length,
      parts: split
        ? countBy(issues, i => i.dimensions[split.dimension] || 'unset')
          .map(([value, list]) => ({
            share: list.length / issues.length,
            tone: (split.options.indexOf(value) === split.options.length - 1
              ? 'bad' : 'muted') as Tone,
          }))
        : [{ share: 1, tone: 'muted' as Tone }],
    })) : [];

  const bands: [string, (n: number) => boolean, Tone][] = [
    ['0-3d', n => n <= 3, 'good'],
    ['4-7d', n => n > 3 && n <= 7, 'good'],
    ['8-14d', n => n > 7 && n <= 14, 'warn'],
    ['15-30d', n => n > 14 && n <= 30, 'warn'],
    ['30d+', n => n > 30, 'bad'],
  ];
  const ages = bands.map(([label, test, tone]) => ({
    label, tone, count: open.filter(i => test(i.ageDays)).length,
  }));

  const grouped = opts.groupBy
    ? sheets(rows, opts.groupBy, dims)
    : [{ name: 'All', rows }];

  return {
    title: `${opts.repo.split('/')[1] ?? opts.repo} - ${opts.view}`,
    subtitle: `${(opts.on ?? new Date()).toLocaleDateString(undefined, {
      day: 'numeric', month: 'long', year: 'numeric',
    })} · ${open.length} open issue${open.length === 1 ? '' : 's'}`,
    tiles,
    sentence: sentence(open.length, urgent, unowned, stale, priority?.options[0]),
    bars,
    ages,
    columns: columns.map(c => c.label),
    groups: grouped.map(g => ({
      name: g.name,
      rows: g.rows.map(issue => ({
        cells: cells(issue, columns).map(String),
        tones: tonesFor(issue, columns),
      })),
    })),
    footer: `${opts.repo} · ${opts.query || 'no filter'}`,
  };
}

/**
 * The cover's one line.
 *
 * Built from the same counts as the tiles, so it cannot contradict them — which
 * is the failure mode of a summary written by hand. It says nothing when there
 * is nothing to say, rather than reaching for a sentence.
 */
function sentence(
  open: number, urgent: number, unowned: number, stale: number, urgentWord?: string,
): string {
  if (open === 0) return 'Nothing is open.';
  const parts: string[] = [];
  if (urgent > 0) {
    parts.push(`${urgent} ${urgent === 1 ? 'issue is' : 'issues are'} `
      + `${(urgentWord ?? 'urgent').toLowerCase()}`);
  }
  if (unowned > 0) parts.push(`${unowned} ${unowned === 1 ? 'has' : 'have'} nobody on ${unowned === 1 ? 'it' : 'them'}`);
  if (stale > 0) {
    parts.push(`${stale} ${stale === 1 ? 'has' : 'have'} not moved in a fortnight`);
  }
  if (parts.length === 0) {
    return `${open} open, all owned and all moving. Nothing here needs a decision today.`;
  }
  return `${capitalise(parts[0])}${parts.length > 1
    ? `; ${parts.slice(1).join(', and ')}` : ''}.`;
}

function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** The cells worth colouring in a printed table: unassigned, and a stale age. */
function tonesFor(issue: BoardIssue, columns: ExportColumn[]): Record<number, Tone> {
  const out: Record<number, Tone> = {};
  columns.forEach((c, i) => {
    if (c.key === 'assignee' && issue.assignees.length === 0) out[i] = 'warn';
    if ((c.key === 'quiet' || c.key === 'age') && issue.quietDays >= 14) out[i] = 'bad';
  });
  return out;
}

function countBy(
  rows: BoardIssue[], key: (i: BoardIssue) => string,
): [string, BoardIssue[]][] {
  const map = new Map<string, BoardIssue[]>();
  for (const row of rows) {
    const k = key(row);
    map.set(k, [...(map.get(k) ?? []), row]);
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
}
