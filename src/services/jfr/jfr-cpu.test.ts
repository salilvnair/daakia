import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { JfrChunk } from './jfr-chunk';
import { readCpuSamples, hotSpots, sampleCount, idleCount, isIdleSample, type CpuSample } from './jfr-cpu';

/*
  Two kinds of test, deliberately separated.

  The reading is checked against the real recording, because only real bytes
  prove the reference chain was walked correctly. The aggregation is checked
  against stacks written here, because the fixture came off an idle pod and
  three samples cannot distinguish a correct ranking from a lucky one.
*/

const FIXTURE = join(__dirname, '../../../test/fixtures/jfr/leaky.jfr');

/** A sample with `frames[0]` innermost, the order JFR writes them. */
function sample(stack: string[], over: Partial<CpuSample> = {}): CpuSample {
  return {
    threadName: 'worker-1',
    state: 'STATE_RUNNABLE',
    atMs: 0,
    frames: stack.map((m, i) => ({
      method: m,
      className: m.slice(0, m.lastIndexOf('.')),
      methodName: m.slice(m.lastIndexOf('.') + 1),
      line: 10 + i,
      compilation: 'JIT compiled',
    })),
    ...over,
  };
}

describe('readCpuSamples', () => {
  const chunks = JfrChunk.parseAll(readFileSync(FIXTURE));
  const samples = readCpuSamples(chunks);

  it('reads the samples the recording actually holds', () => {
    // The fixture is 25s off an idle pod, so this is a handful rather than
    // thousands. It is enough to prove the chain resolves.
    expect(samples.length).toBeGreaterThan(0);
  });

  it('gives every sample a thread, a state and a stack', () => {
    for (const s of samples) {
      expect(s.threadName).not.toBe('');
      expect(s.state).toMatch(/^STATE_/);
      expect(s.frames.length).toBeGreaterThan(0);
      expect(s.atMs).toBeGreaterThan(0);
    }
  });

  it('writes class names the way Java does, not the way the class file does', () => {
    // JFR stores `jdk/jfr/internal/…`; nobody reads a profile in slashes.
    const all = samples.flatMap(s => s.frames);
    expect(all.some(f => f.className.includes('.'))).toBe(true);
    expect(all.every(f => !f.className.includes('/'))).toBe(true);
  });

  it('keeps the frames innermost-first', () => {
    // Thread.run, if present at all, is the outermost frame — never the first.
    for (const s of samples) {
      const i = s.frames.findIndex(f => f.methodName === 'run' && f.className.endsWith('Thread'));
      if (i >= 0) expect(i).toBe(s.frames.length - 1);
    }
  });
});

