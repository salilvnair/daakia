/**
 * A real `.xlsx`, written by hand — screen 15 and 15A.
 *
 * There is no spreadsheet library in this repository and adding one to write
 * four kinds of cell would be a large dependency for a small job. An xlsx is a
 * zip of XML parts; the parts are small, and writing them here means the file
 * is exactly what the screen promised rather than whatever a library's defaults
 * produce.
 *
 * **Everything in this file is a pure function.** It returns the parts and
 * their contents; the handler zips them. That is what makes a spreadsheet
 * format testable without opening Excel.
 *
 * ── The three things that make it a spreadsheet rather than a grid ──
 *
 * A **date is a number with a format**, not the text `2026-09-11`. Excel counts
 * days from 1899-12-30, and a text column of dates is one nobody can sort or
 * filter by month — which is the whole reason somebody asked for xlsx instead
 * of csv.
 *
 * The **header is frozen and the filter is on**. A report is read by scrolling,
 * and a header that scrolls away is a column of values with no names.
 *
 * A **fill survives printing**. The red on a passed ETA and the amber on an
 * unassigned row are cell fills rather than font colours, because the one place
 * these are actually read is a printout or a PDF of one.
 */

export type CellType = 'text' | 'number' | 'date';

export interface SheetColumn {
  label: string;
  type: CellType;
  /** Character width, roughly. Excel's unit is the width of a '0'. */
  width?: number;
}

/** A cell's own emphasis, where the row's meaning is not in its value. */
export type Emphasis = 'none' | 'bad' | 'warn';

export interface SheetRow {
  cells: (string | number)[];
  /** Per-cell fills, by column index. Sparse on purpose. */
  emphasis?: Record<number, Emphasis>;
}

export interface Sheet {
  name: string;
  columns: SheetColumn[];
  rows: SheetRow[];
}

export interface Part { name: string; content: string }

/* Style indices, in the order `styles()` writes them. */
const S_DEFAULT = 0;
const S_HEADER = 1;
const S_DATE = 2;
const S_BAD = 3;
const S_WARN = 4;
const S_DATE_BAD = 5;

/** Excel's epoch is 1899-12-30 — the 1900 leap-year bug, preserved forever. */
const EPOCH = Date.UTC(1899, 11, 30);

/**
 * `2026-09-11` → 46276. Returns undefined for anything that is not a date, so
 * the caller can fall back to writing it as text rather than as day zero.
 */
export function dateSerial(value: string): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return undefined;
  const at = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(at)) return undefined;
  return Math.round((at - EPOCH) / 86_400_000);
}

