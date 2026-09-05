/**
 * The registry is small enough to read and important enough to pin: every
 * long dk8s operation's Stop goes through it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  begin, cancel, end, cancelAll, liveOperations, isAbort,
} from './cancel';

afterEach(() => cancelAll());

describe('begin / cancel', () => {
  it('hands out a signal that fires when the request is cancelled', () => {
    const op = begin('r1', 'test');
    expect(op.cancelled()).toBe(false);
    expect(op.signal.aborted).toBe(false);

    expect(cancel('r1')).toBe(true);
    expect(op.cancelled()).toBe(true);
    // The signal is what actually kills the child process, so it matters that
    // the same object the caller passed to execFile is the one that fires.
    expect(op.signal.aborted).toBe(true);
  });

  it('says whether anything was running, so "already finished" is not an error', () => {
    expect(cancel('never-started')).toBe(false);
    const op = begin('r2', 'test');
    end('r2');
    expect(cancel('r2')).toBe(false);
    expect(op.cancelled()).toBe(false);
  });

  it('cancels a previous run on the same id rather than leaving two loops', () => {
    const first = begin('same', 'test');
    const second = begin('same', 'test');
    expect(first.cancelled()).toBe(true);
    expect(second.cancelled()).toBe(false);
  });

  it('forgets an operation once it ends, cancelled or not', () => {
    begin('r3', 'test');
    expect(liveOperations().map(o => o.requestId)).toContain('r3');
    end('r3');
    expect(liveOperations().map(o => o.requestId)).not.toContain('r3');
  });

  it('takes everything down at once', () => {
    const a = begin('a', 'test');
    const b = begin('b', 'test');
    cancelAll();
    expect(a.cancelled()).toBe(true);
    expect(b.cancelled()).toBe(true);
    expect(liveOperations()).toHaveLength(0);
  });

  it('bounds what it tracks, and takes the oldest first', () => {
    const ops = Array.from({ length: 64 }, (_, i) => begin(`b${i}`, 'test'));
    expect(liveOperations()).toHaveLength(64);
    begin('one-more', 'test');
    // The oldest was aborted rather than the new one refused: a caller that
    // hits this has a leak, and a dead button would hide it.
    expect(ops[0].cancelled()).toBe(true);
    expect(liveOperations().length).toBeLessThanOrEqual(64);
  });
});

describe('isAbort', () => {
  it('recognises the failure an aborted exec reports', () => {
    expect(isAbort('The operation was aborted')).toBe(true);
    expect(isAbort('ABORT_ERR')).toBe(true);
  });

  it('leaves real failures alone, so a stop is not blamed for them', () => {
    expect(isAbort(undefined)).toBe(false);
    expect(isAbort('spawn kubectl ENOENT')).toBe(false);
    expect(isAbort('error: unable to upgrade connection')).toBe(false);
  });
});
