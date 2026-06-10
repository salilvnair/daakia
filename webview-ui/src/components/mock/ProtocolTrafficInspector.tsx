/**
 * ProtocolTrafficInspector — Sprint 13.33 unified real-time traffic inspector
 * for all non-REST mock servers (WS, GQL, MQTT, SSE, SIO, gRPC, SOAP).
 * Shows: matched handler, extracted variables, response payload, and protocol badges.
 */
import { useState, useRef, useEffect } from 'react';
import {
  ArrowDownLeftIcon, ArrowUpRightIcon, InfoCircleIcon, TrashIcon,
  AutoScrollIcon, ChevronDownIcon, CopyIcon, CheckIcon,
} from '../../icons';
import type { MockLogEntry } from './mock-types';
import { JsonTreeViewer, tryParseJson } from '../shared/display/JsonTreeViewer';

const NON_REST = new Set(['websocket', 'graphql', 'mqtt', 'sse', 'socketio', 'grpc', 'soap']);

const PROTOCOL_BADGE: Record<string, { label: string; color: string }> = {
  websocket: { label: 'WS',    color: 'var(--color-protocol-websocket)' },
  graphql:   { label: 'GQL',   color: 'var(--color-protocol-graphql)' },
  mqtt:      { label: 'MQTT',  color: 'var(--color-warning)' },
  sse:       { label: 'SSE',   color: 'var(--color-protocol-sse, var(--color-success))' },
  socketio:  { label: 'SIO',   color: 'var(--color-protocol-socketio, var(--color-primary))' },
  grpc:      { label: 'gRPC',  color: 'var(--color-protocol-grpc, var(--color-accent))' },
  soap:      { label: 'SOAP',  color: 'var(--color-text-muted)' },
};

type FilterProto = 'all' | string;
type FilterDir   = 'all' | 'incoming' | 'outgoing';

interface Props {
  logs: MockLogEntry[];
  onClear: () => void;
}

