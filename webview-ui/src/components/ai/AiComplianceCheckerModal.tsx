/**
 * AiComplianceCheckerModal — AI checks if API follows REST best practices.
 * Feature 4.6.19 — AI API Compliance Checker
 */
import { useState, useEffect, useRef } from 'react';
import { SparkleIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useSidebarDataStore } from '../../store/sidebar-data-store';
import { MdViewer } from '../shared/display/MdViewer';
import { ModalView, AIButtonView, ButtonView, SelectInputView, MultilineInputView } from '@salilvnair/dui';
import { useAiCollectionCacheStore } from '../../store/ai-collection-cache-store';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-info)';

const SYSTEM_PROMPT = `You are a REST API compliance auditor. Analyze the provided API endpoints for adherence to REST best practices.

Check for:
1. **HTTP Methods**: Correct use of GET/POST/PUT/PATCH/DELETE
2. **Status Codes**: Proper HTTP status codes (201 for create, 204 for delete, 422 for validation errors, etc.)
3. **URL Design**: Plural nouns (/users not /user), no verbs (/users/{id} not /getUser), proper nesting depth
4. **Versioning**: API versioning present (/v1/, /api/v2/, etc.)
5. **Naming conventions**: kebab-case or camelCase consistency, no snake_case in URLs
6. **Idempotency**: PUT/DELETE are idempotent, POST is not
7. **Response envelope**: Consistent response structure
8. **Pagination**: Presence for list endpoints
9. **Auth**: Consistent auth mechanism

Format response as markdown:
## Compliance Score: X/10

### ✅ Passing (N checks)
- ...

### ⚠️ Warnings (N issues)
- ...

### ❌ Violations (N issues)
- **Issue**: description
  **Fix**: how to fix it

### Recommendations
- ...`;

export function AiComplianceCheckerModal({ onClose }: Props) {
  const [selectedCollection, setSelectedCollection] = useState('');
  const [customEndpoints, setCustomEndpoints] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const accRef = useRef('');
  const reqIdRef = useRef('');
  const collections = useSidebarDataStore(s => s.getCollections('rest'));
  const cacheGet = useAiCollectionCacheStore(s => s.get);
  const cacheSet = useAiCollectionCacheStore(s => s.set);

  // Cache-first: picking a collection that was already audited shows the last
  // result instead of re-running the AI call — Audit again is always explicit.
  useEffect(() => {
    if (!selectedCollection) return;
    const cached = cacheGet(`compliance:${selectedCollection}`);
    setResult(cached ? (cached.payload as string) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCollection]);

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
        if (selectedCollection) cacheSet(`compliance:${selectedCollection}`, content);
      }
      if (msg.type === 'ai:error') {
        setError((msg.message as string) || 'Analysis failed.');
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCollection]);

  const run = () => {
    const collection = collections.find(c => c.id === selectedCollection);
    const input = customEndpoints.trim() || (collection ? `Collection: ${collection.name}\nEndpoints: (collection data)` : '');
    if (!input) { setError('Select a collection or paste endpoint list.'); return; }
    setLoading(true);
    setResult('');
    setError('');
    accRef.current = '';
    const pid = `ai-compliance-${Date.now()}`;
    reqIdRef.current = pid;

    postMsg({
      type: 'ai:send', tabId: pid, provider: '', model: '', baseUrl: '',
      stage: 'collection.compliance',
      systemPrompts: [SYSTEM_PROMPT],
      userPrompt: `Audit these API endpoints for REST compliance:\n\n${input}`,
      conversation: [], tools: [],
      settings: { temperature: 0.1, maxTokens: 1500, stream: true, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
      mcpServerConfigs: [],
    });
  };

  return (
    <ModalView
      open
      onClose={onClose}
      title="REST Compliance Checker"
      subtitle="Check if your API follows REST best practices"
      size="lg"
      headerColor={ACCENT}
      headerIcon={
        <div style={{
          width: 26, height: 26, borderRadius: 6, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'color-mix(in srgb, var(--color-info) 18%, transparent)',
        }}>
          <SparkleIcon size={13} style={{ color: ACCENT }} />
        </div>
      }
      footerRight={
        <>
          {result && !loading && (
            <ButtonView size="md" onClick={run}>Re-audit</ButtonView>
          )}
          <AIButtonView
            label={loading ? 'Auditing…' : 'Audit API'}
            size="md"
            accentColor={ACCENT}
            loading={loading}
            disabled={loading}
            onClick={run}
          />
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, marginBottom: 6, color: 'var(--color-text-secondary)' }}>Collection</label>
          <SelectInputView
            value={selectedCollection}
            options={[{ value: '', label: 'None (use custom endpoints below)' }, ...collections.map(c => ({ value: c.id, label: c.name }))]}
            onChange={setSelectedCollection}
            size="md"
            accentColor={ACCENT}
            width="100%"
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, marginBottom: 6, color: 'var(--color-text-secondary)' }}>Or paste endpoint list</label>
          <MultilineInputView
            value={customEndpoints}
            onChange={e => { setCustomEndpoints(e.target.value); setError(''); }}
            rows={6}
            size="md"
            width="fw"
            placeholder={`GET /users\nPOST /users\nGET /users/{id}\nPUT /users/{id}\nDELETE /users/{id}\nPOST /getUser  ← compliance issue example`}
            style={{ fontFamily: 'monospace', fontSize: 11.5 }}
          />
        </div>

        {error && <p style={{ fontSize: 11, color: 'var(--color-error)', margin: 0 }}>{error}</p>}

        {loading && !result && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {[0, 150, 300].map(d => (
              <span key={d} className="animate-pulse" style={{
                width: 4, height: 4, borderRadius: '50%', background: ACCENT, animationDelay: `${d}ms`,
              }} />
            ))}
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 6 }}>Auditing API…</span>
          </div>
        )}

        {result && (
          <div style={{
            borderRadius: 8, padding: 16,
            border: `1px solid color-mix(in srgb, ${ACCENT} 25%, var(--color-surface-border))`,
            background: `color-mix(in srgb, ${ACCENT} 3%, var(--color-panel))`,
          }}>
            <MdViewer content={result} />
            {loading && <span className="animate-pulse" style={{ display: 'inline-block', width: 2, height: 12, marginLeft: 2, background: ACCENT }} />}
          </div>
        )}
      </div>
    </ModalView>
  );
}
