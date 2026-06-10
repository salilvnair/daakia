/**
 * AiWebhookDebuggerModal — AI analyzes webhook payloads, validates HMAC signatures, explains structure.
 * Task 10.16 — AI Webhook Debugger · Gate: webhookDebugger
 */
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTabsStore } from '../../store/tabs-store';
import { CloseIcon, SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';

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

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} onMouseDown={e => e.stopPropagation()}>
      <div className="relative flex flex-col rounded-2xl border shadow-2xl overflow-hidden" style={{ backgroundColor: 'var(--color-panel)', borderColor: `color-mix(in srgb, ${ACCENT} 30%, var(--color-surface-border))`, width: 820, maxHeight: '87vh' }}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <div className="flex items-center gap-2">
            <SparkleIcon size={14} style={{ color: ACCENT }} />
            <span className="text-[13px] font-semibold" style={{ color: ACCENT }}>Webhook Debugger ✦</span>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-[var(--color-hover)] cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>
            <CloseIcon size={13} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: inputs */}
          <div className="flex flex-col w-[340px] flex-shrink-0 border-r min-h-0" style={{ borderColor: 'var(--color-surface-border)' }}>
            <div className="px-3 py-1.5 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Webhook Payload</span>
            </div>
            <textarea
              value={payload}
              onChange={e => setPayload(e.target.value)}
              className="flex-1 p-3 text-[11px] font-mono resize-none outline-none bg-transparent"
              style={{ color: 'var(--color-text-primary)' }}
              placeholder="Paste webhook JSON payload…"
            />
            {/* HMAC inputs */}
            <div className="border-t p-3 flex flex-col gap-2" style={{ borderColor: 'var(--color-surface-border)' }}>
              <div>
                <label className="block text-[10px] font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>Webhook Secret (optional)</label>
                <input type="password" value={secret} onChange={e => setSecret(e.target.value)}
                  className="w-full h-[28px] px-2 rounded text-[11px] outline-none"
                  style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
                  placeholder="whsec_…"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>Received Signature (optional)</label>
                <input type="text" value={signature} onChange={e => setSignature(e.target.value)}
                  className="w-full h-[28px] px-2 rounded text-[11px] outline-none"
                  style={{ backgroundColor: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
                  placeholder="t=1701732000,v1=abc…"
                />
              </div>
              <button type="button" onClick={analyze} disabled={!payload.trim() || loading}
                className="flex items-center justify-center gap-2 h-[32px] px-4 rounded-lg text-[11.5px] font-semibold cursor-pointer text-white hover:opacity-90 disabled:opacity-40"
                style={{ backgroundColor: ACCENT }}
              >
                <SparkleIcon size={10} />{loading ? 'Analyzing…' : 'Analyze ✦'}
              </button>
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

        <div className="flex items-center justify-end px-5 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[12px] font-medium cursor-pointer hover:bg-[var(--color-hover)]" style={{ color: 'var(--color-text-muted)' }}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
