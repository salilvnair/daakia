/**
 * FaultInjectionPanel — Per-route fault injection controls (6A.13-6A.14).
 */
import { SelectInputView, DurationInputView, TextInputView, ToggleSwitchView, type SelectOption } from '@salilvnair/dui';
import { ChevronDownIcon } from '../../../icons';
import { useState } from 'react';
import type { MockRoute, FaultConfig, FaultType, RateLimitConfig } from '../mock-types';

const FAULT_TYPE_OPTIONS: SelectOption[] = [
  { value: '',               label: 'None (no fault)' },
  { value: 'RANDOM_5XX',    label: 'Random 5xx error' },
  { value: 'EMPTY_RESPONSE', label: 'Empty response' },
  { value: 'MALFORMED_JSON', label: 'Malformed JSON' },
  { value: 'TIMEOUT',        label: 'Timeout (never respond)' },
  { value: 'CONNECTION_RESET', label: 'Connection reset (TCP RST)' },
  { value: 'CHUNKED_DRIBBLE', label: 'Chunked dribble (partial body)' },
];

const WINDOW_OPTIONS: SelectOption[] = [
  { value: '1000', label: 'second' },
  { value: '60000', label: 'minute' },
  { value: '3600000', label: 'hour' },
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
                <ToggleSwitchView
                  checked={fault.enabled}
                  onChange={(v) => setFault({ enabled: v })}
                  accentColor="var(--color-error)"
                  size="xs"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <SelectInputView
                size="md"
                options={FAULT_TYPE_OPTIONS}
                value={fault.type ?? ''}
                onChange={v => setFault({ type: (v || undefined) as FaultType | undefined, enabled: !!v || fault.enabled })}
                accentColor="var(--color-error)"
              />
            </div>

            {/* Probability slider — kept as native range (no DUI slider component) */}
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
                <DurationInputView value={fault.delayMs ?? 0} onChange={ms => setFault({ delayMs: ms })} size="sm" />
              </div>
            )}

            {/* Random delay range */}
            {fault.type && fault.type !== 'TIMEOUT' && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--color-text-muted)] w-[80px] flex-shrink-0">Random delay</span>
                <TextInputView
                  type="number"
                  value={String(fault.randomDelayRange?.min ?? '')}
                  onChange={e => setFault({ randomDelayRange: { min: parseInt(e.target.value) || 0, max: fault.randomDelayRange?.max ?? 1000 } })}
                  placeholder="min ms"
                  size="md"
                  style={{ width: 70, fontFamily: 'monospace' }}
                />
                <span className="text-[10px] text-[var(--color-text-muted)]">–</span>
                <TextInputView
                  type="number"
                  value={String(fault.randomDelayRange?.max ?? '')}
                  onChange={e => setFault({ randomDelayRange: { min: fault.randomDelayRange?.min ?? 0, max: parseInt(e.target.value) || 1000 } })}
                  placeholder="max ms"
                  size="md"
                  style={{ width: 70, fontFamily: 'monospace' }}
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
                <ToggleSwitchView
                  checked={rateLimit.enabled}
                  onChange={(v) => setRateLimit({ enabled: v })}
                  accentColor="var(--color-warning)"
                  size="xs"
                />
              </div>
            </div>

            {rateLimit.enabled && (
              <div className="flex items-center gap-2 flex-wrap">
                <TextInputView
                  type="number"
                  value={String(rateLimit.requestsPerWindow)}
                  onChange={e => setRateLimit({ requestsPerWindow: parseInt(e.target.value) || 100 })}
                  size="md"
                  style={{ width: 70, fontFamily: 'monospace' }}
                />
                <span className="text-[10px] text-[var(--color-text-muted)]">requests per</span>
                <SelectInputView
                  size="md"
                  options={WINDOW_OPTIONS}
                  value={String(rateLimit.windowMs)}
                  onChange={v => setRateLimit({ windowMs: parseInt(v) })}
                  accentColor="var(--color-warning)"
                />
                <TextInputView
                  type="number"
                  value={rateLimit.burstAllowance != null ? String(rateLimit.burstAllowance) : ''}
                  onChange={e => setRateLimit({ burstAllowance: e.target.value ? parseInt(e.target.value) : undefined })}
                  placeholder="burst"
                  size="md"
                  style={{ width: 60, fontFamily: 'monospace' }}
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
