/**
 * Two promises from the log-rendering plan: a YAML config dump is joined back
 * into the one event that printed it, and an opened stack trace lists the
 * reader's own frames first — without ever claiming a frame is theirs unasked.
 */
import { describe, it, expect } from 'vitest';
import { foldStackTraces, ownFramesFirst, type MatchedLine } from './log-view';

let seq = 0;
const line = (text: string, over: Partial<MatchedLine> = {}): MatchedLine =>
  ({ seq: ++seq, text, level: 'info', hits: [], ...over } as unknown as MatchedLine);

describe('a YAML dump is one event', () => {
  const dump = () => [
    line('ConfigPrinter — effective configuration'),
    line('datasource:', { continuation: true }),
    line('  url: jdbc:postgresql://db:5432/orders', { continuation: true }),
    line('  maxPoolSize: 20', { continuation: true }),
    line('Started OrderApplication in 4.2 seconds'),
  ];

  it('joins the block under the line that printed it, as a YAML payload', () => {
    const rows = foldStackTraces(dump(), true, { yaml: true });
    expect(rows).toHaveLength(2);
    expect(rows[0].yaml?.shape).toBe('yaml');
    expect(rows[0].yaml?.value).toEqual({ datasource: { url: 'jdbc:postgresql://db:5432/orders', maxPoolSize: 20 } });
    expect(rows[0].folded).toHaveLength(3);
  });

  it('joins it even with trace folding off, and leaves it alone with YAML off', () => {
    expect(foldStackTraces(dump(), false, { yaml: true })[0].yaml).toBeDefined();
    expect(foldStackTraces(dump(), false, {})).toHaveLength(5);
  });

  it('never reads a stack trace as YAML', () => {
    const rows = foldStackTraces([
      line('java.lang.IllegalStateException: boom', { level: 'error' }),
      line('\tat com.acme.OrderService.place(OrderService.java:42)', { continuation: true }),
      line('\tat java.base/java.lang.Thread.run(Thread.java:840)', { continuation: true }),
    ], true, { yaml: true });
    expect(rows[0].yaml).toBeUndefined();
    expect(rows[0].folded).toHaveLength(2);
  });
});

describe('your frames first', () => {
  const frames = [
    line('\tat org.springframework.web.servlet.FrameworkServlet.service(FrameworkServlet.java:885)'),
    line('\tat com.acme.orders.OrderController.place(OrderController.java:61)'),
    line('\tat java.base/java.lang.Thread.run(Thread.java:840)'),
    line('\tat com.acme.orders.OrderService.save(OrderService.java:22)'),
  ];

  it('puts the stated packages first, keeping each part in stack order', () => {
    const out = ownFramesFirst(frames, ['com.acme.']).map(f => f.text.trim());
    expect(out.slice(0, 2)).toEqual([
      'at com.acme.orders.OrderController.place(OrderController.java:61)',
      'at com.acme.orders.OrderService.save(OrderService.java:22)',
    ]);
    expect(out[2]).toContain('org.springframework');
  });

  it('without packages, leads with whatever is not known framework', () => {
    const out = ownFramesFirst(frames).map(f => f.text.trim());
    expect(out[0]).toContain('com.acme.orders.OrderController');
    expect(out[out.length - 1]).toContain('java.base/');
  });
});
