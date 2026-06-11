import { useState } from 'react';
import { CloseIcon } from '../../icons';
import { toHexSafe } from './utils';
import type { ThemeSchemaEntry } from './core';

interface ColorEditorProps {
  entry: Pick<ThemeSchemaEntry, 'cssVar' | 'key' | 'comment'>;
  currentValue: string;
  isOverridden: boolean;
  onApply: (v: string) => void;
  onReset: () => void;
  onClose: () => void;
}

export function ColorEditor({ entry, currentValue, isOverridden, onApply, onReset, onClose }: ColorEditorProps) {
  const [draft, setDraft] = useState(currentValue);
  const isHex = /^#[0-9a-fA-F]{6}$/.test(draft.trim());

  const commit = (v: string) => { setDraft(v); onApply(v); };

  return (
    <div style={{
      margin: '6px 0 4px', padding: '10px 12px',
      background: 'var(--color-elevated)',
      border: '1px solid var(--color-primary)',
      borderRadius: '8px',
      display: 'flex', flexDirection: 'column', gap: '8px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <code style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: 'monospace', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.cssVar}
        </code>
        <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{entry.comment}</span>
        <button
          type="button"
          onClick={onClose}
          style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-muted)', borderRadius: 4, flexShrink: 0 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-text-primary)'; (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-text-muted)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <CloseIcon size={11} />
        </button>
      </div>

      {/* Picker row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label style={{ position: 'relative', flexShrink: 0, cursor: 'pointer' }}>
          <div style={{ width: 30, height: 30, borderRadius: 6, background: `var(${entry.cssVar})`, border: '2px solid var(--color-surface-border)', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.15)' }} />
          <input
            type="color"
            value={toHexSafe(draft)}
            onChange={e => commit(e.target.value)}
            style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer', padding: 0, border: 'none' }}
          />
        </label>

        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(draft); if (e.key === 'Escape') onClose(); }}
          onBlur={() => { if (draft !== currentValue) commit(draft); }}
          placeholder="e.g. #6366f1 or rgba(99,102,241,0.4)"
          style={{
            flex: 1, height: 30, padding: '0 10px', borderRadius: 6,
            background: 'var(--color-input-bg)',
            border: `1px solid ${isHex ? 'var(--color-input-border)' : 'var(--color-warning)'}`,
            color: 'var(--color-text-primary)', fontSize: 11,
            fontFamily: 'Menlo, Monaco, monospace', outline: 'none',
          }}
          onFocus={e => { (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--color-primary)'; }}
        />

        {isOverridden && (
          <button
            type="button"
            onClick={onReset}
            title="Reset to built-in default"
            style={{ height: 30, padding: '0 10px', borderRadius: 6, border: '1px solid var(--color-surface-border)', background: 'transparent', color: 'var(--color-text-muted)', fontSize: 10, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-error)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-error)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-text-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-surface-border)'; }}
          >
            ↺ Reset
          </button>
        )}
      </div>

      {draft && !isHex && (
        <div style={{ fontSize: 10, color: 'var(--color-warning)', lineHeight: 1.4 }}>
          Non-hex value (e.g. rgba, color-mix, var) — color picker shows approximate. Press Enter to apply.
        </div>
      )}
    </div>
  );
}
