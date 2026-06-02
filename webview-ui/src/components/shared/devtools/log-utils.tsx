/**
 * Shared log rendering utilities for Console and Tests tab.
 * Provides: LEVEL_CONFIG, formatTimestamp, LogMessage, LevelIcon, formatArgs.
 */
import { useState } from 'react';
import { JsonTreeViewer, tryParseJson } from '../display/JsonTreeViewer';
import { InfoCircleIcon, WarningTriangleIcon } from '../../../icons';
import type { LogLevel } from '../../../store/devtools-store';

export const LEVEL_CONFIG: Record<LogLevel, { color: string; label: string }> = {
  log:   { color: 'var(--color-text-muted)', label: 'LOG' },
  info:  { color: '#3b82f6', label: 'INFO' },
  warn:  { color: '#f59e0b', label: 'WARN' },
  error: { color: '#ef4444', label: 'ERR' },
  debug: { color: '#a78bfa', label: 'DBG' },
};

export function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  } as Intl.DateTimeFormatOptions);
}

export function formatArgs(args: unknown[]): string {
  return args.map(arg => {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    if (typeof arg === 'string') return arg;
    if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
    try {
      return JSON.stringify(arg, null, 2);
    } catch {
      return String(arg);
    }
  }).join(' ');
}

function hasJsonContent(args: unknown[]): boolean {
  return args.some(arg => {
    if (typeof arg === 'object' && arg !== null) return true;
    if (typeof arg === 'string') return tryParseJson(arg) !== null;
    return false;
  });
}

function extractJsonParts(args: unknown[]): { text: string[]; json: unknown[] } {
  const text: string[] = [];
  const json: unknown[] = [];
  for (const arg of args) {
    if (typeof arg === 'object' && arg !== null) {
      json.push(arg);
    } else if (typeof arg === 'string') {
      const parsed = tryParseJson(arg);
      if (parsed !== null) {
        json.push(parsed);
      } else {
        text.push(arg);
      }
    } else {
      text.push(arg === null ? 'null' : arg === undefined ? 'undefined' : String(arg));
    }
  }
  return { text, json };
}

// Status code badge colors
const STATUS_COLORS: Record<string, string> = {
  '1': 'var(--color-text-muted)',
  '2': '#4ade80',
  '3': '#60a5fa',
  '4': '#f59e0b',
  '5': '#ef4444',
};

function StatusHighlightedText({ text }: { text: string }) {
  const statusRegex = /(Status:\s*)?(\b[1-5]\d{2}\b)(\s+[A-Z][A-Za-z\s]*)?/g;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = statusRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(<span key={key++}>{text.slice(lastIdx, match.index)}</span>);
    }
    const statusCode = match[2];
    const statusText = match[3] || '';
    const prefix = match[1] || '';
    const color = STATUS_COLORS[statusCode[0]] || 'var(--color-text-primary)';
    parts.push(
      <span key={key++}>
        {prefix}
        <span className="inline-flex items-center px-1 py-0 rounded text-[10px] font-medium" style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>
          {statusCode}{statusText}
        </span>
      </span>
    );
    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIdx)}</span>);
  }

  return parts.length > 0 ? <>{parts}</> : <span>{text}</span>;
}

/** A log entry message with optional JSON tree view */
export function LogMessage({ args, expandedPaths, onTogglePath }: { args: unknown[]; expandedPaths?: Set<string>; onTogglePath?: (path: string) => void }) {
  const containsJson = hasJsonContent(args);
  const [viewMode, setViewMode] = useState<'raw' | 'json'>('json');
  const rawText = formatArgs(args);

  if (!containsJson) {
    return (
      <span className="flex-1 break-all whitespace-pre-wrap text-[var(--color-text-primary)]">
        <StatusHighlightedText text={rawText} />
      </span>
    );
  }

  const { text, json } = extractJsonParts(args);

  return (
    <div className="flex-1 min-w-0">
      {/* Raw/JSON toggle */}
      <div className="flex items-center gap-1 mb-1">
        <button
          onClick={() => setViewMode('raw')}
          className={`px-1.5 py-0 text-[9px] rounded cursor-pointer transition-colors ${
            viewMode === 'raw'
              ? 'bg-[var(--color-input-bg)] text-[var(--color-text-primary)] font-medium'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
          }`}
        >
          Raw
        </button>
        <button
          onClick={() => setViewMode('json')}
          className={`px-1.5 py-0 text-[9px] rounded cursor-pointer transition-colors ${
            viewMode === 'json'
              ? 'bg-[var(--color-input-bg)] text-[var(--color-text-primary)] font-medium'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
          }`}
        >
          JSON
        </button>
      </div>

      {viewMode === 'raw' ? (
        <span className="break-all whitespace-pre-wrap text-[var(--color-text-primary)]">
          <StatusHighlightedText text={rawText} />
        </span>
      ) : (
        <div>
          {text.length > 0 && (
            <div className="text-[var(--color-text-primary)] mb-1">
              <StatusHighlightedText text={text.join(' ')} />
            </div>
          )}
          {json.map((obj, i) => (
            <div key={i} className={i > 0 ? 'mt-1' : ''}>
              <JsonTreeViewer data={obj} maxInitialDepth={2} expandedPaths={expandedPaths} onTogglePath={onTogglePath} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function LevelIcon({ level }: { level: LogLevel }) {
  const config = LEVEL_CONFIG[level];
  if (level === 'warn') return <WarningTriangleIcon size={12} style={{ color: config.color }} />;
  if (level === 'error') return <InfoCircleIcon size={12} style={{ color: config.color }} />;
  if (level === 'info') return <InfoCircleIcon size={12} style={{ color: config.color }} />;
  return <span className="w-3 h-3 flex items-center justify-center text-[9px] font-bold" style={{ color: config.color }}>›</span>;
}
