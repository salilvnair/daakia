/**
 * WsLogEntry — Collapsible log entry row for WebSocket messages.
 */
import { useState } from 'react';
import {
  ChevronDownIcon, CopyIcon, CheckIcon, DownloadIcon,
  WrapLinesIcon, InfoCircleIcon, WarningTriangleIcon,
  ArrowUpRightIcon, ArrowDownLeftIcon, CheckCircleFilledIcon,
} from '../../../icons';
import { CodeEditor } from '../../shared';

// ────────── Types ──────────

export interface WsMessage {
  id: string;
  direction: 'sent' | 'received' | 'system' | 'error' | 'disconnect';
  data: string;
  timestamp: number;
}

// ────────── Copy Button ──────────

export function CopyButton({ text, size = 13 }: { text: string; size?: number }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`h-[24px] w-[24px] flex items-center justify-center cursor-pointer rounded transition-colors ${
        copied
          ? 'text-[var(--color-success)]'
          : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]'
      }`}
      title={copied ? 'Copied!' : 'Copy'}
    >
      {copied ? <CheckIcon size={size} /> : <CopyIcon size={size} />}
    </button>
  );
}

// ────────── Log Entry ──────────

export function WsLogEntry({ message }: { message: WsMessage }) {
  const [expanded, setExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<'json' | 'raw'>('json');
  const [wordWrap, setWordWrap] = useState(false);

  const isSent = message.direction === 'sent';
  const isSystem = message.direction === 'system';
  const isError = message.direction === 'error';
  const isDisconnect = message.direction === 'disconnect';
  const isStatusMsg = isSystem || isError || isDisconnect;
  const timeStr = new Date(message.timestamp).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  });

  // Try to format as JSON
  let formattedData = message.data;
  let isJson = false;
  if (!isStatusMsg) {
    try {
      const parsed = JSON.parse(message.data);
      formattedData = JSON.stringify(parsed, null, 2);
      isJson = true;
    } catch {
      // keep as-is
    }
  }

  const singleLine = isJson ? JSON.stringify(JSON.parse(message.data)) : message.data;

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const content = viewMode === 'json' && isJson ? formattedData : message.data;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ws-message-${message.id.slice(0, 8)}.${isJson ? 'json' : 'txt'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="border-b border-[var(--color-surface-border)] last:border-b-0 group/row">
      {/* Collapsed row */}
      <div
        onClick={() => !isStatusMsg && setExpanded(!expanded)}
        className={`w-full flex items-center gap-3 px-3 py-2 transition-colors text-left ${
          isStatusMsg ? '' : 'cursor-pointer hover:bg-[var(--color-hover)]'
        }`}
      >
        {/* Direction icon */}
        {isError ? (
          <WarningTriangleIcon size={14} className="flex-shrink-0 text-[var(--color-error)]" />
        ) : isDisconnect ? (
          <InfoCircleIcon size={14} className="flex-shrink-0 text-[var(--color-warning)]" />
        ) : isSystem ? (
          <CheckCircleFilledIcon size={14} className="flex-shrink-0 text-[var(--color-success)]" />
        ) : isSent ? (
          <ArrowUpRightIcon size={14} className="flex-shrink-0 text-[var(--color-protocol-websocket)]" />
        ) : (
          <ArrowDownLeftIcon size={14} className="flex-shrink-0 text-[var(--color-protocol-graphql)]" />
        )}

        {/* Timestamp */}
        <span className="text-[11px] text-[var(--color-text-muted)] flex-shrink-0 whitespace-nowrap">{timeStr}</span>

        {/* Message preview (single line) */}
        <span className={`flex-1 text-[12px] font-mono truncate ${isError ? 'text-[var(--color-error)]' : isDisconnect ? 'text-[var(--color-warning)]' : isSystem ? 'text-[var(--color-success)]' : 'text-[var(--color-text-primary)]'}`}>
          {singleLine}
        </span>

        {/* Hover actions: copy + chevron */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <div className="opacity-0 group-hover/row:opacity-100 transition-opacity">
            <CopyButton text={message.data} size={12} />
          </div>
          {!isStatusMsg && (
            <ChevronDownIcon
              size={14}
              className={`text-[var(--color-text-muted)] transition-transform duration-150 ${expanded ? '' : '-rotate-90'}`}
            />
          )}
        </div>
      </div>

      {/* Expanded content — only for non-system messages */}
      {expanded && !isStatusMsg && (
        <div className="border-t border-[var(--color-surface-border)] bg-[var(--color-panel)]">
          {/* Tabs + actions row */}
          <div className="flex items-center justify-between px-3 py-1">
            {/* JSON / Raw tabs — only show JSON tab if message is actually JSON */}
            <div className="flex items-center gap-0">
              {isJson && (
                <button
                  type="button"
                  onClick={() => setViewMode('json')}
                  className={`px-2 py-1 text-[11px] font-bold cursor-pointer transition-colors border-b-2 ${
                    viewMode === 'json'
                      ? 'text-[var(--color-text-primary)] border-[var(--color-protocol-websocket)]'
                      : 'text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  JSON
                </button>
              )}
              <button
                type="button"
                onClick={() => setViewMode('raw')}
                className={`px-2 py-1 text-[11px] font-bold cursor-pointer transition-colors border-b-2 ${
                  viewMode === 'raw' || !isJson
                    ? 'text-[var(--color-text-primary)] border-[var(--color-protocol-websocket)]'
                    : 'text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text-primary)]'
                }`}
              >
                Raw
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex items-center">
              <span className="text-[10px] text-[var(--color-text-muted)] mr-2">Response Body</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setWordWrap(!wordWrap); }}
                className={`h-[24px] w-[24px] flex items-center justify-center cursor-pointer rounded transition-colors ${
                  wordWrap ? 'text-[var(--color-protocol-websocket)] bg-[rgba(76,175,80,0.08)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]'
                }`}
                title="Toggle word wrap"
              >
                <WrapLinesIcon size={13} />
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="h-[24px] w-[24px] flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] cursor-pointer rounded transition-colors"
                title="Download"
              >
                <DownloadIcon size={13} />
              </button>
              <CopyButton text={viewMode === 'json' && isJson ? formattedData : message.data} />
            </div>
          </div>

          {/* Code viewer */}
          <div className="h-[120px] border-t border-[var(--color-surface-border)]">
            <CodeEditor
              value={viewMode === 'json' && isJson ? formattedData : message.data}
              onChange={() => {}}
              language={viewMode === 'json' && isJson ? 'json' : 'plaintext'}
              height="100%"
              readOnly
              wordWrap={wordWrap}
            />
          </div>
        </div>
      )}
    </div>
  );
}
