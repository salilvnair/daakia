/**
 * Can this pod survive a heap dump?
 *
 * The question matters because the answer is often no, and the failure mode is
 * brutal: you take a dump to diagnose a memory problem, the dump pushes the pod
 * over its limit, the kernel OOM-kills it, and you have destroyed the evidence
 * and the service in one click. Someone doing this at 3am on a production pod
 * deserves to be told before, not after.
 *
 * Three things actually push a pod over during a dump:
 *
 *   1. The file itself, when /tmp is tmpfs. This is the one that surprises
 *      people. A tmpfs write is a MEMORY write and counts against the
 *      container's limit, so dumping a 6GB heap to /tmp adds 6GB to the pod's
 *      accounting and kills it instantly. It is also very common — plenty of
 *      base images mount /tmp as tmpfs, and nothing about the dump command
 *      hints at it.
 *   2. The JVM's own overhead. GC.heap_dump does a full GC first and needs
 *      working room for it.
 *   3. Whatever headroom was already gone. A pod sitting at 95% of its limit
 *      has nothing left to give, whatever the dump costs.
 *
 * So the assessment needs the limit, the current usage, the heap size, and
 * where the file would land. Any of them may be unavailable — metrics-server
 * may be absent, the JVM may not answer — and the honest response to a missing
 * input is to say so, not to guess and wave the dump through.
 */
import { run } from './kubectl';

export interface MemoryProfile {
  /** resources.limits.memory, in bytes. Absent means the pod is unbounded. */
  limitBytes?: number;
  /** resources.requests.memory, in bytes. */
  requestBytes?: number;
  /** Current working set from metrics-server. Absent when it is not installed. */
  usageBytes?: number;
  /** -Xmx, from the JVM's own flags where we could ask. */
  maxHeapBytes?: number;
  /** -Xms. */
  initialHeapBytes?: number;
  /** Heap actually in use right now, from GC.heap_info. */
  usedHeapBytes?: number;
  /**
   * Whether the directory the dump would be written to is memory-backed.
   * `true` is the dangerous case and the whole reason this check exists.
   */
  dumpDirIsTmpfs?: boolean;
  /** Free bytes on the dump directory's filesystem. */
  dumpDirFreeBytes?: number;
  /** What could not be determined, and why. Shown rather than hidden. */
  unknowns: string[];
}

export type SafetyVerdict = 'safe' | 'tight' | 'unsafe' | 'unknown';

export interface HeapDumpSafety {
  verdict: SafetyVerdict;
  /** One line, in plain language, on why. */
  headline: string;
  /** The specific concerns, worst first. */
  reasons: string[];
  /** Best estimate of what the dump will cost the pod, in bytes. */
  estimatedCostBytes?: number;
  /** Bytes between current usage and the limit. */
  headroomBytes?: number;
  /** Usage as a fraction of the limit, when both are known. */
  usedFraction?: number;
}

// ── Parsing ─────────────────────────────────────────────────────────────────

/**
 * Kubernetes quantities: `512Mi`, `2Gi`, `1500m`, `1e3`, plain bytes.
 *
 * The binary suffixes (Ki/Mi/Gi) are powers of 1024 and the decimal ones
 * (K/M/G) are powers of 1000. Treating `1G` as 1073741824 overstates a limit
 * by 7%, which is exactly the margin this check is trying to reason about.
 */
export function parseQuantity(q?: string): number | undefined {
  if (!q) return undefined;
  const m = /^([0-9.]+)([EPTGMK]i?|[munp])?$/.exec(q.trim());
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return undefined;

  switch (m[2]) {
    case 'Ki': return n * 1024;
    case 'Mi': return n * 1024 ** 2;
    case 'Gi': return n * 1024 ** 3;
    case 'Ti': return n * 1024 ** 4;
    case 'Pi': return n * 1024 ** 5;
    case 'Ei': return n * 1024 ** 6;
    case 'K': return n * 1000;
    case 'M': return n * 1000 ** 2;
    case 'G': return n * 1000 ** 3;
    case 'T': return n * 1000 ** 4;
    case 'P': return n * 1000 ** 5;
    case 'E': return n * 1000 ** 6;
    // Fractional suffixes appear on CPU, not memory, but a stray one must not
    // be read as whole bytes.
    case 'm': return n / 1000;
    case 'u': return n / 1000 ** 2;
    case 'n': return n / 1000 ** 3;
    case 'p': return n / 1000 ** 4;
    default: return n;
  }
}

