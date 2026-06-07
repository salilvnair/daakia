/**
 * SSEConfig — SSE event config for mock server.
 */
import { useState } from 'react';
import { TrashIcon, CopyIcon, CheckIcon, DiagonalLinesPattern } from '../../../icons';
import { CodeEditor, StyledDropdown, Checkbox, ResizablePanel, ConfirmDialog, DurationInput, type DropdownOption } from '../../shared';
import { SSE_SAMPLES } from '../samples';
import type { MockServer } from '../mock-types';
import { MockAiGenerateButton } from '../MockAiGeneratePopover';

const SSE_SAMPLE_OPTIONS: DropdownOption[] = [
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-[var(--color-text-primary)]">SSE Events ({events.length})</span>
        <div className="flex items-center gap-1.5">
          <StyledDropdown
            size="sm"
            options={SSE_SAMPLE_OPTIONS}
            value={selectedSample}
            onChange={applySample}
            accentColor="var(--color-mock-server)"
          />
          <MockAiGenerateButton
            templateKey="mock.sse.generate"
            title="SSE Events"
            serverName={server.name}
            serverContext={events.length > 0 ? events.map(e => e.name).join('\n') : undefined}
            accentVar="var(--color-protocol-sse)"
          />
        </div>
      </div>
      <button type="button" onClick={addEvent} className="self-start h-[28px] px-2.5 text-[10px] rounded-md text-[var(--color-protocol-sse)] border border-[rgba(245,158,11,0.2)] hover:bg-[rgba(245,158,11,0.08)] cursor-pointer transition-colors">+ Add Event</button>

      <p className="text-[10px] text-[var(--color-text-muted)]">
        Configure SSE events to stream to connected clients. Set interval for repeated events or 0 for one-shot.
      </p>

      {events.map(event => (
        <div key={event.id} className={`relative rounded-lg border p-3 flex flex-col gap-2 transition-all ${
          event.enabled
            ? 'border-[var(--color-surface-border)] bg-[var(--color-surface)]'
            : 'border-[var(--color-surface-border)] bg-[var(--color-panel)]'
        }`}>
          {/* Disabled overlay */}
          {!event.enabled && (
            <div className="absolute inset-0 rounded-lg z-10 pointer-events-none overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg bg-[var(--color-muted-fallback)]" />
              <DiagonalLinesPattern patternId={`disabled-sse-${event.id}`} />
            </div>
          )}

          <div className={`flex items-center gap-2 ${!event.enabled ? 'opacity-50' : ''}`}>
            <button
              type="button"
              onClick={() => updateEvent(event.id, { enabled: !event.enabled })}
              className="relative z-20 w-[28px] h-[14px] rounded-full transition-colors flex-shrink-0 cursor-pointer"
              style={{ backgroundColor: event.enabled ? 'var(--color-success)' : 'var(--color-muted-fallback)' }}
              title={event.enabled ? 'Disable' : 'Enable'}
            >
              <span className="absolute top-[2px] w-[10px] h-[10px] rounded-full bg-white transition-all" style={{ left: event.enabled ? '16px' : '2px' }} />
            </button>
            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded text-[var(--color-protocol-sse)] bg-[rgba(245,158,11,0.12)]">
              {event.eventName || 'message'}
            </span>
            <div className="flex-1" />
            {event.enabled && (
              <Checkbox
                checked={event.repeat}
                onChange={(v) => updateEvent(event.id, { repeat: v })}
                label="Repeat"
                className="text-[10px]"
              />
            )}
            {sseUrl && event.enabled && (
              <button
                type="button"
                onClick={() => copySseUrl(event.id)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors"
                title="Copy SSE URL"
              >
                {copiedId === event.id ? <CheckIcon size={12} className="text-[var(--color-success)]" /> : <CopyIcon size={12} />}
              </button>
            )}
            {event.enabled && (
              <button
                type="button"
                onClick={() => setDeleteConfirmId(event.id)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-error)] cursor-pointer"
              >
                <TrashIcon size={12} />
              </button>
            )}
          </div>
          {event.enabled && (
            <>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={event.eventName}
                  onChange={(e) => updateEvent(event.id, { eventName: e.target.value })}
                  placeholder="Event name"
                  className="flex-1 h-[28px] px-2.5 text-[11px] font-mono rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
                />
                <DurationInput
                  value={event.intervalMs}
                  onChange={(ms) => updateEvent(event.id, { intervalMs: ms })}
                  placeholder="Interval"
                />
                <DurationInput
                  value={event.delay}
                  onChange={(ms) => updateEvent(event.id, { delay: ms })}
                  placeholder="Delay"
                />
              </div>
              <ResizablePanel id={`mock.sse.event.${event.id}`} defaultHeight={60} minHeight={40} maxHeight={400}>
                <CodeEditor
                  value={event.data}
                  onChange={(val) => updateEvent(event.id, { data: val })}
                  language="json"
                  height="100%"
                />
              </ResizablePanel>
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
    </div>
  );
}
