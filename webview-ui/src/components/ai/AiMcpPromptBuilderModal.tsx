/**
 * AiMcpPromptBuilderModal — Natural language → structured MCP prompt with tool call sequences.
 * Task 10.4 — MCP AI Prompt Builder ✦ · Gate: mcpPromptBuilder
 */
import { useState, useRef, useEffect } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';
import { ModalView, AIButtonView, MultilineInputView } from '@salilvnair/dui';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-ai)';

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

    const userMessage = `You are an MCP (Model Context Protocol) expert. The user wants to accomplish the following goal using MCP tools:

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
## Example Usage`;

    // `mcp.prompt.builder`, not `.build` — the registry has only the former, and
    // a key that resolves to nothing takes the button down with it.
    postMsg({ type: 'aiStream', payload: { userMessage, templateKey: 'mcp.prompt.builder' } });
  };

  return (
    <ModalView
      open
      onClose={onClose}
      title="MCP Prompt Builder"
      size="lg"
      headerColor={ACCENT}
      headerIcon={
        <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${ACCENT} 20%, transparent)` }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
        </div>
      }
      footerRight={
        <AIButtonView
          label={loading ? 'Building…' : 'Build Prompt'}
          size="md"
          accentColor={ACCENT}
          disabled={!description.trim() || loading}
          loading={loading}
          onClick={handleGenerate}
        />
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Describe what you want to accomplish with your MCP tools in plain English:</p>
        <MultilineInputView
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="e.g. Search GitHub for issues about memory leaks, then summarize each issue and create a JIRA ticket for the top 3"
          rows={3}
          size="md"
          accentColor={ACCENT}
          width="fw"
          onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate(); }}
        />
        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Available tools: <span style={{ color: ACCENT }}>{availableTools}</span></span>

        {error && <p className="text-[11px] px-3 py-2 rounded-lg mb-3" style={{ color: 'var(--color-error)', backgroundColor: 'color-mix(in srgb, var(--color-error) 8%, transparent)' }}>{error}</p>}
        {loading && !result && <p className="text-[11px] animate-pulse" style={{ color: ACCENT }}>Analyzing tools and building prompt sequence…</p>}
        {!result && !loading && !error && (
          <div className="flex items-center gap-2">
            <SparkleIcon size={14} style={{ color: ACCENT, opacity: 0.5, flexShrink: 0 }} />
            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Describe your goal above and AI will build a structured MCP prompt with the optimal tool call sequence.</p>
          </div>
        )}
        {result && <MdViewer content={result} />}
      </div>
    </ModalView>
  );
}
