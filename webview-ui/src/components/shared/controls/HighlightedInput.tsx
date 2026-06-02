import { useRef, useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { SearchIcon, ServerIcon } from '../../../icons';

export interface MockServerSuggestion {
  url: string;
  name: string;
}

interface HighlightedInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  suggestions?: string[];
  /** Running mock server URLs shown at the top with server icon */
  mockServers?: MockServerSuggestion[];
  /** Callback when a mock server suggestion is selected (for auto-loading WSDL/proto) */
  onMockServerSelect?: (url: string) => void;
  protocolHints?: string[];
  disabled?: boolean;
  /** Override the focus border color (defaults to var(--color-primary)) */
  accentColor?: string;
}

const DEFAULT_PROTOCOL_HINTS = ['http://', 'https://'];

/**
 * Input with {{variable}} highlighting and URL autocomplete.
 */
export function HighlightedInput({ value, onChange, onKeyDown, onBlur, placeholder, className, suggestions = [], mockServers = [], onMockServerSelect, protocolHints, disabled, accentColor }: HighlightedInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [focused, setFocused] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const handleScroll = () => setScrollLeft(input.scrollLeft);
    input.addEventListener('scroll', handleScroll);
    return () => input.removeEventListener('scroll', handleScroll);
  }, []);

  // Filter suggestions based on current value
  type SuggestionItem = { url: string; isMock: boolean; name?: string };
  const filteredItems = useMemo((): SuggestionItem[] => {
    if (!focused) return [];
    const lower = value.toLowerCase().trim();

    // Mock server URLs — always show at top when running (filter by typed text if any)
    const mocks: SuggestionItem[] = mockServers
      .filter(ms => !lower || ms.url.toLowerCase().includes(lower) || ms.name.toLowerCase().includes(lower))
      .map(ms => ({ url: ms.url, isMock: true, name: ms.name }));

    if (!lower) return mocks.slice(0, 8);

    const hints = protocolHints || DEFAULT_PROTOCOL_HINTS;

    // Protocol suggestions (when typing "h", "ht", "htt", "w", "ws", etc.)
    const protocols: SuggestionItem[] = hints
      .filter(p => p.startsWith(lower) && p !== lower)
      .map(p => ({ url: p, isMock: false }));

    // URL suggestions from history/collections
    const urls: SuggestionItem[] = suggestions
      .filter(url => {
        const urlLower = url.toLowerCase();
        return urlLower.includes(lower) && urlLower !== lower;
      })
      .map(url => ({ url, isMock: false }));

    // Deduplicate by url, mocks first
    const seen = new Set<string>();
    const combined: SuggestionItem[] = [];
    for (const item of [...mocks, ...protocols, ...urls]) {
      if (!seen.has(item.url)) {
        seen.add(item.url);
        combined.push(item);
      }
    }
    return combined.slice(0, 8);
  }, [value, focused, suggestions, mockServers]);

  // Legacy: flat URL array for key handling
  const filteredSuggestions = useMemo(() => filteredItems.map(i => i.url), [filteredItems]);

  // Reset selection when suggestions change
  useEffect(() => {
    setSelectedIdx(0);
  }, [filteredSuggestions.length, value]);

  const handleSelect = (url: string, idx: number) => {
    onChange(url);
    setFocused(false);
    inputRef.current?.focus();
    // If mock server selected, trigger callback (e.g., auto-load WSDL/proto)
    const item = filteredItems[idx];
    if (item?.isMock && onMockServerSelect) {
      onMockServerSelect(url);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filteredSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx(i => (i + 1) % filteredSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx(i => (i - 1 + filteredSuggestions.length) % filteredSuggestions.length);
        return;
      }
      if (e.key === 'Enter' && filteredSuggestions.length > 0 && selectedIdx >= 0) {
        // Only consume Enter if there's a highlighted suggestion and it's not just the user pressing Enter to send
        if (filteredSuggestions[selectedIdx] !== value) {
          e.preventDefault();
          handleSelect(filteredSuggestions[selectedIdx], selectedIdx);
          return;
        }
      }
      if (e.key === 'Escape') {
        setFocused(false);
        return;
      }
    }
    onKeyDown?.(e);
  };

  // Dropdown position
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });
  useEffect(() => {
    if (filteredSuggestions.length === 0 || !inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setDropPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, [filteredSuggestions.length, focused]);

  // Build highlighted HTML — supports {{var}}, ${var}, and $daakia_{var}_$ escape syntax
  const highlighted = value
    .replace(/(\$daakia_\{[\w.\-]+\}_\$)/g, '<span class="var-escape-highlight">$1</span>')
    .replace(/(\{\{[\w.\-]+\}\}|\$\{[\w.\-]+\})/g, '<span class="var-highlight">$1</span>');

  const showDropdown = focused && filteredSuggestions.length > 0;

  return (
    <div className="highlighted-input-wrapper">
      {/* Mirror layer for highlighting */}
      <div
        ref={mirrorRef}
        className="highlighted-input-mirror"
        style={{ transform: `translateX(-${scrollLeft}px)` }}
        dangerouslySetInnerHTML={{ __html: highlighted || `<span class="placeholder-text">${placeholder || ''}</span>` }}
      />
      {/* Actual input */}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => { setTimeout(() => setFocused(false), 150); onBlur?.(); }}
        placeholder={placeholder}
        disabled={disabled}
        className={`highlighted-input ${disabled ? 'opacity-60' : ''} ${className || ''}`}
      />
      {/* Autocomplete dropdown */}
      {showDropdown && createPortal(
        <div
          className="fixed z-[9999] rounded-lg bg-[var(--color-elevated)] border border-[var(--color-elevated-border)] shadow-xl overflow-hidden animate-[fadeSlideIn_100ms_ease-out]"
          style={{ top: dropPos.top, left: dropPos.left, width: dropPos.width }}
        >
          {filteredItems.map((item, idx) => (
            <button
              key={item.url}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(item.url, idx); }}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-[12.5px] text-left cursor-pointer transition-colors ${
                idx === selectedIdx
                  ? 'bg-[var(--color-item-hover-bg)] text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-item-hover-bg)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {item.isMock
                ? <ServerIcon size={12} className="shrink-0 text-[var(--color-mock-server)]" />
                : <SearchIcon size={12} className="shrink-0 text-[var(--color-text-muted)]" />
              }
              <span className="truncate">{item.url}</span>
              {item.isMock && item.name && (
                <span className="ml-auto text-[10px] text-[var(--color-text-muted)] truncate max-w-[120px]">{item.name}</span>
              )}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
