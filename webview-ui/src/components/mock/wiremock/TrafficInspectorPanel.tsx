/**
 * TrafficInspectorPanel — Record/playback + live traffic inspector (6A.16-6A.18).
 */
import { useState } from 'react';
import { TrashIcon, ChevronDownIcon } from '../../../icons';
import type { MockServer, RecordedRequest } from '../mock-types';

const MOCK_ACCENT = 'var(--color-mock-server)';

interface Props {
  server: MockServer;
  onUpdate: (patch: Partial<MockServer>) => void;
  onClearTraffic?: () => void;
  onImportRecorded?: (requests: RecordedRequest[]) => void;
}

export function TrafficInspectorPanel({ server, onUpdate, onClearTraffic, onImportRecorded }: Props) {
  const [tab, setTab] = useState<'recording' | 'traffic'>('recording');
  const recorded = server.recordedTraffic ?? [];

  const toggleRecording = () => {
    onUpdate({ recordingMode: !server.recordingMode });
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Tab bar */}
      <div className="flex items-center gap-0">
        {(['recording', 'traffic'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="h-[28px] px-3 text-[11px] font-medium cursor-pointer transition-colors capitalize"
            style={{
              borderBottom: tab === t ? `2px solid ${MOCK_ACCENT}` : '2px solid transparent',
              color: tab === t ? MOCK_ACCENT : 'var(--color-text-muted)',
            }}
          >
            {t === 'recording' ? 'Record & Proxy' : `Traffic (${recorded.length})`}
          </button>
        ))}
      </div>

      {tab === 'recording' && (
        <RecordingConfig server={server} onUpdate={onUpdate} onToggle={toggleRecording} />
      )}

      {tab === 'traffic' && (
        <TrafficLog
          recorded={recorded}
          onClear={onClearTraffic}
          onImport={onImportRecorded}
        />
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
        <button
          type="button"
          onClick={onToggle}
          className="h-[28px] px-3 text-[11px] rounded cursor-pointer font-medium"
          style={{
            background: server.recordingMode ? 'rgba(239,68,68,0.15)' : `color-mix(in srgb, ${MOCK_ACCENT} 12%, transparent)`,
            border: `1px solid ${server.recordingMode ? 'rgba(239,68,68,0.3)' : `color-mix(in srgb, ${MOCK_ACCENT} 25%, transparent)`}`,
            color: server.recordingMode ? 'var(--color-error)' : MOCK_ACCENT,
          }}
        >
          {server.recordingMode ? 'Stop Recording' : 'Start Recording'}
        </button>
      </div>

      {/* Proxy target */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide">Proxy Target URL</label>
        <input
          type="url"
          value={server.proxyTarget ?? ''}
          onChange={e => onUpdate({ proxyTarget: e.target.value || undefined })}
          placeholder="https://api.yourservice.com"
          className="h-[32px] px-3 text-[11px] font-mono rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
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
          <input type="checkbox" checked={checked.size === recorded.length} onChange={toggleAll} className="cursor-pointer" />
          <span className="text-[11px] text-[var(--color-text-muted)]">{checked.size} selected</span>
        </div>
        <div className="flex items-center gap-1.5">
          {checked.size > 0 && onImport && (
            <button
              type="button"
              onClick={() => onImport(recorded.filter(r => checked.has(r.id)))}
              className="h-[24px] px-2.5 text-[10px] rounded cursor-pointer"
              style={{ color: MOCK_ACCENT, background: `color-mix(in srgb, ${MOCK_ACCENT} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${MOCK_ACCENT} 25%, transparent)` }}
            >
              Convert to Routes
            </button>
          )}
          {onClear && (
            <button type="button" onClick={onClear} className="h-[24px] px-2 text-[10px] rounded cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-error)] flex items-center gap-1">
              <TrashIcon size={11} /> Clear
            </button>
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
              <input type="checkbox" checked={checked.has(r.id)} onChange={() => toggle(r.id)} onClick={e => e.stopPropagation()} className="cursor-pointer flex-shrink-0" />
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
  const [section, setSection] = useState<'request' | 'response'>('request');
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded font-mono" style={{ background: methodColor(record.method).bg, color: methodColor(record.method).text }}>{record.method}</span>
        <span className="text-[11px] font-mono text-[var(--color-text-primary)]">{record.path}</span>
        <span className="ml-auto text-[10px] font-mono" style={{ color: statusColor(record.responseStatus) }}>{record.responseStatus}</span>
      </div>
      <div className="flex gap-2">
        {(['request', 'response'] as const).map(s => (
          <button key={s} type="button" onClick={() => setSection(s)}
            className="text-[10px] cursor-pointer capitalize pb-0.5"
            style={{ borderBottom: section === s ? `1px solid ${MOCK_ACCENT}` : '1px solid transparent', color: section === s ? MOCK_ACCENT : 'var(--color-text-muted)' }}>
            {s}
          </button>
        ))}
      </div>
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
