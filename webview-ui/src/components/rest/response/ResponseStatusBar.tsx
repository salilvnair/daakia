import { formatBytes } from '../../../services/response';

export function ResponseStatusBar({ response }: { response: { status: number; statusText: string; time: number; size: number } }) {
  const isNetworkError = response.status === 0;
  const statusLabel = isNetworkError ? response.statusText || 'Error' : `${response.status} ${response.statusText}`;
  const statusColor = isNetworkError
    ? 'text-[#ef4444] bg-[rgba(239,68,68,0.12)]'
    : response.status < 300
      ? 'text-[var(--color-success)] bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)]'
      : response.status < 400
        ? 'text-[#f59e0b] bg-[rgba(245,158,11,0.12)]'
        : 'text-[#ef4444] bg-[rgba(239,68,68,0.12)]';

  return (
    <div className="flex items-center gap-4 px-4 py-2 border-t border-[var(--color-surface-border)] bg-[var(--color-surface)]">
      <span className="text-[12px] flex items-center gap-1.5">
        <span className="text-[var(--color-text-muted)]">Status:</span>
        <span className={`px-1.5 py-[1px] rounded text-[10px] font-bold font-mono ${statusColor}`}>
          {statusLabel}
        </span>
      </span>
      <span className="text-[12px] flex items-center gap-1.5">
        <span className="text-[var(--color-text-muted)]">Time:</span>
        <span className="px-1.5 py-[1px] rounded text-[10px] font-mono font-semibold bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)]">{response.time} ms</span>
      </span>
      <span className="text-[12px] flex items-center gap-1.5">
        <span className="text-[var(--color-text-muted)]">Size:</span>
        <span className="px-1.5 py-[1px] rounded text-[10px] font-mono font-semibold bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)]">{formatBytes(response.size)}</span>
      </span>
    </div>
  );
}
