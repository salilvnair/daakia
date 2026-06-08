/**
 * AiSemanticValidatorModal — AI semantic response validation beyond JSON schema.
 * Feature 4.6.15 — AI Semantic Response Validation
 *
 * Catches issues like: age: -5, email without @, future dates in birthdate,
 * negative prices, invalid country codes — things schema allows but are logically wrong.
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SparkleIcon, CloseIcon, CheckIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { MdViewer } from '../shared/display/MdViewer';

interface Props {
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

export function AiSemanticValidatorModal({ responseBody, method, url, status, onClose }: Props) {
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const accRef = useRef('');
  const reqIdRef = useRef('');

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || msg.tabId !== reqIdRef.current) return;
      if (msg.type === 'ai:chunk') {
        accRef.current += (msg.delta as string) || (msg.text as string) || '';
        setResult(accRef.current);
      }
      if (msg.type === 'ai:complete') {
        setResult(accRef.current || (msg.message as Record<string, unknown>)?.content as string || '');
        setLoading(false);
      }
      if (msg.type === 'ai:error') {
        setError((msg.message as string) || 'Validation failed.');
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    if (responseBody.trim()) run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = () => {
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
  };

  const isAllGood = result && (result.includes('✅') || result.toLowerCase().includes('semantically valid')) && !result.includes('🔴') && !result.includes('🟡');

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-[620px] max-h-[88vh] flex flex-col rounded-xl border shadow-2xl"
        style={{ backgroundColor: 'var(--color-surface-bg)', borderColor: 'var(--color-surface-border)' }}>

        <div className="flex items-center gap-2.5 px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <SparkleIcon size={15} style={{ color: ACCENT }} />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">Semantic Validator</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">Catches logical errors beyond JSON schema</p>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer">
            <CloseIcon size={12} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {loading && !result && (
            <div className="flex gap-1 items-center py-4">
              {[0, 150, 300].map(d => (
                <span key={d} className="w-[5px] h-[5px] rounded-full animate-pulse"
                  style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />
              ))}
              <span className="text-[11px] text-[var(--color-text-muted)] ml-1.5">Analyzing semantics…</span>
            </div>
          )}

          {error && <p className="text-[11px]" style={{ color: 'var(--color-error)' }}>{error}</p>}

          {result && (
            <div className="rounded-lg border p-4"
              style={{
                borderColor: isAllGood
                  ? 'color-mix(in srgb, var(--color-success) 30%, var(--color-surface-border))'
                  : `color-mix(in srgb, ${ACCENT} 30%, var(--color-surface-border))`,
                backgroundColor: `color-mix(in srgb, ${isAllGood ? 'var(--color-success)' : ACCENT} 4%, var(--color-surface-bg))`,
              }}>
              {isAllGood && (
                <div className="flex items-center gap-1.5 mb-2 text-[11px] font-medium" style={{ color: 'var(--color-success)' }}>
                  <CheckIcon size={12} />
                  All fields look semantically valid
                </div>
              )}
              <MdViewer content={result} />
              {loading && <span className="inline-block w-[2px] h-[12px] ml-0.5 animate-pulse align-text-bottom" style={{ backgroundColor: ACCENT }} />}
            </div>
          )}

          {!responseBody.trim() && (
            <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>No response body. Send the request first.</p>
          )}
        </div>

        <div className="flex items-center justify-end px-5 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <div className="flex gap-2">
            {result && !loading && (
              <button type="button" onClick={run}
                className="h-[30px] px-3 text-[11px] rounded-md cursor-pointer border"
                style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>
                Re-validate
              </button>
            )}
            <button type="button" onClick={onClose}
              className="h-[30px] px-4 text-[11px] font-medium rounded-md cursor-pointer bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
