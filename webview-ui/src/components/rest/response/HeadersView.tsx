import { useState, useCallback } from 'react';
import { CopyIcon, CheckIcon } from '../../../icons';

export function HeadersView({ headers }: { headers: [string, string][] }) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const copyAll = useCallback(() => {
    const text = headers.map(([k, v]) => `${k}: ${v}`).join('\n');
    navigator.clipboard.writeText(text);
  }, [headers]);

  const copyHeader = useCallback((idx: number) => {
    const [k, v] = headers[idx];
    navigator.clipboard.writeText(`${k}: ${v}`);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  }, [headers]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      {/* Header list label + copy all */}
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-[12px] text-[var(--color-primary)] font-medium">Header List</span>
        <button
          type="button"
          onClick={copyAll}
          className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors"
          title="Copy all headers"
        >
          <CopyIcon size={14} />
        </button>
      </div>

      {/* Header rows */}
      <div className="px-4">
        {headers.map(([key, value], idx) => (
          <div
            key={key}
            className="flex items-center gap-4 py-2.5 border-b border-[rgba(255,255,255,0.06)] group"
            onMouseEnter={() => setHoveredIdx(idx)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <span className="text-[13px] font-medium text-[var(--color-text-primary)] min-w-[200px]">{key}</span>
            <span className="text-[13px] text-[var(--color-text-secondary)] flex-1 break-all">{value}</span>
            <button
              type="button"
              onClick={() => copyHeader(idx)}
              className={`p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer transition-all ${
                hoveredIdx === idx || copiedIdx === idx ? 'opacity-100' : 'opacity-0'
              }`}
              title="Copy"
            >
              {copiedIdx === idx ? (
                <CheckIcon size={14} style={{ stroke: 'var(--color-success)' }} />
              ) : (
                <CopyIcon size={14} />
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
