/**
 * The PDF.
 *
 * A format nobody can open in CI is still a format with tests, as long as the
 * parts are pure functions. What is worth asserting is everything a reader
 * would otherwise discover from a file that will not open: the xref offsets
 * measured off the real buffer, the Latin-1 fold that stops an em dash breaking
 * a stream, and the escaping of the three characters that end a string literal.
 */
import { describe, it, expect } from 'vitest';
import {
  Page, buildReport, columnWidths, escapeText, fit, latin1, render, widthOf, wrap,
  type Report,
} from './pdf';

const report: Report = {
  title: 'test - This sprint',
  subtitle: '8 September 2026 · 7 open issues',
  tiles: [
    { n: '2', label: 'urgent', tone: 'bad' },
    { n: '1', label: 'overdue', tone: 'warn' },
    { n: '3', label: 'unowned', tone: 'warn' },
  ],
  sentence: 'Two urgent issues are in production — one ETA passed four days ago.',
  bars: [{ label: 'Checkout', total: 3, parts: [{ share: 0.66, tone: 'bad' },
    { share: 0.34, tone: 'muted' }] }],
  ages: [{ label: '0–3d', count: 5, tone: 'good' }, { label: '30d+', count: 1, tone: 'bad' }],
  columns: ['Number', 'Title', 'Assignee', 'Created'],
  groups: [{
    name: 'Checkout',
    rows: [{ cells: ['41', 'Login page hangs on submit', 'salilvnair', '2026-08-24'] }],
  }],
  footer: 'state:open module:checkout',
};

describe('latin1', () => {
  it('folds the punctuation this codebase writes constantly', () => {
    expect(latin1('a — b · c … “d” ’e’')).toBe('a - b - c ... "d" \'e\'');
  });

  it('replaces what Latin-1 cannot carry rather than breaking the stream', () => {
    expect(latin1('नमस्ते')).toMatch(/^\?+$/);
  });

  it('leaves an accented Latin-1 character alone', () => {
    expect(latin1('café')).toBe('café');
  });
});

describe('escapeText', () => {
  it('escapes the three characters that end a string literal', () => {
    expect(escapeText('a (b) c \\ d')).toBe('a \\(b\\) c \\\\ d');
  });

  it('flattens a newline, which would end the operator', () => {
    expect(escapeText('a\nb')).toBe('a b');
  });
});

describe('measuring', () => {
  it('makes a wide character wider than a narrow one', () => {
    expect(widthOf('W', 10)).toBeGreaterThan(widthOf('i', 10));
  });

  it('cuts at the width and says it cut', () => {
    const out = fit('Login page hangs on submit when SSO is enabled', 60, 8);
    expect(out.endsWith('...')).toBe(true);
    expect(widthOf(out, 8)).toBeLessThanOrEqual(60);
  });

  it('leaves something that already fits alone', () => {
    expect(fit('#41', 100, 8)).toBe('#41');
  });

  it('wraps on words, not mid-word', () => {
    const lines = wrap('Two urgent issues are in production today', 90, 10);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(widthOf(line, 10)).toBeLessThanOrEqual(90);
    expect(lines.join(' ')).toBe('Two urgent issues are in production today');
  });
});

describe('columnWidths', () => {
  it('gives the remainder to Title, because it is the one that varies', () => {
    const [n, title, who] = columnWidths(['Number', 'Title', 'Assignee']);
    expect(title).toBeGreaterThan(n + who);
  });

  it('shares evenly when there is no Title column', () => {
    const out = columnWidths(['A', 'B']);
    expect(out[0]).toBe(out[1]);
  });
});

