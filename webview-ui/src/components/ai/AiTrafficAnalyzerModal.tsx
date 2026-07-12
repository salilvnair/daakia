/**
 * AiTrafficAnalyzerModal — AI analyzes a realtime protocol message stream.
 * Generic across WebSocket (9.9), SSE (9.15), MQTT — (not used), Socket.IO (9.28).
 *
 * Analyzes: schema detection, patterns, anomalies, frequency, field evolution.
 * Gates: wsTrafficAnalyzer / sseTrafficAnalyzer / sioTrafficAnalyzer feature flags.
 */
import { useState, useRef, useEffect } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';
import { ModalView, AIButtonView } from '@salilvnair/dui';

interface Props {
  protocol: 'websocket' | 'sse' | 'socketio';
  messages: string[];
  onClose: () => void;
}

const ACCENT_MAP: Record<string, string> = {
  websocket: 'var(--color-protocol-websocket)',
  sse: 'var(--color-protocol-sse)',
  socketio: 'var(--color-protocol-sse)',
};

const PROTOCOL_LABEL: Record<string, string> = {
  websocket: 'WebSocket',
  sse: 'SSE',
  socketio: 'Socket.IO',
};

function buildPrompt(protocol: string, messages: string[]): string {
  const sample = messages.slice(-40).join('\n---\n').slice(0, 3000);
  return `You are a realtime API expert. Analyze this ${PROTOCOL_LABEL[protocol]} message stream and provide:

1. **Schema Detection** — what data structure(s) are being sent/received (infer field names, types)
2. **Message Patterns** — recurring patterns, sequences, or state machines
3. **Anomalies** — unexpected messages, missing fields, error states
4. **Frequency Analysis** — message rate, bursts, timeouts (if timestamps available)
5. **Recommendations** — what to watch for, potential issues, optimization suggestions

Message stream (last ${messages.slice(-40).length} messages):
${sample}`;
}

export function AiTrafficAnalyzerModal({ protocol, messages, onClose }: Props) {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const getTemplate = useAiPromptTemplatesStore(s => s.resolve);
  const [analysis, setAnalysis] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const streamRef = useRef('');
  const ACCENT = ACCENT_MAP[protocol] || 'var(--color-protocol-ai)';
  const LABEL = PROTOCOL_LABEL[protocol] || protocol;

  useEffect(() => {
    if (messages.length > 0) startAnalysis();
  }, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStream:chunk') {
        streamRef.current += msg.chunk;
        setAnalysis(streamRef.current);
      } else if (msg?.type === 'aiStream:done') {
        setLoading(false);
      } else if (msg?.type === 'aiStream:error') {
        setError(msg.error || 'AI request failed');
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const startAnalysis = () => {
    if (!activeTab || loading || messages.length === 0) return;
    const prompt = buildPrompt(protocol, messages);
    const template = getTemplate('explainWithAi');
    streamRef.current = '';
    setAnalysis('');
    setError('');
    setLoading(true);
    postMsg({
      type: 'aiChat',
      tabId: activeTab.id,
      messages: [{ role: 'user', content: prompt }],
      systemPrompt: template || prompt,
      stream: true,
    });
  };

  return (
    <ModalView
      open
      onClose={onClose}
      title={`${LABEL} Traffic Analyzer ✦`}
      subtitle={`${messages.length} messages`}
      size="lg"
      headerColor={ACCENT}
      headerIcon={
        <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${ACCENT} 20%, transparent)` }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
        </div>
      }
      footerRight={
        !loading && analysis ? (
          <AIButtonView label="Re-analyze" size="md" accentColor={ACCENT} onClick={startAnalysis} />
        ) : undefined
      }
    >
      {messages.length === 0 && !loading && !analysis && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <SparkleIcon size={24} style={{ color: ACCENT, opacity: 0.4 }} />
          <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>No messages to analyze yet. Connect and receive some messages first.</p>
        </div>
      )}
      {error && <p className="text-[11px] px-3 py-2 rounded-lg mb-4" style={{ color: 'var(--color-error)', backgroundColor: 'color-mix(in srgb, var(--color-error) 8%, transparent)' }}>{error}</p>}
      {loading && !analysis && (
        <div className="flex flex-col items-center gap-3 py-12">
          <SparkleIcon size={20} style={{ color: ACCENT }} className="animate-pulse" />
          <p className="text-[11px] animate-pulse" style={{ color: ACCENT }}>Analyzing message stream…</p>
        </div>
      )}
      {analysis && <MdViewer content={analysis} />}
    </ModalView>
  );
}
