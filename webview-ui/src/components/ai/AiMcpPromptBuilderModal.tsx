/**
 * AiMcpPromptBuilderModal — Natural language → structured MCP prompt with tool call sequences.
 * Task 10.4 — MCP AI Prompt Builder ✦ · Gate: mcpPromptBuilder
 */
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTabsStore } from '../../store/tabs-store';
import { CloseIcon, SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-mcp)';

export function AiMcpPromptBuilderModal({ onClose }: Props) {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const [description, setDescription] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const streamRef = useRef('');

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStream:chunk') { streamRef.current += msg.chunk; setResult(streamRef.current); }
      else if (msg?.type === 'aiStream:done') { setLoading(false); }
      else if (msg?.type === 'aiStream:error') { setError(msg.error || 'AI request failed'); setLoading(false); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const availableTools = activeTab?.mcpCapabilities?.tools?.map((t: any) => t.name).join(', ') || 'none loaded';

  const handleGenerate = () => {
    if (!activeTab || !description.trim() || loading) return;
    streamRef.current = ''; setResult(''); setError(''); setLoading(true);
    postMsg({
      type: 'aiChat',
      tabId: activeTab.id,
      messages: [{
        role: 'user',
        content: `You are an MCP (Model Context Protocol) expert. The user wants to accomplish the following goal using MCP tools:

"${description}"

Available tools: ${availableTools}

Generate a structured MCP prompt that:
1. Identifies which tools to call and in what order
2. Shows the exact tool call sequence with input parameters
3. Explains how to chain results between tool calls
4. Handles potential errors/edge cases
5. Includes a complete example prompt the user can use in the MCP chat

Format your response with:
## Goal Analysis
## Tool Call Sequence
## Recommended Prompt
## Example Usage`,
      }],
      stream: true,
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} onMouseDown={e => e.stopPropagation()}>
      <div className="relative flex flex-col rounded-2xl border shadow-2xl overflow-hidden" style={{ backgroundColor: 'var(--color-panel)', borderColor: `color-mix(in srgb, ${ACCENT} 30%, var(--color-surface-border))`, width: 640, maxHeight: '85vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <div className="flex items-center gap-2">
            <SparkleIcon size={14} style={{ color: ACCENT }} />
            <span className="text-[13px] font-semibold" style={{ color: ACCENT }}>MCP Prompt Builder ✦</span>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-[var(--color-hover)] cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>
            <CloseIcon size={13} />
          </button>
        </div>

        {/* Input area */}
        <div className="flex-shrink-0 px-5 py-4 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
          <p className="text-[11px] mb-2" style={{ color: 'var(--color-text-muted)' }}>Describe what you want to accomplish with your MCP tools in plain English:</p>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="e.g. Search GitHub for issues about memory leaks, then summarize each issue and create a JIRA ticket for the top 3"
            rows={3}
            className="w-full px-3 py-2 text-[12px] rounded-lg resize-none outline-none"
            style={{ backgroundColor: 'var(--color-input-bg)', border: `1px solid var(--color-input-border)`, color: 'var(--color-text-primary)' }}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate(); }}
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Available tools: <span style={{ color: ACCENT }}>{availableTools}</span></span>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!description.trim() || loading}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11.5px] font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              style={{ backgroundColor: ACCENT, color: 'white' }}
            >
              <SparkleIcon size={10} />
              {loading ? 'Building…' : 'Build Prompt ✦'}
            </button>
          </div>
        </div>

        {/* Result */}
        <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] p-5 min-h-0">
          {error && <p className="text-[11px] px-3 py-2 rounded-lg mb-3" style={{ color: 'var(--color-error)', backgroundColor: 'color-mix(in srgb, var(--color-error) 8%, transparent)' }}>{error}</p>}
          {loading && !result && <p className="text-[11px] animate-pulse text-center py-12" style={{ color: ACCENT }}>Analyzing tools and building prompt sequence…</p>}
          {!result && !loading && !error && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <SparkleIcon size={24} style={{ color: ACCENT, opacity: 0.4 }} />
              <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>Describe your goal above and AI will build a structured MCP prompt with the optimal tool call sequence.</p>
            </div>
          )}
          {result && <MdViewer content={result} />}
        </div>

        <div className="flex items-center justify-end px-5 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[12px] font-medium cursor-pointer hover:bg-[var(--color-hover)]" style={{ color: 'var(--color-text-muted)' }}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
