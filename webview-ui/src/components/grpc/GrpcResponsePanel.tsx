import { useState } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import type { GrpcStreamMessage } from '../../store/tabs-store';
import { PillTabs, CodeEditor, RequestProgressOverlay } from '../shared';
import { ScriptResultsView } from '../shared/display/ScriptResultsView';
import { cancelRequest } from '../../services/request';
import type { PillTab } from '../shared';
import { ArrowUpIcon, ArrowDownIcon } from '../../icons';

const ACCENT = 'var(--color-protocol-grpc)';

const responseTabs: PillTab[] = [
  { id: 'body', label: 'Body' },
  { id: 'metadata', label: 'Metadata' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'tests', label: 'Tests' },
];

/**
 * GrpcResponsePanel — Shows unary response (JSON body, metadata, status)
 * and streaming timeline for server/client/bidi streaming.
 */
export function GrpcResponsePanel() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const [activeSubTab, setActiveSubTab] = useState('body');

  if (!activeTab) return null;

  const response = activeTab.response;
  const streamMessages = activeTab.grpcStreamMessages || [];
  const streamStatus = activeTab.grpcStreamStatus || 'idle';

  // If no response yet, show placeholder or progress
  if (!response && streamMessages.length === 0) {
    if (activeTab.loading) {
      const stages = activeTab.requestProgress || [
        { id: 'sending-request', label: 'Sending request', status: 'running' as const, startTime: Date.now() },
      ];
      return (
        <RequestProgressOverlay
          stages={stages}
          onCancel={() => {
            cancelRequest(activeTab.id);
            useTabsStore.getState().updateTab(activeTab.id, { loading: false, requestProgress: undefined, grpcStreamStatus: 'idle' });
          }}
        />
      );
    }
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--color-text-muted)]">
        <p className="text-[12px]">Send a request to see the response</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Status bar */}
      {response && (
        <div className="flex items-center gap-3 px-3 py-1.5 border-b border-[var(--color-surface-border)] text-[11px]">
          <GrpcStatusBadge code={response.status} />
          <span className="text-[var(--color-text-muted)]">{response.time}ms</span>
          <span className="text-[var(--color-text-muted)]">{formatSize(response.size)}</span>
          {streamStatus !== 'idle' && (
            <span
              className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
              style={{ color: ACCENT, backgroundColor: 'rgba(0,184,181,0.12)' }}
            >
              {streamStatus}
            </span>
          )}
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex items-center justify-between px-3 pt-2 border-b border-[var(--color-surface-border)]">
        <PillTabs
          tabs={responseTabs}
          activeTab={activeSubTab}
          onChange={setActiveSubTab}
          size="sm"
          variant="underline"
          accentColor="var(--color-protocol-grpc)"
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable]">
        {activeSubTab === 'body' && response && (
          <div className="h-full">
            <CodeEditor
              value={response.body || ''}
              onChange={() => {}}
              language="json"
              readOnly
              className="h-full"
            />
          </div>
        )}

        {activeSubTab === 'metadata' && response && (
          <div className="p-3">
            <div className="space-y-2">
              {Object.entries(response.headers || {}).map(([key, val]) => (
                <div key={key} className="flex gap-2 text-[12px]">
                  <span className="text-[var(--color-text-muted)] font-mono">{key}:</span>
                  <span className="text-[var(--color-text-primary)] font-mono break-all">{val}</span>
                </div>
              ))}
              {Object.keys(response.headers || {}).length === 0 && (
                <p className="text-[11px] text-[var(--color-text-muted)]">No metadata received</p>
              )}
            </div>
          </div>
        )}

        {activeSubTab === 'timeline' && (
          <GrpcTimeline messages={streamMessages} status={streamStatus} response={response} />
        )}

        {activeSubTab === 'tests' && response && (
          <ScriptResultsView response={response} />
        )}
      </div>
    </div>
  );
}

// ─── Timeline (unified for unary + streaming) ───

