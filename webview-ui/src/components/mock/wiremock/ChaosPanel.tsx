/**
 * ChaosPanel — Global chaos engineering dial for the entire mock server (6A.15).
 * Applies probabilistic fault injection to ALL routes globally.
 */
import { useState } from 'react';
import { StyledDropdown, type DropdownOption } from '../../shared';
import type { MockServer, FaultType } from '../mock-types';

const MOCK_ACCENT = 'var(--color-mock-server)';

const FAULT_OPTIONS: DropdownOption[] = [
  { value: 'RANDOM_5XX',      label: 'Random 5xx Error' },
  { value: 'EMPTY_RESPONSE',  label: 'Empty Response' },
  { value: 'MALFORMED_JSON',  label: 'Malformed JSON' },
  { value: 'TIMEOUT',         label: 'Timeout' },
  { value: 'CONNECTION_RESET', label: 'Connection Reset' },
  { value: 'CHUNKED_DRIBBLE', label: 'Chunked Dribble' },
];

interface Props {
  server: MockServer;
  onUpdate: (patch: Partial<MockServer>) => void;
}

export function ChaosPanel({ server, onUpdate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const chaos = server.globalFault ?? { enabled: false };

  const update = (patch: Partial<typeof chaos>) => {
    onUpdate({ globalFault: { enabled: false, ...chaos, ...patch } });
  };

  const probability = Math.round((chaos.probability ?? 0.1) * 100);

  return (
    <div className="flex flex-col gap-3">
      {/* Header toggle */}
      <div className="flex items-center justify-between p-3 rounded-lg"
        style={{ background: chaos.enabled ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${chaos.enabled ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.08)'}` }}>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            {chaos.enabled && <span className="w-[6px] h-[6px] rounded-full bg-[var(--color-error)] animate-pulse" />}
            <span className="text-[12px] font-medium text-[var(--color-text-primary)]">
              {chaos.enabled ? `Chaos Mode — ${probability}% ${chaos.type?.replace(/_/g, ' ') ?? 'fault'} globally` : 'Chaos Mode Off'}
            </span>
          </div>
          <span className="text-[10px] text-[var(--color-text-muted)] opacity-70">
            Applies the selected fault to a percentage of ALL requests across all routes
          </span>
        </div>
        <button
          type="button"
          onClick={() => update({ enabled: !chaos.enabled })}
          className="relative w-[36px] h-[18px] rounded-full transition-colors cursor-pointer flex-shrink-0"
          style={{ backgroundColor: chaos.enabled ? 'var(--color-error)' : 'var(--color-muted-fallback)' }}
        >
          <span className="absolute top-[3px] w-[12px] h-[12px] rounded-full bg-white transition-all" style={{ left: chaos.enabled ? '22px' : '3px' }} />
        </button>
      </div>

      {/* Config */}
      <div className="flex flex-col gap-2.5">
        {/* Fault type */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--color-text-muted)] w-[90px] flex-shrink-0">Fault type</span>
          <StyledDropdown
            size="sm"
            options={FAULT_OPTIONS}
            value={chaos.type ?? 'RANDOM_5XX'}
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
          <input
            type="range"
            min={0} max={100} step={5}
            value={probability}
            onChange={e => update({ probability: parseInt(e.target.value) / 100 })}
            className="w-full cursor-pointer"
            style={{ accentColor: probabilityColor(probability) }}
          />
          <div className="flex justify-between text-[9px] text-[var(--color-text-muted)] opacity-50">
            <span>0% (safe)</span>
            <span>50% (chaotic)</span>
            <span>100% (total chaos)</span>
          </div>
        </div>

        {/* Visual risk indicator */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { label: 'Low (1-10%)', range: [1, 10], desc: 'Occasional hiccups' },
            { label: 'Medium (25-50%)', range: [25, 50], desc: 'Noticeable failures' },
            { label: 'High (75-100%)', range: [75, 100], desc: 'Most requests fail' },
          ].map(preset => (
            <button
              key={preset.label}
              type="button"
              onClick={() => update({ probability: preset.range[0] / 100 })}
              title={preset.desc}
              className="h-[22px] px-2 text-[9px] rounded-full cursor-pointer transition-colors"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--color-text-muted)' }}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Warning banner when high */}
        {chaos.enabled && probability >= 50 && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <span className="text-[12px] flex-shrink-0">⚠️</span>
            <div>
              <p className="text-[10px] font-medium text-[var(--color-error)]">High chaos level active</p>
              <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                {probability}% of all requests will receive a {chaos.type?.replace(/_/g, ' ')} fault. Make sure this is intentional for chaos testing.
              </p>
            </div>
          </div>
        )}

        {/* Global rate limiting */}
        <GlobalRateLimitSection server={server} onUpdate={onUpdate} />
      </div>
    </div>
  );
}

function GlobalRateLimitSection({ server, onUpdate }: Props) {
  const rl = server.globalRateLimit ?? { enabled: false, requestsPerWindow: 1000, windowMs: 60000 };
  const update = (patch: Partial<typeof rl>) => {
    onUpdate({ globalRateLimit: { enabled: false, requestsPerWindow: 1000, windowMs: 60000, ...rl, ...patch } });
  };

  return (
    <div className="flex flex-col gap-2 pt-2 border-t border-[rgba(255,255,255,0.06)]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide">Global Rate Limit</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--color-text-muted)]">Enable</span>
          <button
            type="button"
            onClick={() => update({ enabled: !rl.enabled })}
            className="relative w-[28px] h-[14px] rounded-full transition-colors cursor-pointer flex-shrink-0"
            style={{ backgroundColor: rl.enabled ? 'var(--color-warning)' : 'var(--color-muted-fallback)' }}
          >
            <span className="absolute top-[2px] w-[10px] h-[10px] rounded-full bg-white transition-all" style={{ left: rl.enabled ? '16px' : '2px' }} />
          </button>
        </div>
      </div>
      {rl.enabled && (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="number"
            value={rl.requestsPerWindow}
            onChange={e => update({ requestsPerWindow: parseInt(e.target.value) || 1000 })}
            className="w-[80px] h-[26px] px-2 text-[11px] rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] focus:outline-none"
          />
          <span className="text-[10px] text-[var(--color-text-muted)]">requests per</span>
          <StyledDropdown
            size="sm"
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
