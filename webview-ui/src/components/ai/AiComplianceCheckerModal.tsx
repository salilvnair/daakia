/**
 * AiComplianceCheckerModal — AI checks if API follows REST best practices.
 * Feature 4.6.19 — AI API Compliance Checker
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SparkleIcon, CloseIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useSidebarDataStore } from '../../store/sidebar-data-store';
import { MdViewer } from '../shared/display/MdViewer';
import { StyledDropdown } from '../shared/controls/StyledDropdown';

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
        setError((msg.message as string) || 'Analysis failed.');
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

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

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-[660px] max-h-[90vh] flex flex-col rounded-xl border shadow-2xl"
        style={{ backgroundColor: 'var(--color-panel)', borderColor: 'var(--color-surface-border)' }}>

        <div className="flex items-center gap-2.5 px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <SparkleIcon size={15} style={{ color: ACCENT }} />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">REST Compliance Checker</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">Check if your API follows REST best practices</p>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer">
            <CloseIcon size={12} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          <div>
            <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Collection</label>
            <StyledDropdown
              value={selectedCollection}
              options={[{ value: '', label: 'None (use custom endpoints below)' }, ...collections.map(c => ({ value: c.id, label: c.name }))]}
              onChange={setSelectedCollection}
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Or paste endpoint list</label>
            <textarea
              value={customEndpoints}
              onChange={e => { setCustomEndpoints(e.target.value); setError(''); }}
              rows={6}
              className="w-full px-3 py-2 rounded-lg text-[11.5px] font-mono resize-none outline-none"
              placeholder={`GET /users\nPOST /users\nGET /users/{id}\nPUT /users/{id}\nDELETE /users/{id}\nPOST /getUser  ← compliance issue example`}
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
              <span className="text-[11px] text-[var(--color-text-muted)] ml-1.5">Auditing API…</span>
            </div>
          )}

          {result && (
            <div className="rounded-lg border p-4"
              style={{ borderColor: `color-mix(in srgb, ${ACCENT} 25%, var(--color-surface-border))`, backgroundColor: `color-mix(in srgb, ${ACCENT} 3%, var(--color-panel))` }}>
              <MdViewer content={result} />
              {loading && <span className="inline-block w-[2px] h-[12px] ml-0.5 animate-pulse" style={{ backgroundColor: ACCENT }} />}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end px-5 py-3 border-t flex-shrink-0 gap-2" style={{ borderColor: 'var(--color-surface-border)' }}>
          {result && !loading && (
            <button type="button" onClick={run}
              className="h-[30px] px-3 text-[11px] rounded-md cursor-pointer border"
              style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>
              Re-audit
            </button>
          )}
          <button type="button" onClick={run} disabled={loading}
            className="h-[32px] px-4 text-[12px] font-medium rounded-md cursor-pointer hover:opacity-90 disabled:opacity-40 text-white"
            style={{ backgroundColor: ACCENT }}>
            <SparkleIcon size={11} className="inline mr-1" />
            Audit API
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
