import { useCallback, useRef, useState } from 'react';
import { useTabsStore, type AiImageAttachment } from '../../../store/tabs-store';
import { TrashIcon } from '../../../icons';
import { ConfirmDialog } from '../../shared';

/**
 * AiPromptTab — System prompts + user prompt + image attachments (6D.22).
 * Supports image upload (file picker → base64) and image URL for multimodal prompts.
 */
export function AiPromptTab() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);
  const [deleteIdx, setDeleteIdx] = useState<number | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const systemPrompts = activeTab?.aiSystemPrompts || [''];
  const userPrompt = activeTab?.aiUserPrompt || '';
  const images = activeTab?.aiImages || [];

  const handleSystemChange = useCallback((index: number, value: string) => {
    if (!activeTab) return;
    const updated = [...systemPrompts];
    updated[index] = value;
    updateTab(activeTab.id, { aiSystemPrompts: updated, dirty: true });
  }, [activeTab, updateTab, systemPrompts]);

  const handleAddSystem = useCallback(() => {
    if (!activeTab) return;
    updateTab(activeTab.id, { aiSystemPrompts: [...systemPrompts, ''], dirty: true });
  }, [activeTab, updateTab, systemPrompts]);

  const confirmRemoveSystem = useCallback(() => {
    if (!activeTab || deleteIdx === null) return;
    const updated = systemPrompts.filter((_, i) => i !== deleteIdx);
    updateTab(activeTab.id, { aiSystemPrompts: updated.length ? updated : [''], dirty: true });
    setDeleteIdx(null);
  }, [activeTab, updateTab, systemPrompts, deleteIdx]);

  const handleUserPromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!activeTab) return;
    updateTab(activeTab.id, { aiUserPrompt: e.target.value, dirty: true });
  }, [activeTab, updateTab]);

  // 6D.22 — Image upload: file → base64
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeTab) return;
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        const attachment: AiImageAttachment = {
          id: crypto.randomUUID(),
          type: 'base64',
          base64: dataUrl,
          mimeType: file.type,
          filename: file.name,
        };
        updateTab(activeTab.id, {
          aiImages: [...(useTabsStore.getState().tabs.find(t => t.id === activeTab.id)?.aiImages || []), attachment],
          dirty: true,
        });
      };
      reader.readAsDataURL(file);
    });
    // Reset file input so same file can be re-added
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [activeTab, updateTab]);

  // 6D.22 — Add image by URL
  const handleAddImageUrl = useCallback(() => {
    if (!activeTab || !imageUrl.trim()) return;
    const attachment: AiImageAttachment = {
      id: crypto.randomUUID(),
      type: 'url',
      url: imageUrl.trim(),
      mimeType: 'image/jpeg', // default; server will detect
    };
    updateTab(activeTab.id, {
      aiImages: [...images, attachment],
      dirty: true,
    });
    setImageUrl('');
  }, [activeTab, updateTab, images, imageUrl]);

  const handleRemoveImage = useCallback((id: string) => {
    if (!activeTab) return;
    updateTab(activeTab.id, {
      aiImages: images.filter(img => img.id !== id),
      dirty: true,
    });
  }, [activeTab, updateTab, images]);

  if (!activeTab) return null;

  return (
    <div className="flex flex-col h-full px-3 pt-4 pb-5 gap-4 overflow-auto">
      {/* System Prompts Section */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[var(--color-text-muted)]">System Prompts</span>
          <button
            type="button"
            onClick={handleAddSystem}
            className="text-[11px] px-2 py-0.5 rounded bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors"
          >
            + Add
          </button>
        </div>

        {systemPrompts.map((prompt, idx) => (
          <div
            key={idx}
            className="flex flex-col gap-2 p-2.5 rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface-raised)]"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[var(--color-text-muted)]">Prompt {idx + 1}</span>
              {systemPrompts.length > 1 && (
                <button
                  type="button"
                  onClick={() => setDeleteIdx(idx)}
                  className="text-[var(--color-text-muted)] hover:text-[var(--color-error)] p-0.5 cursor-pointer transition-colors"
                  title="Remove system prompt"
                >
                  <TrashIcon size={13} />
                </button>
              )}
            </div>
            <textarea
              value={prompt}
              onChange={(e) => handleSystemChange(idx, e.target.value)}
              placeholder="You are a helpful assistant..."
              rows={3}
              className="w-full px-2.5 py-2 rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[12px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] resize-y font-mono"
            />
          </div>
        ))}
      </div>

      {/* User Prompt Section */}
      <div className="flex flex-col gap-2 flex-1 min-h-0">
        <span className="text-[11px] text-[var(--color-text-muted)]">User Prompt</span>
        <div className="flex flex-col flex-1 p-2.5 rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface-raised)]">
          <textarea
            value={userPrompt}
            onChange={handleUserPromptChange}
            placeholder="Enter user prompt here..."
            className="flex-1 min-h-[60px] w-full px-2.5 py-2 rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[12px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] resize-y font-mono"
          />
        </div>
      </div>

      {/* 6D.22 — Image Attachments Section */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[var(--color-text-muted)]">Images (multimodal)</span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-[11px] px-2 py-0.5 rounded bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors"
          >
            + Upload
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          className="hidden"
          onChange={handleFileUpload}
        />

        {/* URL input row */}
        <div className="flex gap-1.5">
          <input
            type="text"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddImageUrl(); }}
            placeholder="Or paste an image URL..."
            className="flex-1 px-2 py-1.5 rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[11px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
          />
          <button
            type="button"
            onClick={handleAddImageUrl}
            disabled={!imageUrl.trim()}
            className="px-2 py-1.5 rounded text-[11px] cursor-pointer disabled:opacity-40 transition-colors"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-protocol-ai) 15%, transparent)', color: 'var(--color-protocol-ai)' }}
          >
            Add
          </button>
        </div>

        {/* Image previews */}
        {images.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {images.map(img => (
              <div
                key={img.id}
                className="flex items-center gap-2 p-2 rounded-md border"
                style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-surface-raised)' }}
              >
                {/* Thumbnail */}
                <div className="w-[40px] h-[40px] rounded overflow-hidden flex-shrink-0" style={{ backgroundColor: 'var(--color-panel)' }}>
                  {img.type === 'base64' && img.base64 ? (
                    <img src={img.base64} alt={img.filename || 'image'} className="w-full h-full object-cover" />
                  ) : img.type === 'url' && img.url ? (
                    <img src={img.url} alt="image" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[16px]">🖼️</div>
                  )}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] truncate" style={{ color: 'var(--color-text-primary)' }}>
                    {img.filename || img.url || 'Image'}
                  </p>
                  <p className="text-[9.5px]" style={{ color: 'var(--color-text-muted)' }}>
                    {img.type === 'base64' ? `${img.mimeType || 'image'} · uploaded` : 'URL'}
                  </p>
                </div>
                {/* Remove */}
                <button
                  type="button"
                  onClick={() => handleRemoveImage(img.id)}
                  className="flex-shrink-0 p-0.5 cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-colors"
                  title="Remove image"
                >
                  <TrashIcon size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {images.length === 0 && (
          <p className="text-[10px]" style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}>
            Supported by OpenAI GPT-4V, Anthropic Claude, Google Gemini Vision
          </p>
        )}
      </div>

      {deleteIdx !== null && (
        <ConfirmDialog
          title="Delete System Prompt"
          message="Are you sure you want to delete this system prompt? This cannot be undone."
          confirmLabel="Delete"
          onConfirm={confirmRemoveSystem}
          onCancel={() => setDeleteIdx(null)}
          danger
        />
      )}
    </div>
  );
}