describe('hotSpots', () => {
  it('separates the method burning CPU from the one that called it', () => {
    /*
      The distinction the whole view exists for. `parse` is where the CPU is;
      `handle` is merely above it on the stack. A single number cannot tell
      them apart, and optimising the caller does nothing.
    */
    const samples = [
      sample(['a.Json.parse', 'a.Svc.handle', 'a.Main.run']),
      sample(['a.Json.parse', 'a.Svc.handle', 'a.Main.run']),
      sample(['a.Json.parse', 'a.Other.go', 'a.Main.run']),
    ];
    const [top] = hotSpots(samples);
    expect(top.method).toBe('a.Json.parse');
    expect(top.self).toBe(3);
    expect(top.total).toBe(3);

    const handle = hotSpots(samples).find(h => h.method === 'a.Svc.handle')!;
    expect(handle.self).toBe(0);
    expect(handle.total).toBe(2);
  });

  it('ranks by self, so the outermost frame is not the answer every time', () => {
    const samples = [
      sample(['a.Work.crunch', 'a.Main.run']),
      sample(['a.Work.crunch', 'a.Main.run']),
      sample(['a.Idle.poll', 'a.Main.run']),
    ];
    const ranked = hotSpots(samples);
    expect(ranked[0].method).toBe('a.Work.crunch');
    // Main.run is in every stack and is nobody's hot spot.
    expect(ranked.find(h => h.method === 'a.Main.run')!.self).toBe(0);
  });

  it('counts a recursive method once per sample', () => {
    // Counting per frame reports more samples than were taken, which yields a
    // percentage above 100 — the point at which the number means nothing.
    const samples = [sample(['a.Tree.walk', 'a.Tree.walk', 'a.Tree.walk', 'a.Main.run'])];
    const walk = hotSpots(samples).find(h => h.method === 'a.Tree.walk')!;
    expect(walk.total).toBe(1);
    expect(walk.totalPercent).toBeLessThanOrEqual(100);
  });

  it('ignores parked threads by default', () => {
    /*
      A pool thread waiting on a queue is sampled like any other. Counted as
      CPU it makes an idle application look busiest of all — the most
      misleading answer this view could give.
    */
    const samples = [
      sample(['a.Work.crunch', 'a.Main.run']),
      sample(['jdk.Unsafe.park', 'a.Pool.take'], { state: 'STATE_PARKED' }),
      sample(['jdk.Unsafe.park', 'a.Pool.take'], { state: 'STATE_PARKED' }),
      sample(['jdk.Unsafe.park', 'a.Pool.take'], { state: 'STATE_PARKED' }),
    ];
    const ranked = hotSpots(samples);
    expect(ranked).toHaveLength(2);            // crunch and Main.run
    expect(ranked[0].method).toBe('a.Work.crunch');
    expect(ranked[0].selfPercent).toBe(100);   // of the one runnable sample
    expect(sampleCount(samples)).toBe(1);
  });

  it('can be asked for the parked ones instead', () => {
    const samples = [
      sample(['a.Work.crunch', 'a.Main.run']),
      sample(['jdk.Unsafe.park', 'a.Pool.take'], { state: 'STATE_PARKED' }),
    ];
    const parked = hotSpots(samples, { state: 'STATE_PARKED' });
    expect(parked[0].method).toBe('jdk.Unsafe.park');
    expect(hotSpots(samples, { state: null })).toHaveLength(4);
  });

  it('says how the CPU got there, not just where it is', () => {
    // "String.equals is 40% of your CPU" is not actionable. "…and 38% of it
    // arrives through OrderValidator.check" is.
    const samples = [
      sample(['a.Str.equals', 'a.Validator.check', 'a.Main.run']),
      sample(['a.Str.equals', 'a.Validator.check', 'a.Main.run']),
      sample(['a.Str.equals', 'a.Cache.lookup', 'a.Main.run']),
    ];
    const [top] = hotSpots(samples);
    expect(top.backtraces[0].samples).toBe(2);
    expect(top.backtraces[0].frames).toEqual(['a.Validator.check', 'a.Main.run']);
    expect(top.backtraces[1].frames[0]).toBe('a.Cache.lookup');
  });

  it('reports which threads ran it', () => {
    const samples = [
      sample(['a.Work.crunch'], { threadName: 'pool-1' }),
      sample(['a.Work.crunch'], { threadName: 'pool-1' }),
      sample(['a.Work.crunch'], { threadName: 'pool-2' }),
    ];
    const [top] = hotSpots(samples);
    expect(top.threads).toEqual([
      { name: 'pool-1', samples: 2 },
      { name: 'pool-2', samples: 1 },
    ]);
  });

  it('picks the line most often sampled, not the last one seen', () => {
    const at = (line: number) => {
      const s = sample(['a.Work.crunch']);
      s.frames[0].line = line;
      return s;
    };
    const [top] = hotSpots([at(42), at(42), at(99)]);
    expect(top.line).toBe(42);
  });

  it('has nothing to say about a recording with no runnable samples', () => {
    expect(hotSpots([])).toEqual([]);
    expect(hotSpots([sample(['a.b.c'], { state: 'STATE_PARKED' })])).toEqual([]);
  });

  /*
    Found by profiling a real Spring application rather than by reasoning.

    PetClinic under load came back 78% `sun.nio.ch.EPoll.wait` and 9%
    `Net.accept` — nearly nine tenths of the answer describing acceptor threads
    with nothing to do. JFR calls them RUNNABLE because the OS thread is
    scheduled, and the sampler catches them every single time.
  */
  it('does not call a thread parked in a wait syscall CPU', () => {
    const samples = [
      sample(['a.Work.crunch', 'a.Main.run']),
      sample(['sun.nio.ch.EPoll.wait', 'a.Jetty.select']),
      sample(['sun.nio.ch.Net.accept', 'a.Jetty.acceptor']),
      sample(['jdk.internal.misc.Unsafe.park', 'a.Pool.take']),
    ];
    const ranked = hotSpots(samples);
    expect(ranked[0].method).toBe('a.Work.crunch');
    expect(ranked[0].selfPercent).toBe(100);
    expect(sampleCount(samples)).toBe(1);
    expect(idleCount(samples)).toBe(3);
  });

  it('judges the innermost frame only', () => {
    // A stack that PASSES THROUGH networking on its way to real work is real
    // work. Only a stack that ends in the wait is a thread with nothing to do.
    const working = sample(['a.Parser.decode', 'sun.nio.ch.EPoll.wait', 'a.Main.run']);
    expect(isIdleSample(working)).toBe(false);
    expect(isIdleSample(sample(['sun.nio.ch.EPoll.wait', 'a.Main.run']))).toBe(true);
  });

  it('leaves a blocking read in, because that is a finding not noise', () => {
    // A thread stuck reading a socket is the transaction-across-a-network bug.
    // Filtering it would bury the very thing the thread rules look for.
    expect(isIdleSample(sample(['sun.nio.ch.SocketDispatcher.read0', 'a.Client.post']))).toBe(false);
  });

  it('can be asked for the idle ones anyway', () => {
    const samples = [
      sample(['a.Work.crunch']),
      sample(['sun.nio.ch.EPoll.wait', 'a.Jetty.select']),
    ];
    expect(hotSpots(samples, { includeIdle: true })).toHaveLength(3);
    expect(sampleCount(samples, { includeIdle: true })).toBe(2);
  });

  it('works end to end on the real recording', () => {
    const samples = readCpuSamples(JfrChunk.parseAll(readFileSync(FIXTURE)));
    const ranked = hotSpots(samples, { state: null, includeIdle: true });
    expect(ranked.length).toBeGreaterThan(0);
    // Percentages are shares of the sample total, so self can never exceed it.
    const totalSelf = ranked.reduce((a, h) => a + h.self, 0);
    expect(totalSelf).toBe(sampleCount(samples, { state: null, includeIdle: true }));
    for (const h of ranked) expect(h.totalPercent).toBeLessThanOrEqual(100);
  });
});