/** `-Xmx6g`, `-Xmx6144m`, `-Xmx6291456k`, `-Xmx6442450944`. */
export function parseXFlag(args: string, flag: 'Xmx' | 'Xms'): number | undefined {
  const m = new RegExp(`-${flag}(\\d+)([kKmMgGtT]?)`).exec(args);
  if (!m) return undefined;
  const n = Number(m[1]);
  // JVM size suffixes are binary, always — `-Xmx1g` is 1073741824 bytes.
  switch (m[2].toLowerCase()) {
    case 'k': return n * 1024;
    case 'm': return n * 1024 ** 2;
    case 'g': return n * 1024 ** 3;
    case 't': return n * 1024 ** 4;
    default: return n;
  }
}

/** `MaxHeapSize = 6442450944 {product}` from `jcmd VM.flags -all`. */
export function parseVmFlag(output: string, name: string): number | undefined {
  const m = new RegExp(`${name}\\s*[=:]\\s*(\\d+)`).exec(output);
  return m ? Number(m[1]) : undefined;
}

/** `used 4194304K` / `capacity` lines from `jcmd GC.heap_info`. */
export function parseHeapInfoUsed(output: string): number | undefined {
  // Sum the generations' `used NNNNK` figures. A single regex on the first
  // match would report only the young generation, which on a leaking heap is
  // the small half and would make the pod look far healthier than it is.
  let total = 0;
  let found = false;
  for (const m of output.matchAll(/used\s+(\d+)K/g)) {
    total += Number(m[1]) * 1024;
    found = true;
  }
  return found ? total : undefined;
}

/**
 * Read the container's own cgroup accounting.
 *
 * This is the number the kernel uses to decide whether to OOM-kill, which makes
 * it the right one for this question — better than `kubectl top`, which needs
 * metrics-server to be installed and lags by a scrape interval anyway.
 *
 * cgroup v2 exposes memory.current and memory.max; v1 uses the older
 * memory.usage_in_bytes and memory.limit_in_bytes. Both are checked because
 * both are still in the field.
 *
 * `memory.max` reads `max` on an unlimited container, and v1 reports a
 * sentinel near 2^63 for the same thing — neither is a real limit, and reading
 * either as one would produce an absurd headroom figure.
 */
export function parseCgroupProbe(stdout: string): { usage?: number; limit?: number } {
  const out: { usage?: number; limit?: number } = {};
  for (const line of stdout.split('\n')) {
    const m = /^(usage|limit)=(.+)$/.exec(line.trim());
    if (!m) continue;
    const raw = m[2].trim();
    if (raw === 'max' || raw === '') continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) continue;
    // v1's "no limit" sentinel is PAGE_COUNTER_MAX, which lands in the
    // petabytes. Nothing real has a limit that size.
    if (m[1] === 'limit' && n > 2 ** 53) continue;
    out[m[1] as 'usage' | 'limit'] = n;
  }
  return out;
}

/** `kubectl top pod` prints `NAME CPU(cores) MEMORY(bytes)` as e.g. `1234Mi`. */
export function parseTopPod(stdout: string, pod: string): number | undefined {
  for (const line of stdout.split('\n')) {
    const f = line.trim().split(/\s+/);
    if (f.length >= 3 && f[0] === pod) return parseQuantity(f[2]);
  }
  return undefined;
}

// ── Gathering ───────────────────────────────────────────────────────────────

function execArgs(ctx: string, ns: string, pod: string, container: string | undefined, cmd: string[]): string[] {
  return [
    '--context', ctx, '-n', ns, 'exec', pod,
    ...(container ? ['-c', container] : []),
    '--', ...cmd,
  ];
}

/**
 * Everything needed to judge the dump, in as few round trips as possible.
 *
 * `dumpDir` is where collectArtifact would actually write, so the tmpfs and
 * free-space answers are about the real destination rather than a guess.
 */
