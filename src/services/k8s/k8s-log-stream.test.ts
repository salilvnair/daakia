import { describe, it, expect } from 'vitest';
import { levelOf, parseLine } from './k8s-log-stream';
import { extractLastThreadDump, decodeProcNetTcp, artifactName } from './k8s-artifacts';

describe('levelOf', () => {
  it('reads the level token', () => {
    expect(levelOf('2026-01-01 ERROR  boot - failed')).toBe('error');
    expect(levelOf('2026-01-01 WARN   boot - slow')).toBe('warn');
    expect(levelOf('2026-01-01 WARNING boot - slow')).toBe('warn');
    expect(levelOf('2026-01-01 INFO   boot - ok')).toBe('info');
    expect(levelOf('2026-01-01 DEBUG  boot - detail')).toBe('debug');
    expect(levelOf('2026-01-01 SEVERE boot - failed')).toBe('error');
  });

  it('does not paint a line red for mentioning an error elsewhere', () => {
    // The whole point of anchoring to the head: a viewer where most lines are
    // red conveys nothing at all.
    const line = 'INFO  registered handler for com.example.ErrorController at /error';
    expect(levelOf(line)).toBe('info');
  });

  it('only looks at the head of a long line', () => {
    const line = `INFO ${'x'.repeat(200)} ERROR trailing`;
    expect(levelOf(line)).toBe('info');
  });

  it('keeps stack frames with the error above them', () => {
    expect(levelOf('\tat com.example.Foo.bar(Foo.java:42)')).toBe('error');
    expect(levelOf('    at com.example.Foo.bar(Foo.java:42)')).toBe('error');
    expect(levelOf('Caused by: java.net.SocketTimeoutException')).toBe('error');
  });

  it('falls back to other for an unlabelled line', () => {
    expect(levelOf('starting up')).toBe('other');
  });
});

describe('parseLine', () => {
  it('splits the RFC3339 prefix kubectl adds', () => {
    const l = parseLine('2026-01-01T12:00:00.123456789Z ERROR boom', 7, true);
    expect(l.seq).toBe(7);
    expect(l.ts).toBe(Date.parse('2026-01-01T12:00:00.123456789Z'));
    expect(l.text).toBe('ERROR boom');
    expect(l.level).toBe('error');
  });

  it('handles a timestamp with no fractional part', () => {
    const l = parseLine('2026-01-01T12:00:00Z hello', 0, true);
    expect(l.ts).toBe(Date.parse('2026-01-01T12:00:00Z'));
    expect(l.text).toBe('hello');
  });

  it('keeps the whole line when there is no timestamp to strip', () => {
    const l = parseLine('ERROR boom', 0, false);
    expect(l.ts).toBeUndefined();
    expect(l.text).toBe('ERROR boom');
  });

  it('does not eat a line that merely starts with a number', () => {
    const l = parseLine('2026 records processed', 0, true);
    expect(l.text).toBe('2026 records processed');
    expect(l.ts).toBeUndefined();
  });
});

describe('extractLastThreadDump', () => {
  const dump = (marker: string) => [
    `${marker}`,
    'Full thread dump OpenJDK 64-Bit Server VM (21.0.1+12 mixed mode):',
    '',
    '"main" #1 prio=5 os_prio=0 tid=0x1 nid=0x2 waiting on condition',
    '   java.lang.Thread.State: RUNNABLE',
  ].join('\n');

  it('returns null when the log holds no dump', () => {
    expect(extractLastThreadDump('INFO started\nINFO ready')).toBeNull();
  });

  it('finds a dump at the end of a log', () => {
    const out = extractLastThreadDump(`INFO started\n${dump('2026-01-01 12:00:00')}`);
    expect(out).toContain('Full thread dump');
    expect(out).toContain('"main" #1');
  });

  it('takes the LAST dump when a pod has been signalled before', () => {
    // Taking the first match would hand back an hour-old dump and look
    // completely convincing while answering the wrong question.
    const log = [
      dump('2026-01-01 11:00:00'),
      'INFO  ... an hour of traffic ...',
      dump('2026-01-01 12:00:00'),
    ].join('\n');
    const out = extractLastThreadDump(log)!;
    expect(out).toContain('2026-01-01 12:00:00');
    expect(out).not.toContain('2026-01-01 11:00:00');
  });

  it('includes the timestamp line the JVM prints above the header', () => {
    const out = extractLastThreadDump(dump('2026-01-01 12:00:00'))!;
    expect(out.split('\n')[0]).toBe('2026-01-01 12:00:00');
  });
});

