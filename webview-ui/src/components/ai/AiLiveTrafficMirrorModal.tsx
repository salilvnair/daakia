/**
 * AiLiveTrafficMirrorModal — Sprint 14.6
 * Proxy mode: mirror real API traffic into Daakia across all protocols.
 * AI analyses patterns in real-time, auto-updates mocks, flags anomalies.
 * Gate: liveTrafficMirror feature flag
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-ai)';

const SYSTEM_PROMPT = `You are an API traffic analysis expert. Analyze the provided API traffic description and:

1. **Pattern Detection**: Identify recurring request patterns, correlation between endpoints, session flows
2. **Anomaly Detection**: Flag unusual traffic patterns, error spikes, unexpected request sequences
3. **Mock Generation**: Generate mock rules that represent observed traffic patterns
4. **Performance Analysis**: Identify slow endpoints, high-frequency requests, potential bottlenecks

Format output as:

## Traffic Analysis Report

### Observed Patterns
Description of the main traffic patterns with frequencies.

### Anomalies Detected
| Anomaly | Severity | Frequency | Recommended Action |

### Auto-Generated Mock Rules
\`\`\`json
{
  "rules": [
    {"path": "/api/...", "method": "GET", "response": {...}, "conditions": {...}}
  ]
}
\`\`\`

### Performance Insights
Latency issues and optimization recommendations.

### Real-Time Alerts Configured
What conditions would trigger alerts in a live session.`;

type MirrorStatus = 'idle' | 'configuring' | 'active' | 'analyzing';

export function AiLiveTrafficMirrorModal({ onClose }: Props) {
  const [proxyPort, setProxyPort] = useState('8888');
  const [targetUrl, setTargetUrl] = useState('');
  const [trafficLog, setTrafficLog] = useState('');
  const [analysis, setAnalysis] = useState('');
  const [status, setStatus] = useState<MirrorStatus>('idle');
  const [error, setError] = useState('');
  const streamRef = useRef('');

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStream:chunk') { streamRef.current += msg.chunk; setAnalysis(streamRef.current); }
      else if (msg?.type === 'aiStream:done') { setAnalysis(streamRef.current); setStatus('idle'); }
      else if (msg?.type === 'aiStream:error') { setError(msg.error || 'AI request failed'); setStatus('idle'); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleStartMirror = useCallback(() => {
    if (!targetUrl.trim()) return;
    setStatus('active');
    postMsg({ type: 'startTrafficMirror', proxyPort: parseInt(proxyPort, 10), targetUrl: targetUrl.trim() });
  }, [proxyPort, targetUrl]);

  const handleAnalyzeTraffic = useCallback(() => {
    if (!trafficLog.trim()) return;
    streamRef.current = ''; setAnalysis(''); setError(''); setStatus('analyzing');
    postMsg({ type: 'aiStream', payload: {
      systemPrompt: SYSTEM_PROMPT,
      userMessage: `Traffic log to analyze:\n${trafficLog.trim()}`,
      templateKey: 'platform.mock.intelligence',
    }});
  }, [trafficLog]);

  const STATUS_COLORS: Record<MirrorStatus, string> = {
    idle: 'var(--color-text-muted)',
    configuring: 'var(--color-warning)',
    active: 'var(--color-success)',
    analyzing: ACCENT,
  };

  const STATUS_LABELS: Record<MirrorStatus, string> = {
    idle: 'Idle',
    configuring: 'Configuring…',
    active: 'Mirroring',
    analyzing: 'Analyzing…',
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) e.preventDefault(); }}>
      <div className="relative flex flex-col rounded-lg overflow-hidden shadow-2xl"
        style={{ width: 640, maxHeight: '88vh', background: 'var(--color-bg-panel)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
          <span className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Live Traffic Mirror & AI Analysis ✦</span>
          <span className="flex items-center gap-1 ml-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_COLORS[status] }} />
            <span className="text-[10px]" style={{ color: STATUS_COLORS[status] }}>{STATUS_LABELS[status]}</span>
          </span>
          <button type="button" onClick={onClose} className="ml-auto cursor-pointer" style={{ color: 'var(--color-text-muted)' }}><CloseIcon size={14} /></button>
        </div>

        <div className="flex flex-col gap-3 p-4 overflow-y-auto flex-1">
          {/* Proxy config */}
          <div className="rounded p-3 flex flex-col gap-2" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)' }}>
            <p className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>Proxy Configuration</p>
            <div className="flex gap-2 items-center">
              <div className="flex flex-col gap-1">
                <label className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Proxy Port</label>
                <input type="number" value={proxyPort} onChange={e => setProxyPort(e.target.value)}
                  className="h-[26px] px-2.5 rounded text-[11px] w-[80px]"
                  style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
              </div>
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Target URL</label>
                <input type="url" value={targetUrl} onChange={e => setTargetUrl(e.target.value)}
                  placeholder="https://api.example.com"
                  className="h-[26px] px-2.5 rounded text-[11px] flex-1"
                  style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
              </div>
              <button type="button" onClick={handleStartMirror} disabled={!targetUrl.trim() || status === 'active'}
                className="flex items-center gap-1.5 h-[26px] px-3 rounded text-[11px] font-medium cursor-pointer disabled:opacity-40 mt-4"
                style={{ background: status === 'active' ? 'var(--color-success)' : ACCENT, color: '#fff' }}>
                {status === 'active' ? 'Mirroring' : 'Start Mirror'}
              </button>
            </div>
          </div>

          {/* Traffic log + AI analysis */}
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              Traffic Log (paste captured traffic or use live feed)
            </label>
            <textarea value={trafficLog} onChange={e => setTrafficLog(e.target.value)}
              placeholder="Paste traffic log entries here... (format: METHOD URL STATUS LATENCY)"
              rows={4} className="w-full rounded text-[11px] px-2.5 py-2 resize-none"
              style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }} />
            <div className="flex justify-end">
              <button type="button" onClick={handleAnalyzeTraffic} disabled={!trafficLog.trim() || status === 'analyzing'}
                className="flex items-center gap-1.5 h-[26px] px-3 rounded text-[11px] font-medium cursor-pointer disabled:opacity-40"
                style={{ background: ACCENT, color: '#fff' }}>
                {status === 'analyzing' ? <span className="inline-block w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <SparkleIcon size={11} />}
                {status === 'analyzing' ? 'Analyzing…' : 'Analyze with AI'}
              </button>
            </div>
          </div>

          {error && <p className="text-[11px] px-2.5 py-1.5 rounded" style={{ background: 'color-mix(in srgb, var(--color-error) 12%, transparent)', color: 'var(--color-error)' }}>{error}</p>}
          {analysis && <div className="rounded border p-3 overflow-y-auto" style={{ maxHeight: 320, borderColor: 'var(--color-border)', background: 'var(--color-bg-surface)' }}><MdViewer content={analysis} /></div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
