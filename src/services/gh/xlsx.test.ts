/**
 * The workbook parts.
 *
 * A spreadsheet format is testable without opening Excel as long as the parts
 * are pure functions, which is why they are. What is worth asserting is
 * everything a reader would otherwise discover from a file that will not open,
 * or one that opens with a column of text where the dates should be.
 */
import { describe, it, expect } from 'vitest';
import { colName, dateSerial, sheetXml, workbookParts, xmlText, type Sheet } from './xlsx';

const sheet = (over: Partial<Sheet> = {}): Sheet => ({
  name: 'Issues',
  columns: [
    { label: 'Number', type: 'number', width: 8 },
    { label: 'Title', type: 'text', width: 40 },
    { label: 'Created', type: 'date', width: 12 },
  ],
  rows: [{ cells: [41, 'Login hangs', '2026-08-24'] }],
  ...over,
});

describe('dateSerial', () => {
  it('counts from Excel’s own epoch, not from 1970', () => {
    /* 1900-01-01 is serial 2 in Excel, thanks to the 1900 leap-year bug it
       preserves for compatibility with Lotus. */
    expect(dateSerial('1900-01-01')).toBe(2);
    expect(dateSerial('2026-09-11')).toBe(46276);
  });

  it('gives up rather than returning day zero for a non-date', () => {
    expect(dateSerial('')).toBeUndefined();
    expect(dateSerial('soon')).toBeUndefined();
  });
});

describe('colName', () => {
  it('is base-26 without a zero', () => {
    expect(colName(0)).toBe('A');
    expect(colName(25)).toBe('Z');
    expect(colName(26)).toBe('AA');
    expect(colName(27)).toBe('AB');
  });
});

describe('xmlText', () => {
  it('escapes what XML needs escaped', () => {
    expect(xmlText('a & b < c > d "e"')).toBe('a &amp; b &lt; c &gt; d &quot;e&quot;');
  });

  it('drops a control character rather than producing a workbook that will not open', () => {
    expect(xmlText('ab')).toBe('ab');
  });

  it('keeps a tab and a newline, which XML 1.0 does allow', () => {
    expect(xmlText('a\tb\nc')).toBe('a\tb\nc');
  });
});

describe('a worksheet', () => {
  it('freezes the header row', () => {
    expect(sheetXml(sheet())).toContain('state="frozen"');
  });

  it('turns the filter on across the used range', () => {
    expect(sheetXml(sheet())).toContain('<autoFilter ref="A1:C2"/>');
  });

  it('writes a date as a serial with the date style, not as text', () => {
    const xml = sheetXml(sheet());
    expect(xml).toContain('<c r="C2" s="2"><v>46258</v></c>');
    expect(xml).not.toContain('2026-08-24');
  });

  it('writes a number as a number', () => {
    expect(sheetXml(sheet())).toContain('<c r="A2" s="0"><v>41</v></c>');
  });

  it('writes text inline, with the space preserved', () => {
    expect(sheetXml(sheet())).toContain('<t xml:space="preserve">Login hangs</t>');
  });

  it('falls back to text when a date column holds something that is not one', () => {
    const xml = sheetXml(sheet({ rows: [{ cells: [1, 'x', 'never'] }] }));
    expect(xml).toContain('never');
  });

  it('gives an emphasised cell a fill, so it survives being printed', () => {
    const xml = sheetXml(sheet({
      rows: [{ cells: [41, 'Login hangs', '2026-08-24'], emphasis: { 1: 'bad', 2: 'bad' } }],
    }));
    expect(xml).toContain('s="3"');
    expect(xml).toContain('s="5"');
  });
});

describe('the workbook', () => {
  it('has the five fixed parts plus one per sheet', () => {
    const names = workbookParts([sheet(), sheet({ name: 'Search' })]).map(p => p.name);
    expect(names).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet2.xml',
    ]);
  });

  it('declares every sheet in the content types, or Excel refuses the file', () => {
    const types = workbookParts([sheet(), sheet({ name: 'Search' })])[0].content;
    expect(types).toContain('/xl/worksheets/sheet1.xml');
    expect(types).toContain('/xl/worksheets/sheet2.xml');
  });

  it('points each sheet relationship at its own part', () => {
    const rels = workbookParts([sheet(), sheet({ name: 'Search' })])[3].content;
    expect(rels).toContain('Id="rId1"');
    expect(rels).toContain('worksheets/sheet2.xml');
    /* Styles take the id after the last sheet — an id collision is a workbook
       that opens with no formatting and no explanation. */
    expect(rels).toContain('Id="rId3"');
  });

  it('escapes a sheet name in the workbook part', () => {
    const wb = workbookParts([sheet({ name: 'A & B' })])[2].content;
    expect(wb).toContain('name="A &amp; B"');
  });

  it('still produces a workbook when there is nothing to write', () => {
    expect(workbookParts([])).toHaveLength(6);
  });
});

describe('the frozen header, as a choice', () => {
  const sheet = {
    name: 'Issues',
    columns: [{ label: 'Number', type: 'number' as const }],
    rows: [{ cells: [1] }],
  };

  it('freezes and filters by default — that is how a report is read', () => {
    const xml = sheetXml(sheet);
    expect(xml).toContain('state="frozen"');
    expect(xml).toContain('<autoFilter');
  });

  it('does neither when the sheet says not to', () => {
    const xml = sheetXml({ ...sheet, frozen: false });
    expect(xml).not.toContain('state="frozen"');
    expect(xml).not.toContain('<autoFilter');
  });

  it('still writes a well-formed sheetView with nothing in it', () => {
    expect(sheetXml({ ...sheet, frozen: false }))
      .toContain('<sheetViews><sheetView workbookViewId="0"></sheetView></sheetViews>');
  });
});
