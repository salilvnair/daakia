/**
 * AiMcpSchemaViewerModal — AI explains all MCP tool schemas in plain English.
 * Task 10.6 — MCP AI Schema Viewer ✦ · Gate: schemaRest (reuse)
 */
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTabsStore, type McpToolDef } from '../../store/tabs-store';
import { CloseIcon, SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';

interface Props {
  tools: McpToolDef[];
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-mcp)';

export function AiMcpSchemaViewerModal({ tools, onClose }: Props) {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const [explanation, setExplanation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const streamRef = useRef('');

  useEffect(() => { startExplain(); }, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStream:chunk') { streamRef.current += msg.chunk; setExplanation(streamRef.current); }
      else if (msg?.type === 'aiStream:done') { setLoading(false); }
      else if (msg?.type === 'aiStream:error') { setError(msg.error || 'AI request failed'); setLoading(false); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const startExplain = () => {
    if (!activeTab || loading) return;
    const toolSummary = tools.map(t => {
      const props = t.inputSchema?.properties || {};
      const fields = Object.entries(props as Record<string, any>)
        .map(([k, v]) => `  - ${k} (${v.type || 'any'}${t.inputSchema?.required?.includes(k) ? ', required' : ''}): ${v.description || ''}`)
        .join('\n');
      return `### ${t.name}\n${t.description || 'No description'}\n**Parameters:**\n${fields || '  None'}`;
    }).join('\n\n');

    streamRef.current = ''; setExplanation(''); setError(''); setLoading(true);
    postMsg({
      type: 'aiChat',
      tabId: activeTab.id,
      messages: [{
        role: 'user',
        content: `You are an MCP (Model Context Protocol) expert. Explain the following MCP tool schemas in plain English for a developer who needs to understand what each tool does and how to use it effectively:

${toolSummary}

For each tool provide:
1. What it does in one sentence
2. When to use it (use cases)
3. Each required parameter explained in simple terms
4. Example call with realistic values
5. What the output typically looks like

Be concise but thorough. Use ## Tool Name headers for each tool.`,
      }],
      stream: true,
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} onMouseDown={e => e.stopPropagation()}>
      <div className="relative flex flex-col rounded-2xl border shadow-2xl overflow-hidden" style={{ backgroundColor: 'var(--color-panel)', borderColor: `color-mix(in srgb, ${ACCENT} 30%, var(--color-surface-border))`, width: 660, maxHeight: '85vh' }}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <div className="flex items-center gap-2">
            <SparkleIcon size={14} style={{ color: ACCENT }} />
            <span className="text-[13px] font-semibold" style={{ color: ACCENT }}>MCP Schema Viewer ✦</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${ACCENT} 12%, transparent)`, color: ACCENT }}>
              {tools.length} tools
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!loading && explanation && (
              <button type="button" onClick={startExplain} className="text-[11px] px-3 py-1 rounded-md cursor-pointer" style={{ color: ACCENT, backgroundColor: `color-mix(in srgb, ${ACCENT} 10%, transparent)` }}>
                Re-explain
              </button>
            )}
            <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-[var(--color-hover)] cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>
              <CloseIcon size={13} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] p-5 min-h-0">
          {error && <p className="text-[11px] px-3 py-2 rounded-lg mb-3" style={{ color: 'var(--color-error)', backgroundColor: 'color-mix(in srgb, var(--color-error) 8%, transparent)' }}>{error}</p>}
          {loading && !explanation && <p className="text-[11px] animate-pulse text-center py-12" style={{ color: ACCENT }}>Explaining {tools.length} tool schemas…</p>}
          {explanation && <MdViewer content={explanation} />}
        </div>
        <div className="flex items-center justify-end px-5 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[12px] font-medium cursor-pointer hover:bg-[var(--color-hover)]" style={{ color: 'var(--color-text-muted)' }}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
