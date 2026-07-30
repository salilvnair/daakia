/**
 * ChaosPanel — Global chaos engineering dial for the entire mock server (6A.15).
 * Applies probabilistic fault injection to ALL routes globally.
 */
import { SelectInputView, ToggleSwitchView, TextInputView, SliderView, ChipView, type SelectOption } from '@salilvnair/dui';
import type { MockServer, FaultType } from '../mock-types';
import { logUiEvent } from '../../../store/ui-audit-store';

// HTTP-based protocols (REST, GraphQL, gRPC, SOAP)
const HTTP_FAULT_OPTIONS: SelectOption[] = [
  { value: 'RANDOM_5XX',       label: 'Random 5xx Error' },
  { value: 'EMPTY_RESPONSE',   label: 'Empty Response' },
  { value: 'MALFORMED_JSON',   label: 'Malformed JSON / Body' },
  { value: 'TIMEOUT',          label: 'Timeout (slow / no response)' },
  { value: 'CONNECTION_RESET', label: 'Connection Reset' },
  { value: 'CHUNKED_DRIBBLE',  label: 'Chunked Dribble (slow stream)' },
];

// Event-driven protocols (WebSocket, SSE, Socket.IO, MQTT)
const REALTIME_FAULT_OPTIONS: SelectOption[] = [
  { value: 'RANDOM_DISCONNECT', label: 'Random Disconnect' },
  { value: 'MESSAGE_DELAY',     label: 'Message / Event Delay' },
  { value: 'CORRUPT_PAYLOAD',   label: 'Corrupt Payload (garbled data)' },
  { value: 'MISSED_HEARTBEAT',  label: 'Missed Heartbeat / Ping' },
  { value: 'TIMEOUT',           label: 'Timeout (no response)' },
  { value: 'CONNECTION_RESET',  label: 'Connection Reset' },
];

const REALTIME_PROTOCOLS = new Set(['websocket', 'sse', 'socketio', 'mqtt']);

function getFaultOptions(protocol: string): SelectOption[] {
  return REALTIME_PROTOCOLS.has(protocol) ? REALTIME_FAULT_OPTIONS : HTTP_FAULT_OPTIONS;
}

function getDefaultFault(protocol: string): string {
  return REALTIME_PROTOCOLS.has(protocol) ? 'RANDOM_DISCONNECT' : 'RANDOM_5XX';
}

function getSubtitle(protocol: string): string {
  return REALTIME_PROTOCOLS.has(protocol)
    ? 'Applies the selected fault to a percentage of ALL messages / events on this server'
    : 'Applies the selected fault to a percentage of ALL requests across all routes';
}

interface Props {
  server: MockServer;
  onUpdate: (patch: Partial<MockServer>) => void;
  protocol?: string;
}

