/**
 * What the export writes.
 *
 * The rules worth a test are the ones a reader would only discover from a
 * broken file: the BOM Excel needs, the formula prefix that stops a title
 * beginning with `-` from executing, the pipe that would end a Markdown cell
 * early, ISO dates, and a sheet name Excel will actually open.
 */
import { describe, it, expect } from 'vitest';
import {
  cells, exportColumns, filename, isoDay, sheetName, sheets, toCsv, toMarkdown,
} from './export-model';
import type { BoardIssue } from './board-types';

function issue(over: Partial<BoardIssue> = {}): BoardIssue {
  return {
    number: 41,
    title: 'Login page hangs on submit',
    state: 'OPEN',
    url: 'https://github.com/acme/app/issues/41',
    author: 'salilvnair',
    assignees: ['rmenon'],
    labels: [{ name: 'bug', color: 'f85149' }],
    milestone: undefined,
    createdAt: '2026-08-24T09:12:00Z',
    updatedAt: '2026-09-06T11:00:00Z',
    commentCount: 3,
    dimensions: { module: 'Checkout', priority: 'Urgent' },
    evidence: [],
    ageDays: 15,
    quietDays: 2,
    ...over,
  };
}

const cols = () => {
  const all = exportColumns([
    { dimension: 'module', options: ['Checkout', 'Search'], from: [] },
    { dimension: 'priority', options: ['Urgent', 'Medium'], from: [] },
  ] as never);
  return ['number', 'title', 'created', 'module'].map(k => all.find(c => c.key === k)!);
};

describe('the columns', () => {
  it('are the table’s own, so “same columns” is true by construction', () => {
    const keys = exportColumns([]).map(c => c.key);
    expect(keys.slice(0, 3)).toEqual(['number', 'title', 'state']);
  });

  it('calls the # column Number — a header of "#" is unreadable in a file', () => {
    expect(exportColumns([]).find(c => c.key === 'number')!.label).toBe('Number');
  });

  it('types the numbers and the dates rather than writing everything as text', () => {
    const by = new Map(exportColumns([]).map(c => [c.key, c.type]));
    expect(by.get('number')).toBe('number');
    expect(by.get('age')).toBe('number');
    expect(by.get('created')).toBe('date');
    expect(by.get('title')).toBe('text');
  });

  it('says out loud that the body column is the shortened copy', () => {
    expect(exportColumns([]).find(c => c.key === 'body')!.note).toMatch(/shortened/i);
  });
});

describe('cells', () => {
  it('writes a date as ISO, not as the friendly form on screen', () => {
    expect(cells(issue(), cols())[2]).toBe('2026-08-24');
  });

  it('writes a number as a number', () => {
    expect(cells(issue(), cols())[0]).toBe(41);
  });

  it('leaves an unparseable date alone rather than inventing one', () => {
    expect(isoDay('')).toBe('');
    expect(isoDay('soon')).toBe('soon');
  });
});

describe('CSV', () => {
  it('starts with the BOM, or Excel mangles every non-ASCII name', () => {
    expect(toCsv([issue()], cols()).charCodeAt(0)).toBe(0xfeff);
  });

  it('quotes a cell holding a comma, and doubles an inner quote', () => {
    const out = toCsv([issue({ title: 'a, b "c"' })], cols());
    expect(out).toContain('"a, b ""c"""');
  });

  it('defuses a title that Excel would run as a formula', () => {
    const out = toCsv([issue({ title: '=1+1' })], cols());
    expect(out).toContain("'=1+1");
  });

  it('ends rows with CRLF, which is what a .csv reader expects', () => {
    expect(toCsv([issue()], cols())).toContain('\r\n');
  });
});

describe('Markdown', () => {
  it('escapes a pipe, which would otherwise end the cell early', () => {
    expect(toMarkdown([issue({ title: 'a | b' })], cols())).toContain('a \\| b');
  });

  it('flattens a newline rather than breaking the row in two', () => {
    expect(toMarkdown([issue({ title: 'a\nb' })], cols())).toContain('a b');
  });

  it('right-aligns the numeric columns', () => {
    expect(toMarkdown([issue()], cols())).toContain('| ---: |');
  });
});

describe('the file name', () => {
  it('carries the repository, the view and the day', () => {
    expect(filename('acme/app', 'This sprint', 'csv', new Date('2026-09-08T00:00:00Z')))
      .toBe('app — This sprint — 2026-09-08.csv');
  });

  it('strips what a filesystem will not take', () => {
    expect(filename('acme/app', 'bugs: prod/live', 'csv', new Date('2026-09-08T00:00:00Z')))
      .toBe('app — bugs- prod-live — 2026-09-08.csv');
  });
});

describe('sheets', () => {
  it('is one sheet when nothing is grouped', () => {
    expect(sheets([issue()], undefined, []).map(s => s.name)).toEqual(['Issues']);
  });

  it('follows the dimension’s own order, not the order rows happened to arrive', () => {
    const rows = [issue({ dimensions: { module: 'Search' } }),
      issue({ number: 2, dimensions: { module: 'Checkout' } })];
    const out = sheets(rows, 'module',
      [{ dimension: 'module', options: ['Checkout', 'Search'], from: [] }] as never);
    expect(out.map(s => s.name)).toEqual(['Checkout', 'Search']);
  });

  it('gives the rows with no value a sheet that says so', () => {
    const out = sheets([issue({ dimensions: {} })], 'module', []);
    expect(out[0].name).toBe('No module');
  });

  it('makes a sheet name Excel will open', () => {
    expect(sheetName('api/v2')).toBe('api-v2');
    expect(sheetName('x'.repeat(40))).toHaveLength(31);
  });
});
