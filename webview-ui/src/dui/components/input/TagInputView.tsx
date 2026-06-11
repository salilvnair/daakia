import { useState, useRef } from 'react';
import { CloseIcon } from '../../../icons';

export interface TagInputViewProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  accentColor?: string;
  maxTags?: number;
  disabled?: boolean;
  className?: string;
}

export function TagInputView({
  tags,
  onChange,
  placeholder = 'Add tag…',
  accentColor,
  maxTags,
  disabled = false,
  className = '',
}: TagInputViewProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const accent = accentColor || 'var(--color-primary)';
  const canAdd = !disabled && (!maxTags || tags.length < maxTags);

  const addTag = (raw: string) => {
    const val = raw.trim();
    if (!val || tags.includes(val) || !canAdd) return;
    onChange([...tags, val]);
    setInput('');
  };

  const removeTag = (i: number) => {
    if (disabled) return;
    onChange(tags.filter((_, j) => j !== i));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  };

  return (
    <div
      className={className}
      onClick={() => inputRef.current?.focus()}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '4px',
        minHeight: '32px',
        padding: '4px 8px',
        borderRadius: '5px',
        border: '1px solid var(--color-input-border)',
        background: 'var(--color-input-bg)',
        cursor: disabled ? 'not-allowed' : 'text',
        opacity: disabled ? 0.6 : 1,
        transition: 'border-color 120ms',
      }}
      onFocus={() => {}}
    >
      {tags.map((tag, i) => (
        <span
          key={i}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            padding: '2px 7px',
            borderRadius: 99,
            fontSize: '11px',
            fontWeight: 500,
            background: accentColor ? `color-mix(in srgb, ${accentColor} 15%, transparent)` : 'var(--color-tag-bg)',
            color: accentColor ? accentColor : 'var(--color-tag-text)',
            border: `1px solid ${accentColor ? `color-mix(in srgb, ${accentColor} 25%, transparent)` : 'var(--color-tag-border)'}`,
          }}
        >
          {tag}
          {!disabled && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); removeTag(i); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'inherit', opacity: 0.6, padding: 0, marginLeft: '1px',
              }}
            >
              <CloseIcon size={9} />
            </button>
          )}
        </span>
      ))}
      {canAdd && (
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (input.trim()) addTag(input); }}
          placeholder={tags.length === 0 ? placeholder : undefined}
          disabled={disabled}
          style={{
            flex: '1 0 80px',
            minWidth: 0,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: '12px',
            color: 'var(--color-text-primary)',
            padding: '2px 2px',
            fontFamily: 'inherit',
          }}
        />
      )}
    </div>
  );
}
