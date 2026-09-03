/**
 * The two views a CPU profile cannot give you.
 *
 * Blocking: where threads went when they were not running. An application
 * contending on one lock produces almost no execution samples — technically
 * true and useless — while the recording holds thousands of monitor waits
 * naming the lock, the method, and the thread that was holding it.
 *
 * Allocation: which line made the garbage. A heap dump says what is on the heap
 * and who holds it, and structurally cannot say which `new` produced it,
 * because `jcmd` and `jmap` write serial 0 for every object. Only a recording
 * carries the allocating stack.
 */
import { useState } from 'react';

const ACCENT = 'var(--color-dk8s)';

export interface WaitSite {
  kind: 'monitor' | 'wait' | 'park' | 'socket' | 'file';
  target: string;
  site: string;
  count: number;
  totalMs: number;
  maxMs: number;
  threads: { name: string; count: number; totalMs: number }[];
  blockedBy: { name: string; count: number }[];
  stacks: { frames: string[]; count: number }[];
}

export interface AllocSite {
  objectClass: string;
  site: string;
  bytes: number;
  samples: number;
  threads: { name: string; samples: number }[];
  stacks: { frames: string[]; samples: number }[];
}

function bytes(v: number): string {
  if (v < 1024) return `${Math.round(v)} B`;
  if (v < 1024 ** 2) return `${(v / 1024).toFixed(1)} KB`;
  if (v < 1024 ** 3) return `${(v / 1024 ** 2).toFixed(1)} MB`;
  return `${(v / 1024 ** 3).toFixed(2)} GB`;
}

function duration(msVal: number): string {
  if (msVal < 1) return `${msVal.toFixed(2)} ms`;
  if (msVal < 1000) return `${msVal.toFixed(0)} ms`;
  return `${(msVal / 1000).toFixed(1)} s`;
}

const KIND_LABEL: Record<WaitSite['kind'], string> = {
  monitor: 'lock', wait: 'wait', park: 'parked', socket: 'socket', file: 'file',
};

function Bar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="h-[5px] rounded-full overflow-hidden shrink-0"
         style={{ width: 84, background: 'var(--color-surface-hover)' }}>
      <div className="h-full rounded-full"
           style={{ width: `${Math.min(100, Math.max(percent, percent > 0 ? 2 : 0))}%`, background: color }} />
    </div>
  );
}

/** `com.acme.order.OrderService.submit:31` → `c.a.o.OrderService.submit:31` */
function shortSite(s: string): string {
  const at = s.lastIndexOf(':');
  const line = at > 0 && /^\d+$/.test(s.slice(at + 1)) ? s.slice(at) : '';
  const body = line ? s.slice(0, at) : s;
  const parts = body.split('.');
  if (parts.length < 4) return s;
  const method = parts.pop()!;
  const cls = parts.pop()!;
  return `${parts.map(p => p[0] ?? '').join('.')}.${cls}.${method}${line}`;
}

