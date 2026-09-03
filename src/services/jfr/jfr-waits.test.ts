import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { JfrChunk } from './jfr-chunk';
import { readWaits, readGc } from './jfr-waits';
import { readAllocation, readableClass } from './jfr-allocation';
import { text, dotted } from './jfr-text';

/*
  Graded against a workload built with known faults.

  `under-load.jfr` is 30s of six workers contending on one monitor held across
  a 12ms sleep, allocating 256KB per order, with a quadratic string builder on
  the hot path. The CPU view finds almost none of that, because the threads are
  blocked rather than running — these are the views that do.
*/
const FIXTURE = join(__dirname, '../../../test/fixtures/jfr/under-load.jfr');
const chunks = JfrChunk.parseAll(readFileSync(FIXTURE));

describe('readWaits', () => {
  const waits = readWaits(chunks);

  it('finds the contended lock, and names it', () => {
    const top = waits.sites[0];
    expect(top.kind).toBe('monitor');
    expect(top.target).toBe('OrderLoad$LedgerCache');
    expect(top.count).toBeGreaterThan(1_000);
  });

  it('points at the method that blocked, not the JDK frame that implements blocking', () => {
    // `Object.wait` is where every monitor wait happens and says nothing. The
    // frame below it is the line someone can actually go and change.
    const top = waits.sites[0];
    expect(top.site).toBe('OrderLoad$LedgerCache.post');
    expect(top.site).not.toMatch(/^(java|jdk|sun)\./);
  });

  it('names who was holding the lock', () => {
    /*
      The field no other artifact can give you. A thread dump is one instant
      and shows the holder only if you happened to catch it mid-hold; here
      every wait records the thread it was waiting on.
    */
    const top = waits.sites[0];
    expect(top.blockedBy.length).toBeGreaterThan(1);
    expect(top.blockedBy[0].name).toMatch(/order-worker/);
    expect(top.blockedBy[0].count).toBeGreaterThan(50);
  });

  it('ranks by total blocked time, not by how often it happened', () => {
    // A lock taken ten thousand times for a microsecond is a non-event; one
    // taken twice for six seconds is an outage.
    for (let i = 1; i < waits.sites.length; i++) {
      expect(waits.sites[i - 1].totalMs).toBeGreaterThanOrEqual(waits.sites[i].totalMs);
    }
  });

  it('reports blocked time that exceeds the recording, because it does', () => {
    /*
      Six threads blocked for most of thirty seconds is about 150 thread-
      seconds inside a 30-second window. That is not a bug in the arithmetic
      and the view has to say so, or the number reads as impossible.
    */
    expect(waits.totalMs).toBeGreaterThan(waits.wallMs);
    expect(waits.wallMs).toBeGreaterThan(0);
  });

  it('keeps every thread that waited, and what it cost each of them', () => {
    const top = waits.sites[0];
    expect(top.threads.length).toBe(6);
    expect(top.threads[0].totalMs).toBeGreaterThan(0);
    const summed = top.threads.reduce((a, t) => a + t.totalMs, 0);
    expect(Math.round(summed)).toBe(Math.round(top.totalMs));
  });

  it('drops the short waits when asked', () => {
    const long = readWaits(chunks, { minMs: 50 });
    expect(long.count).toBeLessThan(waits.count);
    for (const s of long.sites) expect(s.maxMs).toBeGreaterThanOrEqual(50);
  });

  it('separates real contention from an idle application', () => {
    /*
      An idle JVM is not a JVM with no waits, and not even one with no monitor
      events — it has housekeeping threads parked for the length of the
      recording, and the odd incidental lock. What it does not have is
      CONTENTION, and the difference is one of scale rather than of kind:

        idle       1 monitor wait,    32ms blocked
        under load 2,449 monitor waits, 149,330ms blocked

      So the assertion is the ratio, not the presence. A view that flagged the
      idle recording's single 32ms wait would cry wolf on every healthy
      application it was ever pointed at.
    */
    const idle = readWaits(
      JfrChunk.parseAll(readFileSync(join(__dirname, '../../../test/fixtures/jfr/leaky.jfr'))));
    const blocked = (w: ReturnType<typeof readWaits>) =>
      w.sites.filter(s => s.kind === 'monitor').reduce((a, s) => a + s.totalMs, 0);

    expect(blocked(idle)).toBeLessThan(100);
    expect(blocked(waits)).toBeGreaterThan(blocked(idle) * 1000);
    // And the idle one is a rounding error against its own recording length,
    // which is the test a view would actually apply.
    expect(blocked(idle) / idle.wallMs).toBeLessThan(0.01);
    expect(blocked(waits) / waits.wallMs).toBeGreaterThan(1);
  });
});