/** `0` → `A`, `26` → `AA`. Excel's column letters are base-26 without a zero. */
export function colName(at: number): string {
  let n = at + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/**
 * XML text, escaped — and stripped of what XML 1.0 cannot carry at all.
 *
 * A control character in an issue title makes the whole workbook unopenable,
 * and Excel's error for it names no cell. Dropping it is the only behaviour
 * that produces a file.
 */
export function xmlText(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cellXml(ref: string, value: string | number, type: CellType, emphasis: Emphasis): string {
  if (type === 'number' || typeof value === 'number') {
    const n = typeof value === 'number' ? value : Number(value);
    const style = emphasis === 'bad' ? S_BAD : emphasis === 'warn' ? S_WARN : S_DEFAULT;
    return Number.isFinite(n)
      ? `<c r="${ref}" s="${style}"><v>${n}</v></c>`
      : inline(ref, String(value), style);
  }

  if (type === 'date') {
    const serial = dateSerial(String(value));
    if (serial !== undefined) {
      const style = emphasis === 'bad' ? S_DATE_BAD : S_DATE;
      return `<c r="${ref}" s="${style}"><v>${serial}</v></c>`;
    }
    /* Not a date after all — an empty cell, or something GitHub sent that is
       not a timestamp. Written as text rather than as 1899. */
  }

  const style = emphasis === 'bad' ? S_BAD : emphasis === 'warn' ? S_WARN : S_DEFAULT;
  return inline(ref, String(value ?? ''), style);
}

function inline(ref: string, value: string, style: number): string {
  if (!value) return `<c r="${ref}" s="${style}"/>`;
  /* `xml:space="preserve"` or Excel eats a leading space, which is how an
     indented value silently loses its indent. */
  return `<c r="${ref}" s="${style}" t="inlineStr">`
    + `<is><t xml:space="preserve">${xmlText(value)}</t></is></c>`;
}

/** One worksheet: frozen header, autofilter, column widths, then the rows. */
export function sheetXml(sheet: Sheet): string {
  const last = colName(Math.max(0, sheet.columns.length - 1));
  const cols = sheet.columns
    .map((c, at) => `<col min="${at + 1}" max="${at + 1}" width="${c.width ?? 16}" customWidth="1"/>`)
    .join('');

  const header = `<row r="1">${sheet.columns
    .map((c, at) => inline(`${colName(at)}1`, c.label, S_HEADER))
    .join('')}</row>`;

  const body = sheet.rows.map((row, at) => {
    const r = at + 2;
    const cells = row.cells
      .map((v, col) => cellXml(
        `${colName(col)}${r}`,
        v,
        sheet.columns[col]?.type ?? 'text',
        row.emphasis?.[col] ?? 'none',
      ))
      .join('');
    return `<row r="${r}">${cells}</row>`;
  }).join('');

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<sheetViews><sheetView workbookViewId="0">'
    + '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
    + '</sheetView></sheetViews>'
    + `<cols>${cols}</cols>`
    + `<sheetData>${header}${body}</sheetData>`
    + `<autoFilter ref="A1:${last}${sheet.rows.length + 1}"/>`
    + '</worksheet>';
}

/** The six styles the export uses, and nothing else. */
function styles(): string {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts>'
    + '<fonts count="2">'
    + '<font><sz val="11"/><name val="Calibri"/></font>'
    + '<font><b/><sz val="11"/><name val="Calibri"/></font>'
    + '</fonts>'
    + '<fills count="5">'
    + '<fill><patternFill patternType="none"/></fill>'
    + '<fill><patternFill patternType="gray125"/></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFEFEFEF"/>'
    + '<bgColor indexed="64"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFFFD5D0"/>'
    + '<bgColor indexed="64"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF0C8"/>'
    + '<bgColor indexed="64"/></patternFill></fill>'
    + '</fills>'
    + '<borders count="1"><border/></borders>'
    + '<cellStyleXfs count="1"><xf/></cellStyleXfs>'
    + '<cellXfs count="6">'
    + '<xf xfId="0"/>'
    + '<xf xfId="0" fontId="1" fillId="2" applyFont="1" applyFill="1"/>'
    + '<xf xfId="0" numFmtId="164" applyNumberFormat="1"/>'
    + '<xf xfId="0" fillId="3" applyFill="1"/>'
    + '<xf xfId="0" fillId="4" applyFill="1"/>'
    + '<xf xfId="0" numFmtId="164" fillId="3" applyNumberFormat="1" applyFill="1"/>'
    + '</cellXfs>'
    /* Readers other than Excel warn without a named default style and then
       apply their own, which loses the date format. One element buys it. */
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    + '</styleSheet>';
}

/**
 * Every part of the workbook, ready to be zipped in this order.
 *
 * The order matters only in that `[Content_Types].xml` is conventionally
 * first; every reader tolerates the rest in any order.
 */
export function workbookParts(sheets: Sheet[]): Part[] {
  const list = sheets.length ? sheets : [{ name: 'Issues', columns: [], rows: [] }];

  const types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.'
    + 'relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-'
    + 'officedocument.spreadsheetml.sheet.main+xml"/>'
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-'
    + 'officedocument.spreadsheetml.styles+xml"/>'
    + list.map((_, at) => `<Override PartName="/xl/worksheets/sheet${at + 1}.xml" `
      + 'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>')
      .join('')
    + '</Types>';

  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/'
    + 'relationships/officeDocument" Target="xl/workbook.xml"/>'
    + '</Relationships>';

  const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
    + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + `<sheets>${list.map((s, at) =>
      `<sheet name="${xmlText(s.name)}" sheetId="${at + 1}" r:id="rId${at + 1}"/>`).join('')}`
    + '</sheets></workbook>';

  const workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + list.map((_, at) => `<Relationship Id="rId${at + 1}" Type="http://schemas.`
      + 'openxmlformats.org/officeDocument/2006/relationships/worksheet" '
      + `Target="worksheets/sheet${at + 1}.xml"/>`).join('')
    + `<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/`
    + 'officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + '</Relationships>';

  return [
    { name: '[Content_Types].xml', content: types },
    { name: '_rels/.rels', content: rels },
    { name: 'xl/workbook.xml', content: workbook },
    { name: 'xl/_rels/workbook.xml.rels', content: workbookRels },
    { name: 'xl/styles.xml', content: styles() },
    ...list.map((s, at) => ({
      name: `xl/worksheets/sheet${at + 1}.xml`,
      content: sheetXml(s),
    })),
  ];
}
