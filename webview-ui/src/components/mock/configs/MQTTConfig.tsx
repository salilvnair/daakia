/**
 * MQTTConfig — MQTT topic/subscription config for mock server.
 */
import { useState } from 'react';
import {
  SelectInputView, EditorView, ResizablePanelView, ButtonView, IconButtonView,
  ToggleSwitchView, TextInputView, CheckboxView, DurationInputView, type SelectOption,
} from '@salilvnair/dui';
import { TrashIcon, CopyIcon, CheckIcon, DiagonalLinesPattern } from '../../../icons';
import { ConfirmDialog } from '../../shared';
import { MQTT_SAMPLES } from '../samples';
import type { MockServer } from '../mock-types';
import { MockAiGenerateButton, type ParsedGenericItem } from '../MockAiGeneratePopover';
import { logUiEvent } from '../../../store/ui-audit-store';
import type { MQTTMockTopic } from '../mock-types';

const MQTT_SAMPLE_OPTIONS: SelectOption[] = [
  { value: '', label: 'Load Sample...' },
  ...MQTT_SAMPLES.map(s => ({ value: s.id, label: s.label })),
];

const QOS_OPTIONS: SelectOption[] = [
  { value: '0', label: 'QoS 0' },
  { value: '1', label: 'QoS 1' },
  { value: '2', label: 'QoS 2' },
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
    logUiEvent('mock.sample_load', { sampleId, protocol: 'mqtt' });
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
    logUiEvent('mock.cfg_add', { protocol: 'mqtt' });
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
      const d = item.data as { topic?: string; payload?: unknown; qos?: number; intervalMs?: number };
      const qos = ([0, 1, 2].includes(d.qos ?? 0) ? d.qos : 0) as 0 | 1 | 2;
      const payloadStr = typeof d.payload === 'string' ? d.payload
        : d.payload != null ? JSON.stringify(d.payload, null, 2) : '{"hello":"world"}';
      return {
        id: crypto.randomUUID(),
        topic: d.topic || item.name || 'topic/default',
        qos,
        retain: false,
        payload: payloadStr,
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
          <SelectInputView
            size="md"
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
          <ButtonView
            size="md"
            variant="accent"
            accentColor="var(--color-protocol-mqtt)"
            onClick={addTopic}
          >
            + Add Topic
          </ButtonView>
          {topics.length > 0 && (
            <IconButtonView
              size="md"
              icon={<TrashIcon size={12} />}
              accentColor="var(--color-error)"
              onClick={() => setShowDeleteAll(true)}
              title="Delete All Topics"
            />
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
            <ToggleSwitchView
              checked={topic.enabled}
              onChange={(v) => updateTopic(topic.id, { enabled: v })}
              accentColor="var(--color-success)"
              size="xs"
            />
            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded text-[var(--color-protocol-mqtt)] bg-[rgba(139,92,246,0.12)]">
              QoS {topic.qos}
            </span>
            <div className="flex-1" />
            {topic.enabled && (
              <CheckboxView
                checked={topic.retain}
                onChange={(v) => updateTopic(topic.id, { retain: v })}
                label="Retain"
                size="sm"
              />
            )}
            {mqttUrl && topic.enabled && (
              <IconButtonView
                size="sm"
                icon={copiedId === topic.id ? <CheckIcon size={12} className="text-[var(--color-success)]" /> : <CopyIcon size={12} />}
                onClick={() => copyMqttUrl(topic.id)}
                title="Copy MQTT URL"
              />
            )}
            {topic.enabled && (
              <IconButtonView
                size="sm"
                icon={<TrashIcon size={12} />}
                accentColor="var(--color-error)"
                onClick={() => setDeleteConfirmId(topic.id)}
              />
            )}
          </div>
          {topic.enabled && (
            <>
              <div className="flex items-center gap-2">
                <TextInputView
                  value={topic.topic}
                  onChange={(e) => updateTopic(topic.id, { topic: e.target.value })}
                  placeholder="Topic (e.g., sensors/temperature)"
                  size="md"
                  style={{ flex: 1, fontFamily: 'monospace' }}
                />
                <SelectInputView
                  size="md"
                  value={String(topic.qos)}
                  onChange={(val) => updateTopic(topic.id, { qos: parseInt(val) as 0 | 1 | 2 })}
                  options={QOS_OPTIONS}
                  accentColor="var(--color-protocol-mqtt)"
                />
                <DurationInputView
                  value={topic.intervalMs}
                  onChange={(ms) => updateTopic(topic.id, { intervalMs: ms })}
                  placeholder="Interval"
                  size="sm"
                />
              </div>
              <ResizablePanelView id={`mock.mqtt.topic.${topic.id}`} defaultHeight={60} minHeight={40} maxHeight={400}>
                <EditorView
                  value={topic.payload}
                  onChange={(val) => updateTopic(topic.id, { payload: val })}
                  language="json"
                  height="100%"
                />
              </ResizablePanelView>
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
          onConfirm={() => { removeTopic(deleteConfirmId); setDeleteConfirmId(null); }}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}

      {showDeleteAll && (
        <ConfirmDialog
          title="Delete All Topics"
          message={`Are you sure you want to delete all ${topics.length} MQTT topics? This cannot be undone.`}
          confirmLabel="Delete All"
          danger
          onConfirm={() => { logUiEvent('mock.cfg_clear', { count: topics.length, protocol: 'mqtt' }); onUpdate({ mqttTopics: [] }); setShowDeleteAll(false); }}
          onCancel={() => setShowDeleteAll(false)}
        />
      )}
    </div>
  );
}
