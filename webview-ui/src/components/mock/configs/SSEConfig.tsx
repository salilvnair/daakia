/**
 * SSEConfig — SSE event config for mock server.
 */
import { useState } from 'react';
import { TrashIcon, CopyIcon, CheckIcon, DiagonalLinesPattern } from '../../../icons';
import {
  ButtonView, IconButtonView, SelectInputView, CheckboxView,
  DurationInputView, EditorView, ResizablePanelView, ToggleSwitchView,
  TextInputView, type SelectOption,
} from '@salilvnair/dui';
import { ConfirmDialog } from '../../shared';
import { SSE_SAMPLES } from '../samples';
import type { MockServer } from '../mock-types';
import { MockAiGenerateButton, type ParsedGenericItem } from '../MockAiGeneratePopover';
import type { SSEMockEvent } from '../mock-types';

const SSE_SAMPLE_OPTIONS: SelectOption[] = [
  { value: '', label: 'Load Sample...' },
  ...SSE_SAMPLES.map(s => ({ value: s.id, label: s.label })),
];

interface SSEConfigProps {
  server: MockServer;
  onUpdate: (patch: Partial<MockServer>) => void;
}

export function SSEConfig({ server, onUpdate }: SSEConfigProps) {
  const events = server.sseEvents || [];
  const [selectedSample, setSelectedSample] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);

  const sseUrl = server.running && server.port ? `http://localhost:${server.port}` : '';

  const copySseUrl = (id: string) => {
    if (!sseUrl) return;
    navigator.clipboard.writeText(sseUrl);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const applySample = (sampleId: string) => {
    if (!sampleId) return;
    const sample = SSE_SAMPLES.find(s => s.id === sampleId);
    if (!sample) return;
    setSelectedSample(sampleId);
    onUpdate({
      description: sample.description,
      sseEvents: sample.events.map(e => ({
        id: crypto.randomUUID(),
        eventName: e.eventName,
        data: e.data,
        intervalMs: e.intervalMs,
        delay: e.delay,
        repeat: e.repeat,
        enabled: true,
      })),
    });
  };

  const addEvent = () => {
    onUpdate({
      sseEvents: [...events, {
        id: crypto.randomUUID(),
        eventName: 'message',
        data: '{"hello": "world"}',
        intervalMs: 5000,
        delay: 0,
        repeat: true,
        enabled: true,
      }],
    });
  };

  const updateEvent = (id: string, patch: Partial<typeof events[0]>) => {
    onUpdate({ sseEvents: events.map(e => e.id === id ? { ...e, ...patch } : e) });
  };

  const removeEvent = (id: string) => {
    onUpdate({ sseEvents: events.filter(e => e.id !== id) });
  };

  const handleAddGeneratedItems = (items: ParsedGenericItem[]) => {
    const newEvents: SSEMockEvent[] = items.map(item => {
      const d = item.data as { eventName?: string; data?: unknown; intervalMs?: number };
      const dataStr = typeof d.data === 'string' ? d.data
        : d.data != null ? JSON.stringify(d.data, null, 2) : '{"hello":"world"}';
      return {
        id: crypto.randomUUID(),
        eventName: d.eventName || item.name || 'message',
        data: dataStr,
        intervalMs: d.intervalMs ?? 5000,
        delay: 0,
        repeat: true,
        enabled: true,
      };
    });
    onUpdate({ sseEvents: [...events, ...newEvents] });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-[var(--color-text-primary)]">SSE Events ({events.length})</span>
        <div className="flex items-center gap-1.5">
          <SelectInputView
            size="md"
            options={SSE_SAMPLE_OPTIONS}
            value={selectedSample}
            onChange={applySample}
            accentColor="var(--color-protocol-sse)"
          />
          <MockAiGenerateButton
            templateKey="mock.sse.generate"
            title="SSE Events"
            serverName={server.name}
            serverContext={[
              server.description?.trim() ? `Server description (MANDATORY — use strictly as primary context):\n${server.description.trim()}` : '',
              events.length > 0 ? `Existing events:\n${events.map(e => e.eventName).join(', ')}` : '',
            ].filter(Boolean).join('\n\n') || undefined}
            accentVar="var(--color-protocol-sse)"
            onAddGeneratedItems={handleAddGeneratedItems}
          />
          <ButtonView
            size="md"
            variant="ghost"
            accentColor="var(--color-protocol-sse)"
            onClick={addEvent}
          >
            + Add Event
          </ButtonView>
          {events.length > 0 && (
            <IconButtonView
              size="sm"
              icon={<TrashIcon size={12} />}
              title="Delete All Events"
              accentColor="var(--color-error)"
              onClick={() => setShowDeleteAll(true)}
            />
          )}
        </div>
      </div>

      <p className="text-[10px] text-[var(--color-text-muted)]">
        Configure SSE events to stream to connected clients. Set interval for repeated events or 0 for one-shot.
      </p>

      {events.map(event => (
        <div key={event.id} className={`relative rounded-lg border p-3 flex flex-col gap-2 transition-all ${
          event.enabled
            ? 'border-[var(--color-surface-border)] bg-[var(--color-surface)]'
            : 'border-[var(--color-surface-border)] bg-[var(--color-panel)]'
        }`}>
          {!event.enabled && (
            <div className="absolute inset-0 rounded-lg z-10 pointer-events-none overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg bg-[var(--color-muted-fallback)]" />
              <DiagonalLinesPattern patternId={`disabled-sse-${event.id}`} />
            </div>
          )}

          <div className={`flex items-center gap-2 ${!event.enabled ? 'opacity-50' : ''}`}>
            <ToggleSwitchView
              checked={event.enabled}
              onChange={(v) => updateEvent(event.id, { enabled: v })}
              accentColor="var(--color-success)"
              size="xs"
            />
            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded text-[var(--color-protocol-sse)] bg-[rgba(245,158,11,0.12)]">
              {event.eventName || 'message'}
            </span>
            <div className="flex-1" />
            {event.enabled && (
              <CheckboxView
                checked={event.repeat}
                onChange={(v) => updateEvent(event.id, { repeat: v })}
                label="Repeat"
                size="sm"
              />
            )}
            {sseUrl && event.enabled && (
              <IconButtonView
                size="sm"
                icon={copiedId === event.id ? <CheckIcon size={12} className="text-[var(--color-success)]" /> : <CopyIcon size={12} />}
                title="Copy SSE URL"
                onClick={() => copySseUrl(event.id)}
              />
            )}
            {event.enabled && (
              <IconButtonView
                size="sm"
                icon={<TrashIcon size={12} />}
                accentColor="var(--color-error)"
                onClick={() => setDeleteConfirmId(event.id)}
              />
            )}
          </div>
          {event.enabled && (
            <>
              <div className="flex items-center gap-2">
                <TextInputView
                  value={event.eventName}
                  onChange={(e) => updateEvent(event.id, { eventName: e.target.value })}
                  placeholder="Event name"
                  size="md"
                  style={{ fontFamily: 'monospace', flex: 1 }}
                />
                <DurationInputView
                  value={event.intervalMs}
                  onChange={(ms) => updateEvent(event.id, { intervalMs: ms })}
                  placeholder="Interval"
                  size="sm"
                />
                <DurationInputView
                  value={event.delay}
                  onChange={(ms) => updateEvent(event.id, { delay: ms })}
                  placeholder="Delay"
                  size="sm"
                />
              </div>
              <ResizablePanelView id={`mock.sse.event.${event.id}`} defaultHeight={60} minHeight={40} maxHeight={400}>
                <EditorView
                  value={event.data}
                  onChange={(val) => updateEvent(event.id, { data: val })}
                  language="json"
                  height="100%"
                />
              </ResizablePanelView>
            </>
          )}
        </div>
      ))}

      {events.length === 0 && (
        <p className="text-[11px] text-[var(--color-text-muted)] italic py-2">
          No events configured. Add an event to start streaming data to connected clients.
        </p>
      )}

      {deleteConfirmId && (
        <ConfirmDialog
          title="Delete Event"
          message="Are you sure you want to delete this SSE event? This cannot be undone."
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            removeEvent(deleteConfirmId);
            setDeleteConfirmId(null);
          }}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}

      {showDeleteAll && (
        <ConfirmDialog
          title="Delete All Events"
          message={`Are you sure you want to delete all ${events.length} SSE events? This cannot be undone.`}
          confirmLabel="Delete All"
          danger
          onConfirm={() => {
            onUpdate({ sseEvents: [] });
            setShowDeleteAll(false);
          }}
          onCancel={() => setShowDeleteAll(false)}
        />
      )}
    </div>
  );
}
