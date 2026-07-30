/**
 * AiContractNegotiatorModal — Sprint 14.3
 * Given two teams' OpenAPI specs, AI identifies incompatibilities, proposes resolutions,
 * generates adapter stub mocks so both teams can develop independently.
 * Gate: contractNegotiator feature flag
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';
import { ModalView, AIButtonView, EditorView, ResizablePanelView } from '@salilvnair/dui';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-ai)';

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

  return (
    <ModalView
      open
      onClose={onClose}
      title="AI Contract Negotiator"
      size="xl"
      headerColor={ACCENT}
      headerIcon={
        <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${ACCENT} 20%, transparent)` }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
        </div>
      }
      footerRight={
        <AIButtonView
          label={loading ? 'Negotiating…' : 'Analyze & Negotiate'}
          size="md"
          accentColor={ACCENT}
          disabled={loading}
          loading={loading}
          onClick={handleNegotiate}
        />
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
          Paste API contracts from two teams. AI identifies every incompatibility, proposes resolutions, and generates adapter stub mocks so both teams can develop independently.
        </p>
        <div className="flex gap-3">
          <div className="flex-1 flex flex-col">
            <label className="text-[10px] font-medium mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>Team A Contract</label>
            <ResizablePanelView defaultHeight={160} minHeight={100} maxHeight={480} style={{ width: '100%' }}>
              <EditorView
                value={teamASpec}
                onChange={setTeamASpec}
                language="yaml"
                height="100%"
                size="md"
                placeholder="Paste OpenAPI spec, endpoint list, or contract description for Team A..."
                bordered={false}
              />
            </ResizablePanelView>
          </div>
          <div className="flex-1 flex flex-col">
            <label className="text-[10px] font-medium mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>Team B Contract</label>
            <ResizablePanelView defaultHeight={160} minHeight={100} maxHeight={480} style={{ width: '100%' }}>
              <EditorView
                value={teamBSpec}
                onChange={setTeamBSpec}
                language="yaml"
                height="100%"
                size="md"
                placeholder="Paste OpenAPI spec, endpoint list, or contract description for Team B..."
                bordered={false}
              />
            </ResizablePanelView>
          </div>
        </div>
        {error && <p className="text-[11px] px-2.5 py-1.5 rounded" style={{ background: 'color-mix(in srgb, var(--color-error) 12%, transparent)', color: 'var(--color-error)' }}>{error}</p>}
        {result && <div className="rounded border p-3 overflow-y-auto" style={{ maxHeight: 360, borderColor: 'var(--color-surface-border)', background: 'var(--color-surface)' }}><MdViewer content={result} /></div>}
      </div>
    </ModalView>
  );
}
