import { describe, it, expect } from 'vitest';
import { parseFrame, originOf, appFrameIndices, summariseStack } from './thread-frame';

// Frames copied verbatim from the SIGQUIT dump this was built against.
const REAL = [
  'sun.nio.ch.Net.poll(java.base@21.0.12/Native Method)',
  'sun.nio.ch.NioSocketImpl.park(java.base@21.0.12/Unknown Source)',
  'sun.nio.ch.NioSocketImpl.implRead(java.base@21.0.12/Unknown Source)',
  'java.net.Socket$SocketInputStream.read(java.base@21.0.12/Unknown Source)',
  'com.zapper.zp.dk8s.Dk8sFaultInjector.wedgeOnSocket(Dk8sFaultInjector.java:151)',
  'com.zapper.zp.dk8s.Dk8sFaultInjector$$Lambda/0x000078bd1aab3c18.run(Unknown Source)',
  'java.lang.Thread.runWith(java.base@21.0.12/Unknown Source)',
  'java.lang.Thread.run(java.base@21.0.12/Unknown Source)',
].map(raw => ({ raw }));

describe('parseFrame', () => {
  it('splits an application frame with a file and line', () => {
    expect(parseFrame('com.zapper.zp.dk8s.Dk8sFaultInjector.wedgeOnSocket(Dk8sFaultInjector.java:151)'))
      .toEqual({
        origin: 'app',
        packageName: 'com.zapper.zp.dk8s',
        className: 'Dk8sFaultInjector',
        method: 'wedgeOnSocket',
        location: 'Dk8sFaultInjector.java:151',
      });
  });

  it('drops the module prefix a modern JVM prints', () => {
    // `java.base@21.0.12/` is noise in every frame of a JDK 9+ dump.
    const f = parseFrame('java.lang.Thread.run(java.base@21.0.12/Unknown Source)');
    expect(f.className).toBe('Thread');
    expect(f.method).toBe('run');
    expect(f.location).toBeUndefined();
  });

  it('marks a native method as native rather than as its package', () => {
    expect(parseFrame('sun.nio.ch.Net.poll(java.base@21.0.12/Native Method)').origin).toBe('native');
  });

  it('handles a lambda, whose synthetic name contains / and $', () => {
    const f = parseFrame('com.zapper.zp.dk8s.Dk8sFaultInjector$$Lambda/0x000078bd1aab3c18.run(Unknown Source)');
    expect(f.origin).toBe('app');
    expect(f.method).toBe('run');
    expect(f.className).toContain('Dk8sFaultInjector');
  });

  it('tolerates a shape it has never seen rather than losing the line', () => {
    const f = parseFrame('some vendor gibberish');
    // No dots to split on, so the whole line survives as the method rather
    // than being carved into pieces that mean nothing.
    expect(f.method).toBe('some vendor gibberish');
    expect(f.className).toBe('');
    expect(f.origin).toBe('app');
  });

  it('strips a leading `at`', () => {
    expect(parseFrame('   at java.lang.Thread.run(Unknown Source)').className).toBe('Thread');
  });
});

describe('originOf', () => {
  it('separates the platform, libraries and your own code', () => {
    expect(originOf('java.util.HashMap.get')).toBe('jdk');
    expect(originOf('jakarta.servlet.http.HttpServlet.service')).toBe('jdk');
    expect(originOf('org.springframework.web.servlet.DispatcherServlet.doGet')).toBe('framework');
    expect(originOf('com.zaxxer.hikari.pool.HikariPool.getConnection')).toBe('framework');
    expect(originOf('com.zapper.zp.OrderService.place')).toBe('app');
  });

  it('does not mistake a company package that starts like a library', () => {
    // `com.sun` is the JDK; `com.sundry` is somebody's code.
    expect(originOf('com.sun.crypto.provider.AESCipher.engineInit')).toBe('jdk');
    expect(originOf('com.sundry.billing.Invoice.total')).toBe('app');
  });
});

describe('appFrameIndices', () => {
  it('finds the application frames buried in a real stack', () => {
    // Two of eight, which is the whole reason to colour them.
    expect(appFrameIndices(REAL)).toEqual([4, 5]);
  });

  it('returns nothing for a stack that never enters application code', () => {
    expect(appFrameIndices([
      { raw: 'jdk.internal.misc.Unsafe.park(java.base@21/Native Method)' },
      { raw: 'java.util.concurrent.locks.LockSupport.park(java.base@21/Unknown Source)' },
    ])).toEqual([]);
  });
});

describe('summariseStack', () => {
  it('answers "where is this thread" with the topmost application frame', () => {
    expect(summariseStack(REAL)).toBe('Dk8sFaultInjector.wedgeOnSocket (Dk8sFaultInjector.java:151)');
  });

  it('falls back to the top frame for a parked pool worker', () => {
    // Never enters application code, and that is itself the answer.
    expect(summariseStack([
      { raw: 'jdk.internal.misc.Unsafe.park(java.base@21/Native Method)' },
    ])).toBe('Unsafe.park');
  });

  it('says so when there is no stack at all', () => {
    expect(summariseStack([])).toBe('no stack');
  });
});
