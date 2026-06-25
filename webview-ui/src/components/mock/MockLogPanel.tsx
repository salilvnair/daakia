/**
 * MockLogPanel - Activity log with split-pane layout matching DevTools Network tab.
 * Left: list of log entries. Right: detail panel with Request/Response/Network Logs tabs.
 */
import { useState, useRef, useEffect } from 'react';
import { TrashIcon, ArrowUpIcon, ArrowDownIcon, AutoScrollIcon, CopyIcon, CheckIcon, ArrowDownLeftIcon, ArrowUpRightIcon, InfoCircleIcon, ChevronDownIcon, PanelMinimizeIcon, PanelMaximizeIcon } from '../../icons';
import type { MockLogEntry } from './mock-types';
import { METHOD_COLORS } from '../../colors';
import { JsonTreeViewer, tryParseJson } from '../shared/display/JsonTreeViewer';
import { ConfirmDialog } from '../shared/modals/ConfirmDialog';
import { IconButtonView, TabView, PilledTabView, type PilledTab } from '@salilvnair/dui';
import { logUiEvent } from '../../store/ui-audit-store';

type DetailTab = 'request' | 'response' | 'network-logs';

interface MockLogPanelProps {
  logs: MockLogEntry[];
  onClear: () => void;
  minimized?: boolean;
  onToggleMinimize?: () => void;
}

export function MockLogPanel({ logs, onClear, minimized, onToggleMinimize }: MockLogPanelProps) {
  const [autoScroll, setAutoScroll] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const selectedEntry = selectedId ? logs.find(l => l.id === selectedId) ?? null : null;
  const hasDetails = selectedEntry && selectedEntry.direction !== 'system';

  // Minimized state: show only header bar
  if (minimized) {
    return (
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-[var(--color-surface-border)] bg-[var(--color-panel)] flex-shrink-0">
        <span className="text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
          Activity Log ({logs.length})
        </span>
        <IconButtonView
          icon={<PanelMaximizeIcon size={13} />}
          size="default"
          onClick={onToggleMinimize}
          tooltip="Maximize Activity Log (Alt+/)"
          accentColor="var(--color-mock-server)"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-surface-border)] bg-[var(--color-panel)] flex-shrink-0">
        <span className="text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
          Activity Log ({logs.length})
        </span>
        <div className="flex items-center gap-1">
          <IconButtonView
            icon={<ArrowUpIcon size={12} />}
            size="default"
            disabled={logs.length === 0}
            onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            tooltip="Scroll to top"
          />
          <IconButtonView
            icon={<ArrowDownIcon size={12} />}
            size="default"
            disabled={logs.length === 0}
            onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })}
            tooltip="Scroll to bottom"
          />
          <IconButtonView
            icon={<AutoScrollIcon size={12} />}
            size="default"
            disabled={logs.length === 0}
            onClick={() => setAutoScroll(!autoScroll)}
            tooltip="Auto-scroll"
            active={autoScroll}
            accentColor="var(--color-mock-server)"
          />
          <IconButtonView
            icon={<TrashIcon size={12} />}
            size="default"
            disabled={logs.length === 0}
            onClick={() => setShowClearConfirm(true)}
            tooltip="Clear log"
            accentColor="var(--color-error)"
          />
          {onToggleMinimize && (
            <IconButtonView
              icon={<PanelMinimizeIcon size={13} />}
              size="default"
              onClick={onToggleMinimize}
              tooltip="Minimize Activity Log (Alt+/)"
              accentColor="var(--color-mock-server)"
            />
          )}
        </div>
      </div>

      {/* Split pane: list + detail */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Log list */}
        <div ref={scrollRef} className={`overflow-y-auto [scrollbar-gutter:stable] ${hasDetails ? 'w-[45%] flex-shrink-0 border-r border-[var(--color-surface-border)]' : 'w-full'}`}>
          {logs.length === 0 ? (
            <p className="text-[11px] text-[var(--color-text-muted)] text-center py-6 italic">
              No activity yet. Start the server and send requests.
            </p>
          ) : (
            logs.map(entry => (
              <LogEntryRow
                key={entry.id}
                entry={entry}
                isSelected={entry.id === selectedId}
                onSelect={() => setSelectedId(entry.id === selectedId ? null : entry.id)}
              />
            ))
          )}
        </div>

        {/* Right: Detail panel */}
        {hasDetails && selectedEntry && (
          <div className="flex-1 min-w-0">
            <LogDetailPanel entry={selectedEntry} />
          </div>
        )}
      </div>

      {/* Clear confirmation */}
      {showClearConfirm && (
        <ConfirmDialog
          title="Clear Activity Log?"
          message={`This will permanently remove ${logs.length} log ${logs.length === 1 ? 'entry' : 'entries'}. This action cannot be undone.`}
          confirmLabel="Clear All"
          onConfirm={() => { logUiEvent('mock.log_clear'); onClear(); setShowClearConfirm(false); }}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}
    </div>
  );
}

