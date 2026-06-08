/**
 * AiScenarioGeneratorModal — generates complete multi-step API flows.
 * Feature 4.6.20 — AI Scenario Generator
 *
 * "Generate complete e-commerce checkout flow" → creates 10+ chained requests
 * (browse → cart → checkout → payment → confirm)
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SparkleIcon, CloseIcon, CheckIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useToastStore } from '../../store/toast-store';
import { MdViewer } from '../shared/display/MdViewer';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-ai)';

const SCENARIOS = [
  'E-commerce checkout flow: browse products → add to cart → apply coupon → checkout → payment → order confirmation',
  'User onboarding: register → verify email → complete profile → upload avatar → first login',
  'Social post lifecycle: create post → add media → publish → get comments → reply → delete',
  'API authentication flow: request token → refresh token → use protected endpoint → logout',
  'File upload workflow: initiate multipart → upload chunks → complete upload → process → download',
  'Payment flow: create payment intent → confirm card → handle 3DS → capture payment → refund',
];

const SYSTEM_PROMPT = `You are a Daakia API scenario generator. The user describes an API flow scenario.
Generate a step-by-step sequence of HTTP requests in this JSON format:

{
  "scenarioName": "E-Commerce Checkout Flow",
  "description": "Complete checkout from browse to confirmation",
  "steps": [
    {
      "step": 1,
      "name": "Browse Products",
      "method": "GET",
      "url": "{{baseUrl}}/api/products?category=electronics&limit=10",
      "headers": [],
      "body": "",
      "bodyType": "none",
      "extractVariable": "productId",
      "extractPath": "data[0].id",
      "description": "Lists available products. Saves first product ID for next steps."
    }
  ],
  "variables": [
    { "key": "baseUrl", "value": "https://api.example.com" },
    { "key": "token", "value": "" }
  ]
}

Rules:
- extractVariable/extractPath show how to chain responses (response.data[0].id → {{productId}})
- Use realistic URLs, request bodies, and response paths
- 6–15 steps is ideal
- Return ONLY valid JSON`;

export function AiScenarioGeneratorModal({ onClose }: Props) {
  const [scenario, setScenario] = useState('');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [rawResult, setRawResult] = useState('');
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
        accRef.current += (msg.delta as string) || '';
        setRawResult(accRef.current);
      }
      if (msg.type === 'ai:complete') {
        const content = accRef.current || '';
        setRawResult(content);
        setLoading(false);
        try { setResult(JSON.parse(content)); } catch { setError('Could not parse scenario. Try regenerating.'); }
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
    if (!scenario.trim()) { setError('Describe the scenario first.'); return; }
    setLoading(true);
    setRawResult('');
    setResult(null);
    setError('');
    accRef.current = '';
    const pid = `ai-scenario-${Date.now()}`;
    reqIdRef.current = pid;

    postMsg({
      type: 'ai:send', tabId: pid, provider: '', model: '', baseUrl: '',
      stage: 'collection.scenario.generate',
      systemPrompts: [SYSTEM_PROMPT],
      userPrompt: scenario,
      conversation: [], tools: [],
      settings: { temperature: 0.3, maxTokens: 3000, stream: true, topP: 1, stopSequences: [], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
      mcpServerConfigs: [],
    });
  };

  const importScenario = () => {
    if (!result) return;
    try {
      const collId = `scenario-${Date.now()}`;
      postMsg({ type: 'createCollection', id: collId, name: (result.scenarioName as string) || 'AI Scenario', protocol: 'rest' });
      setImported(true);
      addToast({ type: 'success', message: `Scenario "${result.scenarioName}" imported!` });
      setTimeout(onClose, 1500);
    } catch {
      setError('Failed to import scenario.');
    }
  };

  const steps = result?.steps as Array<Record<string, unknown>> | undefined;

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="w-[700px] max-h-[92vh] flex flex-col rounded-xl border shadow-2xl"
        style={{ backgroundColor: 'var(--color-surface-bg)', borderColor: 'var(--color-surface-border)' }}>

        <div className="flex items-center gap-2.5 px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <SparkleIcon size={15} style={{ color: ACCENT }} />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">AI Scenario Generator</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">Describe a workflow → AI creates all chained requests</p>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded opacity-50 hover:opacity-100 cursor-pointer">
            <CloseIcon size={12} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          <div>
            <label className="block text-[11px] font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Scenario description</label>
            <textarea
              autoFocus
              value={scenario}
              onChange={e => { setScenario(e.target.value); setError(''); }}
              rows={3}
              className="w-full px-3 py-2 rounded-lg text-[12px] resize-none outline-none"
              placeholder="Describe the complete API flow you want to test..."
              style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {SCENARIOS.map((s, i) => (
              <button key={i} type="button" onClick={() => setScenario(s)}
                className="text-left text-[10px] px-2 py-1 rounded-md border cursor-pointer transition-all"
                style={{ borderColor: 'var(--color-surface-border)', color: 'var(--color-text-secondary)' }}>
                {s.split(':')[0]}
              </button>
            ))}
          </div>

          {error && <p className="text-[11px]" style={{ color: 'var(--color-error)' }}>{error}</p>}

          {loading && !rawResult && (
            <div className="flex gap-1 items-center">
              {[0, 150, 300].map(d => (
                <span key={d} className="w-[5px] h-[5px] rounded-full animate-pulse"
                  style={{ backgroundColor: ACCENT, animationDelay: `${d}ms` }} />
              ))}
              <span className="text-[11px] text-[var(--color-text-muted)] ml-1.5">Generating scenario…</span>
            </div>
          )}

          {steps && (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-semibold" style={{ color: ACCENT }}>✦ {steps.length} steps generated</p>
              {steps.map((step, i) => (
                <div key={i} className="flex gap-3 p-2.5 rounded-lg border"
                  style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-panel)' }}>
                  <div className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                    style={{ backgroundColor: `color-mix(in srgb, ${ACCENT} 15%, transparent)`, color: ACCENT }}>
                    {step.step as number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold text-white px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: 'var(--color-info)' }}>{step.method as string}</span>
                      <span className="text-[10.5px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>{step.name as string}</span>
                    </div>
                    <p className="text-[10px] font-mono truncate mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{step.url as string}</p>
                    {step.extractVariable && (
                      <p className="text-[9.5px] mt-0.5" style={{ color: 'var(--color-success)' }}>
                        → saves {step.extractPath as string} as {`{{${step.extractVariable}}}`}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end px-5 py-3 border-t flex-shrink-0 gap-2" style={{ borderColor: 'var(--color-surface-border)' }}>
          {steps && !loading && (
            <button type="button" onClick={importScenario} disabled={imported}
              className="h-[32px] px-4 text-[12px] font-medium rounded-md cursor-pointer hover:opacity-90 disabled:opacity-60 flex items-center gap-1.5 text-white"
              style={{ backgroundColor: imported ? 'var(--color-success)' : ACCENT }}>
              {imported ? <><CheckIcon size={12} /> Imported!</> : <><SparkleIcon size={11} /> Import Scenario</>}
            </button>
          )}
          <button type="button" onClick={run} disabled={loading || !scenario.trim()}
            className="h-[32px] px-4 text-[12px] font-medium rounded-md cursor-pointer hover:opacity-90 disabled:opacity-40 text-white"
            style={{ backgroundColor: ACCENT }}>
            <SparkleIcon size={11} className="inline mr-1" />
            Generate
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
