/**
 * AiAdaptiveLoadTesterModal — Sprint 11.8
 * AI ramps load dynamically: starts low, increases until errors appear, backs off
 * to find exact breaking point. Generates performance report with latency graphs
 * and bottleneck analysis.
 * Gate: adaptiveLoadTester feature flag
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-rest)';

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

export function AiAdaptiveLoadTesterModal({ onClose }: Props) {
  const [endpoint, setEndpoint] = useState('');
  const [method, setMethod] = useState('GET');
  const [maxUsers, setMaxUsers] = useState('200');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stages, setStages] = useState<LoadStage[]>([]);
  const streamRef = useRef('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

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

  const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) e.preventDefault(); }}>
      <div className="relative flex flex-col rounded-lg overflow-hidden shadow-2xl"
        style={{ width: 620, maxHeight: '86vh', background: 'var(--color-bg-panel)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
          <span className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Adaptive Load Tester ✦</span>
          <button type="button" onClick={onClose} className="ml-auto cursor-pointer" style={{ color: 'var(--color-text-muted)' }}><CloseIcon size={14} /></button>
        </div>
        <div className="flex flex-col gap-3 p-4 overflow-y-auto flex-1">
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            AI ramps load dynamically to find the exact breaking point. Generates performance report with P50/P95/P99 latency, bottleneck analysis, and remediation suggestions.
          </p>
          <div className="flex gap-2 items-center">
            <div className="flex gap-0.5 rounded overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
              {METHODS.map(m => (
                <button key={m} type="button" onClick={() => setMethod(m)}
                  className="h-[26px] px-2 text-[10px] font-mono font-medium cursor-pointer transition-colors"
                  style={{ background: method === m ? ACCENT : 'var(--color-bg-surface)', color: method === m ? '#fff' : 'var(--color-text-muted)' }}>
                  {m}
                </button>
              ))}
            </div>
            <input ref={inputRef} type="text" value={endpoint} onChange={e => setEndpoint(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handlePlan(); if (e.key === 'Escape') onClose(); }}
              placeholder="https://api.example.com/endpoint"
              className="h-[26px] px-2.5 rounded text-[11px] flex-1"
              style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>Max users:</label>
              <input type="number" value={maxUsers} onChange={e => setMaxUsers(e.target.value)}
                className="h-[26px] px-2.5 rounded text-[11px] w-[70px]"
                style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
            </div>
            <button type="button" onClick={handlePlan} disabled={!endpoint.trim() || loading}
              className="ml-auto flex items-center gap-1.5 h-[26px] px-3 rounded text-[11px] font-medium cursor-pointer disabled:opacity-40"
              style={{ background: ACCENT, color: '#fff' }}>
              {loading ? <span className="inline-block w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <SparkleIcon size={11} />}
              {loading ? 'Planning…' : 'Generate Load Plan'}
            </button>
          </div>

          {stages.length > 0 && (
            <div className="flex gap-2">
              {stages.map((s, i) => (
                <div key={i} className="flex-1 rounded p-2 text-center" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)' }}>
                  <div className="text-[10px] font-medium" style={{ color: ACCENT }}>{s.label}</div>
                  <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{s.users} users</div>
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-[11px] px-2.5 py-1.5 rounded" style={{ background: 'color-mix(in srgb, var(--color-error) 12%, transparent)', color: 'var(--color-error)' }}>{error}</p>}
          {result && <div className="rounded border p-3 overflow-y-auto" style={{ maxHeight: 360, borderColor: 'var(--color-border)', background: 'var(--color-bg-surface)' }}><MdViewer content={result} /></div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
