/**
 * A PDF, written by hand — screen 15B.
 *
 * The audience for this file is the person who will not open a spreadsheet. It
 * has to answer the question from the front page and let them stop reading,
 * which is a layout problem rather than a data problem — and it is why the
 * cover carries a **sentence**, not only three numbers.
 *
 * There is no PDF library in this repository and adding one to draw text and
 * rectangles in Helvetica would be a large dependency for a small job. A PDF is
 * a handful of objects, an xref table and a trailer; the content streams are
 * plain text operators. Nothing here compresses anything, because a two-page
 * status report is kilobytes either way and an uncompressed stream is one that
 * a person can open in a text editor and check.
 *
 * **Everything is a pure function**, as with `xlsx.ts`, so a format nobody can
 * open in CI is still a format with tests.
 *
 * ── The two things that go wrong when you hand-write a PDF ──
 *
 * **The xref offsets.** Every object's byte offset is in a table at the end,
 * and a reader that finds one wrong reports "damaged file" and names nothing.
 * So the bytes are assembled once, in order, and the offsets are measured off
 * that same buffer rather than predicted.
 *
 * **The encoding.** The base-14 fonts are Latin-1, and an issue title with an
 * em dash in it — which is most of them, in this repository — draws as a
 * different character or breaks the stream. Text is transliterated to
 * something Latin-1 can carry before it is escaped.
 */

/** Landscape A4, in points, which is what "landscape report" means. */
export const PAGE = { width: 842, height: 595 };

export type Tone = 'plain' | 'good' | 'warn' | 'bad' | 'muted';

const INK: Record<Tone, [number, number, number]> = {
  plain: [0.09, 0.09, 0.1],
  good: [0.25, 0.73, 0.31],
  warn: [0.82, 0.6, 0.13],
  bad: [0.97, 0.32, 0.29],
  muted: [0.33, 0.33, 0.37],
};

export interface Tile { n: string; label: string; tone: Tone }

export interface BarRow { label: string; total: number; parts: { share: number; tone: Tone }[] }

export interface ReportGroup {
  name: string;
  rows: { cells: string[]; tones?: Record<number, Tone> }[];
}

export interface Report {
  title: string;
  subtitle: string;
  /** The three numbers on the cover. */
  tiles: Tile[];
  /** One line saying what they mean. The point of the cover. */
  sentence: string;
  /** "Where they are", as bars. Empty means the page is skipped. */
  bars: BarRow[];
  /** "How long they sit", as a histogram. */
  ages: { label: string; count: number; tone: Tone }[];
  columns: string[];
  groups: ReportGroup[];
  /** The query, on every footer — what this report is of. */
  footer: string;
}

/* ── Text ─────────────────────────────────────────────────────────────────── */

/**
 * What Latin-1 can carry.
 *
 * The characters this replaces are the ones this codebase writes constantly —
 * an em dash, curly quotes, an ellipsis, a middot — and every one of them
 * would draw as the wrong glyph in a base-14 font.
 */
const FOLD: [RegExp, string][] = [
  [/[\u2018\u2019\u201B]/g, "'"],
  [/[\u201C\u201D]/g, '"'],
  [/[\u2013\u2014]/g, '-'],
  [/\u2026/g, '...'],
  [/\u00b7/g, '-'],
  [/[\u2192\u2794]/g, '->'],
  [/\u2705|\u2714/g, 'ok'],
];

export function latin1(text: string): string {
  let out = text;
  for (const [re, to] of FOLD) out = out.replace(re, to);
  /* Anything still outside Latin-1 becomes a question mark rather than a
     broken stream. A name in Devanagari deserves better than that, and it is
     the reason the xlsx path exists. */
  // eslint-disable-next-line no-control-regex
  return out.replace(/[^\u0000-\u00ff]/g, '?');
}

/** `(` `)` and `\` end or escape a string literal in a content stream. */
export function escapeText(text: string): string {
  return latin1(text).replace(/([\\()])/g, '\\$1').replace(/[\r\n]+/g, ' ');
}

/**
 * Helvetica advance widths, in 1/1000 em, for the range a report actually uses.
 *
 * Enough to truncate a title at a column edge without measuring it wrong by
 * enough to overlap the next one. Anything outside the table takes the average
 * of the ones inside it.
 */
