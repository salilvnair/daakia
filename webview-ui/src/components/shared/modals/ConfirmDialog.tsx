import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { WarningTriangleIcon } from '../../../icons';

interface ConfirmDialogProps {
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title = 'Are you sure?',
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      if (e.key === 'Enter') { e.preventDefault(); onConfirm(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onConfirm, onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-[rgba(0,0,0,0.55)] backdrop-blur-[2px]"
      role="presentation"
    >
      <div
        className="bg-[#1e1e1e] border border-[rgba(255,255,255,0.1)] rounded-xl shadow-2xl min-w-[320px] max-w-[420px] p-5 animate-[confirm-in_150ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${danger ? 'bg-[rgba(239,68,68,0.12)]' : 'bg-[rgba(99,102,241,0.12)]'}`}>
            <WarningTriangleIcon
              size={16}
              stroke={danger ? 'var(--color-error)' : 'var(--color-primary)'}
            />
          </div>
          <h3 id="confirm-title" className="text-[14px] font-semibold text-[var(--color-text-primary)]">
            {title}
          </h3>
        </div>

        {/* Message */}
        {message && (
          <p className="text-[12.5px] text-[var(--color-text-muted)] leading-relaxed mb-5 pl-11">
            {message}
          </p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-[12.5px] font-medium rounded-lg bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.25)] text-[#f87171] hover:bg-[rgba(239,68,68,0.15)] cursor-pointer transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-[12.5px] font-medium rounded-lg cursor-pointer transition-colors ${
              danger
                ? 'bg-[#ef4444] text-white hover:bg-[#dc2626]'
                : 'bg-[var(--color-primary)] text-white hover:opacity-90'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
