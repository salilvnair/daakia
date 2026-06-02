/**
 * MqttSubscriptionModal — Modal for adding a new MQTT subscription.
 */
import { PlusIcon } from '../../../icons';

const SUB_COLORS = [
  'var(--color-protocol-mqtt)',
  '#22c55e', '#f59e0b', '#ef4444', '#3b82f6',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1',
];

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

export { SUB_COLORS };

export function MqttSubscriptionModal({ topic, setTopic, qos, setQos, label, setLabel, color, setColor, onSubscribe, onCancel }: MqttSubscriptionModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.5)]">
      <div className="w-[420px] bg-[var(--color-panel)] rounded-lg border border-[var(--color-surface-border)] shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-surface-border)]">
          <span className="text-[14px] font-semibold text-[var(--color-text-primary)]">New Subscription</span>
          <button type="button" onClick={onCancel} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer text-[18px]">×</button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 flex flex-col gap-3">
          {/* Topic filter */}
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-[var(--color-text-muted)]">Topic Filter</span>
            <input
              type="text"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="e.g. sensors/+/temperature or home/#"
              className="h-[34px] px-3 text-[12px] font-mono rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter' && topic.trim()) onSubscribe(); }}
            />
          </div>

          {/* QoS radio */}
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-[var(--color-text-muted)]">QoS</span>
            {([0, 1, 2] as const).map(q => (
              <label key={q} className="flex items-center gap-1.5 cursor-pointer text-[12px]">
                <input
                  type="radio"
                  name="sub-qos"
                  checked={qos === q}
                  onChange={() => setQos(q)}
                  className="accent-[var(--color-protocol-mqtt)]"
                />
                <span className="text-[var(--color-text-primary)]">{q}</span>
              </label>
            ))}
          </div>

          {/* Label + Color */}
          <div className="flex items-center gap-2">
            <div className="flex flex-col gap-1 flex-1">
              <span className="text-[11px] text-[var(--color-text-muted)]">Label</span>
              <input
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="Label (optional)"
                className="h-[34px] px-3 text-[12px] rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
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
                  className={`w-5 h-5 rounded-full cursor-pointer transition-all relative overflow-hidden ${!SUB_COLORS.slice(0, 6).includes(color) ? 'ring-2 ring-offset-1 ring-offset-[var(--color-panel)]' : 'opacity-60 hover:opacity-100'}`}
                  style={{ background: !SUB_COLORS.slice(0, 6).includes(color) ? color : 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}
                  title="Custom color"
                >
                  <input
                    type="color"
                    value={color.startsWith('#') ? color : '#8b5cf6'}
                    onChange={e => setColor(e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-[var(--color-surface-border)]">
          <button
            type="button"
            onClick={onSubscribe}
            disabled={!topic.trim()}
            className="h-[34px] px-5 text-[12px] font-medium rounded-md bg-[var(--color-protocol-mqtt)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-opacity"
          >
            Subscribe
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-[34px] px-5 text-[12px] font-medium rounded-md bg-[var(--color-surface)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] cursor-pointer transition-colors border border-[var(--color-surface-border)]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