const W: Record<string, number> = {
  ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556,
  '8': 556, '9': 556, ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556,
  '@': 1015, A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722,
  I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722,
  S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  '[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
  k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
  u: 556, v: 500, w: 722, x: 500, y: 500, z: 500, '{': 334, '|': 260, '}': 334,
};

export function widthOf(text: string, size: number, bold = false): number {
  let total = 0;
  for (const ch of latin1(text)) total += W[ch] ?? 556;
  /* Helvetica-Bold is a little wider; one factor is close enough to stop a
     heading running into the number beside it. */
  return (total / 1000) * size * (bold ? 1.05 : 1);
}

/** As much of `text` as fits, with an ellipsis where it was cut. */
export function fit(text: string, width: number, size: number, bold = false): string {
  if (widthOf(text, size, bold) <= width) return text;
  let out = latin1(text);
  while (out.length > 1 && widthOf(`${out}...`, size, bold) > width) out = out.slice(0, -1);
  return `${out.trimEnd()}...`;
}

/** Wrap into lines that fit, for the one paragraph on the cover. */
export function wrap(text: string, width: number, size: number): string[] {
  const words = latin1(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (widthOf(next, size) > width && line) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/* ── Drawing ──────────────────────────────────────────────────────────────── */

/**
 * One page's content stream.
 *
 * PDF's origin is the bottom-left and everybody thinks in top-left, so `y` here
 * is measured from the top and flipped once, at the edge. Doing it anywhere
 * else is how a report comes out upside down in one place and not another.
 */
export class Page {
  private ops: string[] = [];

  text(x: number, top: number, text: string, opts: {
    size?: number; bold?: boolean; tone?: Tone; align?: 'left' | 'right' | 'centre';
    width?: number;
  } = {}): this {
    const size = opts.size ?? 9;
    const said = escapeText(text);
    if (!said) return this;
    let at = x;
    if (opts.align === 'right' && opts.width) {
      at = x + opts.width - widthOf(text, size, opts.bold);
    } else if (opts.align === 'centre' && opts.width) {
      at = x + (opts.width - widthOf(text, size, opts.bold)) / 2;
    }
    const [r, g, b] = INK[opts.tone ?? 'plain'];
    this.ops.push(
      `q ${r} ${g} ${b} rg BT /${opts.bold ? 'F2' : 'F1'} ${size} Tf `
      + `${at.toFixed(2)} ${(PAGE.height - top - size).toFixed(2)} Td (${said}) Tj ET Q`,
    );
    return this;
  }

  rect(x: number, top: number, w: number, h: number, tone: Tone, fill = true): this {
    const [r, g, b] = INK[tone];
    const y = PAGE.height - top - h;
    this.ops.push(fill
      ? `q ${r} ${g} ${b} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f Q`
      : `q ${r} ${g} ${b} RG 0.6 w ${x.toFixed(2)} ${y.toFixed(2)} `
        + `${w.toFixed(2)} ${h.toFixed(2)} re S Q`);
    return this;
  }

  /** A hairline, for a table rule. */
  line(x: number, top: number, w: number, tone: Tone = 'muted'): this {
    const [r, g, b] = INK[tone];
    const y = PAGE.height - top;
    this.ops.push(
      `q ${r} ${g} ${b} RG 0.4 w ${x.toFixed(2)} ${y.toFixed(2)} m `
      + `${(x + w).toFixed(2)} ${y.toFixed(2)} l S Q`,
    );
    return this;
  }

  /** Softer than `muted`, for a rule that should not compete with the text. */
  faint(x: number, top: number, w: number): this {
    this.ops.push(
      `q 0.85 0.85 0.86 RG 0.4 w ${x.toFixed(2)} ${(PAGE.height - top).toFixed(2)} m `
      + `${(x + w).toFixed(2)} ${(PAGE.height - top).toFixed(2)} l S Q`,
    );
    return this;
  }

  get stream(): string {
    return this.ops.join('\n');
  }
}

/* ── The document ─────────────────────────────────────────────────────────── */

/**
 * The bytes.
 *
 * Objects in a fixed order, offsets measured off the buffer as it is built, and
 * the xref written from those measurements. Predicting the offsets instead is
 * the classic way to produce a file that opens in one reader and not another.
 */
export function render(pages: Page[]): Buffer {
  const list = pages.length ? pages : [new Page()];
  const chunks: string[] = [];
  const offsets: number[] = [];
  let at = 0;

  const push = (text: string) => {
    chunks.push(text);
    at += Buffer.byteLength(text, 'latin1');
  };
  const object = (n: number, body: string) => {
    offsets[n] = at;
    push(`${n} 0 obj\n${body}\nendobj\n`);
  };

  push('%PDF-1.4\n');

  /* 1 catalog, 2 pages, 3 font, 4 bold font, then a page and a stream each. */
  const pageIds = list.map((_, i) => 5 + i * 2);
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Count ${list.length} /Kids [`
    + `${pageIds.map(id => `${id} 0 R`).join(' ')}] >>`);
  object(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica '
    + '/Encoding /WinAnsiEncoding >>');
  object(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold '
    + '/Encoding /WinAnsiEncoding >>');

  list.forEach((page, i) => {
    const id = pageIds[i];
    object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] `
      + `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${id + 1} 0 R >>`);
    const stream = page.stream;
    object(id + 1, `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\n`
      + `stream\n${stream}\nendstream`);
  });

  const count = 5 + list.length * 2;
  const xrefAt = at;
  const rows = [`${count}\n0000000000 65535 f \n`];
  for (let n = 1; n < count; n += 1) {
    rows.push(`${String(offsets[n] ?? 0).padStart(10, '0')} 00000 n \n`);
  }
  push(`xref\n0 ${rows.join('')}`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  return Buffer.from(chunks.join(''), 'latin1');
}

