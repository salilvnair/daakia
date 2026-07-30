/**
 * AiMcpSchemaViewerModal — AI explains all MCP tool schemas in plain English.
 * Task 10.6 — MCP AI Schema Viewer ✦ · Gate: schemaRest (reuse)
 */
import { useState, useRef, useEffect } from 'react';
import { useTabsStore, type McpToolDef } from '../../store/tabs-store';
import { SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';
import { ModalView, AIButtonView } from '@salilvnair/dui';

interface Props {
  tools: McpToolDef[];
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-ai)';

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
        .map(([k, v]) => `  - ${k} (${v.type || 'any'}${(t.inputSchema?.required as string[] | undefined)?.includes(k) ? ', required' : ''}): ${v.description || ''}`)
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

  return (
    <ModalView
      open
      onClose={onClose}
      title="MCP Schema Viewer"
      subtitle={`${tools.length} tool${tools.length !== 1 ? 's' : ''}`}
      size="lg"
      headerColor={ACCENT}
      headerIcon={
        <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${ACCENT} 20%, transparent)` }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
        </div>
      }
      footerRight={
        !loading && explanation ? (
          <AIButtonView label="Re-explain" size="md" accentColor={ACCENT} onClick={startExplain} />
        ) : undefined
      }
    >
      {error && <p className="text-[11px] px-3 py-2 rounded-lg mb-3" style={{ color: 'var(--color-error)', backgroundColor: 'color-mix(in srgb, var(--color-error) 8%, transparent)' }}>{error}</p>}
      {loading && !explanation && <p className="text-[11px] animate-pulse text-center py-12" style={{ color: ACCENT }}>Explaining {tools.length} tool schemas…</p>}
      {explanation && <MdViewer content={explanation} />}
    </ModalView>
  );
}
