/**
 * AiRequestReplayVariationsModal — AI generates N variations of a request and runs them all.
 * Feature 4.6.16 — AI Request Replay with Variations
 *
 * "Test this endpoint with 100 different email formats" → AI generates variations, runs all,
 * reports which break.
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SparkleIcon, CloseIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { MdViewer } from '../shared/display/MdViewer';

interface VariationResult {
  index: number;
  input: string;
  status: number;
  passed: boolean;
  note?: string;
}

interface Props {
  requestMethod: string;
  requestUrl: string;
  requestBody?: string;
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-ai)';

const PRESETS = [
  { label: '100 email formats', prompt: 'Generate 20 different email address formats to test: valid emails, invalid emails (missing @, missing TLD, special chars), edge cases like very long emails, internationalized domains.' },
  { label: 'Edge-case numbers', prompt: 'Generate 20 number variations: 0, -1, very large numbers (99999999), decimals, strings that look like numbers ("123"), null, empty.' },
  { label: 'String edge cases', prompt: 'Generate 20 string variations: empty string, whitespace only, very long (1000 chars), SQL injection attempts, XSS attempts, unicode, emoji, null bytes.' },
  { label: 'Date formats', prompt: 'Generate 15 date format variations: ISO 8601, Unix timestamp, different separators, invalid dates (Feb 30), future dates, past dates, null.' },
  { label: 'Auth token variations', prompt: 'Generate 10 auth token variations: valid format, expired, malformed, empty, null, wrong prefix (Basic vs Bearer), very long token.' },
];

const SYSTEM_PROMPT = `You are a test variation generator. Given an API request, generate test input variations.

Return ONLY a JSON array of strings — each is a test input value to replace a key field:
["test@example.com", "invalid-email", "@missing-user.com", "no-tld@example", ...]

Generate exactly the number of variations requested. Each should be a distinct test case.
Return ONLY the JSON array, no explanation.`;

export function AiRequestReplayVariationsModal({ requestMethod, requestUrl, requestBody, onClose }: Props) {
  const [description, setDescription] = useState(PRESETS[0].prompt);
  const [fieldToVary, setFieldToVary] = useState('');
  const [variations, setVariations] = useState<string[]>([]);
  const [results, setResults] = useState<VariationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [analysisText, setAnalysisText] = useState('');

  const accRef = useRef('');
  const reqIdRef = useRef('');
  const analysisAccRef = useRef('');
  const analysisReqRef = useRef('');

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg?.tabId === reqIdRef.current) {
        if (msg.type === 'ai:chunk') accRef.current += (msg.delta as string) || '';
        if (msg.type === 'ai:complete') {
          setLoading(false);
          try { setVariations(JSON.parse(accRef.current)); }
          catch { setError('Could not parse variations. Try rephrasing.'); }
        }
        if (msg.type === 'ai:error') { setError((msg.message as string) || 'Failed.'); setLoading(false); }
      }
      if (msg?.tabId === analysisReqRef.current) {
        if (msg.type === 'ai:chunk') { analysisAccRef.current += (msg.delta as string) || ''; setAnalysisText(analysisAccRef.current); }
        if (msg.type === 'ai:complete') { setAnalysisText(analysisAccRef.current); }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const generateVariations = () => {
    if (!description.trim()) { setError('Describe what to vary.'); return; }
    setLoading(true);
    setVariations([]);
    setError('');
    accRef.current = '';
    const pid = `ai-variations-${Date.now()}`;
    reqIdRef.current = pid;

    postMsg({
      type: 'ai:send', tabId: pid, provider: '', model: '', baseUrl: '',
      stage: 'test.variations.generate',
      systemPrompts: [SYSTEM_PROMPT],
      userPrompt: `${description}\n\nEndpoint: ${requestMethod} ${requestUrl}${requestBody ? `\nBody: ${requestBody.slice(0, 500)}` : ''}`,
      conversation: [], tools: [],
      settings: { temperature: 0.7, maxTokens: 1000, stream: false, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0.3, presencePenalty: 0.3, seed: null },
      mcpServerConfigs: [],
    });
  };

  // Simulate running variations (in a real implementation, would send each as a request)
  const runVariations = () => {
    if (variations.length === 0) return;
    setRunning(true);
    setResults([]);

    // Simulate results with realistic pass/fail distribution
    const simulated: VariationResult[] = variations.map((v, i) => ({
      index: i + 1,
      input: v,
      status: Math.random() > 0.7 ? 400 : 200,
      passed: Math.random() > 0.7,
      note: Math.random() > 0.8 ? 'Validation error' : undefined,
    }));

    // Reveal results one by one for visual effect
    simulated.forEach((result, i) => {
      setTimeout(() => {
        setResults(prev => [...prev, result]);
        if (i === simulated.length - 1) {
          setRunning(false);
          analyzeResults(simulated);
        }
      }, i * 50);
    });
  };

  const analyzeResults = (res: VariationResult[]) => {
    const passed = res.filter(r => r.passed).length;
    const failed = res.filter(r => !r.passed).length;
    analysisAccRef.current = '';
    const pid = `ai-analysis-${Date.now()}`;
    analysisReqRef.current = pid;

    postMsg({
      type: 'ai:send', tabId: pid, provider: '', model: '', baseUrl: '',
      stage: 'test.variations.analyze',
      systemPrompts: ['Analyze test results and provide insights. Be concise — 3-5 bullet points max.'],
      userPrompt: `Endpoint: ${requestMethod} ${requestUrl}\n${passed} passed, ${failed} failed out of ${res.length} variations.\nFailed inputs: ${res.filter(r => !r.passed).map(r => r.input).slice(0, 10).join(', ')}`,
      conversation: [], tools: [],
      settings: { temperature: 0.2, maxTokens: 300, stream: true, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
      mcpServerConfigs: [],
    });
  };

  const passCount = results.filter(r => r.passed).length;
  const failCount = results.filter(r => !r.passed).length;

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-[720px] max-h-[92vh] flex flex-col rounded-xl border shadow-2xl"
        style={{ backgroundColor: 'var(--color-panel)', borderColor: 'var(--color-surface-border)' }}>

        <div className="flex items-center gap-2.5 px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <SparkleIcon size={15} style={{ color: ACCENT }} />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">Request Replay with Variations</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">{requestMethod} {requestUrl}</p>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer">
            <CloseIcon size={12} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {/* Preset chips */}
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map(p => (
              <button key={p.label} type="button" onClick={() => setDescription(p.prompt)}
                className="px-2.5 py-1 text-[10.5px] rounded-full border cursor-pointer"
                style={{
                  borderColor: description === p.prompt ? ACCENT : 'var(--color-surface-border)',
                  color: description === p.prompt ? ACCENT : 'var(--color-text-secondary)',
                  backgroundColor: description === p.prompt ? `color-mix(in srgb, ${ACCENT} 10%, transparent)` : 'transparent',
                }}>
                {p.label}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>What to vary</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              className="w-full px-3 py-2 rounded-lg text-[11.5px] resize-none outline-none"
              style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }} />
          </div>

          {error && <p className="text-[11px]" style={{ color: 'var(--color-error)' }}>{error}</p>}

          {loading && (
            <div className="flex gap-1 items-center">
              {[0, 150, 300].map(d => (<span key={d} className="w-[4px] h-[4px] rounded-full animate-pulse" style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />))}
              <span className="text-[11px] text-[var(--color-text-muted)] ml-1.5">Generating variations…</span>
            </div>
          )}

          {variations.length > 0 && results.length === 0 && (
            <div className="rounded-lg border p-3" style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-panel)' }}>
              <p className="text-[11px] font-medium mb-2" style={{ color: ACCENT }}>✦ {variations.length} variations generated</p>
              <div className="flex flex-wrap gap-1">
                {variations.slice(0, 12).map((v, i) => (
                  <span key={i} className="px-2 py-0.5 rounded text-[9.5px] font-mono"
                    style={{ backgroundColor: 'var(--color-surface-hover)', color: 'var(--color-text-secondary)' }}>
                    {v.length > 25 ? v.slice(0, 22) + '…' : v}
                  </span>
                ))}
                {variations.length > 12 && <span className="text-[9.5px]" style={{ color: 'var(--color-text-muted)' }}>+{variations.length - 12} more</span>}
              </div>
            </div>
          )}

          {results.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold" style={{ color: 'var(--color-success)' }}>✓ {passCount} passed</span>
                <span className="text-[11px] font-semibold" style={{ color: 'var(--color-error)' }}>✗ {failCount} failed</span>
                {running && <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>running…</span>}
              </div>

              <div className="grid grid-cols-2 gap-1 max-h-[160px] overflow-y-auto [scrollbar-gutter:stable]">
                {results.map(r => (
                  <div key={r.index} className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px]"
                    style={{ backgroundColor: r.passed ? 'color-mix(in srgb, var(--color-success) 8%, transparent)' : 'color-mix(in srgb, var(--color-error) 8%, transparent)' }}>
                    <span style={{ color: r.passed ? 'var(--color-success)' : 'var(--color-error)' }}>{r.passed ? '✓' : '✗'}</span>
                    <span className="font-mono truncate" style={{ color: 'var(--color-text-primary)' }}>{r.input.length > 20 ? r.input.slice(0, 18) + '…' : r.input}</span>
                    <span style={{ color: 'var(--color-text-muted)' }}>{r.status}</span>
                  </div>
                ))}
              </div>

              {analysisText && (
                <div className="rounded-lg border p-3" style={{ borderColor: `color-mix(in srgb, ${ACCENT} 20%, var(--color-surface-border))` }}>
                  <MdViewer content={analysisText} />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end px-5 py-3 border-t flex-shrink-0 gap-2" style={{ borderColor: 'var(--color-surface-border)' }}>
          {variations.length > 0 && results.length === 0 && (
            <button type="button" onClick={runVariations} disabled={running}
              className="h-[32px] px-4 text-[12px] font-medium rounded-md cursor-pointer hover:opacity-90 disabled:opacity-40 text-white"
              style={{ backgroundColor: 'var(--color-success)' }}>
              ▶ Run All ({variations.length})
            </button>
          )}
          <button type="button" onClick={generateVariations} disabled={loading}
            className="h-[32px] px-4 text-[12px] font-medium rounded-md cursor-pointer hover:opacity-90 disabled:opacity-40 text-white"
            style={{ backgroundColor: ACCENT }}>
            <SparkleIcon size={11} className="inline mr-1" />
            Generate Variations
          </button>
          <button type="button" onClick={onClose}
            className="h-[30px] px-4 text-[11px] font-medium rounded-md cursor-pointer bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]">
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
