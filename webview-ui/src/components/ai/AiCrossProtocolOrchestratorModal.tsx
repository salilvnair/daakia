/**
 * AiCrossProtocolOrchestratorModal — Sprint 14.1
 * Describe a multi-protocol user journey; AI coordinates execution across
 * REST, WebSocket, SSE, gRPC. Single timeline view with pass/fail per step.
 * Gate: crossProtocolOrchestrator feature flag
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

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

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) e.preventDefault(); }}>
      <div className="relative flex flex-col rounded-lg overflow-hidden shadow-2xl"
        style={{ width: 600, maxHeight: '84vh', background: 'var(--color-bg-panel)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
          <span className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Cross-Protocol Orchestrator ✦</span>
          <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wide"
            style={{ background: 'color-mix(in srgb, var(--color-protocol-ai) 15%, transparent)', color: ACCENT }}>Sprint 14</span>
          <button type="button" onClick={onClose} className="ml-auto cursor-pointer" style={{ color: 'var(--color-text-muted)' }}><CloseIcon size={14} /></button>
        </div>
        <div className="flex flex-col gap-3 p-4 overflow-y-auto flex-1">
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            Describe a multi-protocol user journey. AI designs a complete orchestration plan with pass/fail criteria per step across REST, WebSocket, SSE, gRPC, and more.
          </p>
          <textarea ref={textareaRef} value={description} onChange={e => setDescription(e.target.value)}
            onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleCompose(); if (e.key === 'Escape') onClose(); }}
            placeholder="e.g. REST auth login, subscribe to WebSocket notifications channel, trigger a gRPC order creation, verify SSE event fires within 5s, confirm order via REST GET"
            rows={4} className="w-full rounded text-[11px] px-2.5 py-2 resize-none"
            style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
          <div className="flex justify-between items-center">
            <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>⌘↵ to compose</span>
            <button type="button" onClick={handleCompose} disabled={!description.trim() || loading}
              className="flex items-center gap-1.5 h-[26px] px-3 rounded text-[11px] font-medium cursor-pointer disabled:opacity-40"
              style={{ background: ACCENT, color: '#fff' }}>
              {loading ? <span className="inline-block w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <SparkleIcon size={11} />}
              {loading ? 'Orchestrating…' : 'Compose Plan'}
            </button>
          </div>
          {error && <p className="text-[11px] px-2.5 py-1.5 rounded" style={{ background: 'color-mix(in srgb, var(--color-error) 12%, transparent)', color: 'var(--color-error)' }}>{error}</p>}
          {result && <div className="rounded border p-3 overflow-y-auto" style={{ maxHeight: 360, borderColor: 'var(--color-border)', background: 'var(--color-bg-surface)' }}><MdViewer content={result} /></div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
