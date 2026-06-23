import { useCallback, useState } from 'react';
import { useTabsStore, type WsTemplate } from '../../../store/tabs-store';
import { TrashIcon } from '../../../icons';
import {
  ButtonView,
  IconButtonView,
  TextInputView,
} from '@salilvnair/dui';

const ACCENT = 'var(--color-protocol-websocket)';

interface WsTemplatesTabProps {
  onLoad: (message: string) => void;
  currentMessage: string;
}

/**
 * WsTemplatesTab — Saved message templates for WebSocket (5.3.11).
 * Save the current message as a named template; click to load into input.
 */
export function WsTemplatesTab({ onLoad, currentMessage }: WsTemplatesTabProps) {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);
  const [newName, setNewName] = useState('');

  const templates: WsTemplate[] = activeTab?.wsTemplates || [];

  const setTemplates = useCallback((tpls: WsTemplate[]) => {
    if (!activeTab) return;
    updateTab(activeTab.id, { wsTemplates: tpls });
  }, [activeTab, updateTab]);

  const handleSave = useCallback(() => {
    if (!activeTab || !currentMessage.trim() || !newName.trim()) return;
    const tpl: WsTemplate = {
      id: crypto.randomUUID(),
      name: newName.trim(),
      message: currentMessage,
      format: 'text',
    };
    setTemplates([...templates, tpl]);
    setNewName('');
  }, [activeTab, currentMessage, newName, templates, setTemplates]);

  const handleDelete = useCallback((id: string) => {
    setTemplates(templates.filter(t => t.id !== id));
  }, [templates, setTemplates]);

  if (!activeTab) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Save current as template */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
        <TextInputView
          size="md"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          placeholder="Template name…"
          style={{ flex: 1 }}
        />
        <ButtonView
          size="md"
          label="Save current"
          onClick={handleSave}
          disabled={!currentMessage.trim() || !newName.trim()}
          accentColor={ACCENT}
        />
      </div>

      {/* Template list */}
      <div className="flex-1 overflow-auto">
        {templates.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <span className="text-[12px] text-[var(--color-text-muted)] opacity-60">
              No templates yet. Type a message and save it above.
            </span>
          </div>
        )}
        {templates.map((tpl) => (
          <div
            key={tpl.id}
            className="flex items-start gap-2 px-3 py-2 border-b last:border-b-0 hover:bg-[var(--color-surface-hover)] group transition-colors"
            style={{ borderColor: 'var(--color-surface-border)' }}
          >
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-[var(--color-text-primary)] truncate">{tpl.name}</p>
              <p className="text-[11px] font-mono text-[var(--color-text-muted)] truncate opacity-70">{tpl.message}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <ButtonView
                size="xs"
                variant="ghost"
                label="Load"
                onClick={() => onLoad(tpl.message)}
                accentColor={ACCENT}
              />
              <IconButtonView
                size="xs"
                icon={<TrashIcon size={12} />}
                title="Delete template"
                accentColor="var(--color-error)"
                onClick={() => handleDelete(tpl.id)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
