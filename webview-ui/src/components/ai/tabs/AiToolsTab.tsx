import { useCallback, useState, useRef, useEffect } from 'react';
import { useTabsStore, type AiToolDef } from '../../../store/tabs-store';
import { TrashIcon, PlusIcon, ChevronDownIcon } from '../../../icons';
import { ConfirmDialog, CodeEditor } from '../../shared';

const TOOL_SNIPPETS: { label: string; tool: AiToolDef['function'] }[] = [
  {
    label: 'Get Weather',
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
 */
export function AiToolsTab() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);
  const [deleteIdx, setDeleteIdx] = useState<number | null>(null);
  const [snippetsOpen, setSnippetsOpen] = useState(false);
  const snippetsBtnRef = useRef<HTMLButtonElement>(null);
  const snippetsMenuRef = useRef<HTMLDivElement>(null);

  const tools: AiToolDef[] = activeTab?.aiTools || [];

  // Close snippets dropdown on outside click
  useEffect(() => {
    if (!snippetsOpen) return;
    const handler = (e: MouseEvent) => {
      if (!snippetsBtnRef.current?.contains(e.target as Node) && !snippetsMenuRef.current?.contains(e.target as Node)) {
        setSnippetsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [snippetsOpen]);

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
    setSnippetsOpen(false);
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
        <div className="flex items-center gap-1.5 relative">
          {/* Snippets dropdown button */}
          <button
            ref={snippetsBtnRef}
            type="button"
            onClick={() => setSnippetsOpen(v => !v)}
            className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors"
            title="Insert a tool snippet"
          >
            Snippets <ChevronDownIcon size={10} />
          </button>
          {snippetsOpen && (
            <div
              ref={snippetsMenuRef}
              className="absolute right-0 top-full mt-1 z-50 min-w-[180px] bg-[var(--color-surface)] border border-[var(--color-surface-border)] rounded-lg shadow-xl py-1"
            >
              {TOOL_SNIPPETS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => handleAddSnippet(s)}
                  className="flex items-center gap-2 w-full px-3 py-[6px] text-left text-[12px] text-[var(--color-text-primary)] hover:bg-[var(--color-item-hover-bg)] cursor-pointer transition-colors"
                >
                  <PlusIcon size={11} className="text-[var(--color-text-muted)]" />
                  {s.label}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={handleAddTool}
            className="text-[11px] px-2 py-0.5 rounded bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors"
          >
            + Add Tool
          </button>
        </div>
      </div>

      {tools.length === 0 && (
        <p className="text-[12px] text-[var(--color-text-muted)] py-4 text-center">
          No tools defined. Add a tool or use Snippets to get started.
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

          <div className="rounded overflow-hidden border border-[var(--color-input-border)]">
            <CodeEditor
              value={JSON.stringify(tool.function.parameters, null, 2)}
              onChange={(val) => handleUpdateTool(idx, 'parameters', val || '{}')}
              language="json"
              height="120px"
            />
          </div>
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
