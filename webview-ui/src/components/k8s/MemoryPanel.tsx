/**
 * What a heap dump would cost this pod.
 *
 * Four numbers and a verdict, side by side, so the comparison is immediate
 * rather than something you assemble across three terminal windows: the limit
 * from the pod spec, the heap from the JVM, and current usage from the
 * container's own cgroup — which is what the kernel meters when it decides
 * whether to OOM-kill, and needs nothing installed in the cluster to read.
 *
 * The bar underneath is the part that does the work: it shows where the pod
 * sits now AND where the dump would take it, against the limit. Someone glances
 * at that and knows the answer before reading a word.
 */
import { WarningTriangleIcon, CheckCircleIcon, XCircleIcon, HelpCircleIcon, MemoryIcon } from '../../icons';
import { useK8sStore, type MemoryProfile, type HeapDumpSafety, type SafetyVerdict } from '../../store/k8s-store';

function human(n?: number): string {
  if (n === undefined) return '—';
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KiB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(0)} MiB`;
  return `${(n / 1024 ** 3).toFixed(1)} GiB`;
}

/**
 * The badge says what the state MEANS, not what it is called.
 *
 * "heap dump unknown" is a label only someone who wrote the check would
 * understand. The person reading it wants one thing: can I press the button.
 */
const VERDICT: Record<SafetyVerdict, { color: string; label: string; Icon: typeof CheckCircleIcon }> = {
  safe:    { color: 'var(--color-success)', label: 'safe to heap dump',        Icon: CheckCircleIcon },
  tight:   { color: 'var(--color-warning)', label: 'heap dump is tight',       Icon: WarningTriangleIcon },
  unsafe:  { color: 'var(--color-error)',   label: 'heap dump risks an oom kill', Icon: XCircleIcon },
  unknown: { color: 'var(--color-text-muted)', label: 'heap dump safety unmeasured', Icon: HelpCircleIcon },
};

function Figure({ label, value, hint, color }: {
  label: string; value: string; hint?: string; color?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 min-w-[104px]">
      <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)]">{label}</span>
      <span className="text-[13px] font-mono"
            style={{ color: color ?? 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
      {hint && <span className="text-[9.5px] text-[var(--color-text-muted)]">{hint}</span>}
    </div>
  );
}

/**
 * Usage now, and usage during the dump, against the limit.
 *
 * Two segments rather than one, because the gap between them IS the decision.
 * A single bar showing current usage would look reassuring on exactly the pod
 * that is about to die.
 */
function HeadroomBar({ memory, safety }: { memory: MemoryProfile; safety?: HeapDumpSafety }) {
  if (memory.limitBytes === undefined || memory.usageBytes === undefined) return null;

  const limit = memory.limitBytes;
  const used = memory.usageBytes;
  // Without a heap dump in play there is nothing to project, so the bar is
  // simply how full the container is.
  const cost = safety?.estimatedCostBytes ?? 0;

  const usedPct = Math.min(100, (used / limit) * 100);
  // Clamp the projection to the track: past the limit there is nothing more to
  // draw, and the overflow is said in words instead.
  const dumpPct = Math.min(100 - usedPct, (cost / limit) * 100);
  const overflows = cost > 0 && used + cost > limit;
  const fullness = used / limit;
  const tone = safety
    ? VERDICT[safety.verdict].color
    : fullness >= 0.85 ? 'var(--color-error)'
    : fullness >= 0.7 ? 'var(--color-warning)'
    : 'var(--color-success)';

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-[9.5px] text-[var(--color-text-muted)]">
        <span className="flex items-center gap-1">
          <span style={{ width: 7, height: 7, borderRadius: 2, background: 'var(--color-text-secondary)' }} />
          in use {human(used)}
        </span>
        {cost > 0 && (
          <span className="flex items-center gap-1">
            <span style={{ width: 7, height: 7, borderRadius: 2, background: tone, opacity: 0.55 }} />
            dump needs ≈{human(cost)}
          </span>
        )}
        <div className="flex-1" />
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>limit {human(limit)}</span>
      </div>

      <div className="flex w-full overflow-hidden"
           style={{ height: 8, borderRadius: 4, background: 'var(--color-surface-hover)' }}>
        <div style={{ width: `${usedPct}%`, background: cost > 0 ? 'var(--color-text-secondary)' : tone }} />
        <div style={{
          width: `${dumpPct}%`,
          background: tone,
          opacity: 0.55,
          // Hatched rather than solid: this segment is a projection, not a
          // measurement, and it should not read as fact.
          backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,.25) 3px, rgba(255,255,255,.25) 6px)`,
        }} />
      </div>

      {overflows && (
        <span className="text-[10px]" style={{ color: 'var(--color-error)' }}>
          That is {human(used + cost - limit)} past the limit — the kernel would OOM-kill this container.
        </span>
      )}
    </div>
  );
}

