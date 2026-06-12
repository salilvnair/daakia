import { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from '../../../icons';
import type { DuiSize } from '../../core/DuiTypes';
import { useDui } from '../../core/DuiContext';
import { DUI_HEIGHT, DUI_FONT_SIZE } from '../../core/DuiTokens';
import { EmptyStateView } from './EmptyStateView';
import './DataTableView.css';

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
  renderExpanded?: (row: T) => React.ReactNode;
  emptyTitle?: string;
  emptyMessage?: string;
  striped?: boolean;
  /** Reduces padding to match 'sm' size. Prefer `size` for token-aligned sizing. */
  compact?: boolean;
  /** Falls back to DuiProvider size when omitted. */
  size?: DuiSize;
  sortable?: boolean;
  maxHeight?: string;
  className?: string;
}

export function DataTableView<T extends Record<string, unknown>>({
  columns,
  rows,
  keyField = 'id',
  onRowClick,
  renderExpanded,
  emptyTitle = 'No data',
  emptyMessage,
  striped = false,
  compact = false,
  size,
  maxHeight,
  className = '',
}: DataTableViewProps<T>) {
  const ctx = useDui();
  const s = compact ? 'sm' : (size ?? ctx.size);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const handleSort = (col: DataTableColumn<T>) => {
    if (!col.sortable) return;
    if (sortKey === col.key) {
      setSortAsc(a => !a);
    } else {
      setSortKey(col.key);
      setSortAsc(true);
    }
  };

  const toggleExpand = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedKeys(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const sorted = sortKey
    ? [...rows].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        const cmp = String(av ?? '').localeCompare(String(bv ?? ''));
        return sortAsc ? cmp : -cmp;
      })
    : rows;

  const expandCol = renderExpanded ? '28px ' : '';
  const colTemplate = expandCol + columns.map(c => c.width ?? '1fr').join(' ');
  const rowH = DUI_HEIGHT.table[s];
  const cellPad = `${Math.round((rowH - 16) / 2)}px 12px`;
  const fontSize = DUI_FONT_SIZE[s];

  // When rows can expand, the table must grow naturally so expanded content
  // pushes siblings down instead of scrolling them out of view.
  const pushMode = !!renderExpanded;

  return (
    <div
      className={className}
      style={{
        border: '1px solid var(--color-surface-border)',
        borderRadius: '6px',
        overflow: 'hidden',
        ...(pushMode ? {} : { maxHeight, display: 'flex', flexDirection: 'column' }),
      }}
    >
      {/* Header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: colTemplate,
        background: 'var(--color-panel)',
        borderBottom: '1px solid var(--color-surface-border)',
        flexShrink: 0,
      }}>
        {renderExpanded && <div />}
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

      {/* Body — push mode: natural flow so expanded rows push siblings; scroll mode: body scrolls within maxHeight */}
      <div style={pushMode ? {} : { flex: 1, overflowY: 'auto' }}>
        {sorted.length === 0 ? (
          <EmptyStateView title={emptyTitle} message={emptyMessage} compact />
        ) : (
          sorted.map((row, ri) => {
            const rowKey = String(row[keyField] ?? ri);
            const isExpanded = expandedKeys.has(rowKey);
            const bgDefault = striped && ri % 2 === 1
              ? 'var(--color-table-stripe)'
              : 'transparent';

            return (
              <div
                key={rowKey}
                style={{
                  borderBottom: ri < sorted.length - 1 ? '1px solid var(--color-surface-border)' : 'none',
                }}
              >
                {/* Data row */}
                <div
                  onClick={() => onRowClick?.(row)}
                  className={`dui_data-table__row${(onRowClick || renderExpanded) ? ' dui_data-table__row--clickable' : ''}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: colTemplate,
                    background: bgDefault,
                    cursor: onRowClick ? 'pointer' : 'default',
                  }}
                >
                  {/* Expand toggle */}
                  {renderExpanded && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                      onClick={e => toggleExpand(rowKey, e)}
                    >
                      <ChevronRightIcon
                        size={12}
                        style={{
                          color: 'var(--color-text-muted)',
                          transition: 'transform 120ms',
                          transform: isExpanded ? 'rotate(90deg)' : 'none',
                          flexShrink: 0,
                        }}
                      />
                    </div>
                  )}
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

                {/* Expanded row */}
                {renderExpanded && isExpanded && (
                  <div style={{
                    background: 'color-mix(in srgb, var(--color-text-primary) 3%, transparent)',
                    borderTop: '1px solid var(--color-surface-border)',
                  }}>
                    {renderExpanded(row)}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
