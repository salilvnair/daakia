/**
 * AiLiveTrafficMirrorModal — Sprint 14.6
 * Proxy mode: mirror real API traffic into Daakia across all protocols.
 * AI analyses patterns in real-time, auto-updates mocks, flags anomalies.
 * Gate: liveTrafficMirror feature flag
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';
import { ModalView, AIButtonView, TextInputView, MultilineInputView, ButtonView } from '@salilvnair/dui';

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

  return (
    <ModalView
      open
      onClose={onClose}
      title="Live Traffic Mirror & AI Analysis"
      subtitle={
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[status] }} />
          <span style={{ color: STATUS_COLORS[status] }}>{STATUS_LABELS[status]}</span>
        </span>
      }
      size="lg"
      headerColor={ACCENT}
      headerIcon={
        <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${ACCENT} 20%, transparent)` }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
        </div>
      }
      footerRight={
        <AIButtonView
          label={status === 'analyzing' ? 'Analyzing…' : 'Analyze with AI'}
          size="md"
          accentColor={ACCENT}
          disabled={!trafficLog.trim() || status === 'analyzing'}
          loading={status === 'analyzing'}
          onClick={handleAnalyzeTraffic}
        />
      }
    >
      <div className="flex flex-col gap-3">
        {/* Proxy config */}
        <div className="rounded p-3 flex flex-col gap-2" style={{ background: 'var(--color-panel)', border: '1px solid var(--color-surface-border)' }}>
          <p className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>Proxy Configuration</p>
          <div className="flex gap-2 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Proxy Port</label>
              <TextInputView
                value={proxyPort}
                onChange={e => setProxyPort(e.target.value)}
                size="md"
                width="fw"
                placeholder="8888"
              />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Target URL</label>
              <TextInputView
                value={targetUrl}
                onChange={e => setTargetUrl(e.target.value)}
                placeholder="https://api.example.com"
                size="md"
                width="fw"
              />
            </div>
            <ButtonView
              size="md"
              variant="primary"
              accentColor={status === 'active' ? 'var(--color-success)' : ACCENT}
              disabled={!targetUrl.trim() || status === 'active'}
              onClick={handleStartMirror}
            >
              {status === 'active' ? 'Mirroring' : 'Start Mirror'}
            </ButtonView>
          </div>
        </div>

        {/* Traffic log */}
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            Traffic Log (paste captured traffic or use live feed)
          </label>
          <MultilineInputView
            value={trafficLog}
            onChange={e => setTrafficLog(e.target.value)}
            placeholder="Paste traffic log entries here... (format: METHOD URL STATUS LATENCY)"
            rows={4}
            size="md"
            width="fw"
          />
        </div>

        {error && <p className="text-[11px] px-2.5 py-1.5 rounded" style={{ background: 'color-mix(in srgb, var(--color-error) 12%, transparent)', color: 'var(--color-error)' }}>{error}</p>}
        {analysis && <div className="rounded border p-3 overflow-y-auto" style={{ maxHeight: 320, borderColor: 'var(--color-surface-border)', background: 'var(--color-surface)' }}><MdViewer content={analysis} /></div>}
      </div>
    </ModalView>
  );
}