describe('decodeProcNetTcp', () => {
  it('decodes little-endian hex addresses and state names', () => {
    const raw = [
      '  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid',
      '   0: 0100007F:1F90 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0',
      '   1: 0F02000A:CE4A 0102000A:1538 01 00000000:00000000 00:00000000 00000000     0',
    ].join('\n');
    const out = decodeProcNetTcp(raw);
    expect(out).toContain('LISTEN');
    expect(out).toContain('127.0.0.1:8080');
    expect(out).toContain('ESTABLISHED');
    expect(out).toContain('10.0.2.15:52810');
    expect(out).toContain('10.0.2.1:5432');
  });

  it('returns the input untouched when there is nothing to decode', () => {
    const raw = 'State  Recv-Q Send-Q Local Address:Port\nLISTEN 0 128 0.0.0.0:8080';
    expect(decodeProcNetTcp(raw)).toBe(raw);
  });
});

describe('artifactName', () => {
  it('sorts chronologically and is safe on every filesystem', () => {
    const at = new Date(Date.UTC(2026, 0, 2, 3, 4, 5));
    const name = artifactName('zp-api-7d9f', 'heapdump', 'hprof', at);
    expect(name).toBe('zp-api-7d9f__heapdump__2026-01-02_03-04-05.hprof');
    expect(name).not.toMatch(/[:*?"<>|]/);
  });

  it('sanitises a hostile pod name rather than trusting it', () => {
    const at = new Date(Date.UTC(2026, 0, 2, 3, 4, 5));
    const name = artifactName('../../etc/passwd', 'histogram', 'txt', at);
    expect(name).not.toContain('/');
    expect(name).not.toContain('..');
  });
});

describe('levelOf on a Logback throwable', () => {
  // The exact sequence a Hibernate connection failure produces. Every level
  // below comes from the text the application wrote — dk8s reads them, it
  // does not assign them.
  const SEQUENCE = [
    ['2026-08-30T16:45:57.212Z  INFO 1 --- [zp-backend] [main] com.zaxxer.hikari.HikariDataSource : HikariPool-1 - Starting...', 'info'],
    ['2026-08-30T16:46:04.301Z  WARN 1 --- [zp-backend] [main] o.h.engine.jdbc.spi.SqlExceptionHelper : SQL Error: 0, SQLState: 08001', 'warn'],
    ['2026-08-30T16:46:04.301Z ERROR 1 --- [zp-backend] [main] o.h.engine.jdbc.spi.SqlExceptionHelper : The connection attempt failed.', 'error'],
    ['2026-08-30T16:46:04.302Z  WARN 1 --- [zp-backend] [main] o.h.e.j.e.i.JdbcEnvironmentInitiator : HHH000342: Could not obtain connection', 'warn'],
  ] as const;

  it('takes each level from the line, not from context', () => {
    for (const [line, want] of SEQUENCE) expect(levelOf(line)).toBe(want);
  });

  it('colours the throwable header, which carries no level of its own', () => {
    // Logback runs its pattern once per event then dumps the trace raw, so
    // this line arrives naked. It used to fall through to `other` and render
    // as plain text between an amber WARN and a wall of red frames.
    expect(levelOf('org.hibernate.exception.JDBCConnectionException: unable to obtain isolated JDBC connection'))
      .toBe('error');
    expect(levelOf('java.lang.NullPointerException')).toBe('error');
    expect(levelOf('java.io.IOException: broken pipe')).toBe('error');
  });

  it('keeps the frames under it as error', () => {
    expect(levelOf('\tat org.hibernate.exception.internal.SQLStateConversionDelegate.convert(SQLStateConversionDelegate.java:100)'))
      .toBe('error');
    expect(levelOf('Caused by: java.net.ConnectException: Connection refused')).toBe('error');
  });

  it('does not colour an ordinary line that merely mentions one', () => {
    // `ErrorHandler` in a message must not turn an INFO line red.
    expect(levelOf('Starting ErrorHandler for the application')).toBe('other');
    expect(levelOf('2026-08-30T16:45:57Z  INFO 1 --- [x] c.e.ExceptionMapper : registered')).toBe('info');
  });
});
