import { useState, useRef } from 'react';
import { SelectInputView } from './SelectInputView';
import { CheckCircleFilledIcon, TrashIcon, PlusIcon, DownloadIcon } from '../../../icons';

export interface FormDataRow {
  id: string;
  key: string;
  value: string;
  type: 'text' | 'file';
  enabled: boolean;
  fileNames?: string[];
  fileData?: string[];   // base64
  fileMimeTypes?: string[];
}

export interface FormDataTableViewProps {
  rows: FormDataRow[];
  onChange: (rows: FormDataRow[]) => void;
  /** Called when a file row's picker resolves. Pass undefined to handle file reads externally. */
  onFileSelect?: (rowId: string, files: File[]) => void;
  accentColor?: string;
  label?: string;
  hideToolbar?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

function createRow(): FormDataRow {
  return { id: crypto.randomUUID(), key: '', value: '', type: 'text', enabled: true };
}

const TYPE_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'file', label: 'File' },
];

export function FormDataTableView({
  rows,
  onChange,
  onFileSelect,
  accentColor,
  label,
  hideToolbar = false,
  className = '',
  style,
}: FormDataTableViewProps) {
  const [confirmClear, setConfirmClear] = useState(false);
  const fileRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const accent = accentColor || 'var(--color-primary)';

  const updateRow = (idx: number, patch: Partial<FormDataRow>) => {
    const next = [...rows];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const removeRow = (idx: number) => {
    if (rows.length <= 1) { onChange([createRow()]); return; }
    onChange(rows.filter((_, i) => i !== idx));
  };

  const addRow = () => onChange([...rows, createRow()]);

  const handleFileChange = async (idx: number, fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const row = rows[idx];
    if (onFileSelect) {
      onFileSelect(row.id, files);
      return;
    }
    // Default: read to base64 locally
    const names = files.map(f => f.name);
    const mimeTypes = files.map(f => f.type || 'application/octet-stream');
    const base64Data: string[] = [];
    for (const file of files) {
      const data = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.includes(',') ? result.split(',')[1] : result);
        };
        reader.readAsDataURL(file);
      });
      base64Data.push(data);
    }
    updateRow(idx, { fileNames: names, value: names.join(', '), fileData: base64Data, fileMimeTypes: mimeTypes });
  };

  const downloadFile = (row: FormDataRow) => {
    if (!row.fileData || !row.fileNames) return;
    for (let i = 0; i < row.fileData.length; i++) {
      const mime = row.fileMimeTypes?.[i] || 'application/octet-stream';
      const blob = new Blob([Uint8Array.from(atob(row.fileData[i]), c => c.charCodeAt(0))], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = row.fileNames[i] || 'file';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const hasContent = rows.some(r => r.key || r.value);

  const inputStyle: React.CSSProperties = {
    flex: 1, height: 28, padding: '0 10px', borderRadius: 4, fontSize: 11,
    background: 'color-mix(in srgb, var(--color-text-primary) 4%, transparent)',
    border: '1px solid var(--color-surface-border)',
    color: 'var(--color-text-primary)',
    outline: 'none',
    fontFamily: 'inherit',
  };

  return (
    <div className={className} style={{ fontSize: 12, ...style }}>
      {/* Toolbar */}
      {!hideToolbar && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, justifyContent: 'space-between' }}>
          {label && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>}
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            {hasContent && !confirmClear && (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 11, padding: '2px 6px', borderRadius: 4, fontFamily: 'inherit' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-error)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-muted)'; }}
              >
                Clear all
              </button>
            )}
            {confirmClear && (
              <>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Clear all?</span>
                <button type="button" onClick={() => { onChange([createRow()]); setConfirmClear(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)', fontSize: 11, padding: '2px 6px', fontFamily: 'inherit' }}>Yes</button>
                <button type="button" onClick={() => setConfirmClear(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 11, padding: '2px 6px', fontFamily: 'inherit' }}>No</button>
              </>
            )}
            <button
              type="button"
              onClick={addRow}
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: accent, fontSize: 11, padding: '2px 6px', borderRadius: 4, fontFamily: 'inherit' }}
            >
              <PlusIcon size={11} /> Add row
            </button>
          </div>
        </div>
      )}

      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 90px 1fr 28px', gap: '4px 8px', padding: '0 2px', marginBottom: 4 }}>
        <div />
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 4px' }}>Key</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 4px' }}>Type</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 4px' }}>Value / File</div>
        <div />
      </div>

      {/* Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {rows.map((row, idx) => (
          <div
            key={row.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '28px 1fr 90px 1fr 28px',
              gap: '4px 8px',
              padding: '2px 2px',
              alignItems: 'center',
              opacity: row.enabled ? 1 : 0.45,
            }}
          >
            {/* Enable/Disable */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => updateRow(idx, { enabled: !row.enabled })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: row.enabled ? 'var(--color-success)' : 'var(--color-text-muted)', display: 'flex' }}
                title={row.enabled ? 'Disable' : 'Enable'}
              >
                <CheckCircleFilledIcon size={15} checked={row.enabled} />
              </button>
            </div>

            {/* Key */}
            <input
              type="text"
              value={row.key}
              onChange={e => updateRow(idx, { key: e.target.value })}
              placeholder="Field name"
              style={inputStyle}
              onFocus={e => { e.currentTarget.style.borderColor = accent; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--color-surface-border)'; }}
            />

            {/* Type */}
            <SelectInputView
              options={TYPE_OPTIONS}
              value={row.type}
              onChange={v => updateRow(idx, { type: v as 'text' | 'file', value: v === 'file' ? '' : row.value, fileNames: undefined, fileData: undefined })}
              accentColor={accent}
            />

            {/* Value / File */}
            {row.type === 'text' ? (
              <input
                type="text"
                value={row.value}
                onChange={e => updateRow(idx, { value: e.target.value })}
                placeholder="Value"
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = accent; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--color-surface-border)'; }}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 28 }}>
                <button
                  type="button"
                  onClick={() => fileRefs.current.get(row.id)?.click()}
                  style={{
                    height: 26, padding: '0 10px', fontSize: 11, borderRadius: 4, cursor: 'pointer',
                    background: `color-mix(in srgb, ${accent} 10%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${accent} 30%, transparent)`,
                    color: accent, whiteSpace: 'nowrap', fontFamily: 'inherit',
                  }}
                >
                  Choose File
                </button>
                {row.fileNames && row.fileNames.length > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, overflow: 'hidden' }}>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {row.fileNames.join(', ')}
                    </span>
                    {row.fileData && (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); downloadFile(row); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', flexShrink: 0 }}
                        title="Download file"
                      >
                        <DownloadIcon size={13} />
                      </button>
                    )}
                  </div>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>No file chosen</span>
                )}
                <input
                  ref={el => { if (el) fileRefs.current.set(row.id, el); }}
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  onChange={e => handleFileChange(idx, e.target.files)}
                />
              </div>
            )}

            {/* Delete */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => removeRow(idx)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 2, display: 'flex', opacity: rows.length === 1 && !row.key && !row.value ? 0.3 : 1 }}
                title="Remove row"
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-error)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-muted)'; }}
              >
                <TrashIcon size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
