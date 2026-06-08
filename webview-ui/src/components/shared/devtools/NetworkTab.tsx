/**
 * NetworkTab — Shows request/response details for each HTTP request (like Bruno's Network tab).
 * Left: request list table (METHOD, URL, STATUS, DURATION, SIZE)
 * Right: detail panel with Request / Response / Network Logs sub-tabs
 *
 * Request tab: method, full URL (with breakdown), request headers, request cookies, body
 * Response tab: status, response headers, response cookies, body (or blob download for binary)
 * Network Logs tab: expandable request + response timeline
 */
import { useState, useMemo } from 'react';
import { useDevToolsStore, type NetworkEntry, type CookieEntry } from '../../../store/devtools-store';
import { NetworkIcon, CopyIcon, CheckIcon, ChevronDownIcon, ArrowUpRightIcon, ArrowDownLeftIcon, InfoCircleIcon, DownloadIcon } from '../../../icons';
import { RequestBodyDisplay } from '../display/RequestBodyDisplay';

type DetailTab = 'request' | 'response' | 'network-logs';

// ─── Formatters ────────────────────────────────────────────────────────────────

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

// ─── Status & Method badges ────────────────────────────────────────────────────

function StatusBadge({ status, statusText, protocol }: { status: number; statusText?: string; protocol?: string }) {
  let color = 'var(--color-text-muted)';
  if (protocol === 'grpc') {
    color = status === 0 ? 'var(--color-success)' : '#ef4444';
  } else {
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
  OPTIONS: '#06b6d4', GRPC: '#00b8b5', SOAP: '#a78bfa',
  MCP: '#6366f1', GRAPHQL: '#e040fb',
};

function MethodBadge({ method }: { method: string }) {
  const color = methodColorMap[method.toUpperCase()] ?? 'var(--color-text-muted)';
  return (
    <span className="font-mono text-[10px] font-bold w-[50px] flex-shrink-0" style={{ color }}>
      {method.toUpperCase()}
    </span>
  );
}

// ─── Request list row ──────────────────────────────────────────────────────────

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
      <span className="w-[80px] flex-shrink-0 truncate">
        <StatusBadge status={entry.status} statusText={entry.statusText} protocol={entry.protocol} />
      </span>
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

// ─── Copy button ───────────────────────────────────────────────────────────────

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

// ─── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 px-2 mb-1">
      <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">{label}</span>
      {count !== undefined && (
        <span className="text-[9px] px-1.5 py-[1px] rounded-full bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-[var(--color-primary)] font-mono font-semibold">
          {count}
        </span>
      )}
    </div>
  );
}

// ─── Headers table ─────────────────────────────────────────────────────────────

