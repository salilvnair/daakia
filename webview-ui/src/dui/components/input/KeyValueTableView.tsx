import { useState, useCallback } from 'react';
import { TrashIcon, PlusIcon, BulkEditIcon } from '../../../icons';
import { KeyValueItemView } from './KeyValueItemView';

export interface KeyValueTableRow {
  id: string;
  key: string;
  value: string;
  description?: string;
  enabled: boolean;
}

export interface KeyValueTableViewProps {
  rows: KeyValueTableRow[];
  onChange: (rows: KeyValueTableRow[]) => void;
  showDescription?: boolean;
  placeholder?: { key?: string; value?: string; description?: string };
  label?: string;
  accentColor?: string;
  /** Wrap in a rounded border (default false — matches REST headers flat style) */
  bordered?: boolean;
  /** Show the bulk-edit textarea toggle (default true) */
  bulkEdit?: boolean;
  /** Extra toolbar buttons rendered before the trash icon */
  toolbarExtra?: React.ReactNode;
  className?: string;
}

function makeRow(): KeyValueTableRow {
  return { id: crypto.randomUUID(), key: '', value: '', description: '', enabled: true };
}

// ─── Insert Row Divider ────────────────────────────────────────────────────────

interface InsertRowDividerProps {
  onInsert: () => void;
  accentColor?: string;
}

