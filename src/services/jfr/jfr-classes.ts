/**
 * Instances per class, over time — JProfiler's class tracker.
 *
 * A heap dump answers "what is in memory right now" and cannot answer "what is
 * GROWING", because one photograph has no direction. `jdk.ObjectCount` is a
 * census taken at a chunk boundary, and several of them in a row is the shape
 * a leak actually has: a class whose instance count only ever goes up, next to
 * forty whose counts sawtooth around a steady mean, which is what healthy
 * allocation looks like.
 *
 * The catch worth knowing before reading anything here: this event is OFF in
 * every stock setting, `profile` included, because producing it forces a full
 * heap inspection GC at every chunk. A recording taken the ordinary way has
 * none of these events at all, and that is not a parsing failure — so the view
 * says which it is rather than rendering an empty chart.
 */
import type { JfrChunk, JfrValue } from './jfr-chunk';
import { text as str } from './jfr-text';
import { readableClassName as readableClass } from '../jvm-class-name';

export interface ClassPoint {
  atMs: number;
  gcId: number;
  count: number;
  bytes: number;
}

export interface ClassSeries {
  className: string;
  points: ClassPoint[];
  /** The census with the most instances. */
  peakCount: number;
  /** Instances at the last census, which is where it ended up. */
  lastCount: number;
  lastBytes: number;
  /**
   * Last minus first, in instances.
   *
   * The number the whole view exists for. Positive and large next to a flat
   * neighbour is a collection that is not being drained.
   */
  growth: number;
  /** Same, as a share of where it started. -1 when it started at zero. */
  growthPercent: number;
}

export interface ClassCensus {
  /** Distinct census points, oldest first — the x-axis every series shares. */
  times: { atMs: number; gcId: number }[];
  series: ClassSeries[];
  /** False when the recording carries no ObjectCount events at all. */
  present: boolean;
}

export interface ClassCensusOptions {
  /** Series kept, by growth then by size. A census lists every live class. */
  limit?: number;
}

export function readClassCensus(
  chunks: JfrChunk[],
  opts: ClassCensusOptions = {},
): ClassCensus {
  const byClass = new Map<string, ClassPoint[]>();
  const times = new Map<number, number>();   // gcId -> atMs

  for (const chunk of chunks) {
    for (const raw of chunk.events('jdk.ObjectCount')) {
      const e = chunk.resolve(raw) as Record<string, JfrValue>;
      const className = readableClass(str(e.objectClass));
      if (!className) continue;

      const gcId = typeof e.gcId === 'number' ? e.gcId : Number(e.gcId ?? -1);
      const atMs = typeof e.startTime === 'bigint'
        ? chunk.ticksToMs(e.startTime)
        : Number(e.startTime ?? 0);
      const count = Number(e.count ?? 0);
      const bytes = Number(e.totalSize ?? 0);

      if (!times.has(gcId)) times.set(gcId, atMs);
      const list = byClass.get(className);
      const point = { atMs, gcId, count, bytes };
      if (list) list.push(point); else byClass.set(className, [point]);
    }
  }

  if (!byClass.size) return { times: [], series: [], present: false };

  const ordered = [...times].sort((a, b) => a[1] - b[1]);
  const firstCensus = ordered[0][0];

  const series: ClassSeries[] = [...byClass].map(([className, points]) => {
    points.sort((a, b) => a.atMs - b.atMs);
    const first = points[0];
    const last = points[points.length - 1];

    /*
      A class absent from a census had zero instances, not "no reading".

      Subtracting the first POINT from the last is only right when the class
      was there at the start. A class that did not exist at the first census
      and holds two million instances at the last has one point, so
      `last - first` is zero — and the biggest, newest thing in the heap sorts
      to the bottom of a view whose entire job is finding it. That is exactly
      what the fixture showed: CountLoad's three classes, absent at the first
      census, all reported as flat.
    */
    const startedAtFirst = first.gcId === firstCensus;
    const baseline = startedAtFirst ? first.count : 0;
    const growth = last.count - baseline;
    return {
      className, points,
      peakCount: points.reduce((m, p) => Math.max(m, p.count), 0),
      lastCount: last.count,
      lastBytes: last.bytes,
      growth,
      /*
        A class absent from the first census and present later has no baseline
        to divide by. Reporting Infinity, or 100%, would rank it against
        classes whose percentages mean something; -1 says "no ratio here" and
        lets the caller sort on the absolute instead.
      */
      growthPercent: baseline > 0 ? (growth / baseline) * 100 : -1,
    };
  });

  /*
    Ranked by growth, not by size.

    Sorting on instance count puts `java.lang.String` and `byte[]` at the top
    of every recording ever taken, which is true and useless. The question this
    view answers is which class is not coming back down.
  */
  series.sort((a, b) => (b.growth - a.growth) || (b.lastBytes - a.lastBytes));

  return {
    times: ordered.map(([gcId, atMs]) => ({ gcId, atMs })),
    series: series.slice(0, opts.limit ?? 40),
    present: true,
  };
}
