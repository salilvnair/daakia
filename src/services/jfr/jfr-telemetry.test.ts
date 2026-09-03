import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { JfrChunk } from './jfr-chunk';
import { readTelemetry, groupsOf, type Series } from './jfr-telemetry';

const FIXTURE = join(__dirname, '../../../test/fixtures/jfr/leaky.jfr');
const chunks = JfrChunk.parseAll(readFileSync(FIXTURE));
const telemetry = readTelemetry(chunks);

const find = (id: string): Series | undefined => telemetry.series.find(s => s.id === id);

/**
 * A stand-in chunk. `readTelemetry` only ever asks a chunk for its events, its
 * resolver and its clock, so a stub of those three is enough to drive the parts
 * that cannot be provoked from a real recording — a thread ending mid-run, a
 * counter resetting, two threads sampled in the same round.
 */
function fakeChunk(events: Record<string, Record<string, unknown>[]>): JfrChunk {
  return {
    events: function* (name: string) { yield* (events[name] ?? []); },
    resolve: (v: unknown) => v,
    ticksToMs: (t: bigint) => Number(t),
    startMs: 0,
  } as unknown as JfrChunk;
}

const alloc = (t: number, thread: string, allocated: number) =>
  ({ startTime: BigInt(t), allocated, thread: { javaName: thread } });

describe('readTelemetry', () => {
  it('reads the whole recording as one shared window', () => {
    expect(telemetry.toMs).toBeGreaterThan(telemetry.fromMs);
    // Every point sits inside the window the charts will share.
    for (const s of telemetry.series) {
      for (const p of s.points) {
        expect(p.t).toBeGreaterThanOrEqual(telemetry.fromMs);
        expect(p.t).toBeLessThanOrEqual(telemetry.toMs);
      }
    }
  });

  it('turns CPU fractions into percentages', () => {
    // JFR stores 0.07; nobody reads a CPU chart in fractions of a core-second.
    const machine = find('cpu.machine')!;
    expect(machine.unit).toBe('percent');
    expect(machine.points.length).toBeGreaterThan(10);
    for (const p of machine.points) {
      expect(p.v).toBeGreaterThanOrEqual(0);
      expect(p.v).toBeLessThanOrEqual(100 * 64);   // a very wide machine, still sane
    }
    expect(Math.max(...machine.points.map(p => p.v))).toBeGreaterThan(1);
  });

  it('reports live threads as a reading, not a total', () => {
    const live = find('threads.active')!;
    expect(live.unit).toBe('count');
    // The fixture's app is steady; the point is that it does not climb like a
    // counter would.
    const vs = live.points.map(p => p.v);
    expect(Math.max(...vs) - Math.min(...vs)).toBeLessThan(50);
  });

  it('reports classes currently loaded, not classes ever loaded', () => {
    const loaded = find('classes.loaded')!;
    const raw = [...chunks[0].events('jdk.ClassLoadingStatistics')]
      .map(e => chunks[0].resolve(e) as Record<string, bigint>);
    // These are `long` fields, so they resolve as BigInt — the series carries
    // plain numbers, which is the conversion being checked here too.
    const last = raw[raw.length - 1];
    expect(loaded.points[loaded.points.length - 1].v)
      .toBe(Number(last.loadedClassCount) - Number(last.unloadedClassCount));
  });

  it('shows a cumulative counter as the rate it climbed at', () => {
    /*
      Drawn as-is, `throwables` is a line going up and to the right whatever
      happened — the same picture for an application throwing steadily and one
      that threw a thousand exceptions in a single second and none after.
    */
    const ex = find('exceptions.rate')!;
    // A count rate, not a byte rate — they were one unit, and exceptions were
    // being reported as "2 B/s".
    expect(ex.unit).toBe('perSecond');
    for (const p of ex.points) expect(p.v).toBeGreaterThanOrEqual(0);
    // One fewer point than readings: the first has no interval before it.
    const readings = [...chunks[0].events('jdk.ExceptionStatistics')].length;
    expect(ex.points.length).toBe(readings - 1);
  });

  it('groups the charts in the order the questions get asked', () => {
    const groups = groupsOf(telemetry).map(g => g.group);
    expect(groups[0]).toBe('CPU');
    expect(groups.indexOf('Threads')).toBeLessThan(groups.indexOf('Classes'));
  });

  it('leaves out a series the recording has no events for', () => {
    // No GC ran during the fixture, so there is no GC pause series to draw. An
    // empty chart would imply a measurement that was never taken.
    expect(find('gc.pause')).toBeUndefined();
  });
});

describe('allocation rate', () => {
  it('differences each thread against itself, not against another thread', () => {
    /*
      The bug this exists to prevent. `ThreadAllocationStatistics` is a running
      total PER THREAD, all emitted in the same round. Differencing the events
      in time order subtracts one thread's lifetime total from another's, which
      is not a rate, not a quantity, and not anything.

      Here: two threads, each allocating exactly 1000 bytes over one second.
      The true answer is 2000 B/s. Naive differencing would produce a wild
      number from the 9000-byte gap between the two threads' totals.
    */
    const t = readTelemetry([fakeChunk({
      'jdk.ThreadAllocationStatistics': [
        alloc(0, 'worker-1', 1_000), alloc(0, 'worker-2', 10_000),
        alloc(1000, 'worker-1', 2_000), alloc(1000, 'worker-2', 11_000),
      ],
    })]);
    const rate = t.series.find(s => s.id === 'alloc.rate')!;
    expect(rate.unit).toBe('bytesPerSecond');
    expect(rate.points).toHaveLength(1);
    expect(rate.points[0].v).toBe(2000);
  });

  it('sums threads sampled a few milliseconds apart into one reading', () => {
    const t = readTelemetry([fakeChunk({
      'jdk.ThreadAllocationStatistics': [
        alloc(0, 'a', 0), alloc(20, 'b', 0),
        alloc(1000, 'a', 500), alloc(1020, 'b', 700),
      ],
    })]);
    const rate = t.series.find(s => s.id === 'alloc.rate')!;
    // Both threads cover exactly one second — 20→1020 is the same interval as
    // 0→1000 — and their deltas land in the same bucket.
    expect(rate.points).toHaveLength(1);
    expect(Math.round(rate.points[0].v)).toBe(1200);   // 500/s + 700/s
  });

  it('does not read a vanished thread as a drop to zero', () => {
    // A thread that ends simply stops contributing. Counting its absence as a
    // negative delta would show allocation falling when nothing changed.
    const t = readTelemetry([fakeChunk({
      'jdk.ThreadAllocationStatistics': [
        alloc(0, 'a', 0), alloc(0, 'ends', 5_000),
        alloc(1000, 'a', 1_000),
      ],
    })]);
    const rate = t.series.find(s => s.id === 'alloc.rate')!;
    expect(rate.points[0].v).toBe(1000);
  });

  it('treats a counter that went backwards as a reset, not a negative rate', () => {
    const t = readTelemetry([fakeChunk({
      'jdk.ThreadAllocationStatistics': [
        alloc(0, 'a', 9_000), alloc(1000, 'a', 100),
      ],
    })]);
    const rate = t.series.find(s => s.id === 'alloc.rate')!;
    expect(rate.points[0].v).toBe(0);
  });

  it('has nothing to say about a recording with no telemetry at all', () => {
    const t = readTelemetry([fakeChunk({})]);
    expect(t.series).toEqual([]);
    expect(groupsOf(t)).toEqual([]);
  });
});
