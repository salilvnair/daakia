import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { SearchIcon, ServerIcon } from '../../../icons';
import type { DuiSize } from '../../core/DuiTypes';
import { useInputBase } from '../../core/InputBase';
import './HighlightedInputView.css';

export interface MockServerSuggestion {
  url: string;
  name: string;
}

export interface HighlightedInputViewProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onBlur?: () => void;
  placeholder?: string;
  suggestions?: string[];
  /** Running mock server URLs — shown at the top with a server icon */
  mockServers?: MockServerSuggestion[];
  disabled?: boolean;
  accentColor?: string;
  /** Falls back to DuiProvider size when omitted. */
  size?: DuiSize;
  /** Raw height override in px — prefer `size` for token-aligned sizing. */
  height?: number;
  /** Border radius of the input in px (default 0 — matches URL bar; set 6 for standalone rounded usage) */
  borderRadius?: number;
  style?: React.CSSProperties;
  className?: string;
}

const TOKEN_RE   = /(\{\{[\w.\-]+\}\}|\$\{[\w.\-]+\})/g;
const ESCAPE_RE  = /(\$daakia_\{[\w.\-]+\}_\$)/g;

function buildHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(ESCAPE_RE, '<span class="dui_highlighted-input__token--escape">$1</span>')
    .replace(TOKEN_RE,  '<span class="dui_highlighted-input__token">$1</span>');
}

function getCaretOffset(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.endContainer, range.endOffset);
  return pre.toString().length;
}

function setCaretOffset(el: HTMLElement, offset: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  let remaining = offset;
  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0;
      if (remaining <= len) { range.setStart(node, remaining); range.collapse(true); return true; }
      remaining -= len;
      return false;
    }
    for (const child of Array.from(node.childNodes)) { if (walk(child)) return true; }
    return false;
  };
  if (!walk(el)) { range.selectNodeContents(el); range.collapse(false); }
  sel.removeAllRanges();
  sel.addRange(range);
}

