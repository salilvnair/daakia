import { useState, useRef } from 'react';
import { type KeyValueRow, InsertRowDivider } from './KeyValueTable';
import { StyledDropdown } from './StyledDropdown';
import { ConfirmDialog } from '../modals/ConfirmDialog';
import { CheckCircleFilledIcon, TrashIcon } from '../../../icons';

interface Props {
  rows: KeyValueRow[];
  onChange: (rows: KeyValueRow[]) => void;
  /** Hide the built-in toolbar (when parent manages it) */
  hideToolbar?: boolean;
}

const TYPE_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'file', label: 'File' },
];

export function FormDataTable({ rows, onChange, hideToolbar = false }: Props) {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const fileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const updateRow = (idx: number, patch: Partial<KeyValueRow>) => {
    const updated = [...rows];
    updated[idx] = { ...updated[idx], ...patch };
    onChange(updated);
  };

  const removeRow = (idx: number) => {
    if (rows.length <= 1) {
      onChange([createEmptyRow()]);
      return;
    }
    onChange(rows.filter((_, i) => i !== idx));
  };

  const addRow = () => {
    onChange([...rows, createEmptyRow()]);
  };

  const insertRowAt = (idx: number) => {
    const updated = [...rows];
    updated.splice(idx, 0, createEmptyRow());
    onChange(updated);
  };

  const handleClearAll = () => {
    onChange([createEmptyRow()]);
    setShowClearConfirm(false);
  };

  const handleFileChange = (idx: number, fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const names = Array.from(fileList).map(f => f.name);
    updateRow(idx, { files: names, value: names.join(', ') });
  };

  const lastRow = rows[rows.length - 1];
  const needsEmptyRow = !lastRow || lastRow.key || lastRow.value;

  return (
    <div className="text-[13px]">
      {/* Toolbar */}
      {!hideToolbar && (
      <div className="flex items-center justify-end gap-2 mb-2 px-1">
        {rows.some(r => r.key || r.value) && (
          <button
            type="button"
            onClick={() => setShowClearConfirm(true)}
            className="text-[11px] px-2 py-0.5 rounded text-[var(--color-text-muted)] hover:text-[#ef4444] cursor-pointer transition-colors"
          >
            Clear all
          </button>
        )}
      </div>
      )}

      {/* Header */}
      <div className="grid grid-cols-[32px_1fr_100px_1fr_32px] gap-2 px-1 mb-1.5 items-center">
        <div />
        <div className="text-[var(--color-text-muted)] font-medium text-[10px] uppercase tracking-wide px-2.5">Key</div>
        <div className="text-[var(--color-text-muted)] font-medium text-[10px] uppercase tracking-wide px-2.5">Type</div>
        <div className="text-[var(--color-text-muted)] font-medium text-[10px] uppercase tracking-wide px-2.5">Value</div>
        <div />
      </div>

      {/* Rows */}
      <div className="flex flex-col gap-0">
        {rows.map((row, idx) => (
          <div key={row.id}>
            <div
              className={`grid grid-cols-[32px_1fr_100px_1fr_32px] gap-2 px-1 py-1 group ${!row.enabled ? 'opacity-50' : ''}`}
            >
            {/* Enable/Disable toggle (circle icon — same as KeyValueTable) */}
            <div className="flex items-center justify-center">
              <button
                type="button"
                onClick={() => updateRow(idx, { enabled: !row.enabled })}
                className="cursor-pointer p-0.5"
                title={row.enabled ? 'Disable' : 'Enable'}
              >
                {row.enabled ? (
                  <CheckCircleFilledIcon size={16} checked className="text-[var(--color-success)]" />
                ) : (
                  <CheckCircleFilledIcon size={16} checked={false} />
                )}
              </button>
            </div>

            {/* Key input */}
            <input
              type="text"
              value={row.key}
              onChange={(e) => updateRow(idx, { key: e.target.value })}
              placeholder="Field name"
              className="w-full h-[30px] px-2.5 rounded-md bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[12px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
            />

            {/* Type dropdown */}
            <StyledDropdown
              options={TYPE_OPTIONS}
              value={row.type || 'text'}
              onChange={(v) => updateRow(idx, { type: v as 'text' | 'file', value: v === 'file' ? '' : row.value, files: v === 'file' ? [] : undefined })}
              size="sm"
            />

            {/* Value: text input or file chooser */}
            {(row.type || 'text') === 'text' ? (
              <input
                type="text"
                value={row.value}
                onChange={(e) => updateRow(idx, { value: e.target.value })}
                placeholder="Value"
                className="w-full h-[30px] px-2.5 rounded-md bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[12px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
              />
            ) : (
              <div className="flex items-center gap-2 h-[28px]">
                <button
                  type="button"
                  onClick={() => fileInputRefs.current.get(row.id)?.click()}
                  className="h-[28px] px-2.5 text-[11px] rounded-md bg-[rgba(99,102,241,0.1)] border border-[rgba(99,102,241,0.3)] text-[var(--color-primary)] hover:bg-[rgba(99,102,241,0.18)] cursor-pointer transition-colors whitespace-nowrap"
                >
                  Choose File
                </button>
                <span className="text-[12px] text-[var(--color-text-muted)] truncate flex-1">
                  {row.files && row.files.length > 0 ? row.files.join(', ') : 'No file chosen'}
                </span>
                <input
                  ref={(el) => { if (el) fileInputRefs.current.set(row.id, el); }}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFileChange(idx, e.target.files)}
                />
              </div>
            )}

            {/* Remove button */}
            <div className="flex items-center justify-center">
              <button
                type="button"
                onClick={() => removeRow(idx)}
                className="opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] hover:text-[#ef4444] cursor-pointer transition-all"
              >
                <TrashIcon size={14} />
              </button>
            </div>
            </div>
            <InsertRowDivider onInsert={() => insertRowAt(idx + 1)} />
          </div>
        ))}
      </div>

      {/* Add row */}
      {needsEmptyRow && (
        <button
          type="button"
          onClick={addRow}
          className="w-full text-left px-3 py-2 mt-2 text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors cursor-pointer"
        >
          + Add new
        </button>
      )}

      {/* Clear confirm */}
      {showClearConfirm && (
        <ConfirmDialog
          title="Clear All?"
          message="All form data entries will be permanently deleted."
          confirmLabel="Clear All"
          danger
          onConfirm={handleClearAll}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}
    </div>
  );
}

function createEmptyRow(): KeyValueRow {
  return { id: crypto.randomUUID(), key: '', value: '', enabled: true, type: 'text' };
}
