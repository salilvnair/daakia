/**
 * Where the CPU went.
 *
 * A profiler's execution samples are the JVM stopping every few milliseconds
 * and writing down what each running thread was doing. Nothing measures a
 * method's duration; the count of samples that caught it IS the measurement,
 * which is why every number here is "samples" and every percentage is of the
 * sample total rather than of wall-clock time.
 *
 * Two numbers per method, and the difference between them is the whole point:
 *
 *   self   — samples where this method was the innermost frame. The CPU was
 *            executing THIS code.
 *   total  — samples where it appeared anywhere in the stack. The CPU was
 *            somewhere underneath it.
 *
 * A method with high total and near-zero self is a caller, and optimising it
 * does nothing. A method with high self is where the time is actually being
 * spent. Reporting one number would make those two indistinguishable, which is
 * the mistake that sends people to rewrite a function that was never the cost.
 */
import type { JfrChunk, JfrValue } from './jfr-chunk';

export interface CpuFrame {
  /** `com.acme.Order.submit`, ready to display. */
  method: string;
  className: string;
  methodName: string;
  /** -1 when the recording has no line for the frame, which happens. */
  line: number;
  /** `Interpreted`, `JIT compiled`, `Inlined` — where the code was running. */
  compilation: string;
}

export interface CpuSample {
  threadName: string;
  /** `STATE_RUNNABLE` and friends, as the recording spells them. */
  state: string;
  atMs: number;
  /** Innermost first, which is the order JFR writes them. */
  frames: CpuFrame[];
}

export interface HotSpot {
  method: string;
  className: string;
  methodName: string;
  /** The line most often seen for this method, or -1. */
  line: number;
  self: number;
  total: number;
  selfPercent: number;
  totalPercent: number;
  /** Which threads ran it, commonest first. */
  threads: { name: string; samples: number }[];
  /**
   * The distinct stacks that reached it, commonest first.
   *
   * The reason this is here rather than in a separate view: "String.equals is
   * 40% of your CPU" is not actionable, and "…and 38% of it arrives through
   * OrderValidator.check" is.
   */
  backtraces: { frames: string[]; samples: number }[];
}

// ── Reading ─────────────────────────────────────────────────────────────────

/** Digs a string out of the nested shape JFR resolves to. */
function str(v: JfrValue | undefined): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && !Array.isArray(v) && 'string' in v) {
    const s = (v as Record<string, JfrValue>).string;
    return typeof s === 'string' ? s : '';
  }
  return '';
}

function num(v: JfrValue | undefined): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  return -1;
}

/**
 * The event types that carry an execution stack.
 *
 * `NativeMethodSample` is the same measurement taken while the thread was in
 * native code; leaving it out makes JNI-heavy work look free.
 */
const SAMPLE_TYPES = ['jdk.ExecutionSample', 'jdk.NativeMethodSample'];

