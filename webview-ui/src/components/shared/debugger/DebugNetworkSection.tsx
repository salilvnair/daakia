/**
 * DebugNetworkSection — Ditto copy of Daakia DevTools Network tab for dk.sendRequest() calls.
 *
 * Uses the exact same split-pane layout (list left, detail right), same rows, same sub-tabs
 * (Request/Response/Network Logs), same badges, same headers table as DevTools NetworkTab.tsx.
 */
import { useState } from 'react';
import { useDebugStore, type DebugSubRequest } from '../../../store/debug-store';
import { CopyIcon, CheckIcon, ChevronDownIcon, ArrowUpRightIcon, ArrowDownLeftIcon, InfoCircleIcon } from '../../../icons/daakia-icons';

interface CollapsibleSectionProps {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  badge?: number;
  chipColor?: string;
  children: React.ReactNode;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes === 0) return '–';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

function formatDuration(ms: number): string {
  if (ms === 0) return '–';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

const methodColorMap: Record<string, string> = {
  GET: '#22c55e', POST: '#f59e0b', PUT: '#3b82f6',
  PATCH: '#a78bfa', DELETE: '#ef4444', HEAD: '#6b7280',
  OPTIONS: '#06b6d4',
};

// ─── Shared sub-components (identical to NetworkTab.tsx) ──────────────────────

function StatusBadge({ status, statusText }: { status: number; statusText?: string }) {
  let color = 'var(--color-text-muted)';
  if (status === 0) color = '#ef4444';
  else if (status >= 200 && status < 300) color = 'var(--color-success)';
  else if (status >= 300 && status < 400) color = '#3b82f6';
  else if (status >= 400 && status < 500) color = '#f59e0b';
  else if (status >= 500) color = '#ef4444';

  // Extract short error code from statusText (e.g., "ECONNREFUSED" from "AggregateError [ECONNREFUSED]: ...")
  const shortError = status === 0 && statusText
    ? (statusText.match(/\[(E[A-Z_]+)\]/)?.[1] || statusText.match(/\b(E[A-Z_]{4,})\b/)?.[1] || statusText.match(/^(\w+Error)/)?.[1] || 'Error')
    : undefined;

  return (
    <span className="font-mono text-[10px] font-semibold" style={{ color }}>
      {status === 0 ? (shortError || 'Error') : status}
    </span>
  );
}

function MethodBadge({ method }: { method: string }) {
  const color = methodColorMap[method.toUpperCase()] ?? 'var(--color-text-muted)';
  return (
    <span className="font-mono text-[10px] font-bold w-[50px] flex-shrink-0" style={{ color }}>
      {method.toUpperCase()}
    </span>
  );
}

function CopyButton({ text, size = 13 }: { text: string; size?: number }) {
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
      className={`h-[22px] w-[22px] flex items-center justify-center cursor-pointer rounded transition-colors ${
        copied ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]'
      }`}
      title={copied ? 'Copied!' : 'Copy'}
    >
      {copied ? <CheckIcon size={size} /> : <CopyIcon size={size} />}
    </button>
  );
}

function HeadersTable({ headers }: { headers: Record<string, string> }) {
  const entries = Object.entries(headers);
  if (entries.length === 0) {
    return <span className="text-[11px] text-[var(--color-text-muted)] italic px-2">No headers</span>;
  }
  return (
    <div className="flex flex-col">
      {entries.map(([key, value], idx) => (
        <div key={key} className={`group/hdr flex items-start gap-2 px-2 py-[4px] text-[11px] leading-[16px] ${idx < entries.length - 1 ? 'border-b border-[color-mix(in_srgb,var(--color-surface-border)_50%,transparent)]' : ''}`}>
          <span className="text-[var(--color-accent)] font-mono font-medium flex-shrink-0 min-w-[100px] select-all">{key}</span>
          <span className="text-[var(--color-text-primary)] font-mono break-all flex-1 select-all">{value}</span>
          <div className="opacity-0 group-hover/hdr:opacity-100 transition-opacity flex-shrink-0">
            <CopyButton text={`${key}: ${value}`} size={11} />
          </div>
        </div>
      ))}
    </div>
  );
}

