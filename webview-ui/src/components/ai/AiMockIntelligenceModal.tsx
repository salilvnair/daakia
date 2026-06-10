/**
 * AiMockIntelligenceModal — AI learns from real API responses and auto-generates mock rules.
 * Task 10.12 — AI Mock Intelligence · Gate: mockIntelligence
 */
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTabsStore } from '../../store/tabs-store';
import { CloseIcon, SparkleIcon, CopyIcon, CheckIcon } from '../../icons';
import { postMsg } from '../../vscode';

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
  const [copied, setCopied] = useState(false);
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

  const handleCopy = () => {
    navigator.clipboard.writeText(rules).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} onMouseDown={e => e.stopPropagation()}>
      <div className="relative flex flex-col rounded-2xl border shadow-2xl overflow-hidden" style={{ backgroundColor: 'var(--color-panel)', borderColor: `color-mix(in srgb, ${ACCENT} 30%, var(--color-surface-border))`, width: 680, maxHeight: '85vh' }}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <div className="flex items-center gap-2">
            <SparkleIcon size={14} style={{ color: ACCENT }} />
            <span className="text-[13px] font-semibold" style={{ color: ACCENT }}>Mock Intelligence ✦</span>
          </div>
          <div className="flex items-center gap-2">
            {rules && (
              <button type="button" onClick={handleCopy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer" style={{ color: copied ? 'var(--color-success)' : ACCENT, backgroundColor: `color-mix(in srgb, ${ACCENT} 10%, transparent)` }}>
                {copied ? <CheckIcon size={11} /> : <CopyIcon size={11} />}{copied ? 'Copied!' : 'Copy Rules'}
              </button>
            )}
            <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-[var(--color-hover)] cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>
              <CloseIcon size={13} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] p-5 min-h-0">
          {!rules && !loading && !error && (
            <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
              <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                Analyze real API responses from open tabs and generate WireMock-compatible mock rules automatically.
              </p>
              <button type="button" onClick={generate}
                className="flex items-center gap-2 h-[36px] px-5 rounded-xl text-[12px] font-semibold cursor-pointer text-white hover:opacity-90 transition-opacity"
                style={{ backgroundColor: ACCENT }}
              >
                <SparkleIcon size={12} />Generate Mock Rules ✦
              </button>
            </div>
          )}
          {error && <p className="text-[11px] px-3 py-2 rounded-lg mb-3" style={{ color: 'var(--color-error)', backgroundColor: 'color-mix(in srgb, var(--color-error) 8%, transparent)' }}>{error}</p>}
          {loading && !rules && <p className="text-[11px] animate-pulse text-center py-8" style={{ color: ACCENT }}>Learning from API responses…</p>}
          {rules && (
            <pre className="text-[11.5px] font-mono whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>{rules}</pre>
          )}
        </div>

        {rules && (
          <div className="flex items-center gap-3 px-5 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
            <button type="button" onClick={generate} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] cursor-pointer" style={{ color: ACCENT, backgroundColor: `color-mix(in srgb, ${ACCENT} 8%, transparent)` }}>
              <SparkleIcon size={10} />Regenerate
            </button>
            <div className="flex-1" />
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[12px] font-medium cursor-pointer hover:bg-[var(--color-hover)]" style={{ color: 'var(--color-text-muted)' }}>Close</button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
