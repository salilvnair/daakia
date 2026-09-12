/**
 * The recording as a set of time series.
 *
 * This is the axis everything else hangs from. A hot spot tells you where the
 * CPU was; the telemetry tells you *when* it mattered — that the spike was at
 * second 14, that the heap never came down, that threads climbed while classes
 * did not. Every other view is a slice of a moment on this timeline.
 *
 * The one thing that has to be right is the difference between a gauge and a
 * counter. `activeCount` is a reading: 10 threads, now. `throwables` is a
 * running total that only ever climbs, and drawing it as-is produces a line
 * going up and to the right no matter what happened — the same picture for an
 * application throwing steadily and one that threw a thousand exceptions in a
 * single second and none afterwards. Counters are differenced into rates, and
 * the type is recorded so nothing downstream has to guess.
 */
import type { JfrChunk, JfrValue } from './jfr-chunk';

/**
 * `perSecond` counts things; `bytesPerSecond` measures throughput.
 *
 * They were one unit, and the formatter rendered both as bytes — so an
 * application throwing two exceptions a second reported "2 B/s", which is not
 * a wrong number so much as a wrong kind of thing.
 */
export type SeriesUnit =
  | 'percent' | 'bytes' | 'count' | 'perSecond' | 'bytesPerSecond' | 'ms';

export interface SeriesPoint { t: number; v: number }

export interface Series {
  id: string;
  label: string;
  /** Series sharing a group are drawn on one chart, on one scale. */
  group: string;
  unit: SeriesUnit;
  points: SeriesPoint[];
}

export interface Telemetry {
  series: Series[];
  /** The window every chart shares, so they line up. */
  fromMs: number;
  toMs: number;
}

function num(v: JfrValue | undefined): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  return undefined;
}

