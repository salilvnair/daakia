/**
 * DebugNetworkSection — Ditto copy of Daakia DevTools Network tab for dk.sendRequest() calls.
 *
 * Uses the exact same split-pane layout (list left, detail right), same rows, same sub-tabs
 * (Request/Response/Network Logs), same badges, same headers table as DevTools NetworkTab.tsx.
 */
import { useState } from 'react';
import { useDebugStore, type DebugSubRequest } from '../../../store/debug-store';
import { CopyIcon, CheckIcon, ChevronDownIcon, ArrowUpRightIcon, ArrowDownLeftIcon, InfoCircleIcon } from '../../../icons/daakia-icons';
import { CollapsibleSectionView } from '../../../dui';

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

function methodColor(method: string): string {
  const map: Record<string, string> = {
    GET:     'var(--color-method-get)',
    POST:    'var(--color-method-post)',
    PUT:     'var(--color-method-put)',
    PATCH:   'var(--color-method-patch)',
    DELETE:  'var(--color-method-delete)',
    HEAD:    'var(--color-method-head)',
    OPTIONS: 'var(--color-method-options)',
  };
  return map[method.toUpperCase()] ?? 'var(--color-text-muted)';
}

function statusColor(status: number): string {
  if (status === 0)                       return 'var(--color-error)';
  if (status >= 200 && status < 300)      return 'var(--color-success)';
  if (status >= 300 && status < 400)      return 'var(--color-info)';
  if (status >= 400 && status < 500)      return 'var(--color-warning)';
  if (status >= 500)                      return 'var(--color-error)';
  return 'var(--color-text-muted)';
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function StatusBadge({ status, statusText }: { status: number; statusText?: string }) {
  const color = statusColor(status);
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
  return (
    <span className="font-mono text-[10px] font-bold w-[50px] flex-shrink-0" style={{ color: methodColor(method) }}>
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
        copied ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]'
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
        className="w-full flex items-center gap-2.5 px-3 py-[6px] cursor-pointer hover:bg-[var(--color-surface-hover)] transition-colors"
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

export function NetworkSection() {
  const [expanded, setExpanded] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const subRequests = useDebugStore(s => s.subRequests);
  const active = useDebugStore(s => s.active);

  return (
    <CollapsibleSectionView title="Network" expanded={expanded} onToggle={() => setExpanded(!expanded)} badge={subRequests.length || undefined} accentColor="var(--color-success)">
      {!active && subRequests.length === 0 ? (
        <div className="px-4 py-2 text-[11px] text-[var(--color-text-muted)] italic">No sub-requests</div>
      ) : subRequests.length === 0 ? (
        <div className="px-4 py-2 text-[11px] text-[var(--color-text-muted)] italic">Waiting for dk.sendRequest()…</div>
      ) : (
        <div className="flex flex-col">
          <div className="flex flex-col overflow-y-auto [scrollbar-gutter:stable]">
            <div className="flex items-center px-3 py-[4px] border-b border-[var(--color-surface-border)] bg-[var(--color-input-bg)] text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider flex-shrink-0">
              <span className="w-[50px] flex-shrink-0">Method</span>
              <span className="w-[90px] flex-shrink-0">Status</span>
              <span className="flex-1 pl-2">URL</span>
              <span className="w-[60px] text-right flex-shrink-0">Time</span>
            </div>
            {subRequests.map((sr, idx) => (
              <RequestListRow
                key={idx}
                entry={sr}
                isSelected={selectedIdx === idx}
                onSelect={() => setSelectedIdx(selectedIdx === idx ? null : idx)}
              />
            ))}
          </div>
          {selectedIdx !== null && subRequests[selectedIdx] && (
            <div className="border-t border-[var(--color-surface-border)]">
              <DetailPanel entry={subRequests[selectedIdx]} />
            </div>
          )}
        </div>
      )}
    </CollapsibleSectionView>
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

  const isError = entry.status === 0;

  return (
    <div
      onClick={onSelect}
      className={`cursor-pointer border-b border-[var(--color-surface-border)] text-[11px] transition-colors ${
        isSelected ? 'bg-[var(--color-input-bg)]' : 'hover:bg-[var(--color-surface-hover)]'
      }`}
    >
      <div className="flex items-center px-3 py-[5px]">
        <MethodBadge method={entry.method} />
        <span className="w-[90px] flex-shrink-0"><StatusBadge status={entry.status} statusText={entry.statusText} /></span>
        <span className={`flex-1 truncate pl-2 font-mono ${isError ? 'text-[var(--color-error)]' : 'text-[var(--color-text-primary)]'}`}>
          {urlPath}
        </span>
        <span className="text-[10px] text-[var(--color-text-muted)] font-mono w-[60px] text-right flex-shrink-0">
          {formatDuration(entry.duration)}
        </span>
      </div>
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

type DetailTab = 'request' | 'response' | 'network-logs';

function DetailPanel({ entry }: { entry: DebugSubRequest }) {
  const isError = entry.status === 0 || entry.status >= 400;
  const [tab, setTab] = useState<DetailTab>(isError ? 'response' : 'network-logs');
  const sc = statusColor(entry.status);

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
            <span className="text-[10px] text-[var(--color-text-muted)] font-mono">{entry.statusText}</span>
          )}
          <span className="text-[10px] text-[var(--color-text-primary)] font-semibold ml-1">
            {entry.method.toUpperCase()}
          </span>
          <span className="px-1.5 py-[1px] rounded text-[9px] font-mono bg-[var(--color-input-bg)] text-[var(--color-text-muted)] ml-auto">
            {formatDuration(entry.duration)}
          </span>
        </div>
        {isError && entry.status === 0 && entry.statusText && (
          <div className="px-3 pb-[5px] text-[10px] font-mono text-[var(--color-error)] truncate" title={entry.statusText.split('\n')[0]}>
            {entry.statusText.split('\n')[0].slice(0, 120)}
          </div>
        )}
      </div>

      {/* Sub-tabs */}
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
        <div className="ml-auto"><CopyButton text={getTabContent()} size={12} /></div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {tab === 'request' && (
          <div className="flex flex-col gap-2 p-2">
            <div className="flex items-center gap-2 px-2 py-[4px]">
              <span
                className="px-1.5 py-[1px] rounded text-[9px] font-bold font-mono flex-shrink-0"
                style={{ color: methodColor(entry.method), backgroundColor: `color-mix(in srgb, ${methodColor(entry.method)} 12%, transparent)` }}
              >
                {entry.method.toUpperCase()}
              </span>
              <span className="text-[11px] text-[var(--color-text-primary)] font-mono break-all leading-[16px] select-all">{entry.url}</span>
            </div>
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
            <div className="flex items-center gap-2 px-2 py-[4px] flex-wrap">
              <span
                className="px-1.5 py-[1px] rounded text-[9px] font-bold font-mono"
                style={{ color: sc, backgroundColor: `color-mix(in srgb, ${sc} 12%, transparent)` }}
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
            {isError && entry.status === 0 && entry.statusText && (
              <div className="mx-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] uppercase tracking-wider text-[var(--color-error)] font-medium">Error Details</span>
                </div>
                <pre className="text-[11px] text-[var(--color-error)] font-mono whitespace-pre-wrap bg-[color-mix(in_srgb,var(--color-error)_6%,transparent)] rounded-md p-2 leading-[18px] border border-[color-mix(in_srgb,var(--color-error)_15%,transparent)] select-all">
                  {entry.statusText}
                </pre>
              </div>
            )}
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

// ─── Network Logs View ────────────────────────────────────────────────────────

function NetworkLogsView({ entry }: { entry: DebugSubRequest }) {
  const mc = methodColor(entry.method);
  const isError = entry.status === 0 || entry.status >= 400;
  const sc = statusColor(entry.status);

  return (
    <div className="flex flex-col">
      <NetworkLogEntry
        icon={<ArrowUpRightIcon size={13} className="flex-shrink-0 text-[var(--color-protocol-websocket)]" />}
        title="Request Sent"
        badge={entry.method.toUpperCase()}
        badgeColor={mc}
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

      <NetworkLogEntry
        icon={<ArrowDownLeftIcon size={13} className="flex-shrink-0 text-[var(--color-protocol-graphql)]" />}
        title="Response Received"
        badge={entry.status === 0 ? (entry.statusText ? entry.statusText.split('\n')[0].slice(0, 60) : 'Error') : `${entry.status} ${entry.statusText}`}
        badgeColor={sc}
        timestamp={entry.timestamp + entry.duration}
        defaultExpanded={isError}
      >
        <div className="flex flex-col gap-1.5">
          {isError && entry.status === 0 && entry.statusText && (
            <pre className="text-[10px] text-[var(--color-error)] font-mono whitespace-pre-wrap bg-[color-mix(in_srgb,var(--color-error)_6%,transparent)] rounded p-2 leading-[16px] border border-[color-mix(in_srgb,var(--color-error)_15%,transparent)] select-all max-h-[200px] overflow-y-auto">
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

      <NetworkLogEntry
        icon={<InfoCircleIcon size={13} className={`flex-shrink-0 ${isError ? 'text-[var(--color-error)]' : 'text-[var(--color-success)]'}`} />}
        title={isError ? 'Failed' : 'Completed'}
        badge={formatDuration(entry.duration)}
        badgeColor={isError ? 'var(--color-error)' : 'var(--color-success)'}
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
