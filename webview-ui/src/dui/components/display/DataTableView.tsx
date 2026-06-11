import { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from '../../../icons';
import { EmptyStateView } from './EmptyStateView';

export interface DataTableColumn<T = Record<string, unknown>> {
  key: string;
  label: string;
  width?: string | number;
  sortable?: boolean;
  renderCell?: (row: T, value: unknown) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
}

export interface DataTableViewProps<T = Record<string, unknown>> {
  columns: DataTableColumn<T>[];
  rows: T[];
  keyField?: string;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyMessage?: string;
  striped?: boolean;
  compact?: boolean;
  sortable?: boolean;
  maxHeight?: string;
  className?: string;
}

export function DataTableView<T extends Record<string, unknown>>({
  columns,
  rows,
  keyField = 'id',
  onRowClick,
  emptyTitle = 'No data',
  emptyMessage,
  striped = false,
  compact = false,
  maxHeight,
  className = '',
}: DataTableViewProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const handleSort = (col: DataTableColumn<T>) => {
    if (!col.sortable) return;
    if (sortKey === col.key) {
      setSortAsc(a => !a);
    } else {
      setSortKey(col.key);
      setSortAsc(true);
    }
  };

  const sorted = sortKey
    ? [...rows].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        const cmp = String(av ?? '').localeCompare(String(bv ?? ''));
        return sortAsc ? cmp : -cmp;
      })
    : rows;

  const cellPad = compact ? '5px 10px' : '8px 12px';
  const fontSize = compact ? '11px' : '12px';

  return (
    <div
      className={className}
      style={{
        border: '1px solid var(--color-surface-border)',
        borderRadius: '6px',
        overflow: 'hidden',
        maxHeight,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: columns.map(c => c.width ?? '1fr').join(' '),
        background: 'var(--color-panel)',
        borderBottom: '1px solid var(--color-surface-border)',
        flexShrink: 0,
      }}>
        {columns.map(col => (
          <div
            key={col.key}
            onClick={() => handleSort(col)}
            style={{
              padding: cellPad,
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--color-text-muted)',
              cursor: col.sortable ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              userSelect: 'none',
              textAlign: col.align ?? 'left',
            }}
          >
            {col.label}
            {col.sortable && sortKey === col.key && (
              sortAsc
                ? <ChevronDownIcon size={10} />
                : <ChevronRightIcon size={10} style={{ transform: 'rotate(-90deg)' }} />
            )}
          </div>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {sorted.length === 0 ? (
          <EmptyStateView title={emptyTitle} message={emptyMessage} compact />
        ) : (
          sorted.map((row, ri) => (
            <div
              key={String(row[keyField] ?? ri)}
              onClick={() => onRowClick?.(row)}
              style={{
                display: 'grid',
                gridTemplateColumns: columns.map(c => c.width ?? '1fr').join(' '),
                borderBottom: ri < sorted.length - 1 ? '1px solid var(--color-surface-border)' : 'none',
                background: striped && ri % 2 === 1
                  ? 'color-mix(in srgb, var(--color-text-primary) 2%, transparent)'
                  : 'transparent',
                cursor: onRowClick ? 'pointer' : 'default',
                transition: 'background 80ms',
              }}
              onMouseEnter={e => { if (onRowClick) (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)'; }}
              onMouseLeave={e => { if (onRowClick) (e.currentTarget as HTMLElement).style.background = striped && ri % 2 === 1 ? 'color-mix(in srgb, var(--color-text-primary) 2%, transparent)' : 'transparent'; }}
            >
              {columns.map(col => (
                <div
                  key={col.key}
                  style={{
                    padding: cellPad,
                    fontSize,
                    color: 'var(--color-text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    textAlign: col.align ?? 'left',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {col.renderCell
                    ? col.renderCell(row, row[col.key])
                    : <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(row[col.key] ?? '—')}</span>
                  }
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
