import { useState, useRef } from 'react';
import { ConfirmDialog } from '../../../components/shared/modals/ConfirmDialog';
import { TrashIcon, BulkEditIcon, PlusIcon, EyeIcon, EyeOffIcon } from '../../../icons';
import type { DuiSize } from '../../core/DuiTypes';
import { KeyValueTableRowView } from './KeyValueTableRowView';
import { IconButtonView } from '../button/IconButtonView';

export interface KeyValueTableRow {
  id: string;
  key: string;
  value: string;
  description?: string;
  enabled: boolean;
  type?: 'text' | 'file';
  files?: string[];
  filePaths?: string[];
  fileData?: string[];
  fileMimeTypes?: string[];
  fileExists?: boolean[];
}

/** A computed/auto-generated row shown above editable rows — read-only, lock icon on left */
export interface PinnedKeyValueRow {
  id: string;
  key: string;
  value: string;
  description?: string;
  /** If true, a trash icon appears on hover and the row can be removed via onPinnedRemove */
  deletable?: boolean;
  /** If true (or auto-detected via SENSITIVE_HEADERS), value is masked with eye-toggle */
  masked?: boolean;
}

export interface KeyValueTableViewProps {
  rows: KeyValueTableRow[];
  onChange: (rows: KeyValueTableRow[]) => void;
  showDescription?: boolean;
  placeholder?: { key?: string; value?: string };
  className?: string;
  /** Show HTTP header key autocomplete + value suggestions */
  autocompleteKeys?: boolean;
  /** Mask values for known sensitive keys (Authorization, token, etc.) */
  maskSensitive?: boolean;
  /** Hide the toolbar row entirely */
  hideToolbar?: boolean;
  /** Left-side label text */
  label?: string;
  /** Accent color for InsertRowDivider and toolbar highlights */
  accentColor?: string;
  /** Extra nodes rendered in toolbar right side (before trash icon) */
  toolbarExtra?: React.ReactNode;
  /** DUI size token — controls input height and font size. Falls back to DuiProvider or 'md'. */
  size?: DuiSize;
  /** Wrap in a rounded border panel */
  bordered?: boolean;
  /**
   * Computed/auto-generated rows — shown as the first N rows with lock icon + dotted border.
   * Hidden by default; revealed via the eye icon next to the label.
   */
  pinnedTopRows?: PinnedKeyValueRow[];
  /** Called when a deletable pinned row is removed */
  onPinnedRemove?: (id: string) => void;
}

function makeRow(): KeyValueTableRow {
  return { id: crypto.randomUUID(), key: '', value: '', description: '', enabled: true };
}

// ─── Insert Row Divider ────────────────────────────────────────────────────────

function InsertRowDivider({ onInsert, accentColor }: { onInsert: () => void; accentColor?: string }) {
  const color = accentColor || 'rgb(99,102,241)';
  return (
    <div className="group/divider relative h-[14px] flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-150">
      <div className="absolute inset-x-4 top-1/2 h-px" style={{ background: `color-mix(in srgb, ${color} 25%, transparent)` }} />
      <button
        type="button"
        onClick={onInsert}
        className="relative z-10 flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium cursor-pointer transition-all"
        style={{
          background: `color-mix(in srgb, ${color} 10%, transparent)`,
          color,
          border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
        }}
      >
        <PlusIcon size={10} />
        Row
      </button>
    </div>
  );
}

// ─── Bulk Edit Textarea ────────────────────────────────────────────────────────

