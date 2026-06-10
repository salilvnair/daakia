/**
 * AiAdaptiveMockLearningModal — Sprint 14.4
 * Point at real API, hit Record for N minutes. AI observes traffic and builds
 * an intelligent mock that generalises to unseen inputs (interpolates from patterns).
 * Go offline — mock handles it.
 * Gate: adaptiveMockLearning feature flag
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';

interface Props {
  onClose: () => void;
  onApply?: (rules: string) => void;
}

const ACCENT = 'var(--color-protocol-ai)';

const SYSTEM_PROMPT = `You are an AI mock intelligence expert. Based on observed API traffic patterns, generate intelligent mock rules that:

1. Cover all observed endpoint patterns
2. Interpolate for unseen inputs using pattern matching
3. Handle edge cases gracefully
4. Include realistic response data variations

Generate mock rules in this JSON format:
\`\`\`json
{
  "routes": [
    {
      "method": "GET",
      "path": "/api/users/:id",
      "response": {
        "status": 200,
        "body": {"id": "{{id}}", "name": "Mock User {{id}}", "email": "user{{id}}@example.com"}
      },
      "matchers": [{"field": "id", "type": "regex", "pattern": "\\\\d+"}],
      "delay": 50
    }
  ],
  "scenarios": [
    {"name": "Error state", "condition": "status != 200", "response": {"status": 500}}
  ]
}
\`\`\`

Generate rules that generalise: use template variables ({{field}}) for dynamic data, regex matchers for ID patterns, and include realistic value ranges based on observed traffic.`;

type LearningStatus = 'idle' | 'recording' | 'processing' | 'done';

export function AiAdaptiveMockLearningModal({ onClose, onApply }: Props) {
  const [targetUrl, setTargetUrl] = useState('');
  const [duration, setDuration] = useState('5');
  const [trafficSample, setTrafficSample] = useState('');
  const [result, setResult] = useState('');
  const [status, setStatus] = useState<LearningStatus>('idle');
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const streamRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStream:chunk') { streamRef.current += msg.chunk; setResult(streamRef.current); }
      else if (msg?.type === 'aiStream:done') { setResult(streamRef.current); setStatus('done'); }
      else if (msg?.type === 'aiStream:error') { setError(msg.error || 'AI request failed'); setStatus('idle'); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleStartRecording = useCallback(() => {
    if (!targetUrl.trim()) return;
    setStatus('recording');
    setElapsed(0);
    const maxMs = parseInt(duration, 10) * 60_000;
    let ms = 0;
    timerRef.current = setInterval(() => {
      ms += 1000;
      setElapsed(ms);
      if (ms >= maxMs) {
        clearInterval(timerRef.current!);
        handleAnalyze();
      }
    }, 1000);
    postMsg({ type: 'startTrafficCapture', targetUrl: targetUrl.trim(), durationMs: maxMs });
  }, [targetUrl, duration]);

  const handleAnalyze = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    streamRef.current = ''; setResult(''); setError(''); setStatus('processing');
    const sample = trafficSample.trim() || `Traffic captured from ${targetUrl} for ${duration} minutes`;
    postMsg({ type: 'aiStream', payload: {
      systemPrompt: SYSTEM_PROMPT,
      userMessage: `Target API: ${targetUrl}\nCapture duration: ${duration} minutes\n\nObserved traffic sample:\n${sample}`,
      templateKey: 'platform.mock.intelligence',
    }});
  }, [trafficSample, targetUrl, duration]);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const durationSecs = parseInt(duration, 10) * 60;
  const progress = status === 'recording' ? Math.min((elapsed / 1000) / durationSecs, 1) : 0;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) e.preventDefault(); }}>
      <div className="relative flex flex-col rounded-lg overflow-hidden shadow-2xl"
        style={{ width: 580, maxHeight: '86vh', background: 'var(--color-bg-panel)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
          <span className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Adaptive Mock Learning ✦</span>
          <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wide"
            style={{ background: status === 'recording' ? 'color-mix(in srgb, var(--color-error) 15%, transparent)' : 'color-mix(in srgb, var(--color-protocol-ai) 15%, transparent)',
              color: status === 'recording' ? 'var(--color-error)' : ACCENT }}>
            {status === 'recording' ? 'Recording' : status === 'processing' ? 'Analyzing' : status === 'done' ? 'Done' : 'Idle'}
          </span>
          <button type="button" onClick={onClose} className="ml-auto cursor-pointer" style={{ color: 'var(--color-text-muted)' }}><CloseIcon size={14} /></button>
        </div>

        <div className="flex flex-col gap-3 p-4 overflow-y-auto flex-1">
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            Point at a real API and record traffic. AI learns request/response patterns and builds an intelligent mock that generalizes to unseen inputs.
          </p>

          <div className="flex gap-2 items-center">
            <input type="url" value={targetUrl} onChange={e => setTargetUrl(e.target.value)}
              placeholder="https://api.example.com"
              disabled={status === 'recording'}
              className="h-[26px] px-2.5 rounded text-[11px] flex-1"
              style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
            <div className="flex items-center gap-1.5 shrink-0">
              <label className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>Minutes:</label>
              <input type="number" value={duration} onChange={e => setDuration(e.target.value)} min={1} max={60}
                disabled={status === 'recording'}
                className="h-[26px] px-2.5 rounded text-[11px] w-[60px]"
                style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
            </div>
          </div>

          {status === 'idle' && (
            <div className="flex gap-2">
              <button type="button" onClick={handleStartRecording} disabled={!targetUrl.trim()}
                className="flex items-center gap-1.5 h-[26px] px-3 rounded text-[11px] font-medium cursor-pointer disabled:opacity-40"
                style={{ background: 'var(--color-error)', color: '#fff' }}>
                Record Traffic
              </button>
              <span className="text-[11px] mt-auto" style={{ color: 'var(--color-text-muted)' }}>or paste traffic sample below and click Analyze</span>
            </div>
          )}

          {status === 'recording' && (
            <div className="flex flex-col gap-2">
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${progress * 100}%`, background: 'var(--color-error)' }} />
              </div>
              <div className="flex justify-between">
                <span className="text-[10px]" style={{ color: 'var(--color-error)' }}>Recording… {Math.floor(elapsed / 1000)}s / {durationSecs}s</span>
                <button type="button" onClick={handleAnalyze}
                  className="h-[22px] px-2.5 rounded text-[10px] font-medium cursor-pointer"
                  style={{ background: ACCENT, color: '#fff' }}>Stop & Analyze</button>
              </div>
            </div>
          )}

          {(status === 'idle' || status === 'done') && (
            <div className="flex flex-col gap-2">
              <label className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>Or paste traffic sample manually:</label>
              <textarea value={trafficSample} onChange={e => setTrafficSample(e.target.value)}
                placeholder="GET /api/users 200 45ms&#10;POST /api/orders 201 120ms&#10;GET /api/users/123 200 30ms"
                rows={3} className="w-full rounded text-[11px] px-2.5 py-2 resize-none"
                style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }} />
              <div className="flex justify-end">
                <button type="button" onClick={handleAnalyze} disabled={status === 'processing'}
                  className="flex items-center gap-1.5 h-[26px] px-3 rounded text-[11px] font-medium cursor-pointer disabled:opacity-40"
                  style={{ background: ACCENT, color: '#fff' }}>
                  <SparkleIcon size={11} />
                  Analyze & Build Mock
                </button>
              </div>
            </div>
          )}

          {status === 'processing' && !result && (
            <div className="flex items-center gap-2 py-3 justify-center">
              <span className="inline-block w-4 h-4 border-2 border-[var(--color-protocol-ai)] border-t-transparent rounded-full animate-spin" />
              <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>AI learning patterns and generating mock rules…</span>
            </div>
          )}

          {error && <p className="text-[11px] px-2.5 py-1.5 rounded" style={{ background: 'color-mix(in srgb, var(--color-error) 12%, transparent)', color: 'var(--color-error)' }}>{error}</p>}

          {result && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>Generated Mock Rules</span>
                {onApply && (
                  <button type="button" onClick={() => { onApply(result); onClose(); }}
                    className="h-[22px] px-2.5 rounded text-[10px] font-medium cursor-pointer"
                    style={{ background: 'var(--color-success)', color: '#fff' }}>Apply Rules</button>
                )}
              </div>
              <div className="rounded border p-3 overflow-y-auto" style={{ maxHeight: 280, borderColor: 'var(--color-border)', background: 'var(--color-bg-surface)' }}>
                <MdViewer content={result} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
