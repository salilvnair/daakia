/**
 * AiAdaptiveLoadTesterModal — Sprint 11.8
 * AI ramps load dynamically: starts low, increases until errors appear, backs off
 * to find exact breaking point. Generates performance report with latency graphs
 * and bottleneck analysis.
 * Gate: adaptiveLoadTester feature flag
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';
import { ModalView, AIButtonView, SelectTextInputView, TextInputView } from '../../dui';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-method-post)';

const SYSTEM_PROMPT = `You are a performance engineering expert specializing in adaptive load testing. Design a complete adaptive load test plan for the given API endpoint.

Generate:

## Adaptive Load Test Plan

### Target Configuration
- URL, Method, Headers, Payload (if POST/PUT)
- Success criteria: status 200, response < Xms

### Load Ramp Strategy
| Stage | Concurrent Users | Duration | Success Threshold | Action on Failure |
|---|---|---|---|---|
| Warm-up | 1-5 | 30s | 100% | Continue |
| Ramp | 5-50 | 2min | >98% | Continue |
| Stress | 50-200 | 5min | >95% | Reduce 50% |
| Spike | 200-500 | 1min | >90% | Stop & analyze |
| Recovery | Ramp down | 2min | >99% | Confirm recovery |

### Breaking Point Detection Algorithm
How to identify the exact breaking point using binary search between passing and failing loads.

### Performance Metrics to Capture
- P50, P95, P99 latency
- Error rate per stage
- Throughput (RPS)
- Connection pool exhaustion

### Expected Report Format
What the final performance report will include.

### AI Analysis Framework
How AI will classify bottlenecks: CPU-bound, memory-bound, DB-bound, network-bound, or application-level.

### Remediation Suggestions
Template for bottleneck-specific recommendations based on observed patterns.`;

type LoadStage = { label: string; users: string; duration: string; done: boolean };

const METHOD_OPTIONS = [
  { value: 'GET',    color: 'var(--color-method-get)' },
  { value: 'POST',   color: 'var(--color-method-post)' },
  { value: 'PUT',    color: 'var(--color-method-put)' },
  { value: 'PATCH',  color: 'var(--color-method-patch)' },
  { value: 'DELETE', color: 'var(--color-method-delete)' },
];

export function AiAdaptiveLoadTesterModal({ onClose }: Props) {
  const [endpoint, setEndpoint] = useState('');
  const [method, setMethod] = useState('GET');
  const [maxUsers, setMaxUsers] = useState('200');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stages, setStages] = useState<LoadStage[]>([]);
  const streamRef = useRef('');

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStream:chunk') { streamRef.current += msg.chunk; setResult(streamRef.current); }
      else if (msg?.type === 'aiStream:done') { setResult(streamRef.current); setLoading(false); }
      else if (msg?.type === 'aiStream:error') { setError(msg.error || 'AI request failed'); setLoading(false); }
      else if (msg?.type === 'adaptiveLoadStage') {
        setStages(prev => [...prev, { label: msg.stage, users: msg.users, duration: msg.duration, done: false }]);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handlePlan = useCallback(() => {
    if (!endpoint.trim() || loading) return;
    streamRef.current = ''; setResult(''); setError(''); setStages([]); setLoading(true);
    postMsg({ type: 'aiStream', payload: {
      systemPrompt: SYSTEM_PROMPT,
      userMessage: `Endpoint: ${method} ${endpoint.trim()}\nMax concurrent users: ${maxUsers}\n\nDesign an adaptive load test plan that finds the exact breaking point.`,
      templateKey: 'rest.preflight',
    }});
  }, [endpoint, method, maxUsers, loading]);

  return (
    <ModalView
      open
      onClose={onClose}
      title="Adaptive Load Tester ✦"
      size="md"
      headerColor={ACCENT}
      headerIcon={
        <div style={{
          width: 26, height: 26, borderRadius: 6, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'color-mix(in srgb, var(--color-method-post) 18%, transparent)',
        }}>
          <SparkleIcon size={13} style={{ color: ACCENT }} />
        </div>
      }
      footerRight={
        <AIButtonView
          label={loading ? 'Planning…' : 'Generate Load Plan'}
          size="sm"
          accentColor={ACCENT}
          disabled={!endpoint.trim() || loading}
          onClick={handlePlan}
        />
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>
          AI ramps load dynamically to find the exact breaking point. Generates performance report with P50/P95/P99 latency, bottleneck analysis, and remediation suggestions.
        </p>

        {/* Method + endpoint */}
        <SelectTextInputView
          selectValue={method}
          selectOptions={METHOD_OPTIONS}
          onSelectChange={setMethod}
          inputValue={endpoint}
          onInputChange={setEndpoint}
          placeholder="https://api.example.com/endpoint"
          accentColor={METHOD_OPTIONS.find(o => o.value === method)?.color ?? ACCENT}
          size="md"
          onKeyDown={e => { if (e.key === 'Enter') handlePlan(); if (e.key === 'Escape') onClose(); }}
        />

        {/* Max users */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 11, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>Max users:</label>
          <TextInputView
            type="number"
            value={maxUsers}
            onChange={e => setMaxUsers(e.target.value)}
            size="md"
            style={{ width: 80 }}
          />
        </div>

        {stages.length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            {stages.map((s, i) => (
              <div key={i} style={{
                flex: 1, borderRadius: 6, padding: 8, textAlign: 'center',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-surface-border)',
              }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: ACCENT }}>{s.label}</div>
                <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{s.users} users</div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <p style={{
            fontSize: 11, padding: '6px 10px', borderRadius: 6, margin: 0,
            background: 'color-mix(in srgb, var(--color-error) 12%, transparent)',
            color: 'var(--color-error)',
          }}>
            {error}
          </p>
        )}

        {result && (
          <div style={{
            borderRadius: 8, padding: 12, overflowY: 'auto', maxHeight: 360,
            border: '1px solid var(--color-surface-border)',
            background: 'var(--color-surface)',
          }}>
            <MdViewer content={result} />
          </div>
        )}
      </div>
    </ModalView>
  );
}