function GrpcTimeline({ messages, status, response }: { messages: GrpcStreamMessage[]; status: string; response?: { status: number; statusText: string; time: number; size: number; body?: string } | null }) {
  // For unary calls (no stream messages), show request/response timeline
  if (messages.length === 0 && response) {
    const isOk = response.status === 0;
    return (
      <div className="flex flex-col">
        {/* Request sent */}
        <div className="flex items-start gap-2 px-3 py-2 border-b border-[rgba(255,255,255,0.04)]">
          <span className="mt-0.5 shrink-0">
            <ArrowUpIcon size={12} className="text-[var(--color-warning)]" />
          </span>
          <span className="shrink-0 text-[10px] text-[var(--color-text-muted)] font-mono mt-0.5 w-[70px]">0ms</span>
          <span className="text-[11px] font-medium text-[var(--color-text-primary)]">Request sent</span>
        </div>
        {/* Response received */}
        <div className="flex items-start gap-2 px-3 py-2 border-b border-[rgba(255,255,255,0.04)]">
          <span className="mt-0.5 shrink-0">
            <ArrowDownIcon size={12} style={{ color: isOk ? ACCENT : 'var(--color-error)' }} />
          </span>
          <span className="shrink-0 text-[10px] text-[var(--color-text-muted)] font-mono mt-0.5 w-[70px]">{response.time}ms</span>
          <span className="flex-1 min-w-0">
            <span className="text-[11px] font-medium text-[var(--color-text-primary)]">Response received</span>
            <span className="ml-2 text-[10px] font-mono" style={{ color: isOk ? 'var(--color-success)' : 'var(--color-error)' }}>
              {isOk ? 'OK' : response.statusText}
            </span>
          </span>
        </div>
        {/* Summary */}
        <div className="px-3 py-2 text-[10px] text-[var(--color-text-muted)]">
          Total time: {response.time}ms • Size: {formatSize(response.size)}
        </div>
      </div>
    );
  }

  // For streaming — show stream message timeline
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-[11px] text-[var(--color-text-muted)]">
          {status === 'streaming' ? 'Waiting for messages...' : 'No stream messages yet'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className="flex items-start gap-2 px-3 py-2 border-b border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.02)]"
        >
          <span className="mt-0.5 shrink-0">
            {msg.direction === 'sent' ? (
              <ArrowUpIcon size={12} className="text-[var(--color-warning)]" />
            ) : (
              <ArrowDownIcon size={12} style={{ color: ACCENT }} />
            )}
          </span>
          <span className="shrink-0 text-[10px] text-[var(--color-text-muted)] font-mono mt-0.5 w-[70px]">
            {new Date(msg.timestamp).toLocaleTimeString()}
          </span>
          <pre className="flex-1 text-[11px] font-mono text-[var(--color-text-primary)] whitespace-pre-wrap break-all min-w-0">
            {msg.data}
          </pre>
        </div>
      ))}
    </div>
  );
}

// ─── Helpers ───

function GrpcStatusBadge({ code }: { code: number }) {
  const statusName = GRPC_STATUS_CODES[code] || `CODE_${code}`;
  const isOk = code === 0;

  return (
    <span
      className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase"
      style={{
        color: isOk ? 'var(--color-success)' : 'var(--color-error)',
        backgroundColor: isOk ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
      }}
    >
      {statusName}
    </span>
  );
}

const GRPC_STATUS_CODES: Record<number, string> = {
  0: 'OK',
  1: 'CANCELLED',
  2: 'UNKNOWN',
  3: 'INVALID_ARGUMENT',
  4: 'DEADLINE_EXCEEDED',
  5: 'NOT_FOUND',
  6: 'ALREADY_EXISTS',
  7: 'PERMISSION_DENIED',
  8: 'RESOURCE_EXHAUSTED',
  9: 'FAILED_PRECONDITION',
  10: 'ABORTED',
  11: 'OUT_OF_RANGE',
  12: 'UNIMPLEMENTED',
  13: 'INTERNAL',
  14: 'UNAVAILABLE',
  15: 'DATA_LOSS',
  16: 'UNAUTHENTICATED',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