/** One reading per event, pulled out by a field extractor. */
function collect(
  chunks: JfrChunk[],
  typeName: string,
  pick: (e: Record<string, JfrValue>) => number | undefined,
): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (const chunk of chunks) {
    for (const raw of chunk.events(typeName)) {
      const start = num(raw.startTime);
      if (start === undefined) continue;
      const v = pick(raw);
      if (v === undefined || !Number.isFinite(v)) continue;
      out.push({ t: chunk.ticksToMs(BigInt(start)), v });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/**
 * A running total, as the rate it was climbing at.
 *
 * The first point is dropped rather than shown as zero: there is no interval
 * before it, so its rate is unknown, and a zero would read as "nothing was
 * happening then" — which is a claim the recording does not make.
 */
function rate(points: SeriesPoint[]): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (let i = 1; i < points.length; i++) {
    const dt = (points[i].t - points[i - 1].t) / 1000;
    if (dt <= 0) continue;
    const dv = points[i].v - points[i - 1].v;
    // A counter that went backwards was reset, or is a different counter — a
    // negative rate is never a true reading.
    out.push({ t: points[i].t, v: dv < 0 ? 0 : dv / dt });
  }
  return out;
}

/**
 * Bytes allocated per second, across the whole JVM.
 *
 * `jdk.ThreadAllocationStatistics` is a running total PER THREAD, and every
 * thread's event is emitted in the same sampling round. Differencing the
 * events in time order therefore subtracts one thread's lifetime total from
 * another's — which is not a rate, not a quantity, and not anything. It also
 * silently collapses to almost no points, because events sharing a timestamp
 * have no interval between them.
 *
 * So each thread is differenced against its own previous reading, and the
 * deltas landing in the same round are summed. A thread that ends stops
 * contributing rather than counting as a drop to zero.
 */
function allocationRate(chunks: JfrChunk[]): SeriesPoint[] {
  const perThread = new Map<string, SeriesPoint[]>();
  for (const chunk of chunks) {
    for (const raw of chunk.events('jdk.ThreadAllocationStatistics')) {
      const e = chunk.resolve(raw) as Record<string, JfrValue>;
      const start = num(raw.startTime);
      const allocated = num(e.allocated);
      if (start === undefined || allocated === undefined) continue;
      const thread = e.thread as Record<string, JfrValue> | null;
      const name = (typeof thread?.javaName === 'string' && thread.javaName)
        || (typeof thread?.osName === 'string' && thread.osName) || 'unknown';
      const list = perThread.get(name);
      const point = { t: chunk.ticksToMs(BigInt(start)), v: allocated };
      if (list) list.push(point); else perThread.set(name, [point]);
    }
  }

  // Rounds are a second apart; bucketing to the second is what lets threads
  // sampled a few milliseconds apart add up as one reading.
  const buckets = new Map<number, number>();
  for (const points of perThread.values()) {
    points.sort((a, b) => a.t - b.t);
    for (const p of rate(points)) {
      const key = Math.round(p.t / 1000) * 1000;
      buckets.set(key, (buckets.get(key) ?? 0) + p.v);
    }
  }
  return [...buckets].map(([t, v]) => ({ t, v })).sort((a, b) => a.t - b.t);
}

export function readTelemetry(chunks: JfrChunk[]): Telemetry {
  const series: Series[] = [];
  const add = (
    id: string, label: string, group: string, unit: SeriesUnit, points: SeriesPoint[],
  ) => { if (points.length) series.push({ id, label, group, unit, points }); };

  // ── CPU ── fractions of one core-second, which nobody reads as 0.07.
  const pct = (f: number | undefined) => (f === undefined ? undefined : f * 100);
  add('cpu.jvm', 'JVM', 'CPU', 'percent',
    collect(chunks, 'jdk.CPULoad', e => {
      const u = num(e.jvmUser); const s = num(e.jvmSystem);
      return u === undefined || s === undefined ? undefined : (u + s) * 100;
    }));
  add('cpu.machine', 'Machine', 'CPU', 'percent',
    collect(chunks, 'jdk.CPULoad', e => pct(num(e.machineTotal))));

  // ── Heap ──
  add('heap.used', 'Used', 'Heap', 'bytes',
    collect(chunks, 'jdk.GCHeapMemoryUsage', e => num(e.used)));
  add('heap.committed', 'Committed', 'Heap', 'bytes',
    collect(chunks, 'jdk.GCHeapMemoryUsage', e => num(e.committed)));

  // ── Threads ──
  add('threads.active', 'Live', 'Threads', 'count',
    collect(chunks, 'jdk.JavaThreadStatistics', e => num(e.activeCount)));
  add('threads.daemon', 'Daemon', 'Threads', 'count',
    collect(chunks, 'jdk.JavaThreadStatistics', e => num(e.daemonCount)));
  add('threads.peak', 'Peak', 'Threads', 'count',
    collect(chunks, 'jdk.JavaThreadStatistics', e => num(e.peakCount)));

  /*
    Classes currently loaded, not classes ever loaded.

    Both counters are cumulative, and their difference is the only one of the
    three numbers that answers the question people bring here: is this
    application still loading classes long after startup, or leaking loaders.
  */
  add('classes.loaded', 'Loaded', 'Classes', 'count',
    collect(chunks, 'jdk.ClassLoadingStatistics', e => {
      const l = num(e.loadedClassCount); const u = num(e.unloadedClassCount);
      return l === undefined ? undefined : l - (u ?? 0);
    }));

  // ── Exceptions ── a total that only climbs, shown as the rate it climbed at.
  add('exceptions.rate', 'Thrown', 'Exceptions', 'perSecond',
    rate(collect(chunks, 'jdk.ExceptionStatistics', e => num(e.throwables))));

  // ── GC ── every collection, as the pause it cost.
  add('gc.pause', 'Pause', 'GC pauses', 'ms',
    collect(chunks, 'jdk.GarbageCollection', e => {
      const d = num(e.duration);
      return d === undefined ? undefined : d / 1_000_000;   // nanos → ms
    }));

  /*
    Safepoints, which are pauses the GC did not cause.

    A stop-the-world that does not appear in the GC chart is the one people
    cannot otherwise account for — biased-lock revocation, a deoptimisation, a
    thread dump someone took while this was recording.
  */
  add('safepoint.pause', 'Safepoint', 'GC pauses', 'ms',
    collect(chunks, 'jdk.SafepointBegin', e => {
      const d = num(e.duration);
      return d === undefined ? undefined : d / 1_000_000;
    }));

  // ── Allocation ── bytes per second, summed across threads.
  add('alloc.rate', 'Allocated', 'Allocation', 'bytesPerSecond', allocationRate(chunks));

  const times = series.flatMap(s => s.points.map(p => p.t));
  const fromMs = times.length ? Math.min(...times) : (chunks[0]?.startMs ?? 0);
  const toMs = times.length ? Math.max(...times) : fromMs;
  return { series, fromMs, toMs };
}

/** The charts, in the order they answer questions. */
export function groupsOf(t: Telemetry): { group: string; series: Series[] }[] {
  const order = ['CPU', 'Heap', 'Threads', 'GC pauses', 'Allocation', 'Classes', 'Exceptions'];
  const byGroup = new Map<string, Series[]>();
  for (const s of t.series) {
    const g = byGroup.get(s.group);
    if (g) g.push(s); else byGroup.set(s.group, [s]);
  }
  return [...byGroup].sort(
    (a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99),
  ).map(([group, series]) => ({ group, series }));
}
