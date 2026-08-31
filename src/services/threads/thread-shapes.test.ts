import { describe, it, expect } from 'vitest';
import { findStackShapes, roleOf, culpritFrame } from './thread-shapes';
import type { ThreadInfo, StackFrame, ThreadState } from './jstack-parser';

/** A frame, parsed the way jstack-parser would hand it over. */
const f = (method: string, file?: string, line?: number): StackFrame => ({
  raw: `\tat ${method}(${file ?? 'Unknown Source'}${line ? `:${line}` : ''})`,
  method,
  file, line,
  jdk: /^(java|javax|jdk|sun|com\.sun)[./]/.test(method),
});

const thread = (name: string, state: ThreadState, frames: StackFrame[]): ThreadInfo => ({
  name, daemon: false, status: '', state, frames,
});

/*
  The stack from the plan, innermost first — which is the order a JVM prints
  and therefore the order every rule here has to reason in.
*/
const TX_OVER_HTTP = [
  f('java.base/sun.nio.ch.NioSocketImpl.read'),
  f('okhttp3.internal.http2.Http2Stream.read'),
  f('com.zapper.zp.order.LedgerClient.post', 'LedgerClient.java', 88),
  f('com.zapper.zp.order.OrderService.submit', 'OrderService.java', 42),
  f('com.zapper.zp.order.OrderService$$SpringCGLIB$$0.submit'),
  f('org.springframework.transaction.interceptor.TransactionInterceptor.invoke'),
  f('org.springframework.aop.framework.CglibAopProxy.intercept'),
];

describe('roleOf', () => {
  it('names the transaction boundary', () => {
    expect(roleOf(f('org.springframework.transaction.interceptor.TransactionInterceptor.invoke')))
      .toBe('tx-open');
  });

  it('names blocking I/O on a modern JVM', () => {
    expect(roleOf(f('java.base/sun.nio.ch.NioSocketImpl.read'))).toBe('blocking-io');
  });

  it('still names it on a pre-13 JVM', () => {
    // Every guide written before 2019 looks for this name, and a dump from an
    // older JVM is still a dump someone will open.
    expect(roleOf(f('java.net.SocketInputStream.socketRead0'))).toBe('blocking-io');
  });

  it('names a JDBC statement', () => {
    expect(roleOf(f('org.postgresql.jdbc.PgStatement.execute'))).toBe('db-call');
  });

  it('calls application code app, and library code plain', () => {
    expect(roleOf(f('com.zapper.zp.order.OrderService.submit'))).toBe('app');
    expect(roleOf(f('java.util.ArrayList.add'))).toBe('plain');
  });
});

describe('tx.across-network-call', () => {
  const find = (ts: ThreadInfo[]) =>
    findStackShapes(ts).find(x => x.ruleId === 'tx.across-network-call');

  it('fires on a transaction that makes an HTTP call', () => {
    const out = find([thread('http-nio-8090-exec-1', 'RUNNABLE', TX_OVER_HTTP)]);
    expect(out).toBeDefined();
    expect(out!.severity).toBe('warning');
  });

  /*
    The ordering test, and the reason this rule is not just "both frames are
    present". A stack is innermost-first, so the transaction must sit BELOW the
    I/O frame — anything else is a thread that finished its transaction and
    then made a call, which is exactly how you are supposed to write it.
  */
  it('does NOT fire when the call happens after the transaction closed', () => {
    const after = [
      f('java.base/sun.nio.ch.NioSocketImpl.read'),
      f('com.zapper.zp.order.LedgerClient.post', 'LedgerClient.java', 88),
      f('com.zapper.zp.order.OrderService.notifyAfterCommit', 'OrderService.java', 61),
      f('com.zapper.zp.Main.main'),
    ];
    expect(find([thread('worker', 'RUNNABLE', after)])).toBeUndefined();
  });

  it('does not fire on a transaction with no network call', () => {
    const quiet = [
      f('org.postgresql.jdbc.PgStatement.execute'),
      f('com.zapper.zp.order.OrderService.submit', 'OrderService.java', 42),
      f('org.springframework.transaction.interceptor.TransactionInterceptor.invoke'),
    ];
    expect(find([thread('worker', 'RUNNABLE', quiet)])).toBeUndefined();
  });

  it('does not fire on a network call with no transaction', () => {
    const plain = [
      f('java.base/sun.nio.ch.NioSocketImpl.read'),
      f('com.zapper.zp.order.LedgerClient.post', 'LedgerClient.java', 88),
    ];
    expect(find([thread('worker', 'RUNNABLE', plain)])).toBeUndefined();
  });

  it('counts the threads and says how many of how many', () => {
    const ts = [
      thread('exec-1', 'RUNNABLE', TX_OVER_HTTP),
      thread('exec-2', 'RUNNABLE', TX_OVER_HTTP),
      thread('exec-3', 'RUNNABLE', TX_OVER_HTTP),
      thread('idle-1', 'WAITING', [f('jdk.internal.misc.Unsafe.park')]),
    ];
    const out = find(ts)!;
    expect(out.detail).toContain('3 of 4');
    expect(out.threads.length).toBe(3);
  });

  /*
    The point of the whole feature: naming the method a person has to change.
    Not the socket frame, not the proxy, not the interceptor — the application
    method sitting between the transaction and the network.
  */
  it('names the application method between the transaction and the socket', () => {
    const out = find([thread('exec-1', 'RUNNABLE', TX_OVER_HTTP)])!;
    expect(out.detail).toContain('LedgerClient.java:88');
  });

  it('annotates the frames so the UI can badge them', () => {
    const out = find([thread('exec-1', 'RUNNABLE', TX_OVER_HTTP)])!;
    const roles = out.threads[0].frames.map(fr => fr.role);
    expect(roles[0]).toBe('blocking-io');
    expect(roles).toContain('tx-open');
    expect(roles).toContain('app');
  });

  it('keeps file and line on the annotated frames', () => {
    const out = find([thread('exec-1', 'RUNNABLE', TX_OVER_HTTP)])!;
    const ledger = out.threads[0].frames.find(fr => fr.method.includes('LedgerClient'))!;
    expect(ledger.file).toBe('LedgerClient.java');
    expect(ledger.line).toBe(88);
  });
});

