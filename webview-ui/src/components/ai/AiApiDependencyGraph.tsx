/**
 * AiApiDependencyGraph — AI analyzes collection and shows visual request dependency map.
 * Feature 4.6.10 — AI API Dependency Graph
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SparkleIcon, CloseIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useSidebarDataStore } from '../../store/sidebar-data-store';
import { MdViewer } from '../shared/display/MdViewer';
import { StyledDropdown } from '../shared/controls/StyledDropdown';

interface DependencyNode {
  name: string;
  method: string;
  url: string;
  dependsOn: string[];
  provides: string[];
  note?: string;
}

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-ai)';

const SYSTEM_PROMPT = `You are an API dependency analyzer. Given a collection of API endpoints, identify which requests depend on which.

A dependency exists when:
- Request B needs a value extracted from Request A's response (e.g., userId from login → used in getUser)
- Request B can only succeed after Request A (e.g., must create before you can update)

Return ONLY a JSON array:
[
  {
    "name": "Login",
    "method": "POST",
    "url": "/auth/login",
    "dependsOn": [],
    "provides": ["authToken", "userId"],
    "note": "Entry point — must run first"
  },
  {
    "name": "Get User",
    "method": "GET",
    "url": "/users/{userId}",
    "dependsOn": ["Login"],
    "provides": ["userEmail", "userRole"],
    "note": "Requires userId from Login response"
  }
]`;

export function AiApiDependencyGraph({ onClose }: Props) {
  const [selectedCollection, setSelectedCollection] = useState('');
  const [graph, setGraph] = useState<DependencyNode[] | null>(null);
  const [rawResult, setRawResult] = useState('');
  const [explanation, setExplanation] = useState('');
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
        setRawResult(accRef.current);
      }
      if (msg.type === 'ai:complete') {
        const content = accRef.current || '';
        setLoading(false);
        try { setGraph(JSON.parse(content)); }
        catch { setExplanation(content); }
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
    if (!collection) { setError('Select a collection first.'); return; }
    setLoading(true);
    setRawResult('');
    setGraph(null);
    setExplanation('');
    setError('');
    accRef.current = '';
    const pid = `ai-deps-${Date.now()}`;
    reqIdRef.current = pid;

    postMsg({
      type: 'ai:send', tabId: pid, provider: '', model: '', baseUrl: '',
      stage: 'collection.dependency.graph',
      systemPrompts: [SYSTEM_PROMPT],
      userPrompt: `Analyze dependencies for collection: ${collection.name}\n\nEndpoints: (collection data would be serialized here)`,
      conversation: [], tools: [],
      settings: { temperature: 0.1, maxTokens: 2000, stream: true, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
      mcpServerConfigs: [],
    });
  };

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-[720px] max-h-[90vh] flex flex-col rounded-xl border shadow-2xl"
        style={{ backgroundColor: 'var(--color-panel)', borderColor: 'var(--color-surface-border)' }}>

        <div className="flex items-center gap-2.5 px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <SparkleIcon size={15} style={{ color: ACCENT }} />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">API Dependency Graph</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">Visualize which requests depend on which</p>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer">
            <CloseIcon size={12} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          <div>
            <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Collection</label>
            <StyledDropdown
              value={selectedCollection}
              options={collections.map(c => ({ value: c.id, label: c.name }))}
              onChange={setSelectedCollection}
              placeholder="Select collection…"
            />
          </div>

          {error && <p className="text-[11px]" style={{ color: 'var(--color-error)' }}>{error}</p>}

          {loading && (
            <div className="flex gap-1 items-center py-4">
              {[0, 150, 300].map(d => (
                <span key={d} className="w-[5px] h-[5px] rounded-full animate-pulse"
                  style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />
              ))}
              <span className="text-[11px] text-[var(--color-text-muted)] ml-1.5">Analyzing dependencies…</span>
            </div>
          )}

          {graph && (
            <div className="flex flex-col gap-3">
              <p className="text-[11px] font-semibold" style={{ color: ACCENT }}>✦ {graph.length} requests mapped</p>
              {graph.map((node, i) => (
                <div key={i} className="rounded-lg border p-3"
                  style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-panel)' }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[9px] font-bold text-white px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--color-info)' }}>
                      {node.method}
                    </span>
                    <span className="text-[11.5px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>{node.name}</span>
                    <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>{node.url}</span>
                  </div>
                  {node.dependsOn.length > 0 && (
                    <p className="text-[10px]" style={{ color: 'var(--color-warning)' }}>
                      ← Depends on: {node.dependsOn.join(', ')}
                    </p>
                  )}
                  {node.provides.length > 0 && (
                    <p className="text-[10px]" style={{ color: 'var(--color-success)' }}>
                      → Provides: {node.provides.map(p => `{{${p}}}`).join(', ')}
                    </p>
                  )}
                  {node.note && (
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{node.note}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {explanation && !graph && (
            <div className="rounded-lg border p-4" style={{ borderColor: 'var(--color-surface-border)' }}>
              <MdViewer content={explanation} />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end px-5 py-3 border-t flex-shrink-0 gap-2" style={{ borderColor: 'var(--color-surface-border)' }}>
          <button type="button" onClick={run} disabled={loading || !selectedCollection}
            className="h-[32px] px-4 text-[12px] font-medium rounded-md cursor-pointer hover:opacity-90 disabled:opacity-40 text-white"
            style={{ backgroundColor: ACCENT }}>
            <SparkleIcon size={11} className="inline mr-1" />
            Analyze Dependencies
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
