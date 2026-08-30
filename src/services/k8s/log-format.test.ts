import { describe, it, expect } from 'vitest';
import {
  compileFormat, compileTemplate, validatePattern, normaliseLevel,
  resolveFormat, FormatMeter, probeFormat, chooseFormat, type LogFormat,
} from './log-format';
import { BUILTIN_FORMATS } from './log-format-builtins';

const byId = (id: string) => BUILTIN_FORMATS.find(f => f.id === id)!;
const parse = (id: string, line: string) => compileFormat(byId(id)).parse(line);

describe('built-in formats parse real lines', () => {
  it('Spring Boot', () => {
    const p = parse('builtin.spring',
      '2026-08-30T02:41:05.171Z  WARN 1 --- [zp-backend] [   main] o.h.e.j.s.SqlExceptionHelper : SQL Error: 0, SQLState: 08001')!;
    expect(p.level).toBe('warn');
    expect(p.logger).toBe('o.h.e.j.s.SqlExceptionHelper');
    expect(p.message).toContain('SQL Error');
    expect(p.ts).toBe(Date.parse('2026-08-30T02:41:05.171Z'));
  });

  it('JSON — the case that used to render entirely grey', () => {
    const p = parse('builtin.json',
      '{"level":"error","ts":1756522865.1,"msg":"connection refused","logger":"db/pool.go:42"}')!;
    expect(p.level).toBe('error');
    expect(p.message).toBe('connection refused');
    expect(p.logger).toBe('db/pool.go:42');
    // Seconds, not milliseconds — both appear in the wild.
    expect(p.ts).toBe(1756522865100);
  });

  it('logfmt', () => {
    const p = parse('builtin.logfmt',
      'ts=2026-08-30T02:41:05Z level=error msg="connection refused" component=db')!;
    expect(p.level).toBe('error');
    expect(p.message).toBe('connection refused');
    expect(p.logger).toBe('db');
  });

  it('Python logging', () => {
    const p = parse('builtin.python',
      '2026-08-30 02:41:05,171 - myapp.db - ERROR - connection refused')!;
    expect(p.level).toBe('error');
    expect(p.logger).toBe('myapp.db');
    expect(p.message).toBe('connection refused');
  });

  it('Logback', () => {
    const p = parse('builtin.logback',
      '02:41:05.171 [main] ERROR com.acme.Db - connection refused')!;
    expect(p.level).toBe('error');
    expect(p.logger).toBe('com.acme.Db');
  });

  it('Go stdlib — no level, and says so rather than guessing', () => {
    const p = parse('builtin.go', '2026/08/30 02:41:05 db.go:42: connection refused')!;
    expect(p.level).toBe('other');
    expect(p.message).toBe('connection refused');
  });

  it('syslog maps its priority number to a level', () => {
    const p = parse('builtin.syslog', '<11>1 2026-08-30T02:41:05Z host app - - - disk failing')!;
    expect(p.level).toBe('error');
  });

  it('nginx maps HTTP status to a level', () => {
    // A 500 line should read as an error; before this it read as nothing.
    const err = parse('builtin.nginx',
      '10.0.2.15 - - [30/Aug/2026:02:41:05 +0000] "GET /health HTTP/1.1" 500 143')!;
    expect(err.level).toBe('error');
    const ok = parse('builtin.nginx',
      '10.0.2.15 - - [30/Aug/2026:02:41:05 +0000] "GET /health HTTP/1.1" 200 143')!;
    expect(ok.level).toBe('info');
  });

  it('returns null rather than a wrong answer on a line it does not fit', () => {
    // A format that claims every line would paint nonsense with confidence.
    expect(parse('builtin.spring', 'just some unstructured output')).toBeNull();
    expect(parse('builtin.json', 'not json at all')).toBeNull();
    expect(parse('builtin.logfmt', 'no equals signs here')).toBeNull();
  });
});

