import { useState } from 'react';
import type { RequestTab, ResponseData } from '../../../store/tabs-store';
import { formatBytes } from '../../../services/response';
import { METHOD_COLORS } from '../../../colors';
import { CopyIcon, CheckIcon, ChevronDownIcon, InfoCircleIcon, ArrowUpRightIcon, ArrowDownLeftIcon } from '../../../icons';
import { SubRequestRow } from './SubRequestRow';

type TimelineSubTab = 'request' | 'response' | 'network-logs';

function TimelineCopyButton({ text, size = 12 }: { text: string; size?: number }) {
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

function getTimelineTabContent(tab: RequestTab, response: ResponseData, subTab: TimelineSubTab, requestHeaders: Record<string, string>, requestBody?: string): string {
  if (subTab === 'request') {
    let content = `${tab.method.toUpperCase()} ${tab.url}\n\n`;
    content += Object.entries(requestHeaders).map(([k, v]) => `${k}: ${v}`).join('\n');
    if (requestBody) content += `\n\n${requestBody}`;
    return content;
  }
  if (subTab === 'response') {
    let content = `${response.status} ${response.statusText}\n\n`;
    content += Object.entries(response.headers).map(([k, v]) => `${k}: ${v}`).join('\n');
    return content;
  }
  let content = `[Request] ${tab.method.toUpperCase()} ${tab.url}\n`;
  content += Object.entries(requestHeaders).map(([k, v]) => `${k}: ${v}`).join('\n');
  if (requestBody) content += `\n\n${requestBody}`;
  content += `\n\n[Response] ${response.status} ${response.statusText}\n`;
  content += Object.entries(response.headers).map(([k, v]) => `${k}: ${v}`).join('\n');
  content += `\n\nCompleted in ${response.time}ms — ${formatBytes(response.size)}`;
  return content;
}

function TimelineHeadersTable({ headers }: { headers: Record<string, string> }) {
  const entries = Object.entries(headers);
  if (entries.length === 0) {
    return <span className="text-[11px] text-[var(--color-text-muted)] italic px-2">No headers</span>;
  }
  return (
    <div className="flex flex-col">
      {entries.map(([key, value], idx) => (
        <div key={key} className={`group/hdr flex items-start gap-2 px-2 py-[4px] text-[11px] leading-[16px] ${idx < entries.length - 1 ? 'border-b border-[color-mix(in_srgb,var(--color-surface-border)_50%,transparent)]' : ''}`}>
          <span className="text-[var(--color-accent)] font-mono font-medium flex-shrink-0 min-w-[120px] select-all">{key}</span>
          <span className="text-[var(--color-text-primary)] font-mono break-all flex-1 select-all">{value}</span>
          <div className="opacity-0 group-hover/hdr:opacity-100 transition-opacity flex-shrink-0">
            <TimelineCopyButton text={`${key}: ${value}`} size={11} />
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineLogEntry({ icon, title, badge, badgeColor, timestamp, children }: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  badgeColor?: string;
  timestamp: string;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
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
          <span className="px-1.5 py-[1px] rounded text-[9px] font-mono bg-[var(--color-input-bg)] text-[var(--color-text-muted)]">{timestamp}</span>
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

function TimelineNetworkLogs({ method, url, requestHeaders, requestBody, status, statusText, responseHeaders, duration, size }: {
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  status: number;
  statusText: string;
  responseHeaders: Record<string, string>;
  duration: number;
  size: number;
}) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const methodColor = METHOD_COLORS[method.toUpperCase()] || 'var(--color-text-muted)';
  const isError = status === 0 || status >= 400;
  const statusColor = status === 0 ? '#ef4444' : status < 300 ? 'var(--color-success)' : status < 400 ? '#f59e0b' : '#ef4444';

  return (
    <div className="flex flex-col">
      {/* Request entry */}
      <TimelineLogEntry
        icon={<ArrowUpRightIcon size={13} className="flex-shrink-0 text-[var(--color-protocol-websocket)]" />}
        title="Request Sent"
        badge={method.toUpperCase()}
        badgeColor={methodColor}
        timestamp={timeStr}
      >
        <div className="flex flex-col gap-1.5">
          <div className="text-[11px] font-mono text-[var(--color-text-primary)] break-all">{url}</div>
          {Object.keys(requestHeaders).length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">Headers</span>
                <span className="text-[9px] px-1.5 py-[1px] rounded-full bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-[var(--color-primary)] font-mono font-semibold">
                  {Object.keys(requestHeaders).length}
                </span>
              </div>
              <TimelineHeadersTable headers={requestHeaders} />
            </div>
          )}
          {requestBody && (
            <div className="mt-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">Body</span>
                <span className="text-[9px] px-1.5 py-[1px] rounded-full bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-[var(--color-primary)] font-mono font-semibold">
                  {formatBytes(new TextEncoder().encode(requestBody).length)}
                </span>
              </div>
              <pre className="text-[10px] font-mono text-[var(--color-text-primary)] whitespace-pre-wrap mt-0.5 max-h-[100px] overflow-y-auto">{requestBody}</pre>
            </div>
          )}
        </div>
      </TimelineLogEntry>

      {/* Response entry */}
      <TimelineLogEntry
        icon={<ArrowDownLeftIcon size={13} className="flex-shrink-0 text-[var(--color-protocol-graphql)]" />}
        title="Response Received"
        badge={status === 0 ? (statusText || 'Error') : `${status} ${statusText}`}
        badgeColor={statusColor}
        timestamp={timeStr}
      >
        <div className="flex flex-col gap-1.5">
          {Object.keys(responseHeaders).length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">Headers</span>
                <span className="text-[9px] px-1.5 py-[1px] rounded-full bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-[var(--color-primary)] font-mono font-semibold">
                  {Object.keys(responseHeaders).length}
                </span>
              </div>
              <TimelineHeadersTable headers={responseHeaders} />
            </div>
          )}
        </div>
      </TimelineLogEntry>

      {/* Summary entry */}
      <TimelineLogEntry
        icon={<InfoCircleIcon size={13} className={`flex-shrink-0 ${isError ? 'text-[#ef4444]' : 'text-[var(--color-success)]'}`} />}
        title={isError ? 'Failed' : 'Completed'}
        badge={`${duration}ms`}
        badgeColor={isError ? '#ef4444' : 'var(--color-success)'}
        timestamp={timeStr}
      >
        <div className="flex items-center gap-3 text-[10px] font-mono text-[var(--color-text-muted)]">
          <span className="flex items-center gap-1.5">Duration: <span className="px-1.5 py-[1px] rounded-full bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)] font-semibold">{duration}ms</span></span>
          <span className="flex items-center gap-1.5">Size: <span className="px-1.5 py-[1px] rounded-full bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)] font-semibold">{formatBytes(size)}</span></span>
        </div>
      </TimelineLogEntry>
    </div>
  );
}

export function TimelineView({ tab, response }: { tab: RequestTab; response: ResponseData }) {
  const [subTab, setSubTab] = useState<TimelineSubTab>('network-logs');

  const requestHeaders = response.requestHeaders || (() => {
    const h: Record<string, string> = {};
    tab.headers.filter(r => r.enabled && r.key).forEach(r => { h[r.key] = r.value; });
    return h;
  })();
  const requestBody = response.requestBody || tab.bodyRaw || undefined;

  const subTabs: { key: TimelineSubTab; label: string }[] = [
    { key: 'request', label: 'Request' },
    { key: 'response', label: 'Response' },
    { key: 'network-logs', label: 'Network Logs' },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header: status + method + URL + duration */}
      <div className="flex items-center gap-2 px-3 py-[6px] border-b border-[var(--color-surface-border)] flex-shrink-0">
        <span
          className="px-1.5 py-[1px] rounded text-[10px] font-bold font-mono"
          style={{
            color: response.status === 0 ? '#ef4444' : response.status < 300 ? 'var(--color-success)' : response.status < 400 ? '#f59e0b' : '#ef4444',
            backgroundColor: response.status === 0 ? 'rgba(239,68,68,0.12)' : response.status < 300 ? 'color-mix(in srgb, var(--color-success) 12%, transparent)' : response.status < 400 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
          }}
        >
          {response.status === 0 ? (response.statusText || 'Error') : `${response.status} ${response.statusText}`}
        </span>
        <span
          className="px-1.5 py-[1px] rounded text-[10px] font-bold font-mono flex-shrink-0"
          style={{ color: METHOD_COLORS[tab.method.toUpperCase()] || 'var(--color-text-primary)', backgroundColor: `color-mix(in srgb, ${METHOD_COLORS[tab.method.toUpperCase()] || 'var(--color-text-primary)'} 12%, transparent)` }}
        >
          {tab.method.toUpperCase()}
        </span>
        <span className="text-[11px] text-[var(--color-text-muted)] truncate flex-1 font-mono">{tab.url}</span>
        <span className="px-1.5 py-[1px] rounded text-[9px] font-mono bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)] text-[var(--color-success)] font-semibold flex-shrink-0">{response.time}ms</span>
      </div>

      {/* Sub-tabs with copy button */}
      <div className="flex items-center gap-0 px-2 border-b border-[var(--color-surface-border)] flex-shrink-0">
        {subTabs.map(t => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`px-3 py-[5px] text-[11px] cursor-pointer border-b-2 transition-colors ${
              subTab === t.key
                ? 'text-[var(--color-text-primary)] border-[var(--color-accent)]'
                : 'text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text-primary)]'
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto">
          <TimelineCopyButton text={getTimelineTabContent(tab, response, subTab, requestHeaders, requestBody)} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {subTab === 'request' && (
          <div className="flex flex-col gap-2 p-3">
            {/* Compact URL: method badge + URL inline */}
            <div className="flex items-center gap-2 px-1 py-[3px]">
              <span
                className="px-1.5 py-[1px] rounded text-[9px] font-bold font-mono flex-shrink-0"
                style={{ color: METHOD_COLORS[tab.method.toUpperCase()] || 'var(--color-text-primary)', backgroundColor: `color-mix(in srgb, ${METHOD_COLORS[tab.method.toUpperCase()] || 'var(--color-text-primary)'} 12%, transparent)` }}
              >
                {tab.method.toUpperCase()}
              </span>
              <span className="text-[11px] text-[var(--color-text-primary)] font-mono break-all leading-[16px] select-all">{tab.url}</span>
            </div>

            {/* Headers */}
            {Object.keys(requestHeaders).length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-1 px-1">
                  <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">Headers</span>
                  <span className="text-[9px] px-1.5 py-[1px] rounded-full bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-[var(--color-primary)] font-mono font-semibold">
                    {Object.keys(requestHeaders).length}
                  </span>
                </div>
                <TimelineHeadersTable headers={requestHeaders} />
              </div>
            )}

            {/* Body */}
            {requestBody && (
              <div>
                <div className="flex items-center gap-2 mb-1 px-1">
                  <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">Body</span>
                  <span className="text-[9px] px-1.5 py-[1px] rounded-full bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-[var(--color-primary)] font-mono font-semibold">
                    {formatBytes(new TextEncoder().encode(requestBody).length)}
                  </span>
                </div>
                <pre className="text-[11px] text-[var(--color-text-primary)] font-mono whitespace-pre-wrap bg-[var(--color-input-bg)] rounded-md p-2.5 max-h-[200px] overflow-y-auto [scrollbar-gutter:stable] leading-[18px] mx-1">
                  {requestBody}
                </pre>
              </div>
            )}
          </div>
        )}

        {subTab === 'response' && (
          <div className="flex flex-col gap-2 p-3">
            {/* Status + metrics inline */}
            <div className="flex items-center gap-2 px-1 py-[3px] flex-wrap">
              <span
                className="px-1.5 py-[1px] rounded text-[10px] font-bold font-mono"
                style={{
                  color: response.status === 0 ? '#ef4444' : response.status < 300 ? 'var(--color-success)' : response.status < 400 ? '#f59e0b' : '#ef4444',
                  backgroundColor: response.status === 0 ? 'rgba(239,68,68,0.12)' : response.status < 300 ? 'color-mix(in srgb, var(--color-success) 12%, transparent)' : response.status < 400 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
                }}
              >
                {response.status === 0 ? (response.statusText || 'Error') : `${response.status} ${response.statusText}`}
              </span>
              <span className="px-1.5 py-[1px] rounded text-[9px] font-mono bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)] font-semibold">
                {formatBytes(response.size)}
              </span>
              <span className="px-1.5 py-[1px] rounded text-[9px] font-mono bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)] text-[var(--color-success)] font-semibold">
                {response.time}ms
              </span>
            </div>

            {/* Headers */}
            {Object.keys(response.headers).length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-1 px-1">
                  <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">Response Headers</span>
                  <span className="text-[9px] px-1.5 py-[1px] rounded-full bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-[var(--color-primary)] font-mono font-semibold">
                    {Object.keys(response.headers).length}
                  </span>
                </div>
                <TimelineHeadersTable headers={response.headers} />
              </div>
            )}
          </div>
        )}

        {subTab === 'network-logs' && (
          <div className="flex flex-col">
            <TimelineNetworkLogs
              method={tab.method}
              url={tab.url}
              requestHeaders={requestHeaders}
              requestBody={requestBody}
              status={response.status}
              statusText={response.statusText}
              responseHeaders={response.headers}
              duration={response.time}
              size={response.size}
            />
            {/* Script sub-requests (dk.sendRequest calls) */}
            {response.scriptSubRequests && response.scriptSubRequests.length > 0 && (
              <div className="border-t border-[var(--color-surface-border)] px-3 py-2">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">Script Requests</span>
                  <span className="text-[9px] px-1.5 py-[1px] rounded-full bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-[var(--color-primary)] font-mono font-semibold">
                    {response.scriptSubRequests.length}
                  </span>
                </div>
                <div className="flex flex-col gap-[2px]">
                  {response.scriptSubRequests.map((sr, i) => (
                    <SubRequestRow key={i} sr={sr} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
