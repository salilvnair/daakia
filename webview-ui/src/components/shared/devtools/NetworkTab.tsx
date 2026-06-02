/**
 * NetworkTab — Shows request/response details for each HTTP request (like Bruno's Network tab).
 * Left: request list table (METHOD, URL, STATUS, DURATION, SIZE)
 * Right: detail panel with Request/Response/Network Logs sub-tabs
 */
import { useState, useMemo } from 'react';
import { useDevToolsStore, type NetworkEntry } from '../../../store/devtools-store';
import { NetworkIcon, CopyIcon, CheckIcon, ChevronDownIcon, ArrowUpRightIcon, ArrowDownLeftIcon, InfoCircleIcon } from '../../../icons';

type DetailTab = 'request' | 'response' | 'network-logs';

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

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function StatusBadge({ status, statusText, protocol }: { status: number; statusText?: string; protocol?: string }) {
  let color = 'var(--color-text-muted)';
  if (protocol === 'grpc') {
    // gRPC: 0 = OK (green), anything > 0 = error (red)
    color = status === 0 ? 'var(--color-success)' : '#ef4444';
  } else {
    // HTTP-based protocols
    if (status === 0) color = '#ef4444';
    else if (status >= 200 && status < 300) color = 'var(--color-success)';
    else if (status >= 300 && status < 400) color = '#3b82f6';
    else if (status >= 400 && status < 500) color = '#f59e0b';
    else if (status >= 500) color = '#ef4444';
  }

  const displayStatus = protocol === 'grpc'
    ? (status === 0 ? 'OK' : statusText || `CODE_${status}`)
    : (status === 0 ? (statusText || 'Error') : status);

  return (
    <span className="font-mono text-[10px] font-semibold" style={{ color }}>
      {displayStatus}
    </span>
  );
}

const methodColorMap: Record<string, string> = {
  GET: '#22c55e', POST: '#f59e0b', PUT: '#3b82f6',
  PATCH: '#a78bfa', DELETE: '#ef4444', HEAD: '#6b7280',
  OPTIONS: '#06b6d4', GRPC: '#00b8b5',
};

function MethodBadge({ method }: { method: string }) {
  const color = methodColorMap[method.toUpperCase()] ?? 'var(--color-text-muted)';
  return (
    <span className="font-mono text-[10px] font-bold w-[50px] flex-shrink-0" style={{ color }}>
      {method.toUpperCase()}
    </span>
  );
}

