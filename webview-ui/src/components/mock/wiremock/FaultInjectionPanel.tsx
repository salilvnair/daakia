/**
 * FaultInjectionPanel — Per-route fault injection controls (6A.13-6A.14).
 */
import { StyledDropdown, DurationInput, type DropdownOption } from '../../shared';
import { ChevronDownIcon } from '../../../icons';
import { useState } from 'react';
import type { MockRoute, FaultConfig, FaultType, RateLimitConfig } from '../mock-types';

const MOCK_ACCENT = 'var(--color-mock-server)';

const FAULT_TYPE_OPTIONS: DropdownOption[] = [
  { value: '',               label: 'None (no fault)' },
  { value: 'RANDOM_5XX',    label: 'Random 5xx error' },
  { value: 'EMPTY_RESPONSE', label: 'Empty response' },
  { value: 'MALFORMED_JSON', label: 'Malformed JSON' },
  { value: 'TIMEOUT',        label: 'Timeout (never respond)' },
  { value: 'CONNECTION_RESET', label: 'Connection reset (TCP RST)' },
  { value: 'CHUNKED_DRIBBLE', label: 'Chunked dribble (partial body)' },
];

interface Props {
  route: MockRoute;
  onUpdate: (patch: Partial<MockRoute>) => void;
}

