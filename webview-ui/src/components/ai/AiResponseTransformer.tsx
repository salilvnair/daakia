/**
 * AiResponseTransformer — transforms response body with AI.
 * Feature 4.6.18 — AI Response Transformer
 *
 * "Convert this XML to flat CSV", "Extract just emails from nested JSON", "Reshape to match this schema"
 *
 * Instruction draft + generated result are persisted per-tab in Zustand.
 * Cache-first: if result exists when opened, shows immediately; refresh to re-run.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { SparkleIcon, CloseIcon, CopyIcon, RefreshIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useAiResponseActionsStore } from '../../store/ai-response-actions-store';

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

  // Cache-first: initialize from stored state
  const [instruction, setInstruction] = useState(cached.transform?.instruction ?? '');
  const [result, setResult] = useState(cached.transform?.result ?? '');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const accRef = useRef('');
  const reqIdRef = useRef('');

  // Persist instruction changes
  const handleInstructionChange = (val: string) => {
    setInstruction(val);
    setError('');
    updateTransform(tabId, { instruction: val });
  };

  // Apply preset — persist to store too
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

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-[680px] max-h-[90vh] flex flex-col rounded-xl border shadow-2xl"
        style={{ backgroundColor: 'var(--color-panel)', borderColor: 'var(--color-surface-border)' }}>

        <div className="flex items-center gap-2.5 px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <SparkleIcon size={15} style={{ color: ACCENT }} />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">Response Transformer</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">Convert, extract, or reshape the response with AI</p>
          </div>
          {/* Refresh — clear result to re-run */}
          {result && !loading && (
            <button
              type="button"
              onClick={handleRefresh}
              title="Clear result and re-transform"
              className="w-7 h-7 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer mr-1"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <RefreshIcon size={13} />
            </button>
          )}
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer">
            <CloseIcon size={12} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {/* Presets */}
          <div>
            <p className="text-[11px] font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>Quick transforms</p>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map(p => (
                <button key={p.label} type="button"
                  onClick={() => applyPreset(p.prompt)}
                  className="px-2.5 py-1 text-[10.5px] rounded-full border cursor-pointer transition-all"
                  style={{
                    borderColor: instruction === p.prompt ? ACCENT : 'var(--color-surface-border)',
                    color: instruction === p.prompt ? ACCENT : 'var(--color-text-secondary)',
                    backgroundColor: instruction === p.prompt ? `color-mix(in srgb, ${ACCENT} 10%, transparent)` : 'transparent',
                  }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom instruction */}
          <div>
            <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
              Transformation instruction
            </label>
            <textarea
              value={instruction}
              onChange={e => handleInstructionChange(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg text-[11.5px] resize-none outline-none"
              placeholder='e.g. "Convert this JSON to CSV" or "Extract all email addresses" or "Reshape so each user has a roles array"'
              style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
            />
          </div>

          {error && <p className="text-[11px]" style={{ color: 'var(--color-error)' }}>{error}</p>}

          {loading && !result && (
            <div className="flex gap-1 items-center">
              {[0, 150, 300].map(d => (
                <span key={d} className="w-[4px] h-[4px] rounded-full animate-pulse"
                  style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />
              ))}
              <span className="text-[11px] text-[var(--color-text-muted)] ml-1.5">Transforming…</span>
            </div>
          )}

          {result && (
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-surface-border)' }}>
              <div className="flex items-center justify-between px-3 py-1.5 border-b"
                style={{ backgroundColor: 'var(--color-surface-hover)', borderColor: 'var(--color-surface-border)' }}>
                <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Result</span>
                <button type="button" onClick={copy}
                  className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded cursor-pointer"
                  style={{ color: copied ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                  <CopyIcon size={11} />
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <pre className="p-4 text-[11.5px] font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto"
                style={{ color: 'var(--color-text-primary)', backgroundColor: 'var(--color-panel)' }}>
                {result}
                {loading && <span className="inline-block w-[2px] h-[12px] ml-0.5 animate-pulse" style={{ backgroundColor: ACCENT }} />}
              </pre>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end px-5 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <div className="flex gap-2">
            <button type="button" onClick={run} disabled={loading || !instruction.trim() || !responseBody.trim()}
              className="h-[32px] px-4 text-[12px] font-medium rounded-md text-white cursor-pointer hover:opacity-90 disabled:opacity-40"
              style={{ backgroundColor: ACCENT }}>
              <SparkleIcon size={11} className="inline mr-1" />
              {result ? 'Re-transform' : 'Transform'}
            </button>
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
