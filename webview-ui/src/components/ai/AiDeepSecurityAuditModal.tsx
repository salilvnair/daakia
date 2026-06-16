/**
 * AiDeepSecurityAuditModal — Sprint 12.5
 * Deep OWASP Top 10 scan of your collection. Finds exposed tokens in headers/body,
 * injection surfaces, missing auth on sensitive endpoints, CORS misconfig.
 * Generates pentest checklist with PoC payloads.
 * Gate: deepSecurityAudit feature flag
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';
import type { CollectionTreeNode } from '../../services/collections';
import { ModalView, AIButtonView, ButtonView, CopyButtonView } from '../../dui';
import { useAiCollectionCacheStore } from '../../store/ai-collection-cache-store';

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
  const [started, setStarted] = useState(false);
  const streamRef = useRef('');
  const cacheGet = useAiCollectionCacheStore(s => s.get);
  const cacheSet = useAiCollectionCacheStore(s => s.set);
  const cacheKey = `security-audit:${collectionNode.id}`;

  // Cache-first: reopening this action for the same collection shows the last
  // audit instead of an empty intro screen — Re-run is always explicit.
  useEffect(() => {
    const cached = cacheGet(cacheKey);
    if (!cached) return;
    setResult(cached.payload as string);
    setStarted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStream:chunk') {
        streamRef.current += msg.chunk;
        setResult(streamRef.current);
      } else if (msg?.type === 'aiStream:done') {
        setResult(streamRef.current);
        setLoading(false);
        cacheSet(cacheKey, streamRef.current);
      } else if (msg?.type === 'aiStream:error') {
        setError(msg.error || 'AI request failed');
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

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

  return (
    <ModalView
      open
      onClose={onClose}
      title="Deep Security Audit ✦"
      subtitle={collectionNode.name}
      size="lg"
      headerColor={ACCENT}
      headerIcon={
        <div style={{
          width: 26, height: 26, borderRadius: 6, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'color-mix(in srgb, var(--color-error) 18%, transparent)',
        }}>
          <SparkleIcon size={13} style={{ color: ACCENT }} />
        </div>
      }
      footerLeft={result && !loading ? (
        <CopyButtonView text={result} size={13} title="Copy audit report" accentColor={ACCENT} />
      ) : undefined}
      footerRight={
        started ? (
          <ButtonView size="md" onClick={handleAudit} disabled={loading}>Re-run Audit</ButtonView>
        ) : (
          <AIButtonView
            label="Run Security Audit"
            size="md"
            accentColor={ACCENT}
            onClick={handleAudit}
          />
        )
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!started ? (
          <div style={{
            borderRadius: 6, padding: 12,
            background: 'color-mix(in srgb, var(--color-error) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-error) 25%, transparent)',
          }}>
            <p style={{ fontSize: 11, fontWeight: 500, marginBottom: 4, color: 'var(--color-error)' }}>⚠ Security Audit</p>
            <p style={{ fontSize: 11, margin: 0, color: 'var(--color-text-muted)' }}>
              AI will perform a deep OWASP Top 10 scan of <strong>{collectionNode.name}</strong>: exposed tokens, injection surfaces, missing auth on sensitive endpoints, CORS misconfig, and SSRF vectors. Generates a pentest checklist with PoC payloads.
            </p>
          </div>
        ) : (
          <>
            {error && (
              <p style={{
                fontSize: 11, padding: '6px 10px', borderRadius: 6, margin: 0,
                background: 'color-mix(in srgb, var(--color-error) 12%, transparent)', color: 'var(--color-error)',
              }}>
                {error}
              </p>
            )}
            {loading && !result && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '16px 0' }}>
                <span className="animate-spin" style={{
                  display: 'inline-block', width: 16, height: 16, borderRadius: '50%',
                  border: '2px solid var(--color-error)', borderTopColor: 'transparent',
                }} />
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Scanning for security vulnerabilities…</span>
              </div>
            )}
            {result && (
              <div style={{
                borderRadius: 8, padding: 12, overflowY: 'auto', maxHeight: 420,
                border: '1px solid var(--color-surface-border)', background: 'var(--color-surface)',
              }}>
                <MdViewer content={result} />
              </div>
            )}
          </>
        )}
      </div>
    </ModalView>
  );
}
