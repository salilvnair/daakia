/**
 * AiChaosEngineeringModal — Sprint 14.2
 * AI designs a full chaos test plan: fault scenarios, order, probability, protocols, duration.
 * Generates risk matrix and resilience report.
 * Gate: chaosEngineeringPlanner feature flag
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';
import { ModalView, AIButtonView, MultilineInputView } from '@salilvnair/dui';

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

  return (
    <ModalView
      open
      onClose={onClose}
      title="Chaos Engineering Planner ✦"
      size="lg"
      headerColor={ACCENT}
      headerIcon={
        <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${ACCENT} 20%, transparent)` }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
        </div>
      }
      footerRight={
        <AIButtonView
          label={loading ? 'Planning…' : 'Generate Chaos Plan'}
          size="md"
          accentColor={ACCENT}
          disabled={!systemDesc.trim() || loading}
          loading={loading}
          onClick={handlePlan}
        />
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          Describe your system and AI designs a complete chaos test plan: fault scenarios, probabilities, risk matrix, and recovery checklist.
        </p>
        <MultilineInputView
          value={systemDesc}
          onChange={e => setSystemDesc(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handlePlan(); }}
          placeholder="e.g. E-commerce platform: REST product catalog, WebSocket real-time inventory, gRPC payment service, MQTT order notifications"
          rows={3}
          size="md"
          width="fw"
        />
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>Target:</span>
          {TARGETS.map(t => (
            <button key={t.id} type="button" onClick={() => setTarget(t.id)}
              className="h-[26px] px-2.5 rounded text-[11px] font-medium cursor-pointer"
              style={{ background: target === t.id ? ACCENT : 'transparent', color: target === t.id ? '#fff' : 'var(--color-text-muted)', border: `1px solid ${target === t.id ? ACCENT : 'var(--color-surface-border)'}` }}>
              {t.label}
            </button>
          ))}
        </div>
        {error && <p className="text-[11px] px-2.5 py-1.5 rounded" style={{ background: 'color-mix(in srgb, var(--color-error) 12%, transparent)', color: 'var(--color-error)' }}>{error}</p>}
        {result && <div className="rounded border p-3 overflow-y-auto" style={{ maxHeight: 380, borderColor: 'var(--color-surface-border)', background: 'var(--color-surface)' }}><MdViewer content={result} /></div>}
      </div>
    </ModalView>
  );
}