function NetworkLogEntry({ icon, title, badge, badgeColor, timestamp, defaultExpanded, children }: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  badgeColor?: string;
  timestamp: number;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);
  const timeStr = new Date(timestamp).toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="border-b border-[var(--color-surface-border)] last:border-b-0 group/logrow">
      <div
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-3 py-[6px] cursor-pointer hover:bg-[var(--color-hover)] transition-colors"
      >
        {icon}
        <span className="text-[11px] font-medium text-[var(--color-text-primary)]">{title}</span>
        {badge && (
          <span
            className="px-1.5 py-[1px] rounded text-[9px] font-bold font-mono"
            style={{ color: badgeColor ?? 'var(--color-text-muted)', backgroundColor: `color-mix(in srgb, ${badgeColor ?? 'var(--color-text-muted)'} 12%, transparent)` }}
          >
            {badge}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <span className="px-1.5 py-[1px] rounded text-[9px] font-mono bg-[var(--color-input-bg)] text-[var(--color-text-muted)]">{timeStr}</span>
          <ChevronDownIcon size={12} className={`text-[var(--color-text-muted)] transition-transform duration-150 ${expanded ? '' : '-rotate-90'}`} />
        </span>
      </div>
      {expanded && (
        <div className="pl-8 pr-3 pb-2 pt-0.5">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Main Section ─────────────────────────────────────────────────────────────

export function NetworkSection({ CollapsibleSection }: { CollapsibleSection: React.FC<CollapsibleSectionProps> }) {
  const [expanded, setExpanded] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const subRequests = useDebugStore(s => s.subRequests);
  const active = useDebugStore(s => s.active);

  return (
    <CollapsibleSection title="Network" expanded={expanded} onToggle={() => setExpanded(!expanded)} badge={subRequests.length || undefined} chipColor="#66bb6a">
      {!active && subRequests.length === 0 ? (
        <div className="px-4 py-2 text-[11px] text-[var(--color-text-muted)] italic">No sub-requests</div>
      ) : subRequests.length === 0 ? (
        <div className="px-4 py-2 text-[11px] text-[var(--color-text-muted)] italic">Waiting for dk.sendRequest()…</div>
      ) : (
        <div className="flex flex-col">
          {/* Request list */}
          <div className="flex flex-col overflow-y-auto [scrollbar-gutter:stable]">
            {/* Table header */}
            <div className="flex items-center px-3 py-[4px] border-b border-[var(--color-surface-border)] bg-[var(--color-input-bg)] text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider flex-shrink-0">
              <span className="w-[50px] flex-shrink-0">Method</span>
              <span className="w-[90px] flex-shrink-0">Status</span>
              <span className="flex-1 pl-2">URL</span>
              <span className="w-[60px] text-right flex-shrink-0">Time</span>
            </div>
            {/* Rows */}
            {subRequests.map((sr, idx) => (
              <RequestListRow
                key={idx}
                entry={sr}
                isSelected={selectedIdx === idx}
                onSelect={() => setSelectedIdx(selectedIdx === idx ? null : idx)}
              />
            ))}
          </div>

          {/* Detail panel below */}
          {selectedIdx !== null && subRequests[selectedIdx] && (
            <div className="border-t border-[var(--color-surface-border)]">
              <DetailPanel entry={subRequests[selectedIdx]} />
            </div>
          )}
        </div>
      )}
    </CollapsibleSection>
  );
}

// ─── Request List Row ─────────────────────────────────────────────────────────

function RequestListRow({ entry, isSelected, onSelect }: {
  entry: DebugSubRequest;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const urlPath = (() => {
    try {
      const u = new URL(entry.url);
      return u.hostname + u.pathname + u.search;
    } catch {
      return entry.url;
    }
  })();

  return (
    <div
      onClick={onSelect}
      className={`cursor-pointer border-b border-[var(--color-surface-border)] text-[11px] transition-colors ${
        isSelected
          ? 'bg-[var(--color-input-bg)]'
          : 'hover:bg-[var(--color-surface-hover)]'
      }`}
    >
      <div className="flex items-center px-3 py-[5px]">
        <MethodBadge method={entry.method} />
        <span className="w-[90px] flex-shrink-0"><StatusBadge status={entry.status} statusText={entry.statusText} /></span>
        <span className={`flex-1 truncate pl-2 font-mono ${entry.status === 0 ? 'text-[#ef4444]' : 'text-[var(--color-text-primary)]'}`}>
          {urlPath}
        </span>
        <span className="text-[10px] text-[var(--color-text-muted)] font-mono w-[60px] text-right flex-shrink-0">
          {formatDuration(entry.duration)}
        </span>
      </div>
    </div>
  );
}

// ─── Detail Panel (Request / Response / Network Logs) ─────────────────────────

type DetailTab = 'request' | 'response' | 'network-logs';

function DetailPanel({ entry }: { entry: DebugSubRequest }) {
  const isError = entry.status === 0 || entry.status >= 400;
  const [tab, setTab] = useState<DetailTab>(isError ? 'response' : 'network-logs');
  const statusColor = entry.status === 0 ? '#ef4444' : entry.status >= 200 && entry.status < 300 ? 'var(--color-success)' : entry.status < 400 ? '#f59e0b' : '#ef4444';

  const tabs: { key: DetailTab; label: string }[] = [
    { key: 'request', label: 'Request' },
    { key: 'response', label: 'Response' },
    { key: 'network-logs', label: 'Network Logs' },
  ];

  const getTabContent = (): string => {
    if (tab === 'request') {
      let c = `${entry.method.toUpperCase()} ${entry.url}\n\n`;
      c += Object.entries(entry.requestHeaders || {}).map(([k, v]) => `${k}: ${v}`).join('\n');
      if (entry.requestBody) c += `\n\n${entry.requestBody}`;
      return c;
    }
    if (tab === 'response') {
      let c = `${entry.status} ${entry.statusText}\n\n`;
      c += Object.entries(entry.responseHeaders || {}).map(([k, v]) => `${k}: ${v}`).join('\n');
      if (entry.responseBody) c += `\n\n${entry.responseBody}`;
      return c;
    }
    let c = `[Request] ${entry.method.toUpperCase()} ${entry.url}\n`;
    c += Object.entries(entry.requestHeaders || {}).map(([k, v]) => `${k}: ${v}`).join('\n');
    if (entry.requestBody) c += `\n\n${entry.requestBody}`;
    c += `\n\n[Response] ${entry.status} ${entry.statusText}\n`;
    c += Object.entries(entry.responseHeaders || {}).map(([k, v]) => `${k}: ${v}`).join('\n');
    if (entry.responseBody) c += `\n\n${entry.responseBody}`;
    c += `\n\nCompleted in ${formatDuration(entry.duration)}`;
    return c;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col border-b border-[var(--color-surface-border)] flex-shrink-0">
        <div className="flex items-center gap-2 px-3 py-[5px]">
          <StatusBadge status={entry.status} statusText={entry.statusText} />
          {entry.status !== 0 && (
            <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
              {entry.statusText}
            </span>
          )}
          <span className="text-[10px] text-[var(--color-text-primary)] font-semibold ml-1">
            {entry.method.toUpperCase()}
          </span>
          <span className="px-1.5 py-[1px] rounded text-[9px] font-mono bg-[var(--color-input-bg)] text-[var(--color-text-muted)] ml-auto">
            {formatDuration(entry.duration)}
          </span>
        </div>
        {/* Error message shown directly in header */}
        {isError && entry.status === 0 && entry.statusText && (
          <div className="px-3 pb-[5px] text-[10px] font-mono text-[#ef4444] truncate" title={entry.statusText.split('\n')[0]}>
            {entry.statusText.split('\n')[0].slice(0, 120)}
          </div>
        )}
      </div>

      {/* Sub-tabs with copy */}
      <div className="flex items-center gap-0 px-2 border-b border-[var(--color-surface-border)] flex-shrink-0">
        {tabs.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3 py-[4px] text-[11px] cursor-pointer border-b-2 transition-colors ${
              tab === t.key
                ? 'text-[var(--color-text-primary)] border-[var(--color-accent)]'
                : 'text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text-primary)]'
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto">
          <CopyButton text={getTabContent()} size={12} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {tab === 'request' && (
          <div className="flex flex-col gap-2 p-2">
            {/* URL */}
            <div className="flex items-center gap-2 px-2 py-[4px]">
              <span
                className="px-1.5 py-[1px] rounded text-[9px] font-bold font-mono flex-shrink-0"
                style={{ color: methodColorMap[entry.method.toUpperCase()] ?? 'var(--color-text-muted)', backgroundColor: `color-mix(in srgb, ${methodColorMap[entry.method.toUpperCase()] ?? 'var(--color-text-muted)'} 12%, transparent)` }}
              >
                {entry.method.toUpperCase()}
              </span>
              <span className="text-[11px] text-[var(--color-text-primary)] font-mono break-all leading-[16px] select-all">{entry.url}</span>
            </div>

            {/* Headers */}
            {entry.requestHeaders && Object.keys(entry.requestHeaders).length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-1 px-2">
                  <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">Headers</span>
                  <span className="text-[9px] px-1.5 py-[1px] rounded-full bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-[var(--color-primary)] font-mono font-semibold">
                    {Object.keys(entry.requestHeaders).length}
                  </span>
                </div>
                <HeadersTable headers={entry.requestHeaders} />
              </div>
            )}

            {/* Body */}
            {entry.requestBody && (
              <div>
                <div className="flex items-center gap-2 mb-1 px-2">
                  <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">Body</span>
                  <span className="text-[9px] px-1.5 py-[1px] rounded-full bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-[var(--color-primary)] font-mono font-semibold">
                    {formatSize(new TextEncoder().encode(entry.requestBody).length)}
                  </span>
                </div>
                <pre className="text-[11px] text-[var(--color-text-primary)] font-mono whitespace-pre-wrap bg-[var(--color-input-bg)] rounded-md p-2 max-h-[200px] overflow-y-auto [scrollbar-gutter:stable] leading-[18px] mx-2">
                  {tryFormatJson(entry.requestBody)}
                </pre>
              </div>
            )}
          </div>
        )}

        {tab === 'response' && (
          <div className="flex flex-col gap-2 p-2">
            {/* Status + metrics */}
            <div className="flex items-center gap-2 px-2 py-[4px] flex-wrap">
              <span
                className="px-1.5 py-[1px] rounded text-[9px] font-bold font-mono"
                style={{
                  color: statusColor,
                  backgroundColor: `color-mix(in srgb, ${statusColor} 12%, transparent)`,
                }}
              >
                {entry.status === 0 ? (entry.statusText || 'Error') : `${entry.status} ${entry.statusText}`}
              </span>
              {entry.responseBody && (
                <span className="px-1.5 py-[1px] rounded text-[9px] font-mono bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)] font-semibold">
                  {formatSize(new TextEncoder().encode(entry.responseBody).length)}
                </span>
              )}
              <span className="px-1.5 py-[1px] rounded text-[9px] font-mono bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)] text-[var(--color-success)] font-semibold">
                {formatDuration(entry.duration)}
              </span>
            </div>

            {/* Error details (stack trace) */}
            {isError && entry.status === 0 && entry.statusText && (
              <div className="mx-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] uppercase tracking-wider text-[#ef4444] font-medium">Error Details</span>
                </div>
                <pre className="text-[11px] text-[#ef4444] font-mono whitespace-pre-wrap bg-[rgba(239,68,68,0.06)] rounded-md p-2 leading-[18px] border border-[rgba(239,68,68,0.15)] select-all">
                  {entry.statusText}
                </pre>
              </div>
            )}

            {/* Response Headers */}
            {entry.responseHeaders && Object.keys(entry.responseHeaders).length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-1 px-2">
                  <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">Response Headers</span>
                  <span className="text-[9px] px-1.5 py-[1px] rounded-full bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-[var(--color-primary)] font-mono font-semibold">
                    {Object.keys(entry.responseHeaders).length}
                  </span>
                </div>
                <HeadersTable headers={entry.responseHeaders} />
              </div>
            )}

            {/* Response Body */}
            {entry.responseBody && (
              <div>
                <div className="flex items-center gap-2 mb-1 px-2">
                  <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">Body</span>
                  <span className="text-[9px] px-1.5 py-[1px] rounded-full bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-[var(--color-primary)] font-mono font-semibold">
                    {formatSize(new TextEncoder().encode(entry.responseBody).length)}
                  </span>
                </div>
                <pre className="text-[11px] text-[var(--color-text-primary)] font-mono whitespace-pre-wrap bg-[var(--color-input-bg)] rounded-md p-2 max-h-[200px] overflow-y-auto [scrollbar-gutter:stable] leading-[18px] mx-2">
                  {tryFormatJson(entry.responseBody)}
                </pre>
              </div>
            )}
          </div>
        )}

        {tab === 'network-logs' && <NetworkLogsView entry={entry} />}
      </div>
    </div>
  );
}

// ─── Network Logs View (expand/collapse entries) ──────────────────────────────

function NetworkLogsView({ entry }: { entry: DebugSubRequest }) {
  const methodColor = methodColorMap[entry.method.toUpperCase()] ?? 'var(--color-text-muted)';
  const isError = entry.status === 0 || entry.status >= 400;
  const statusColor = entry.status === 0 ? '#ef4444' : entry.status >= 200 && entry.status < 300 ? 'var(--color-success)' : entry.status < 400 ? '#f59e0b' : '#ef4444';

  return (
    <div className="flex flex-col">
      {/* Request entry */}
      <NetworkLogEntry
        icon={<ArrowUpRightIcon size={13} className="flex-shrink-0 text-[var(--color-protocol-websocket)]" />}
        title="Request Sent"
        badge={entry.method.toUpperCase()}
        badgeColor={methodColor}
        timestamp={entry.timestamp}
      >
        <div className="flex flex-col gap-1.5">
          <div className="text-[11px] font-mono text-[var(--color-text-primary)] break-all">{entry.url}</div>
          {entry.requestHeaders && Object.keys(entry.requestHeaders).length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">Headers</span>
                <span className="text-[9px] px-1.5 py-[1px] rounded-full bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-[var(--color-primary)] font-mono font-semibold">
                  {Object.keys(entry.requestHeaders).length}
                </span>
              </div>
              <HeadersTable headers={entry.requestHeaders} />
            </div>
          )}
          {entry.requestBody && (
            <div className="mt-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">Body</span>
                <span className="text-[9px] px-1.5 py-[1px] rounded-full bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-[var(--color-primary)] font-mono font-semibold">
                  {formatSize(new TextEncoder().encode(entry.requestBody).length)}
                </span>
              </div>
              <pre className="text-[10px] font-mono text-[var(--color-text-primary)] whitespace-pre-wrap mt-0.5 max-h-[100px] overflow-y-auto">{tryFormatJson(entry.requestBody)}</pre>
            </div>
          )}
        </div>
      </NetworkLogEntry>

      {/* Response entry */}
      <NetworkLogEntry
        icon={<ArrowDownLeftIcon size={13} className="flex-shrink-0 text-[var(--color-protocol-graphql)]" />}
        title="Response Received"
        badge={entry.status === 0 ? (entry.statusText ? entry.statusText.split('\n')[0].slice(0, 60) : 'Error') : `${entry.status} ${entry.statusText}`}
        badgeColor={statusColor}
        timestamp={entry.timestamp + entry.duration}
        defaultExpanded={isError}
      >
        <div className="flex flex-col gap-1.5">
          {/* Error stack trace */}
          {isError && entry.status === 0 && entry.statusText && (
            <pre className="text-[10px] text-[#ef4444] font-mono whitespace-pre-wrap bg-[rgba(239,68,68,0.06)] rounded p-2 leading-[16px] border border-[rgba(239,68,68,0.15)] select-all max-h-[200px] overflow-y-auto">
              {entry.statusText}
            </pre>
          )}
          {entry.responseHeaders && Object.keys(entry.responseHeaders).length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">Headers</span>
                <span className="text-[9px] px-1.5 py-[1px] rounded-full bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-[var(--color-primary)] font-mono font-semibold">
                  {Object.keys(entry.responseHeaders).length}
                </span>
              </div>
              <HeadersTable headers={entry.responseHeaders} />
            </div>
          )}
          {entry.responseBody && (
            <div className="mt-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">Body</span>
                <span className="text-[9px] px-1.5 py-[1px] rounded-full bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-[var(--color-primary)] font-mono font-semibold">
                  {formatSize(new TextEncoder().encode(entry.responseBody).length)}
                </span>
              </div>
              <pre className="text-[10px] font-mono text-[var(--color-text-primary)] whitespace-pre-wrap mt-0.5 max-h-[100px] overflow-y-auto">{tryFormatJson(entry.responseBody)}</pre>
            </div>
          )}
        </div>
      </NetworkLogEntry>

      {/* Summary entry */}
      <NetworkLogEntry
        icon={<InfoCircleIcon size={13} className={`flex-shrink-0 ${isError ? 'text-[#ef4444]' : 'text-[var(--color-success)]'}`} />}
        title={isError ? 'Failed' : 'Completed'}
        badge={formatDuration(entry.duration)}
        badgeColor={isError ? '#ef4444' : 'var(--color-success)'}
        timestamp={entry.timestamp + entry.duration}
      >
        <div className="flex items-center gap-3 text-[10px] font-mono text-[var(--color-text-muted)]">
          <span className="flex items-center gap-1.5">Duration: <span className="px-1.5 py-[1px] rounded-full bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)] font-semibold">{formatDuration(entry.duration)}</span></span>
          {entry.responseBody && (
            <span className="flex items-center gap-1.5">Size: <span className="px-1.5 py-[1px] rounded-full bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)] font-semibold">{formatSize(new TextEncoder().encode(entry.responseBody).length)}</span></span>
          )}
        </div>
      </NetworkLogEntry>
    </div>
  );
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function tryFormatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
