import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { parseCurl } from '../../../utils/curl-parser';
import { useTabsStore } from '../../../store/tabs-store';
import { useAiPromptTemplatesStore } from '../../../store/prompt-template';
import { postMsg } from '../../../vscode';
import { CloseIcon, SparkleIcon } from '../../../icons';

interface ImportCurlModalProps {
  open: boolean;
  onClose: () => void;
}

const EXPLAIN_ACCENT = 'var(--color-info)';
const CODE_ACCENT = 'var(--color-warning)';

/** Shape of JSON the AI returns for code-to-request extraction */
interface ExtractedRequest {
  method: string;
  url: string;
  headers: { key: string; value: string; enabled: boolean }[];
  bodyMode: 'none' | 'raw' | 'form-data' | 'x-www-form-urlencoded';
  bodyRaw: string;
  bodyFormData: { key: string; value: string; type: string; enabled: boolean }[];
  bodyUrlEncoded: { key: string; value: string; enabled: boolean }[];
  name?: string;
}

export function ImportCurlModal({ open, onClose }: ImportCurlModalProps) {
  // ── Mode toggle ────────────────────────────────────────────────────────────
  const [importMode, setImportMode] = useState<'curl' | 'code'>('curl');

  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const codeTextareaRef = useRef<HTMLTextAreaElement>(null);
  const { tabs, activeTabId, updateTab } = useTabsStore();

  // ── AI Explain state ──────────────────────────────────────────────────────
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState('');
  const explainReqIdRef = useRef('');
  const explainAccRef = useRef('');
  const resolve = useAiPromptTemplatesStore(s => s.resolve);

  // ── AI Code Extract state ─────────────────────────────────────────────────
  const [codeInput, setCodeInput] = useState('');
  const [codeExtracting, setCodeExtracting] = useState(false);
  const [codeExtracted, setCodeExtracted] = useState<ExtractedRequest | null>(null);
  const [codeRaw, setCodeRaw] = useState('');
  const [codeError, setCodeError] = useState('');
  const codeReqIdRef = useRef('');
  const codeAccRef = useRef('');

  useEffect(() => {
    if (!open) return;
    setInput('');
    setError('');
    setExplanation('');
    setExplaining(false);
    setCodeInput('');
    setCodeExtracted(null);
    setCodeRaw('');
    setCodeError('');
    setCodeExtracting(false);
    setImportMode('curl');
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    setTimeout(() => textareaRef.current?.focus(), 30);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // ── AI stream listener ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || msg.tabId !== explainReqIdRef.current) return;

      if (msg.type === 'ai:chunk') {
        const delta = (msg.delta as string) || (msg.text as string) || '';
        explainAccRef.current += delta;
        setExplanation(explainAccRef.current);
      }
      if (msg.type === 'ai:complete') {
        const msgPayload = msg.message as Record<string, unknown> | undefined;
        const content = explainAccRef.current || (msgPayload?.content as string) || '';
        setExplanation(content);
        setExplaining(false);
      }
      if (msg.type === 'ai:error') {
        setExplanation('AI explanation failed. Please check your AI provider settings.');
        setExplaining(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // ── AI Code stream listener ───────────────────────────────────────────────
  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || msg.tabId !== codeReqIdRef.current) return;

      if (msg.type === 'ai:chunk') {
        const delta = (msg.delta as string) || (msg.text as string) || '';
        codeAccRef.current += delta;
        setCodeRaw(codeAccRef.current);
      }
      if (msg.type === 'ai:complete') {
        const msgPayload = msg.message as Record<string, unknown> | undefined;
        const content = codeAccRef.current || (msgPayload?.content as string) || '';
        // Strip fences and parse JSON
        const stripped = content
          .replace(/^```(?:json)?\s*/im, '')
          .replace(/\s*```\s*$/im, '')
          .trim();
        try {
          const parsed = JSON.parse(stripped) as ExtractedRequest;
          setCodeExtracted(parsed);
          setCodeError('');
        } catch {
          setCodeError('AI returned an unexpected format. Please try again.');
        }
        setCodeExtracting(false);
        setCodeRaw('');
      }
      if (msg.type === 'ai:error') {
        setCodeError((msg.message as string) || 'Extraction failed. Please try again.');
        setCodeExtracting(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // ── Trigger AI code extraction ────────────────────────────────────────────
  const handleExtractCode = () => {
    const trimmed = codeInput.trim();
    if (!trimmed) { setCodeError('Paste code first.'); return; }

    setCodeExtracting(true);
    setCodeExtracted(null);
    setCodeRaw('');
    setCodeError('');
    codeAccRef.current = '';

    const pid = `ai-code-import-${Date.now()}`;
    codeReqIdRef.current = pid;

    const systemPrompt = resolve('rest.code.import.system');
    const userPrompt = resolve('rest.code.import', { code: trimmed.slice(0, 6000) });

    postMsg({
      type: 'ai:send',
      tabId: pid,
      provider: '', model: '', baseUrl: '',
      stage: 'rest.code.import',
      systemPrompts: [systemPrompt],
      userPrompt,
      conversation: [],
      tools: [],
      settings: {
        temperature: 0.1,
        maxTokens: 1024,
        stream: true,
        topP: 1,
        stopSequences: [],
        responseFormat: 'text',
        frequencyPenalty: 0,
        presencePenalty: 0,
        seed: null,
      },
      mcpServerConfigs: [],
    });
  };

  // ── Apply extracted request to active tab ─────────────────────────────────
  const handleApplyExtracted = () => {
    if (!codeExtracted) return;
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;

    const { method, url, headers, bodyMode, bodyRaw, bodyFormData, bodyUrlEncoded } = codeExtracted;

    updateTab(tab.id, {
      method: (method as any) || 'GET',
      url: url || '',
      headers: headers && headers.length > 0
        ? [...headers.map(h => ({ ...h, id: crypto.randomUUID() })), { id: crypto.randomUUID(), key: '', value: '', enabled: true }]
        : [{ id: crypto.randomUUID(), key: '', value: '', enabled: true }],
      bodyMode: bodyMode || 'none',
      bodyRaw: bodyRaw || '',
      bodyFormData: bodyFormData && bodyFormData.length > 0
        ? [...bodyFormData.map(h => ({ ...h, id: crypto.randomUUID() })), { id: crypto.randomUUID(), key: '', value: '', type: 'text', enabled: true }]
        : [{ id: crypto.randomUUID(), key: '', value: '', type: 'text', enabled: true }],
      bodyUrlEncoded: bodyUrlEncoded && bodyUrlEncoded.length > 0
        ? [...bodyUrlEncoded.map(h => ({ ...h, id: crypto.randomUUID() })), { id: crypto.randomUUID(), key: '', value: '', enabled: true }]
        : [{ id: crypto.randomUUID(), key: '', value: '', enabled: true }],
    });

    onClose();
  };

  // ── Trigger AI explanation ────────────────────────────────────────────────
  const handleExplain = () => {
    const trimmed = input.trim();
    if (!trimmed) {
      setError('Paste a cURL command first to explain it.');
      return;
    }
    setExplaining(true);
    setExplanation('');
    setError('');
    explainAccRef.current = '';

    const pid = `ai-curl-explain-${Date.now()}`;
    explainReqIdRef.current = pid;

    const systemPrompt = resolve('rest.curl.explain.system');
    const userPrompt = resolve('rest.curl.explain', { curlCommand: trimmed });

    postMsg({
      type: 'ai:send',
      tabId: pid,
      provider: '', model: '', baseUrl: '',
      stage: 'rest.curl.explain',
      systemPrompts: [systemPrompt],
      userPrompt,
      conversation: [],
      tools: [],
      settings: {
        temperature: 0.2,
        maxTokens: 800,
        stream: true,
        topP: 1,
        stopSequences: [],
        responseFormat: 'text',
        frequencyPenalty: 0,
        presencePenalty: 0,
        seed: null,
      },
      mcpServerConfigs: [],
    });
  };

  // ── Import handler ────────────────────────────────────────────────────────
  const handleImport = () => {
    const trimmed = input.trim();
    if (!trimmed) {
      setError('Please paste a cURL command.');
      return;
    }

    try {
      const parsed = parseCurl(trimmed);
      if (!parsed.url) {
        setError('Could not find a URL in the cURL command.');
        return;
      }

      const tab = tabs.find(t => t.id === activeTabId);
      if (!tab) return;

      updateTab(tab.id, {
        method: parsed.method as any,
        url: parsed.url,
        headers: parsed.headers.length > 0
          ? [...parsed.headers.map(h => ({ ...h, id: crypto.randomUUID() })), { id: crypto.randomUUID(), key: '', value: '', enabled: true }]
          : [{ id: crypto.randomUUID(), key: '', value: '', enabled: true }],
        bodyMode: parsed.bodyMode,
        bodyRaw: parsed.bodyRaw,
        bodyFormData: parsed.bodyFormData.length > 0
          ? [...parsed.bodyFormData.map(h => ({ ...h, id: crypto.randomUUID() })), { id: crypto.randomUUID(), key: '', value: '', type: 'text', enabled: true }]
          : [{ id: crypto.randomUUID(), key: '', value: '', type: 'text', enabled: true }],
        bodyUrlEncoded: parsed.bodyUrlEncoded.length > 0
          ? [...parsed.bodyUrlEncoded.map(h => ({ ...h, id: crypto.randomUUID() })), { id: crypto.randomUUID(), key: '', value: '', enabled: true }]
          : [{ id: crypto.randomUUID(), key: '', value: '', enabled: true }],
      });

      onClose();
    } catch (e) {
      setError('Failed to parse cURL command. Please check the syntax.');
    }
  };

  if (!open) return null;

  const showExplainPanel = explaining || explanation;

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50"
    >
      <div
        className="w-full max-w-[600px] rounded-xl border shadow-2xl flex flex-col max-h-[88vh]"
        style={{
          backgroundColor: 'var(--color-elevated)',
          borderColor: 'var(--color-elevated-border)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[var(--color-surface-border)] flex-shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-[20px] font-semibold text-[var(--color-text-primary)]">Import Request</h2>
            {/* Mode tabs */}
            <div
              className="flex items-center gap-0.5 p-0.5 rounded-md"
              style={{ backgroundColor: 'var(--color-surface-hover)' }}
            >
              {(['curl', 'code'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => { setImportMode(mode); setError(''); setCodeError(''); }}
                  className="px-2.5 py-1 text-[11px] font-medium rounded cursor-pointer transition-all"
                  style={importMode === mode ? {
                    backgroundColor: mode === 'code' ? `color-mix(in srgb, ${CODE_ACCENT} 20%, var(--color-elevated))` : 'var(--color-elevated)',
                    color: mode === 'code' ? CODE_ACCENT : 'var(--color-text-primary)',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                  } : { color: 'var(--color-text-muted)' }}
                >
                  {mode === 'curl' ? 'cURL' : 'Code'}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--color-error)] hover:opacity-80 cursor-pointer transition-opacity"
          >
            <CloseIcon size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3">

          {/* ── cURL mode ─────────────────────────────────────────────── */}
          {importMode === 'curl' && (
            <>
          <label className="block text-[12px] font-medium text-[var(--color-text-secondary)]">Paste your cURL command below</label>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(''); }}
            placeholder={`curl --request GET \\\n  --url https://api.example.com/data \\\n  --header 'Content-Type: application/json'`}
            rows={8}
            className="w-full px-3 py-2.5 rounded-lg bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[12.5px] text-[var(--color-text-primary)] font-mono placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] resize-none"
          />
          {error && (
            <p className="text-[12px] text-[var(--color-error)]">{error}</p>
          )}

          {/* AI Explain trigger row */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExplain}
              disabled={explaining || !input.trim()}
              className="flex items-center gap-1.5 h-[28px] px-3 rounded-md text-[11px] font-medium cursor-pointer transition-all disabled:opacity-40"
              style={{
                backgroundColor: `color-mix(in srgb, ${EXPLAIN_ACCENT} 12%, transparent)`,
                color: EXPLAIN_ACCENT,
                border: `1px solid color-mix(in srgb, ${EXPLAIN_ACCENT} 30%, transparent)`,
              }}
            >
              <SparkleIcon size={12} className={explaining ? 'animate-pulse' : ''} />
              {explaining ? 'Explaining…' : 'Explain with AI'}
            </button>
            {explanation && !explaining && (
              <button
                type="button"
                onClick={() => { setExplanation(''); explainAccRef.current = ''; }}
                className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer underline"
              >
                Clear
              </button>
            )}
          </div>

          {/* AI Explanation panel */}
          {showExplainPanel && (
            <div
              className="rounded-lg border p-3 max-h-[220px] overflow-y-auto [scrollbar-gutter:stable]"
              style={{
                backgroundColor: `color-mix(in srgb, ${EXPLAIN_ACCENT} 4%, var(--color-panel))`,
                borderColor: `color-mix(in srgb, ${EXPLAIN_ACCENT} 25%, var(--color-surface-border))`,
              }}
            >
              {explaining && !explanation && (
                <div className="flex gap-1 items-center py-1">
                  {[0, 150, 300].map(d => (
                    <span
                      key={d}
                      className="w-[5px] h-[5px] rounded-full animate-pulse"
                      style={{ backgroundColor: EXPLAIN_ACCENT, animationDelay: `${d}ms` }}
                    />
                  ))}
                  <span className="text-[11px] text-[var(--color-text-muted)] ml-1.5">Analyzing command…</span>
                </div>
              )}
              {explanation && (
                <pre
                  className="text-[11.5px] whitespace-pre-wrap font-sans leading-relaxed"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {explanation}
                </pre>
              )}
            </div>
          )}
            </>
          )}

          {/* ── Code mode ─────────────────────────────────────────────── */}
          {importMode === 'code' && (
            <>
              <div>
                <label className="block text-[12px] font-medium mb-1.5 text-[var(--color-text-secondary)]">
                  Paste your code below
                </label>
                <p className="text-[11px] text-[var(--color-text-muted)] mb-2">
                  Supports fetch, axios, XMLHttpRequest, Python requests, curl, and most HTTP client patterns.
                </p>
                <textarea
                  ref={codeTextareaRef}
                  autoFocus={importMode === 'code'}
                  value={codeInput}
                  onChange={(e) => { setCodeInput(e.target.value); setCodeError(''); setCodeExtracted(null); }}
                  placeholder={`// Paste any HTTP code:\nconst res = await fetch('https://api.example.com/users', {\n  method: 'POST',\n  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer token' },\n  body: JSON.stringify({ name: 'Alice', email: 'alice@example.com' })\n});\n\n// Or Python requests:\n# requests.post('https://...', json={...}, headers={...})`}
                  rows={10}
                  className="w-full px-3 py-2.5 rounded-lg border text-[12px] text-[var(--color-text-primary)] font-mono placeholder:text-[var(--color-text-muted)] focus:outline-none resize-none"
                  style={{
                    backgroundColor: 'var(--color-input-bg)',
                    borderColor: 'var(--color-input-border)',
                  }}
                />
              </div>

              {codeError && (
                <p className="text-[12px]" style={{ color: 'var(--color-error)' }}>{codeError}</p>
              )}

              {/* Extract button */}
              {!codeExtracted && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExtractCode}
                    disabled={codeExtracting || !codeInput.trim()}
                    className="flex items-center gap-1.5 h-[28px] px-3 rounded-md text-[11px] font-medium cursor-pointer transition-all disabled:opacity-40"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${CODE_ACCENT} 12%, transparent)`,
                      color: CODE_ACCENT,
                      border: `1px solid color-mix(in srgb, ${CODE_ACCENT} 30%, transparent)`,
                    }}
                  >
                    <SparkleIcon size={12} className={codeExtracting ? 'animate-pulse' : ''} />
                    {codeExtracting ? 'Extracting…' : 'Extract with AI'}
                  </button>
                </div>
              )}

              {/* Streaming indicator */}
              {codeExtracting && (
                <div className="flex gap-1 items-center py-1">
                  {[0, 150, 300].map(d => (
                    <span key={d} className="w-[5px] h-[5px] rounded-full animate-pulse"
                      style={{ backgroundColor: CODE_ACCENT, animationDelay: `${d}ms` }} />
                  ))}
                  <span className="text-[11px] text-[var(--color-text-muted)] ml-1.5">
                    {codeRaw ? 'Parsing response…' : 'Analyzing code…'}
                  </span>
                </div>
              )}

              {/* Extracted result preview */}
              {codeExtracted && (
                <div
                  className="rounded-lg border p-3 space-y-2"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${CODE_ACCENT} 4%, var(--color-panel))`,
                    borderColor: `color-mix(in srgb, ${CODE_ACCENT} 25%, var(--color-surface-border))`,
                  }}
                >
                  <p className="text-[11px] font-semibold" style={{ color: CODE_ACCENT }}>
                    ✨ Extracted Request
                  </p>
                  <div className="space-y-1 text-[11.5px]" style={{ color: 'var(--color-text-secondary)' }}>
                    <div className="flex items-center gap-2">
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold"
                        style={{ backgroundColor: `color-mix(in srgb, ${CODE_ACCENT} 15%, transparent)`, color: CODE_ACCENT }}
                      >
                        {codeExtracted.method || 'GET'}
                      </span>
                      <span className="font-mono truncate">{codeExtracted.url || '—'}</span>
                    </div>
                    {codeExtracted.headers?.filter(h => h.key).length > 0 && (
                      <p>{codeExtracted.headers.filter(h => h.key).length} header(s) found</p>
                    )}
                    {codeExtracted.bodyMode && codeExtracted.bodyMode !== 'none' && (
                      <p>Body: {codeExtracted.bodyMode}{codeExtracted.bodyRaw ? ` (${codeExtracted.bodyRaw.length} chars)` : ''}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setCodeExtracted(null); setCodeRaw(''); }}
                    className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer underline"
                  >
                    Clear
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-[var(--color-surface-border)] flex-shrink-0">
          {importMode === 'curl' ? (
            <button
              type="button"
              onClick={handleImport}
              disabled={!input.trim()}
              className="h-[36px] px-4 text-[12.5px] font-medium rounded-lg bg-[var(--color-primary)] text-white hover:opacity-90 cursor-pointer transition-opacity disabled:opacity-40 disabled:pointer-events-none"
            >
              Import
            </button>
          ) : (
            <button
              type="button"
              onClick={handleApplyExtracted}
              disabled={!codeExtracted}
              className="h-[36px] px-4 text-[12.5px] font-medium rounded-lg text-white hover:opacity-90 cursor-pointer transition-opacity disabled:opacity-40 disabled:pointer-events-none"
              style={{ backgroundColor: codeExtracted ? CODE_ACCENT : undefined, opacity: codeExtracted ? 1 : 0.4 }}
            >
              Apply to Request
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="h-[36px] px-4 text-[12.5px] font-medium rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