/* ── The report ───────────────────────────────────────────────────────────── */

const MARGIN = 40;
const INNER = PAGE.width - MARGIN * 2;

/**
 * The cover, the charts and the table — in that order, because that is the
 * order somebody stops reading in.
 */
export function buildReport(report: Report): Page[] {
  const pages: Page[] = [cover(report)];
  if (report.bars.length || report.ages.some(a => a.count > 0)) pages.push(charts(report));
  pages.push(...tables(report));
  pages.forEach((p, i) => footer(p, report.footer, i + 1, pages.length));
  return pages;
}

function footer(page: Page, text: string, n: number, of: number): void {
  page.faint(MARGIN, PAGE.height - 34, INNER);
  page.text(MARGIN, PAGE.height - 28, fit(text, INNER - 90, 7), { size: 7, tone: 'muted' });
  page.text(MARGIN, PAGE.height - 28, `${n} of ${of}`, {
    size: 7, tone: 'muted', align: 'right', width: INNER,
  });
}

function cover(report: Report): Page {
  const page = new Page();
  page.text(MARGIN, 46, report.title, { size: 26, bold: true });
  page.text(MARGIN, 82, report.subtitle, { size: 10, tone: 'muted' });

  const width = (INNER - 24) / 3;
  report.tiles.slice(0, 3).forEach((tile, i) => {
    const x = MARGIN + i * (width + 12);
    page.rect(x, 112, width, 74, 'muted', false);
    page.text(x + 14, 126, tile.n, { size: 30, bold: true, tone: tile.tone });
    page.text(x + 14, 164, tile.label.toUpperCase(), { size: 8, tone: 'muted' });
  });

  /*
    The sentence. Three tiles say what; one line says what it means, and it is
    the only part of this document somebody who will not open a spreadsheet is
    guaranteed to read.
  */
  wrap(report.sentence, INNER - 40, 13).slice(0, 4).forEach((line, i) => {
    page.text(MARGIN, 218 + i * 20, line, { size: 13 });
  });

  return page;
}