export function readCpuSamples(chunks: JfrChunk[]): CpuSample[] {
  const out: CpuSample[] = [];
  for (const chunk of chunks) {
    for (const typeName of SAMPLE_TYPES) {
      for (const raw of chunk.events(typeName)) {
        const e = chunk.resolve(raw) as Record<string, JfrValue>;
        const thread = e.sampledThread as Record<string, JfrValue> | null;
        const trace = e.stackTrace as Record<string, JfrValue> | null;
        const rawFrames = (trace?.frames as JfrValue[] | undefined) ?? [];

        const frames: CpuFrame[] = [];
        for (const rf of rawFrames) {
          const f = rf as Record<string, JfrValue>;
          const m = f.method as Record<string, JfrValue> | null;
          if (!m) continue;
          const type = m.type as Record<string, JfrValue> | null;
          // JFR writes class names with slashes, as the class file does.
          const className = str(type?.name).replace(/\//g, '.');
          const methodName = str(m.name);
          if (!className && !methodName) continue;
          frames.push({
            className,
            methodName,
            method: `${className}.${methodName}`,
            line: num(f.lineNumber),
            compilation: str((f.type as Record<string, JfrValue> | null)?.description),
          });
        }
        if (!frames.length) continue;

        out.push({
          threadName: str(thread?.javaName) || str(thread?.osName) || 'unknown',
          state: str((e.state as Record<string, JfrValue> | null)?.name),
          atMs: chunk.ticksToMs(BigInt(num(e.startTime))),
          frames,
        });
      }
    }
  }
  return out;
}

// ── Aggregating ─────────────────────────────────────────────────────────────

/**
 * Frames that mean "waiting", even though the thread is RUNNABLE.
 *
 * A selector thread sitting in `EPoll.wait` has an OS thread scheduled, so JFR
 * records its state as runnable and the sampler catches it every time. On a
 * real server that is most of the profile: PetClinic under load came back 78%
 * `EPoll.wait` and 9% `Net.accept` — nearly nine tenths of the answer spent
 * describing idle acceptor threads.
 *
 * Matched on the INNERMOST frame only. A stack that merely passes through
 * networking on its way to real work is real work; a stack that ends in the
 * wait syscall is a thread with nothing to do.
 *
 * Deliberately narrow: only calls whose whole purpose is to block. A blocking
 * `read` is left in, because a thread stuck reading a socket is a finding
 * rather than noise, and hiding it would bury the very problem the thread
 * rules exist to catch.
 */
const IDLE_FRAMES = [
  /^sun\.nio\.ch\.(EPoll|KQueue|DevPoll)\w*\.(wait|poll)$/,
  /^sun\.nio\.ch\.WindowsSelectorImpl.*\.poll$/,
  /^sun\.nio\.ch\.Net\.accept$/,
  /^sun\.nio\.ch\.\w*SocketImpl\.accept0?$/,
  /^java\.net\.\w*SocketImpl\.socketAccept$/,
  /^jdk\.internal\.misc\.Unsafe\.park$/,
  /^java\.lang\.Object\.wait0?$/,
  /^java\.lang\.Thread\.(sleep0?|onSpinWait)$/,
];

/** Whether this sample caught a thread waiting rather than working. */
export function isIdleSample(s: CpuSample): boolean {
  const top = s.frames[0];
  return !!top && IDLE_FRAMES.some(re => re.test(top.method));
}

export interface HotSpotOptions {
  /**
   * Only samples in this state.
   *
   * Defaults to runnable. A thread parked on a queue is sampled too, and
   * counting it as CPU makes an idle pool the hottest thing in the process —
   * the single most misleading answer this view can give.
   */
  state?: string | null;
  /** Backtraces kept per method. The tail is a long list of one-offs. */
  maxBacktraces?: number;
  /**
   * Keep samples whose innermost frame is a wait syscall.
   *
   * Off by default. They are not CPU, and left in they are most of the list on
   * any server that has sockets.
   */
  includeIdle?: boolean;
}

const RUNNABLE = 'STATE_RUNNABLE';

export function hotSpots(samples: CpuSample[], opts: HotSpotOptions = {}): HotSpot[] {
  const wanted = opts.state === undefined ? RUNNABLE : opts.state;
  const byState = wanted ? samples.filter(s => s.state === wanted) : samples;
  const used = opts.includeIdle ? byState : byState.filter(s => !isIdleSample(s));
  const total = used.length;
  if (!total) return [];

  interface Acc {
    className: string; methodName: string;
    self: number; total: number;
    lines: Map<number, number>;
    threads: Map<string, number>;
    traces: Map<string, { frames: string[]; samples: number }>;
  }
  const acc = new Map<string, Acc>();
  const get = (f: CpuFrame): Acc => {
    let a = acc.get(f.method);
    if (!a) {
      a = {
        className: f.className, methodName: f.methodName,
        self: 0, total: 0, lines: new Map(), threads: new Map(), traces: new Map(),
      };
      acc.set(f.method, a);
    }
    return a;
  };

  for (const s of used) {
    const top = s.frames[0];
    const a = get(top);
    a.self++;
    a.threads.set(s.threadName, (a.threads.get(s.threadName) ?? 0) + 1);
    if (top.line >= 0) a.lines.set(top.line, (a.lines.get(top.line) ?? 0) + 1);

    /*
      Counted once per sample, not once per frame.

      A recursive method appears in one stack many times, and adding to `total`
      each time would report more samples than were taken — a percentage over
      100, which is how you learn the number meant nothing.
    */
    const seen = new Set<string>();
    for (const f of s.frames) {
      if (seen.has(f.method)) continue;
      seen.add(f.method);
      get(f).total++;
    }

    // The stack above the innermost frame: how the CPU got here.
    const path = s.frames.slice(1).map(f => f.method);
    const key = path.join('\n');
    const t = a.traces.get(key);
    if (t) t.samples++;
    else a.traces.set(key, { frames: path, samples: 1 });
  }

  const maxTraces = opts.maxBacktraces ?? 5;
  const out: HotSpot[] = [];
  for (const [method, a] of acc) {
    let line = -1;
    let best = 0;
    for (const [ln, n] of a.lines) if (n > best) { best = n; line = ln; }
    out.push({
      method, className: a.className, methodName: a.methodName, line,
      self: a.self, total: a.total,
      selfPercent: (a.self / total) * 100,
      totalPercent: (a.total / total) * 100,
      threads: [...a.threads].map(([name, n]) => ({ name, samples: n }))
        .sort((x, y) => y.samples - x.samples),
      backtraces: [...a.traces.values()]
        .sort((x, y) => y.samples - x.samples).slice(0, maxTraces),
    });
  }

  // Self first: this is the "where is the time going" list, and total-ordering
  // it would put `Thread.run` at the top of every profile ever taken.
  return out.sort((x, y) => y.self - x.self || y.total - x.total);
}

/** The sample total the percentages are against, after every filter. */
export function sampleCount(samples: CpuSample[], opts: HotSpotOptions = {}): number {
  const wanted = opts.state === undefined ? RUNNABLE : opts.state;
  const byState = wanted ? samples.filter(s => s.state === wanted) : samples;
  return opts.includeIdle ? byState.length : byState.filter(s => !isIdleSample(s)).length;
}

/** How many runnable samples were threads waiting on I/O rather than working. */
export function idleCount(samples: CpuSample[], opts: HotSpotOptions = {}): number {
  const wanted = opts.state === undefined ? RUNNABLE : opts.state;
  const byState = wanted ? samples.filter(s => s.state === wanted) : samples;
  return byState.filter(isIdleSample).length;
}
