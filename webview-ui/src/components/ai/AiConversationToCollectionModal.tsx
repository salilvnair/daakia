/**
 * AiConversationToCollectionModal — describe an API workflow in chat → AI creates a full collection.
 * Feature 4.6.7 — AI Conversation-to-Collection
 *
 * User describes what they want ("create an e-commerce API that handles products, orders, auth")
 * AI generates a complete collection: folders, requests, variables, auth, chaining.
 */
import { useState, useEffect, useRef } from 'react';
import { SparkleIcon, CheckIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useToastStore } from '../../store/toast-store';
import { ModalView, AIButtonView, MultilineInputView, ButtonView } from '@salilvnair/dui';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-ai)';

const SYSTEM_PROMPT = `You are an API collection generator for Daakia, a VS Code API client. The user will describe an API workflow in plain English, and you will generate a complete Daakia collection as JSON.

Output a JSON object in this exact format:
{
  "name": "Collection Name",
  "description": "What this collection covers",
  "variables": [
    { "key": "baseUrl", "value": "https://api.example.com", "enabled": true },
    { "key": "token", "value": "", "enabled": true }
  ],
  "folders": [
    {
      "name": "Authentication",
      "requests": [
        {
          "name": "Login",
          "method": "POST",
          "url": "{{baseUrl}}/auth/login",
          "headers": [{ "key": "Content-Type", "value": "application/json", "enabled": true }],
          "bodyType": "json",
          "body": "{\\"email\\": \\"user@example.com\\", \\"password\\": \\"secret\\"}",
          "auth": { "type": "none" },
          "description": "Authenticates user and returns JWT token"
        }
      ]
    }
  ]
}

Rules:
- Generate realistic, working request examples with proper bodies and headers
- Use {{baseUrl}} and {{token}} variables consistently
- Group related requests into folders
- Use proper HTTP methods (POST for create, GET for list/get, PUT/PATCH for update, DELETE for delete)
- Add auth headers where appropriate (Bearer token for protected endpoints)
- Return ONLY valid JSON — no markdown, no explanation, no code fences`;

