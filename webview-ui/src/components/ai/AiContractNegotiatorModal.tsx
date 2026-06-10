/**
 * AiContractNegotiatorModal — Sprint 14.3
 * Given two teams' OpenAPI specs, AI identifies incompatibilities, proposes resolutions,
 * generates adapter stub mocks so both teams can develop independently.
 * Gate: contractNegotiator feature flag
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-info)';

const SYSTEM_PROMPT = `You are an API contract negotiation expert. Given two teams' API contract descriptions (or OpenAPI spec excerpts), identify all incompatibilities and propose resolutions.

Structure your response as:

## Contract Analysis

### Team A Contract Summary
Brief summary of Team A's API contract.

### Team B Contract Summary
Brief summary of Team B's API contract.

## Incompatibilities Found

| # | Type | Team A | Team B | Severity | Resolution |
|---|---|---|---|---|---|
...

Incompatibility types: field-name-mismatch, type-difference, missing-endpoint, missing-field, auth-mismatch, response-format, error-code-mismatch.

## Proposed Resolutions
For each incompatibility: concrete, actionable fix with rationale.

## Adapter Stub Mock
Generate a minimal adapter layer (OpenAPI 3.1 or JavaScript/TypeScript) that allows both teams to develop independently by translating between the two contracts.

## Negotiation Summary
Which changes each team should make for maximum compatibility with minimum disruption.`;

export function AiContractNegotiatorModal({ onClose }: Props) {
  const [teamASpec, setTeamASpec] = useState('');
  const [teamBSpec, setTeamBSpec] = useState('');
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

  const handleNegotiate = useCallback(() => {
    if ((!teamASpec.trim() && !teamBSpec.trim()) || loading) return;
    streamRef.current = ''; setResult(''); setError(''); setLoading(true);
    postMsg({ type: 'aiStream', payload: {
      systemPrompt: SYSTEM_PROMPT,
      userMessage: `Team A Contract:\n${teamASpec.trim() || '(not provided)'}\n\n---\n\nTeam B Contract:\n${teamBSpec.trim() || '(not provided)'}`,
      templateKey: 'rest.contract.test',
    }});
  }, [teamASpec, teamBSpec, loading]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) e.preventDefault(); }}>
      <div className="relative flex flex-col rounded-lg overflow-hidden shadow-2xl"
        style={{ width: 680, maxHeight: '88vh', background: 'var(--color-bg-panel)', border: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
          <span className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>AI Contract Negotiator ✦</span>
          <button type="button" onClick={onClose} className="ml-auto cursor-pointer" style={{ color: 'var(--color-text-muted)' }}><CloseIcon size={14} /></button>
        </div>
        <div className="flex flex-col gap-3 p-4 overflow-y-auto flex-1">
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            Paste API contracts from two teams. AI identifies every incompatibility, proposes resolutions, and generates adapter stub mocks so both teams can develop independently.
          </p>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] font-medium mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>Team A Contract</label>
              <textarea value={teamASpec} onChange={e => setTeamASpec(e.target.value)}
                placeholder="Paste OpenAPI spec, endpoint list, or contract description for Team A..."
                rows={6} className="w-full rounded text-[11px] px-2.5 py-2 resize-none"
                style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-medium mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>Team B Contract</label>
              <textarea value={teamBSpec} onChange={e => setTeamBSpec(e.target.value)}
                placeholder="Paste OpenAPI spec, endpoint list, or contract description for Team B..."
                rows={6} className="w-full rounded text-[11px] px-2.5 py-2 resize-none"
                style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={handleNegotiate} disabled={loading}
              className="flex items-center gap-1.5 h-[26px] px-3 rounded text-[11px] font-medium cursor-pointer disabled:opacity-40"
              style={{ background: ACCENT, color: '#fff' }}>
              {loading ? <span className="inline-block w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <SparkleIcon size={11} />}
              {loading ? 'Negotiating…' : 'Analyze & Negotiate'}
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
