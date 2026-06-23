/**
 * AiSoapWsdlExplainerModal — AI explains every operation, binding, port, and type
 * in the loaded WSDL in plain English.
 *
 * Task 8.25 — SOAP WSDL Explainer ✦
 * Gate: soapWsdlExplainer feature flag
 */
import { useState, useRef, useEffect } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';
import { SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';
import { ModalView, AIButtonView } from '@salilvnair/dui';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-soap)';

const SYSTEM_PROMPT = `You are a SOAP/WSDL expert. Given a WSDL definition or service info, explain it in plain English for a developer who is new to this service.

Structure your response as:
1. **Overview** — what this web service does in 1-2 sentences
2. **Operations** — list each operation with:
   - Input parameters (name and type)
   - Output/return value (type and meaning)
   - One-sentence description
3. **Message Types** — explain the key XSD types used in the WSDL
4. **Endpoint & Binding** — explain the service endpoint(s) and SOAP version
5. **Quick Start** — a simple SOAP request XML example for the most common operation

Keep explanations concise, practical, and developer-friendly.`;

export function AiSoapWsdlExplainerModal({ onClose }: Props) {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const getTemplate = useAiPromptTemplatesStore(s => s.getTemplate);
  const [explanation, setExplanation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const streamRef = useRef('');

  const wsdlOperations = activeTab?.soapOperations;
  const hasWsdl = !!(wsdlOperations?.length || activeTab?.soapService);

  useEffect(() => {
    if (hasWsdl) startExplain();
  }, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStream:chunk') {
        streamRef.current += msg.chunk;
        setExplanation(streamRef.current);
      } else if (msg?.type === 'aiStream:done') {
        setLoading(false);
      } else if (msg?.type === 'aiStream:error') {
        setError(msg.error || 'AI request failed');
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const startExplain = () => {
    if (!activeTab || loading) return;
    const context = wsdlOperations?.length
      ? `Service: ${activeTab.soapService || 'unknown'}\nOperations:\n${JSON.stringify(wsdlOperations, null, 2).slice(0, 3500)}`
      : `Service: ${activeTab.soapService || 'unknown'}\nEndpoint: ${activeTab.url || ''}`;

    const template = getTemplate('soap.schema.view');
    streamRef.current = '';
    setExplanation('');
    setError('');
    setLoading(true);
    postMsg({
      type: 'aiChat',
      tabId: activeTab.id,
      messages: [{ role: 'user', content: `${SYSTEM_PROMPT}\n\nWSDL context:\n${context}` }],
      systemPrompt: template || SYSTEM_PROMPT,
      stream: true,
    });
  };

  return (
    <ModalView
      open
      onClose={onClose}
      title="WSDL Explainer ✦"
      size="lg"
      headerColor={ACCENT}
      headerIcon={
        <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${ACCENT} 20%, transparent)` }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
        </div>
      }
      footerRight={
        !loading && explanation ? (
          <AIButtonView label="Refresh" size="md" accentColor={ACCENT} onClick={startExplain} />
        ) : undefined
      }
    >
      {!hasWsdl && !loading && !explanation && (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <SparkleIcon size={24} style={{ color: ACCENT, opacity: 0.4 }} />
          <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
            No WSDL loaded. Import a WSDL file using the WSDL button in the URL bar first.
          </p>
        </div>
      )}
      {error && (
        <p className="text-[11px] px-3 py-2 rounded-lg mb-4" style={{ color: 'var(--color-error)', backgroundColor: 'color-mix(in srgb, var(--color-error) 8%, transparent)' }}>
          {error}
        </p>
      )}
      {loading && !explanation && (
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <SparkleIcon size={20} style={{ color: ACCENT }} className="animate-pulse" />
          <p className="text-[11px] animate-pulse" style={{ color: ACCENT }}>Analyzing WSDL…</p>
        </div>
      )}
      {explanation && <MdViewer content={explanation} />}
    </ModalView>
  );
}
