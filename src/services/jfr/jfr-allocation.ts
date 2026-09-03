/**
 * What is being allocated, and the line that allocated it.
 *
 * This is the one thing a heap dump structurally cannot tell you. HPROF has
 * records for allocation stacks, but `jcmd` and `jmap` write serial 0 for every
 * object, because tracking allocation sites means recording every `new` and no
 * production JVM runs that way. A dump answers "what is on the heap and who
 * holds it"; only a recording answers "which line made it".
 *
 * `jdk.ObjectAllocationSample` is a sampled event, and the sampling is the part
 * that has to be handled honestly. Each sample carries a `weight`: the JVM's
 * estimate of how many bytes that one sample stands for. Counting samples
 * treats a 16-byte object caught twice as heavier than a 4MB array caught once,
 * so the ranking here is by weight, and the units say "estimated" because they
 * are.
 */
import type { JfrChunk, JfrValue } from './jfr-chunk';
import { text as str } from './jfr-text';

export interface AllocSite {
  /** The type being allocated, e.g. `byte[]`. */
  objectClass: string;
  /** The frame that allocated it — the line to go and change. */
  site: string;
  /** Estimated bytes attributable to this site, from the JVM's own weights. */
  bytes: number;
  /** How many samples landed here; the confidence behind the estimate. */
  samples: number;
  threads: { name: string; samples: number }[];
  /** How the allocation was reached, commonest first. */
  stacks: { frames: string[]; samples: number }[];
}

export interface Allocation {
  sites: AllocSite[];
  totalBytes: number;
  samples: number;
  /** True when the JVM told us the estimate, rather than us counting samples. */
  weighted: boolean;
}

function num(v: JfrValue | undefined): number {
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'number') return v;
  return 0;
}

/**
 * `[B` → `byte[]`, `[Ljava/lang/String;` → `java.lang.String[]`.
 *
 * JFR writes the JVM's internal descriptor, and `[B` at the top of an
 * allocation profile is the single least readable thing this view could show.
 */
export function readableClass(raw: string): string {
  let dims = 0;
  let s = raw;
  while (s.startsWith('[')) { dims++; s = s.slice(1); }
  const primitives: Record<string, string> = {
    B: 'byte', C: 'char', D: 'double', F: 'float',
    I: 'int', J: 'long', S: 'short', Z: 'boolean',
  };
  if (dims && s.length === 1 && primitives[s]) s = primitives[s];
  else if (s.startsWith('L') && s.endsWith(';')) s = s.slice(1, -1);
  return s.replace(/\//g, '.') + '[]'.repeat(dims);
}

function framesOf(e: Record<string, JfrValue>): string[] {
  const trace = e.stackTrace as Record<string, JfrValue> | null;
  const raw = (trace?.frames as JfrValue[] | undefined) ?? [];
  const out: string[] = [];
  for (const rf of raw) {
    const f = rf as Record<string, JfrValue>;
    const m = f.method as Record<string, JfrValue> | null;
    if (!m) continue;
    const cls = str((m.type as Record<string, JfrValue> | null)?.name).replace(/\//g, '.');
    const name = str(m.name);
    const line = typeof f.lineNumber === 'number' ? f.lineNumber : -1;
    out.push(line >= 0 ? `${cls}.${name}:${line}` : `${cls}.${name}`);
  }
  return out;
}

const ALLOC_TYPES = ['jdk.ObjectAllocationSample', 'jdk.ObjectAllocationInNewTLAB', 'jdk.ObjectAllocationOutsideTLAB'];

export function readAllocation(chunks: JfrChunk[], maxStacks = 3): Allocation {
  interface Acc {
    objectClass: string; site: string;
    bytes: number; samples: number;
    threads: Map<string, number>;
    stacks: Map<string, { frames: string[]; samples: number }>;
  }
  const acc = new Map<string, Acc>();
  let totalBytes = 0;
  let samples = 0;
  let weighted = false;

  for (const chunk of chunks) {
    for (const type of ALLOC_TYPES) {
      for (const raw of chunk.events(type)) {
        const e = chunk.resolve(raw) as Record<string, JfrValue>;
        /*
          `weight` on the sampled event, `allocationSize` on the TLAB events.

          Falling back to 1 rather than 0 keeps a recording made with a setting
          that carries neither from ranking everything equally at zero — the
          list is then by sample count, which `weighted` says.
        */
        const w = num(e.weight) || num(e.allocationSize) || num(e.tlabSize);
        if (num(e.weight) > 0) weighted = true;
        const bytes = w || 1;

        const frames = framesOf(e);
        // The first frame outside the JDK: `Arrays.copyOf` allocating is
        // never the answer, the code that called it is.
        const site = frames.find(f => !/^(java|jdk|sun|javax)\./.test(f)) ?? frames[0] ?? 'unknown';
        const objectClass = readableClass(str(e.objectClass));
        const key = `${objectClass} ${site}`;

        let a = acc.get(key);
        if (!a) {
          a = { objectClass, site, bytes: 0, samples: 0, threads: new Map(), stacks: new Map() };
          acc.set(key, a);
        }
        a.bytes += bytes;
        a.samples++;
        totalBytes += bytes;
        samples++;

        const thread = str(e.eventThread) || 'unknown';
        a.threads.set(thread, (a.threads.get(thread) ?? 0) + 1);

        const above = frames.slice(0, 12);
        const sk = above.join('\n');
        const st = a.stacks.get(sk);
        if (st) st.samples++;
        else a.stacks.set(sk, { frames: above, samples: 1 });
      }
    }
  }

  const sites: AllocSite[] = [...acc.values()].map(a => ({
    objectClass: a.objectClass, site: a.site,
    bytes: a.bytes, samples: a.samples,
    threads: [...a.threads].map(([name, n]) => ({ name, samples: n }))
      .sort((x, y) => y.samples - x.samples),
    stacks: [...a.stacks.values()].sort((x, y) => y.samples - x.samples).slice(0, maxStacks),
  })).sort((x, y) => y.bytes - x.bytes);

  return { sites, totalBytes, samples, weighted };
}