describe('culpritFrame', () => {
  /*
    okhttp is not the JDK and it is also not yours. A culprit picked with only
    the `jdk` flag names the HTTP client, and sends someone to read the source
    of a library they cannot change.
  */
  it('skips libraries as well as the JDK', () => {
    const c = culpritFrame(TX_OVER_HTTP, 0, 5)!;
    expect(c.method).toBe('com.zapper.zp.order.LedgerClient.post');
    expect(c.file).toBe('LedgerClient.java');
    expect(c.line).toBe(88);
  });

  it('is the call site, not the transactional entry point', () => {
    // Scanning the other way would name OrderService.submit — where the
    // transaction is declared, not where the mistake was made.
    const c = culpritFrame(TX_OVER_HTTP, 0, 5)!;
    expect(c.method).not.toContain('OrderService');
  });

  it('returns nothing when every frame between is third-party', () => {
    const noApp = [
      f('java.base/sun.nio.ch.NioSocketImpl.read'),
      f('okhttp3.internal.http2.Http2Stream.read'),
      f('org.springframework.transaction.interceptor.TransactionInterceptor.invoke'),
    ];
    expect(culpritFrame(noApp, 0, 2)).toBeUndefined();
  });
});

describe('tx.blocked-on-lock', () => {
  it('fires when a transactional thread is blocked on a monitor', () => {
    const t = thread('exec-1', 'BLOCKED', [
      f('com.zapper.zp.order.OrderService.submit', 'OrderService.java', 42),
      f('org.springframework.transaction.interceptor.TransactionInterceptor.invoke'),
    ]);
    const out = findStackShapes([t]).find(x => x.ruleId === 'tx.blocked-on-lock');
    expect(out).toBeDefined();
  });

  it('does not fire when the same thread is merely runnable', () => {
    const t = thread('exec-1', 'RUNNABLE', [
      f('com.zapper.zp.order.OrderService.submit'),
      f('org.springframework.transaction.interceptor.TransactionInterceptor.invoke'),
    ]);
    expect(findStackShapes([t]).find(x => x.ruleId === 'tx.blocked-on-lock')).toBeUndefined();
  });
});

describe('pool.starved', () => {
  const waiting = thread('exec-9', 'TIMED_WAITING', [
    f('com.zaxxer.hikari.pool.HikariPool.getConnection'),
    f('com.zapper.zp.order.OrderService.submit'),
  ]);
  const holding = thread('exec-1', 'RUNNABLE', [
    f('org.postgresql.jdbc.PgStatement.execute'),
    f('com.zapper.zp.order.OrderService.submit'),
  ]);

  it('fires only when someone waits AND someone holds', () => {
    const out = findStackShapes([waiting, holding]).find(x => x.ruleId === 'pool.starved');
    expect(out).toBeDefined();
    expect(out!.severity).toBe('critical');
  });

  it('stays quiet when threads are merely busy on the database', () => {
    // Every connection in use is a busy database, not a starved pool, and
    // saying otherwise sends someone to raise a pool size that is fine.
    expect(findStackShapes([holding]).find(x => x.ruleId === 'pool.starved')).toBeUndefined();
  });

  it('stays quiet when nobody holds a connection', () => {
    expect(findStackShapes([waiting]).find(x => x.ruleId === 'pool.starved')).toBeUndefined();
  });
});

describe('findStackShapes overall', () => {
  it('returns nothing for a healthy dump', () => {
    const idle = thread('pool-1', 'WAITING', [f('jdk.internal.misc.Unsafe.park')]);
    expect(findStackShapes([idle])).toEqual([]);
  });

  it('returns nothing for an empty dump rather than throwing', () => {
    expect(findStackShapes([])).toEqual([]);
  });
});