// ────────── Log Entry Row ──────────

function LogEntryRow({ entry, isSelected, onSelect }: { entry: MockLogEntry; isSelected: boolean; onSelect: () => void }) {
  const isSystem = entry.direction === 'system';
  const isIncoming = entry.direction === 'incoming';
  const timeStr = new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const icon = isSystem
    ? <InfoCircleIcon size={13} className="flex-shrink-0 text-[var(--color-mock-server)]" />
    : isIncoming
      ? <ArrowDownLeftIcon size={13} className="flex-shrink-0 text-[var(--color-protocol-graphql)]" />
      : <ArrowUpRightIcon size={13} className="flex-shrink-0 text-[var(--color-protocol-websocket)]" />;

  const methodColor = entry.method ? METHOD_COLORS[entry.method.toUpperCase()] || 'var(--color-text-muted)' : undefined;
  const statusColor = entry.statusCode
    ? entry.statusCode < 300 ? 'var(--color-success)' : entry.statusCode < 400 ? '#f59e0b' : '#ef4444'
    : undefined;

  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-2.5 px-3 py-[6px] border-b border-[var(--color-surface-border)] cursor-pointer transition-colors ${
        isSelected ? 'bg-[var(--color-input-bg)]' : 'hover:bg-[var(--color-hover)]'
      }`}
    >
      {icon}

      {isIncoming && entry.method && (
        <span
          className="px-1.5 py-[1px] rounded text-[9px] font-bold font-mono flex-shrink-0"
          style={{ color: methodColor, backgroundColor: `color-mix(in srgb, ${methodColor} 12%, transparent)` }}
        >
          {entry.method}
        </span>
      )}

      <span className="text-[11px] font-medium text-[var(--color-text-primary)] truncate flex-1 font-mono">
        {isSystem ? (entry.body || entry.event || 'System') : (entry.path || entry.event || '')}
      </span>

      {entry.statusCode && (
        <span
          className="px-1.5 py-[1px] rounded text-[9px] font-bold font-mono flex-shrink-0"
          style={{ color: statusColor, backgroundColor: `color-mix(in srgb, ${statusColor} 12%, transparent)` }}
        >
          {entry.statusCode}
        </span>
      )}

      {entry.duration !== undefined && (
        <span className="px-1.5 py-[1px] rounded text-[9px] font-mono font-semibold bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)] flex-shrink-0">
          {entry.duration}ms
        </span>
      )}

      <span className="px-1.5 py-[1px] rounded text-[9px] font-mono bg-[var(--color-input-bg)] text-[var(--color-text-muted)] flex-shrink-0">
        {timeStr}
      </span>
    </div>
  );
}

// ────────── Detail Panel (Right Side) ──────────

function LogDetailPanel({ entry }: { entry: MockLogEntry }) {
  const [tab, setTab] = useState<DetailTab>('request');

  const statusColor = entry.statusCode
    ? entry.statusCode < 300 ? 'var(--color-success)' : entry.statusCode < 400 ? '#f59e0b' : '#ef4444'
    : 'var(--color-text-muted)';
  const methodColor = entry.method ? METHOD_COLORS[entry.method.toUpperCase()] || 'var(--color-text-muted)' : 'var(--color-text-muted)';

  const tabs: { key: DetailTab; label: string }[] = [
    { key: 'request', label: 'Request' },
    { key: 'response', label: 'Response' },
    { key: 'network-logs', label: 'Network Logs' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header: status + method + path + duration */}
      <div className="flex items-center gap-2 px-3 py-[5px] border-b border-[var(--color-surface-border)] flex-shrink-0">
        {entry.statusCode && (
          <span
            className="px-1.5 py-[1px] rounded text-[9px] font-bold font-mono"
            style={{ color: statusColor, backgroundColor: `color-mix(in srgb, ${statusColor} 12%, transparent)` }}
          >
            {entry.statusCode}
          </span>
        )}
        {entry.method && (
          <span
            className="px-1.5 py-[1px] rounded text-[9px] font-bold font-mono"
            style={{ color: methodColor, backgroundColor: `color-mix(in srgb, ${methodColor} 12%, transparent)` }}
          >
            {entry.method}
          </span>
        )}
        <span className="text-[11px] text-[var(--color-text-primary)] font-mono truncate flex-1">
          {entry.path || entry.event || ''}
        </span>
        {entry.duration !== undefined && (
          <span className="px-1.5 py-[1px] rounded text-[9px] font-mono bg-[var(--color-input-bg)] text-[var(--color-text-muted)] flex-shrink-0">
            {entry.duration}ms
          </span>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center px-2 border-b border-[var(--color-surface-border)] flex-shrink-0">
        <TabView
          tabs={tabs.map(t => ({ id: t.key, label: t.label }))}
          activeTab={tab}
          onChange={(id) => setTab(id as DetailTab)}
          variant="underline"
          size="xs"
          accentColor="var(--color-mock-server)"
        />
        <div className="ml-auto">
          <CopyAllButton entry={entry} tab={tab} />
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {tab === 'request' && <RequestTabContent entry={entry} />}
        {tab === 'response' && <ResponseTabContent entry={entry} />}
        {tab === 'network-logs' && <NetworkLogsTabContent entry={entry} />}
      </div>
    </div>
  );
}

// ────────── Request Tab ──────────

function RequestTabContent({ entry }: { entry: MockLogEntry }) {
  const methodColor = entry.method ? METHOD_COLORS[entry.method.toUpperCase()] || 'var(--color-text-muted)' : 'var(--color-text-muted)';

  return (
    <div className="flex flex-col gap-2 p-2">
      {/* Method + Path */}
      <div className="flex items-center gap-2 px-2 py-[4px]">
        {entry.method && (
          <span
            className="px-1.5 py-[1px] rounded text-[9px] font-bold font-mono flex-shrink-0"
            style={{ color: methodColor, backgroundColor: `color-mix(in srgb, ${methodColor} 12%, transparent)` }}
          >
            {entry.method}
          </span>
        )}
        <span className="text-[11px] text-[var(--color-text-primary)] font-mono break-all leading-[16px] select-all">
          {entry.path || entry.event || ''}
        </span>
      </div>

      {/* Request Headers */}
      {entry.headers && Object.keys(entry.headers).length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-1 px-2">
            <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">Headers</span>
            <span className="text-[9px] px-1.5 py-[1px] rounded-full bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-[var(--color-primary)] font-mono font-semibold">
              {Object.keys(entry.headers).length}
            </span>
          </div>
          <HeadersTable headers={entry.headers} />
        </div>
      )}

      {/* Query Params */}
      {entry.queryParams && Object.keys(entry.queryParams).length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-1 px-2">
            <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">Query Params</span>
            <span className="text-[9px] px-1.5 py-[1px] rounded-full bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-[var(--color-primary)] font-mono font-semibold">
              {Object.keys(entry.queryParams).length}
            </span>
          </div>
          <HeadersTable headers={entry.queryParams} />
        </div>
      )}

      {/* Request Body */}
      {entry.body && (
        <BodyViewer label="Body" text={entry.body} />
      )}
    </div>
  );
}

// ────────── Response Tab ──────────

function ResponseTabContent({ entry }: { entry: MockLogEntry }) {
  const statusColor = entry.statusCode
    ? entry.statusCode < 300 ? 'var(--color-success)' : entry.statusCode < 400 ? '#f59e0b' : '#ef4444'
    : 'var(--color-text-muted)';

  return (
    <div className="flex flex-col gap-2 p-2">
      {/* Status + metrics */}
      <div className="flex items-center gap-2 px-2 py-[4px] flex-wrap">
        {entry.statusCode && (
          <span
            className="px-1.5 py-[1px] rounded text-[9px] font-bold font-mono"
            style={{ color: statusColor, backgroundColor: `color-mix(in srgb, ${statusColor} 12%, transparent)` }}
          >
            {entry.statusCode}
          </span>
        )}
        {entry.duration !== undefined && (
          <span className="px-1.5 py-[1px] rounded text-[9px] font-mono font-semibold bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)] text-[var(--color-success)]">
            {entry.duration}ms
          </span>
        )}
      </div>

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
        <BodyViewer label="Response Body" text={entry.responseBody} />
      )}
    </div>
  );
}

// ────────── Network Logs Tab (Timeline style) ──────────

function NetworkLogsTabContent({ entry }: { entry: MockLogEntry }) {
  const timeStr = new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const methodColor = entry.method ? METHOD_COLORS[entry.method.toUpperCase()] || 'var(--color-text-muted)' : 'var(--color-text-muted)';
  const statusColor = entry.statusCode
    ? entry.statusCode < 300 ? 'var(--color-success)' : entry.statusCode < 400 ? '#f59e0b' : '#ef4444'
    : 'var(--color-text-muted)';

  return (
    <div className="flex flex-col">
      {/* Request Received */}
      <TimelineEntry
        icon={<ArrowDownLeftIcon size={13} className="flex-shrink-0 text-[var(--color-protocol-graphql)]" />}
        title="Request Received"
        badge={entry.method?.toUpperCase()}
        badgeColor={methodColor}
        timestamp={timeStr}
      >
        <div className="flex flex-col gap-1.5">
          <div className="text-[11px] font-mono text-[var(--color-text-primary)] break-all">{entry.path || entry.event}</div>
          {entry.headers && Object.keys(entry.headers).length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">Headers</span>
                <span className="text-[9px] px-1.5 py-[1px] rounded-full bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-[var(--color-primary)] font-mono font-semibold">
                  {Object.keys(entry.headers).length}
                </span>
              </div>
              <HeadersTable headers={entry.headers} />
            </div>
          )}
          {entry.body && (
            <BodyViewer label="Body" text={entry.body} compact />
          )}
        </div>
      </TimelineEntry>

      {/* Response Sent */}
      <TimelineEntry
        icon={<ArrowUpRightIcon size={13} className="flex-shrink-0 text-[var(--color-protocol-websocket)]" />}
        title="Response Sent"
        badge={entry.statusCode ? `${entry.statusCode}` : undefined}
        badgeColor={statusColor}
        timestamp={timeStr}
      >
        <div className="flex flex-col gap-1.5">
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
            <BodyViewer label="Body" text={entry.responseBody} compact />
          )}
        </div>
      </TimelineEntry>

      {/* Completed */}
      <TimelineEntry
        icon={<InfoCircleIcon size={13} className="flex-shrink-0 text-[var(--color-success)]" />}
        title="Completed"
        badge={entry.duration !== undefined ? `${entry.duration}ms` : undefined}
        badgeColor="var(--color-success)"
        timestamp={timeStr}
      >
        <div className="flex items-center gap-3 text-[10px] font-mono text-[var(--color-text-muted)]">
          {entry.duration !== undefined && (
            <span className="flex items-center gap-1.5">Duration: <span className="px-1.5 py-[1px] rounded-full bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)] font-semibold">{entry.duration}ms</span></span>
          )}
        </div>
      </TimelineEntry>
    </div>
  );
}

// ────────── Timeline Entry (reusable) ──────────

function TimelineEntry({ icon, title, badge, badgeColor, timestamp, children }: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  badgeColor?: string;
  timestamp: string;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border-b border-[var(--color-surface-border)] last:border-b-0">
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

// ────────── Shared Sub-components ──────────

function HeadersTable({ headers }: { headers: Record<string, string> }) {
  const entries = Object.entries(headers);
  return (
    <div className="flex flex-col">
      {entries.map(([key, value], idx) => (
        <div key={key} className={`group/hdr flex items-start gap-2 px-2 py-[4px] text-[11px] leading-[16px] ${idx < entries.length - 1 ? 'border-b border-[color-mix(in_srgb,var(--color-surface-border)_50%,transparent)]' : ''}`}>
          <span className="text-[var(--color-accent)] font-mono font-medium flex-shrink-0 min-w-[120px] select-all">{key}</span>
          <span className="text-[var(--color-text-primary)] font-mono break-all flex-1 select-all">{value}</span>
          <CopyButton text={`${key}: ${value}`} />
        </div>
      ))}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    logUiEvent('mock.log_copy');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <IconButtonView
      size="default"
      icon={copied ? <CheckIcon size={10} className="text-[var(--color-success)]" /> : <CopyIcon size={10} />}
      onClick={handleCopy}
      className="opacity-0 group-hover/hdr:opacity-100 flex-shrink-0"
    />
  );
}

function CopyAllButton({ entry, tab }: { entry: MockLogEntry; tab: DetailTab }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    let text = '';
    if (tab === 'request') {
      text = `${entry.method || ''} ${entry.path || ''}\n`;
      if (entry.headers) text += '\n' + Object.entries(entry.headers).map(([k, v]) => `${k}: ${v}`).join('\n');
      if (entry.body) text += '\n\n' + entry.body;
    } else if (tab === 'response') {
      text = `${entry.statusCode || ''}\n`;
      if (entry.responseHeaders) text += '\n' + Object.entries(entry.responseHeaders).map(([k, v]) => `${k}: ${v}`).join('\n');
      if (entry.responseBody) text += '\n\n' + entry.responseBody;
    } else {
      text = `[Request] ${entry.method || ''} ${entry.path || ''}\n`;
      if (entry.headers) text += Object.entries(entry.headers).map(([k, v]) => `${k}: ${v}`).join('\n');
      if (entry.body) text += '\n\n' + entry.body;
      text += `\n\n[Response] ${entry.statusCode || ''}\n`;
      if (entry.responseHeaders) text += Object.entries(entry.responseHeaders).map(([k, v]) => `${k}: ${v}`).join('\n');
      if (entry.responseBody) text += '\n\n' + entry.responseBody;
      if (entry.duration !== undefined) text += `\n\nCompleted in ${entry.duration}ms`;
    }
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <IconButtonView
      size="default"
      icon={copied ? <CheckIcon size={12} className="text-[var(--color-success)]" /> : <CopyIcon size={12} />}
      onClick={handleCopy}
      tooltip={copied ? 'Copied!' : 'Copy'}
    />
  );
}

// ────────── Body Viewer with JSON | Raw toggle ──────────

function BodyViewer({ label, text, compact }: { label: string; text: string; compact?: boolean }) {
  const [activeTab, setActiveTab] = useState<'json' | 'raw'>('json');
  const parsed = tryParseJson(text);
  const isJson = parsed !== null;

  return (
    <div className={compact ? 'mt-1' : ''}>
      <div className="flex items-center gap-2 mb-1 px-2">
        <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium">{label}</span>
        <span className="text-[9px] px-1.5 py-[1px] rounded-full bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] text-[var(--color-primary)] font-mono font-semibold">
          {formatBytes(text.length)}
        </span>
        {isJson && (
          <div className="ml-auto">
            <PilledTabView
              mode="pill"
              tabs={[{ id: 'json', label: 'json' }, { id: 'raw', label: 'raw' }] as PilledTab[]}
              activeId={activeTab}
              onChange={(id) => setActiveTab(id as 'json' | 'raw')}
              accentColor="var(--color-mock-server)"
            />
          </div>
        )}
      </div>
      <div className="mx-2 rounded-md bg-[var(--color-input-bg)] p-2">
        {isJson && activeTab === 'json' ? (
          <JsonTreeViewer data={parsed} />
        ) : (
          <pre className="text-[11px] text-[var(--color-text-primary)] font-mono whitespace-pre-wrap leading-[18px] select-text">
            {formatJson(text)}
          </pre>
        )}
      </div>
    </div>
  );
}

// ────────── Helpers ──────────

function formatJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
