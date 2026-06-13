/**
 * AiResponseTransformer — transforms response body with AI.
 * Feature 4.6.18 — AI Response Transformer
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { SparkleIcon, CopyIcon, RefreshIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useAiResponseActionsStore } from '../../store/ai-response-actions-store';
import { ModalView, AIButtonView } from '../../dui';

interface Props {
  tabId: string;
  responseBody: string;
  contentType?: string;
  method?: string;
  url?: string;
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-ai)';

const PRESETS = [
  { label: 'JSON → CSV', prompt: 'Convert this JSON response to CSV format. Flatten nested objects. Use comma as delimiter. Include headers.' },
  { label: 'Extract emails', prompt: 'Extract all email addresses from this response. Return as a plain list, one per line.' },
  { label: 'Flatten JSON', prompt: 'Flatten all nested JSON objects into a single-level object using dot notation for keys (e.g. user.address.city). Return valid JSON.' },
  { label: 'JSON → Table (Markdown)', prompt: 'Convert this JSON array response to a Markdown table. Use the keys as column headers.' },
  { label: 'Extract IDs only', prompt: 'Extract all ID fields (id, _id, uuid, userId, productId, etc.) from this response. Return as JSON array.' },
  { label: 'XML → JSON', prompt: 'Convert this XML response to clean JSON. Remove XML namespaces. Return valid JSON only.' },
  { label: 'Summarize', prompt: 'Summarize this API response in 3-5 bullet points. Focus on key data and counts. Use plain English.' },
  { label: 'Sort by field', prompt: 'If this is a JSON array, sort it by the most appropriate field (name, date, id, or similar). Return sorted JSON.' },
];

const SYSTEM_PROMPT = `You are a data transformation expert for API responses. The user will give you a transformation instruction and an API response body.

Apply the transformation and return ONLY the result — no explanation, no preamble, no markdown fences unless the output IS markdown. Just the transformed data.

If the transformation doesn't apply (wrong format, empty data, etc.), say so briefly.`;

export function AiResponseTransformer({ tabId, responseBody, contentType, method, url, onClose }: Props) {
  const { getTabActions, updateTransform } = useAiResponseActionsStore();
  const cached = getTabActions(tabId);

  const [instruction, setInstruction] = useState(cached.transform?.instruction ?? '');
  const [result, setResult] = useState(cached.transform?.result ?? '');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const accRef = useRef('');
  const reqIdRef = useRef('');

  const handleInstructionChange = (val: string) => {
    setInstruction(val);
    setError('');
    updateTransform(tabId, { instruction: val });
  };

  const applyPreset = (prompt: string) => {
    setInstruction(prompt);
    updateTransform(tabId, { instruction: prompt });
  };

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
        updateTransform(tabId, { result: final });
        setLoading(false);
      }
      if (msg.type === 'ai:error') {
        setError((msg.message as string) || 'Transformation failed.');
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [tabId, updateTransform]);

  const run = useCallback(() => {
    if (!instruction.trim()) { setError('Enter a transformation instruction.'); return; }
    if (!responseBody.trim()) { setError('No response body. Send the request first.'); return; }
    setLoading(true);
    setResult('');
    setError('');
    accRef.current = '';
    const pid = `ai-transform-${Date.now()}`;
    reqIdRef.current = pid;

    postMsg({
      type: 'ai:send', tabId: pid, provider: '', model: '', baseUrl: '',
      stage: 'rest.response.transform',
      systemPrompts: [SYSTEM_PROMPT],
      userPrompt: `Endpoint: ${method || 'GET'} ${url || ''}\nContent-Type: ${contentType || 'application/json'}\n\nTransformation: ${instruction}\n\nResponse body:\n${responseBody.slice(0, 6000)}`,
      conversation: [], tools: [],
      settings: { temperature: 0.1, maxTokens: 2048, stream: true, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
      mcpServerConfigs: [],
    });
  }, [instruction, responseBody, method, url, contentType]);

  const handleRefresh = useCallback(() => {
    setResult('');
    updateTransform(tabId, { result: '' });
  }, [tabId, updateTransform]);

  const copy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <ModalView
      open
      onClose={onClose}
      title="Response Transformer"
      subtitle="Convert, extract, or reshape the response with AI"
      size="lg"
      headerColor={ACCENT}
      headerIcon={
        <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${ACCENT} 20%, transparent)` }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
        </div>
      }
      headerRight={result && !loading ? (
        <button type="button" onClick={handleRefresh} title="Clear result and re-transform"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 5, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-muted)', opacity: 0.6 }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}
        >
          <RefreshIcon size={13} />
        </button>
      ) : undefined}
      footerRight={
        <AIButtonView
          label={loading ? 'Transforming…' : (result ? 'Re-transform' : 'Transform')}
          size="md"
          accentColor={ACCENT}
          disabled={loading || !instruction.trim() || !responseBody.trim()}
          onClick={run}
        />
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Presets */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 500, marginBottom: 8, color: 'var(--color-text-secondary)' }}>Quick transforms</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {PRESETS.map(p => (
              <button key={p.label} type="button"
                onClick={() => applyPreset(p.prompt)}
                className="cursor-pointer transition-all"
                style={{
                  padding: '4px 10px', fontSize: 10.5, borderRadius: 999, border: `1px solid ${instruction === p.prompt ? ACCENT : 'var(--color-surface-border)'}`,
                  color: instruction === p.prompt ? ACCENT : 'var(--color-text-secondary)',
                  backgroundColor: instruction === p.prompt ? `color-mix(in srgb, ${ACCENT} 10%, transparent)` : 'transparent',
                }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Instruction */}
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, marginBottom: 6, color: 'var(--color-text-secondary)' }}>
            Transformation instruction
          </label>
          <textarea
            value={instruction}
            onChange={e => handleInstructionChange(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 rounded-lg text-[11.5px] resize-none outline-none"
            placeholder='"Convert this JSON to CSV" or "Extract all email addresses"'
            style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
          />
        </div>

        {error && <p style={{ fontSize: 11, color: 'var(--color-error)', margin: 0 }}>{error}</p>}

        {loading && !result && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {[0, 150, 300].map(d => (
              <span key={d} className="w-[4px] h-[4px] rounded-full animate-pulse"
                style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />
            ))}
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 6 }}>Transforming…</span>
          </div>
        )}

        {result && (
          <div style={{ borderRadius: 8, border: '1px solid var(--color-surface-border)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', backgroundColor: 'var(--color-surface-hover)', borderBottom: '1px solid var(--color-surface-border)' }}>
              <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-muted)' }}>Result</span>
              <button type="button" onClick={copy}
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', border: 'none', background: 'transparent', color: copied ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                <CopyIcon size={11} />
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre style={{ padding: 16, fontSize: 11.5, fontFamily: 'var(--font-mono)', overflowX: 'auto', whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: 300, overflowY: 'auto', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-panel)', margin: 0 }}>
              {result}
              {loading && <span className="inline-block w-[2px] h-[12px] ml-0.5 animate-pulse" style={{ backgroundColor: ACCENT }} />}
            </pre>
          </div>
        )}
      </div>
    </ModalView>
  );
}
