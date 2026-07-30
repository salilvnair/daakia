/**
 * MqttSubscriptionModal — Modal for adding a new MQTT subscription.
 */
import { ModalView, ButtonView, TextInputView, SelectInputView } from '@salilvnair/dui';
import { PlusIcon } from '../../../icons';

export const SUB_COLORS = [
  'var(--color-protocol-mqtt)',
  'var(--color-success)', 'var(--color-warning)', 'var(--color-error)', 'var(--color-info)',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1',
];

const QOS_OPTIONS = [
  { value: '0', label: 'QoS 0' },
  { value: '1', label: 'QoS 1' },
  { value: '2', label: 'QoS 2' },
];

// Hex fallback values for SUB_COLORS (for the color picker input which needs a real hex)
const COLOR_HEX_FALLBACKS: Record<string, string> = {
  'var(--color-protocol-mqtt)': '#8b5cf6',
  'var(--color-success)': '#22c55e',
  'var(--color-warning)': '#f59e0b',
  'var(--color-error)': '#ef4444',
  'var(--color-info)': '#3b82f6',
};

interface MqttSubscriptionModalProps {
  topic: string;
  setTopic: (v: string) => void;
  qos: 0 | 1 | 2;
  setQos: (v: 0 | 1 | 2) => void;
  label: string;
  setLabel: (v: string) => void;
  color: string;
  setColor: (v: string) => void;
  onSubscribe: () => void;
  onCancel: () => void;
}

export function MqttSubscriptionModal({ topic, setTopic, qos, setQos, label, setLabel, color, setColor, onSubscribe, onCancel }: MqttSubscriptionModalProps) {
  const isCustomColor = !SUB_COLORS.slice(0, 6).includes(color);
  const colorHexForPicker = isCustomColor && color.startsWith('#') ? color : COLOR_HEX_FALLBACKS[color] || '#8b5cf6';

  return (
    <ModalView
      open={true}
      onClose={onCancel}
      title="New Subscription"
      subtitle="Subscribe to an MQTT topic filter"
      headerIcon={<PlusIcon size={16} />}
      headerColor="var(--color-protocol-mqtt)"
      size="sm"
      footerRight={
        <ButtonView
          label="Subscribe"
          variant="primary"
          size="md"
          accentColor="var(--color-protocol-mqtt)"
          disabled={!topic.trim()}
          onClick={onSubscribe}
        />
      }
    >
      <div className="flex flex-col gap-3 px-1">
        {/* Topic filter */}
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-[var(--color-text-muted)]">Topic Filter</span>
          <TextInputView
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="e.g. sensors/+/temperature or home/#"
            size="md"
            autoFocus
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter' && topic.trim()) onSubscribe(); }}
          />
        </div>

        {/* QoS */}
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-[var(--color-text-muted)]">QoS</span>
          <SelectInputView
            options={QOS_OPTIONS}
            value={String(qos)}
            onChange={(v) => setQos(parseInt(v) as 0 | 1 | 2)}
            size="md"
            accentColor="var(--color-protocol-mqtt)"
          />
        </div>

        {/* Label + Color */}
        <div className="flex items-center gap-2">
          <div className="flex flex-col gap-1 flex-1">
            <span className="text-[11px] text-[var(--color-text-muted)]">Label</span>
            <TextInputView
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Label (optional)"
              size="md"
            />
          </div>
          {/* Color swatches */}
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-[var(--color-text-muted)]">Color</span>
            <div className="flex items-center gap-1">
              {SUB_COLORS.slice(0, 6).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-5 h-5 rounded-full cursor-pointer transition-all ${color === c ? 'ring-2 ring-offset-1 ring-offset-[var(--color-panel)]' : 'opacity-60 hover:opacity-100'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
              {/* Custom color picker */}
              <label
                className={`w-5 h-5 rounded-full cursor-pointer transition-all relative overflow-hidden ${isCustomColor ? 'ring-2 ring-offset-1 ring-offset-[var(--color-panel)]' : 'opacity-60 hover:opacity-100'}`}
                style={{ background: isCustomColor ? color : 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}
                title="Custom color"
              >
                <input
                  type="color"
                  value={colorHexForPicker}
                  onChange={e => setColor(e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </label>
            </div>
          </div>
        </div>
      </div>
    </ModalView>
  );
}
