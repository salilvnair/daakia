/**
 * TrafficInspectorPanel — Record/playback + live traffic inspector (6A.16-6A.18 + Sprint 13.33).
 */
import { useState } from 'react';
import { TabView, ButtonView, IconButtonView, CheckboxView, TextInputView, type TabItem } from '@salilvnair/dui';
import { TrashIcon } from '../../../icons';
import type { MockServer, RecordedRequest, MockLogEntry } from '../mock-types';
import { ProtocolTrafficInspector } from '../ProtocolTrafficInspector';

const MOCK_ACCENT = 'var(--color-mock-server)';
const NON_REST = new Set(['websocket', 'graphql', 'mqtt', 'sse', 'socketio', 'grpc', 'soap']);

interface Props {
  server: MockServer;
  onUpdate: (patch: Partial<MockServer>) => void;
  onClearTraffic?: () => void;
  onImportRecorded?: (requests: RecordedRequest[]) => void;
  /** Sprint 13.33: live activity logs for Protocol Traffic Inspector */
  logs?: MockLogEntry[];
}

export function TrafficInspectorPanel({ server, onUpdate, onClearTraffic, onImportRecorded, logs = [] }: Props) {
  const isNonRest = NON_REST.has(server.protocol ?? '');
  type TrafficTab = 'recording' | 'traffic' | 'protocol';
  const [tab, setTab] = useState<TrafficTab>(isNonRest ? 'protocol' : 'recording');
  const recorded = server.recordedTraffic ?? [];
  const protocolLogs = logs.filter(l => NON_REST.has(l.protocol));

  const toggleRecording = () => {
    onUpdate({ recordingMode: !server.recordingMode });
  };

  const tabItems: TabItem[] = [
    { id: 'recording', label: 'Record & Proxy' },
    { id: 'traffic', label: `Recorded (${recorded.length})` },
    ...(isNonRest ? [{ id: 'protocol', label: `Protocol Traffic (${protocolLogs.length})` }] : []),
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Tab bar */}
      <div className="flex-shrink-0 px-2 pt-1 border-b border-[var(--color-surface-border)]">
        <TabView
          tabs={tabItems}
          activeTab={tab}
          onChange={(id) => setTab(id as TrafficTab)}
          variant="underline"
          size="xs"
          accentColor={MOCK_ACCENT}
        />
      </div>

      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] min-h-0 p-3">
        {tab === 'recording' && (
          <RecordingConfig server={server} onUpdate={onUpdate} onToggle={toggleRecording} />
        )}
        {tab === 'traffic' && (
          <TrafficLog recorded={recorded} onClear={onClearTraffic} onImport={onImportRecorded} />
        )}
      </div>

      {tab === 'protocol' && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <ProtocolTrafficInspector
            logs={logs}
            onClear={() => {
              if (onClearTraffic) onClearTraffic();
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Recording config ─────────────────────────────────────────────────────────

function RecordingConfig({ server, onUpdate, onToggle }: {
  server: MockServer;
  onUpdate: (patch: Partial<MockServer>) => void;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* Recording toggle */}
      <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: server.recordingMode ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${server.recordingMode ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.08)'}` }}>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            {server.recordingMode && <span className="w-[6px] h-[6px] rounded-full bg-[var(--color-error)] animate-pulse" />}
            <span className="text-[12px] font-medium text-[var(--color-text-primary)]">
              {server.recordingMode ? 'Recording…' : 'Record Mode Off'}
            </span>
          </div>
          <span className="text-[10px] text-[var(--color-text-muted)]">
            Proxies requests to the real API and captures interactions as mock routes
          </span>
        </div>
        <ButtonView
          size="md"
          accentColor={server.recordingMode ? 'var(--color-error)' : MOCK_ACCENT}
          onClick={onToggle}
        >
          {server.recordingMode ? 'Stop Recording' : 'Start Recording'}
        </ButtonView>
      </div>

      {/* Proxy target */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide">Proxy Target URL</label>
        <TextInputView
          type="url"
          value={server.proxyTarget ?? ''}
          onChange={e => onUpdate({ proxyTarget: e.target.value || undefined })}
          placeholder="https://api.yourservice.com"
          size="md"
          style={{ width: '100%', fontFamily: 'monospace' }}
        />
        <p className="text-[10px] text-[var(--color-text-muted)] opacity-60">
          Incoming requests are forwarded here. Responses are captured and saved as mock routes.
        </p>
      </div>

      {/* How it works */}
      <div className="rounded-lg border border-[rgba(255,255,255,0.06)] p-3 flex flex-col gap-1.5">
        <p className="text-[10px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide">How recording works</p>
        <div className="flex flex-col gap-1">
          {[
            'Your client sends requests to the mock server (e.g. http://localhost:4000)',
            'Mock server forwards each request to the proxy target URL',
            'Real response is returned to client AND saved as a captured interaction',
            'Convert captures to mock routes in the Traffic tab with one click',
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-[9px] font-medium mt-0.5 flex-shrink-0" style={{ color: MOCK_ACCENT }}>{i + 1}.</span>
              <span className="text-[10px] text-[var(--color-text-muted)]">{step}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Traffic log ──────────────────────────────────────────────────────────────

function TrafficLog({ recorded, onClear, onImport }: {
  recorded: RecordedRequest[];
  onClear?: () => void;
  onImport?: (reqs: RecordedRequest[]) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (checked.size === recorded.length) setChecked(new Set());
    else setChecked(new Set(recorded.map(r => r.id)));
  };

  const selectedRecord = recorded.find(r => r.id === selected);

  if (recorded.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <p className="text-[12px] text-[var(--color-text-muted)] opacity-60">No traffic captured yet</p>
        <p className="text-[10px] text-[var(--color-text-muted)] opacity-40">Start recording mode above to capture interactions</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckboxView
            checked={checked.size === recorded.length}
            onChange={toggleAll}
            size="sm"
          />
          <span className="text-[11px] text-[var(--color-text-muted)]">{checked.size} selected</span>
        </div>
        <div className="flex items-center gap-1.5">
          {checked.size > 0 && onImport && (
            <ButtonView
              size="md"
              accentColor={MOCK_ACCENT}
              onClick={() => onImport(recorded.filter(r => checked.has(r.id)))}
            >
              Convert to Routes
            </ButtonView>
          )}
          {onClear && (
            <IconButtonView
              size="sm"
              icon={<TrashIcon size={11} />}
              accentColor="var(--color-error)"
              onClick={onClear}
              title="Clear traffic"
            />
          )}
        </div>
      </div>

      {/* Traffic list + detail split */}
      <div className="flex gap-2 flex-1 min-h-0">
        {/* List */}
        <div className="flex flex-col gap-1 flex-shrink-0 w-[200px] overflow-y-auto">
          {recorded.map(r => (
            <div
              key={r.id}
              onClick={() => setSelected(r.id)}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors"
              style={{ background: selected === r.id ? `color-mix(in srgb, ${MOCK_ACCENT} 10%, transparent)` : 'transparent' }}
            >
              <div onClick={e => e.stopPropagation()}>
                <CheckboxView checked={checked.has(r.id)} onChange={() => toggle(r.id)} size="sm" />
              </div>
              <span className="text-[9px] font-medium font-mono px-1 py-0.5 rounded flex-shrink-0" style={{ background: methodColor(r.method).bg, color: methodColor(r.method).text }}>{r.method}</span>
              <span className="text-[10px] text-[var(--color-text-muted)] truncate">{r.path}</span>
            </div>
          ))}
        </div>

        {/* Detail */}
        <div className="flex-1 rounded-lg border border-[rgba(255,255,255,0.07)] p-2.5 overflow-auto min-h-0">
          {!selectedRecord ? (
            <p className="text-[10px] text-[var(--color-text-muted)] opacity-50">Select a request to inspect</p>
          ) : (
            <RequestDetail record={selectedRecord} />
          )}
        </div>
      </div>
    </div>
  );
}

function RequestDetail({ record }: { record: RecordedRequest }) {
  type Section = 'request' | 'response';
  const [section, setSection] = useState<Section>('request');

  const sectionTabs: TabItem[] = [
    { id: 'request', label: 'Request' },
    { id: 'response', label: 'Response' },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded font-mono" style={{ background: methodColor(record.method).bg, color: methodColor(record.method).text }}>{record.method}</span>
        <span className="text-[11px] font-mono text-[var(--color-text-primary)]">{record.path}</span>
        <span className="ml-auto text-[10px] font-mono" style={{ color: statusColor(record.responseStatus) }}>{record.responseStatus}</span>
      </div>
      <TabView
        tabs={sectionTabs}
        activeTab={section}
        onChange={(id) => setSection(id as Section)}
        variant="underline"
        size="xs"
        accentColor={MOCK_ACCENT}
      />
      {section === 'request' && (
        <pre className="text-[10px] font-mono text-[var(--color-text-muted)] whitespace-pre-wrap break-all">
          {`Headers:\n${JSON.stringify(record.requestHeaders, null, 2)}\n\nBody:\n${record.requestBody || '(empty)'}`}
        </pre>
      )}
      {section === 'response' && (
        <pre className="text-[10px] font-mono text-[var(--color-text-muted)] whitespace-pre-wrap break-all">
          {`Headers:\n${JSON.stringify(record.responseHeaders, null, 2)}\n\nBody:\n${record.responseBody || '(empty)'}`}
        </pre>
      )}
    </div>
  );
}

function methodColor(method: string) {
  const map: Record<string, { bg: string; text: string }> = {
    GET: { bg: 'rgba(34,197,94,0.12)', text: 'var(--color-success)' },
    POST: { bg: 'rgba(14,165,233,0.12)', text: 'var(--color-info)' },
    PUT: { bg: 'rgba(234,179,8,0.12)', text: 'var(--color-warning)' },
    PATCH: { bg: 'rgba(168,85,247,0.12)', text: '#a855f7' },
    DELETE: { bg: 'rgba(239,68,68,0.12)', text: 'var(--color-error)' },
  };
  return map[method] ?? { bg: 'rgba(255,255,255,0.08)', text: 'var(--color-text-muted)' };
}

function statusColor(status: number) {
  if (status < 300) return 'var(--color-success)';
  if (status < 400) return 'var(--color-warning)';
  return 'var(--color-error)';
}
