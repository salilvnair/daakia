import { describe, it, expect } from 'vitest';
import { levelOf, parseLine, isContinuation
} from './k8s-log-stream';
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

  it('reads no level from a stack frame, because a frame has none', () => {
    // This used to return `error`. A frame belongs to whatever event printed
    // it, and Hibernate prints plenty of them under a WARN — see
    // log-levels.fixture.test.ts, which checks a real log line by line.
    expect(levelOf('\tat com.example.Foo.bar(Foo.java:42)')).toBe('other');
    expect(levelOf('    at com.example.Foo.bar(Foo.java:42)')).toBe('other');
    expect(levelOf('Caused by: java.net.SocketTimeoutException')).toBe('other');
  });

  it('recognises the shapes that make a line part of the event above', () => {
    expect(isContinuation('\tat com.example.Foo.bar(Foo.java:42)')).toBe(true);
    expect(isContinuation('    at com.example.Foo.bar(Foo.java:42)')).toBe(true);
    expect(isContinuation('Caused by: java.net.SocketTimeoutException')).toBe(true);
    expect(isContinuation('Suppressed: java.lang.Exception')).toBe(true);
    expect(isContinuation('\t... 40 common frames omitted')).toBe(true);
    expect(isContinuation('... 12 more')).toBe(true);
    expect(isContinuation('org.hibernate.exception.JDBCConnectionException: nope')).toBe(true);
    expect(isContinuation('java.lang.NullPointerException')).toBe(true);

    expect(isContinuation('2026-08-30T16:45:57.212Z  INFO 1 --- starting')).toBe(false);
    expect(isContinuation('Tomcat started on port 8090')).toBe(false);
  });

  it('falls back to other for an unlabelled line', () => {
    expect(levelOf('starting up')).toBe('other');
  });
});

/*
  A logging framework runs its conversion pattern once per EVENT. A message
  containing a newline therefore prints its prefix on the first line and dumps
  the rest raw, so the continuation arrives with no timestamp, no level and no
  logger — Spring Boot's failed-start report is the case that prompted this.
*/
describe('parseLine — continuation lines', () => {
  /** Recognises "<ISO> <LEVEL> <rest>" and nothing else, like a real format. */
  const format = {
    format: { id: 't', name: 'test', kind: 'pattern' },
    parse: (text: string) => {
      const m = /^(\S+Z)\s+(ERROR|WARN|INFO|DEBUG)\s+(.*)$/.exec(text);
      if (!m) return null;
      return { ts: Date.parse(m[1]), level: m[2].toLowerCase(), message: m[3] };
    },
  } as unknown as Parameters<typeof parseLine>[3];

  it('gives a continuation the level of the event it belongs to', () => {
    const head = parseLine('2026-08-30T21:27:32.023Z INFO report follows', 1, false, format);
    expect(head.level).toBe('info');

    const cont = parseLine(
      'Error starting ApplicationContext. To display the condition evaluation report'
      + " re-run your application with 'debug' enabled.",
      2, false, format, undefined, { level: head.level, sawAppTimestamp: true },
    );
    // The sentence begins with the word "Error" but carries no level token,
    // so on its own it classified as `other` and rendered as plain text.
    expect(cont.level).toBe('info');
  });

  it('does not let a continuation override a level the line does carry', () => {
    const l = parseLine('2026-08-30T21:27:32.035Z ERROR Application run failed', 3, false, format, undefined, { level: 'info', sawAppTimestamp: true });
    expect(l.level).toBe('error');
  });

  it('inherits nothing in a log that never had timestamps', () => {
    // Without them there is no way to tell a continuation from a new event,
    // and inheriting would paint a whole log the colour of its first coloured
    // line.
    const l = parseLine('just a sentence', 4, false, undefined, undefined,
      { level: 'error', sawAppTimestamp: false });
    expect(l.level).toBe('other');
  });

  it('does not inherit `other`, so a plain log stays plain', () => {
    const l = parseLine('another sentence', 5, false, format, undefined,
      { level: 'other', sawAppTimestamp: true });
    expect(l.level).toBe('other');
  });

  it('gives a frame the level above it rather than calling it an error', () => {
    const l = parseLine('    at com.zapper.Thing.run(Thing.java:1)', 6, false, format, undefined,
      { level: 'info', sawAppTimestamp: true });
    // Inherits, rather than being called an error on sight.
    expect(l.level).toBe('info');
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

  it('treats the throwable header as part of the event, not an event', () => {
    // Logback runs its pattern once per event then dumps the trace raw, so
    // this line arrives naked. It carries no level; it takes one.
    const header = 'org.hibernate.exception.JDBCConnectionException: unable to obtain isolated JDBC connection';
    expect(levelOf(header)).toBe('other');
    expect(isContinuation(header)).toBe(true);
    expect(isContinuation('java.lang.NullPointerException')).toBe(true);
    expect(isContinuation('java.io.IOException: broken pipe')).toBe(true);
  });

  it('gives the header and its frames the level of the WARN above them', () => {
    // The sequence ends on a WARN, so the trace under it is amber, not red.
    // This is the whole point: dk8s reports what the application logged.
    const prev = { level: 'warn' as const, sawAppTimestamp: true };
    const header = parseLine(
      'org.hibernate.exception.JDBCConnectionException: unable to obtain isolated JDBC connection',
      0, false, undefined, undefined, prev,
    );
    expect(header.level).toBe('warn');

    const frame = parseLine(
      '\tat org.hibernate.exception.internal.SQLStateConversionDelegate.convert(SQLStateConversionDelegate.java:100)',
      1, false, undefined, undefined, { level: 'warn', sawAppTimestamp: true },
    );
    expect(frame.level).toBe('warn');

    const caused = parseLine(
      'Caused by: java.net.ConnectException: Connection refused',
      2, false, undefined, undefined, { level: 'warn', sawAppTimestamp: true },
    );
    expect(caused.level).toBe('warn');
  });

  it('falls back to error for a trace with nothing above it', () => {
    // A search result, or a log whose header was filtered away. An orphaned
    // trace is far more often an error than anything else, and this is the one
    // place the classifier guesses.
    const orphan = parseLine('\tat com.example.Foo.bar(Foo.java:42)', 0, false);
    expect(orphan.level).toBe('error');
  });

  it('does not colour an ordinary line that merely mentions one', () => {
    // `ErrorHandler` in a message must not turn an INFO line red.
    expect(levelOf('Starting ErrorHandler for the application')).toBe('other');
    expect(levelOf('2026-08-30T16:45:57Z  INFO 1 --- [x] c.e.ExceptionMapper : registered')).toBe('info');
  });
});
