/**
 * AiSdkGeneratorModal — generates a full client SDK from a collection.
 * Feature 4.6.13 — AI SDK Generator (Multi-Language)
 *
 * From collection → generate full reusable client class in TS/Python/Go/Java/C#
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SparkleIcon, CloseIcon, CopyIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useSidebarDataStore } from '../../store/sidebar-data-store';
import { StyledDropdown } from '../shared/controls/StyledDropdown';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-ai)';

const LANGUAGES = [
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'go', label: 'Go' },
  { value: 'java', label: 'Java' },
  { value: 'csharp', label: 'C#' },
  { value: 'rust', label: 'Rust' },
];

const SYSTEM_PROMPT = `You are an API SDK generator. Given a collection of API endpoints, generate a complete, reusable client SDK class/module.

The SDK should:
- Have a clean class or module structure with a constructor that accepts baseUrl and optional auth token
- Have one method per unique endpoint (named descriptively, e.g. getUsers(), createUser(), deleteUser())
- Handle authentication (Bearer token, API key, or basic auth as appropriate)
- Include proper error handling
- Use the standard HTTP library for the language (axios for TS, requests for Python, net/http for Go, etc.)
- Add JSDoc/docstring comments for each method
- Include a README-style usage example at the top as a comment

Output ONLY the code — no markdown fences, no explanation. Just clean, production-ready code.`;

export function AiSdkGeneratorModal({ onClose }: Props) {
  const [selectedCollection, setSelectedCollection] = useState('');
  const [language, setLanguage] = useState('typescript');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const accRef = useRef('');
  const reqIdRef = useRef('');
  const collections = useSidebarDataStore(s => s.getCollections('rest'));

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || msg.tabId !== reqIdRef.current) return;
      if (msg.type === 'ai:chunk') {
        accRef.current += (msg.delta as string) || '';
        setResult(accRef.current);
      }
      if (msg.type === 'ai:complete') {
        setResult(accRef.current || '');
        setLoading(false);
      }
      if (msg.type === 'ai:error') {
        setError((msg.message as string) || 'SDK generation failed.');
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const run = () => {
    const collection = collections.find(c => c.id === selectedCollection);
    if (!collection) { setError('Select a collection first.'); return; }
    setLoading(true);
    setResult('');
    setError('');
    accRef.current = '';
    const pid = `ai-sdk-${Date.now()}`;
    reqIdRef.current = pid;

    const summary = JSON.stringify({ name: collection.name, requests: [] }, null, 2);

    postMsg({
      type: 'ai:send', tabId: pid, provider: '', model: '', baseUrl: '',
      stage: 'collection.sdk.generate',
      systemPrompts: [SYSTEM_PROMPT],
      userPrompt: `Generate a ${LANGUAGES.find(l => l.value === language)?.label} SDK for this collection:\n\n${summary}`,
      conversation: [], tools: [],
      settings: { temperature: 0.2, maxTokens: 4096, stream: true, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
      mcpServerConfigs: [],
    });
  };

  const copy = async () => {
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-[740px] max-h-[90vh] flex flex-col rounded-xl border shadow-2xl"
        style={{ backgroundColor: 'var(--color-panel)', borderColor: 'var(--color-surface-border)' }}>

        <div className="flex items-center gap-2.5 px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <SparkleIcon size={15} style={{ color: ACCENT }} />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">AI SDK Generator</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">Collection → full client SDK in any language</p>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer">
            <CloseIcon size={12} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Collection</label>
              <StyledDropdown
                value={selectedCollection}
                options={collections.map(c => ({ value: c.id, label: c.name }))}
                onChange={setSelectedCollection}
                placeholder="Select collection…"
              />
            </div>
            <div className="w-40">
              <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Language</label>
              <StyledDropdown value={language} options={LANGUAGES} onChange={setLanguage} />
            </div>
          </div>

          {error && <p className="text-[11px]" style={{ color: 'var(--color-error)' }}>{error}</p>}

          {loading && !result && (
            <div className="flex gap-1 items-center py-4">
              {[0, 150, 300].map(d => (
                <span key={d} className="w-[5px] h-[5px] rounded-full animate-pulse"
                  style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />
              ))}
              <span className="text-[11px] text-[var(--color-text-muted)] ml-1.5">Generating {LANGUAGES.find(l => l.value === language)?.label} SDK…</span>
            </div>
          )}

          {result && (
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-surface-border)' }}>
              <div className="flex items-center justify-between px-3 py-1.5 border-b"
                style={{ backgroundColor: 'var(--color-surface-hover)', borderColor: 'var(--color-surface-border)' }}>
                <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
                  {LANGUAGES.find(l => l.value === language)?.label} SDK
                </span>
                <button type="button" onClick={copy}
                  className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded cursor-pointer"
                  style={{ color: copied ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                  <CopyIcon size={11} />
                  {copied ? 'Copied!' : 'Copy all'}
                </button>
              </div>
              <pre className="p-4 text-[11px] font-mono overflow-auto whitespace-pre-wrap max-h-[400px]"
                style={{ color: 'var(--color-text-primary)', backgroundColor: 'var(--color-panel)' }}>
                {result}
                {loading && <span className="inline-block w-[2px] h-[11px] ml-0.5 animate-pulse" style={{ backgroundColor: ACCENT }} />}
              </pre>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end px-5 py-3 border-t flex-shrink-0 gap-2" style={{ borderColor: 'var(--color-surface-border)' }}>
          {result && !loading && (
            <button type="button" onClick={run}
              className="h-[30px] px-3 text-[11px] rounded-md cursor-pointer border"
              style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>
              Regenerate
            </button>
          )}
          <button type="button" onClick={run} disabled={loading || !selectedCollection}
            className="h-[32px] px-4 text-[12px] font-medium rounded-md cursor-pointer hover:opacity-90 disabled:opacity-40 text-white"
            style={{ backgroundColor: ACCENT }}>
            <SparkleIcon size={11} className="inline mr-1" />
            Generate SDK
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
