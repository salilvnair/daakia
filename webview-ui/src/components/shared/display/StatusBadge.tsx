interface Props {
  status: number;
  text?: string;
  className?: string;
}

function getStatusColor(status: number): string {
  if (status < 200) return 'var(--color-text-muted)';
  if (status < 300) return 'var(--color-success)';
  if (status < 400) return 'var(--color-warning)';
  if (status < 500) return 'var(--color-error)';
  return 'var(--color-status-5xx)';
}

export function StatusBadge({ status, text, className = '' }: Props) {
  const color = getStatusColor(status);

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-mono font-semibold ${className}`}
      style={{ color }}
    >
      <span>{status}</span>
      {text && <span className="font-normal opacity-80">{text}</span>}
    </span>
  );
}
