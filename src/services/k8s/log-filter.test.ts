/**
 * The host's whole-file filter must mean exactly what the log view's filter
 * means — the view re-applies its own to the lines this returns, and any
 * difference is a line that appears in one place and not the other. So the
 * view's own `filterLines` is the oracle: both run over the same lines, with
 * the same spec, and must keep the same lines.
 */
import { describe, it, expect } from 'vitest';
import { LineSelector, isEmptySpec, type HostFilterSpec } from './log-filter';
import { filterLines } from '../../../webview-ui/src/components/k8s/log-view';
import type { LogLine } from './k8s-log-stream';

const L = (seq: number, over: Partial<LogLine>): LogLine => ({ seq, level: 'info', text: `line ${seq}`, ...over } as LogLine);

const corpus: LogLine[] = [
  L(0, { text: 'Spring banner', continuation: false }),
  L(1, { text: '2026 INFO [exec-1] calling contract for requestDataId=9363', thread: 'exec-1', logger: 'c.z.DownstreamClient' }),
  L(2, { text: '2026 INFO [exec-2] calling moig for requestDataId=8001', thread: 'exec-2', logger: 'c.z.DownstreamClient' }),
  L(3, { text: '2026 ERROR [exec-1] read timed out for requestDataId=9363', level: 'error', thread: 'exec-1', logger: 'c.z.DownstreamClient' }),
  L(4, { text: '\tat java.net.Socket.read(Socket.java:1)', continuation: true, level: 'error' }),
  L(5, { text: '   ', thread: 'exec-1' }),
  L(6, { text: '2026 WARN [scheduling-1] pool waiting=2', level: 'warn', thread: 'scheduling-1', fields: { tenant: 'acme' } }),
  L(7, { text: '2026 INFO [scheduling-10] picked up 4 requests', thread: 'scheduling-10', fields: { tenant: 'blue' } }),
  L(8, { text: '2026 INFO [exec-1] request 9363 moved to status 900', thread: 'exec-1' }),
  L(9, { text: '2026 DEBUG [exec-2] pool stats', level: 'debug', thread: 'exec-2' }),
  L(10, { text: '2026 INFO [exec-3] payload {"token":"x"}', thread: 'exec-3', fields: { tenant: 'acme' } }),
];

function host(spec: HostFilterSpec): number[] {
  const sel = new LineSelector(spec);
  const out: number[] = [];
  corpus.forEach((line, i) => sel.push(i, line, out));
  return out;
}

function view(spec: HostFilterSpec): number[] {
  return filterLines(corpus as never, { query: spec.query, levels: spec.levels as never, fields: spec.fields as never, contextLines: spec.contextLines })
    .map(l => l.seq);
}

const specs: [string, HostFilterSpec][] = [
  ['nothing', { query: '', levels: [] }],
  ['substring, any case', { query: 'REQUESTDATAID=9363', levels: [] }],
  ['regex', { query: '/requestDataId=\\d{4}\\b/', levels: [] }],
  ['a regex that does not compile is a substring', { query: '/(unclosed/', levels: [] }],
  ['levels', { query: '', levels: ['error', 'warn'] }],
  ['one thread, with its stack frame', { query: '', levels: [], fields: [{ field: 'thread', value: 'exec-1', mode: 'include' }] }],
  ['wildcard thread', { query: '', levels: [], fields: [{ field: 'thread', value: 'scheduling-*', mode: 'include' }] }],
  ['exclude wins', { query: '', levels: [], fields: [{ field: 'logger', value: 'c.z.DownstreamClient', mode: 'exclude' }] }],
  ['MDC field', { query: '', levels: [], fields: [{ field: 'tenant', value: 'acme', mode: 'include' }] }],
  ['two fields ANDed', { query: '', levels: [], fields: [
    { field: 'thread', value: 'exec-1', mode: 'include' }, { field: 'logger', value: 'c.z.DownstreamClient', mode: 'include' },
  ] }],
  ['query with context', { query: '9363', levels: [], contextLines: 1 }],
  ['query with wide context', { query: 'moved to status', levels: [], contextLines: 3 }],
  ['query, level and field together', { query: 'requestDataId', levels: ['info', 'error'], fields: [{ field: 'thread', value: 'exec-*', mode: 'include' }] }],
];

describe('the whole-file filter keeps exactly what the log view keeps', () => {
  for (const [name, spec] of specs) {
    it(name, () => expect(host(spec)).toEqual(view(spec)));
  }
});

describe('an empty filter', () => {
  it('is recognised, so the file can be paged without scanning it', () => {
    expect(isEmptySpec({ query: ' ', levels: [], fields: [] })).toBe(true);
    expect(isEmptySpec({ query: '', levels: ['error'] })).toBe(false);
  });
});
