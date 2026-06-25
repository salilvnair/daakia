/**
 * SocketIOConfig — Socket.IO event handler config for mock server.
 */
import { useState } from 'react';
import {
  SelectInputView, EditorView, ResizablePanelView, ButtonView, IconButtonView,
  ToggleSwitchView, TextInputView, CheckboxView, type SelectOption,
} from '@salilvnair/dui';
import { TrashIcon, CopyIcon, CheckIcon, DiagonalLinesPattern } from '../../../icons';
import { ConfirmDialog } from '../../shared';
import { SOCKETIO_SAMPLES } from '../samples';
import type { MockServer } from '../mock-types';
import { MockAiGenerateButton, type ParsedGenericItem } from '../MockAiGeneratePopover';
import { logUiEvent } from '../../../store/ui-audit-store';
import type { SocketIOMockHandler } from '../mock-types';

const SOCKETIO_SAMPLE_OPTIONS: SelectOption[] = [
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
    logUiEvent('mock.sample_load', { sampleId, protocol: 'socketio' });
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
    logUiEvent('mock.cfg_add', { protocol: 'socketio' });
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
      const d = item.data as { listenEvent?: string; emitEvent?: string; response?: unknown; type?: string };
      const eventType = (['connection', 'message', 'disconnect'].includes(d.type || '') ? d.type : 'message') as 'connection' | 'message' | 'disconnect';
      const responseStr = typeof d.response === 'string' ? d.response
        : d.response != null ? JSON.stringify(d.response, null, 2) : '{"ack":true}';
      return {
        id: crypto.randomUUID(),
        event: eventType,
        listenEvent: d.listenEvent || item.name || 'message',
        emitEvent: d.emitEvent || '',
        response: responseStr,
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
          <SelectInputView
            size="md"
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
          <ButtonView
            size="md"
            accentColor="var(--color-protocol-socketio)"
            onClick={addHandler}
          >
            + Add Handler
          </ButtonView>
          {handlers.length > 0 && (
            <IconButtonView
              size="md"
              icon={<TrashIcon size={12} />}
              accentColor="var(--color-error)"
              onClick={() => setShowDeleteAll(true)}
              title="Delete All Handlers"
            />
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
            <ToggleSwitchView
              checked={handler.enabled}
              onChange={(v) => updateHandler(handler.id, { enabled: v })}
              accentColor="var(--color-success)"
              size="xs"
            />
            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded text-[var(--color-protocol-socketio)] bg-[rgba(156,163,175,0.12)]">
              {handler.eventName || 'event'}
            </span>
            <div className="flex-1" />
            {handler.enabled && (
              <CheckboxView
                checked={handler.broadcast}
                onChange={(v) => updateHandler(handler.id, { broadcast: v })}
                label="Broadcast"
                size="sm"
              />
            )}
            {ioUrl && handler.enabled && (
              <IconButtonView
                size="sm"
                icon={copiedId === handler.id ? <CheckIcon size={12} className="text-[var(--color-success)]" /> : <CopyIcon size={12} />}
                onClick={() => copyIoUrl(handler.id)}
                title="Copy Socket.IO URL"
              />
            )}
            {handler.enabled && (
              <IconButtonView
                size="sm"
                icon={<TrashIcon size={12} />}
                accentColor="var(--color-error)"
                onClick={() => setDeleteConfirmId(handler.id)}
              />
            )}
          </div>
          {handler.enabled && (
            <>
              <div className="flex items-center gap-2">
                <TextInputView
                  value={handler.eventName}
                  onChange={(e) => updateHandler(handler.id, { eventName: e.target.value })}
                  placeholder="Listen event name"
                  size="md"
                  style={{ flex: 1, fontFamily: 'monospace' }}
                />
                <span className="text-[10px] text-[var(--color-text-muted)]">→</span>
                <TextInputView
                  value={handler.responseEvent}
                  onChange={(e) => updateHandler(handler.id, { responseEvent: e.target.value })}
                  placeholder="Emit event name"
                  size="md"
                  style={{ flex: 1, fontFamily: 'monospace' }}
                />
                <TextInputView
                  value={handler.room || ''}
                  onChange={(e) => updateHandler(handler.id, { room: e.target.value })}
                  placeholder="Room (optional)"
                  size="md"
                  style={{ width: 100, fontFamily: 'monospace' }}
                />
              </div>
              <ResizablePanelView id={`mock.io.handler.${handler.id}`} defaultHeight={60} minHeight={40} maxHeight={400}>
                <EditorView
                  value={handler.response}
                  onChange={(val) => updateHandler(handler.id, { response: val })}
                  language="json"
                  height="100%"
                />
              </ResizablePanelView>
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
          onConfirm={() => { removeHandler(deleteConfirmId); setDeleteConfirmId(null); }}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}

      {showDeleteAll && (
        <ConfirmDialog
          title="Delete All Handlers"
          message={`Are you sure you want to delete all ${handlers.length} Socket.IO handlers? This cannot be undone.`}
          confirmLabel="Delete All"
          danger
          onConfirm={() => { logUiEvent('mock.cfg_clear', { count: handlers.length, protocol: 'socketio' }); onUpdate({ socketioHandlers: [] }); setShowDeleteAll(false); }}
          onCancel={() => setShowDeleteAll(false)}
        />
      )}
    </div>
  );
}