describe('normaliseLevel', () => {
  it('accepts the spellings loggers actually emit', () => {
    for (const [raw, want] of [
      ['ERROR', 'error'], ['Error', 'error'], ['err', 'error'], ['SEVERE', 'error'],
      ['WARNING', 'warn'], ['warn', 'warn'],
      ['INFO', 'info'], ['notice', 'info'],
      ['TRACE', 'debug'], ['debug', 'debug'],
    ] as const) {
      expect(normaliseLevel(raw)).toBe(want);
    }
  });

  it('reads numeric severities', () => {
    expect(normaliseLevel(50)).toBe('error');   // bunyan/pino
    expect(normaliseLevel(30)).toBe('info');
    expect(normaliseLevel('3')).toBe('error');  // syslog
  });

  it('lets a format override the defaults', () => {
    expect(normaliseLevel('yikes', { yikes: 'error' })).toBe('error');
  });

  it('is "other" for anything unrecognised, never a guess', () => {
    expect(normaliseLevel('bananas')).toBe('other');
    expect(normaliseLevel(undefined)).toBe('other');
    expect(normaliseLevel('')).toBe('other');
  });
});

describe('compileTemplate', () => {
  it('anchors the pattern', () => {
    // Unanchored, a failing match rescans from every position in the line.
    expect(compileTemplate('%{LEVEL} %{MESSAGE}').source.startsWith('^')).toBe(true);
    expect(compileTemplate('/foo/').source.startsWith('^')).toBe(true);
  });

  it('treats literal text as literal', () => {
    const re = compileTemplate('a.b %{MESSAGE}');
    expect(re.test('a.b hello')).toBe(true);
    expect(re.test('axb hello')).toBe(false);
  });

  it('lets one space in a template match aligned padding', () => {
    // Log columns are padded, so the gap after a level varies line to line.
    const re = compileTemplate('%{LEVEL} %{MESSAGE}');
    expect(re.test('WARN     padded out')).toBe(true);
  });
});

describe('validatePattern', () => {
  it('accepts an ordinary pattern', () => {
    expect(validatePattern('%{TIMESTAMP} %{LEVEL} %{MESSAGE}')).toBeNull();
  });

  it('rejects nested unbounded repeats before they can hang the host', () => {
    // On a nearly-matching line this backtracks effectively forever, and one
    // such pattern against a busy pod would freeze the extension host.
    expect(validatePattern('/(a+)+$/')).toMatch(/unbounded repeat/i);
  });

  it('rejects a pattern that will not compile', () => {
    expect(validatePattern('/([unclosed/')).toMatch(/will not compile/i);
  });
});

describe('resolveFormat', () => {
  const fmt = (id: string, match: LogFormat['match']): LogFormat =>
    ({ id, name: id, kind: 'pattern', pattern: '%{MESSAGE}', match });

  const ctx = {
    namespace: 'payments', pod: 'api-gateway-7d9f',
    image: 'registry/acme/api:1.2', labels: { app: 'api-gateway', tier: 'edge' },
  };

  it('matches on image, namespace, pod and label', () => {
    expect(resolveFormat([fmt('a', { image: 'acme/api' })], ctx)?.id).toBe('a');
    expect(resolveFormat([fmt('b', { namespace: 'payments' })], ctx)?.id).toBe('b');
    expect(resolveFormat([fmt('c', { pod: 'api-gateway' })], ctx)?.id).toBe('c');
    expect(resolveFormat([fmt('d', { label: 'tier=edge' })], ctx)?.id).toBe('d');
  });

  it('requires every present field to match', () => {
    expect(resolveFormat([fmt('a', { namespace: 'payments', image: 'nope' })], ctx)).toBeUndefined();
  });

  it('takes the first match, so narrower rules can be ordered above broader', () => {
    const list = [fmt('narrow', { pod: 'api-gateway' }), fmt('broad', { namespace: 'payments' })];
    expect(resolveFormat(list, ctx)?.id).toBe('narrow');
  });

  it('ignores a format with no rule at all', () => {
    // An unconditional format would capture every pod and hide every format
    // listed after it.
    expect(resolveFormat([fmt('none', undefined)], ctx)).toBeUndefined();
    expect(resolveFormat([fmt('empty', {})], ctx)).toBeUndefined();
  });

  it('skips disabled formats', () => {
    const f = { ...fmt('a', { namespace: 'payments' }), enabled: false };
    expect(resolveFormat([f], ctx)).toBeUndefined();
  });
});