describe('readGc', () => {
  const gc = readGc(chunks);

  it('counts the collections and what they cost', () => {
    expect(gc.count).toBeGreaterThan(100);
    expect(gc.totalPauseMs).toBeGreaterThan(0);
    expect(gc.maxPauseMs).toBeGreaterThan(0);
  });

  it('says what share of the recording was spent stopped', () => {
    // The number that decides whether GC is worth reading about at all. This
    // workload allocates hard and still only pauses for a fraction of a
    // percent, which is the honest answer: the problem is elsewhere.
    expect(gc.pausePercent).toBeGreaterThan(0);
    expect(gc.pausePercent).toBeLessThan(10);
  });

  it('groups by cause and by collector', () => {
    expect(gc.byCause[0].cause).toBe('Allocation Failure');
    expect(gc.byCollector[0].name).toBe('DefNew');
  });
});

describe('readAllocation', () => {
  const alloc = readAllocation(chunks);

  it('finds the allocation the heap dump could never point at', () => {
    /*
      A .hprof says what is on the heap and who holds it. It cannot say which
      LINE made it — jcmd and jmap write serial 0 for every object, because
      recording allocation sites means recording every `new`.
    */
    const top = alloc.sites[0];
    expect(top.site).toBe('OrderLoad.validateSlow:46');
    expect(top.objectClass).toBe('byte[]');
  });

  it('finds the second allocation site too, by weight not by count', () => {
    const enrich = alloc.sites.find(s => s.site.startsWith('OrderLoad.enrich'))!;
    expect(enrich).toBeDefined();
    expect(enrich.bytes).toBeGreaterThan(100 * 1024 * 1024);
  });

  it('ranks by estimated bytes, so a big rare object beats a small frequent one', () => {
    // Counting samples would make a 16-byte object caught twice heavier than a
    // 4MB array caught once.
    expect(alloc.weighted).toBe(true);
    for (let i = 1; i < alloc.sites.length; i++) {
      expect(alloc.sites[i - 1].bytes).toBeGreaterThanOrEqual(alloc.sites[i].bytes);
    }
  });

  it('says who allocated and how they got there', () => {
    const top = alloc.sites[0];
    expect(top.threads.length).toBeGreaterThan(0);
    expect(top.stacks[0].frames.length).toBeGreaterThan(1);
  });
});

describe('readableClass', () => {
  it('turns JVM descriptors into what a person would write', () => {
    // `[B` at the top of an allocation profile is the least readable thing
    // this view could show.
    expect(readableClass('[B')).toBe('byte[]');
    expect(readableClass('[[I')).toBe('int[][]');
    expect(readableClass('[Ljava/lang/String;')).toBe('java.lang.String[]');
    expect(readableClass('java/lang/Object')).toBe('java.lang.Object');
  });
});

describe('text', () => {
  it('reads a label out of every shape the recording uses for one', () => {
    // Each of these is a different type in the JDK's own metadata, and getting
    // it wrong is quiet: the row renders with a blank column.
    expect(text({ string: 'sym' })).toBe('sym');
    expect(text({ name: { string: 'java/lang/Object' } })).toBe('java/lang/Object');
    expect(text({ cause: 'Allocation Failure' })).toBe('Allocation Failure');
    expect(text({ name: 'DefNew' })).toBe('DefNew');
    expect(text({ javaName: 'worker-1' })).toBe('worker-1');
    expect(dotted({ name: { string: 'java/lang/Object' } })).toBe('java.lang.Object');
  });

  it('gives up rather than looping on a value that points at itself', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.name = cyclic;
    expect(text(cyclic as never)).toBe('');
  });

  it('has nothing to say about an absent value', () => {
    expect(text(undefined)).toBe('');
    expect(text(null)).toBe('');
    expect(text([])).toBe('');
  });
});
