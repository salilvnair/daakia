/**
 * AiMockIntelligenceModal — AI learns from real API responses and auto-generates mock rules.
 * Task 10.12 — AI Mock Intelligence · Gate: mockIntelligence
 */
import { useState, useRef, useEffect } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { SparkleIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { ModalView, AIButtonView, CopyButtonView } from '@salilvnair/dui';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-mock)';

export function AiMockIntelligenceModal({ onClose }: Props) {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const allTabs = useTabsStore(s => s.tabs);
  const [rules, setRules] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const streamRef = useRef('');

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStream:chunk') { streamRef.current += msg.chunk; setRules(streamRef.current); }
      else if (msg?.type === 'aiStream:done') { setLoading(false); }
      else if (msg?.type === 'aiStream:error') { setError(msg.error || 'Generation failed'); setLoading(false); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const generate = () => {
    if (!activeTab || loading) return;
    streamRef.current = ''; setRules(''); setError(''); setLoading(true);

    const responseTabs = allTabs.filter(t => t.response?.body || t.response?.status);
    const sample = responseTabs.slice(0, 15).map(t => {
      const resp = t.response;
      return `Endpoint: ${t.method || 'GET'} ${t.url || ''}
Status: ${resp?.status || 200}
Content-Type: ${resp?.contentType || 'application/json'}
Body (first 300 chars): ${String(resp?.body || '{}').slice(0, 300)}`;
    }).join('\n\n---\n\n') || `Endpoint: GET https://api.example.com/users
Status: 200
Content-Type: application/json
Body: [{"id":1,"name":"Alice"},{"id":2,"name":"Bob"}]`;

    postMsg({
      type: 'aiChat',
      tabId: activeTab.id,
      messages: [{
        role: 'user',
        content: `You are an API mock server expert. Analyze the following real API responses and generate WireMock-compatible mock rules that replicate these endpoints realistically.

Real API responses captured:
${sample}

For each endpoint, generate a WireMock stub JSON with:
1. request: method, urlPattern, optional header matchers
2. response: status, headers (Content-Type, etc.), jsonBody with realistic data that matches the pattern
3. Add random variation using WireMock response templating ({{randomValue}}, {{now}}, etc.) where appropriate
4. Include fault scenarios (404, 500) as separate stubs

Output as a JSON array of WireMock stub objects. Format:
\`\`\`json
[
  {
    "request": { "method": "GET", "urlPattern": "/api/..." },
    "response": { "status": 200, "headers": {...}, "jsonBody": {...} }
  }
]
\`\`\``,
      }],
      stream: true,
    });
  };

  return (
    <ModalView
      open
      onClose={onClose}
      title="Mock Intelligence ✦"
      size="xl"
      headerColor={ACCENT}
      headerIcon={
        <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${ACCENT} 20%, transparent)` }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
        </div>
      }
      footerLeft={
        rules ? (
          <AIButtonView label="Regenerate" size="md" accentColor={ACCENT} onClick={generate} />
        ) : undefined
      }
      footerRight={
        rules ? (
          <CopyButtonView text={rules} title="Copy Rules" size="md" accentColor={ACCENT} />
        ) : undefined
      }
    >
      {!rules && !loading && !error && (
        <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
          <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
            Analyze real API responses from open tabs and generate WireMock-compatible mock rules automatically.
          </p>
          <AIButtonView label="Generate Mock Rules ✦" size="md" accentColor={ACCENT} onClick={generate} />
        </div>
      )}
      {error && <p className="text-[11px] px-3 py-2 rounded-lg mb-3" style={{ color: 'var(--color-error)', backgroundColor: 'color-mix(in srgb, var(--color-error) 8%, transparent)' }}>{error}</p>}
      {loading && !rules && <p className="text-[11px] animate-pulse text-center py-8" style={{ color: ACCENT }}>Learning from API responses…</p>}
      {rules && (
        <pre className="text-[11.5px] font-mono whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>{rules}</pre>
      )}
    </ModalView>
  );
}