export function ProtocolTrafficInspector({ logs, onClear }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filterProto, setFilterProto] = useState<FilterProto>('all');
  const [filterDir, setFilterDir] = useState<FilterDir>('all');
  const [search, setSearch] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const protocolLogs = logs.filter(l => NON_REST.has(l.protocol));

  const filtered = protocolLogs.filter(l => {
    if (filterProto !== 'all' && l.protocol !== filterProto) return false;
    if (filterDir !== 'all' && l.direction !== filterDir) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !l.event?.toLowerCase().includes(q) &&
        !l.path?.toLowerCase().includes(q) &&
        !l.body?.toLowerCase().includes(q) &&
        !l.matchedHandlerName?.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered, autoScroll]);

  const selectedEntry = selectedId ? filtered.find(l => l.id === selectedId) ?? null : null;

  const presentProtocols = [...new Set(protocolLogs.map(l => l.protocol))];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--color-surface-border)] flex-shrink-0">
        <span className="text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide flex-shrink-0">
          Traffic
        </span>
        <span className="text-[10px] px-1.5 py-[1px] rounded-full bg-[var(--color-input-bg)] text-[var(--color-text-muted)] font-mono">
          {filtered.length}
        </span>

        {/* Protocol filter chips */}
        <div className="flex items-center gap-1 flex-wrap">
          <FilterChip label="All" active={filterProto === 'all'} onClick={() => setFilterProto('all')} />
          {presentProtocols.map(p => (
            <FilterChip
              key={p}
              label={PROTOCOL_BADGE[p]?.label ?? p.toUpperCase()}
              active={filterProto === p}
              onClick={() => setFilterProto(filterProto === p ? 'all' : p)}
              color={PROTOCOL_BADGE[p]?.color}
            />
          ))}
        </div>

        {/* Direction filter */}
        <div className="flex items-center rounded overflow-hidden border border-[var(--color-surface-border)] ml-1">
          {(['all', 'incoming', 'outgoing'] as FilterDir[]).map(d => (
            <button
              key={d}
              type="button"
              onClick={() => setFilterDir(d)}
              className={`h-[22px] px-2 text-[10px] cursor-pointer transition-colors capitalize ${
                filterDir === d
                  ? 'bg-[var(--color-mock-server)] text-[var(--color-bg)] font-medium'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter…"
          className="h-[22px] px-2 rounded text-[11px] bg-[var(--color-input-bg)] border border-[var(--color-surface-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none flex-1 min-w-0"
        />

        <button
          type="button"
          onClick={() => setAutoScroll(!autoScroll)}
          title="Auto-scroll"
          className={`w-5 h-5 flex items-center justify-center rounded cursor-pointer transition-colors ${autoScroll ? 'text-[var(--color-mock-server)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'}`}
        >
          <AutoScrollIcon size={12} />
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={protocolLogs.length === 0}
          title="Clear"
          className="w-5 h-5 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-error)] cursor-pointer transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          <TrashIcon size={12} />
        </button>
      </div>

      {/* Split pane */}
      <div className="flex flex-1 min-h-0">
        {/* Left: list */}
        <div
          ref={scrollRef}
          className={`overflow-y-auto [scrollbar-gutter:stable] ${selectedEntry ? 'w-[42%] flex-shrink-0 border-r border-[var(--color-surface-border)]' : 'w-full'}`}
        >
          {filtered.length === 0 ? (
            <p className="text-[11px] text-[var(--color-text-muted)] text-center py-6 italic">
              {protocolLogs.length === 0
                ? 'No non-REST protocol traffic yet.'
                : 'No entries match the current filter.'}
            </p>
          ) : (
            filtered.map(entry => (
              <TrafficRow
                key={entry.id}
                entry={entry}
                isSelected={entry.id === selectedId}
                onSelect={() => setSelectedId(entry.id === selectedId ? null : entry.id)}
              />
            ))
          )}
        </div>

        {/* Right: detail */}
        {selectedEntry && (
          <div className="flex-1 min-w-0 overflow-y-auto [scrollbar-gutter:stable]">
            <TrafficDetail entry={selectedEntry} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Row ────────────────────────────────────────────────────────────────────

function TrafficRow({ entry, isSelected, onSelect }: { entry: MockLogEntry; isSelected: boolean; onSelect: () => void }) {
  const badge = PROTOCOL_BADGE[entry.protocol];
  const isIncoming = entry.direction === 'incoming';
  const isSystem = entry.direction === 'system';
  const timeStr = new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-2 px-3 py-[5px] border-b border-[var(--color-surface-border)] cursor-pointer transition-colors ${
        isSelected ? 'bg-[var(--color-input-bg)]' : 'hover:bg-[var(--color-hover)]'
      }`}
    >
      {isSystem
        ? <InfoCircleIcon size={12} className="flex-shrink-0 text-[var(--color-mock-server)]" />
        : isIncoming
          ? <ArrowDownLeftIcon size={12} className="flex-shrink-0 text-[var(--color-protocol-graphql)]" />
          : <ArrowUpRightIcon size={12} className="flex-shrink-0 text-[var(--color-protocol-websocket)]" />
      }

      {badge && (
        <span
          className="px-1.5 py-[1px] rounded text-[9px] font-bold font-mono flex-shrink-0"
          style={{ color: badge.color, backgroundColor: `color-mix(in srgb, ${badge.color} 12%, transparent)` }}
        >
          {badge.label}
        </span>
      )}

      <span className="text-[11px] font-mono text-[var(--color-text-primary)] truncate flex-1">
        {entry.path || entry.event || ''}
      </span>

      {entry.matchedHandlerName && (
        <span className="text-[10px] px-1.5 py-[1px] rounded bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)] text-[var(--color-success)] font-mono flex-shrink-0 truncate max-w-[80px]" title={entry.matchedHandlerName}>
          {entry.matchedHandlerName}
        </span>
      )}

      <span className="text-[9px] font-mono bg-[var(--color-input-bg)] text-[var(--color-text-muted)] px-1.5 py-[1px] rounded flex-shrink-0">
        {timeStr}
      </span>
    </div>
  );
}

// ─── Detail ──────────────────────────────────────────────────────────────────

function TrafficDetail({ entry }: { entry: MockLogEntry }) {
  const badge = PROTOCOL_BADGE[entry.protocol];
  const timeStr = new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="flex flex-col gap-2 p-2.5 text-[11px]">
      {/* Header badges */}
      <div className="flex items-center gap-2 flex-wrap">
        {badge && (
          <span
            className="px-2 py-[2px] rounded text-[10px] font-bold font-mono"
            style={{ color: badge.color, backgroundColor: `color-mix(in srgb, ${badge.color} 15%, transparent)` }}
          >
            {badge.label}
          </span>
        )}
        <span
          className="px-2 py-[2px] rounded text-[10px] font-semibold capitalize"
          style={{
            color: entry.direction === 'incoming' ? 'var(--color-protocol-graphql)' : entry.direction === 'outgoing' ? 'var(--color-protocol-websocket)' : 'var(--color-mock-server)',
            backgroundColor: `color-mix(in srgb, currentColor 10%, transparent)`,
          }}
        >
          {entry.direction}
        </span>
        {entry.clientId && (
          <span className="px-2 py-[2px] rounded text-[10px] font-mono bg-[var(--color-input-bg)] text-[var(--color-text-muted)]">
            {entry.clientId}
          </span>
        )}
        <span className="ml-auto text-[10px] text-[var(--color-text-muted)] font-mono">{timeStr}</span>
      </div>

      {/* Matched handler info */}
      {entry.matchedHandlerName && (
        <InfoSection label="Matched Handler">
          <span className="font-mono text-[var(--color-success)]">{entry.matchedHandlerName}</span>
          {entry.matchedHandlerId && (
            <span className="ml-2 text-[10px] text-[var(--color-text-muted)] font-mono">({entry.matchedHandlerId})</span>
          )}
        </InfoSection>
      )}

      {/* Event name */}
      {entry.event && (
        <InfoSection label="Event">
          <span className="font-mono text-[var(--color-text-primary)]">{entry.event}</span>
        </InfoSection>
      )}

      {/* Topic / path */}
      {entry.path && (
        <InfoSection label="Topic / Path">
          <span className="font-mono text-[var(--color-accent)] break-all">{entry.path}</span>
        </InfoSection>
      )}

      {/* Extracted vars */}
      {entry.extractedVars && Object.keys(entry.extractedVars).length > 0 && (
        <InfoSection label="Extracted Variables">
          <div className="flex flex-col gap-1">
            {Object.entries(entry.extractedVars).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <span className="text-[var(--color-accent)] font-mono font-medium min-w-[80px]">{k}</span>
                <span className="text-[var(--color-text-primary)] font-mono">{v}</span>
              </div>
            ))}
          </div>
        </InfoSection>
      )}

      {/* Payload */}
      {entry.body && (
        <InfoSection label="Payload">
          <PayloadViewer text={entry.body} />
        </InfoSection>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function FilterChip({ label, active, onClick, color }: { label: string; active: boolean; onClick: () => void; color?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-[20px] px-2 rounded-full text-[10px] font-medium cursor-pointer transition-colors border"
      style={{
        borderColor: active ? (color ?? 'var(--color-mock-server)') : 'var(--color-surface-border)',
        color: active ? (color ?? 'var(--color-mock-server)') : 'var(--color-text-muted)',
        backgroundColor: active ? `color-mix(in srgb, ${color ?? 'var(--color-mock-server)'} 12%, transparent)` : 'transparent',
      }}
    >
      {label}
    </button>
  );
}

function InfoSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-[var(--color-surface-border)] overflow-hidden">
      <div className="px-2.5 py-1 text-[9px] uppercase tracking-wider font-medium text-[var(--color-text-muted)] bg-[var(--color-input-bg)] border-b border-[var(--color-surface-border)]">
        {label}
      </div>
      <div className="px-2.5 py-2 text-[11px]">
        {children}
      </div>
    </div>
  );
}

