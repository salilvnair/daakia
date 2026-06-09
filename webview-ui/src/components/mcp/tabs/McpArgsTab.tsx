import { useCallback, useState, useRef } from 'react';
import { useTabsStore } from '../../../store/tabs-store';
import { TrashIcon, BulkEditIcon } from '../../../icons';

const ACCENT = 'var(--color-protocol-mcp)';

/**
 * McpArgsTab — Arguments list for the MCP STDIO process.
 * Each row is one argument, ordered top-to-bottom. Supports bulk edit mode.
 */
export function McpArgsTab() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);
  const args = activeTab?.mcpArgs || [];
  const [bulkEdit, setBulkEdit] = useState(false);
  const bulkTextRef = useRef('');

  const setArgs = useCallback((newArgs: string[]) => {
    if (!activeTab) return;
    updateTab(activeTab.id, { mcpArgs: newArgs, dirty: true });
  }, [activeTab, updateTab]);

  const handleChange = useCallback((idx: number, value: string) => {
    const updated = [...args];
    updated[idx] = value;
    // If last row is non-empty, auto-add a new empty row
    if (idx === args.length - 1 && value.trim()) {
      updated.push('');
    }
    setArgs(updated);
  }, [args, setArgs]);

  const handleRemove = useCallback((idx: number) => {
    const updated = args.filter((_, i) => i !== idx);
    setArgs(updated.length === 0 ? [''] : updated);
  }, [args, setArgs]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, idx: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const updated = [...args];
      updated.splice(idx + 1, 0, '');
      setArgs(updated);
      // Focus next row after render
      setTimeout(() => {
        const next = document.querySelector(`[data-arg-idx="${idx + 1}"]`) as HTMLInputElement;
        next?.focus();
      }, 0);
    }
    if (e.key === 'Backspace' && args[idx] === '' && args.length > 1) {
      e.preventDefault();
      handleRemove(idx);
      setTimeout(() => {
        const prev = document.querySelector(`[data-arg-idx="${Math.max(0, idx - 1)}"]`) as HTMLInputElement;
        prev?.focus();
      }, 0);
    }
  }, [args, setArgs, handleRemove]);

  const toggleBulkEdit = useCallback(() => {
    if (bulkEdit) {
      // Leaving bulk edit — parse text back to args
      const parsed = bulkTextRef.current.split('\n').filter(line => line.trim() !== '');
      setArgs(parsed.length === 0 ? [''] : parsed);
    }
    setBulkEdit(!bulkEdit);
  }, [bulkEdit, setArgs]);

  if (!activeTab) return null;

  // Ensure there's always at least one empty row
  const displayArgs = args.length === 0 || args[args.length - 1] !== '' ? [...args, ''] : args;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable] px-3 py-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Arguments</span>
          <span className="text-[10px] text-[var(--color-text-muted)]">— one per row, in order</span>
        </div>
        <button
          type="button"
          onClick={toggleBulkEdit}
          className={`w-7 h-7 flex items-center justify-center rounded cursor-pointer transition-colors ${
            bulkEdit
              ? 'bg-[rgba(99,102,241,0.12)]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.06)]'
          }`}
          style={bulkEdit ? { color: ACCENT } : undefined}
          title="Bulk edit — edit all arguments as multiline text"
        >
          <BulkEditIcon size={14} />
        </button>
      </div>

      {bulkEdit ? (
        <BulkEditArea defaultValue={args.filter(Boolean).join('\n')} onChangeRef={bulkTextRef} />
      ) : (
        /* Rows */
        <div className="flex flex-col gap-1">
          {displayArgs.map((arg, idx) => (
            <div key={idx} className="flex items-center gap-1.5 group">
              {/* Index */}
              <span className="w-[22px] text-[10px] text-[var(--color-text-muted)] font-mono text-right shrink-0 select-none">
                {idx + 1}.
              </span>
              {/* Input */}
              <input
                data-arg-idx={idx}
                type="text"
                value={arg}
                onChange={(e) => handleChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, idx)}
                placeholder={idx === 0 ? '-m' : idx === 1 ? 'app_mcp.server' : 'argument...'}
                className="flex-1 h-[28px] px-2.5 text-[12px] rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] font-mono text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-protocol-mcp)]"
              />
              {/* Remove button — always reserve space for uniform width */}
              <div className="w-[24px] shrink-0 flex items-center justify-center">
                {displayArgs.length > 1 && arg !== '' && (
                  <button
                    type="button"
                    onClick={() => handleRemove(idx)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-opacity cursor-pointer"
                  >
                    <TrashIcon size={12} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BulkEditArea({ defaultValue, onChangeRef }: { defaultValue: string; onChangeRef: React.MutableRefObject<string> }) {
  const [text, setText] = useState(defaultValue);
  const [focused, setFocused] = useState(false);
  onChangeRef.current = text;

  return (
    <div className="flex flex-col gap-1">
      <p className="text-[11px] text-[var(--color-text-muted)] px-1">
        One argument per line. Lines are passed to the process in order. Empty lines are ignored.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="w-full min-h-[160px] px-3 py-2.5 rounded-md text-[13px] font-mono text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none resize-y"
        style={{
          backgroundColor: 'var(--color-input-bg)',
          border: `1px solid ${focused ? ACCENT : 'var(--color-surface-border)'}`,
        }}
        placeholder={`-m\napp_mcp.server\n--conn\npostgresql://user:pass@host:5432/db`}
        spellCheck={false}
      />
    </div>
  );
}
