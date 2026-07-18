/**
 * AiSecurityAuditModal — AI scans all open tabs for security anti-patterns.
 * Task 10.11 — AI Security Audit · Gate: securityAudit
 */
import { useState, useRef, useEffect } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';
import { ModalView, AIButtonView } from '@salilvnair/dui';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-ai)';

export function AiSecurityAuditModal({ onClose }: Props) {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const allTabs = useTabsStore(s => s.tabs);
  const [report, setReport] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scanned, setScanned] = useState(0);
  const streamRef = useRef('');

  useEffect(() => { runAudit(); }, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStream:chunk') { streamRef.current += msg.chunk; setReport(streamRef.current); }
      else if (msg?.type === 'aiStream:done') { setLoading(false); }
      else if (msg?.type === 'aiStream:error') { setError(msg.error || 'Audit failed'); setLoading(false); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const runAudit = () => {
    if (!activeTab || loading) return;
    streamRef.current = ''; setReport(''); setError(''); setLoading(true);

    const tabs = allTabs.filter(t => t.url);
    setScanned(tabs.length);

    const tabSummary = tabs.slice(0, 30).map(t => {
      const url = t.url || '';
      const headers = Object.entries(t.headers || {}).map(([k, v]) => `${k}: ${v}`).join(', ');
      return `- [${t.protocol?.toUpperCase() || 'REST'}] ${t.method || 'GET'} ${url}${headers ? ` | Headers: ${headers}` : ''}`;
    }).join('\n') || '- GET https://api.example.com/users';

    postMsg({
      type: 'aiChat',
      tabId: activeTab.id,
      messages: [{
        role: 'user',
        content: `You are an API security expert. Audit the following API requests for security vulnerabilities and anti-patterns.

Requests to audit:
${tabSummary}

Check for:
1. **Missing Authentication** — endpoints that should require auth but have no Authorization header
2. **Plain-text Secrets** — API keys, tokens, passwords in URLs or headers in clear text
3. **HTTP (not HTTPS)** — any non-HTTPS endpoint handling sensitive data
4. **Overly Permissive CORS** — Access-Control-Allow-Origin: * on sensitive endpoints
5. **Exposed PII** — user IDs, emails, SSNs visible in URLs (path or query params)
6. **Missing Rate-Limiting Headers** — no X-RateLimit headers on public endpoints
7. **Insecure Auth Methods** — Basic Auth over HTTP, weak JWT algorithms

For each finding:
- ## [CRITICAL|HIGH|MEDIUM|LOW] Severity Category
- **Finding**: description of the issue
- **Affected endpoint(s)**: list them
- **Risk**: what an attacker could do
- **Fix**: specific remediation steps

End with a **## Summary** section with total counts by severity and an overall security score out of 10.`,
      }],
      stream: true,
    });
  };

  return (
    <ModalView
      open
      onClose={onClose}
      title="Security Audit"
      subtitle={scanned > 0 ? `${scanned} tab${scanned !== 1 ? 's' : ''} scanned` : undefined}
      size="xl"
      headerColor={ACCENT}
      headerIcon={
        <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${ACCENT} 20%, transparent)` }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
        </div>
      }
      footerRight={
        !loading && report ? (
          <AIButtonView label="Re-scan" size="md" accentColor={ACCENT} onClick={runAudit} />
        ) : undefined
      }
    >
      {error && <p className="text-[11px] px-3 py-2 rounded-lg mb-3" style={{ color: 'var(--color-error)', backgroundColor: 'color-mix(in srgb, var(--color-error) 8%, transparent)' }}>{error}</p>}
      {loading && !report && <p className="text-[11px] animate-pulse text-center py-12" style={{ color: ACCENT }}>Scanning {scanned} tabs for security vulnerabilities…</p>}
      {report && <MdViewer content={report} />}
    </ModalView>
  );
}
