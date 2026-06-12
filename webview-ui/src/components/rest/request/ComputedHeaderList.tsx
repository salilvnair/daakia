import { useState } from 'react';
import { ChevronDownIcon } from '../../../icons';
import { HiddenKeyValueItemView, IconButtonView } from '../../../dui';

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
      {/* Section header */}
      <div className="flex items-center justify-between mb-1.5 px-1">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setExpanded(v => !v)}
          onKeyDown={e => e.key === 'Enter' && setExpanded(v => !v)}
          className="flex items-center gap-1 cursor-pointer group"
        >
          <IconButtonView
            icon={
              <ChevronDownIcon
                size={11}
                style={{
                  transition: 'transform 150ms',
                  transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                }}
              />
            }
            size="sm"
            color="var(--color-text-muted)"
          />
          <span className="text-[12px] text-[var(--color-text-muted)] font-medium group-hover:text-[var(--color-text-primary)] transition-colors select-none">
            Headers
          </span>
          {/* "N hidden" badge */}
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-1 select-none"
            style={{
              background: 'color-mix(in srgb, var(--color-text-muted) 10%, transparent)',
              color: 'var(--color-text-muted)',
            }}
          >
            <span style={{ opacity: 0.6 }}>{rows.length}</span>
            <span style={{ opacity: 0.5 }}>hidden</span>
          </span>
        </div>
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
              <div key={row.id} className="py-1 px-1">
                <HiddenKeyValueItemView
                  keyValue={row.key}
                  value={row.value}
                  badge={row.badge}
                  badgeColor={row.badgeColor}
                  icon={row.icon}
                  masked={row.masked}
                  onDelete={row.onDelete}
                  deleteTitle={row.deleteTitle}
                  showDescription={showDescription}
                />
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