describe('render', () => {
  const bytes = () => render(buildReport(report));

  it('is a PDF that ends where a reader expects', () => {
    const text = bytes().toString('latin1');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('puts every object where the xref says it is', () => {
    const buf = bytes();
    const text = buf.toString('latin1');
    const startAt = Number(/startxref\s+(\d+)/.exec(text)![1]);
    expect(text.slice(startAt, startAt + 4)).toBe('xref');

    /* Every row of the table has to land on its own "N 0 obj". A reader that
       finds one wrong says "damaged file" and names nothing, which is why this
       is measured rather than trusted. */
    const rows = [...text.slice(startAt).matchAll(/^(\d{10}) 00000 n $/gm)];
    expect(rows.length).toBeGreaterThan(4);
    rows.forEach((row, i) => {
      const offset = Number(row[1]);
      expect(text.slice(offset), `object ${i + 1}`).toMatch(new RegExp(`^${i + 1} 0 obj`));
    });
  });

  it('declares as many page objects as it wrote', () => {
    const text = bytes().toString('latin1');
    const count = Number(/\/Count (\d+)/.exec(text)![1]);
    expect([...text.matchAll(/\/Type \/Page[^s]/g)]).toHaveLength(count);
  });

  it('declares a content stream whose length is the bytes it holds', () => {
    const text = bytes().toString('latin1');
    for (const m of text.matchAll(/\/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g)) {
      expect(Buffer.byteLength(m[2], 'latin1')).toBe(Number(m[1]));
    }
  });

  it('embeds no font, because the base-14 are always there', () => {
    expect(bytes().toString('latin1')).not.toContain('FontFile');
  });

  it('still produces a file when there is nothing to report', () => {
    const empty = render(buildReport({
      ...report, bars: [], ages: [], groups: [], tiles: [],
    }));
    expect(empty.toString('latin1').startsWith('%PDF')).toBe(true);
  });
});

describe('the report', () => {
  it('is cover, charts, then table', () => {
    expect(buildReport(report)).toHaveLength(3);
  });

  it('skips the chart page when there is nothing to chart', () => {
    expect(buildReport({ ...report, bars: [], ages: [] })).toHaveLength(2);
  });

  it('puts the sentence on the cover, not only the numbers', () => {
    const [first] = buildReport(report);
    expect(first.stream).toContain('Two urgent issues');
  });

  it('puts the query and a page number on every page', () => {
    for (const page of buildReport(report)) {
      expect(page.stream).toContain('state:open module:checkout');
      expect(page.stream).toMatch(/\d+ of \d+/);
    }
  });

  it('draws nothing off the top of the page', () => {
    for (const page of buildReport(report)) {
      for (const m of page.stream.matchAll(/Td \(/g)) {
        expect(m.index).toBeGreaterThan(0);
      }
      /* Every y in a Td is measured from the bottom, so a negative one is
         text that would land below the page. */
      for (const m of page.stream.matchAll(/([-\d.]+) ([-\d.]+) Td/g)) {
        expect(Number(m[2]), page.stream.slice(0, 80)).toBeGreaterThan(-1);
      }
    }
  });
});

describe('a long report', () => {
  const many = (n: number, name: string) => ({
    name,
    rows: Array.from({ length: n }, (_, i) => ({
      cells: [String(i), 'Login page hangs on submit when SSO is enabled', 'salilvnair',
        '2026-08-24'],
    })),
  });

  it('flows onto as many pages as it takes', () => {
    const pages = buildReport({ ...report, groups: [many(90, 'Checkout')] });
    expect(pages.length).toBeGreaterThan(3);
  });

  it('never leaves a group heading alone at the foot of a page', () => {
    const pages = buildReport({
      ...report,
      groups: [many(28, 'Checkout'), many(6, 'Orders'), many(6, 'Reporting')],
    });
    for (const page of pages) {
      const lines = [...page.stream.matchAll(/([\d.]+) ([\d.]+) Td \((.*?)\) Tj/g)]
        .map(m => ({ y: Number(m[2]), text: m[3] }));
      const heading = lines.find(l => / - \d+$/.test(l.text));
      if (!heading) continue;
      /* Something below the heading, and not just the footer. */
      const under = lines.filter(l => l.y < heading.y - 20 && !/^\d+ of \d+$/.test(l.text));
      expect(under.length, `orphan heading "${heading.text}"`).toBeGreaterThan(2);
    }
  });

  it('keeps every row inside the page, however many there are', () => {
    for (const page of buildReport({ ...report, groups: [many(90, 'Checkout')] })) {
      for (const m of page.stream.matchAll(/([-\d.]+) ([-\d.]+) Td/g)) {
        expect(Number(m[2])).toBeGreaterThan(0);
        expect(Number(m[2])).toBeLessThan(595);
      }
    }
  });
});

describe('a page', () => {
  it('flips y once, at the edge, so top-left is what a caller means', () => {
    const page = new Page().text(10, 0, 'top', { size: 10 });
    /* 595 - 0 - 10 = 585: near the top of a 595-point page. */
    expect(page.stream).toContain('10.00 585.00 Td');
  });

  it('draws nothing for an empty string rather than an empty operator', () => {
    expect(new Page().text(0, 0, '').stream).toBe('');
  });
});