function BulkEditArea({ defaultValue, onChangeRef, accentColor }: {
  defaultValue: string;
  onChangeRef: React.MutableRefObject<string>;
  accentColor?: string;
}) {
  const [text, setText] = useState(defaultValue);
  const [focused, setFocused] = useState(false);
  onChangeRef.current = text;
  const hl = accentColor || 'var(--color-primary)';

  return (
    <div className="flex flex-col gap-1">
      <p className="text-[11px] text-[var(--color-text-muted)] px-1">
        Entries are separated by newline. Keys and values are separated by{' '}
        <code style={{ color: hl }}>:</code>. Prepend <code style={{ color: hl }}>#</code> to disable a row.
      </p>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="w-full min-h-[160px] px-3 py-2.5 rounded-md text-[13px] font-mono text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none resize-y"
        style={{
          background: 'var(--color-input-bg)',
          border: `1px solid ${focused ? hl : 'var(--color-input-border)'}`,
          transition: 'border-color 120ms',
        }}
        placeholder={`Content-Type: application/json\nAuthorization: Bearer token123\n# X-Debug: true`}
        spellCheck={false}
      />
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function KeyValueTableView({
  rows,
  onChange,
  showDescription = false,
  placeholder,
  className = '',
  autocompleteKeys = false,
  maskSensitive = false,
  hideToolbar = false,
  label,
  accentColor,
  toolbarExtra,
  size,
  bordered = false,
  pinnedTopRows,
  onPinnedRemove,
}: KeyValueTableViewProps) {
  const [bulkEdit, setBulkEdit] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showPinned, setShowPinned] = useState(false);
  const bulkTextRef = useRef('');
  const accent = accentColor || 'var(--color-primary)';
  const hasPinned = pinnedTopRows && pinnedTopRows.length > 0;

  const updateRow = (idx: number, field: keyof KeyValueTableRow, value: string | boolean) => {
    const updated = [...rows];
    updated[idx] = { ...updated[idx], [field]: value };
    onChange(updated);
  };

  const addRow = () => onChange([...rows, makeRow()]);

  const insertRowAt = (idx: number) => {
    const updated = [...rows];
    updated.splice(idx, 0, makeRow());
    onChange(updated);
  };

  const removeRow = (idx: number) => {
    if (rows.length <= 1) { onChange([makeRow()]); return; }
    onChange(rows.filter((_, i) => i !== idx));
  };

  const toBulkText = () =>
    rows.filter(r => r.key || r.value)
      .map(r => `${!r.enabled ? '# ' : ''}${r.key}: ${r.value}`)
      .join('\n');

  const fromBulkText = (text: string) => {
    const parsed = text.split('\n').map(line => {
      const disabled = line.startsWith('# ');
      const clean = disabled ? line.slice(2) : line;
      const ci = clean.indexOf(':');
      const key = ci >= 0 ? clean.slice(0, ci).trim() : clean.trim();
      const value = ci >= 0 ? clean.slice(ci + 1).trim() : '';
      return { id: crypto.randomUUID(), key, value, description: '', enabled: !disabled };
    }).filter(r => r.key || r.value);
    onChange(parsed.length ? parsed : [makeRow()]);
  };

  const handleClearAll = () => { onChange([makeRow()]); setShowClearConfirm(false); setBulkEdit(false); };
  const hasRows = rows.some(r => r.key || r.value);
  const gridCols = showDescription ? 'grid-cols-[32px_1fr_1fr_1fr_32px]' : 'grid-cols-[32px_1fr_1fr_32px]';

  return (
    <div className={`text-[13px] ${bordered ? 'border border-[var(--color-surface-border)] rounded-md overflow-hidden' : ''} ${className}`}>
      {/* Toolbar: label left, icon buttons right */}
      {!hideToolbar && (
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="flex items-center gap-1.5">
            {hasPinned && (
              <button
                type="button"
                onClick={() => setShowPinned(p => !p)}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-all"
                style={{
                  color: showPinned ? accent : 'var(--color-text-muted)',
                  background: showPinned ? `color-mix(in srgb, ${accent} 10%, transparent)` : 'transparent',
                  border: `1px solid ${showPinned ? `color-mix(in srgb, ${accent} 25%, transparent)` : 'transparent'}`,
                }}
                title={showPinned ? 'Hide computed headers' : 'Show computed headers'}
              >
                {showPinned
                  ? <EyeIcon size={12} />
                  : <EyeOffIcon size={12} />}
                <span>{pinnedTopRows!.length} hidden</span>
              </button>
            )}
            {!hasPinned && <div />}
          </div>
          <div className="flex items-center gap-0.5">
            {toolbarExtra}
            <IconButtonView
              icon={<TrashIcon size={14} />}
              size="md"
              tooltip="Clear all"
              disabled={!hasRows}
              style={{ '--dui-hover-color': 'var(--color-error)', '--dui-hover-bg': 'color-mix(in srgb, var(--color-error) 8%, transparent)' } as React.CSSProperties}
              onClick={() => { if (hasRows) setShowClearConfirm(true); }}
            />
            <IconButtonView
              icon={<BulkEditIcon size={14} />}
              size="md"
              tooltip="Bulk edit"
              active={bulkEdit}
              activeColor={accent}
              onClick={() => { if (bulkEdit) fromBulkText(bulkTextRef.current); setBulkEdit(!bulkEdit); }}
            />
            <IconButtonView
              icon={<PlusIcon size={14} />}
              size="md"
              tooltip="Add new row"
              style={{ '--dui-hover-color': accent, '--dui-hover-bg': `color-mix(in srgb, ${accent} 8%, transparent)` } as React.CSSProperties}
              onClick={addRow}
            />
          </div>
        </div>
      )}

      {bulkEdit ? (
        <BulkEditArea defaultValue={toBulkText()} onChangeRef={bulkTextRef} accentColor={accentColor} />
      ) : (
        <>
          {/* Column headers */}
          <div className={`grid ${gridCols} gap-2 px-1 mb-1.5 items-center`}>
            <div />
            <div className="text-[var(--color-text-muted)] font-medium text-[10px] uppercase tracking-wide px-2.5">{label || 'Key'}</div>
            <div className="text-[var(--color-text-muted)] font-medium text-[10px] uppercase tracking-wide px-2.5">Value</div>
            {showDescription && (
              <div className="text-[var(--color-text-muted)] font-medium text-[10px] uppercase tracking-wide px-2.5">Description</div>
            )}
            <div />
          </div>

          {/* Pinned (computed) rows — shown first when eye is toggled on */}
          {hasPinned && showPinned && (
            <div className="flex flex-col mb-1.5">
              {pinnedTopRows!.map(pRow => (
                <KeyValueTableRowView
                  key={pRow.id}
                  rowKey={pRow.key}
                  value={pRow.value}
                  description={pRow.description}
                  readOnly
                  masked={pRow.masked}
                  maskSensitive
                  deletable={pRow.deletable}
                  showDescription={showDescription}
                  size={size}
                  onRemove={pRow.deletable && onPinnedRemove ? () => onPinnedRemove(pRow.id) : undefined}
                />
              ))}
              <div className="my-1.5 border-b border-dashed" style={{ borderColor: 'color-mix(in srgb, var(--color-text-primary) 10%, transparent)' }} />
            </div>
          )}

          {/* Rows with InsertRowDivider between them */}
          <div className="flex flex-col gap-0">
            {rows.map((row, idx) => (
              <div key={row.id}>
                <div className="py-1">
                  <KeyValueTableRowView
                    rowKey={row.key}
                    value={row.value}
                    description={row.description}
                    enabled={row.enabled}
                    maskSensitive={maskSensitive}
                    showDescription={showDescription}
                    placeholder={placeholder}
                    autocompleteKeys={autocompleteKeys}
                    size={size}
                    accentColor={accentColor}
                    deletable
                    onKeyChange={val => updateRow(idx, 'key', val)}
                    onValueChange={val => updateRow(idx, 'value', val)}
                    onDescriptionChange={val => updateRow(idx, 'description', val)}
                    onEnabledChange={enabled => updateRow(idx, 'enabled', enabled)}
                    onRemove={() => removeRow(idx)}
                  />
                </div>
                <InsertRowDivider onInsert={() => insertRowAt(idx + 1)} accentColor={accentColor} />
              </div>
            ))}
          </div>
        </>
      )}

      {showClearConfirm && (
        <ConfirmDialog
          title="Clear All?"
          message="All entries will be permanently deleted. This cannot be undone."
          confirmLabel="Clear All"
          danger
          onConfirm={handleClearAll}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}
    </div>
  );
}
