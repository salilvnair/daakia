import { useState, useMemo } from 'react';
import { type AiMessage } from '../../store/tabs-store';
import { McpToolIcon, CopyIcon, ChevronDownIcon, ChevronRightIcon } from '../../icons';
import { JsonTreeViewer } from '../shared/display/JsonTreeViewer';

interface Props {
  message: AiMessage;
}

/**
 * AiMessageBubble — Renders a single chat message with role-based styling.
 * Tool responses are shown in a JSON viewer.
 */
export function AiMessageBubble({ message }: Props) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isTool = message.role === 'tool';

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={`flex flex-col gap-0.5 ${isUser ? 'items-end' : 'items-start'}`}>
      {/* Role label */}
      <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] px-1">
        {message.role}
        {message.timestamp > 0 && ` · ${formatTime(message.timestamp)}`}
        {message.tokens && (
          <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full font-mono" style={{ backgroundColor: 'color-mix(in srgb, var(--color-protocol-ai) 12%, transparent)', color: 'var(--color-protocol-ai)' }}>
            {message.tokens.total} tokens
          </span>
        )}
      </span>

      {/* Message bubble */}
      <div
        className={`max-w-[85%] px-3 py-2 rounded-lg text-[13px] leading-relaxed whitespace-pre-wrap break-words ${
          isUser
            ? 'bg-[var(--color-protocol-ai)] text-white rounded-br-sm'
            : isTool
            ? 'bg-[var(--color-surface-raised)] border border-[var(--color-surface-border)] text-[var(--color-text-primary)] rounded-bl-sm'
            : 'bg-[var(--color-surface-raised)] border border-[var(--color-surface-border)] text-[var(--color-text-primary)] rounded-bl-sm'
        }`}
      >
        {isTool ? (
          <ToolResponseContent content={message.content} />
        ) : (
          message.content
        )}
      </div>

      {/* Tool calls from assistant */}
      {isAssistant && message.toolCalls && message.toolCalls.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-1 max-w-[85%]">
          {message.toolCalls.map((tc) => (
            <ToolCallCard key={tc.id} name={tc.function.name} args={tc.function.arguments} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Colorful tool call card with name badge and JSON args */
function ToolCallCard({ name, args }: { name: string; args: string }) {
  const [expanded, setExpanded] = useState(false);

  const parsedArgs = useMemo(() => {
    try { return JSON.parse(args); } catch { return null; }
  }, [args]);

  return (
    <div className="rounded-lg border border-[color-mix(in_srgb,var(--color-protocol-ai)_25%,var(--color-surface-border))] overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-[var(--color-hover)] transition-colors"
        onClick={() => setExpanded(!expanded)}
        style={{ backgroundColor: 'color-mix(in srgb, var(--color-protocol-ai) 5%, transparent)' }}
      >
        <McpToolIcon size={13} />
        <span className="text-[11px] font-semibold text-[var(--color-protocol-ai)]">{name}</span>
        <span className="flex-1" />
        {parsedArgs && (
          expanded ? <ChevronDownIcon size={11} /> : <ChevronRightIcon size={11} />
        )}
      </div>
      {/* Expanded args */}
      {expanded && parsedArgs && (
        <div className="px-2.5 py-2 border-t border-[var(--color-surface-border)] bg-[var(--color-surface)] text-[11px]">
          <JsonTreeViewer data={parsedArgs} maxInitialDepth={2} />
        </div>
      )}
      {/* Inline preview when collapsed */}
      {!expanded && args && args.length > 0 && (
        <div className="px-2.5 py-1 border-t border-[var(--color-surface-border)] bg-[var(--color-surface)]">
          <code className="text-[10px] text-[var(--color-text-muted)] font-mono truncate block">
            {args.length > 120 ? args.slice(0, 120) + '...' : args}
          </code>
        </div>
      )}
    </div>
  );
}

/** Tool response with JSON viewer or raw text */
function ToolResponseContent({ content }: { content: string }) {
  const [viewMode, setViewMode] = useState<'json' | 'raw'>('json');
  const [copied, setCopied] = useState(false);

  const parsed = useMemo(() => {
    try { return JSON.parse(content); } catch { return null; }
  }, [content]);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!parsed) {
    // Raw text tool response
    return (
      <div className="font-mono text-[12px]">
        <div className="flex items-center gap-1 mb-1">
          <span className="text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: 'color-mix(in srgb, var(--color-protocol-mcp) 15%, transparent)', color: 'var(--color-protocol-mcp)' }}>
            Tool Result
          </span>
          <button type="button" onClick={handleCopy} className="ml-auto h-[18px] w-[18px] flex items-center justify-center rounded cursor-pointer opacity-50 hover:opacity-100 transition-opacity text-[var(--color-text-muted)]">
            <CopyIcon size={10} />
          </button>
        </div>
        {content}
      </div>
    );
  }

  return (
    <div>
      {/* Header with tabs + copy */}
      <div className="flex items-center gap-1 mb-1.5">
        <span className="text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: 'color-mix(in srgb, var(--color-protocol-mcp) 15%, transparent)', color: 'var(--color-protocol-mcp)' }}>
          Tool Result
        </span>
        <div className="flex items-center gap-0.5 ml-2">
          <button
            type="button"
            onClick={() => setViewMode('json')}
            className={`h-[18px] px-1.5 text-[9px] rounded cursor-pointer transition-colors ${viewMode === 'json' ? 'bg-[var(--color-protocol-ai)] text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'}`}
          >
            JSON
          </button>
          <button
            type="button"
            onClick={() => setViewMode('raw')}
            className={`h-[18px] px-1.5 text-[9px] rounded cursor-pointer transition-colors ${viewMode === 'raw' ? 'bg-[var(--color-protocol-ai)] text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'}`}
          >
            Raw
          </button>
        </div>
        <button type="button" onClick={handleCopy} className="ml-auto h-[18px] w-[18px] flex items-center justify-center rounded cursor-pointer opacity-50 hover:opacity-100 transition-opacity text-[var(--color-text-muted)]" title={copied ? 'Copied!' : 'Copy'}>
          <CopyIcon size={10} />
        </button>
      </div>
      {/* Body */}
      {viewMode === 'json' ? (
        <div className="text-[11px]">
          <JsonTreeViewer data={parsed} maxInitialDepth={3} />
        </div>
      ) : (
        <pre className="text-[11px] font-mono whitespace-pre-wrap break-words text-[var(--color-text-muted)] max-h-[200px] overflow-auto">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      )}
    </div>
  );
}