function Stacks({ stacks, unit }: {
  stacks: { frames: string[]; count?: number; samples?: number }[]; unit: string;
}) {
  if (!stacks.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[9.5px] uppercase tracking-wider"
            style={{ color: 'var(--color-text-muted)' }}>how it got there</span>
      {stacks.map((b, i) => (
        <div key={i} className="rounded-md px-2.5 py-2"
             style={{ background: 'var(--color-panel)', border: '1px solid var(--color-surface-border)' }}>
          <div className="text-[10.5px] mb-1" style={{ color: ACCENT }}>
            {(b.count ?? b.samples ?? 0).toLocaleString()} {unit}
          </div>
          {b.frames.slice(0, 10).map((f, j) => (
            <div key={j} className="text-[10.5px] font-mono truncate"
                 style={{ color: 'var(--color-text-secondary)', paddingLeft: j * 8 }}>{f}</div>
          ))}
          {b.frames.length > 10 && (
            <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
              +{b.frames.length - 10} more frames
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Blocking ────────────────────────────────────────────────────────────────

export function WaitsView({ waits }: {
  waits: {
    sites: WaitSite[]; totalMs: number; count: number; wallMs: number; truncated: number;
  };
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (!waits?.sites?.length) {
    return (
      <div className="px-2 py-6 text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
        Nothing blocked for long enough to be recorded. For this application that is the
        answer: its threads were not waiting on each other.
      </div>
    );
  }

  const worst = waits.sites[0].totalMs || 1;
  // Blocked time is per thread, so it exceeds the recording whenever more than
  // one thread waited. Said plainly, because otherwise the number reads as a
  // mistake — 149s of blocking inside a 30s recording looks impossible.
  const threadSeconds = waits.totalMs / Math.max(1, waits.wallMs);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-[22px] font-semibold tabular-nums"
              style={{ color: 'var(--color-text-primary)' }}>{duration(waits.totalMs)}</span>
        <span className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
          of thread time spent waiting, across {waits.count.toLocaleString()} events
        </span>
        <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          · about {threadSeconds.toFixed(1)} threads blocked at any moment, over{' '}
          {duration(waits.wallMs)} of recording
        </span>
      </div>

      <div className="flex items-center gap-3 px-2 py-1 text-[9.5px] uppercase tracking-wider"
           style={{ color: 'var(--color-text-muted)' }}>
        <span style={{ width: 84 }}>blocked</span>
        <span style={{ width: 62 }}>total</span>
        <span>waiting on</span>
      </div>

      {waits.sites.map(s => {
        const key = `${s.kind}:${s.target}:${s.site}`;
        const isOpen = open === key;
        return (
          <div key={key} className="rounded-md"
               style={{ background: isOpen ? 'var(--color-surface)' : undefined }}>
            <button type="button"
                    className="w-full flex items-center gap-3 px-2 py-1.5 text-left rounded-md"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                    onClick={() => setOpen(isOpen ? null : key)}>
              <Bar percent={(s.totalMs / worst) * 100} color="var(--color-warning)" />
              <span className="text-[11.5px] tabular-nums shrink-0"
                    style={{ width: 62, color: 'var(--color-text-secondary)' }}>
                {duration(s.totalMs)}
              </span>
              <span className="text-[10px] px-1.5 py-[1px] rounded shrink-0"
                    style={{
                      background: 'var(--color-surface-hover)',
                      color: 'var(--color-text-muted)',
                    }}>{KIND_LABEL[s.kind]}</span>
              <span className="text-[11.5px] font-mono truncate min-w-0 flex-1"
                    style={{ color: 'var(--color-text-primary)' }}>
                {s.target}
                <span style={{ color: 'var(--color-text-muted)' }}> at {shortSite(s.site)}</span>
              </span>
              <span className="text-[10.5px] tabular-nums shrink-0"
                    style={{ color: 'var(--color-text-muted)' }}>
                ×{s.count.toLocaleString()}
              </span>
            </button>

            {isOpen && (
              <div className="px-3 pb-3 pt-1 flex flex-col gap-3">
                <div className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                  <span className="font-mono">{s.site}</span> — {s.count.toLocaleString()} waits,
                  longest {duration(s.maxMs)}
                </div>

                {/* The field no other artifact carries. A thread dump is one
                    instant and names the holder only if you caught it. */}
                {s.blockedBy.length > 0 && (
                  <div className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>held by: </span>
                    {s.blockedBy.slice(0, 6).map(b => `${b.name} (${b.count})`).join(', ')}
                  </div>
                )}

                {s.threads.length > 0 && (
                  <div className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                    waiting: {s.threads.slice(0, 8)
                      .map(t => `${t.name} ${duration(t.totalMs)}`).join(', ')}
                  </div>
                )}

                <Stacks stacks={s.stacks} unit="waits" />
              </div>
            )}
          </div>
        );
      })}

      {waits.truncated > 0 && (
        <div className="px-2 py-2 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          {waits.truncated.toLocaleString()} more sites waited less and are not shown.
        </div>
      )}
    </div>
  );
}

// ── Allocation ──────────────────────────────────────────────────────────────

export function AllocationView({ allocation }: {
  allocation: {
    sites: AllocSite[]; totalBytes: number; samples: number;
    weighted: boolean; truncated: number;
  };
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (!allocation?.sites?.length) {
    return (
      <div className="px-2 py-6 text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
        This recording carries no allocation samples.
      </div>
    );
  }

  const worst = allocation.sites[0].bytes || 1;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-[22px] font-semibold tabular-nums"
              style={{ color: 'var(--color-text-primary)' }}>{bytes(allocation.totalBytes)}</span>
        <span className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
          allocated, estimated from {allocation.samples.toLocaleString()} samples
        </span>
        {/* Sampled, and said so. The JVM gives each sample a weight for the
            bytes it stands for; presenting that as an exact total would be a
            precision the recording does not have. */}
        <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          · {allocation.weighted
            ? 'weighted by the JVM’s own estimate, so these are approximations'
            : 'this recording carries no weights, so sites are ranked by sample count'}
        </span>
      </div>

      <div className="flex items-center gap-3 px-2 py-1 text-[9.5px] uppercase tracking-wider"
           style={{ color: 'var(--color-text-muted)' }}>
        <span style={{ width: 84 }}>share</span>
        <span style={{ width: 62 }}>bytes</span>
        <span>type, and the line that allocated it</span>
      </div>

      {allocation.sites.map(s => {
        const key = `${s.objectClass}:${s.site}`;
        const isOpen = open === key;
        return (
          <div key={key} className="rounded-md"
               style={{ background: isOpen ? 'var(--color-surface)' : undefined }}>
            <button type="button"
                    className="w-full flex items-center gap-3 px-2 py-1.5 text-left rounded-md"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                    onClick={() => setOpen(isOpen ? null : key)}>
              <Bar percent={(s.bytes / worst) * 100} color="var(--color-success)" />
              <span className="text-[11.5px] tabular-nums shrink-0"
                    style={{ width: 62, color: 'var(--color-text-secondary)' }}>
                {bytes(s.bytes)}
              </span>
              <span className="text-[11.5px] font-mono truncate min-w-0 flex-1"
                    style={{ color: 'var(--color-text-primary)' }}>
                {s.objectClass}
                <span style={{ color: 'var(--color-text-muted)' }}> at {shortSite(s.site)}</span>
              </span>
              <span className="text-[10.5px] tabular-nums shrink-0"
                    style={{ color: 'var(--color-text-muted)' }}>
                ×{s.samples.toLocaleString()}
              </span>
            </button>

            {isOpen && (
              <div className="px-3 pb-3 pt-1 flex flex-col gap-3">
                <div className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                  <span className="font-mono">{s.site}</span> — {bytes(s.bytes)} across{' '}
                  {s.samples.toLocaleString()} samples
                </div>
                {s.threads.length > 0 && (
                  <div className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                    threads: {s.threads.slice(0, 8).map(t => `${t.name} (${t.samples})`).join(', ')}
                  </div>
                )}
                <Stacks stacks={s.stacks} unit="samples" />
              </div>
            )}
          </div>
        );
      })}

      {allocation.truncated > 0 && (
        <div className="px-2 py-2 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          {allocation.truncated.toLocaleString()} more sites allocated less and are not shown.
        </div>
      )}
    </div>
  );
}