export function HighlightedInputView({
  value,
  onChange,
  onKeyDown,
  onBlur,
  placeholder,
  suggestions = [],
  mockServers = [],
  disabled,
  accentColor,
  size,
  height,
  borderRadius = 0,
  style,
  className = '',
}: HighlightedInputViewProps) {
  const base = useInputBase(size);
  const resolvedHeight = height ?? parseInt(base.height, 10);
  const editorRef  = useRef<HTMLDivElement>(null);
  const composing  = useRef(false);
  const lastValue  = useRef<string | null>(null);
  const [focused,     setFocused]     = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [dropPos,     setDropPos]     = useState({ top: 0, left: 0, width: 0 });

  const accent = accentColor || 'var(--color-primary)';

  // Populate on mount
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.innerHTML = buildHTML(value);
    lastValue.current = value;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync when value is changed externally by parent
  useEffect(() => {
    const el = editorRef.current;
    if (!el || lastValue.current === value) return;
    lastValue.current = value;
    const isFocused = document.activeElement === el;
    const offset = isFocused ? getCaretOffset(el) : -1;
    el.innerHTML = buildHTML(value);
    if (isFocused && offset >= 0) setCaretOffset(el, offset);
  }, [value]);

  const filtered = useMemo(() => {
    if (!focused) return [];
    const lower = value.toLowerCase().trim();
    if (!lower) return [];
    return suggestions.filter(s => s.toLowerCase().includes(lower) && s !== value).slice(0, 8);
  }, [value, focused, suggestions]);

  const filteredMockServers = useMemo(() => {
    if (!focused || !mockServers.length) return [];
    const lower = value.toLowerCase().trim();
    if (!lower) return mockServers.slice(0, 8);
    return mockServers.filter(s => s.url.toLowerCase().includes(lower) || s.name.toLowerCase().includes(lower)).slice(0, 8);
  }, [value, focused, mockServers]);

  useEffect(() => { setSelectedIdx(0); }, [filtered.length, filteredMockServers.length, value]);

  useEffect(() => {
    if ((filtered.length === 0 && filteredMockServers.length === 0) || !editorRef.current) return;
    const r = editorRef.current.getBoundingClientRect();
    setDropPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }, [filtered.length, filteredMockServers.length, focused]);

  const handleSelect = (url: string) => {
    const el = editorRef.current;
    if (el) {
      el.innerHTML = buildHTML(url);
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    }
    lastValue.current = url;
    onChange(url);
    setFocused(false);
    editorRef.current?.focus();
  };

  const handleInput = useCallback(() => {
    if (composing.current) return;
    const el = editorRef.current;
    if (!el) return;
    const text = el.innerText.replace(/\n/g, '');
    const offset = getCaretOffset(el);
    el.innerHTML = buildHTML(text);
    setCaretOffset(el, offset);
    lastValue.current = text;
    onChange(text);
  }, [onChange]);

  const allDropItems = useMemo(() => [
    ...filteredMockServers.map(s => s.url),
    ...filtered,
  ], [filteredMockServers, filtered]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') e.preventDefault();
    if (allDropItems.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => (i + 1) % allDropItems.length); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSelectedIdx(i => (i - 1 + allDropItems.length) % allDropItems.length); return; }
      if (e.key === 'Enter' && allDropItems[selectedIdx] !== value) { e.preventDefault(); handleSelect(allDropItems[selectedIdx]); return; }
      if (e.key === 'Escape')    { setFocused(false); return; }
    }
    onKeyDown?.(e);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  };

  const showDrop = focused && (filtered.length > 0 || filteredMockServers.length > 0);

  return (
    <div className={`dui_highlighted-input ${className}`} style={style}>
      {!value && placeholder && (
        <span className="dui_highlighted-input__placeholder" style={{ lineHeight: `${resolvedHeight}px` }}>
          {placeholder}
        </span>
      )}
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        spellCheck={false}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onFocus={() => setFocused(true)}
        onBlur={() => { setTimeout(() => setFocused(false), 150); onBlur?.(); }}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={() => { composing.current = false; handleInput(); }}
        className={`dui_highlighted-input__editor${disabled ? ' opacity-60' : ''}`}
        style={{ height: resolvedHeight, lineHeight: `${resolvedHeight}px`, borderRadius, borderColor: focused ? accent : undefined }}
      />
      {showDrop && createPortal(
        <div
          style={{
            position: 'fixed', zIndex: 9999,
            top: dropPos.top, left: dropPos.left, width: dropPos.width,
            borderRadius: 8, border: '1px solid var(--color-elevated-border)',
            background: 'var(--color-elevated)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            overflow: 'hidden',
          }}
        >
          {/* Mock server suggestions at top */}
          {filteredMockServers.length > 0 && filteredMockServers.map((s, idx) => (
            <button
              key={s.url}
              type="button"
              onMouseDown={e => { e.preventDefault(); handleSelect(s.url); }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 14px', fontSize: 12.5, textAlign: 'left',
                cursor: 'pointer', border: 'none', fontFamily: 'inherit',
                background: idx === selectedIdx ? 'color-mix(in srgb, var(--color-mock-server) 12%, transparent)' : 'transparent',
                color: 'var(--color-mock-server)',
                transition: 'background 80ms',
              }}
            >
              <ServerIcon size={12} style={{ flexShrink: 0, color: 'var(--color-mock-server)' }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{s.url}</span>
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--color-text-muted)', flexShrink: 0 }}>{s.name}</span>
            </button>
          ))}
          {/* URL history suggestions */}
          {filtered.length > 0 && filtered.map((url, idx) => {
            const globalIdx = filteredMockServers.length + idx;
            return (
              <button
                key={url}
                type="button"
                onMouseDown={e => { e.preventDefault(); handleSelect(url); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 14px', fontSize: 12.5, textAlign: 'left',
                  cursor: 'pointer', border: 'none', fontFamily: 'inherit',
                  background: globalIdx === selectedIdx ? 'var(--color-item-hover-bg)' : 'transparent',
                  color: globalIdx === selectedIdx ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  transition: 'background 80ms',
                }}
              >
                <SearchIcon size={12} style={{ flexShrink: 0, color: 'var(--color-text-muted)' }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</span>
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
