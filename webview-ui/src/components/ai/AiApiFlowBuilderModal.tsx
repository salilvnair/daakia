/**
 * AiApiFlowBuilderModal — Generate a request chain from a natural language workflow description (4.4.7)
 *
 * User describes a workflow (e.g. "Log in, create an order, fetch order details, then cancel it").
 * AI generates an ordered list of HTTP steps with chained variable extractions.
 * "Create Collection" button saves the entire flow as a new collection with pre-built requests.
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { CloseIcon, SparkleIcon, PlayIcon, CheckIcon } from '../../icons';
import { postMsg } from '../../vscode';

interface VariableExtraction {
  variable: string;
  path: string;
  description: string;
}

interface FlowStep {
  step: number;
  name: string;
  method: string;
  url: string;
  headers: { key: string; value: string; enabled: boolean }[];
  bodyMode: 'raw' | 'none' | 'form-data' | 'x-www-form-urlencoded';
  bodyRaw: string;
  variableExtractions: VariableExtraction[];
  description: string;
}

interface GeneratedFlow {
  name: string;
  description: string;
  steps: FlowStep[];
}

interface Props {
  protocol?: string;
  onClose: () => void;
}

const ACCENT = 'var(--color-primary)';
const METHOD_COLORS: Record<string, string> = {
  GET: '#22c55e',
  POST: '#f59e0b',
  PUT: '#3b82f6',
  PATCH: '#8b5cf6',
  DELETE: '#ef4444',
  HEAD: '#6b7280',
  OPTIONS: '#6b7280',
};

export function AiApiFlowBuilderModal({ protocol = 'rest', onClose }: Props) {
  const [description, setDescription] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [flow, setFlow] = useState<GeneratedFlow | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);

  const accRef = useRef('');
  const reqIdRef = useRef('');
  const resolve = useAiPromptTemplatesStore(s => s.resolve);

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || msg.tabId !== reqIdRef.current) return;

      if (msg.type === 'ai:chunk') {
        const delta = (msg.delta as string) || (msg.text as string) || '';
        accRef.current += delta;
      }
      if (msg.type === 'ai:complete') {
        const msgPayload = msg.message as Record<string, unknown> | undefined;
        const content = accRef.current || (msgPayload?.content as string) || '';
        const stripped = content
          .replace(/^```(?:json)?\s*/im, '')
          .replace(/\s*```\s*$/im, '')
          .trim();
        try {
          const parsed = JSON.parse(stripped) as GeneratedFlow;
          if (!parsed.steps || !Array.isArray(parsed.steps)) throw new Error('Invalid flow structure');
          setFlow(parsed);
          setError('');
        } catch {
          setError('AI returned an unexpected format. Please try again.');
        }
        setLoading(false);
        accRef.current = '';
      }
      if (msg.type === 'ai:error') {
        setError((msg.message as string) || 'Flow generation failed.');
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleGenerate = () => {
    if (!description.trim()) { setError('Describe the workflow first.'); return; }

    setLoading(true);
    setFlow(null);
    setError('');
    setCreated(false);
    accRef.current = '';

    const pid = `ai-flow-${Date.now()}`;
    reqIdRef.current = pid;

    const systemPrompt = resolve('rest.api.flow.system');
    const userPrompt = resolve('rest.api.flow', {
      description: description.trim(),
      baseUrl: baseUrl.trim() || 'https://api.example.com',
    });

    postMsg({
      type: 'ai:send',
      tabId: pid,
      provider: '', model: '', baseUrl: '',
      stage: 'rest.api.flow',
      systemPrompts: [systemPrompt],
      userPrompt,
      conversation: [],
      tools: [],
      settings: {
        temperature: 0.2,
        maxTokens: 2000,
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

  /** Create a collection with all flow steps as individual requests */
  const handleCreateCollection = async () => {
    if (!flow) return;
    setCreating(true);

    const collectionId = crypto.randomUUID();
    const collectionName = flow.name || 'AI Flow';

    // Create the collection first
    postMsg({ type: 'createCollection', id: collectionId, name: collectionName, protocol });

    // Small delay to allow collection creation
    await new Promise(r => setTimeout(r, 120));

    // Create each step as a request inside the collection
    for (let i = 0; i < flow.steps.length; i++) {
      const step = flow.steps[i];
      const requestId = crypto.randomUUID();
      const headerRows = step.headers && step.headers.length > 0
        ? [...step.headers.map(h => ({ ...h, id: crypto.randomUUID() })), { id: crypto.randomUUID(), key: '', value: '', enabled: true }]
        : [{ id: crypto.randomUUID(), key: '', value: '', enabled: true }];

      postMsg({
        type: 'createRequest',
        collectionId,
        request: {
          id: requestId,
          name: `${i + 1}. ${step.name}`,
          method: (step.method || 'GET').toUpperCase(),
          url: step.url || '',
          headers: headerRows,
          params: [{ id: crypto.randomUUID(), key: '', value: '', enabled: true }],
          bodyMode: step.bodyMode || 'none',
          bodyRaw: step.bodyRaw || '',
          bodyFormData: [{ id: crypto.randomUUID(), key: '', value: '', type: 'text', enabled: true }],
          bodyUrlEncoded: [{ id: crypto.randomUUID(), key: '', value: '', enabled: true }],
          preRequestScript: '',
          postResponseScript: step.variableExtractions && step.variableExtractions.length > 0
            ? step.variableExtractions
                .map(v => `// Extract: ${v.description}\n// dk.env.set('${v.variable}', dk.response.json()${v.path.replace(/^\$/, '')});`)
                .join('\n\n')
            : '',
        },
      });

      await new Promise(r => setTimeout(r, 60));
    }

    // Refresh collections
    await new Promise(r => setTimeout(r, 200));
    postMsg({ type: 'getCollections' });

    setCreating(false);
    setCreated(true);
  };

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <div
        className="w-[680px] max-h-[90vh] flex flex-col rounded-xl border shadow-2xl"
        style={{ backgroundColor: 'var(--color-panel)', borderColor: 'var(--color-surface-border)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <SparkleIcon size={15} style={{ color: ACCENT }} />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">API Flow Builder</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">Describe a workflow → AI generates a request chain with variable passing</p>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer">
            <CloseIcon size={12} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {/* Workflow description */}
          <div>
            <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
              Describe the workflow
            </label>
            <textarea
              autoFocus
              value={description}
              onChange={e => { setDescription(e.target.value); setError(''); setFlow(null); setCreated(false); }}
              rows={4}
              className="w-full px-3 py-2 rounded-lg text-[12px] resize-none outline-none"
              placeholder="e.g. Log in to get a token, create a new order, fetch the order details, then cancel it"
              style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
            />
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
              Base URL <span className="font-normal italic text-[var(--color-text-muted)]">(optional — defaults to https://api.example.com)</span>
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              placeholder="https://api.myapp.com"
              className="w-full h-[32px] px-3 rounded-lg text-[12px] outline-none"
              style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
            />
          </div>

          {error && <p className="text-[11px]" style={{ color: 'var(--color-error)' }}>{error}</p>}

          {!flow && !loading && (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!description.trim()}
              className="flex items-center gap-1.5 h-[32px] px-4 text-[12px] font-medium rounded-md text-white cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-40 self-start"
              style={{ backgroundColor: ACCENT }}
            >
              <SparkleIcon size={12} />
              Generate Flow
            </button>
          )}

          {loading && (
            <div className="flex gap-1 items-center py-3">
              {[0, 150, 300].map(d => (
                <span key={d} className="w-[5px] h-[5px] rounded-full animate-pulse"
                  style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />
              ))}
              <span className="text-[11px] text-[var(--color-text-muted)] ml-1.5">Building request chain…</span>
            </div>
          )}

          {/* Flow result */}
          {flow && (
            <div className="flex flex-col gap-2">
              {/* Flow header */}
              <div
                className="px-3 py-2.5 rounded-lg border"
                style={{
                  backgroundColor: `color-mix(in srgb, ${ACCENT} 5%, var(--color-surface-hover))`,
                  borderColor: `color-mix(in srgb, ${ACCENT} 20%, var(--color-surface-border))`,
                }}
              >
                <p className="text-[12px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>{flow.name}</p>
                {flow.description && (
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{flow.description}</p>
                )}
                <p className="text-[10px] mt-1 font-medium" style={{ color: ACCENT }}>
                  {flow.steps.length} steps
                </p>
              </div>

              {/* Steps list */}
              <div className="space-y-2">
                {flow.steps.map((step, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border p-3"
                    style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-panel)' }}
                  >
                    <div className="flex items-start gap-2">
                      {/* Step number */}
                      <span
                        className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold"
                        style={{ backgroundColor: `color-mix(in srgb, ${ACCENT} 15%, transparent)`, color: ACCENT }}
                      >
                        {step.step || idx + 1}
                      </span>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold flex-shrink-0"
                            style={{
                              backgroundColor: `color-mix(in srgb, ${METHOD_COLORS[step.method] || '#6b7280'} 15%, transparent)`,
                              color: METHOD_COLORS[step.method] || '#6b7280',
                            }}
                          >
                            {step.method || 'GET'}
                          </span>
                          <span className="text-[11.5px] font-medium text-[var(--color-text-primary)] truncate">{step.name}</span>
                        </div>
                        <p className="text-[11px] font-mono truncate" style={{ color: 'var(--color-text-muted)' }}>{step.url}</p>
                        {step.description && (
                          <p className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>{step.description}</p>
                        )}
                        {/* Variable extractions */}
                        {step.variableExtractions && step.variableExtractions.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {step.variableExtractions.map((v, vi) => (
                              <span
                                key={vi}
                                className="px-1.5 py-0.5 rounded text-[10px] font-mono"
                                style={{
                                  backgroundColor: 'color-mix(in srgb, var(--color-success) 10%, transparent)',
                                  color: 'var(--color-success)',
                                  border: '1px solid color-mix(in srgb, var(--color-success) 25%, transparent)',
                                }}
                                title={`Extracts ${v.path} → {{${v.variable}}}: ${v.description}`}
                              >
                                → {'{{'}{v.variable}{'}}'}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <div>
            {flow && !loading && (
              <button type="button" onClick={handleGenerate}
                className="text-[11px] underline cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
                Regenerate
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {flow && !loading && !created && (
              <button
                type="button"
                onClick={handleCreateCollection}
                disabled={creating}
                className="h-[30px] px-4 text-[12px] font-medium rounded-md text-white cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center gap-1.5"
                style={{ backgroundColor: 'var(--color-success)' }}
              >
                <PlayIcon size={11} />
                {creating ? 'Creating…' : 'Create Collection'}
              </button>
            )}
            {created && (
              <div className="h-[30px] px-3 flex items-center gap-1.5 text-[12px] font-medium rounded-md"
                style={{ backgroundColor: 'color-mix(in srgb, var(--color-success) 12%, transparent)', color: 'var(--color-success)' }}>
                <CheckIcon size={12} />
                Collection created!
              </div>
            )}
            <button type="button" onClick={onClose}
              className="h-[30px] px-4 text-[12px] font-medium rounded-md cursor-pointer bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
