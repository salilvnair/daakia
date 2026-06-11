import { useRef, useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { SearchIcon } from '../../../icons';

export interface HighlightedInputViewProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onBlur?: () => void;
  placeholder?: string;
  suggestions?: string[];
  disabled?: boolean;
  accentColor?: string;
  className?: string;
}

export function HighlightedInputView({
  value,
  onChange,
  onKeyDown,
  onBlur,
  placeholder,
  suggestions = [],
  disabled,
  accentColor,
  className = '',
}: HighlightedInputViewProps) {
  const inputRef  = useRef<HTMLInputElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [focused, setFocused]       = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });

  const accent = accentColor || 'var(--color-primary)';

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const handle = () => setScrollLeft(input.scrollLeft);
    input.addEventListener('scroll', handle);
    return () => input.removeEventListener('scroll', handle);
  }, []);

  const filtered = useMemo(() => {
    if (!focused) return [];
    const lower = value.toLowerCase().trim();
    if (!lower) return [];
    return suggestions.filter(s => s.toLowerCase().includes(lower) && s !== value).slice(0, 8);
  }, [value, focused, suggestions]);

  useEffect(() => { setSelectedIdx(0); }, [filtered.length, value]);

  useEffect(() => {
    if (filtered.length === 0 || !inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    setDropPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }, [filtered.length, focused]);

  const handleSelect = (url: string) => {
    onChange(url);
    setFocused(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filtered.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => (i + 1) % filtered.length); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSelectedIdx(i => (i - 1 + filtered.length) % filtered.length); return; }
      if (e.key === 'Enter' && filtered[selectedIdx] !== value) { e.preventDefault(); handleSelect(filtered[selectedIdx]); return; }
      if (e.key === 'Escape')    { setFocused(false); return; }
    }
    onKeyDown?.(e);
  };

  // Build highlighted HTML — {{var}} and ${var}
  const highlighted = value
    .replace(/(\{\{[\w.\-]+\}\}|\$\{[\w.\-]+\})/g, '<span class="var-highlight">$1</span>');

  const showDrop = focused && filtered.length > 0;

  return (
    <div className={`highlighted-input-wrapper ${className}`}>
      <div
        ref={mirrorRef}
        className="highlighted-input-mirror"
        style={{ transform: `translateX(-${scrollLeft}px)` }}
        dangerouslySetInnerHTML={{ __html: highlighted || `<span class="placeholder-text">${placeholder || ''}</span>` }}
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => { setTimeout(() => setFocused(false), 150); onBlur?.(); }}
        placeholder={placeholder}
        disabled={disabled}
        className={`highlighted-input ${disabled ? 'opacity-60' : ''}`}
        style={focused ? { borderColor: accent } as React.CSSProperties : undefined}
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
          {filtered.map((url, idx) => (
            <button
              key={url}
              type="button"
              onMouseDown={e => { e.preventDefault(); handleSelect(url); }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 14px', fontSize: 12.5, textAlign: 'left',
                cursor: 'pointer', border: 'none', fontFamily: 'inherit',
                background: idx === selectedIdx ? 'var(--color-item-hover-bg)' : 'transparent',
                color: idx === selectedIdx ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                transition: 'background 80ms',
              }}
            >
              <SearchIcon size={12} style={{ flexShrink: 0, color: 'var(--color-text-muted)' }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