export async function readMemoryProfile(
  ctx: string,
  ns: string,
  pod: string,
  opts: { container?: string; jcmd?: boolean; targetPid?: string; dumpDir?: string } = {},
): Promise<MemoryProfile> {
  const profile: MemoryProfile = { unknowns: [] };
  const dumpDir = opts.dumpDir ?? '/tmp';

  // ── Limits, from the pod spec ──
  const spec = await run(['--context', ctx, '-n', ns, 'get', 'pod', pod, '-o', 'json'], { timeoutMs: 20_000 });
  if (spec.ok) {
    try {
      const parsed = JSON.parse(spec.stdout);
      const containers = parsed.spec?.containers ?? [];
      const c = opts.container
        ? containers.find((x: { name: string }) => x.name === opts.container)
        : containers[0];
      profile.limitBytes = parseQuantity(c?.resources?.limits?.memory);
      profile.requestBytes = parseQuantity(c?.resources?.requests?.memory);
      if (profile.limitBytes === undefined) {
        // No limit is not the same as a large limit: the pod can use whatever
        // the node has, so a dump cannot push it past a cgroup ceiling. It can
        // still exhaust the node, which is a different and rarer problem.
        profile.unknowns.push('This container has no memory limit set, so there is no ceiling to exceed.');
      }
    } catch {
      profile.unknowns.push('Could not read the pod spec, so the memory limit is unknown.');
    }
  } else {
    profile.unknowns.push('Could not read the pod spec, so the memory limit is unknown.');
  }

  // ── Current usage ──
  //
  // The cgroup first. It is what the kernel actually meters, it needs nothing
  // installed in the cluster, and it does not lag a scrape interval. metrics-
  // server is the fallback for the case where exec is refused but the metrics
  // API is not.
  const cg = await run(execArgs(ctx, ns, pod, opts.container, [
    'sh', '-c',
    'echo "usage=$(cat /sys/fs/cgroup/memory.current 2>/dev/null '
    + '|| cat /sys/fs/cgroup/memory/memory.usage_in_bytes 2>/dev/null)"; '
    + 'echo "limit=$(cat /sys/fs/cgroup/memory.max 2>/dev/null '
    + '|| cat /sys/fs/cgroup/memory/memory.limit_in_bytes 2>/dev/null)"',
  ]), { timeoutMs: 20_000 });

  if (cg.ok) {
    const parsed = parseCgroupProbe(cg.stdout);
    profile.usageBytes = parsed.usage;
    // The cgroup limit is the one actually enforced. It normally equals the
    // spec's limit, but the spec can be missing while the cgroup is not — a
    // pod under a LimitRange, for instance.
    if (profile.limitBytes === undefined && parsed.limit !== undefined) {
      profile.limitBytes = parsed.limit;
      const idx = profile.unknowns.findIndex(u => u.includes('no memory limit set'));
      if (idx !== -1) profile.unknowns.splice(idx, 1);
    }
  }

  if (profile.usageBytes === undefined) {
    const top = await run(['--context', ctx, '-n', ns, 'top', 'pod', pod, '--no-headers'],
                          { timeoutMs: 20_000 });
    if (top.ok) profile.usageBytes = parseTopPod(top.stdout, pod);
  }

  if (profile.usageBytes === undefined) {
    // Only reachable when the container cannot be exec'd into AND metrics-server
    // is absent. Without it there is no headroom figure, and that has to be
    // said out loud rather than guessed at.
    profile.unknowns.push('Could not read this container\u2019s memory usage \u2014 the cgroup is unreadable and metrics-server is not reporting.');
  }

  // ── Where the dump would land ──
  //
  // `stat -f -c %T` names the filesystem type. tmpfs is the dangerous answer:
  // writing there consumes the container's memory allowance, so the dump file
  // itself counts toward the limit that is about to kill it.
  const fs = await run(execArgs(ctx, ns, pod, opts.container, [
    'sh', '-c',
    `stat -f -c '%T %a %S' ${dumpDir} 2>/dev/null || df -P ${dumpDir} 2>/dev/null | tail -1`,
  ]), { timeoutMs: 20_000 });

  if (fs.ok && fs.stdout.trim()) {
    const out = fs.stdout.trim();
    const statMatch = /^(\S+)\s+(\d+)\s+(\d+)$/.exec(out);
    if (statMatch) {
      profile.dumpDirIsTmpfs = /tmpfs|ramfs/i.test(statMatch[1]);
      profile.dumpDirFreeBytes = Number(statMatch[2]) * Number(statMatch[3]);
    } else {
      // df fallback: 1K blocks, available in field 4.
      const f = out.split(/\s+/);
      if (f.length >= 4) profile.dumpDirFreeBytes = Number(f[3]) * 1024;
      profile.unknowns.push(`Could not determine whether ${dumpDir} is memory-backed.`);
    }
  } else {
    profile.unknowns.push(`Could not inspect ${dumpDir}, so it is unknown whether the dump would be written to memory.`);
  }

  // ── The JVM's own view ──
  if (opts.jcmd) {
    const pid = opts.targetPid ?? '1';
    const flags = await run(execArgs(ctx, ns, pod, opts.container, ['jcmd', pid, 'VM.flags', '-all']),
                            { timeoutMs: 30_000, maxBuffer: 8 * 1024 * 1024 });
    if (flags.ok) {
      profile.maxHeapBytes = parseVmFlag(flags.stdout, 'MaxHeapSize');
      profile.initialHeapBytes = parseVmFlag(flags.stdout, 'InitialHeapSize');
    }

    const info = await run(execArgs(ctx, ns, pod, opts.container, ['jcmd', pid, 'GC.heap_info']),
                           { timeoutMs: 30_000 });
    if (info.ok) profile.usedHeapBytes = parseHeapInfoUsed(info.stdout);
  }

  // Fall back to the command line when jcmd is unavailable or said nothing.
  // -Xmx is frequently right there in the process args, and knowing the ceiling
  // is most of the estimate.
  if (profile.maxHeapBytes === undefined) {
    const pid = opts.targetPid ?? '1';
    const cmdline = await run(execArgs(ctx, ns, pod, opts.container, [
      'sh', '-c', `tr '\\0' ' ' < /proc/${pid}/cmdline 2>/dev/null`,
    ]), { timeoutMs: 20_000 });
    if (cmdline.ok) {
      profile.maxHeapBytes = parseXFlag(cmdline.stdout, 'Xmx');
      profile.initialHeapBytes ??= parseXFlag(cmdline.stdout, 'Xms');
    }
    if (profile.maxHeapBytes === undefined) {
      profile.unknowns.push('The JVM does not report -Xmx and it is not on the command line, so the heap ceiling is unknown.');
    }
  }

  return profile;
}

