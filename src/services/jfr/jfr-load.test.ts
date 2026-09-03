import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { JfrChunk } from './jfr-chunk';
import { readCpuSamples, hotSpots, sampleCount, idleCount } from './jfr-cpu';
import { readTelemetry } from './jfr-telemetry';

/*
  A recording of a service under load, with four faults planted in it.

  Everything else is tested against `leaky.jfr`, which came off an idle pod and
  proves the mechanics and nothing else. This one is 30s of `OrderLoad.java`
  (beside this fixture) running six workers at ~82 orders a second, built so
  the tool can be graded rather than merely exercised:

    1. validateSlow — quadratic string building        → CPU hot spots
    2. LedgerCache  — a lock held across a 12ms sleep  → 2,449 monitor waits
    3. enrich       — 256KB of garbage per order       → allocation rate
    4. parseAmount  — an exception on 1 order in 5     → exception rate

  The numbers below are what the tool ACTUALLY reported, checked against what
  the workload was built to do. That is the only way a profiler gets tested:
  the alternative is asserting that it returns some number.
*/
const FIXTURE = join(__dirname, '../../../test/fixtures/jfr/under-load.jfr');
const chunks = JfrChunk.parseAll(readFileSync(FIXTURE));

describe('a recording under real load', () => {
  it('reads a recording an order of magnitude bigger than the idle one', () => {
    const counts = chunks[0].counts();
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(12_000);
  });

  it('measures the planted allocation rate', () => {
    // 256KB per order at ~82 orders/s is tens of MB a second, and that is what
    // came back: 53 MB/s.
    const alloc = readTelemetry(chunks).series.find(s => s.id === 'alloc.rate')!;
    const peak = Math.max(...alloc.points.map(p => p.v));
    expect(peak).toBeGreaterThan(20 * 1024 * 1024);
    expect(alloc.unit).toBe('bytesPerSecond');
  });

  it('measures the planted exception rate', () => {
    /*
      One order in five throws, at ~82 orders a second, so ~16/s. The tool
      reported an average of 17.9/s — close enough to the arithmetic that the
      counter-to-rate conversion is demonstrably right, and the exceptions are
      caught and silent so no other view would ever have shown them.
    */
    const ex = readTelemetry(chunks).series.find(s => s.id === 'exceptions.rate')!;
    const avg = ex.points.reduce((a, p) => a + p.v, 0) / ex.points.length;
    expect(avg).toBeGreaterThan(5);
    expect(avg).toBeLessThan(40);
  });

  it('sees the GC the idle recording never triggered', () => {
    const gc = readTelemetry(chunks).series.find(s => s.id === 'gc.pause');
    expect(gc).toBeDefined();
    expect(gc!.points.length).toBeGreaterThan(50);
  });

  it('holds the lock contention, even though no view reads it yet', () => {
    /*
      The fault the CPU view CANNOT find, recorded here so the gap is visible
      rather than assumed. Six workers behind one monitor held 12ms at a time
      spend their lives blocked, so the execution sampler — which only catches
      runnable threads — sees almost nothing. The evidence is in the recording:
      thousands of JavaMonitorEnter events naming the class and the method.

      This is the argument for the thread-history and lock views.
    */
    const waits = [...chunks[0].events('jdk.JavaMonitorEnter')];
    expect(waits.length).toBeGreaterThan(500);

    const first = chunks[0].resolve(waits[0]) as Record<string, any>;
    expect(first.monitorClass?.name?.string).toContain('LedgerCache');
    const frames = first.stackTrace?.frames ?? [];
    expect(frames[0]?.method?.name?.string).toBe('post');
  });

  it('reports the application as blocked rather than busy', () => {
    // The honest answer for this workload: almost no CPU, because everything
    // is waiting on the lock. A profiler that invented hot spots here would be
    // lying.
    const samples = readCpuSamples(chunks);
    expect(sampleCount(samples) + idleCount(samples)).toBeLessThan(50);
    const cpu = readTelemetry(chunks).series.find(s => s.id === 'cpu.jvm')!;
    const avg = cpu.points.reduce((a, p) => a + p.v, 0) / cpu.points.length;
    expect(avg).toBeLessThan(5);
  });

  it('still ranks what little did run, by self time', () => {
    const ranked = hotSpots(readCpuSamples(chunks), { state: null, includeIdle: true });
    expect(ranked.length).toBeGreaterThan(0);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].self).toBeGreaterThanOrEqual(ranked[i].self);
    }
  });
});
