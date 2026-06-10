/**
 * AiChaosEngineeringModal — Sprint 14.2
 * AI designs a full chaos test plan: fault scenarios, order, probability, protocols, duration.
 * Generates risk matrix and resilience report.
 * Gate: chaosEngineeringPlanner feature flag
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-warning)';

const SYSTEM_PROMPT = `You are a chaos engineering expert (Chaos Monkey principles). Design a complete chaos test plan for an API system.

Generate:
## Chaos Engineering Plan

### Fault Scenarios Table
| # | Fault Type | Target | Probability | Duration | Protocol |
|---|---|---|---|---|---|
...

Include these fault categories:
- Network faults: latency injection, packet loss, network partition
- Service faults: random errors (5xx), slow responses, connection drops
- Resource faults: CPU/memory pressure simulation
- Data faults: corrupt responses, missing required fields, type mismatches
- Auth faults: expired tokens, invalid signatures
- Protocol faults: malformed WebSocket frames, gRPC deadline exceeded, MQTT broker disconnect

### Risk Matrix
| Risk | Probability | Impact | Score |

### Execution Order
Recommended sequence with explanations of why this order is safest.

### Resilience Metrics
What to measure during each fault injection.

### Recovery Checklist
Steps to restore normal operation after each test.`;

type SystemTarget = 'rest' | 'websocket' | 'grpc' | 'mixed';

export function AiChaosEngineeringModal({ onClose }: Props) {
  const [systemDesc, setSystemDesc] = useState('');
  const [target, setTarget] = useState<SystemTarget>('mixed');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const streamRef = useRef('');

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStream:chunk') { streamRef.current += msg.chunk; setResult(streamRef.current); }
      else if (msg?.type === 'aiStream:done') { setResult(streamRef.current); setLoading(false); }
      else if (msg?.type === 'aiStream:error') { setError(msg.error || 'AI request failed'); setLoading(false); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handlePlan = useCallback(() => {
    if (!systemDesc.trim() || loading) return;
    streamRef.current = ''; setResult(''); setError(''); setLoading(true);
    postMsg({ type: 'aiStream', payload: {
      systemPrompt: SYSTEM_PROMPT,
      userMessage: `System: ${systemDesc.trim()}\nPrimary protocol target: ${target.toUpperCase()}\n\nGenerate a complete chaos engineering plan.`,
      templateKey: 'rest.request.fuzz',
    }});
  }, [systemDesc, target, loading]);

  const TARGETS: { id: SystemTarget; label: string }[] = [
    { id: 'rest', label: 'REST' }, { id: 'websocket', label: 'WebSocket' },
    { id: 'grpc', label: 'gRPC' }, { id: 'mixed', label: 'All Protocols' },
  ];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) e.preventDefault(); }}>
      <div className="relative flex flex-col rounded-lg overflow-hidden shadow-2xl"
        style={{ width: 620, maxHeight: '86vh', background: 'var(--color-bg-panel)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
          <span className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Chaos Engineering Planner ✦</span>
          <button type="button" onClick={onClose} className="ml-auto cursor-pointer" style={{ color: 'var(--color-text-muted)' }}><CloseIcon size={14} /></button>
        </div>
        <div className="flex flex-col gap-3 p-4 overflow-y-auto flex-1">
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            Describe your system and AI designs a complete chaos test plan: fault scenarios, probabilities, risk matrix, and recovery checklist.
          </p>
          <textarea value={systemDesc} onChange={e => setSystemDesc(e.target.value)}
            onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handlePlan(); if (e.key === 'Escape') onClose(); }}
            placeholder="e.g. E-commerce platform: REST product catalog, WebSocket real-time inventory, gRPC payment service, MQTT order notifications"
            rows={3} className="w-full rounded text-[11px] px-2.5 py-2 resize-none"
            style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>Target:</span>
            {TARGETS.map(t => (
              <button key={t.id} type="button" onClick={() => setTarget(t.id)}
                className="h-[26px] px-2.5 rounded text-[11px] font-medium cursor-pointer"
                style={{ background: target === t.id ? ACCENT : 'var(--color-bg-surface)', color: target === t.id ? '#fff' : 'var(--color-text-muted)', border: `1px solid ${target === t.id ? ACCENT : 'var(--color-border)'}` }}>
                {t.label}
              </button>
            ))}
            <button type="button" onClick={handlePlan} disabled={!systemDesc.trim() || loading}
              className="ml-auto flex items-center gap-1.5 h-[26px] px-3 rounded text-[11px] font-medium cursor-pointer disabled:opacity-40"
              style={{ background: ACCENT, color: '#fff' }}>
              {loading ? <span className="inline-block w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <SparkleIcon size={11} />}
              {loading ? 'Planning…' : 'Generate Chaos Plan'}
            </button>
          </div>
          {error && <p className="text-[11px] px-2.5 py-1.5 rounded" style={{ background: 'color-mix(in srgb, var(--color-error) 12%, transparent)', color: 'var(--color-error)' }}>{error}</p>}
          {result && <div className="rounded border p-3 overflow-y-auto" style={{ maxHeight: 380, borderColor: 'var(--color-border)', background: 'var(--color-bg-surface)' }}><MdViewer content={result} /></div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