export function ChaosPanel({ server, onUpdate, protocol = 'rest' }: Props) {
  const chaos = server.globalFault ?? { enabled: false };
  const faultOptions = getFaultOptions(protocol);
  const defaultFault = getDefaultFault(protocol);

  const update = (patch: Partial<typeof chaos>) => {
    onUpdate({ globalFault: { ...chaos, ...patch } });
  };

  const probability = Math.round((chaos.probability ?? 0.1) * 100);

  return (
    <div className="flex flex-col gap-3">
      {/* Header toggle */}
      <div className="flex items-center justify-between p-3 rounded-lg"
        style={{ background: chaos.enabled ? 'rgba(239,68,68,0.06)' : 'color-mix(in srgb, var(--color-text-primary) 2%, transparent)', border: `1px solid ${chaos.enabled ? 'rgba(239,68,68,0.2)' : 'color-mix(in srgb, var(--color-text-primary) 8%, transparent)'}` }}>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            {chaos.enabled && <span className="w-[6px] h-[6px] rounded-full bg-[var(--color-error)] animate-pulse" />}
            <span className="text-[12px] font-medium text-[var(--color-text-primary)]">
              {chaos.enabled ? `Chaos Mode — ${probability}% ${chaos.type?.replace(/_/g, ' ') ?? 'fault'} globally` : 'Chaos Mode Off'}
            </span>
          </div>
          <span className="text-[10px] text-[var(--color-text-muted)] opacity-70">
            {getSubtitle(protocol)}
          </span>
        </div>
        <ToggleSwitchView
          checked={chaos.enabled}
          onChange={(v) => { logUiEvent('mock.chaos_toggle', { enabled: v, protocol: server.protocol }); update({ enabled: v }); }}
          accentColor="var(--color-error)"
          size="xs"
        />
      </div>

      {/* Config */}
      <div className="flex flex-col gap-2.5">
        {/* Fault type */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--color-text-muted)] w-[90px] flex-shrink-0">Fault type</span>
          <SelectInputView
            size="md"
            options={faultOptions}
            value={chaos.type ?? defaultFault}
            onChange={v => update({ type: v as FaultType })}
            accentColor="var(--color-error)"
          />
        </div>

        {/* Probability dial */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[var(--color-text-muted)]">Chaos probability</span>
            <span className="text-[13px] font-mono font-bold" style={{ color: probabilityColor(probability) }}>
              {probability}%
            </span>
          </div>
          <SliderView
            min={0} max={100} step={5}
            value={probability}
            onChange={(v) => update({ probability: v / 100 })}
            accentColor={probabilityColor(probability)}
            width="100%"
          />
          <div className="flex justify-between text-[9px] text-[var(--color-text-muted)] opacity-50">
            <span>0% (safe)</span>
            <span>50% (chaotic)</span>
            <span>100% (total chaos)</span>
          </div>
        </div>

        {/* Visual risk presets */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { label: 'Low (1-10%)', range: [1, 10], desc: 'Occasional hiccups' },
            { label: 'Medium (25-50%)', range: [25, 50], desc: 'Noticeable failures' },
            { label: 'High (75-100%)', range: [75, 100], desc: 'Most requests fail' },
          ].map(preset => (
            <ChipView
              key={preset.label}
              label={preset.label}
              color="var(--color-text-muted)"
              size="xs"
              active={false}
              onClick={() => update({ probability: preset.range[0] / 100 })}
            />
          ))}
        </div>

        {chaos.enabled && probability >= 50 && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <span className="text-[12px] flex-shrink-0">⚠️</span>
            <div>
              <p className="text-[10px] font-medium text-[var(--color-error)]">High chaos level active</p>
              <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                {probability}% of all {REALTIME_PROTOCOLS.has(protocol) ? 'messages/events' : 'requests'} will receive a {chaos.type?.replace(/_/g, ' ')} fault. Make sure this is intentional for chaos testing.
              </p>
            </div>
          </div>
        )}

        <GlobalRateLimitSection server={server} onUpdate={onUpdate} />
      </div>
    </div>
  );
}

function GlobalRateLimitSection({ server, onUpdate }: Props) {
  const rl = server.globalRateLimit ?? { enabled: false, requestsPerWindow: 1000, windowMs: 60000 };
  const update = (patch: Partial<typeof rl>) => {
    onUpdate({ globalRateLimit: { ...rl, ...patch } });
  };

  return (
    <div className="flex flex-col gap-2 pt-2 border-t border-[color-mix(in_srgb,var(--color-text-primary)_6%,transparent)]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide">Global Rate Limit</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--color-text-muted)]">Enable</span>
          <ToggleSwitchView
            checked={rl.enabled}
            onChange={(v) => update({ enabled: v })}
            accentColor="var(--color-warning)"
            size="xs"
          />
        </div>
      </div>
      {rl.enabled && (
        <div className="flex items-center gap-2 flex-wrap">
          <TextInputView
            type="number"
            value={String(rl.requestsPerWindow)}
            onChange={e => update({ requestsPerWindow: parseInt(e.target.value) || 1000 })}
            size="md"
            style={{ width: 80, fontFamily: 'monospace' }}
          />
          <span className="text-[10px] text-[var(--color-text-muted)]">requests per</span>
          <SelectInputView
            size="md"
            options={[{ value: '1000', label: 'second' }, { value: '60000', label: 'minute' }, { value: '3600000', label: 'hour' }]}
            value={String(rl.windowMs)}
            onChange={v => update({ windowMs: parseInt(v) })}
            accentColor="var(--color-warning)"
          />
          <span className="text-[10px] text-[var(--color-text-muted)]">globally across all routes</span>
        </div>
      )}
    </div>
  );
}

function probabilityColor(pct: number): string {
  if (pct <= 10) return 'var(--color-success)';
  if (pct <= 40) return 'var(--color-warning)';
  return 'var(--color-error)';
}
