import { useState, useMemo, useCallback } from 'react';
import { type AiMessage } from '../../store/tabs-store';
import { McpToolIcon, CopyIcon, ChevronDownIcon, ChevronRightIcon } from '../../icons';
import { JsonTreeViewer } from '../shared/display/JsonTreeViewer';

interface Props {
  message: AiMessage;
}

// ─── Lightweight markdown renderer ───

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      nodes.push(
        <div key={`cb-${i}`} className="relative group my-2">
          {lang && (
            <div className="text-[10px] px-2 py-0.5 rounded-t-md font-mono" style={{ backgroundColor: 'rgba(0,0,0,0.3)', color: 'var(--color-text-muted)' }}>
              {lang}
            </div>
          )}
          <pre className={`text-[12px] font-mono p-3 overflow-x-auto rounded-b-md whitespace-pre ${lang ? '' : 'rounded-t-md'}`} style={{ backgroundColor: 'rgba(0,0,0,0.35)', color: 'var(--color-text-primary)' }}>
            <code>{codeLines.join('\n')}</code>
          </pre>
          <CopyCodeButton text={codeLines.join('\n')} />
        </div>
      );
      i++;
      continue;
    }

    // H2/H3 header
    if (line.startsWith('## ')) {
      nodes.push(<h2 key={`h2-${i}`} className="text-[13px] font-semibold mt-3 mb-1 text-[var(--color-text-primary)]">{line.slice(3)}</h2>);
      i++; continue;
    }
    if (line.startsWith('### ')) {
      nodes.push(<h3 key={`h3-${i}`} className="text-[12px] font-semibold mt-2 mb-0.5 text-[var(--color-text-primary)]">{line.slice(4)}</h3>);
      i++; continue;
    }
    if (line.startsWith('# ')) {
      nodes.push(<h1 key={`h1-${i}`} className="text-[14px] font-bold mt-3 mb-1.5 text-[var(--color-text-primary)]">{line.slice(2)}</h1>);
      i++; continue;
    }

    // Table (starts with |)
    if (line.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      nodes.push(<MarkdownTable key={`tbl-${i}`} lines={tableLines} />);
      continue;
    }

    // Unordered list
    if (line.match(/^[-*]\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*]\s/)) {
        items.push(lines[i].slice(2));
        i++;
      }
      nodes.push(
        <ul key={`ul-${i}`} className="my-1 pl-4 space-y-0.5 list-disc">
          {items.map((item, idx) => <li key={idx} className="text-[13px]">{inlineMarkdown(item)}</li>)}
        </ul>
      );
      continue;
    }

    // Horizontal rule
    if (line.match(/^---+$/)) {
      nodes.push(<hr key={`hr-${i}`} className="my-2 border-[var(--color-surface-border)]" />);
      i++; continue;
    }

    // Empty line → paragraph break
    if (line.trim() === '') {
      if (nodes.length > 0) nodes.push(<div key={`br-${i}`} className="h-1" />);
      i++; continue;
    }

    // Normal paragraph
    nodes.push(<p key={`p-${i}`} className="text-[13px] leading-relaxed">{inlineMarkdown(line)}</p>);
    i++;
  }

  return nodes;
}

/** Render inline markdown: **bold**, `code`, *italic* */
function inlineMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="px-1 py-0.5 rounded text-[11px] font-mono" style={{ backgroundColor: 'rgba(0,0,0,0.3)', color: 'var(--color-protocol-ai)' }}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

