/**
 * RequestProgressOverlay — shared component showing request execution stages.
 * Modern chip/badge styled stages with accent-colored circle indicators.
 * Uses var(--color-accent) set by App.tsx for protocol-aware theming.
 */
import { useState, useEffect, useRef } from 'react';
import type { RequestProgressStage } from '../../../store/tabs-store';
import { StageCheckIcon, StageErrorIcon, StagePendingIcon, StageSpinIcon, StagePulseIcon } from '../../../icons';

interface RequestProgressOverlayProps {
  stages: RequestProgressStage[];
  onCancel: () => void;
}

export function RequestProgressOverlay({ stages, onCancel }: RequestProgressOverlayProps) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-5 w-[440px]">
        <div className="w-full flex flex-col gap-2">
          {stages.map((stage) => (
            <StageRow key={stage.id} stage={stage} />
          ))}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="mt-2 h-[32px] px-5 text-[12px] font-medium rounded-full bg-[var(--color-error)] text-white hover:brightness-110 cursor-pointer transition-all"
        >
          Cancel Request
        </button>
      </div>
    </div>
  );
}

function StageRow({ stage }: { stage: RequestProgressStage }) {
  const elapsed = useElapsed(stage);
  const isDone = stage.status === 'done' || stage.status === 'skipped';
  const isRunning = stage.status === 'running';

  return (
    <div
      className={`flex items-center gap-3 px-3 py-[7px] rounded-lg transition-colors ${
        isDone
          ? 'bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)]'
          : isRunning
            ? 'bg-[color-mix(in_srgb,var(--color-accent)_5%,transparent)]'
            : 'bg-[var(--color-surface)]'
      }`}
    >
      <StageIndicator status={stage.status} />
      <span className={`flex-1 text-[12px] font-medium ${isDone ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-primary)]'}`}>
        {stage.label}
      </span>
      {elapsed && (
        <span className="text-[11px] text-[var(--color-text-muted)] tabular-nums font-mono px-1.5 py-0.5 rounded bg-[var(--color-panel)]">
          {elapsed}
        </span>
      )}
    </div>
  );
}

function StageIndicator({ status }: { status: RequestProgressStage['status'] }) {
  if (status === 'done' || status === 'skipped') {
    return <StageCheckIcon />;
  }
  if (status === 'error') {
    return <StageErrorIcon />;
  }
  if (status === 'running') {
    return (
      <div className="w-4 h-4 flex-shrink-0 relative">
        <StageSpinIcon className="absolute inset-0" />
        <StagePulseIcon className="absolute inset-0" />
      </div>
    );
  }
  // pending
  return <StagePendingIcon />;
}

function useElapsed(stage: RequestProgressStage): string {
  const [now, setNow] = useState(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (stage.status === 'running' && stage.startTime) {
      intervalRef.current = setInterval(() => setNow(Date.now()), 100);
      return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }
    if (intervalRef.current) clearInterval(intervalRef.current);
    return undefined;
  }, [stage.status, stage.startTime]);

  if (stage.status === 'pending') return '';
  if (stage.status === 'skipped') return '0.0 s';

  const start = stage.startTime;
  if (!start) return '0.0 s';
  const end = stage.status === 'running' ? now : (stage.endTime || now);
  const seconds = Math.max(0, (end - start) / 1000);
  return `${seconds.toFixed(1)} s`;
}
