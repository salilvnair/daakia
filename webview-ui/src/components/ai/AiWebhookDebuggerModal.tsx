/**
 * AiWebhookDebuggerModal — AI analyzes webhook payloads, validates HMAC signatures, explains structure.
 * Task 10.16 — AI Webhook Debugger · Gate: webhookDebugger
 */
import { useState, useRef, useEffect } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';
import { ModalView, AIButtonView, EditorView, TextInputView, ResizablePanelView } from '@salilvnair/dui';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-ai)';

const WEBHOOK_EXAMPLE = `{
  "id": "evt_1OJkXg2eZvKYlo2C3zQz2V8y",
  "object": "event",
  "type": "payment_intent.succeeded",
  "created": 1701732000,
  "data": {
    "object": {
      "id": "pi_3OJkXg2eZvKYlo2C10jXABCD",
      "amount": 4999,
      "currency": "usd",
      "status": "succeeded",
      "customer": "cus_PabcXYZ123"
    }
  },
  "livemode": false
}`;

export function AiWebhookDebuggerModal({ onClose }: Props) {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const [payload, setPayload] = useState(WEBHOOK_EXAMPLE);
  const [secret, setSecret] = useState('');
  const [signature, setSignature] = useState('');
  const [analysis, setAnalysis] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const streamRef = useRef('');

  useEffect(() => {
    if (activeTab?.response?.body) {
      try { JSON.parse(String(activeTab.response.body)); setPayload(String(activeTab.response.body)); } catch {}
    }
  }, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStream:chunk') { streamRef.current += msg.chunk; setAnalysis(streamRef.current); }
      else if (msg?.type === 'aiStream:done') { setLoading(false); }
      else if (msg?.type === 'aiStream:error') { setError(msg.error || 'Analysis failed'); setLoading(false); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const analyze = () => {
    if (!activeTab || !payload.trim() || loading) return;
    streamRef.current = ''; setAnalysis(''); setError(''); setLoading(true);
    postMsg({
      type: 'aiChat',
      tabId: activeTab.id,
      messages: [{
        role: 'user',
        content: `You are a webhook security and debugging expert. Analyze the following webhook payload:

\`\`\`json
${payload.slice(0, 3000)}
\`\`\`
${secret ? `\nWebhook Secret: ${secret}` : ''}
${signature ? `\nReceived Signature: ${signature}` : ''}

Provide a comprehensive analysis:

## Payload Structure Analysis
- Identify the webhook provider (Stripe, GitHub, Shopify, Twilio, Slack, SendGrid, etc.) based on payload shape
- Explain what event type this represents and what triggered it
- List all fields with their meanings and types
- Identify key business data (customer IDs, amounts, statuses, etc.)

## HMAC Signature Validation
${secret && signature ? `Verify if the signature '${signature}' is valid for this payload using secret '${secret}'.
Explain the verification algorithm (typically SHA-256 HMAC) and show the expected signature.` :
`Since no secret/signature provided, explain how to:
1. Verify HMAC-SHA256 signatures for this provider
2. What header contains the signature (e.g. Stripe-Signature, X-Hub-Signature-256)
3. Sample Node.js/Python code to verify the signature`}

## Security Checks
- Is this payload safe to process? (no injection attempts, sane field lengths)
- Replay attack prevention: is there a timestamp/nonce to validate?
- Are there any suspicious or unexpected fields?

## Recommended Actions
Based on this event type, what should your webhook handler do next?

## Example Handler Code
Simple Node.js/Express webhook handler for this specific event type.`,
      }],
      stream: true,
    });
  };

  return (
    <ModalView
      open
      onClose={onClose}
      title="Webhook Debugger"
      size="xl"
      headerColor={ACCENT}
      headerIcon={
        <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${ACCENT} 20%, transparent)` }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
        </div>
      }
      footerRight={
        <AIButtonView
          label={loading ? 'Analyzing…' : 'Analyze'}
          size="md"
          accentColor={ACCENT}
          disabled={!payload.trim() || loading}
          loading={loading}
          onClick={analyze}
        />
      }
    >
      <div className="flex flex-1 min-h-0 gap-0 -mx-4" style={{ minHeight: 360 }}>
        {/* Left: inputs */}
        <div className="flex flex-col w-[480px] flex-shrink-0 border-r min-h-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <div className="px-3 py-1.5 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Webhook Payload</span>
          </div>
          <div className="flex-1 p-3 min-h-0">
            <ResizablePanelView defaultHeight={320} minHeight={160} maxHeight={640} style={{ width: '100%' }}>
              <EditorView
                value={payload}
                onChange={setPayload}
                language="json"
                height="100%"
                size="md"
                placeholder="Paste webhook JSON payload…"
                bordered={false}
              />
            </ResizablePanelView>
          </div>
          {/* HMAC inputs */}
          <div className="border-t p-3 flex flex-col gap-2" style={{ borderColor: 'var(--color-surface-border)' }}>
            <div>
              <label className="block text-[10px] font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>Webhook Secret (optional)</label>
              <TextInputView
                value={secret}
                onChange={e => setSecret(e.target.value)}
                size="md"
                accentColor={ACCENT}
                width="fw"
                placeholder="whsec_…"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>Received Signature (optional)</label>
              <TextInputView
                value={signature}
                onChange={e => setSignature(e.target.value)}
                size="md"
                accentColor={ACCENT}
                width="fw"
                placeholder="t=1701732000,v1=abc…"
              />
            </div>
          </div>
        </div>

        {/* Right: analysis */}
        <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] p-5 min-h-0 min-w-0">
          {error && <p className="text-[11px] px-3 py-2 rounded-lg mb-3" style={{ color: 'var(--color-error)', backgroundColor: 'color-mix(in srgb, var(--color-error) 8%, transparent)' }}>{error}</p>}
          {loading && !analysis && <p className="text-[11px] animate-pulse" style={{ color: ACCENT }}>Analyzing webhook payload…</p>}
          {analysis && <MdViewer content={analysis} />}
          {!loading && !analysis && !error && (
            <p className="text-[12px] text-center py-12" style={{ color: 'var(--color-text-muted)' }}>Paste a webhook payload and click Analyze ✦</p>
          )}
        </div>
      </div>
    </ModalView>
  );
}
