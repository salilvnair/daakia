/**
 * WebSocketConfig — WebSocket handler config for mock server.
 */
import { useState, useCallback } from 'react';
import { TrashIcon, CopyIcon, CheckIcon, DiagonalLinesPattern } from '../../../icons';
import { CodeEditor, StyledDropdown, Checkbox, ResizablePanel, ConfirmDialog, type DropdownOption } from '../../shared';
import { WEBSOCKET_SAMPLES } from '../samples';
import type { MockServer } from '../mock-types';
import { MockAiGenerateButton, type ParsedGenericItem } from '../MockAiGeneratePopover';

const WS_SAMPLE_OPTIONS: DropdownOption[] = [
  { value: '', label: 'Load Sample...' },
  ...WEBSOCKET_SAMPLES.map(s => ({ value: s.id, label: s.label })),
];

interface WebSocketConfigProps {
  server: MockServer;
  onUpdate: (patch: Partial<MockServer>) => void;
}

export function WebSocketConfig({ server, onUpdate }: WebSocketConfigProps) {
  const handlers = server.wsHandlers || [];
  const [selectedSample, setSelectedSample] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);

  const wsUrl = server.running && server.port ? `ws://localhost:${server.port}` : '';

  const copyWsUrl = (id: string) => {
    if (!wsUrl) return;
    navigator.clipboard.writeText(wsUrl);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const applySample = (sampleId: string) => {
    if (!sampleId) return;
    const sample = WEBSOCKET_SAMPLES.find(s => s.id === sampleId);
    if (!sample) return;
    setSelectedSample(sampleId);
    onUpdate({
      description: sample.description,
      wsHandlers: sample.handlers.map(h => ({
        id: crypto.randomUUID(),
        event: h.event,
        matchPattern: h.matchPattern,
        response: h.response,
        broadcast: h.broadcast,
        delay: 0,
        enabled: true,
      })),
    });
  };

  const addHandler = (event: 'connection' | 'message' | 'disconnect') => {
    onUpdate({
      wsHandlers: [...handlers, {
        id: crypto.randomUUID(),
        event,
        matchPattern: event === 'message' ? '*' : '',
        response: event === 'connection' ? '{"type": "welcome", "message": "Connected to mock server"}' : '{"echo": true}',
        delay: 0,
        enabled: true,
        broadcast: false,
      }],
    });
  };

  const updateHandler = (id: string, patch: Partial<typeof handlers[0]>) => {
    onUpdate({ wsHandlers: handlers.map(h => h.id === id ? { ...h, ...patch } : h) });
  };

  const removeHandler = (id: string) => {
    onUpdate({ wsHandlers: handlers.filter(h => h.id !== id) });
  };

  // ── AI-generated handler items → WebSocketMockHandler ─────────────────────
  const TYPE_MAP: Record<string, 'connection' | 'message' | 'disconnect'> = {
    connect: 'connection',
    connection: 'connection',
    message: 'message',
    disconnect: 'disconnect',
  };

  const handleAddGeneratedItems = useCallback((items: ParsedGenericItem[]) => {
    const newHandlers = items.map((item) => {
      const raw = item.data as Record<string, unknown>;
      const typeKey = ((raw.type as string) || 'message').toLowerCase();
      const event = TYPE_MAP[typeKey] || 'message';
      return {
        id: crypto.randomUUID(),
        event,
        matchPattern: (raw.matchPattern as string) || (event === 'message' ? '*' : ''),
        response: (raw.response as string) || '{}',
        delay: 0,
        enabled: true,
        broadcast: false,
      };
    });
    onUpdate({ wsHandlers: [...handlers, ...newHandlers] });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handlers, onUpdate]);

  return (
    <div className="flex flex-col gap-3">
      {/* Single toolbar row: title | Load Sample | Generate with AI | + On Connect | + On Message | + On Disconnect | 🗑️ */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[12px] font-medium text-[var(--color-text-primary)] mr-auto">Message Handlers ({handlers.length})</span>
        <StyledDropdown
          size="sm"
          options={WS_SAMPLE_OPTIONS}
          value={selectedSample}
          onChange={applySample}
          accentColor="var(--color-protocol-websocket)"
        />
        <MockAiGenerateButton
          templateKey="mock.websocket.generate"
          title="WebSocket Handlers"
          serverName={server.name}
          serverContext={[
            server.description?.trim() ? `Server description (MANDATORY — use strictly as primary context):\n${server.description.trim()}` : '',
            handlers.length > 0 ? `Existing handlers:\n${handlers.map((h) => `${h.event}: ${h.matchPattern || ''}`).join(', ')}` : '',
          ].filter(Boolean).join('\n\n') || undefined}
          accentVar="var(--color-protocol-websocket)"
          onAddGeneratedItems={handleAddGeneratedItems}
        />
        <button
          type="button"
          onClick={() => addHandler('connection')}
          className="h-[26px] px-2.5 text-[11px] rounded cursor-pointer transition-colors border"
          style={{ color: 'var(--color-success)', borderColor: 'color-mix(in srgb, var(--color-success) 30%, transparent)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--color-success) 10%, transparent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >+ On Connect</button>
        <button
          type="button"
          onClick={() => addHandler('message')}
          className="h-[26px] px-2.5 text-[11px] rounded cursor-pointer transition-colors border"
          style={{ color: 'var(--color-mock-server)', borderColor: 'color-mix(in srgb, var(--color-mock-server) 30%, transparent)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--color-mock-server) 10%, transparent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >+ On Message</button>
        <button
          type="button"
          onClick={() => addHandler('disconnect')}
          className="h-[26px] px-2.5 text-[11px] rounded cursor-pointer transition-colors border"
          style={{ color: 'var(--color-error)', borderColor: 'color-mix(in srgb, var(--color-error) 30%, transparent)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--color-error) 10%, transparent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >+ On Disconnect</button>
        {handlers.length > 0 && (
          <button
            type="button"
            onClick={() => setShowDeleteAll(true)}
            title="Delete All Handlers"
            className="h-[26px] w-[26px] flex items-center justify-center rounded cursor-pointer transition-colors border border-[rgba(239,68,68,0.3)] text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.08)]"
          >
            <TrashIcon size={12} />
          </button>
        )}
      </div>

      <p className="text-[10px] text-[var(--color-text-muted)]">
        Configure how the WebSocket mock responds to connections and messages. Use "*" or regex patterns to match incoming messages.
      </p>

      {handlers.map(handler => (
        <div key={handler.id} className={`relative rounded-lg border p-3 flex flex-col gap-2 transition-all ${
          handler.enabled
            ? 'border-[var(--color-surface-border)] bg-[var(--color-surface)]'
            : 'border-[var(--color-surface-border)] bg-[var(--color-panel)]'
        }`}>
          {/* Disabled overlay */}
          {!handler.enabled && (
            <div className="absolute inset-0 rounded-lg z-10 pointer-events-none overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg bg-[var(--color-muted-fallback)]" />
              <DiagonalLinesPattern patternId={`disabled-ws-${handler.id}`} />
            </div>
          )}

          <div className={`flex items-center gap-2 ${!handler.enabled ? 'opacity-50' : ''}`}>
            <button
              type="button"
              onClick={() => updateHandler(handler.id, { enabled: !handler.enabled })}
              className="relative z-20 w-[28px] h-[14px] rounded-full transition-colors flex-shrink-0 cursor-pointer"
              style={{ backgroundColor: handler.enabled ? 'var(--color-success)' : 'var(--color-muted-fallback)' }}
              title={handler.enabled ? 'Disable' : 'Enable'}
            >
              <span className="absolute top-[2px] w-[10px] h-[10px] rounded-full bg-white transition-all" style={{ left: handler.enabled ? '16px' : '2px' }} />
            </button>
            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
              handler.event === 'connection' ? 'text-[var(--color-success)] bg-[rgba(34,197,94,0.12)]' :
              handler.event === 'disconnect' ? 'text-[var(--color-error)] bg-[rgba(239,68,68,0.12)]' :
              'text-[var(--color-mock-server)] bg-[rgba(234,179,8,0.12)]'
            }`}>
              {handler.event}
            </span>
            <div className="flex-1" />
            {handler.enabled && (
              <Checkbox
                checked={handler.broadcast}
                onChange={(v) => updateHandler(handler.id, { broadcast: v })}
                label="Broadcast"
                className="text-[10px]"
              />
            )}
            {wsUrl && handler.enabled && (
              <button
                type="button"
                onClick={() => copyWsUrl(handler.id)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors"
                title="Copy WebSocket URL"
              >
                {copiedId === handler.id ? <CheckIcon size={12} className="text-[var(--color-success)]" /> : <CopyIcon size={12} />}
              </button>
            )}
            {handler.enabled && (
              <button
                type="button"
                onClick={() => setDeleteConfirmId(handler.id)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-error)] cursor-pointer"
              >
                <TrashIcon size={12} />
              </button>
            )}
          </div>
          {handler.enabled && handler.event === 'message' && (
            <input
              type="text"
              value={handler.matchPattern}
              onChange={(e) => updateHandler(handler.id, { matchPattern: e.target.value })}
              placeholder="Pattern (regex or * for all)"
              className="w-full h-[26px] px-2.5 text-[11px] font-mono rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
            />
          )}
          {handler.enabled && (
            <ResizablePanel id={`mock.ws.handler.${handler.id}`} defaultHeight={60} minHeight={40} maxHeight={400}>
              <CodeEditor
                value={handler.response}
                onChange={(val) => updateHandler(handler.id, { response: val })}
                language="json"
                height="100%"
              />
            </ResizablePanel>
          )}
        </div>
      ))}

      {handlers.length === 0 && (
        <p className="text-[11px] text-[var(--color-text-muted)] italic py-2">
          No handlers configured. Without handlers, the server will echo messages back by default.
        </p>
      )}

      {deleteConfirmId && (
        <ConfirmDialog
          title="Delete Handler"
          message="Are you sure you want to delete this WebSocket handler? This cannot be undone."
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            removeHandler(deleteConfirmId);
            setDeleteConfirmId(null);
          }}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}

      {showDeleteAll && (
        <ConfirmDialog
          title="Delete All Handlers"
          message={`Are you sure you want to delete all ${handlers.length} WebSocket handlers? This cannot be undone.`}
          confirmLabel="Delete All"
          danger
          onConfirm={() => {
            onUpdate({ wsHandlers: [] });
            setShowDeleteAll(false);
          }}
          onCancel={() => setShowDeleteAll(false)}
        />
      )}
    </div>
  );
}
