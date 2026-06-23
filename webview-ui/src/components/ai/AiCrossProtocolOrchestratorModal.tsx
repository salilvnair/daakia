/**
 * AiCrossProtocolOrchestratorModal — Sprint 14.1
 * Describe a multi-protocol user journey; AI coordinates execution across
 * REST, WebSocket, SSE, gRPC. Single timeline view with pass/fail per step.
 * Gate: crossProtocolOrchestrator feature flag
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';
import { ModalView, AIButtonView, MultilineInputView } from '@salilvnair/dui';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-ai)';

const SYSTEM_PROMPT = `You are a multi-protocol API orchestration expert. Given a plain-English description of a user journey spanning multiple protocols, design a complete test orchestration plan.

For each step provide:
1. **Protocol** — REST / WebSocket / SSE / gRPC / SOAP / MQTT
2. **Action** — specific operation to perform
3. **Input** — request details (method, URL, payload, or connection string)
4. **Expected output** — what a successful response looks like
5. **Variable extraction** — what to capture for downstream steps
6. **Timeout** — max wait time in seconds

Format as a numbered timeline with clear PASS/FAIL criteria per step.
Include a "Rollback Plan" section showing how to clean up on failure.
Add a "Total Estimated Duration" at the end.`;

export function AiCrossProtocolOrchestratorModal({ onClose }: Props) {
  const [description, setDescription] = useState('');
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

  const handleCompose = useCallback(() => {
    if (!description.trim() || loading) return;
    streamRef.current = ''; setResult(''); setError(''); setLoading(true);
    postMsg({ type: 'aiStream', payload: { systemPrompt: SYSTEM_PROMPT, userMessage: `Multi-protocol journey:\n${description.trim()}`, templateKey: 'agent.master' } });
  }, [description, loading]);

  return (
    <ModalView
      open
      onClose={onClose}
      title="Cross-Protocol Orchestrator ✦"
      size="lg"
      headerColor={ACCENT}
      headerIcon={
        <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${ACCENT} 20%, transparent)` }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
        </div>
      }
      footerLeft={
        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>⌘↵ to compose</span>
      }
      footerRight={
        <AIButtonView
          label={loading ? 'Orchestrating…' : 'Compose Plan'}
          size="md"
          accentColor={ACCENT}
          disabled={!description.trim() || loading}
          loading={loading}
          onClick={handleCompose}
        />
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          Describe a multi-protocol user journey. AI designs a complete orchestration plan with pass/fail criteria per step across REST, WebSocket, SSE, gRPC, and more.
        </p>
        <MultilineInputView
          value={description}
          onChange={e => setDescription(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleCompose(); }}
          placeholder="e.g. REST auth login, subscribe to WebSocket notifications channel, trigger a gRPC order creation, verify SSE event fires within 5s, confirm order via REST GET"
          rows={4}
          size="md"
          width="fw"
          autoFocus
        />
        {error && <p className="text-[11px] px-2.5 py-1.5 rounded" style={{ background: 'color-mix(in srgb, var(--color-error) 12%, transparent)', color: 'var(--color-error)' }}>{error}</p>}
        {result && <div className="rounded border p-3 overflow-y-auto" style={{ maxHeight: 360, borderColor: 'var(--color-surface-border)', background: 'var(--color-surface)' }}><MdViewer content={result} /></div>}
      </div>
    </ModalView>
  );
}
