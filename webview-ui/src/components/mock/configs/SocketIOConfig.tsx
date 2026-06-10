/**
 * SocketIOConfig — Socket.IO event handler config for mock server.
 */
import { useState } from 'react';
import { TrashIcon, CopyIcon, CheckIcon, DiagonalLinesPattern } from '../../../icons';
import { CodeEditor, StyledDropdown, Checkbox, ResizablePanel, ConfirmDialog, type DropdownOption } from '../../shared';
import { SOCKETIO_SAMPLES } from '../samples';
import type { MockServer } from '../mock-types';
import { MockAiGenerateButton, type ParsedGenericItem } from '../MockAiGeneratePopover';
import type { SocketIOMockHandler } from '../mock-types';

const SOCKETIO_SAMPLE_OPTIONS: DropdownOption[] = [
  { value: '', label: 'Load Sample...' },
  ...SOCKETIO_SAMPLES.map(s => ({ value: s.id, label: s.label })),
];

interface SocketIOConfigProps {
  server: MockServer;
  onUpdate: (patch: Partial<MockServer>) => void;
}

export function SocketIOConfig({ server, onUpdate }: SocketIOConfigProps) {
  const handlers = server.socketioHandlers || [];
  const [selectedSample, setSelectedSample] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);

  const ioUrl = server.running && server.port ? `http://localhost:${server.port}` : '';

  const copyIoUrl = (id: string) => {
    if (!ioUrl) return;
    navigator.clipboard.writeText(ioUrl);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const applySample = (sampleId: string) => {
    if (!sampleId) return;
    const sample = SOCKETIO_SAMPLES.find(s => s.id === sampleId);
    if (!sample) return;
    setSelectedSample(sampleId);
    onUpdate({
      description: sample.description,
      socketioHandlers: sample.handlers.map(h => ({
        id: crypto.randomUUID(),
        eventName: h.eventName,
        responseEvent: h.responseEvent,
        response: h.response,
        broadcast: h.broadcast,
        room: h.room || '',
        delay: 0,
        enabled: true,
      })),
    });
  };

  const addHandler = () => {
    onUpdate({
      socketioHandlers: [...handlers, {
        id: crypto.randomUUID(),
        eventName: '',
        responseEvent: '',
        response: '{"ack": true}',
        broadcast: false,
        room: '',
        delay: 0,
        enabled: true,
      }],
    });
  };

  const updateHandler = (id: string, patch: Partial<typeof handlers[0]>) => {
    onUpdate({ socketioHandlers: handlers.map(h => h.id === id ? { ...h, ...patch } : h) });
  };

  const removeHandler = (id: string) => {
    onUpdate({ socketioHandlers: handlers.filter(h => h.id !== id) });
  };

  const handleAddGeneratedItems = (items: ParsedGenericItem[]) => {
    const newHandlers: SocketIOMockHandler[] = items.map(item => {
      const d = item.data as { listenEvent?: string; emitEvent?: string; response?: string; type?: string };
      const eventType = (['connection', 'message', 'disconnect'].includes(d.type || '') ? d.type : 'message') as 'connection' | 'message' | 'disconnect';
      return {
        id: crypto.randomUUID(),
        event: eventType,
        listenEvent: d.listenEvent || item.name || 'message',
        emitEvent: d.emitEvent || '',
        response: d.response || '{"ack":true}',
        delay: 0,
        enabled: true,
        broadcast: false,
      };
    });
    onUpdate({ socketioHandlers: [...handlers, ...newHandlers] });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-[var(--color-text-primary)]">Event Handlers ({handlers.length})</span>
        <div className="flex items-center gap-1.5">
          <StyledDropdown
            size="sm"
            options={SOCKETIO_SAMPLE_OPTIONS}
            value={selectedSample}
            onChange={applySample}
            accentColor="var(--color-protocol-socketio)"
          />
          <MockAiGenerateButton
            templateKey="mock.socketio.generate"
            title="Socket.IO Events"
            serverName={server.name}
            serverContext={[
              server.description?.trim() ? `Server description (MANDATORY — use strictly as primary context):\n${server.description.trim()}` : '',
              handlers.length > 0 ? `Existing handlers:\n${handlers.map((h: any) => h.listenEvent || h.event || '').join(', ')}` : '',
            ].filter(Boolean).join('\n\n') || undefined}
            accentVar="var(--color-protocol-socketio)"
            onAddGeneratedItems={handleAddGeneratedItems}
          />
          <button
            type="button"
            onClick={addHandler}
            className="h-[26px] px-2.5 text-[11px] rounded cursor-pointer transition-colors border"
            style={{ color: 'var(--color-protocol-socketio)', borderColor: 'color-mix(in srgb, var(--color-protocol-socketio) 30%, transparent)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--color-protocol-socketio) 10%, transparent)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            + Add Handler
          </button>
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
      </div>

      <p className="text-[10px] text-[var(--color-text-muted)]">
        Configure Socket.IO event handlers. Each handler listens for an event and can emit a response event back or broadcast to all.
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
              <DiagonalLinesPattern patternId={`disabled-io-${handler.id}`} />
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
            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded text-[var(--color-protocol-socketio)] bg-[rgba(156,163,175,0.12)]">
              {handler.eventName || 'event'}
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
            {ioUrl && handler.enabled && (
              <button
                type="button"
                onClick={() => copyIoUrl(handler.id)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors"
                title="Copy Socket.IO URL"
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
          {handler.enabled && (
            <>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={handler.eventName}
                  onChange={(e) => updateHandler(handler.id, { eventName: e.target.value })}
                  placeholder="Listen event name"
                  className="flex-1 h-[26px] px-2.5 text-[11px] font-mono rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
                />
                <span className="text-[10px] text-[var(--color-text-muted)]">→</span>
                <input
                  type="text"
                  value={handler.responseEvent}
                  onChange={(e) => updateHandler(handler.id, { responseEvent: e.target.value })}
                  placeholder="Emit event name"
                  className="flex-1 h-[26px] px-2.5 text-[11px] font-mono rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
                />
                <input
                  type="text"
                  value={handler.room || ''}
                  onChange={(e) => updateHandler(handler.id, { room: e.target.value })}
                  placeholder="Room (optional)"
                  className="w-[100px] h-[26px] px-2 text-[11px] font-mono rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
                />
              </div>
              <ResizablePanel id={`mock.io.handler.${handler.id}`} defaultHeight={60} minHeight={40} maxHeight={400}>
                <CodeEditor
                  value={handler.response}
                  onChange={(val) => updateHandler(handler.id, { response: val })}
                  language="json"
                  height="100%"
                />
              </ResizablePanel>
            </>
          )}
        </div>
      ))}

      {handlers.length === 0 && (
        <p className="text-[11px] text-[var(--color-text-muted)] italic py-2">
          No handlers configured. Add handlers to respond to Socket.IO events.
        </p>
      )}

      {deleteConfirmId && (
        <ConfirmDialog
          title="Delete Handler"
          message="Are you sure you want to delete this Socket.IO handler? This cannot be undone."
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
          message={`Are you sure you want to delete all ${handlers.length} Socket.IO handlers? This cannot be undone.`}
          confirmLabel="Delete All"
          danger
          onConfirm={() => {
            onUpdate({ socketioHandlers: [] });
            setShowDeleteAll(false);
          }}
          onCancel={() => setShowDeleteAll(false)}
        />
      )}
    </div>
  );
}