export function MemoryPanel() {
  const { memory, safety, guardHeapDump } = useK8sStore();
  if (!memory) return null;

  // `safety` is only sent when a heap dump is actually one of this pod's
  // actions. A Python or busybox container gets the memory figures — which are
  // useful for anything — and none of the heap-dump reasoning, which would be
  // advice about a button that is not on the screen.
  const v = safety ? VERDICT[safety.verdict] : undefined;
  // Computed here rather than taken from `safety`, which is absent on a pod
  // that has no heap dump to judge — the fullness figure is useful regardless.
  const usedFraction = memory.limitBytes !== undefined && memory.usageBytes !== undefined
    ? memory.usageBytes / memory.limitBytes
    : undefined;

  return (
    <div className="flex flex-col gap-3 px-3 py-2.5 rounded-lg"
         style={{
           background: 'var(--color-surface)',
           border: `1px solid ${safety?.verdict === 'unsafe'
             ? 'color-mix(in srgb, var(--color-error) 35%, transparent)'
             : safety?.verdict === 'tight'
               ? 'color-mix(in srgb, var(--color-warning) 32%, transparent)'
               : 'var(--color-surface-border)'}`,
         }}>
      <div className="flex items-center gap-2 flex-wrap">
        <MemoryIcon size={13} color={v?.color ?? 'var(--color-text-muted)'} />
        <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
          memory
        </span>
        {v && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] uppercase tracking-wide"
                style={{
                  background: `color-mix(in srgb, ${v.color} 14%, transparent)`,
                  color: v.color, fontWeight: 600,
                }}>
            <v.Icon size={9} color={v.color} />
            {v.label}
          </span>
        )}
      </div>

      {/* The numbers, laid out the way you would write them on paper. */}
      <div className="flex gap-6 flex-wrap">
        <Figure label="memory limit" value={human(memory.limitBytes)}
                hint={memory.requestBytes !== undefined ? `request ${human(memory.requestBytes)}` : undefined} />
        {memory.maxHeapBytes !== undefined && (
          <Figure label="jvm xmx" value={human(memory.maxHeapBytes)}
                  hint={memory.initialHeapBytes !== undefined ? `xms ${human(memory.initialHeapBytes)}` : undefined} />
        )}
        <Figure label="current usage" value={human(memory.usageBytes)}
                color={usedFraction !== undefined && usedFraction >= 0.85
                  ? 'var(--color-error)'
                  : usedFraction !== undefined && usedFraction >= 0.75
                    ? 'var(--color-warning)' : undefined}
                hint={usedFraction !== undefined
                  ? `${(usedFraction * 100).toFixed(0)}% of limit`
                  : 'could not be read'} />
        {memory.usedHeapBytes !== undefined && (
          <Figure label="heap in use" value={human(memory.usedHeapBytes)} hint="from the JVM" />
        )}
        {safety && memory.dumpDirIsTmpfs !== undefined && (
          <Figure
            label="dump target"
            value={memory.dumpDirIsTmpfs ? '/tmp · tmpfs' : '/tmp · disk'}
            color={memory.dumpDirIsTmpfs ? 'var(--color-error)' : undefined}
            hint={memory.dumpDirIsTmpfs ? 'memory-backed' : `${human(memory.dumpDirFreeBytes)} free`}
          />
        )}
      </div>

      <HeadroomBar memory={memory} safety={safety} />

      {safety && v && (
        <div className="flex flex-col gap-1">
          <span className="text-[11.5px]"
                style={{ color: safety.verdict === 'safe' ? 'var(--color-text-secondary)' : v.color }}>
            {safety.headline}
          </span>
          {safety.reasons.map((r, i) => (
            <span key={i} className="text-[10.5px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
              {r}
            </span>
          ))}
          {safety.verdict !== 'unknown' && memory.unknowns
            // The heap ceiling is only interesting when a heap dump is on the
            // table, and it is on the table here — but not every unknown is.
            .map((u, i) => (
              <span key={`u${i}`} className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
                {u}
              </span>
            ))}
        </div>
      )}

      {safety?.verdict === 'unsafe' && !guardHeapDump && (
        <span className="text-[10.5px] px-2 py-1.5 rounded"
              style={{
                background: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
                color: 'var(--color-error)',
              }}>
          The heap-dump guard is switched off in Settings, so this can still be taken.
        </span>
      )}
    </div>
  );
}