// ── Judgement ───────────────────────────────────────────────────────────────

/** Below this fraction of the limit, a dump has room to work. */
const SAFE_USED_FRACTION = 0.75;
/** At or above this, the pod is already close enough to the edge to refuse. */
const UNSAFE_USED_FRACTION = 0.85;
/**
 * The JVM needs working room on top of whatever it is already using.
 * Deliberately generous: being wrong in the cautious direction costs a refused
 * dump, being wrong the other way costs the pod.
 */
const DUMP_OVERHEAD_BYTES = 256 * 1024 * 1024;

export function assessHeapDumpSafety(p: MemoryProfile): HeapDumpSafety {
  const reasons: string[] = [];

  // What the dump will roughly weigh. The file is about the size of the LIVE
  // heap, which is bounded by what is in use now, or by -Xmx if that is all we
  // know.
  const dumpSize = p.usedHeapBytes ?? p.maxHeapBytes;

  const headroomBytes = p.limitBytes !== undefined && p.usageBytes !== undefined
    ? p.limitBytes - p.usageBytes
    : undefined;
  const usedFraction = p.limitBytes !== undefined && p.usageBytes !== undefined
    ? p.usageBytes / p.limitBytes
    : undefined;

  // ── What the dump will cost ──
  //
  // The JVM always needs working room for the full GC. On top of that, if the
  // file lands on a memory-backed filesystem it consumes the container's limit
  // byte for byte — that is the case that kills pods whose every other number
  // looks fine.
  let estimatedCostBytes = DUMP_OVERHEAD_BYTES;
  if (p.dumpDirIsTmpfs) {
    estimatedCostBytes += dumpSize ?? 0;
    reasons.push(
      dumpSize
        ? `The dump would be written to a memory-backed filesystem, so its ~${humanBytes(dumpSize)} counts against this container's memory limit rather than against disk.`
        : 'The dump would be written to a memory-backed filesystem, so the file itself counts against this container’s memory limit.',
    );
  }

  // ── Not enough room on the target filesystem ──
  if (dumpSize !== undefined && p.dumpDirFreeBytes !== undefined && dumpSize > p.dumpDirFreeBytes) {
    reasons.push(
      `The dump needs roughly ${humanBytes(dumpSize)} but only ${humanBytes(p.dumpDirFreeBytes)} is free where it would be written. `
      + 'A dump that runs out of space part-way leaves a truncated file, which parses far enough to look valid and then gives wrong answers.',
    );
    return {
      verdict: 'unsafe',
      headline: `Not enough space for the dump: it needs about ${humanBytes(dumpSize)} and ${humanBytes(p.dumpDirFreeBytes)} is free.`,
      reasons, estimatedCostBytes, headroomBytes, usedFraction,
    };
  }

  // ── Headroom, judged on the PROJECTED peak rather than on current usage ──
  //
  // Judging on usage alone is what made an earlier version of this wave through
  // a pod at 50% of its limit that was about to write 3.5 GiB of dump into its
  // own memory allowance. What matters is where the pod ends up during the
  // dump, not where it sits before one.
  if (usedFraction !== undefined) {
    const projectedFraction = (p.usageBytes! + estimatedCostBytes) / p.limitBytes!;
    const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

    if (projectedFraction >= UNSAFE_USED_FRACTION) {
      reasons.unshift(
        `This container is at ${pct(usedFraction)} of its ${humanBytes(p.limitBytes!)} limit with `
        + `${humanBytes(headroomBytes!)} to spare, and the dump is estimated to need `
        + `${humanBytes(estimatedCostBytes)} — taking it to about ${pct(projectedFraction)}.`,
      );
      return {
        verdict: 'unsafe',
        headline: projectedFraction >= 1
          ? `A heap dump would very likely OOM-kill this pod: it needs about ${humanBytes(estimatedCostBytes)} and only ${humanBytes(headroomBytes!)} is left under the limit.`
          : `Too close to the limit for a heap dump — it would take this pod to roughly ${pct(projectedFraction)} of ${humanBytes(p.limitBytes!)}.`,
        reasons, estimatedCostBytes, headroomBytes, usedFraction,
      };
    }

    if (projectedFraction >= SAFE_USED_FRACTION) {
      reasons.unshift(
        `This container is at ${pct(usedFraction)} of its ${humanBytes(p.limitBytes!)} limit, and the dump `
        + `would take it to about ${pct(projectedFraction)}. There is room, but not much.`,
      );
      return {
        verdict: 'tight',
        headline: `Tight: the dump would take this pod to roughly ${pct(projectedFraction)} of its ${humanBytes(p.limitBytes!)} limit.`,
        reasons, estimatedCostBytes, headroomBytes, usedFraction,
      };
    }
  }

  // ── Missing inputs ──
  //
  // "I could not measure this" must never render as "safe". The whole value of
  // the check is that it is trustworthy when it says yes.
  const blocking = p.unknowns.filter(u => !u.includes('no memory limit set'));
  if (usedFraction === undefined && blocking.length) {
    return {
      verdict: 'unknown',
      headline: p.limitBytes === undefined && p.usageBytes === undefined
        ? 'Cannot tell whether a heap dump is safe here — neither the limit nor current usage could be read.'
        : 'Cannot tell whether a heap dump is safe here.',
      reasons: [...reasons, ...blocking],
      estimatedCostBytes, headroomBytes, usedFraction,
    };
  }

  return {
    verdict: 'safe',
    headline: usedFraction !== undefined
      ? `Room to work: ${(usedFraction * 100).toFixed(0)}% of the ${humanBytes(p.limitBytes!)} limit is in use, and the dump needs about ${humanBytes(estimatedCostBytes)}.`
      : 'No memory limit on this container, so a dump cannot push it past a cgroup ceiling.',
    reasons, estimatedCostBytes, headroomBytes, usedFraction,
  };
}

export function humanBytes(n?: number): string {
  if (n === undefined) return '—';
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KiB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(0)} MiB`;
  return `${(n / 1024 ** 3).toFixed(1)} GiB`;
}
