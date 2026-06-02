import { useCallback, useState } from 'react';
import { useTabsStore, type AiToolDef } from '../../../store/tabs-store';
import { TrashIcon } from '../../../icons';
import { ConfirmDialog } from '../../shared';

/**
 * AiToolsTab — Define tools/functions the AI model can call.
 */
export function AiToolsTab() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);
  const [deleteIdx, setDeleteIdx] = useState<number | null>(null);

  const tools: AiToolDef[] = activeTab?.aiTools || [];

  const handleAddTool = useCallback(() => {
    if (!activeTab) return;
    const newTool: AiToolDef = {
      id: crypto.randomUUID(),
      type: 'function',
      function: { name: '', description: '', parameters: {} },
    };
    updateTab(activeTab.id, { aiTools: [...tools, newTool], dirty: true });
  }, [activeTab, updateTab, tools]);

  const handleUpdateTool = useCallback((index: number, field: 'name' | 'description' | 'parameters', value: string) => {
    if (!activeTab) return;
    const updated = tools.map((t, i) => {
      if (i !== index) return t;
      if (field === 'parameters') {
        try {
          return { ...t, function: { ...t.function, parameters: JSON.parse(value) } };
        } catch {
          return t; // Don't update if JSON is invalid
        }
      }
      return { ...t, function: { ...t.function, [field]: value } };
    });
    updateTab(activeTab.id, { aiTools: updated, dirty: true });
  }, [activeTab, updateTab, tools]);

  const confirmRemoveTool = useCallback(() => {
    if (!activeTab || deleteIdx === null) return;
    updateTab(activeTab.id, { aiTools: tools.filter((_, i) => i !== deleteIdx), dirty: true });
    setDeleteIdx(null);
  }, [activeTab, updateTab, tools, deleteIdx]);

  if (!activeTab) return null;

  return (
    <div className="flex flex-col px-3 py-2 gap-3 overflow-auto h-full">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[var(--color-text-muted)]">Tool Definitions</span>
        <button
          type="button"
          onClick={handleAddTool}
          className="text-[11px] px-2 py-0.5 rounded bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors"
        >
          + Add Tool
        </button>
      </div>

      {tools.length === 0 && (
        <p className="text-[12px] text-[var(--color-text-muted)] py-4 text-center">
          No tools defined. Add a tool to enable function calling.
        </p>
      )}

      {tools.map((tool, idx) => (
        <div
          key={tool.id}
          className="flex flex-col gap-2 p-2.5 rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface-raised)]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[var(--color-text-muted)]">Tool {idx + 1}</span>
            <button
              type="button"
              onClick={() => setDeleteIdx(idx)}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-error)] p-0.5 cursor-pointer transition-colors"
              title="Remove tool"
            >
              <TrashIcon size={13} />
            </button>
          </div>

          <input
            type="text"
            value={tool.function.name}
            onChange={(e) => handleUpdateTool(idx, 'name', e.target.value)}
            placeholder="function_name"
            className="h-[28px] px-2.5 rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[12px] font-mono text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
          />

          <input
            type="text"
            value={tool.function.description}
            onChange={(e) => handleUpdateTool(idx, 'description', e.target.value)}
            placeholder="What this tool does..."
            className="h-[28px] px-2.5 rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[12px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
          />

          <textarea
            defaultValue={JSON.stringify(tool.function.parameters, null, 2)}
            onBlur={(e) => handleUpdateTool(idx, 'parameters', e.target.value)}
            placeholder='{"type": "object", "properties": {}}'
            rows={4}
            className="px-2 py-1.5 rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[12px] font-mono text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] resize-y"
          />
        </div>
      ))}

      {deleteIdx !== null && (
        <ConfirmDialog
          title="Delete Tool"
          message={`Are you sure you want to delete "${tools[deleteIdx]?.function.name || `Tool ${deleteIdx + 1}`}"? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={confirmRemoveTool}
          onCancel={() => setDeleteIdx(null)}
          danger
        />
      )}
    </div>
  );
}
