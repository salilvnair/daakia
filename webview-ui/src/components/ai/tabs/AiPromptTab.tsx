import { useCallback, useState } from 'react';
import { useTabsStore } from '../../../store/tabs-store';
import { TrashIcon } from '../../../icons';
import { ConfirmDialog } from '../../shared';

/**
 * AiPromptTab — System prompts + user prompt, styled with cards like Tools tab.
 */
export function AiPromptTab() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);
  const [deleteIdx, setDeleteIdx] = useState<number | null>(null);

  const systemPrompts = activeTab?.aiSystemPrompts || [''];
  const userPrompt = activeTab?.aiUserPrompt || '';

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
