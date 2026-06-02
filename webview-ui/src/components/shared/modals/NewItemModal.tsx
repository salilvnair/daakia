import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from '../../../icons';

interface NewItemModalProps {
  open: boolean;
  title: string;
  placeholder?: string;
  onSave: (name: string) => void;
  onCancel: () => void;
  accentColor?: string;
}

export function NewItemModal({ open, title, placeholder = '', onSave, onCancel, accentColor }: NewItemModalProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  const handleSave = () => {
    const trimmed = value.trim();
    if (trimmed) {
      onSave(trimmed);
      setValue('');
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50"

    >
      <div className="w-full max-w-[420px] rounded-xl bg-[var(--color-elevated)] border border-[var(--color-elevated-border)] shadow-2xl animate-[fadeSlideIn_150ms_ease-out]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-[15px] font-semibold text-[var(--color-text-primary)]">{title}</h2>
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center justify-center w-[24px] h-[24px] rounded text-[#ef4444] hover:text-[#dc2626] hover:bg-[rgba(239,68,68,0.08)] cursor-pointer transition-colors"
          >
            <CloseIcon size={12} />
          </button>
        </div>

        {/* Input */}
        <div className="px-5 pb-4">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
            placeholder={placeholder || 'Enter name'}
            className="w-full h-[40px] px-3 text-[13px] rounded-lg bg-transparent border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none transition-colors"
            style={{ ['--tw-ring-color' as any]: accentColor }}
            onFocus={(e) => { e.currentTarget.style.borderColor = accentColor || 'var(--color-primary)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = ''; }}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 px-5 pb-5">
          <button
            type="button"
            onClick={handleSave}
            disabled={!value.trim()}
            className="h-[36px] px-4 text-[12.5px] font-medium rounded-lg text-white hover:opacity-90 cursor-pointer transition-colors disabled:opacity-40 disabled:pointer-events-none"
            style={{ backgroundColor: accentColor || 'var(--color-primary)' }}
          >
            Save
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-[36px] px-4 text-[12.5px] font-medium rounded-lg bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.25)] text-[#f87171] hover:bg-[rgba(239,68,68,0.15)] cursor-pointer transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