function charts(report: Report): Page {
  const page = new Page();
  page.text(MARGIN, 44, 'Where they are', { size: 14, bold: true });

  const top = Math.max(1, ...report.bars.map(b => b.total));
  const labelW = 110;
  const trackW = INNER * 0.55;
  report.bars.slice(0, 10).forEach((row, i) => {
    const y = 74 + i * 20;
    page.text(MARGIN, y, fit(row.label, labelW - 8, 9), { size: 9, tone: 'muted' });
    const w = (row.total / top) * trackW;
    let x = MARGIN + labelW;
    page.rect(MARGIN + labelW, y + 1, trackW, 9, 'muted', false);
    for (const part of row.parts) {
      const seg = w * part.share;
      if (seg > 0.5) page.rect(x, y + 1, seg, 9, part.tone);
      x += seg;
    }
    page.text(MARGIN + labelW + trackW + 8, y, String(row.total), { size: 9 });
  });

  const chartTop = 74 + Math.min(10, report.bars.length) * 20 + 26;
  page.text(MARGIN, chartTop, 'How long they sit', { size: 14, bold: true });

  const tallest = Math.max(1, ...report.ages.map(a => a.count));
  const barW = Math.min(70, (INNER * 0.6) / Math.max(1, report.ages.length)) - 8;
  report.ages.forEach((bucket, i) => {
    const x = MARGIN + i * (barW + 8);
    const h = (bucket.count / tallest) * 90;
    const base = chartTop + 34 + 90;
    if (bucket.count > 0) page.rect(x, base - h, barW, h, bucket.tone);
    page.text(x, base - h - 12, String(bucket.count), {
      size: 9, bold: true, align: 'centre', width: barW,
    });
    page.text(x, base + 6, bucket.label, {
      size: 7, tone: 'muted', align: 'centre', width: barW,
    });
  });

  return page;
}

/**
 * The table, one section per group, flowing onto as many pages as it takes.
 *
 * A group is never split across a page break unless it is longer than a page:
 * a heading with no rows under it is the one thing that makes a printed report
 * hard to read, and the cost of avoiding it is some white space.
 */
function tables(report: Report): Page[] {
  const pages: Page[] = [];
  const widths = columnWidths(report.columns);
  const rowH = 15;
  const bottom = PAGE.height - 52;

  let page = new Page();
  let y = 44;
  let started = false;

  const header = () => {
    page.text(MARGIN, y, 'Issues', { size: 14, bold: true });
    y += 26;
  };
  header();

  for (const group of report.groups) {
    const needs = 22 + Math.min(group.rows.length, 4) * rowH;
    if (started && y + needs > bottom) {
      pages.push(page);
      page = new Page();
      y = 44;
      header();
    }
    started = true;

    page.text(MARGIN, y, `${group.name} - ${group.rows.length}`, { size: 11, bold: true });
    y += 18;

    let x = MARGIN;
    report.columns.forEach((c, i) => {
      page.text(x, y, c.toUpperCase(), { size: 7, tone: 'muted' });
      x += widths[i];
    });
    y += 11;
    page.faint(MARGIN, y, INNER);
    y += 6;

    for (const row of group.rows) {
      if (y + rowH > bottom) {
        pages.push(page);
        page = new Page();
        y = 44;
        header();
      }
      let at = MARGIN;
      row.cells.forEach((cell, i) => {
        page.text(at, y, fit(cell, widths[i] - 8, 8), {
          size: 8,
          tone: row.tones?.[i] ?? 'plain',
        });
        at += widths[i];
      });
      y += rowH - 4;
      page.faint(MARGIN, y, INNER);
      y += 4;
    }
    y += 14;
  }

  pages.push(page);
  return pages;
}

/**
 * Column widths: the title takes what is left.
 *
 * A number, a name and a date each need about the same little space whatever
 * the report is, and the title is the only column whose content varies enough
 * to be worth the remainder.
 */
export function columnWidths(columns: string[]): number[] {
  const fixed = columns.map(c => (/^title$/i.test(c) ? 0 : narrow(c)));
  const used = fixed.reduce((a, b) => a + b, 0);
  const titleAt = columns.findIndex(c => /^title$/i.test(c));
  if (titleAt < 0) {
    /* No title column: share it out evenly rather than leaving a gap. */
    return columns.map(() => INNER / Math.max(1, columns.length));
  }
  fixed[titleAt] = Math.max(120, INNER - used);
  return fixed;
}

function narrow(column: string): number {
  if (/^(number|#|age|quiet|comments)$/i.test(column)) return 48;
  if (/date|created|updated|eta|target|start/i.test(column)) return 70;
  return 90;
}