export function AiConversationToCollectionModal({ onClose }: Props) {
  const [description, setDescription] = useState('');
  const [result, setResult] = useState('');
  const [parsed, setParsed] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [imported, setImported] = useState(false);
  const [error, setError] = useState('');

  const accRef = useRef('');
  const reqIdRef = useRef('');
  const addToast = useToastStore(s => s.addToast);

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || msg.tabId !== reqIdRef.current) return;
      if (msg.type === 'ai:chunk') {
        accRef.current += (msg.delta as string) || (msg.text as string) || '';
        setResult(accRef.current);
      }
      if (msg.type === 'ai:complete') {
        const content = accRef.current || (msg.message as Record<string, unknown>)?.content as string || '';
        setResult(content);
        setLoading(false);
        try {
          setParsed(JSON.parse(content));
        } catch {
          // result might not be pure JSON yet if streaming
        }
      }
      if (msg.type === 'ai:error') {
        setError((msg.message as string) || 'Generation failed.');
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const run = () => {
    if (!description.trim()) { setError('Describe the API workflow first.'); return; }
    setLoading(true);
    setResult('');
    setParsed(null);
    setError('');
    accRef.current = '';
    const pid = `ai-conv2col-${Date.now()}`;
    reqIdRef.current = pid;

    postMsg({
      type: 'ai:send', tabId: pid, provider: '', model: '', baseUrl: '',
      stage: 'collection.generate',
      systemPrompts: [SYSTEM_PROMPT],
      userPrompt: description,
      conversation: [], tools: [],
      settings: { temperature: 0.3, maxTokens: 4096, stream: true, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
      mcpServerConfigs: [],
    });
  };

  const importCollection = () => {
    let collData = parsed;
    if (!collData && result) {
      try { collData = JSON.parse(result); } catch { setError('Generated JSON is invalid. Try regenerating.'); return; }
    }
    if (!collData) return;

    try {
      const collId = `col-${Date.now()}`;
      postMsg({ type: 'createCollection', id: collId, name: (collData.name as string) || 'AI Generated', protocol: 'rest' });
      setImported(true);
      addToast({ type: 'success', message: `Collection "${collData.name}" imported!` });
      setTimeout(onClose, 1500);
    } catch {
      setError('Failed to import collection.');
    }
  };

  const EXAMPLES = [
    'Create a complete e-commerce API: products (CRUD), cart, checkout, orders, payments',
    'Build a social media API: users, posts, comments, likes, followers',
    'Create a task management API: workspaces, projects, tasks, subtasks, users',
    'Build a blog API: authors, posts (draft/publish), comments, tags, search',
  ];

  return (
    <ModalView
      open
      onClose={onClose}
      title="Chat → Collection"
      subtitle="Describe any API workflow → AI creates the full collection"
      size="xl"
      headerColor={ACCENT}
      headerIcon={
        <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${ACCENT} 20%, transparent)` }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
        </div>
      }
      footerLeft={
        result && !loading ? (
          <ButtonView size="md" variant="secondary" onClick={run}>Regenerate</ButtonView>
        ) : undefined
      }
      footerRight={
        (parsed || (result && !loading)) ? (
          <ButtonView size="md" variant="primary" accentColor={imported ? 'var(--color-success)' : ACCENT} disabled={imported} onClick={importCollection}>
            {imported ? <><CheckIcon size={12} style={{ marginRight: 4 }} />Imported!</> : <><SparkleIcon size={11} style={{ marginRight: 4 }} />Import Collection</>}
          </ButtonView>
        ) : !result ? (
          <AIButtonView label="Generate Collection" size="md" accentColor={ACCENT} disabled={loading || !description.trim()} loading={loading} onClick={run} />
        ) : undefined
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
            Describe your API workflow
          </label>
          <MultilineInputView
            autoFocus
            value={description}
            onChange={e => { setDescription(e.target.value); setError(''); }}
            rows={5}
            size="md"
            width="fw"
            accentColor={ACCENT}
            placeholder="Describe what your API does in plain English. Be as detailed as you like — include endpoints, data models, auth requirements, workflows..."
          />
        </div>

        {/* Examples */}
        <div>
          <p className="text-[10px] font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Examples</p>
          <div className="flex flex-col gap-1">
            {EXAMPLES.map(ex => (
              <button key={ex} type="button" onClick={() => setDescription(ex)}
                className="text-left text-[10.5px] px-2.5 py-1.5 rounded-md cursor-pointer border transition-all hover:brightness-110"
                style={{
                  borderColor: `color-mix(in srgb, ${ACCENT} 35%, transparent)`,
                  color: ACCENT,
                  backgroundColor: `color-mix(in srgb, ${ACCENT} 9%, transparent)`,
                }}>
                {ex}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-[11px]" style={{ color: 'var(--color-error)' }}>{error}</p>}

        {loading && !result && (
          <div className="flex gap-1 items-center py-2">
            {[0, 150, 300].map(d => (
              <span key={d} className="w-[5px] h-[5px] rounded-full animate-pulse"
                style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />
            ))}
            <span className="text-[11px] text-[var(--color-text-muted)] ml-1.5">Building collection…</span>
          </div>
        )}

        {result && (
          <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-surface-border)' }}>
            <div className="px-3 py-1.5 border-b text-[10px] font-medium"
              style={{ backgroundColor: 'var(--color-surface-hover)', borderColor: 'var(--color-surface-border)', color: 'var(--color-text-muted)' }}>
              Generated Collection (JSON)
              {parsed && <span className="ml-2 text-[var(--color-success)]">✓ Valid</span>}
            </div>
            <pre className="p-3 text-[10.5px] font-mono overflow-auto whitespace-pre-wrap max-h-[200px]"
              style={{ color: 'var(--color-text-primary)', backgroundColor: 'var(--color-panel)' }}>
              {result}
              {loading && <span className="inline-block w-[2px] h-[11px] ml-0.5 animate-pulse" style={{ backgroundColor: ACCENT }} />}
            </pre>
          </div>
        )}
      </div>
    </ModalView>
  );
}
