import { useCallback, useState, useRef } from 'react';
import { useTabsStore, type AiToolDef } from '../../../store/tabs-store';
import { TrashIcon, ChevronDownIcon, CloudIcon, MailIcon, ServerIcon, GlobeIcon } from '../../../icons';
import { ConfirmDialog } from '../../shared';
import { ResizablePanel } from '../../shared/controls/ResizablePanel';
import {
  ButtonView,
  IconButtonView,
  TextInputView,
  EditorView,
  ContextMenuView,
  type ContextMenuItem,
} from '@salilvnair/dui';

const ACCENT = 'var(--color-protocol-ai)';

const TOOL_SNIPPETS: { label: string; icon: React.ReactNode; tool: AiToolDef['function'] }[] = [
  {
    label: 'Get Weather',
    icon: <span style={{ color: 'var(--color-warning)' }}><CloudIcon size={12} /></span>,
    tool: {
      name: 'get_weather',
      description: 'Get the current weather for a given location.',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string', description: 'City name, e.g. "San Francisco, CA"' },
          unit: { type: 'string', enum: ['celsius', 'fahrenheit'], description: 'Temperature unit' },
        },
        required: ['location'],
      },
    },
  },
  {
    label: 'Search Database',
    icon: <span style={{ color: 'var(--color-primary)' }}><ServerIcon size={12} /></span>,
    tool: {
      name: 'search_database',
      description: 'Search records in a database by query string.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query string' },
          limit: { type: 'number', description: 'Maximum number of results (default: 10)' },
          table: { type: 'string', description: 'Table or collection to search' },
        },
        required: ['query'],
      },
    },
  },
  {
    label: 'Send Email',
    icon: <span style={{ color: 'var(--color-success)' }}><MailIcon size={12} /></span>,
    tool: {
      name: 'send_email',
      description: 'Send an email to a recipient.',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient email address' },
          subject: { type: 'string', description: 'Email subject line' },
          body: { type: 'string', description: 'Email body content' },
        },
        required: ['to', 'subject', 'body'],
      },
    },
  },
  {
    label: 'HTTP Request',
    icon: <span style={{ color: 'var(--color-protocol-grpc)' }}><GlobeIcon size={12} /></span>,
    tool: {
      name: 'http_request',
      description: 'Make an HTTP request to an external API.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Target URL' },
          method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'], description: 'HTTP method' },
          body: { type: 'string', description: 'Request body (JSON string)' },
        },
        required: ['url', 'method'],
      },
    },
  },
];

/**
 * AiToolsTab — Define tools/functions the AI model can call.
 * Uses DUI ContextMenuView for snippets dropdown, DUI inputs and buttons throughout.
 */
export function AiToolsTab() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);
  const [deleteIdx, setDeleteIdx] = useState<number | null>(null);
  const [snippetsOpen, setSnippetsOpen] = useState(false);
  const snippetsAnchorRef = useRef<HTMLDivElement>(null);

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

  const handleAddSnippet = useCallback((snippet: typeof TOOL_SNIPPETS[0]) => {
    if (!activeTab) return;
    const newTool: AiToolDef = {
      id: crypto.randomUUID(),
      type: 'function',
      function: { ...snippet.tool },
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
          return t;
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

  const snippetMenuItems: ContextMenuItem[] = TOOL_SNIPPETS.map((s) => ({
    id: s.label,
    label: s.label,
    icon: s.icon,
    onClick: () => handleAddSnippet(s),
  }));

  if (!activeTab) return null;

  return (
    <div className="flex flex-col px-3 py-2 gap-3 overflow-auto h-full">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[var(--color-text-muted)]">Tool Definitions</span>
        <div className="flex items-center gap-1.5">
          {/* Snippets dropdown — DUI ContextMenuView */}
          <div ref={snippetsAnchorRef} className="relative">
            <ButtonView
              label="Snippets"
              variant="ghost"
              size="sm"
              accentColor={ACCENT}
              iconRight={<ChevronDownIcon size={10} />}
              onClick={() => setSnippetsOpen(v => !v)}
            />
            <ContextMenuView
              items={snippetMenuItems}
              anchorEl={snippetsAnchorRef.current}
              open={snippetsOpen}
              onClose={() => setSnippetsOpen(false)}
              align="right"
              width="sm"
            />
          </div>
          <ButtonView
            label="+ Add Tool"
            variant="ghost"
            size="sm"
            accentColor={ACCENT}
            onClick={handleAddTool}
          />
        </div>
      </div>

      {tools.length === 0 && (
        <div className="h-full flex flex-col items-center justify-center gap-2">
          <span className="text-[24px] opacity-20">⟨/⟩</span>
          <p className="text-[12px] text-[var(--color-text-muted)]">
            No tools defined. Add a tool or use Snippets to get started.
          </p>
        </div>
      )}

      {tools.map((tool, idx) => (
        <div
          key={tool.id}
          className="flex flex-col gap-2 p-2.5 rounded-md border border-[var(--color-surface-border)] bg-[var(--color-surface-raised)]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[var(--color-text-muted)]">Tool {idx + 1}</span>
            <IconButtonView
              icon={<TrashIcon size={12} />}
              size="sm"
              variant="ghost"
              accentColor="var(--color-error)"
              title="Remove tool"
              onClick={() => setDeleteIdx(idx)}
            />
          </div>

          <TextInputView
            value={tool.function.name}
            onChange={(e) => handleUpdateTool(idx, 'name', e.target.value)}
            placeholder="function_name"
            size="md"
            accentColor={ACCENT}
          />

          <TextInputView
            value={tool.function.description}
            onChange={(e) => handleUpdateTool(idx, 'description', e.target.value)}
            placeholder="What this tool does..."
            size="md"
            accentColor={ACCENT}
          />

          <ResizablePanel id={`ai.tool.${idx}.params`} defaultHeight={120} minHeight={60} maxHeight={500}>
            <EditorView
              value={JSON.stringify(tool.function.parameters, null, 2)}
              onChange={(val) => handleUpdateTool(idx, 'parameters', val || '{}')}
              language="json"
              height="100%"
              accentColor={ACCENT}
            />
          </ResizablePanel>
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