export function FaultInjectionPanel({ route, onUpdate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const fault = route.fault ?? { enabled: false };
  const rateLimit = route.rateLimit ?? { enabled: false, requestsPerWindow: 100, windowMs: 60000 };

  const setFault = (patch: Partial<FaultConfig>) => {
    onUpdate({ fault: { enabled: false, ...fault, ...patch } });
  };

  const setRateLimit = (patch: Partial<RateLimitConfig>) => {
    onUpdate({ rateLimit: { enabled: false, requestsPerWindow: 100, windowMs: 60000, ...rateLimit, ...patch } });
  };

  const hasFaultOrLimit = fault.enabled || rateLimit.enabled;

  return (
    <div className="border border-dashed border-[rgba(255,255,255,0.1)] rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left cursor-pointer hover:bg-[rgba(255,255,255,0.03)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="transition-transform duration-150 text-[var(--color-text-muted)]" style={{ display: 'inline-flex', transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
            <ChevronDownIcon size={12} />
          </span>
          <span className="text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Fault Injection & Rate Limiting</span>
          {hasFaultOrLimit && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--color-error)' }}>
              {fault.enabled && fault.type ? fault.type.replace(/_/g, ' ') : ''}{fault.enabled && rateLimit.enabled ? ' + ' : ''}{rateLimit.enabled ? 'RATE LIMITED' : ''}
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 flex flex-col gap-3 border-t border-[rgba(255,255,255,0.07)]">
          {/* Fault type */}
          <div className="flex flex-col gap-2 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide">Fault Type</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--color-text-muted)]">Enable</span>
                <button
                  type="button"
                  onClick={() => setFault({ enabled: !fault.enabled })}
                  className="relative w-[28px] h-[14px] rounded-full transition-colors cursor-pointer flex-shrink-0"
                  style={{ backgroundColor: fault.enabled ? 'var(--color-error)' : 'var(--color-muted-fallback)' }}
                >
                  <span className="absolute top-[2px] w-[10px] h-[10px] rounded-full bg-white transition-all" style={{ left: fault.enabled ? '16px' : '2px' }} />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <StyledDropdown
                size="sm"
                options={FAULT_TYPE_OPTIONS}
                value={fault.type ?? ''}
                onChange={v => setFault({ type: (v || undefined) as FaultType | undefined, enabled: !!v || fault.enabled })}
                accentColor="var(--color-error)"
              />
            </div>

            {/* Probability slider */}
            {fault.type && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--color-text-muted)] w-[80px] flex-shrink-0">Probability</span>
                <input
                  type="range"
                  min={0} max={100} step={5}
                  value={Math.round((fault.probability ?? 1.0) * 100)}
                  onChange={e => setFault({ probability: parseInt(e.target.value) / 100 })}
                  className="flex-1 cursor-pointer"
                />
                <span className="text-[11px] font-mono text-[var(--color-error)] w-[36px] text-right">
                  {Math.round((fault.probability ?? 1.0) * 100)}%
                </span>
              </div>
            )}

            {/* Additional delay */}
            {fault.type && fault.type !== 'TIMEOUT' && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--color-text-muted)] w-[80px] flex-shrink-0">Extra delay</span>
                <DurationInput value={fault.delayMs ?? 0} onChange={ms => setFault({ delayMs: ms })} />
              </div>
            )}

            {/* Random delay range */}
            {fault.type && fault.type !== 'TIMEOUT' && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--color-text-muted)] w-[80px] flex-shrink-0">Random delay</span>
                <input
                  type="number"
                  value={fault.randomDelayRange?.min ?? ''}
                  onChange={e => setFault({ randomDelayRange: { min: parseInt(e.target.value) || 0, max: fault.randomDelayRange?.max ?? 1000 } })}
                  placeholder="min ms"
                  className="w-[70px] h-[26px] px-2 text-[11px] rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] focus:outline-none"
                />
                <span className="text-[10px] text-[var(--color-text-muted)]">–</span>
                <input
                  type="number"
                  value={fault.randomDelayRange?.max ?? ''}
                  onChange={e => setFault({ randomDelayRange: { min: fault.randomDelayRange?.min ?? 0, max: parseInt(e.target.value) || 1000 } })}
                  placeholder="max ms"
                  className="w-[70px] h-[26px] px-2 text-[11px] rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Rate limiting (6A.14) */}
          <div className="flex flex-col gap-2 pt-1 border-t border-[rgba(255,255,255,0.06)]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[var(--color-text-muted)] font-medium uppercase tracking-wide">Rate Limiting</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--color-text-muted)]">Enable</span>
                <button
                  type="button"
                  onClick={() => setRateLimit({ enabled: !rateLimit.enabled })}
                  className="relative w-[28px] h-[14px] rounded-full transition-colors cursor-pointer flex-shrink-0"
                  style={{ backgroundColor: rateLimit.enabled ? 'var(--color-warning)' : 'var(--color-muted-fallback)' }}
                >
                  <span className="absolute top-[2px] w-[10px] h-[10px] rounded-full bg-white transition-all" style={{ left: rateLimit.enabled ? '16px' : '2px' }} />
                </button>
              </div>
            </div>

            {rateLimit.enabled && (
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="number"
                  value={rateLimit.requestsPerWindow}
                  onChange={e => setRateLimit({ requestsPerWindow: parseInt(e.target.value) || 100 })}
                  className="w-[70px] h-[26px] px-2 text-[11px] rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] focus:outline-none"
                />
                <span className="text-[10px] text-[var(--color-text-muted)]">requests per</span>
                <StyledDropdown
                  size="sm"
                  options={[
                    { value: '1000', label: 'second' },
                    { value: '60000', label: 'minute' },
                    { value: '3600000', label: 'hour' },
                  ]}
                  value={String(rateLimit.windowMs)}
                  onChange={v => setRateLimit({ windowMs: parseInt(v) })}
                  accentColor="var(--color-warning)"
                />
                <input
                  type="number"
                  value={rateLimit.burstAllowance ?? ''}
                  onChange={e => setRateLimit({ burstAllowance: e.target.value ? parseInt(e.target.value) : undefined })}
                  placeholder="burst"
                  className="w-[60px] h-[26px] px-2 text-[11px] rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-muted)] focus:outline-none"
                  title="Burst allowance (extra requests above limit)"
                />
              </div>
            )}
            {rateLimit.enabled && (
              <p className="text-[10px] text-[var(--color-text-muted)] opacity-60">
                Returns 429 Too Many Requests with Retry-After header when limit exceeded.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