function HeadersTable({ headers }: { headers: Record<string, string> }) {
  const entries = Object.entries(headers);
  if (entries.length === 0) {
    return <span className="text-[11px] text-[var(--color-text-muted)] italic px-2">No headers</span>;
  }
  return (
    <div className="flex flex-col">
      {entries.map(([key, value], idx) => (
        <div
          key={key}
          className={`group/hdr flex items-start gap-2 px-2 py-[4px] text-[11px] leading-[16px] ${
            idx < entries.length - 1 ? 'border-b border-[color-mix(in_srgb,var(--color-surface-border)_50%,transparent)]' : ''
          }`}
        >
          <span className="text-[var(--color-accent)] font-mono font-medium flex-shrink-0 min-w-[120px] select-all">{key}</span>
          <span className="text-[var(--color-text-primary)] font-mono break-all flex-1 select-all">{value}</span>
          <div className="opacity-0 group-hover/hdr:opacity-100 transition-opacity flex-shrink-0">
            <CopyButton text={`${key}: ${value}`} size={11} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Cookies table ─────────────────────────────────────────────────────────────

function CookiesTable({ cookies }: { cookies: CookieEntry[] }) {
  if (cookies.length === 0) {
    return <span className="text-[11px] text-[var(--color-text-muted)] italic px-2">No cookies</span>;
  }
  return (
    <div className="flex flex-col">
      {cookies.map((c, idx) => (
        <div
          key={`${c.name}-${idx}`}
          className={`group/ck flex items-start gap-2 px-2 py-[4px] text-[11px] leading-[16px] ${
            idx < cookies.length - 1 ? 'border-b border-[color-mix(in_srgb,var(--color-surface-border)_50%,transparent)]' : ''
          }`}
        >
          <span className="text-[var(--color-accent)] font-mono font-medium flex-shrink-0 min-w-[120px] select-all">{c.name}</span>
          <span className="text-[var(--color-text-primary)] font-mono break-all flex-1 select-all">{c.value}</span>
          <div className="flex items-center gap-1 flex-shrink-0">
            {c.httpOnly && (
              <span className="text-[8px] px-1 py-[1px] rounded bg-[rgba(99,102,241,0.12)] text-[var(--color-accent)] font-mono">HttpOnly</span>
            )}
            {c.secure && (
              <span className="text-[8px] px-1 py-[1px] rounded bg-[rgba(34,197,94,0.12)] text-[var(--color-success)] font-mono">Secure</span>
            )}
            {c.sameSite && (
              <span className="text-[8px] px-1 py-[1px] rounded bg-[rgba(245,158,11,0.12)] text-[#f59e0b] font-mono">{c.sameSite}</span>
            )}
            <div className="opacity-0 group-hover/ck:opacity-100 transition-opacity">
              <CopyButton text={`${c.name}=${c.value}`} size={11} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── URL breakdown ─────────────────────────────────────────────────────────────

function UrlBreakdown({ url }: { url: string }) {
  let parsed: URL | null = null;
  try { parsed = new URL(url); } catch { /* raw URL */ }

  if (!parsed) {
    return (
      <div className="font-mono text-[11px] text-[var(--color-text-primary)] break-all px-2 select-all">{url}</div>
    );
  }

  const queryParams = Array.from(parsed.searchParams.entries());

  return (
    <div className="flex flex-col gap-[3px]">
      {/* Full URL */}
      <div className="flex items-start gap-2 px-2 py-[4px] text-[11px]">
        <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium flex-shrink-0 w-[80px] pt-[2px]">Full URL</span>
        <span className="text-[var(--color-text-primary)] font-mono break-all select-all">{url}</span>
        <CopyButton text={url} size={11} />
      </div>
      {/* Origin */}
      <div className="flex items-center gap-2 px-2 py-[2px] text-[11px]">
        <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium flex-shrink-0 w-[80px]">Origin</span>
        <span className="text-[var(--color-text-primary)] font-mono select-all">{parsed.origin}</span>
      </div>
      {/* Path */}
      {parsed.pathname !== '/' && (
        <div className="flex items-center gap-2 px-2 py-[2px] text-[11px]">
          <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium flex-shrink-0 w-[80px]">Path</span>
          <span className="text-[var(--color-text-primary)] font-mono select-all">{parsed.pathname}</span>
        </div>
      )}
      {/* Query params */}
      {queryParams.length > 0 && (
        <div className="flex flex-col gap-0">
          <div className="flex items-center gap-2 px-2 py-[2px]">
            <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium flex-shrink-0 w-[80px]">Params</span>
            <span className="text-[9px] px-1.5 py-[1px] rounded-full bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-[var(--color-primary)] font-mono font-semibold">{queryParams.length}</span>
          </div>
          {queryParams.map(([k, v], i) => (
            <div key={i} className="flex items-center gap-2 pl-[88px] pr-2 py-[2px] text-[11px]">
              <span className="text-[var(--color-accent)] font-mono flex-shrink-0 select-all">{k}</span>
              <span className="text-[var(--color-text-muted)] font-mono">= </span>
              <span className="text-[var(--color-text-primary)] font-mono break-all select-all">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Blob response display ─────────────────────────────────────────────────────

function BlobResponseDisplay({ entry }: { entry: NetworkEntry }) {
  const mimeType = entry.blobMimeType || entry.contentType || 'application/octet-stream';
  const isImage = mimeType.startsWith('image/');
  const isPdf = mimeType === 'application/pdf';

  const handleDownload = () => {
    if (!entry.responseBody) return;
    try {
      // Try to interpret as base64
      const byteStr = atob(entry.responseBody);
      const byteArr = new Uint8Array(byteStr.length);
      for (let i = 0; i < byteStr.length; i++) byteArr[i] = byteStr.charCodeAt(i);
      const blob = new Blob([byteArr], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `response.${mimeType.split('/')[1] || 'bin'}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: download as text
      const blob = new Blob([entry.responseBody], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'response.bin';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // Try to show inline image if base64
  let dataUrl: string | null = null;
  if (isImage && entry.responseBody) {
    try {
      atob(entry.responseBody); // validate base64
      dataUrl = `data:${mimeType};base64,${entry.responseBody}`;
    } catch { /* not base64 */ }
  }

  return (
    <div className="mx-2 rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-input-bg)] p-3 flex flex-col items-center gap-3">
      {dataUrl ? (
        <img src={dataUrl} alt="Response" className="max-w-full max-h-[200px] object-contain rounded" />
      ) : (
        <div className="flex flex-col items-center gap-1.5">
          <DownloadIcon size={28} className="text-[var(--color-text-muted)] opacity-60" />
          <span className="text-[11px] text-[var(--color-text-muted)] font-mono">{mimeType}</span>
          {isPdf && <span className="text-[10px] text-[var(--color-text-muted)]">PDF Document</span>}
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[var(--color-text-muted)]">{formatSize(entry.size)}</span>
        {entry.responseBody && (
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1.5 h-[26px] px-2.5 text-[10px] rounded-md cursor-pointer transition-colors border border-[rgba(99,102,241,0.3)] text-[var(--color-accent)] hover:bg-[rgba(99,102,241,0.1)]"
          >
            <DownloadIcon size={11} />
            Download
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Network log view ──────────────────────────────────────────────────────────

function NetworkLogEntry({ icon, title, badge, badgeColor, timestamp, children }: {
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
          {entry.requestCookies && entry.requestCookies.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">Cookies</span>
                <span className="text-[9px] px-1.5 py-[1px] rounded-full bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-[var(--color-primary)] font-mono font-semibold">
                  {entry.requestCookies.length}
                </span>
              </div>
              <CookiesTable cookies={entry.requestCookies} />
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
              <RequestBodyDisplay body={entry.requestBody} maxHeight="100px" />
            </div>
          )}
        </div>
      </NetworkLogEntry>

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
          {entry.responseCookies && entry.responseCookies.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">Cookies</span>
              </div>
              <CookiesTable cookies={entry.responseCookies} />
            </div>
          )}
          {entry.isBlob ? (
            <BlobResponseDisplay entry={entry} />
          ) : entry.responseBody ? (
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
          ) : null}
        </div>
      </NetworkLogEntry>

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

// ─── Copy-all helper ───────────────────────────────────────────────────────────

function getTabContent(entry: NetworkEntry, tab: DetailTab): string {
  if (tab === 'request') {
    let content = `${entry.method.toUpperCase()} ${entry.url}\n`;
    content += `Timestamp: ${new Date(entry.timestamp).toISOString()}\n`;
    if (entry.protocol) content += `Protocol: ${entry.protocol}\n`;
    content += `\n[Headers]\n`;
    content += Object.entries(entry.requestHeaders).map(([k, v]) => `${k}: ${v}`).join('\n');
    if (entry.requestCookies && entry.requestCookies.length > 0) {
      content += `\n\n[Cookies]\n`;
      content += entry.requestCookies.map(c => `${c.name}=${c.value}`).join('\n');
    }
    if (entry.requestBody) content += `\n\n[Body]\n${entry.requestBody}`;
    return content;
  }
  if (tab === 'response') {
    let content = `${entry.status} ${entry.statusText}\n`;
    content += `Duration: ${formatDuration(entry.duration)}\nSize: ${formatSize(entry.size)}\n`;
    content += `\n[Headers]\n`;
    content += Object.entries(entry.responseHeaders).map(([k, v]) => `${k}: ${v}`).join('\n');
    if (entry.responseCookies && entry.responseCookies.length > 0) {
      content += `\n\n[Cookies]\n`;
      content += entry.responseCookies.map(c => `${c.name}=${c.value}`).join('\n');
    }
    if (entry.responseBody && !entry.isBlob) content += `\n\n[Body]\n${entry.responseBody}`;
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

// ─── Metadata row ──────────────────────────────────────────────────────────────

function MetaRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-2 py-[3px] text-[11px]">
      <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium w-[80px] flex-shrink-0">{label}</span>
      <span className={`text-[var(--color-text-primary)] ${mono ? 'font-mono' : ''} select-all`}>{value}</span>
    </div>
  );
}

// ─── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({ entry }: { entry: NetworkEntry }) {
  const [tab, setTab] = useState<DetailTab>('network-logs');

  const tabs: { key: DetailTab; label: string }[] = [
    { key: 'request', label: 'Request' },
    { key: 'response', label: 'Response' },
    { key: 'network-logs', label: 'Network Logs' },
  ];

  // Count badges for sub-tabs
  const reqHeaderCount = Object.keys(entry.requestHeaders).length;
  const reqCookieCount = entry.requestCookies?.length ?? 0;
  const resHeaderCount = Object.keys(entry.responseHeaders).length;
  const resCookieCount = entry.responseCookies?.length ?? 0;

  return (
    <div className="flex flex-col h-full border-l border-[var(--color-surface-border)]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-[5px] border-b border-[var(--color-surface-border)] flex-shrink-0">
        <StatusBadge status={entry.status} statusText={entry.statusText} protocol={entry.protocol} />
        <span className="text-[10px] text-[var(--color-text-primary)] font-semibold ml-1">
          {entry.method.toUpperCase()}
        </span>
        {entry.protocol && (
          <span className="text-[9px] px-1.5 py-[1px] rounded font-mono bg-[var(--color-input-bg)] text-[var(--color-text-muted)]">
            {entry.protocol}
          </span>
        )}
        <span className="px-1.5 py-[1px] rounded text-[9px] font-mono bg-[var(--color-input-bg)] text-[var(--color-text-muted)] ml-auto">
          {formatDuration(entry.duration)}
        </span>
        <span className="px-1.5 py-[1px] rounded text-[9px] font-mono bg-[var(--color-input-bg)] text-[var(--color-text-muted)]">
          {formatSize(entry.size)}
        </span>
      </div>

      {/* Sub-tabs */}
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

        {/* ── REQUEST TAB ── */}
        {tab === 'request' && (
          <div className="flex flex-col gap-2 p-2">
            {/* Metadata block */}
            <div className="rounded-md bg-[var(--color-input-bg)] border border-[var(--color-surface-border)] py-1">
              <div className="flex items-center gap-2 px-2 pt-1 pb-1">
                <span
                  className="px-1.5 py-[1px] rounded text-[9px] font-bold font-mono flex-shrink-0"
                  style={{
                    color: methodColorMap[entry.method.toUpperCase()] ?? 'var(--color-text-muted)',
                    backgroundColor: `color-mix(in srgb, ${methodColorMap[entry.method.toUpperCase()] ?? 'var(--color-text-muted)'} 12%, transparent)`,
                  }}
                >
                  {entry.method.toUpperCase()}
                </span>
                {entry.protocol && (
                  <span className="text-[9px] px-1.5 py-[1px] rounded font-mono bg-[rgba(99,102,241,0.12)] text-[var(--color-accent)]">
                    {entry.protocol.toUpperCase()}
                  </span>
                )}
                <span className="text-[10px] text-[var(--color-text-muted)] font-mono ml-auto">
                  {new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
              <UrlBreakdown url={entry.url} />
            </div>

            {/* Request Headers */}
            {reqHeaderCount > 0 && (
              <div>
                <SectionLabel label="Headers" count={reqHeaderCount} />
                <HeadersTable headers={entry.requestHeaders} />
              </div>
            )}

            {/* Request Cookies */}
            {reqCookieCount > 0 && (
              <div>
                <SectionLabel label="Cookies" count={reqCookieCount} />
                <CookiesTable cookies={entry.requestCookies!} />
              </div>
            )}

            {/* Request Body */}
            {entry.requestBody && (
              <div>
                <SectionLabel
                  label="Body"
                  count={new TextEncoder().encode(entry.requestBody).length}
                />
                <div className="mx-2">
                  <RequestBodyDisplay body={entry.requestBody} maxHeight="200px" />
                </div>
              </div>
            )}

            {!entry.requestBody && reqHeaderCount === 0 && reqCookieCount === 0 && (
              <span className="text-[11px] text-[var(--color-text-muted)] italic px-2 py-1">No request body or headers</span>
            )}
          </div>
        )}

        {/* ── RESPONSE TAB ── */}
        {tab === 'response' && (
          <div className="flex flex-col gap-2 p-2">
            {/* Status + metrics */}
            <div className="rounded-md bg-[var(--color-input-bg)] border border-[var(--color-surface-border)] px-2 py-1.5 flex items-center gap-2 flex-wrap">
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
              <span className="text-[9px] text-[var(--color-text-muted)] font-mono ml-auto">
                {entry.contentType}
              </span>
            </div>

            {/* Response Headers */}
            {resHeaderCount > 0 && (
              <div>
                <SectionLabel label="Headers" count={resHeaderCount} />
                <HeadersTable headers={entry.responseHeaders} />
              </div>
            )}

            {/* Response Cookies */}
            {resCookieCount > 0 && (
              <div>
                <SectionLabel label="Cookies" count={resCookieCount} />
                <CookiesTable cookies={entry.responseCookies!} />
              </div>
            )}

            {/* Response Body */}
            {entry.isBlob ? (
              <div>
                <SectionLabel label="Body" />
                <BlobResponseDisplay entry={entry} />
              </div>
            ) : entry.responseBody ? (
              <div>
                <SectionLabel
                  label="Body"
                  count={new TextEncoder().encode(entry.responseBody).length}
                />
                <pre className="text-[11px] text-[var(--color-text-primary)] font-mono whitespace-pre-wrap bg-[var(--color-input-bg)] rounded-md p-2 max-h-[300px] overflow-y-auto [scrollbar-gutter:stable] leading-[18px] mx-2">
                  {(() => {
                    try { return JSON.stringify(JSON.parse(entry.responseBody), null, 2); } catch { return entry.responseBody; }
                  })()}
                </pre>
              </div>
            ) : (
              <span className="text-[11px] text-[var(--color-text-muted)] italic px-2 py-1">No response body</span>
            )}
          </div>
        )}

        {/* ── NETWORK LOGS TAB ── */}
        {tab === 'network-logs' && <NetworkLogsView entry={entry} />}
      </div>
    </div>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────────

export function NetworkTab() {
  const entries = useDevToolsStore(s => s.networkEntries);
  const selectedId = useDevToolsStore(s => s.selectedNetworkId);
  const selectNetwork = useDevToolsStore(s => s.selectNetwork);
  const clearNetwork = useDevToolsStore(s => s.clearNetwork);

  const selectedEntry = useMemo(
    () => entries.find(e => e.id === selectedId) ?? null,
    [entries, selectedId]
  );

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-muted)] gap-1">
        <NetworkIcon size={22} style={{ opacity: 0.4 }} />
        <span className="text-[11px]">No network activity</span>
        <span className="text-[10px] opacity-60">HTTP, gRPC, SOAP, GraphQL requests will appear here</span>
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
          <button
            type="button"
            onClick={clearNetwork}
            className="ml-2 text-[8px] px-1.5 py-[2px] rounded cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.08)] transition-colors border border-transparent hover:border-[rgba(239,68,68,0.3)]"
            title="Clear network log"
          >
            Clear
          </button>
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
