const METHOD_COLORS: Record<string, string> = {
  GET: 'var(--color-method-get)',
  POST: 'var(--color-method-post)',
  PUT: 'var(--color-method-put)',
  PATCH: 'var(--color-method-patch)',
  DELETE: 'var(--color-method-delete)',
  HEAD: 'var(--color-method-head)',
  OPTIONS: 'var(--color-method-options)',
};

const SHORT: Record<string, string> = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PTCH',
  DELETE: 'DEL',
  HEAD: 'HEAD',
  OPTIONS: 'OPT',
};

interface Props {
  method: string;
  compact?: boolean;
  className?: string;
}

export function MethodBadge({ method, compact = false, className = '' }: Props) {
  const m = method.toUpperCase();
  const color = METHOD_COLORS[m] || 'var(--color-text-secondary)';
  const label = compact ? (SHORT[m] || m.slice(0, 3)) : m;

  return (
    <span
      className={`inline-block font-mono font-bold text-[10px] leading-none ${className}`}
      style={{ color }}
    >
      {label}
    </span>
  );
}
