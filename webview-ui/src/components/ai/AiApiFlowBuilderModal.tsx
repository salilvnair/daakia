/**
 * AiApiFlowBuilderModal — Generate a request chain from a natural language workflow description (4.4.7)
 */
import { useState, useEffect, useRef } from 'react';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { SparkleIcon, PlayIcon, CheckIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { ModalView, ButtonView, TextInputView, MultilineInputView } from '@salilvnair/dui';
import { METHOD_COLORS } from '../../colors';

interface VariableExtraction { variable: string; path: string; description: string; }

interface FlowStep {
  step: number; name: string; method: string; url: string;
  headers: { key: string; value: string; enabled: boolean }[];
  bodyMode: 'raw' | 'none' | 'form-data' | 'x-www-form-urlencoded';
  bodyRaw: string;
  variableExtractions: VariableExtraction[];
  description: string;
}

interface GeneratedFlow { name: string; description: string; steps: FlowStep[]; }

interface Props { protocol?: string; onClose: () => void; }

const ACCENT = 'var(--color-primary)';

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
      if (msg.type === 'ai:chunk') { accRef.current += (msg.delta as string) || (msg.text as string) || ''; }
      if (msg.type === 'ai:complete') {
        const content = accRef.current || ((msg.message as Record<string, unknown>)?.content as string) || '';
        const stripped = content.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/im, '').trim();
        try {
          const parsed = JSON.parse(stripped) as GeneratedFlow;
          if (!parsed.steps || !Array.isArray(parsed.steps)) throw new Error('Invalid');
          setFlow(parsed); setError('');
        } catch { setError('AI returned an unexpected format. Please try again.'); }
        setLoading(false); accRef.current = '';
      }
      if (msg.type === 'ai:error') { setError((msg.message as string) || 'Flow generation failed.'); setLoading(false); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleGenerate = () => {
    if (!description.trim()) { setError('Describe the workflow first.'); return; }
    setLoading(true); setFlow(null); setError(''); setCreated(false); accRef.current = '';
    const pid = `ai-flow-${Date.now()}`;
    reqIdRef.current = pid;
    postMsg({
      type: 'ai:send', tabId: pid, provider: '', model: '', baseUrl: '',
      stage: 'rest.api.flow',
      systemPrompts: [resolve('rest.api.flow.system')],
      userPrompt: resolve('rest.api.flow', { description: description.trim(), baseUrl: baseUrl.trim() || 'https://api.example.com' }),
      conversation: [], tools: [],
      settings: { temperature: 0.2, maxTokens: 2000, stream: true, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
      mcpServerConfigs: [],
    });
  };

  const handleCreateCollection = async () => {
    if (!flow) return;
    setCreating(true);
    const collectionId = crypto.randomUUID();
    postMsg({ type: 'createCollection', id: collectionId, name: flow.name || 'AI Flow', protocol });
    await new Promise(r => setTimeout(r, 120));
    for (let i = 0; i < flow.steps.length; i++) {
      const step = flow.steps[i];
      const requestId = crypto.randomUUID();
      const headerRows = step.headers?.length > 0
        ? [...step.headers.map(h => ({ ...h, id: crypto.randomUUID() })), { id: crypto.randomUUID(), key: '', value: '', enabled: true }]
        : [{ id: crypto.randomUUID(), key: '', value: '', enabled: true }];
      // Was 'createRequest' — a message type NO handler in the extension listens for, so
      // every request this built was silently dropped and the flow produced an empty
      // collection. The real one is 'saveRequestToCollection', whose request is flat with
      // the rest packed into a `data` JSON string.
      postMsg({
        type: 'saveRequestToCollection', collectionId, protocol,
        request: {
          id: requestId, name: `${i + 1}. ${step.name}`, method: (step.method || 'GET').toUpperCase(),
          url: step.url || '',
          data: JSON.stringify({
            headers: headerRows,
            params: [{ id: crypto.randomUUID(), key: '', value: '', enabled: true }],
            bodyMode: step.bodyMode || 'none', bodyRaw: step.bodyRaw || '',
            bodyFormData: [{ id: crypto.randomUUID(), key: '', value: '', type: 'text', enabled: true }],
            bodyUrlEncoded: [{ id: crypto.randomUUID(), key: '', value: '', enabled: true }],
            authType: 'none', authData: {},
            preRequestScript: '',
            postResponseScript: step.variableExtractions?.length > 0
              ? step.variableExtractions.map(v => `// Extract: ${v.description}\n// dk.env.set('${v.variable}', dk.response.json()${v.path.replace(/^\$/, '')});`).join('\n\n')
              : '',
          }),
        },
      });
      await new Promise(r => setTimeout(r, 60));
    }
    await new Promise(r => setTimeout(r, 200));
    postMsg({ type: 'getCollections' });
    setCreating(false); setCreated(true);
  };

  const footerLeft = flow && !loading ? (
    <button type="button" onClick={handleGenerate}
      className="text-[11px] underline cursor-pointer transition-colors"
      style={{ color: 'var(--color-text-muted)' }}>
      Regenerate
    </button>
  ) : undefined;

  const footerRight = (
    <div className="flex items-center gap-2">
      {created && (
        <div className="h-[28px] px-3 flex items-center gap-1.5 text-[12px] font-medium rounded-md"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-success) 12%, transparent)', color: 'var(--color-success)' }}>
          <CheckIcon size={12} />
          Collection created!
        </div>
      )}
      {flow && !loading && !created && (
        <ButtonView size="sm" variant="primary" accentColor="var(--color-success)" disabled={creating}
          iconLeft={<PlayIcon size={11} />} onClick={handleCreateCollection}>
          {creating ? 'Creating…' : 'Create Collection'}
        </ButtonView>
      )}
      {!flow && !loading && (
        <ButtonView size="md" variant="primary" accentColor={ACCENT} disabled={!description.trim()}
          iconLeft={<SparkleIcon size={11} />} onClick={handleGenerate}>
          Generate Flow
        </ButtonView>
      )}
      {loading && (
        <div className="flex gap-1 items-center h-[28px] px-2">
          {[0, 150, 300].map(d => (
            <span key={d} className="w-[5px] h-[5px] rounded-full animate-pulse"
              style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />
          ))}
          <span className="text-[11px] text-[var(--color-text-muted)] ml-1">Building…</span>
        </div>
      )}
    </div>
  );

  return (
    <ModalView
      open
      onClose={onClose}
      title="API Flow Builder"
      subtitle="Describe a workflow → AI generates a request chain with variable passing"
      size="lg"
      elevated
      headerColor={ACCENT}
      headerIcon={<SparkleIcon size={15} style={{ color: ACCENT }} />}
      footerLeft={footerLeft}
      footerRight={footerRight}
    >
      <div className="flex flex-col gap-3">
        {/* Workflow description */}
        <div>
          <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
            Describe the workflow
          </label>
          <MultilineInputView
            autoFocus
            value={description}
            onChange={e => { setDescription(e.target.value); setError(''); setFlow(null); setCreated(false); }}
            rows={4}
            accentColor={ACCENT}
            placeholder="e.g. Log in to get a token, create a new order, fetch the order details, then cancel it"
            style={{ width: '100%' }}
          />
        </div>

        {/* Base URL */}
        <div>
          <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
            Base URL <span className="font-normal italic text-[var(--color-text-muted)]">(optional — defaults to https://api.example.com)</span>
          </label>
          <TextInputView
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            placeholder="https://api.myapp.com"
            accentColor={ACCENT}
            size="md"
            style={{ width: '100%' }}
          />
        </div>

        {error && <p className="text-[11px]" style={{ color: 'var(--color-error)' }}>{error}</p>}

        {/* Flow result */}
        {flow && (
          <div className="flex flex-col gap-2">
            <div className="px-3 py-2.5 rounded-lg border"
              style={{ backgroundColor: `color-mix(in srgb, ${ACCENT} 5%, var(--color-surface-hover))`, borderColor: `color-mix(in srgb, ${ACCENT} 20%, var(--color-surface-border))` }}>
              <p className="text-[12px] font-semibold text-[var(--color-text-primary)]">{flow.name}</p>
              {flow.description && <p className="text-[11px] mt-0.5 text-[var(--color-text-muted)]">{flow.description}</p>}
              <p className="text-[10px] mt-1 font-medium" style={{ color: ACCENT }}>{flow.steps.length} steps</p>
            </div>
            <div className="space-y-2">
              {flow.steps.map((step, idx) => (
                <div key={idx} className="rounded-lg border p-3"
                  style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-panel)' }}>
                  <div className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold"
                      style={{ backgroundColor: `color-mix(in srgb, ${ACCENT} 15%, transparent)`, color: ACCENT }}>
                      {step.step || idx + 1}
                    </span>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold flex-shrink-0"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${METHOD_COLORS[step.method as keyof typeof METHOD_COLORS] || 'var(--color-text-muted)'} 15%, transparent)`,
                            color: METHOD_COLORS[step.method as keyof typeof METHOD_COLORS] || 'var(--color-text-muted)',
                          }}>
                          {step.method || 'GET'}
                        </span>
                        <span className="text-[11.5px] font-medium text-[var(--color-text-primary)] truncate">{step.name}</span>
                      </div>
                      <p className="text-[11px] font-mono truncate text-[var(--color-text-muted)]">{step.url}</p>
                      {step.description && <p className="text-[10.5px] text-[var(--color-text-muted)]">{step.description}</p>}
                      {step.variableExtractions?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {step.variableExtractions.map((v, vi) => (
                            <span key={vi} className="px-1.5 py-0.5 rounded text-[10px] font-mono"
                              title={`Extracts ${v.path} → {{${v.variable}}}: ${v.description}`}
                              style={{ backgroundColor: 'color-mix(in srgb, var(--color-success) 10%, transparent)', color: 'var(--color-success)', border: '1px solid color-mix(in srgb, var(--color-success) 25%, transparent)' }}>
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
    </ModalView>
  );
}