describe('FormatMeter', () => {
  it('stays healthy for a fast format', () => {
    const m = new FormatMeter(25, 20);
    for (let i = 0; i < 40; i++) m.run(() => 1 + 1);
    expect(m.healthy).toBe(true);
  });

  it('gives up on a format that is too slow to keep', () => {
    // A pattern that merely backtracks a little is invisible in a test and
    // ruinous at ten thousand lines. Losing colour beats losing the view.
    const m = new FormatMeter(0.0001, 5);
    for (let i = 0; i < 10; i++) m.run(() => { let s = 0; for (let j = 0; j < 5000; j++) s += j; return s; });
    expect(m.healthy).toBe(false);
  });

  it('keeps running the parser after giving up on measuring it', () => {
    const m = new FormatMeter(0.0001, 2);
    for (let i = 0; i < 5; i++) m.run(() => 1);
    expect(m.run(() => 'still called')).toBe('still called');
  });
});

describe('probeFormat', () => {
  const spring = [
    '2026-08-30T02:41:05.171Z  WARN 1 --- [app] [main] com.acme.Db : slow',
    '2026-08-30T02:41:06.001Z  INFO 1 --- [app] [main] com.acme.Api : started',
    '2026-08-30T02:41:07.500Z ERROR 1 --- [app] [main] com.acme.Db : refused',
    '2026-08-30T02:41:08.100Z  INFO 1 --- [app] [main] com.acme.Api : ok',
  ];
  const json = [
    '{"level":"info","ts":1756522865,"msg":"listening"}',
    '{"level":"error","ts":1756522866,"msg":"refused"}',
    '{"level":"warn","ts":1756522867,"msg":"retrying"}',
    '{"level":"info","ts":1756522868,"msg":"ok"}',
  ];

  it('identifies the format with no configuration at all', () => {
    expect(probeFormat(spring, BUILTIN_FORMATS)?.format.id).toBe('builtin.spring');
    expect(probeFormat(json, BUILTIN_FORMATS)?.format.id).toBe('builtin.json');
  });

  it('prefers a format that reads a level over one that merely matches', () => {
    // Several patterns will match a given line; the useful one is whichever
    // gets the colour right, which is the entire point of choosing.
    const best = probeFormat(spring, BUILTIN_FORMATS)!;
    expect(best.levelled).toBeGreaterThan(0);
  });

  it('returns nothing rather than a bad guess on unstructured output', () => {
    const junk = ['starting up', 'still going', 'done', 'bye', 'again'];
    expect(probeFormat(junk, BUILTIN_FORMATS)).toBeUndefined();
  });

  it('will not guess from too small a sample', () => {
    expect(probeFormat([json[0]], BUILTIN_FORMATS)).toBeUndefined();
  });
});

describe('chooseFormat', () => {
  const ctx = { namespace: 'payments', pod: 'api-1', image: 'acme/api', labels: {} };
  const pinned: LogFormat = { id: 'pin', name: 'pinned', kind: 'json' };
  const ruled: LogFormat = {
    id: 'rule', name: 'ruled', kind: 'json', match: { namespace: 'payments' },
  };
  const sample = ['{"level":"info","msg":"a"}', '{"level":"info","msg":"b"}', '{"level":"info","msg":"c"}'];

  it('prefers an explicit choice over everything', () => {
    const r = chooseFormat({ pinned, saved: [ruled], builtins: BUILTIN_FORMATS, ctx, sample });
    expect(r.via).toBe('pinned');
    expect(r.format?.id).toBe('pin');
  });

  it('prefers a configured rule over a guess', () => {
    const r = chooseFormat({ saved: [ruled], builtins: BUILTIN_FORMATS, ctx, sample });
    expect(r.via).toBe('rule');
  });

  it('falls back to probing when nothing is configured', () => {
    const r = chooseFormat({ saved: [], builtins: BUILTIN_FORMATS, ctx, sample });
    expect(r.via).toBe('probed');
    expect(r.format?.id).toBe('builtin.json');
  });

  it('reports "none" rather than inventing one', () => {
    // The caller then keeps its own heuristic, which is better than a format
    // that confidently mislabels every line.
    const r = chooseFormat({ saved: [], builtins: BUILTIN_FORMATS, ctx, sample: ['junk', 'more junk', 'yet more'] });
    expect(r.via).toBe('none');
    expect(r.format).toBeUndefined();
  });
});
