import { describe, it, expect } from 'vitest';
import {
  parseQuantity, parseXFlag, parseVmFlag, parseHeapInfoUsed, parseTopPod,
  assessHeapDumpSafety, humanBytes, parseCgroupProbe, type MemoryProfile,
} from './k8s-memory';

const GiB = 1024 ** 3;
const MiB = 1024 ** 2;

const profile = (over: Partial<MemoryProfile> = {}): MemoryProfile =>
  ({ unknowns: [], ...over });

describe('parseQuantity', () => {
  it('reads binary suffixes as powers of 1024', () => {
    expect(parseQuantity('8Gi')).toBe(8 * GiB);
    expect(parseQuantity('512Mi')).toBe(512 * MiB);
    expect(parseQuantity('64Ki')).toBe(65536);
  });

  it('reads decimal suffixes as powers of 1000, not 1024', () => {
    // Treating 1G as 1Gi overstates a limit by 7%, which is the same order as
    // the margin this whole check reasons about.
    expect(parseQuantity('1G')).toBe(1_000_000_000);
    expect(parseQuantity('1Gi')).toBe(1_073_741_824);
    expect(parseQuantity('1G')).not.toBe(parseQuantity('1Gi'));
  });

  it('reads a bare number as bytes', () => {
    expect(parseQuantity('134217728')).toBe(134217728);
  });

  it('is undefined for nothing and for nonsense', () => {
    expect(parseQuantity(undefined)).toBeUndefined();
    expect(parseQuantity('')).toBeUndefined();
    expect(parseQuantity('lots')).toBeUndefined();
  });
});

describe('parseXFlag', () => {
  it('reads JVM size suffixes as binary', () => {
    expect(parseXFlag('java -Xmx6g -jar app.jar', 'Xmx')).toBe(6 * GiB);
    expect(parseXFlag('java -Xmx6144m -jar app.jar', 'Xmx')).toBe(6144 * MiB);
    expect(parseXFlag('java -Xmx6g -Xms2g', 'Xms')).toBe(2 * GiB);
  });

  it('reads an unsuffixed value as bytes', () => {
    expect(parseXFlag('-Xmx6442450944', 'Xmx')).toBe(6442450944);
  });

  it('accepts either case of suffix', () => {
    expect(parseXFlag('-XmxsomethingM', 'Xmx')).toBeUndefined();
    expect(parseXFlag('-Xmx512M', 'Xmx')).toBe(512 * MiB);
    expect(parseXFlag('-Xmx512m', 'Xmx')).toBe(512 * MiB);
  });

  it('is undefined when the flag is absent', () => {
    expect(parseXFlag('java -jar app.jar', 'Xmx')).toBeUndefined();
  });
});

describe('parseVmFlag / parseHeapInfoUsed', () => {
  it('reads MaxHeapSize out of VM.flags', () => {
    expect(parseVmFlag('   uintx MaxHeapSize   = 6442450944   {product}', 'MaxHeapSize'))
      .toBe(6442450944);
  });

  it('sums every generation in GC.heap_info', () => {
    // Taking only the first match returns the young generation, which on a
    // leaking heap is the small half — the pod would look far healthier than
    // it is, which is the exact failure this check exists to prevent.
    const info = [
      ' garbage-first heap   total 6291456K, used 4194304K [0x0000000080000000, 0x0000000800000000)',
      '  region size 4096K, 100 young (409600K), 5 survivors (20480K)',
      ' Metaspace       used 102400K, capacity 110000K',
    ].join('\n');
    expect(parseHeapInfoUsed(info)).toBe((4194304 + 102400) * 1024);
  });

  it('is undefined when there is nothing to read', () => {
    expect(parseHeapInfoUsed('no heap here')).toBeUndefined();
  });
});

describe('parseTopPod', () => {
  const out = [
    'orders-api-7d9f8b6c4-mn41q   142m   3812Mi',
    'ledger-svc-6c4b91f7d-qq82p   88m    1024Mi',
  ].join('\n');

  it('picks the row for the pod asked about', () => {
    expect(parseTopPod(out, 'ledger-svc-6c4b91f7d-qq82p')).toBe(1024 * MiB);
  });

  it('is undefined for a pod that is not listed', () => {
    expect(parseTopPod(out, 'not-here')).toBeUndefined();
  });
});

