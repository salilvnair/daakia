/**
 * MQTTConfig — MQTT topic/subscription config for mock server.
 */
import { useState } from 'react';
import { TrashIcon, CopyIcon, CheckIcon, DiagonalLinesPattern } from '../../../icons';
import { CodeEditor, StyledDropdown, Checkbox, ResizablePanel, ConfirmDialog, DurationInput, type DropdownOption } from '../../shared';
import { MQTT_SAMPLES } from '../samples';
import type { MockServer } from '../mock-types';
import { MockAiGenerateButton, type ParsedGenericItem } from '../MockAiGeneratePopover';
import type { MQTTMockTopic } from '../mock-types';

const MQTT_SAMPLE_OPTIONS: DropdownOption[] = [
  { value: '', label: 'Load Sample...' },
  ...MQTT_SAMPLES.map(s => ({ value: s.id, label: s.label })),
];

interface MQTTConfigProps {
  server: MockServer;
  onUpdate: (patch: Partial<MockServer>) => void;
}

export function MQTTConfig({ server, onUpdate }: MQTTConfigProps) {
  const topics = server.mqttTopics || [];
  const [selectedSample, setSelectedSample] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);

  const mqttUrl = server.running && server.port ? `ws://localhost:${server.port}` : '';

  const copyMqttUrl = (id: string) => {
    if (!mqttUrl) return;
    navigator.clipboard.writeText(mqttUrl);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const applySample = (sampleId: string) => {
    if (!sampleId) return;
    const sample = MQTT_SAMPLES.find(s => s.id === sampleId);
    if (!sample) return;
    setSelectedSample(sampleId);
    onUpdate({
      description: sample.description,
      mqttTopics: sample.topics.map(t => ({
        id: crypto.randomUUID(),
        topic: t.topic,
        qos: t.qos,
        payload: t.payload,
        intervalMs: t.intervalMs,
        retain: t.retain,
        enabled: true,
      })),
    });
  };

  const addTopic = () => {
    onUpdate({
      mqttTopics: [...topics, {
        id: crypto.randomUUID(),
        topic: '',
        qos: 0,
        payload: '{"value": 42}',
        intervalMs: 5000,
        retain: false,
        enabled: true,
      }],
    });
  };

  const updateTopic = (id: string, patch: Partial<typeof topics[0]>) => {
    onUpdate({ mqttTopics: topics.map(t => t.id === id ? { ...t, ...patch } : t) });
  };

  const removeTopic = (id: string) => {
    onUpdate({ mqttTopics: topics.filter(t => t.id !== id) });
  };

  const handleAddGeneratedItems = (items: ParsedGenericItem[]) => {
    const newTopics: MQTTMockTopic[] = items.map(item => {
      const d = item.data as { topic?: string; payload?: string; qos?: number; intervalMs?: number };
      const qos = ([0, 1, 2].includes(d.qos ?? 0) ? d.qos : 0) as 0 | 1 | 2;
      return {
        id: crypto.randomUUID(),
        topic: d.topic || item.name || 'topic/default',
        qos,
        retain: false,
        payload: d.payload || '{"hello":"world"}',
        intervalMs: d.intervalMs ?? 5000,
        enabled: true,
      };
    });
    onUpdate({ mqttTopics: [...topics, ...newTopics] });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-[var(--color-text-primary)]">Topics ({topics.length})</span>
        <div className="flex items-center gap-1.5">
          <StyledDropdown
            size="sm"
            options={MQTT_SAMPLE_OPTIONS}
            value={selectedSample}
            onChange={applySample}
            accentColor="var(--color-protocol-mqtt)"
          />
          <MockAiGenerateButton
            templateKey="mock.mqtt.generate"
            title="MQTT Topics"
            serverName={server.name}
            serverContext={[
              server.description?.trim() ? `Server description (MANDATORY — use strictly as primary context):\n${server.description.trim()}` : '',
              topics.length > 0 ? `Existing topics:\n${topics.map(t => t.topic || '').join(', ')}` : '',
            ].filter(Boolean).join('\n\n') || undefined}
            accentVar="var(--color-protocol-mqtt)"
            onAddGeneratedItems={handleAddGeneratedItems}
          />
          <button
            type="button"
            onClick={addTopic}
            className="h-[26px] px-2.5 text-[11px] rounded cursor-pointer transition-colors border"
            style={{ color: 'var(--color-protocol-mqtt)', borderColor: 'color-mix(in srgb, var(--color-protocol-mqtt) 30%, transparent)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--color-protocol-mqtt) 10%, transparent)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            + Add Topic
          </button>
          {topics.length > 0 && (
            <button
              type="button"
              onClick={() => setShowDeleteAll(true)}
              title="Delete All Topics"
              className="h-[26px] w-[26px] flex items-center justify-center rounded cursor-pointer transition-colors border border-[rgba(239,68,68,0.3)] text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.08)]"
            >
              <TrashIcon size={12} />
            </button>
          )}
        </div>
      </div>

      <p className="text-[10px] text-[var(--color-text-muted)]">
        Configure MQTT topics to publish messages to. Subscribers connecting to this broker will receive these messages.
      </p>

      {topics.map(topic => (
        <div key={topic.id} className={`relative rounded-lg border p-3 flex flex-col gap-2 transition-all ${
          topic.enabled
            ? 'border-[var(--color-surface-border)] bg-[var(--color-surface)]'
            : 'border-[var(--color-surface-border)] bg-[var(--color-panel)]'
        }`}>
          {/* Disabled overlay */}
          {!topic.enabled && (
            <div className="absolute inset-0 rounded-lg z-10 pointer-events-none overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg bg-[var(--color-muted-fallback)]" />
              <DiagonalLinesPattern patternId={`disabled-mqtt-${topic.id}`} />
            </div>
          )}

          <div className={`flex items-center gap-2 ${!topic.enabled ? 'opacity-50' : ''}`}>
            <button
              type="button"
              onClick={() => updateTopic(topic.id, { enabled: !topic.enabled })}
              className="relative z-20 w-[28px] h-[14px] rounded-full transition-colors flex-shrink-0 cursor-pointer"
              style={{ backgroundColor: topic.enabled ? 'var(--color-success)' : 'var(--color-muted-fallback)' }}
              title={topic.enabled ? 'Disable' : 'Enable'}
            >
              <span className="absolute top-[2px] w-[10px] h-[10px] rounded-full bg-white transition-all" style={{ left: topic.enabled ? '16px' : '2px' }} />
            </button>
            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded text-[var(--color-protocol-mqtt)] bg-[rgba(139,92,246,0.12)]">
              QoS {topic.qos}
            </span>
            <div className="flex-1" />
            {topic.enabled && (
              <Checkbox
                checked={topic.retain}
                onChange={(v) => updateTopic(topic.id, { retain: v })}
                label="Retain"
                className="text-[10px]"
              />
            )}
            {mqttUrl && topic.enabled && (
              <button
                type="button"
                onClick={() => copyMqttUrl(topic.id)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors"
                title="Copy MQTT URL"
              >
                {copiedId === topic.id ? <CheckIcon size={12} className="text-[var(--color-success)]" /> : <CopyIcon size={12} />}
              </button>
            )}
            {topic.enabled && (
              <button
                type="button"
                onClick={() => setDeleteConfirmId(topic.id)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-error)] cursor-pointer"
              >
                <TrashIcon size={12} />
              </button>
            )}
          </div>
          {topic.enabled && (
            <>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={topic.topic}
                  onChange={(e) => updateTopic(topic.id, { topic: e.target.value })}
                  placeholder="Topic (e.g., sensors/temperature)"
                  className="flex-1 h-[26px] px-2.5 text-[11px] font-mono rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
                />
                <StyledDropdown
                  size="sm"
                  value={String(topic.qos)}
                  onChange={(val) => updateTopic(topic.id, { qos: parseInt(val) as 0 | 1 | 2 })}
                  options={[
                    { value: '0', label: 'QoS 0' },
                    { value: '1', label: 'QoS 1' },
                    { value: '2', label: 'QoS 2' },
                  ]}
                />
                <DurationInput
                  value={topic.intervalMs}
                  onChange={(ms) => updateTopic(topic.id, { intervalMs: ms })}
                  placeholder="Interval"
                />
              </div>
              <ResizablePanel id={`mock.mqtt.topic.${topic.id}`} defaultHeight={60} minHeight={40} maxHeight={400}>
                <CodeEditor
                  value={topic.payload}
                  onChange={(val) => updateTopic(topic.id, { payload: val })}
                  language="json"
                  height="100%"
                />
              </ResizablePanel>
            </>
          )}
        </div>
      ))}

      {topics.length === 0 && (
        <p className="text-[11px] text-[var(--color-text-muted)] italic py-2">
          No topics configured. Add topics to publish messages when clients connect to this MQTT broker.
        </p>
      )}

      {deleteConfirmId && (
        <ConfirmDialog
          title="Delete Topic"
          message="Are you sure you want to delete this MQTT topic? This cannot be undone."
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            removeTopic(deleteConfirmId);
            setDeleteConfirmId(null);
          }}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}

      {showDeleteAll && (
        <ConfirmDialog
          title="Delete All Topics"
          message={`Are you sure you want to delete all ${topics.length} MQTT topics? This cannot be undone.`}
          confirmLabel="Delete All"
          danger
          onConfirm={() => {
            onUpdate({ mqttTopics: [] });
            setShowDeleteAll(false);
          }}
          onCancel={() => setShowDeleteAll(false)}
        />
      )}
    </div>
  );
}
