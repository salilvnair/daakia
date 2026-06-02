import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { parseCurl } from '../../../utils/curl-parser';
import { useTabsStore } from '../../../store/tabs-store';
import { CloseIcon } from '../../../icons';

interface ImportCurlModalProps {
  open: boolean;
  onClose: () => void;
}

export function ImportCurlModal({ open, onClose }: ImportCurlModalProps) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { tabs, activeTabId, updateTab } = useTabsStore();

  useEffect(() => {
    if (!open) return;
    setInput('');
    setError('');
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    setTimeout(() => textareaRef.current?.focus(), 30);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const handleImport = () => {
    const trimmed = input.trim();
    if (!trimmed) {
      setError('Please paste a cURL command.');
      return;
    }

    try {
      const parsed = parseCurl(trimmed);
      if (!parsed.url) {
        setError('Could not find a URL in the cURL command.');
        return;
      }

      const tab = tabs.find(t => t.id === activeTabId);
      if (!tab) return;

      updateTab(tab.id, {
        method: parsed.method as any,
        url: parsed.url,
        headers: parsed.headers.length > 0
          ? [...parsed.headers.map(h => ({ ...h, id: crypto.randomUUID() })), { id: crypto.randomUUID(), key: '', value: '', enabled: true }]
          : [{ id: crypto.randomUUID(), key: '', value: '', enabled: true }],
        bodyMode: parsed.bodyMode,
        bodyRaw: parsed.bodyRaw,
        bodyFormData: parsed.bodyFormData.length > 0
          ? [...parsed.bodyFormData.map(h => ({ ...h, id: crypto.randomUUID() })), { id: crypto.randomUUID(), key: '', value: '', type: 'text', enabled: true }]
          : [{ id: crypto.randomUUID(), key: '', value: '', type: 'text', enabled: true }],
        bodyUrlEncoded: parsed.bodyUrlEncoded.length > 0
          ? [...parsed.bodyUrlEncoded.map(h => ({ ...h, id: crypto.randomUUID() })), { id: crypto.randomUUID(), key: '', value: '', enabled: true }]
          : [{ id: crypto.randomUUID(), key: '', value: '', enabled: true }],
      });

      onClose();
    } catch (e) {
      setError('Failed to parse cURL command. Please check the syntax.');
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50"

    >
      <div className="w-full max-w-[560px] rounded-xl bg-[var(--color-elevated)] border border-[var(--color-elevated-border)] shadow-2xl animate-[fadeSlideIn_150ms_ease-out]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[var(--color-surface-border)]">
          <h2 className="text-[20px] font-semibold text-[var(--color-text-primary)]">Import cURL</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-[#ef4444] hover:text-[#dc2626] hover:bg-[rgba(239,68,68,0.08)] cursor-pointer transition-colors"
          >
            <CloseIcon size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-3">
          <label className="block text-[12px] font-medium text-[var(--color-text-secondary)]">Paste your cURL command below</label>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(''); }}
            placeholder={`curl --request GET \\\n  --url https://api.example.com/data \\\n  --header 'Content-Type: application/json'`}
            rows={8}
            className="w-full px-3 py-2.5 rounded-lg bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[12.5px] text-[var(--color-text-primary)] font-mono placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] resize-none"
          />
          {error && (
            <p className="text-[12px] text-[var(--color-error)]">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-[var(--color-surface-border)]">
          <button
            type="button"
            onClick={handleImport}
            disabled={!input.trim()}
            className="h-[36px] px-4 text-[12.5px] font-medium rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)] cursor-pointer transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            Import
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-[36px] px-4 text-[12.5px] font-medium rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