function InsertRowDivider({ onInsert, accentColor }: InsertRowDividerProps) {
  const color = accentColor || 'var(--color-primary)';
  return (
    <div
      style={{
        position: 'relative', height: 14,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: 0, transition: 'opacity 150ms',
      }}
      className="group/divider hover:opacity-100"
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '0'}
    >
      {/* Horizontal line */}
      <div style={{
        position: 'absolute', left: 16, right: 16, top: '50%',
        height: 1,
        background: `color-mix(in srgb, ${color} 25%, transparent)`,
      }} />
      {/* + Row pill */}
      <button
        type="button"
        onClick={onInsert}
        style={{
          position: 'relative', zIndex: 1,
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '1px 10px', borderRadius: 99,
          fontSize: 11, fontWeight: 500,
          color: color,
          background: `color-mix(in srgb, ${color} 10%, var(--color-surface, transparent))`,
          border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <PlusIcon size={10} />
        Row
      </button>
    </div>
  );
}

// ─── Bulk Edit Textarea ────────────────────────────────────────────────────────

function BulkEditArea({
  rows, onApply, accentColor,
}: {
  rows: KeyValueTableRow[];
  onApply: (rows: KeyValueTableRow[]) => void;
  accentColor?: string;
}) {
  const highlight = accentColor || 'var(--color-primary)';
  const [text, setText] = useState(() =>
    rows.filter(r => r.key || r.value)
      .map(r => `${!r.enabled ? '# ' : ''}${r.key}: ${r.value}`)
      .join('\n')
  );
  const [focused, setFocused] = useState(false);

  const apply = () => {
    const parsed = text.split('\n').map(line => {
      const disabled = line.startsWith('# ');
      const clean = disabled ? line.slice(2) : line;
      const colon = clean.indexOf(':');
      const key = colon >= 0 ? clean.slice(0, colon).trim() : clean.trim();
      const value = colon >= 0 ? clean.slice(colon + 1).trim() : '';
      return { id: crypto.randomUUID(), key, value, description: '', enabled: !disabled };
    }).filter(r => r.key || r.value);
    onApply(parsed.length ? parsed : [makeRow()]);
  };

  return (
    <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>
        One entry per line.&nbsp;
        <code style={{ color: highlight }}>Key: Value</code>.&nbsp;
        Prefix&nbsp;<code style={{ color: highlight }}>#</code>&nbsp;to disable.
      </p>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); apply(); }}
        rows={6}
        spellCheck={false}
        placeholder={`Content-Type: application/json\nAuthorization: Bearer token\n# X-Debug: true`}
        style={{
          width: '100%', padding: '8px 10px',
          borderRadius: 6, resize: 'vertical',
          background: 'color-mix(in srgb, var(--color-text-primary) 4%, transparent)',
          border: `1px solid ${focused ? highlight : 'color-mix(in srgb, var(--color-text-primary) 8%, transparent)'}`,
          color: 'var(--color-text-primary)',
          fontSize: 12, fontFamily: 'monospace',
          outline: 'none', boxSizing: 'border-box',
          transition: 'border-color 120ms',
        }}
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
  label,
  accentColor,
  bordered = false,
  bulkEdit: allowBulkEdit = true,
  toolbarExtra,
  className = '',
}: KeyValueTableViewProps) {
  const [isBulkEdit, setIsBulkEdit] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const accent = accentColor || 'var(--color-primary)';

  const updateRow = useCallback((idx: number, field: keyof KeyValueTableRow, val: string | boolean) => {
    const updated = [...rows];
    updated[idx] = { ...updated[idx], [field]: val };
    onChange(updated);
  }, [rows, onChange]);

  const addRow = useCallback(() => onChange([...rows, makeRow()]), [rows, onChange]);

  const insertRowAt = useCallback((idx: number) => {
    const updated = [...rows];
    updated.splice(idx + 1, 0, makeRow());
    onChange(updated);
  }, [rows, onChange]);

  const removeRow = useCallback((idx: number) => {
    if (rows.length <= 1) { onChange([makeRow()]); return; }
    onChange(rows.filter((_, i) => i !== idx));
  }, [rows, onChange]);

  const clearAll = useCallback(() => {
    onChange([makeRow()]);
    setShowClearConfirm(false);
  }, [onChange]);

  const enabledCount = rows.filter(r => r.enabled && (r.key || r.value)).length;

  const hasBulkEdit = allowBulkEdit;
  const hasRows = rows.some(r => r.key || r.value);

  const gridCols = `32px 1fr 1fr${showDescription ? ' 1fr' : ''} 32px`;

  return (
    <div
      className={className}
      style={{
        display: 'flex', flexDirection: 'column',
        ...(bordered ? {
          border: '1px solid var(--color-surface-border)',
          borderRadius: 6, overflow: 'hidden',
        } : {}),
      }}
    >
      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: bordered ? 0 : 6,
        padding: bordered ? '6px 10px' : '0 2px',
        ...(bordered ? {
          background: 'var(--color-panel)',
          borderBottom: '1px solid var(--color-surface-border)',
        } : {}),
      }}>
        {/* Label + count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {label && (
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-muted)' }}>
              {label}
            </span>
          )}
          {enabledCount > 0 && (
            <span style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 99, fontWeight: 600,
              background: `color-mix(in srgb, ${accent} 12%, transparent)`,
              color: accent,
            }}>
              {enabledCount}
            </span>
          )}
        </div>

        {/* Icon buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {toolbarExtra}

          {/* Confirm clear */}
          {showClearConfirm ? (
            <>
              <span style={{ fontSize: 10, color: 'var(--color-text-muted)', marginRight: 4 }}>Clear all?</span>
              <button type="button" onClick={clearAll} style={dangerBtn}>Yes</button>
              <button type="button" onClick={() => setShowClearConfirm(false)} style={muteBtn}>No</button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => { if (hasRows) setShowClearConfirm(true); }}
              title="Clear all"
              style={{ ...iconBtn, opacity: hasRows ? 1 : 0.3, cursor: hasRows ? 'pointer' : 'default' }}
              onMouseEnter={e => { if (hasRows) (e.currentTarget as HTMLElement).style.color = 'var(--color-error)'; }}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--color-text-muted)'}
            >
              <TrashIcon size={13} />
            </button>
          )}

          {hasBulkEdit && (
            <button
              type="button"
              onClick={() => setIsBulkEdit(v => !v)}
              title="Bulk edit"
              style={{
                ...iconBtn,
                color: isBulkEdit ? accent : 'var(--color-text-muted)',
                background: isBulkEdit ? `color-mix(in srgb, ${accent} 12%, transparent)` : 'transparent',
              }}
            >
              <BulkEditIcon size={13} />
            </button>
          )}

          <button
            type="button"
            onClick={addRow}
            title="Add row"
            style={iconBtn}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = accent}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--color-text-muted)'}
          >
            <PlusIcon size={13} />
          </button>
        </div>
      </div>

      {/* ── Bulk edit mode ── */}
      {isBulkEdit ? (
        <BulkEditArea
          rows={rows}
          accentColor={accentColor}
          onApply={r => { onChange(r); setIsBulkEdit(false); }}
        />
      ) : (
        <>
          {/* ── Column headers ── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: gridCols,
            gap: 8,
            padding: '0 2px 4px',
          }}>
            <div />
            {['Key', 'Value', ...(showDescription ? ['Description'] : [])].map(h => (
              <div key={h} style={{
                paddingLeft: 10, fontSize: 9, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.07em',
                color: 'var(--color-text-muted)',
              }}>
                {h}
              </div>
            ))}
            <div />
          </div>

          {/* ── Rows + InsertRowDivider ── */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {rows.map((row, idx) => (
              <div key={row.id}>
                <div style={{ padding: '2px 2px' }}>
                  <KeyValueItemView
                    keyValue={row.key}
                    value={row.value}
                    description={showDescription ? (row.description ?? '') : undefined}
                    enabled={row.enabled}
                    placeholder={placeholder}
                    accentColor={accentColor}
                    onKeyChange={v => updateRow(idx, 'key', v)}
                    onValueChange={v => updateRow(idx, 'value', v)}
                    onDescriptionChange={showDescription ? v => updateRow(idx, 'description', v) : undefined}
                    onToggleEnabled={() => updateRow(idx, 'enabled', !row.enabled)}
                    onDelete={() => removeRow(idx)}
                  />
                </div>
                <InsertRowDivider onInsert={() => insertRowAt(idx)} accentColor={accentColor} />
              </div>
            ))}
          </div>

          {/* ── Add Row footer ── */}
          <button
            type="button"
            onClick={addRow}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 4px',
              fontSize: 10, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.05em',
              color: accent, cursor: 'pointer', border: 'none',
              background: 'transparent', fontFamily: 'inherit',
              borderTop: bordered
                ? `1px dashed color-mix(in srgb, ${accent} 25%, transparent)`
                : 'none',
              marginTop: 2,
              transition: 'background 100ms',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = `color-mix(in srgb, ${accent} 5%, transparent)`}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
          >
            <PlusIcon size={11} />
            Add Row
          </button>
        </>
      )}
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 24, height: 24, borderRadius: 4, border: 'none',
  background: 'transparent', cursor: 'pointer',
  color: 'var(--color-text-muted)',
  transition: 'color 100ms, background 100ms',
};

const dangerBtn: React.CSSProperties = {
  fontSize: 10, padding: '2px 7px', borderRadius: 3,
  border: '1px solid var(--color-error)', background: 'transparent',
  color: 'var(--color-error)', cursor: 'pointer', fontFamily: 'inherit',
};

const muteBtn: React.CSSProperties = {
  fontSize: 10, padding: '2px 7px', borderRadius: 3,
  border: '1px solid var(--color-surface-border)', background: 'transparent',
  color: 'var(--color-text-muted)', cursor: 'pointer', fontFamily: 'inherit',
};
