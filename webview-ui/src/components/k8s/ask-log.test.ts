/**
 * Every claim in an answer carries the lines it came from — so the lines
 * have to be numbered, the numbers have to survive a window too big to send,
 * and a citation of a line that was never sent must not be drawn.
 */
import { describe, it, expect } from 'vitest';
import {
  askWindowLines, buildEvidence, parseAnswer, citeLabel, citedLines, questionTokens, filterForLines,
  catalogueBlock, windowRange, answerText, suggestions, answerSpans,
} from './ask-log';
import type { LogLine } from '../../store/k8s-store';
import type { CatalogueRow } from './logger-catalogue';

const T0 = Date.parse('2026-09-26T14:00:00Z');
const mk = (i: number, text: string, over: Partial<LogLine> = {}): LogLine =>
  ({ seq: i, ts: T0 + i * 1000, level: 'info', text, ...over });

describe('the window', () => {
  it('ends at the newest line held, not at now', () => {
    const buffer = [mk(0, 'a'), mk(300, 'b'), mk(900, 'c')];
    const w = askWindowLines(buffer, '10m');
    expect(w.lines.map(l => l.text)).toEqual(['b', 'c']);
    expect(w.to).toBe(T0 + 900_000);
  });

  it('reads as a range', () => {
    const r = windowRange(Date.parse('2026-09-26T14:00:00'), Date.parse('2026-09-26T14:10:00'), Date.parse('2026-09-26T15:00:00'));
    expect(r).toBe('14:00 \u2013 14:10 today');
  });
});

describe('the evidence', () => {
  it('numbers events, keeps frames under their line', () => {
    const ev = buildEvidence([
      mk(1, 'Order A-4470 accepted', { logger: 'com.acme.OrderService' }),
      mk(2, 'Payment capture failed for order A-4470', { level: 'error', logger: 'CaptureClient' }),
      mk(3, 'java.net.SocketTimeoutException: Read timed out', { continuation: true, ts: undefined }),
    ], 'orderId A-4470');
    expect(ev.total).toBe(2);
    expect(ev.text).toMatch(/^\[1\] \d\d:\d\d:\d\d\.\d{3} INFO OrderService Order A-4470 accepted/);
    expect(ev.text).toContain('[2]');
    expect(ev.text).toContain('    java.net.SocketTimeoutException');
    expect([...ev.numbered.keys()]).toEqual([1, 2]);
    expect(ev.loggers).toEqual(['com.acme.OrderService', 'CaptureClient']);
  });

  it('keeps what the question names when the window is too big, with the window\u2019s numbers', () => {
    const lines = Array.from({ length: 500 }, (_, i) => mk(i, i === 400 ? 'Order A-4470 rejected' : `heartbeat ${i}`));
    lines[250] = mk(250, 'pool exhausted', { level: 'warn' });
    const ev = buildEvidence(lines, 'what happened to A-4470', { maxEvents: 40 });
    expect(ev.sent).toBeLessThanOrEqual(40);
    expect(ev.numbered.get(401)?.text).toBe('Order A-4470 rejected');
    expect(ev.numbered.has(400)).toBe(true);
    expect(ev.numbered.get(251)?.text).toBe('pool exhausted');
    expect(ev.text).toMatch(/^\(\d+ of 500 lines left out/);
  });

  it('finds the ids in a question', () => {
    expect(questionTokens('orderId A-4470 and "capture_timeout" 123456')).toEqual(
      expect.arrayContaining(['a-4470', 'capture_timeout', '123456']));
  });
});

describe('the answer', () => {
  const sent = new Map<number, unknown>([[1, {}], [2, {}], [3, {}], [5, {}]]);

  it('parses the JSON, even in a fence, and drops citations of lines never sent', () => {
    const raw = '```json\n' + JSON.stringify({
      answer: [{ text: 'Order A-4470 was rejected.', cites: [1, 2, 99] }],
      steps: [
        { lines: [1], time: '14:02:14.021', text: 'accepted', logger: 'OrderService' },
        { lines: [42], text: 'invented' },
      ],
      aggregates: [{ text: '14 captures failed', lines: [3, 5] }],
      followUps: ['Was the stock released?'],
      loggers: ['OrderService'],
    }) + '\n```';
    const a = parseAnswer(raw, sent)!;
    expect(a.answer[0].cites).toEqual([1, 2]);
    expect(a.steps.map(s => s.text)).toEqual(['accepted']);
    expect(a.aggregates[0].lines).toEqual([3, 5]);
    expect(citedLines(a)).toEqual([1, 2]);
  });

  it('answers undefined for prose', () => {
    expect(parseAnswer('I could not find it.', sent)).toBeUndefined();
  });

  it('labels citations as ranges', () => {
    expect(citeLabel([1, 2, 3, 4, 5, 6])).toBe('1\u20136');
    expect(citeLabel([7, 1, 2, 9])).toBe('1\u20132, 7, 9');
  });

  it('copies as text with the lines behind it', () => {
    const numbered = new Map<number, LogLine>([[1, mk(1, 'Order A-1 accepted')]]);
    const text = answerText({
      answer: [{ text: 'It was accepted.', cites: [1] }], steps: [{ lines: [1], text: 'accepted' }],
      aggregates: [], followUps: [], loggers: [],
    }, numbered);
    expect(text).toContain('It was accepted. [1]');
    expect(text).toContain('[1]');
    expect(text).toContain('Order A-1 accepted');
  });

  it('opens the cited lines as one filter', () => {
    expect(filterForLines([mk(1, 'Order A-1 (x)'), mk(2, 'Order A-1 (x)')])).toBe('/Order A-1 \\(x\\)/');
  });
});

describe('the catalogue block', () => {
  it('puts the quiet ones first and says why they are quiet', () => {
    const rows = [
      { key: 'a', name: 'a.Busy', sources: ['config'], primary: 'config', patterns: [], events: 9, everSeen: true },
      { key: 'b', name: 'b.Quiet', level: 'INFO', sources: ['config', 'seen'], primary: 'config', patterns: [], events: 0, everSeen: true },
      { key: 'c', name: 'c.Never', sources: ['config'], primary: 'config', patterns: [], events: 0, everSeen: false },
    ] as unknown as CatalogueRow[];
    const block = catalogueBlock(rows).split('\n');
    expect(block[0]).toContain('b.Quiet');
    expect(block[0]).toContain('quiet in this window');
    expect(block.join('\n')).toContain('declared, never seen in the buffer');
  });

  it('offers an id to follow when the marks found one', () => {
    expect(suggestions({ idField: 'orderId', idValue: 'A-4470', win: '10m' })[1]).toBe('orderId A-4470');
  });
});

describe('the answer, as the board colours it', () => {
  const kinds = (t: string) => answerSpans(t).filter(s => s.kind !== 'text').map(s => `${s.kind}:${s.text}`);

  it('finds ids, values, times and counts in plain sentences', () => {
    expect(kinds('Order A-4470 was rejected with capture_timeout after 14:02:15; 14 of 22 failed.'))
      .toEqual(['id:A-4470', 'value:capture_timeout', 'time:14:02:15', 'count:14 of 22']);
  });

  it('takes backticks off and classifies what was inside', () => {
    expect(kinds('audit row `order.rejected` written for `C-991`')).toEqual(['code:order.rejected', 'id:C-991']);
    expect(answerSpans('a `b` c').map(s => s.text).join('')).toBe('a b c');
  });

  it('leaves ordinary words alone', () => {
    expect(kinds('It is not only this order, e.g. the one next door.')).toEqual([]);
  });
});
