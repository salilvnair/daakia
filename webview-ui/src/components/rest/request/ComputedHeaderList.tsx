import { useState } from 'react';
import { LockIcon, TrashIcon, EyeIcon, EyeOffIcon, ChevronDownIcon } from '../../../icons';

export interface ComputedHeader {
  id: string;
  key: string;
  value: string;
  badge?: string;
  badgeColor?: string;
  icon?: React.ReactNode;
  masked?: boolean;
  onDelete?: () => void;
  deleteTitle?: string;
}

interface Props {
  rows: ComputedHeader[];
  showDescription?: boolean;
}

export function ComputedHeaderList({ rows, showDescription = false }: Props) {
  const [expanded, setExpanded] = useState(true);

  if (rows.length === 0) return null;

  return (
    <div className="mb-2">
      {/* Section header — same toolbar style as KeyValueTable */}
      <div className="flex items-center justify-between mb-1.5 px-1">
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1.5 cursor-pointer group"
        >
          <span
            className="transition-transform duration-150"
            style={{ display: 'inline-flex', transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
          >
            <ChevronDownIcon size={12} style={{ color: 'var(--color-text-muted)', opacity: 0.6 }} />
          </span>
          <span className="text-[12px] text-[var(--color-text-muted)] font-medium group-hover:text-[var(--color-text-primary)] transition-colors">
            Computed Headers
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-medium"
            style={{
              background: 'color-mix(in srgb, var(--color-primary) 10%, transparent)',
              color: 'var(--color-primary)',
            }}
          >
            {rows.length}
          </span>
        </button>
      </div>

      {expanded && (
        <>
          {/* Column header — matches KeyValueTable */}
          <div className={`grid ${showDescription ? 'grid-cols-[32px_1fr_1fr_1fr_32px]' : 'grid-cols-[32px_1fr_1fr_32px]'} gap-2 px-1 mb-1.5 items-center`}>
            <div />
            <div className="text-[var(--color-text-muted)] font-medium text-[10px] uppercase tracking-wide px-2.5">Key</div>
            <div className="text-[var(--color-text-muted)] font-medium text-[10px] uppercase tracking-wide px-2.5">Value</div>
            {showDescription && <div className="text-[var(--color-text-muted)] font-medium text-[10px] uppercase tracking-wide px-2.5">Description</div>}
            <div />
          </div>

          <div className="flex flex-col gap-0">
            {rows.map(row => (
              <div key={row.id} className="py-1">
                <ComputedRow row={row} showDescription={showDescription} />
              </div>
            ))}
          </div>

          {/* Separator before Header List */}
          <div className="mt-2 mb-0 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
        </>
      )}
    </div>
  );
}

// ─── Single locked row ────────────────────────────────────────────────────────

function ComputedRow({ row, showDescription }: { row: ComputedHeader; showDescription: boolean }) {
  const [revealed, setRevealed] = useState(false);

  const displayValue = row.masked && !revealed ? '••••••••••••••••••••' : row.value;

  return (
    <div
      className={`grid ${showDescription ? 'grid-cols-[32px_1fr_1fr_1fr_32px]' : 'grid-cols-[32px_1fr_1fr_32px]'} gap-2 px-1 group opacity-70`}
    >
      {/* Lock icon — replaces checkbox */}
      <div className="flex items-center justify-center">
        <span className="p-0.5 text-[var(--color-text-muted)] opacity-60">
          {row.icon ?? <LockIcon size={13} />}
        </span>
      </div>

      {/* Key — read-only, dashed border */}
      <div>
        <div
          className="w-full px-2.5 py-1 rounded-md text-[12px] h-[28px] flex items-center font-mono truncate"
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px dashed rgba(255,255,255,0.1)',
            color: 'var(--color-text-muted)',
            cursor: 'default',
          }}
          title={row.key}
        >
          <span className="truncate">{row.key}</span>
          {row.badge && (
            <span
              className="ml-1.5 text-[9px] px-1 py-0.5 rounded font-medium flex-shrink-0"
              style={{ background: `${row.badgeColor ?? 'var(--color-primary)'}22`, color: row.badgeColor ?? 'var(--color-primary)' }}
            >
              {row.badge}
            </span>
          )}
        </div>
      </div>

      {/* Value — masked, dashed border, eye toggle */}
      <div className="relative">
        <div
          className="w-full px-2.5 py-1 rounded-md text-[12px] h-[28px] flex items-center font-mono"
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px dashed rgba(255,255,255,0.1)',
            color: 'var(--color-text-muted)',
            cursor: 'default',
            paddingRight: row.masked ? '1.75rem' : undefined,
          }}
          title={revealed ? row.value : undefined}
        >
          <span className="truncate flex-1">{displayValue}</span>
        </div>
        {row.masked && (
          <button
            type="button"
            onClick={() => setRevealed(v => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors opacity-70 hover:opacity-100"
            title={revealed ? 'Hide value' : 'Show value'}
          >
            {revealed ? <EyeIcon size={13} /> : <EyeOffIcon size={13} />}
          </button>
        )}
      </div>

      {/* Description placeholder */}
      {showDescription && <div />}

      {/* Delete */}
      <div className="flex items-center justify-center">
        {row.onDelete ? (
          <button
            type="button"
            onClick={row.onDelete}
            title={row.deleteTitle ?? 'Remove'}
            className="opacity-0 group-hover:opacity-100 p-1 text-[var(--color-text-muted)] hover:text-[#ef4444] cursor-pointer transition-all"
          >
            <TrashIcon size={14} />
          </button>
        ) : (
          <div className="w-6" />
        )}
      </div>
    </div>
  );
}
