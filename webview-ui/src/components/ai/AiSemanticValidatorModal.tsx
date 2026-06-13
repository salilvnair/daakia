/**
 * AiSemanticValidatorModal — AI semantic response validation beyond JSON schema.
 * Feature 4.6.15 — AI Semantic Response Validation
 *
 * Catches issues like: age: -5, email without @, future dates in birthdate,
 * negative prices, invalid country codes — things schema allows but are logically wrong.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { SparkleIcon, CheckIcon, RefreshIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { MdViewer } from '../shared/display/MdViewer';
import { useAiResponseActionsStore } from '../../store/ai-response-actions-store';
import { ModalView, ButtonView } from '../../dui';

interface Props {
  tabId: string;
  responseBody: string;
  method?: string;
  url?: string;
  status?: string;
  onClose: () => void;
}

const ACCENT = 'var(--color-warning)';

const SYSTEM_PROMPT = `You are an API response semantic validator. Your job is to analyze API response data for semantic (logical) validity — not just structural/schema validity.

Check for issues like:
- Negative values where only positives make sense (age: -5, price: -100, quantity: -1)
- Invalid email formats (missing @, multiple @, invalid TLD)
- Phone numbers with wrong digit count
- Future dates in birthdates or "created_at" fields
- Past dates in "expires_at" fields that should be future
- Invalid country codes or currency codes
- Status values outside allowed enums (if inferable)
- IDs that are 0 or negative when they should be positive
- Percentage values outside 0–100
- Strings that look like they should be numbers (price: "free")
- Empty required-looking fields (name: "", email: "")
- Inconsistent data (created_at > updated_at, start_date > end_date)
- URL fields that aren't valid URLs

Format your response as markdown with:
1. A summary line (✅ Looks semantically valid / ⚠️ N issues found)
2. For each issue: field name, value found, why it's suspicious
3. Severity: 🔴 Critical | 🟡 Warning | 🔵 Note

Be concise. If data looks valid, say so briefly.`;

export function AiSemanticValidatorModal({ tabId, responseBody, method, url, status, onClose }: Props) {
  const { getTabActions, updateSemantic } = useAiResponseActionsStore();
  const cached = getTabActions(tabId);

  const [result, setResult] = useState(cached.semantic?.result ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const accRef = useRef('');
  const reqIdRef = useRef('');

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || (msg.tabId as string) !== reqIdRef.current) return;
      if (msg.type === 'ai:chunk') {
        accRef.current += (msg.delta as string) || (msg.text as string) || '';
        setResult(accRef.current);
      }
      if (msg.type === 'ai:complete') {
        const final = accRef.current || (msg.message as Record<string, unknown>)?.content as string || '';
        setResult(final);
        updateSemantic(tabId, { result: final });
        setLoading(false);
      }
      if (msg.type === 'ai:error') {
        setError((msg.message as string) || 'Validation failed.');
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [tabId, updateSemantic]);

  useEffect(() => {
    if (responseBody.trim() && !cached.semantic?.result) run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = useCallback(() => {
    if (!responseBody.trim()) { setError('No response body. Send the request first.'); return; }
    setLoading(true);
    setResult('');
    setError('');
    accRef.current = '';
    const pid = `ai-sem-val-${Date.now()}`;
    reqIdRef.current = pid;

    postMsg({
      type: 'ai:send', tabId: pid, provider: '', model: '', baseUrl: '',
      stage: 'rest.semantic.validate',
      systemPrompts: [SYSTEM_PROMPT],
      userPrompt: `Endpoint: ${method || 'GET'} ${url || ''}\nStatus: ${status || ''}\n\nResponse body:\n${responseBody.slice(0, 5000)}`,
      conversation: [], tools: [],
      settings: { temperature: 0.1, maxTokens: 1024, stream: true, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
      mcpServerConfigs: [],
    });
  }, [responseBody, method, url, status]);

  const isAllGood = result && (result.includes('✅') || result.toLowerCase().includes('semantically valid')) && !result.includes('🔴') && !result.includes('🟡');

  return (
    <ModalView
      open
      onClose={onClose}
      title="Semantic Validator"
      subtitle="Catches logical errors beyond JSON schema"
      size="lg"
      headerColor={ACCENT}
      headerIcon={
        <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${ACCENT} 20%, transparent)` }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
        </div>
      }
      headerRight={result && !loading ? (
        <button type="button" onClick={run} title="Re-run validation"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 5, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-muted)', opacity: 0.6 }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}
        >
          <RefreshIcon size={13} />
        </button>
      ) : undefined}
      footerRight={<ButtonView variant="secondary" size="sm" onClick={onClose}>Close</ButtonView>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading && !result && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '16px 0' }}>
            {[0, 150, 300].map(d => (
              <span key={d} className="w-[5px] h-[5px] rounded-full animate-pulse"
                style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />
            ))}
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 6 }}>Analyzing semantics…</span>
          </div>
        )}

        {error && <p style={{ fontSize: 11, color: 'var(--color-error)', margin: 0 }}>{error}</p>}

        {result && (
          <div style={{
            borderRadius: 8, border: `1px solid ${isAllGood ? 'color-mix(in srgb, var(--color-success) 30%, var(--color-surface-border))' : `color-mix(in srgb, ${ACCENT} 30%, var(--color-surface-border))`}`,
            backgroundColor: `color-mix(in srgb, ${isAllGood ? 'var(--color-success)' : ACCENT} 4%, var(--color-panel))`,
            padding: 16,
          }}>
            {isAllGood && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 11, fontWeight: 500, color: 'var(--color-success)' }}>
                <CheckIcon size={12} />
                All fields look semantically valid
              </div>
            )}
            <MdViewer content={result} />
            {loading && <span className="inline-block w-[2px] h-[12px] ml-0.5 animate-pulse align-text-bottom" style={{ backgroundColor: ACCENT }} />}
          </div>
        )}

        {!responseBody.trim() && (
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>No response body. Send the request first.</p>
        )}
      </div>
    </ModalView>
  );
}