function PayloadViewer({ text }: { text: string }) {
  const [mode, setMode] = useState<'json' | 'raw'>('json');
  const [copied, setCopied] = useState(false);
  const parsed = tryParseJson(text);
  const isJson = parsed !== null;

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div>
      <div className="flex items-center gap-1 mb-1.5">
        {isJson && (
          <div className="flex items-center rounded overflow-hidden border border-[var(--color-surface-border)]">
            {(['json', 'raw'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`h-[18px] px-1.5 text-[9px] cursor-pointer transition-colors ${
                  mode === m
                    ? 'bg-[rgba(234,179,8,0.15)] text-[var(--color-mock-server)] font-medium'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={handleCopy}
          className={`ml-auto w-5 h-5 flex items-center justify-center rounded cursor-pointer transition-colors ${copied ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'}`}
        >
          {copied ? <CheckIcon size={10} /> : <CopyIcon size={10} />}
        </button>
      </div>
      <div className="rounded bg-[var(--color-input-bg)] p-2 max-h-[200px] overflow-y-auto">
        {isJson && mode === 'json'
          ? <JsonTreeViewer data={parsed} />
          : (
            <pre className="text-[11px] text-[var(--color-text-primary)] font-mono whitespace-pre-wrap leading-[18px] select-text">
              {tryFormatJson(text)}
            </pre>
          )
        }
      </div>
    </div>
  );
}

function tryFormatJson(s: string): string {
  try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
}
