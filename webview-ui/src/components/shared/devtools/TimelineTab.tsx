/**
 * TimelineTab — Shows per-request execution waterfall.
 * Phases: Pre-script(s) → HTTP Request (DNS → TCP → TLS → Send → Wait → Receive) → Post-script(s).
 * Each phase is a horizontal bar with duration label.
 */
import { useDevToolsStore } from '../../../store/devtools-store';
import { TimelineIcon } from '../../../icons';

const PHASE_COLORS: Record<string, string> = {
  'pre-script':     '#a78bfa',
  'dns':            '#6366f1',
  'tcp':            '#3b82f6',
  'tls':            '#06b6d4',
  'send':           '#22c55e',
  'wait':           '#f59e0b',
  'receive':        '#ef4444',
  'post-script':    '#ec4899',
  'collection-pre': '#7c3aed',
  'collection-post':'#db2777',
  'folder-pre':     '#8b5cf6',
  'folder-post':    '#d946ef',
};

function getPhaseColor(name: string): string {
  const key = name.toLowerCase().replace(/\s+/g, '-');
  return PHASE_COLORS[key] ?? 'var(--color-text-muted)';
}

function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function TimelineTab() {
  const entries = useDevToolsStore(s => s.timelineEntries);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-muted)] gap-1">
        <TimelineIcon size={22} style={{ opacity: 0.4 }} />
        <span className="text-[11px]">No timeline data</span>
        <span className="text-[10px] opacity-60">Request execution timing will appear here</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable] p-2">
      {entries.map(entry => {
        const maxDuration = entry.totalMs || Math.max(...entry.phases.map(p => p.startMs + p.durationMs), 1);
        return (
          <div key={entry.id} className="mb-3 last:mb-0">
            {/* Request name + total time */}
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-[11px] font-medium text-[var(--color-text-primary)] truncate">
                {entry.requestName}
              </span>
              <span className="text-[10px] text-[var(--color-text-muted)] flex-shrink-0 ml-2">
                {formatDuration(entry.totalMs)}
              </span>
            </div>

            {/* Phase bars (waterfall) */}
            <div className="flex flex-col gap-[2px] px-2">
              {entry.phases.map((phase, i) => {
                const leftPercent = (phase.startMs / maxDuration) * 100;
                const widthPercent = Math.max((phase.durationMs / maxDuration) * 100, 1);
                const color = phase.color ?? getPhaseColor(phase.name);
                return (
                  <div key={i} className="flex items-center h-[16px] gap-2">
                    {/* Phase label */}
                    <span className="text-[9px] text-[var(--color-text-muted)] w-[60px] flex-shrink-0 text-right truncate">
                      {phase.name}
                    </span>
                    {/* Bar container */}
                    <div className="flex-1 relative h-[10px] bg-[var(--color-input-bg)] rounded-sm overflow-hidden">
                      <div
                        className="absolute top-0 h-full rounded-sm"
                        style={{
                          left: `${leftPercent}%`,
                          width: `${widthPercent}%`,
                          backgroundColor: color,
                          opacity: 0.85,
                        }}
                      />
                    </div>
                    {/* Duration */}
                    <span className="text-[9px] text-[var(--color-text-muted)] w-[45px] flex-shrink-0 font-mono">
                      {formatDuration(phase.durationMs)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