function MarkdownTable({ lines }: { lines: string[] }) {
  const rows = lines.filter(l => !l.match(/^\|[-| ]+\|$/));
  if (rows.length === 0) return null;
  const [header, ...body] = rows;
  const parseRow = (l: string) => l.split('|').slice(1, -1).map(c => c.trim());

  return (
    <div className="my-2 overflow-x-auto rounded-md border border-[var(--color-surface-border)]">
      <table className="min-w-full text-[12px]">
        <thead>
          <tr className="border-b border-[var(--color-surface-border)]" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
            {parseRow(header).map((h, i) => (
              <th key={i} className="px-3 py-1.5 text-left font-semibold text-[var(--color-text-primary)] whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className="border-b border-[var(--color-surface-border)] last:border-b-0 hover:bg-[rgba(255,255,255,0.02)] transition-colors">
              {parseRow(row).map((cell, ci) => (
                <td key={ci} className="px-3 py-1.5 text-[var(--color-text-muted)] align-top">{inlineMarkdown(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CopyCodeButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity h-[22px] px-1.5 flex items-center gap-1 rounded text-[10px] cursor-pointer"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', color: 'var(--color-text-muted)' }}
      title="Copy code"
    >
      <CopyIcon size={10} />
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

// ─── Token Badge ───

function TokenBadge({ tokens }: { tokens: { prompt: number; completion: number; total: number } }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowBreakdown(p => !p)}
        className="text-[9px] px-1.5 py-0.5 rounded-full font-mono cursor-pointer transition-all hover:brightness-110"
        style={{
          backgroundColor: showBreakdown
            ? 'color-mix(in srgb, var(--color-protocol-ai) 20%, transparent)'
            : 'color-mix(in srgb, var(--color-protocol-ai) 12%, transparent)',
          color: 'var(--color-protocol-ai)',
        }}
        title="Click to see token breakdown"
      >
        {tokens.total.toLocaleString()} tok
      </button>
      {showBreakdown && (
        <div
          className="absolute top-full mt-1 left-0 z-50 rounded-lg border shadow-lg p-2.5 flex flex-col gap-1.5 min-w-[160px]"
          style={{ backgroundColor: 'var(--color-panel)', borderColor: 'var(--color-surface-border)' }}
        >
          <p className="text-[10px] font-semibold mb-0.5" style={{ color: 'var(--color-text-primary)' }}>Token Usage</p>
          <div className="flex items-center justify-between gap-4">
            <span className="text-[9.5px]" style={{ color: 'var(--color-text-muted)' }}>↑ Prompt</span>
            <span className="text-[9.5px] font-mono" style={{ color: 'var(--color-text-secondary)' }}>{tokens.prompt.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-[9.5px]" style={{ color: 'var(--color-text-muted)' }}>↓ Completion</span>
            <span className="text-[9.5px] font-mono" style={{ color: 'var(--color-text-secondary)' }}>{tokens.completion.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between gap-4 border-t pt-1.5" style={{ borderColor: 'var(--color-surface-border)' }}>
            <span className="text-[9.5px] font-semibold" style={{ color: 'var(--color-protocol-ai)' }}>= Total</span>
            <span className="text-[9.5px] font-mono font-semibold" style={{ color: 'var(--color-protocol-ai)' }}>{tokens.total.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Message Bubble ───

export function AiMessageBubble({ message }: Props) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isTool = message.role === 'tool';

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [message.content]);

  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const renderedContent = useMemo(() => {
    if (isUser || isTool) return null;
    return renderMarkdown(message.content);
  }, [message.content, isUser, isTool]);

  return (
    <div className={`flex flex-col gap-0.5 ${isUser ? 'items-end' : 'items-start'} group`}>
      {/* Role label */}
      <div className="flex items-center gap-1.5 px-1">
        <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
          {message.role}
          {message.timestamp > 0 && ` · ${formatTime(message.timestamp)}`}
        </span>
        {message.tokens && (
          <TokenBadge tokens={message.tokens} />
        )}
        {/* Copy button — only for assistant messages */}
        {isAssistant && (
          <button
            type="button"
            onClick={handleCopy}
            className="opacity-0 group-hover:opacity-100 transition-opacity h-[16px] w-[16px] flex items-center justify-center rounded cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            title={copied ? 'Copied!' : 'Copy response'}
          >
            <CopyIcon size={10} />
          </button>
        )}
      </div>

      {/* Message bubble */}
      <div
        className={`max-w-[92%] px-3 py-2 rounded-lg text-[13px] leading-relaxed break-words ${
          isUser
            ? 'bg-[var(--color-protocol-ai)] text-white rounded-br-sm whitespace-pre-wrap'
            : isTool
            ? 'bg-[var(--color-surface-raised)] border border-[var(--color-surface-border)] text-[var(--color-text-primary)] rounded-bl-sm'
            : 'bg-[var(--color-surface-raised)] border border-[var(--color-surface-border)] text-[var(--color-text-primary)] rounded-bl-sm'
        }`}
      >
        {isTool ? (
          <ToolResponseContent content={message.content} />
        ) : isAssistant ? (
          <div className="flex flex-col">{renderedContent}</div>
        ) : (
          message.content
        )}
      </div>

      {/* Tool calls from assistant */}
      {isAssistant && message.toolCalls && message.toolCalls.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-1 max-w-[92%]">
          {message.toolCalls.map((tc) => (
            <ToolCallCard key={tc.id} name={tc.function.name} args={tc.function.arguments} />
          ))}
        </div>
      )}
    </div>
  );
}

function ToolCallCard({ name, args }: { name: string; args: string }) {
  const [expanded, setExpanded] = useState(false);

  const parsedArgs = useMemo(() => {
    try { return JSON.parse(args); } catch { return null; }
  }, [args]);

  return (
    <div className="rounded-lg border border-[color-mix(in_srgb,var(--color-protocol-ai)_25%,var(--color-surface-border))] overflow-hidden">
      <div
        className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-[var(--color-hover)] transition-colors"
        onClick={() => setExpanded(!expanded)}
        style={{ backgroundColor: 'color-mix(in srgb, var(--color-protocol-ai) 5%, transparent)' }}
      >
        <McpToolIcon size={13} />
        <span className="text-[11px] font-semibold text-[var(--color-protocol-ai)]">{name}</span>
        <span className="flex-1" />
        {parsedArgs && (expanded ? <ChevronDownIcon size={11} /> : <ChevronRightIcon size={11} />)}
      </div>
      {expanded && parsedArgs && (
        <div className="px-2.5 py-2 border-t border-[var(--color-surface-border)] bg-[var(--color-surface)] text-[11px]">
          <JsonTreeViewer data={parsedArgs} maxInitialDepth={2} />
        </div>
      )}
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
    return (
      <div className="font-mono text-[12px]">
        <div className="flex items-center gap-1 mb-1">
          <span className="text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: 'color-mix(in srgb, var(--color-protocol-mcp) 15%, transparent)', color: 'var(--color-protocol-mcp)' }}>Tool Result</span>
          <button type="button" onClick={handleCopy} className="ml-auto h-[18px] w-[18px] flex items-center justify-center rounded cursor-pointer opacity-50 hover:opacity-100 transition-opacity text-[var(--color-text-muted)]"><CopyIcon size={10} /></button>
        </div>
        {content}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-1 mb-1.5">
        <span className="text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: 'color-mix(in srgb, var(--color-protocol-mcp) 15%, transparent)', color: 'var(--color-protocol-mcp)' }}>Tool Result</span>
        <div className="flex items-center gap-0.5 ml-2">
          {(['json', 'raw'] as const).map(m => (
            <button key={m} type="button" onClick={() => setViewMode(m)} className={`h-[18px] px-1.5 text-[9px] rounded cursor-pointer transition-colors ${viewMode === m ? 'bg-[var(--color-protocol-ai)] text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'}`}>{m.toUpperCase()}</button>
          ))}
        </div>
        <button type="button" onClick={handleCopy} className="ml-auto h-[18px] w-[18px] flex items-center justify-center rounded cursor-pointer opacity-50 hover:opacity-100 transition-opacity text-[var(--color-text-muted)]" title={copied ? 'Copied!' : 'Copy'}><CopyIcon size={10} /></button>
      </div>
      {viewMode === 'json' ? (
        <div className="text-[11px]"><JsonTreeViewer data={parsed} maxInitialDepth={3} /></div>
      ) : (
        <pre className="text-[11px] font-mono whitespace-pre-wrap break-words text-[var(--color-text-muted)] max-h-[200px] overflow-auto">{JSON.stringify(parsed, null, 2)}</pre>
      )}
    </div>
  );
}
