import { useEffect, useRef, useState } from 'react';
import { parseCurl } from '../../../utils/curl-parser';
import { useTabsStore } from '../../../store/tabs-store';
import { useAiPromptTemplatesStore } from '../../../store/prompt-template';
import { postMsg } from '../../../vscode';
import { SparkleIcon } from '../../../icons';
import { ModalView, PilledTabView, MultilineInputView, AIButtonView, ButtonView } from '@salilvnair/dui';

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
        ? [...bodyFormData.map(h => ({ ...h, id: crypto.randomUUID(), type: (h.type === 'file' ? 'file' : 'text') as 'text' | 'file' })), { id: crypto.randomUUID(), key: '', value: '', type: 'text' as const, enabled: true }]
        : [{ id: crypto.randomUUID(), key: '', value: '', type: 'text' as const, enabled: true }],
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
          ? [...parsed.bodyFormData.map(h => ({ ...h, id: crypto.randomUUID(), type: (h.type === 'file' ? 'file' : 'text') as 'text' | 'file' })), { id: crypto.randomUUID(), key: '', value: '', type: 'text' as const, enabled: true }]
          : [{ id: crypto.randomUUID(), key: '', value: '', type: 'text' as const, enabled: true }],
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

  return (
    <ModalView
      open={open}
      onClose={onClose}
      title="Import Request"
      size="md"
      footerRight={
        importMode === 'curl' ? (
          <ButtonView size="md" onClick={handleImport} disabled={!input.trim()} accentColor="var(--color-primary)">
            Import
          </ButtonView>
        ) : (
          <ButtonView size="md" onClick={handleApplyExtracted} disabled={!codeExtracted} accentColor={CODE_ACCENT}>
            Apply to Request
          </ButtonView>
        )
      }
    >
      <div className="space-y-3">
        {/* Mode tabs */}
        <div style={{ display: 'inline-flex' }}>
          <PilledTabView
            tabs={[{ id: 'curl', label: 'cURL' }, { id: 'code', label: 'Code' }]}
            activeId={importMode}
            onChange={(id) => { setImportMode(id as 'curl' | 'code'); setError(''); setCodeError(''); }}
            accentColor={importMode === 'code' ? CODE_ACCENT : 'var(--color-primary)'}
          />
        </div>

        {/* ── cURL mode ─────────────────────────────────────────────── */}
        {importMode === 'curl' && (
          <>
            <label className="block text-[12px] font-medium text-[var(--color-text-secondary)]">Paste your cURL command below</label>
            <MultilineInputView
              ref={textareaRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); setError(''); }}
              placeholder={`curl --request GET \\\n  --url https://api.example.com/data \\\n  --header 'Content-Type: application/json'`}
              rows={8}
              width="fullWidth"
            />
            {error && (
              <p className="text-[12px] text-[var(--color-error)]">{error}</p>
            )}

            {/* AI Explain trigger row */}
            <div className="flex items-center gap-2">
              <AIButtonView
                action="explain"
                label={explaining ? 'Explaining…' : 'Explain with AI'}
                onClick={handleExplain}
                loading={explaining}
                disabled={explaining || !input.trim()}
                size="sm"
                accentColor={EXPLAIN_ACCENT}
              />
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
              <MultilineInputView
                ref={codeTextareaRef}
                autoFocus={importMode === 'code'}
                value={codeInput}
                onChange={(e) => { setCodeInput(e.target.value); setCodeError(''); setCodeExtracted(null); }}
                placeholder={`// Paste any HTTP code:\nconst res = await fetch('https://api.example.com/users', {\n  method: 'POST',\n  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer token' },\n  body: JSON.stringify({ name: 'Alice', email: 'alice@example.com' })\n});\n\n// Or Python requests:\n# requests.post('https://...', json={...}, headers={...})`}
                rows={10}
                width="fullWidth"
              />
            </div>

            {codeError && (
              <p className="text-[12px]" style={{ color: 'var(--color-error)' }}>{codeError}</p>
            )}

            {/* Extract button */}
            {!codeExtracted && (
              <div className="flex items-center gap-2">
                <AIButtonView
                  action="explain"
                  label={codeExtracting ? 'Extracting…' : 'Extract with AI'}
                  onClick={handleExtractCode}
                  loading={codeExtracting}
                  disabled={codeExtracting || !codeInput.trim()}
                  size="sm"
                  accentColor={CODE_ACCENT}
                />
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
                  <SparkleIcon size={11} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} />
                  Extracted Request
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
    </ModalView>
  );
}
