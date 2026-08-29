import { describe, it, expect } from 'vitest';
import { findSuspects, summariseSuspects, SUSPECT_MARKERS } from './thread-suspects';
import type { ThreadInfo, ThreadState, StackFrame } from './jstack-parser';

const frame = (method: string): StackFrame =>
  ({ raw: `\tat ${method}(Unknown Source)`, method, jdk: method.startsWith('java.') || method.startsWith('sun.') });

const thread = (
  name: string, state: ThreadState, methods: string[], cpuMs?: number,
): ThreadInfo => ({
  name, daemon: false, status: state.toLowerCase(), state,
  frames: methods.map(frame), locked: [], cpuMs,
} as ThreadInfo);

describe('findSuspects', () => {
  it('finds a modern blocked socket read', () => {
    // JDK 13+ shape. This is the one that actually fires on current JVMs.
    const t = thread('http-nio-8080-exec-3', 'RUNNABLE', [
      'sun.nio.ch.NioSocketImpl.read',
      'java.net.Socket$SocketInputStream.read',
      'com.example.Client.call',
    ]);
    const [f] = findSuspects([t]);
    expect(f.markerId).toBe('socket-read-blocked');
    expect(f.severity).toBe('critical');
    expect(f.threads[0].name).toBe('http-nio-8080-exec-3');
  });

  it('still finds the pre-JDK-13 shape', () => {
    // Old dumps have to keep working — people analyse archived ones.
    const t = thread('worker-1', 'RUNNABLE', ['java.net.SocketInputStream.socketRead0']);
    expect(findSuspects([t])[0].markerId).toBe('socket-read-blocked');
  });

  it('does not fire the socket marker on a thread that is merely WAITING', () => {
    // The whole point of that marker is RUNNABLE-but-not-running. A WAITING
    // thread is honestly reported as waiting and is not the same finding.
    const t = thread('worker-1', 'WAITING', ['sun.nio.ch.NioSocketImpl.read']);
    const ids = findSuspects([t]).map(f => f.markerId);
    expect(ids).not.toContain('socket-read-blocked');
  });

  it('assigns each thread to exactly one marker', () => {
    // A blocked JDBC thread matches both jdbc-wait and blocked-on-monitor; if
    // it appeared under both, the counts would stop adding up.
    const t = thread('pool-1', 'BLOCKED', ['com.zaxxer.hikari.pool.HikariPool.getConnection']);
    const findings = findSuspects([t]);
    const total = findings.reduce((n, f) => n + f.threads.length, 0);
    expect(total).toBe(1);
  });

  it('only looks at the top of the stack', () => {
    // Thread.sleep appears deep in a great many stacks; matching it there
    // would make the marker fire on nearly everything.
    const deep = thread('app-1', 'RUNNABLE', [
      'com.example.A.a', 'com.example.B.b', 'com.example.C.c',
      'com.example.D.d', 'com.example.E.e', 'com.example.F.f',
      'java.lang.Thread.sleep',
    ]);
    expect(findSuspects([deep]).map(f => f.markerId)).not.toContain('thread-sleep');
  });

  it('reports a BLOCKED thread that has no stack at all', () => {
    const t = thread('mystery', 'BLOCKED', []);
    expect(findSuspects([t])[0].markerId).toBe('blocked-on-monitor');
  });

  it('orders critical findings first, then by how many threads they hold', () => {
    const threads = [
      thread('idle-1', 'WAITING', ['java.util.concurrent.locks.LockSupport.park']),
      thread('idle-2', 'WAITING', ['java.util.concurrent.locks.LockSupport.park']),
      thread('stuck', 'RUNNABLE', ['sun.nio.ch.NioSocketImpl.read']),
    ];
    const findings = findSuspects(threads);
    expect(findings[0].severity).toBe('critical');
    expect(findings[findings.length - 1].markerId).toBe('parked-pool');
  });

  it('puts the busiest thread first inside a finding', () => {
    const findings = findSuspects([
      thread('quiet', 'BLOCKED', [], 5),
      thread('busy', 'BLOCKED', [], 900),
    ]);
    expect(findings[0].threads[0].name).toBe('busy');
  });

  it('gives every marker a reason', () => {
    // A finding that says "suspicious" and nothing else costs the reader time.
    for (const m of SUSPECT_MARKERS) {
      expect(m.why.length).toBeGreaterThan(40);
      expect(m.title).toBeTruthy();
    }
  });
});

describe('summariseSuspects', () => {
  it('says so plainly when nothing is wrong', () => {
    expect(summariseSuspects([], 40)).toContain('going about its business');
  });

  it('says the process is idle when most threads are parked', () => {
    // "Look somewhere else" is a genuinely useful answer and the one people
    // most often fail to reach.
    const threads = Array.from({ length: 30 }, (_, i) =>
      thread(`pool-${i}`, 'WAITING', ['java.util.concurrent.locks.LockSupport.park']));
    const out = summariseSuspects(findSuspects(threads), 30);
    expect(out).toContain('not busy');
  });

  it('leads with the worst finding', () => {
    const threads = [
      thread('a', 'RUNNABLE', ['sun.nio.ch.NioSocketImpl.read']),
      thread('b', 'RUNNABLE', ['sun.nio.ch.NioSocketImpl.read']),
    ];
    const out = summariseSuspects(findSuspects(threads), 2);
    expect(out).toContain('2 threads');
    expect(out).toContain('socket read');
  });
});