function RequestListRow({ entry, isSelected, onSelect }: {
  entry: NetworkEntry;
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
      className={`flex items-center px-3 py-[5px] cursor-pointer border-b border-[var(--color-surface-border)] text-[11px] transition-colors ${
        isSelected
          ? 'bg-[var(--color-input-bg)]'
          : 'hover:bg-[var(--color-surface-hover)]'
      }`}
    >
      <MethodBadge method={entry.method} />
      <span className="w-[80px] flex-shrink-0 truncate"><StatusBadge status={entry.status} statusText={entry.statusText} protocol={entry.protocol} /></span>
      <span className="flex-1 truncate text-[var(--color-text-primary)] pl-2">{urlPath}</span>
      <span className="text-[10px] text-[var(--color-text-muted)] font-mono w-[60px] text-right flex-shrink-0">
        {formatDuration(entry.duration)}
      </span>
      <span className="text-[10px] text-[var(--color-text-muted)] font-mono w-[52px] text-right flex-shrink-0">
        {formatSize(entry.size)}
      </span>
    </div>
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

function NetworkLogEntry({ type, icon, title, badge, badgeColor, timestamp, children }: {
  type: 'request' | 'response' | 'info';
  icon: React.ReactNode;
  title: string;
  badge?: string;
  badgeColor?: string;
  timestamp: number;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
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

function NetworkLogsView({ entry }: { entry: NetworkEntry }) {
  const methodColor = methodColorMap[entry.method.toUpperCase()] ?? 'var(--color-text-muted)';
  const isGrpc = entry.protocol === 'grpc';
  const isError = isGrpc ? entry.status !== 0 : (entry.status === 0 || entry.status >= 400);
  const statusColor = isGrpc
    ? (entry.status === 0 ? 'var(--color-success)' : '#ef4444')
    : (entry.status === 0 ? '#ef4444' : entry.status >= 200 && entry.status < 300 ? 'var(--color-success)' : entry.status < 400 ? '#f59e0b' : '#ef4444');

  return (
    <div className="flex flex-col">
      {/* Request entry */}
      <NetworkLogEntry
        type="request"
        icon={<ArrowUpRightIcon size={13} className="flex-shrink-0 text-[var(--color-protocol-websocket)]" />}
        title="Request Sent"
        badge={entry.method.toUpperCase()}
        badgeColor={methodColor}
        timestamp={entry.timestamp}
      >
        <div className="flex flex-col gap-1.5">
          <div className="text-[11px] font-mono text-[var(--color-text-primary)] break-all">{entry.url}</div>
          {Object.keys(entry.requestHeaders).length > 0 && (
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
              <pre className="text-[10px] font-mono text-[var(--color-text-primary)] whitespace-pre-wrap mt-0.5 max-h-[100px] overflow-y-auto">{entry.requestBody}</pre>
            </div>
          )}
        </div>
      </NetworkLogEntry>

      {/* Response entry */}
      <NetworkLogEntry
        type="response"
        icon={<ArrowDownLeftIcon size={13} className="flex-shrink-0 text-[var(--color-protocol-graphql)]" />}
        title="Response Received"
        badge={isGrpc
          ? (entry.status === 0 ? 'OK' : `${entry.statusText || 'CODE_' + entry.status}`)
          : (entry.status === 0 ? (entry.statusText || 'Error') : `${entry.status} ${entry.statusText}`)}
        badgeColor={statusColor}
        timestamp={entry.timestamp + entry.duration}
      >
        <div className="flex flex-col gap-1.5">
          {Object.keys(entry.responseHeaders).length > 0 && (
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
              <pre className="text-[10px] font-mono text-[var(--color-text-primary)] whitespace-pre-wrap mt-0.5 max-h-[100px] overflow-y-auto">{(() => {
                try { return JSON.stringify(JSON.parse(entry.responseBody), null, 2); } catch { return entry.responseBody; }
              })()}</pre>
            </div>
          )}
        </div>
      </NetworkLogEntry>

      {/* Summary entry */}
      <NetworkLogEntry
        type="info"
        icon={<InfoCircleIcon size={13} className={`flex-shrink-0 ${isError ? 'text-[#ef4444]' : 'text-[var(--color-success)]'}`} />}
        title={isError ? 'Failed' : 'Completed'}
        badge={formatDuration(entry.duration)}
        badgeColor={isError ? '#ef4444' : 'var(--color-success)'}
        timestamp={entry.timestamp + entry.duration}
      >
        <div className="flex items-center gap-3 text-[10px] font-mono text-[var(--color-text-muted)]">
          <span className="flex items-center gap-1.5">Duration: <span className="px-1.5 py-[1px] rounded-full bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)] font-semibold">{formatDuration(entry.duration)}</span></span>
          <span className="flex items-center gap-1.5">Size: <span className="px-1.5 py-[1px] rounded-full bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)] font-semibold">{formatSize(entry.size)}</span></span>
        </div>
      </NetworkLogEntry>
    </div>
  );
}

function getTabContent(entry: NetworkEntry, tab: DetailTab): string {
  if (tab === 'request') {
    let content = `${entry.method.toUpperCase()} ${entry.url}\n\n`;
    content += Object.entries(entry.requestHeaders).map(([k, v]) => `${k}: ${v}`).join('\n');
    if (entry.requestBody) content += `\n\n${entry.requestBody}`;
    return content;
  }
  if (tab === 'response') {
    let content = `${entry.status} ${entry.statusText}\n\n`;
    content += Object.entries(entry.responseHeaders).map(([k, v]) => `${k}: ${v}`).join('\n');
    if (entry.responseBody) content += `\n\n${entry.responseBody}`;
    return content;
  }
  // network-logs
  let content = `[Request] ${entry.method.toUpperCase()} ${entry.url}\n`;
  content += Object.entries(entry.requestHeaders).map(([k, v]) => `${k}: ${v}`).join('\n');
  if (entry.requestBody) content += `\n\n${entry.requestBody}`;
  content += `\n\n[Response] ${entry.status} ${entry.statusText}\n`;
  content += Object.entries(entry.responseHeaders).map(([k, v]) => `${k}: ${v}`).join('\n');
  content += `\n\nCompleted in ${formatDuration(entry.duration)} — ${formatSize(entry.size)}`;
  return content;
}

function DetailPanel({ entry }: { entry: NetworkEntry }) {
  const [tab, setTab] = useState<DetailTab>('network-logs');

  const tabs: { key: DetailTab; label: string }[] = [
    { key: 'request', label: 'Request' },
    { key: 'response', label: 'Response' },
    { key: 'network-logs', label: 'Network Logs' },
  ];

  return (
    <div className="flex flex-col h-full border-l border-[var(--color-surface-border)]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-[5px] border-b border-[var(--color-surface-border)] flex-shrink-0">
        <StatusBadge status={entry.status} statusText={entry.statusText} protocol={entry.protocol} />
        {(entry.protocol === 'grpc' ? entry.status !== 0 : entry.status !== 0) && (
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

      {/* Sub-tabs with copy button */}
      <div className="flex items-center gap-0 px-2 border-b border-[var(--color-surface-border)] flex-shrink-0">
        {tabs.map(t => (
          <button
            key={t.key}
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
          <CopyButton text={getTabContent(entry, tab)} size={12} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {tab === 'request' && (
          <div className="flex flex-col gap-2 p-2">
            {/* Compact URL */}
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
            {Object.keys(entry.requestHeaders).length > 0 && (
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
                  {entry.requestBody}
                </pre>
              </div>
            )}
          </div>
        )}
        {tab === 'response' && (
          <div className="flex flex-col gap-2 p-2">
            {/* Status + metrics inline */}
            <div className="flex items-center gap-2 px-2 py-[4px] flex-wrap">
              <span
                className="px-1.5 py-[1px] rounded text-[9px] font-bold font-mono"
                style={{
                  color: entry.status === 0 ? '#ef4444' : entry.status >= 200 && entry.status < 300 ? 'var(--color-success)' : entry.status < 400 ? '#f59e0b' : '#ef4444',
                  backgroundColor: entry.status === 0 ? 'rgba(239,68,68,0.12)' : entry.status >= 200 && entry.status < 300 ? 'color-mix(in srgb, var(--color-success) 12%, transparent)' : entry.status < 400 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
                }}
              >
                {entry.status === 0 ? (entry.statusText || 'Error') : `${entry.status} ${entry.statusText}`}
              </span>
              <span className="px-1.5 py-[1px] rounded text-[9px] font-mono bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)] font-semibold">
                {formatSize(entry.size)}
              </span>
              <span className="px-1.5 py-[1px] rounded text-[9px] font-mono bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)] text-[var(--color-success)] font-semibold">
                {formatDuration(entry.duration)}
              </span>
            </div>

            {/* Headers */}
            {Object.keys(entry.responseHeaders).length > 0 && (
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
                  {(() => {
                    try { return JSON.stringify(JSON.parse(entry.responseBody), null, 2); } catch { return entry.responseBody; }
                  })()}
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

export function NetworkTab() {
  const entries = useDevToolsStore(s => s.networkEntries);
  const selectedId = useDevToolsStore(s => s.selectedNetworkId);
  const selectNetwork = useDevToolsStore(s => s.selectNetwork);

  const selectedEntry = useMemo(
    () => entries.find(e => e.id === selectedId) ?? null,
    [entries, selectedId]
  );

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-muted)] gap-1">
        <NetworkIcon size={22} style={{ opacity: 0.4 }} />
        <span className="text-[11px]">No network activity</span>
        <span className="text-[10px] opacity-60">HTTP requests will appear here</span>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Request list */}
      <div className={`flex flex-col overflow-y-auto [scrollbar-gutter:stable] ${selectedEntry ? 'w-[45%] flex-shrink-0' : 'w-full'}`}>
        {/* Table header */}
        <div className="flex items-center px-3 py-[4px] border-b border-[var(--color-surface-border)] bg-[var(--color-input-bg)] text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider flex-shrink-0">
          <span className="w-[50px] flex-shrink-0">Method</span>
          <span className="w-[40px] flex-shrink-0">Status</span>
          <span className="flex-1 pl-2">URL</span>
          <span className="w-[60px] text-right flex-shrink-0">Time</span>
          <span className="w-[52px] text-right flex-shrink-0">Size</span>
        </div>
        {/* Rows */}
        {entries.map(entry => (
          <RequestListRow
            key={entry.id}
            entry={entry}
            isSelected={entry.id === selectedId}
            onSelect={() => selectNetwork(entry.id === selectedId ? null : entry.id)}
          />
        ))}
      </div>

      {/* Detail panel */}
      {selectedEntry && (
        <div className="flex-1 min-w-0">
          <DetailPanel entry={selectedEntry} />
        </div>
      )}
    </div>
  );
}
