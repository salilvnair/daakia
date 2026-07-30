/**
 * AiSdkGeneratorModal — generates a full client SDK from a collection.
 * Feature 4.6.13 — AI SDK Generator (Multi-Language)
 *
 * From collection → generate full reusable client class in TS/Python/Go/Java/C#
 */
import { useState, useEffect, useRef } from 'react';
import { SparkleIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useSidebarDataStore } from '../../store/sidebar-data-store';
import { ModalView, AIButtonView, ButtonView, SelectInputView, CodeBlockView } from '@salilvnair/dui';
import { useAiCollectionCacheStore } from '../../store/ai-collection-cache-store';

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
  const [error, setError] = useState('');

  const accRef = useRef('');
  const reqIdRef = useRef('');
  const collections = useSidebarDataStore(s => s.getCollections('rest'));
  const cacheGet = useAiCollectionCacheStore(s => s.get);
  const cacheSet = useAiCollectionCacheStore(s => s.set);
  const cacheKey = `sdk-gen:${selectedCollection}:${language}`;

  // Cache-first: picking a collection+language combo already generated shows the
  // last SDK instead of re-running the AI call — Regenerate is always explicit.
  useEffect(() => {
    if (!selectedCollection) return;
    const cached = cacheGet(cacheKey);
    setResult(cached ? (cached.payload as string) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || msg.tabId !== reqIdRef.current) return;
      if (msg.type === 'ai:chunk') {
        accRef.current += (msg.delta as string) || '';
        setResult(accRef.current);
      }
      if (msg.type === 'ai:complete') {
        const content = accRef.current || '';
        setResult(content);
        setLoading(false);
        if (selectedCollection) cacheSet(cacheKey, content);
      }
      if (msg.type === 'ai:error') {
        setError((msg.message as string) || 'SDK generation failed.');
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

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

  const langLabel = LANGUAGES.find(l => l.value === language)?.label;
  const HLJS_LANG: Record<string, string> = { typescript: 'typescript', python: 'python', go: 'go', java: 'java', csharp: 'csharp', rust: 'rust' };

  return (
    <ModalView
      open
      onClose={onClose}
      title="AI SDK Generator"
      subtitle="Collection → full client SDK in any language"
      size="lg"
      headerColor={ACCENT}
      headerIcon={
        <div style={{
          width: 26, height: 26, borderRadius: 6, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'color-mix(in srgb, var(--color-protocol-ai) 18%, transparent)',
        }}>
          <SparkleIcon size={13} style={{ color: ACCENT }} />
        </div>
      }
      footerRight={
        <>
          {result && !loading && (
            <ButtonView size="md" onClick={run}>Regenerate</ButtonView>
          )}
          <AIButtonView
            label={loading ? 'Generating…' : 'Generate SDK'}
            size="md"
            accentColor={ACCENT}
            loading={loading}
            disabled={loading || !selectedCollection}
            onClick={run}
          />
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 500, marginBottom: 6, color: 'var(--color-text-secondary)' }}>Collection</label>
            <SelectInputView
              value={selectedCollection}
              options={collections.map(c => ({ value: c.id, label: c.name }))}
              onChange={setSelectedCollection}
              placeholder="Select collection…"
              size="md"
              accentColor={ACCENT}
              width="100%"
            />
          </div>
          <div style={{ width: 160 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 500, marginBottom: 6, color: 'var(--color-text-secondary)' }}>Language</label>
            <SelectInputView
              value={language}
              options={LANGUAGES}
              onChange={setLanguage}
              size="md"
              accentColor={ACCENT}
              width="100%"
            />
          </div>
        </div>

        {error && <p style={{ fontSize: 11, color: 'var(--color-error)', margin: 0 }}>{error}</p>}

        {loading && !result && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '16px 0' }}>
            {[0, 150, 300].map(d => (
              <span key={d} className="animate-pulse" style={{
                width: 5, height: 5, borderRadius: '50%', background: ACCENT, animationDelay: `${d}ms`,
              }} />
            ))}
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 6 }}>Generating {langLabel} SDK…</span>
          </div>
        )}

        {result && (
          <CodeBlockView
            code={result}
            language={HLJS_LANG[language]}
            maxHeight="400px"
            accentColor={ACCENT}
          />
        )}
      </div>
    </ModalView>
  );
}
