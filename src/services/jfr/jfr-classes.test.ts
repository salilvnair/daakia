/**
 * Read against `objcount.jfr`, recorded from `CountLoad.java` beside it with
 * `jdk.ObjectCount#enabled=true` — which is off in every stock setting,
 * `profile` included, because it forces a full heap inspection GC per chunk.
 *
 * The program's shape is the ground truth: it holds one `Order` per iteration,
 * one `Line` every other, one `Address` every fifth, and never releases any of
 * them. So Order must grow, and must grow faster than Line.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { JfrChunk } from './jfr-chunk';
import { readClassCensus } from './jfr-classes';

const load = (f: string) =>
  JfrChunk.parseAll(readFileSync(join(__dirname, '../../../test/fixtures/jfr/', f)));

describe('readClassCensus', () => {
  const census = readClassCensus(load('objcount.jfr'));

  it('finds the censuses', () => {
    expect(census.present).toBe(true);
    expect(census.times.length).toBeGreaterThan(1);
    // Oldest first, because every series is plotted against this axis.
    for (let i = 1; i < census.times.length; i++) {
      expect(census.times[i].atMs).toBeGreaterThanOrEqual(census.times[i - 1].atMs);
    }
  });

  it('ranks by growth rather than by size', () => {
    /*
      Sorting on instance count puts String and byte[] at the top of every
      recording ever taken — true, and useless. The class that is not coming
      back down is the answer.
    */
    const top = census.series.slice(0, 6).map(s => s.className);
    expect(top.some(n => /CountLoad\$Order/.test(n))).toBe(true);
  });

  it('sees the growth the program actually has', () => {
    const order = census.series.find(s => /CountLoad\$Order$/.test(s.className));
    const line = census.series.find(s => /CountLoad\$Line$/.test(s.className));
    expect(order, 'Order').toBeDefined();
    expect(line, 'Line').toBeDefined();

    expect(order!.growth).toBeGreaterThan(0);
    // CountLoad holds one Order per iteration and one Line every other, so
    // Order must outgrow Line — a fact about the source, not about this parser.
    expect(order!.growth).toBeGreaterThan(line!.growth);
    expect(order!.lastCount).toBeGreaterThan(line!.lastCount);
  });

  it('keeps points in time order within a series', () => {
    for (const s of census.series) {
      for (let i = 1; i < s.points.length; i++) {
        expect(s.points[i].atMs, s.className).toBeGreaterThanOrEqual(s.points[i - 1].atMs);
      }
    }
  });

  it('treats a class absent from a census as zero, not as flat', () => {
    /*
      The bug the fixture found. CountLoad's three classes do not exist at the
      first census and hold millions of instances at the last, so they have a
      single point each — and `last - first` reported them as FLAT, sorting the
      biggest new thing in the heap to the bottom of the view whose only job is
      finding it. Absent means zero.
    */
    const order = census.series.find(s => /CountLoad\$Order$/.test(s.className))!;
    expect(order.points).toHaveLength(1);
    expect(order.growth).toBe(order.lastCount);
    expect(order.growth).toBeGreaterThan(0);
  });

  it('holds the ratio the program actually allocates', () => {
    // CountLoad adds an Order every iteration, a Line every second and an
    // Address every fifth. The census must show 1 : 1/2 : 1/5.
    const n = (re: RegExp) => census.series.find(s => re.test(s.className))!.lastCount;
    const order = n(/CountLoad\$Order$/);
    expect(n(/CountLoad\$Line$/) / order).toBeCloseTo(0.5, 2);
    expect(n(/CountLoad\$Address$/) / order).toBeCloseTo(0.2, 2);
  });

  it('refuses to invent a ratio with no baseline', () => {
    // A class absent from the first census divides by zero. -1 says "no ratio",
    // rather than Infinity ranking it above everything real.
    for (const s of census.series) {
      expect(Number.isFinite(s.growthPercent), s.className).toBe(true);
    }
  });

  it('says a recording without the event is empty, not broken', () => {
    /*
      The distinction the view depends on. `under-load.jfr` is a normal
      `settings=profile` recording and contains no ObjectCount at all — that is
      a recording that never asked the question, not a parse failure.
    */
    const none = readClassCensus(load('under-load.jfr'));
    expect(none.present).toBe(false);
    expect(none.series).toHaveLength(0);
  });

  it('is bounded — a census lists every live class', () => {
    expect(readClassCensus(load('objcount.jfr'), { limit: 5 }).series).toHaveLength(5);
  });
});
