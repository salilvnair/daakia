/**
 * AiDeepSecurityAuditModal — Sprint 12.5
 * Deep OWASP Top 10 scan of your collection. Finds exposed tokens in headers/body,
 * injection surfaces, missing auth on sensitive endpoints, CORS misconfig.
 * Generates pentest checklist with PoC payloads.
 * Gate: deepSecurityAudit feature flag
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, SparkleIcon, CopyIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';
import type { CollectionTreeNode } from '../../services/collections';

interface Props {
  collectionNode: CollectionTreeNode;
  onClose: () => void;
}

const ACCENT = 'var(--color-error)';

const SYSTEM_PROMPT = `You are a senior application security engineer and penetration tester. Perform a deep OWASP Top 10 security analysis of this API collection.

Analyze for:
1. **A01 - Broken Access Control**: Endpoints without auth, IDOR, missing authorization checks
2. **A02 - Cryptographic Failures**: Plain-text secrets, weak hashing, unencrypted sensitive data in responses
3. **A03 - Injection**: SQL, NoSQL, command, LDAP injection surfaces in query params and body fields
4. **A04 - Insecure Design**: Business logic flaws, mass assignment vulnerabilities
5. **A05 - Security Misconfiguration**: CORS misconfig, debug endpoints, verbose error messages
6. **A07 - Auth Failures**: Weak token algorithms, missing token expiry, insecure session management
7. **A09 - Logging Failures**: Sensitive data in request/response that could be logged
10. **A10 - SSRF**: Server-side request forgery via URL parameters

Format output as:
## Security Score: X/100

### Critical Issues 🔴
| Endpoint | Vulnerability | PoC | Remediation |

### High Issues 🟠
### Medium Issues 🟡
### Low Issues 🟢

### Pentest Checklist
- [ ] Manual checks to perform

### Recommended Fixes
Concrete code-level fixes.`;

export function AiDeepSecurityAuditModal({ collectionNode, onClose }: Props) {
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [started, setStarted] = useState(false);
  const streamRef = useRef('');

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStream:chunk') {
        streamRef.current += msg.chunk;
        setResult(streamRef.current);
      } else if (msg?.type === 'aiStream:done') {
        setResult(streamRef.current);
        setLoading(false);
      } else if (msg?.type === 'aiStream:error') {
        setError(msg.error || 'AI request failed');
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleAudit = useCallback(() => {
    if (loading) return;
    streamRef.current = '';
    setResult('');
    setError('');
    setLoading(true);
    setStarted(true);
    postMsg({
      type: 'aiStream',
      payload: {
        systemPrompt: SYSTEM_PROMPT,
        userMessage: `Collection: ${collectionNode.name}\n\nPlease perform a comprehensive OWASP Top 10 security audit of this API collection and generate a detailed pentest checklist with PoC payloads.`,
        templateKey: 'platform.security.audit',
      },
    });
  }, [loading, collectionNode.name]);

  const handleCopy = useCallback(() => {
    if (!result) return;
    navigator.clipboard.writeText(result).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [result]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) e.preventDefault(); }}
    >
      <div
        className="relative flex flex-col rounded-lg overflow-hidden shadow-2xl"
        style={{ width: 640, maxHeight: '88vh', background: 'var(--color-bg-panel)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
          <span className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Deep Security Audit ✦</span>
          <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wide"
            style={{ background: 'color-mix(in srgb, var(--color-error) 15%, transparent)', color: 'var(--color-error)' }}>OWASP Top 10</span>
          <span className="ml-1 px-2 py-0.5 rounded text-[10px] font-mono truncate max-w-[140px]"
            style={{ background: 'var(--color-bg-surface)', color: 'var(--color-text-muted)' }}>{collectionNode.name}</span>
          <button type="button" onClick={onClose} className="ml-auto cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>
            <CloseIcon size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-4 overflow-y-auto flex-1">
          {!started ? (
            <>
              <div className="rounded p-3" style={{ background: 'color-mix(in srgb, var(--color-error) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-error) 25%, transparent)' }}>
                <p className="text-[11px] font-medium mb-1" style={{ color: 'var(--color-error)' }}>⚠ Security Audit</p>
                <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                  AI will perform a deep OWASP Top 10 scan of <strong>{collectionNode.name}</strong>: exposed tokens, injection surfaces, missing auth on sensitive endpoints, CORS misconfig, and SSRF vectors. Generates a pentest checklist with PoC payloads.
                </p>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleAudit}
                  className="flex items-center gap-1.5 h-[26px] px-3 rounded text-[11px] font-medium cursor-pointer"
                  style={{ background: ACCENT, color: '#fff' }}
                >
                  <SparkleIcon size={11} />
                  Run Security Audit
                </button>
              </div>
            </>
          ) : (
            <>
              {error && <p className="text-[11px] px-2.5 py-1.5 rounded" style={{ background: 'color-mix(in srgb, var(--color-error) 12%, transparent)', color: 'var(--color-error)' }}>{error}</p>}
              {loading && !result && (
                <div className="flex items-center gap-2 py-4 justify-center">
                  <span className="inline-block w-4 h-4 border-2 border-[var(--color-error)] border-t-transparent rounded-full animate-spin" />
                  <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Scanning for security vulnerabilities…</span>
                </div>
              )}
              {result && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>Audit Report</span>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="flex items-center gap-1 h-[22px] px-2 rounded text-[10px] cursor-pointer"
                      style={{ background: copied ? 'var(--color-success)' : 'var(--color-bg-surface)', color: copied ? '#fff' : 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
                    >
                      <CopyIcon size={10} />
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <div className="rounded border p-3 overflow-y-auto" style={{ maxHeight: 420, borderColor: 'var(--color-border)', background: 'var(--color-bg-surface)' }}>
                    <MdViewer content={result} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