describe('assessHeapDumpSafety', () => {
  it('is safe with plenty of headroom', () => {
    const s = assessHeapDumpSafety(profile({
      limitBytes: 8 * GiB, usageBytes: 2 * GiB,
      maxHeapBytes: 6 * GiB, usedHeapBytes: 1.5 * GiB,
      dumpDirIsTmpfs: false, dumpDirFreeBytes: 40 * GiB,
    }));
    expect(s.verdict).toBe('safe');
    expect(s.usedFraction).toBeCloseTo(0.25);
  });

  it('is unsafe when the pod is already near its limit', () => {
    // The case in the request: 8Gi limit, 5.8Gi used.
    const s = assessHeapDumpSafety(profile({
      limitBytes: 8 * GiB, usageBytes: 7 * GiB,
      maxHeapBytes: 6 * GiB, dumpDirIsTmpfs: false, dumpDirFreeBytes: 40 * GiB,
    }));
    expect(s.verdict).toBe('unsafe');
    // The headline states the PROJECTED peak, because that is the number the
    // decision turns on. Where the pod sits right now belongs in the reasons.
    expect(s.headline).toMatch(/9[0-9]%/);
    expect(s.reasons.join(' ')).toContain('88%');
  });

  it('calls the in-between case tight rather than safe or unsafe', () => {
    const s = assessHeapDumpSafety(profile({
      limitBytes: 8 * GiB, usageBytes: 6.4 * GiB,
      dumpDirIsTmpfs: false, dumpDirFreeBytes: 40 * GiB,
    }));
    expect(s.verdict).toBe('tight');
  });

  it('refuses when the dump would be written to memory and will not fit', () => {
    // The trap: every headroom number looks survivable until you notice the
    // file itself lands in the pod's memory allowance.
    const s = assessHeapDumpSafety(profile({
      limitBytes: 8 * GiB, usageBytes: 4 * GiB,
      usedHeapBytes: 3.5 * GiB,
      dumpDirIsTmpfs: true, dumpDirFreeBytes: 8 * GiB,
    }));
    expect(s.verdict).toBe('unsafe');
    expect(s.reasons.join(' ')).toMatch(/memory-backed/);
  });

  it('counts the dump file into the cost when the target is tmpfs', () => {
    const onDisk = assessHeapDumpSafety(profile({
      limitBytes: 32 * GiB, usageBytes: 4 * GiB,
      usedHeapBytes: 3 * GiB, dumpDirIsTmpfs: false, dumpDirFreeBytes: 100 * GiB,
    }));
    const inMemory = assessHeapDumpSafety(profile({
      limitBytes: 32 * GiB, usageBytes: 4 * GiB,
      usedHeapBytes: 3 * GiB, dumpDirIsTmpfs: true, dumpDirFreeBytes: 100 * GiB,
    }));
    expect(inMemory.estimatedCostBytes!).toBeGreaterThan(onDisk.estimatedCostBytes!);
    expect(inMemory.estimatedCostBytes! - onDisk.estimatedCostBytes!).toBe(3 * GiB);
  });

  it('refuses when the filesystem cannot hold the dump', () => {
    // A dump that runs out of space leaves a truncated hprof, which parses far
    // enough to look valid and then answers wrongly.
    const s = assessHeapDumpSafety(profile({
      limitBytes: 16 * GiB, usageBytes: 2 * GiB,
      usedHeapBytes: 6 * GiB, dumpDirIsTmpfs: false, dumpDirFreeBytes: 1 * GiB,
    }));
    expect(s.verdict).toBe('unsafe');
    expect(s.reasons.join(' ')).toMatch(/truncated/);
  });

  it('says unknown rather than safe when it could not measure', () => {
    // The single most important property here: a check that cannot see must
    // never render as a green light.
    const s = assessHeapDumpSafety(profile({
      unknowns: ['metrics-server is not reporting, so current memory usage is unknown.'],
      limitBytes: 8 * GiB,
    }));
    expect(s.verdict).toBe('unknown');
    expect(s.verdict).not.toBe('safe');
  });

  it('treats an unlimited container as safe, and says why', () => {
    // No limit is not a missing measurement — there is genuinely no ceiling to
    // cross, so this must not be lumped in with "unknown".
    const s = assessHeapDumpSafety(profile({
      unknowns: ['This container has no memory limit set, so there is no ceiling to exceed.'],
      usedHeapBytes: 2 * GiB, dumpDirIsTmpfs: false, dumpDirFreeBytes: 50 * GiB,
    }));
    expect(s.verdict).toBe('safe');
    expect(s.headline).toMatch(/no memory limit/i);
  });

  it('always explains itself', () => {
    for (const p of [
      profile({ limitBytes: 8 * GiB, usageBytes: 7.5 * GiB }),
      profile({ limitBytes: 8 * GiB, usageBytes: 1 * GiB, dumpDirIsTmpfs: false }),
      profile({ unknowns: ['metrics-server is not reporting, so current memory usage is unknown.'] }),
    ]) {
      const s = assessHeapDumpSafety(p);
      expect(s.headline.length).toBeGreaterThan(20);
    }
  });
});

describe('humanBytes', () => {
  it('formats at a scale people read', () => {
    expect(humanBytes(8 * GiB)).toBe('8.0 GiB');
    expect(humanBytes(512 * MiB)).toBe('512 MiB');
    expect(humanBytes(undefined)).toBe('—');
  });
});

describe('parseCgroupProbe', () => {
  it('reads cgroup v2 values', () => {
    expect(parseCgroupProbe('usage=402653184\nlimit=536870912'))
      .toEqual({ usage: 402653184, limit: 536870912 });
  });

  it('treats cgroup v2 "max" as no limit, not as a number', () => {
    // Reading "max" as 0 or NaN would produce an absurd headroom figure and a
    // confident wrong verdict.
    expect(parseCgroupProbe('usage=1024\nlimit=max')).toEqual({ usage: 1024 });
  });

  it('ignores the cgroup v1 unlimited sentinel', () => {
    // v1 reports PAGE_COUNTER_MAX for "no limit", which lands in the petabytes.
    expect(parseCgroupProbe('usage=1024\nlimit=9223372036854771712'))
      .toEqual({ usage: 1024 });
  });

  it('survives an empty read', () => {
    expect(parseCgroupProbe('usage=\nlimit=')).toEqual({});
    expect(parseCgroupProbe('')).toEqual({});
  });
});
