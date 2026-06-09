/**
 * AiPreflightPopover — 4.6.5 AI Pre-flight Check
 *
 * Appears as an inline popover anchored to the UrlBar.
 * Runs deterministic checks immediately and offers AI deep analysis.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { postMsg } from '../../vscode';
import { SparkleIcon } from '../../icons';

// ── Types ────────────────────────────────────────────────────────────────────

type Severity = 'error' | 'warning' | 'info';

interface Issue {
  severity: Severity;
  code: string;
  message: string;
  hint?: string;
}

interface TabSnapshot {
  method: string;
  url: string;
  headers: { key: string; value: string; enabled: boolean }[];
  bodyMode: string;
  bodyRaw: string;
  authType: string;
  authData: Record<string, string>;
}

interface Props {
  tab: TabSnapshot;
  onClose: () => void;
}

// ── Deterministic checks ────────────────────────────────────────────────────

function isJwtExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload.exp) return false;
    return payload.exp < Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function isJwtExpiringSoon(token: string, withinSeconds = 300): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload.exp) return false;
    const now = Math.floor(Date.now() / 1000);
    return payload.exp > now && payload.exp - now < withinSeconds;
  } catch {
    return false;
  }
}

function runDeterministicChecks(tab: TabSnapshot): Issue[] {
  const issues: Issue[] = [];
  const method = tab.method.toUpperCase();
  const url = tab.url.trim();
  const bodyMethods = ['POST', 'PUT', 'PATCH'];
  const hasBody = tab.bodyMode !== 'none' && tab.bodyRaw.trim().length > 0;

  // 1. URL checks
  if (!url) {
    issues.push({ severity: 'error', code: 'empty-url', message: 'URL is empty', hint: 'Enter a URL before sending.' });
  } else {
    if (!/^https?:\/\//i.test(url)) {
      issues.push({ severity: 'error', code: 'missing-protocol', message: 'URL is missing a protocol', hint: 'Prefix the URL with http:// or https://' });
    }
    if (/^https:\/\/localhost/i.test(url)) {
      issues.push({ severity: 'warning', code: 'https-localhost', message: 'Using https:// for localhost', hint: 'localhost typically uses http:// unless TLS is configured locally.' });
    }
    if (/\/\/[^/]/.test(url.replace(/^https?:\/\//, ''))) {
      issues.push({ severity: 'warning', code: 'double-slash', message: 'URL path contains a double slash', hint: 'Check for accidental double slashes like /api//users.' });
    }
    if (/\s/.test(url)) {
      issues.push({ severity: 'error', code: 'url-has-spaces', message: 'URL contains unencoded spaces', hint: 'Encode spaces as %20 or use URL variables.' });
    }
    if (/\{[^{}]+\}/.test(url) && !/^\{\{/.test(url.match(/\{[^{}]+\}/)![0])) {
      issues.push({ severity: 'info', code: 'url-curly-brace', message: 'URL contains { } — did you mean a variable?', hint: 'Use {{variableName}} for environment variables.' });
    }
  }

  // 2. Body / method checks
  if (bodyMethods.includes(method) && !hasBody) {
    issues.push({ severity: 'warning', code: 'missing-body', message: `${method} request has no body`, hint: 'POST, PUT, and PATCH typically send a request body.' });
  }
  if (method === 'GET' && hasBody) {
    issues.push({ severity: 'warning', code: 'get-with-body', message: 'GET request has a body', hint: 'Many servers ignore or reject GET requests with a body.' });
  }

  // 3. Content-Type check
  const enabledHeaders = tab.headers.filter(h => h.enabled && h.key.trim());
  const hasContentType = enabledHeaders.some(h => h.key.toLowerCase() === 'content-type');
  if (bodyMethods.includes(method) && hasBody && !hasContentType) {
    issues.push({ severity: 'warning', code: 'missing-content-type', message: 'Missing Content-Type header', hint: 'Add Content-Type: application/json (or multipart/form-data, etc.)' });
  }

  // 4. JWT expiry checks
  let jwtToken = '';
  if (tab.authType === 'bearer' && tab.authData.token) {
    jwtToken = tab.authData.token;
  } else {
    const authHeader = enabledHeaders.find(h => h.key.toLowerCase() === 'authorization');
    if (authHeader?.value?.startsWith('Bearer ')) {
      jwtToken = authHeader.value.slice(7);
    }
  }
  if (jwtToken) {
    if (isJwtExpired(jwtToken)) {
      issues.push({ severity: 'error', code: 'jwt-expired', message: 'Auth token (JWT) is expired', hint: 'Refresh or replace the Bearer token before sending.' });
    } else if (isJwtExpiringSoon(jwtToken)) {
      issues.push({ severity: 'warning', code: 'jwt-expiring', message: 'Auth token (JWT) expires within 5 minutes', hint: 'Token will likely be expired by the time the response arrives.' });
    }
  }

  // 5. No auth check for sensitive paths
  const sensitivePattern = /\/(admin|management|internal|private|secure|auth|login|token)/i;
  if (sensitivePattern.test(url) && tab.authType === 'none' && !enabledHeaders.some(h => /authorization|x-api-key/i.test(h.key))) {
    issues.push({ severity: 'info', code: 'no-auth-sensitive', message: 'Sensitive-looking endpoint with no authentication', hint: 'This path looks like it may require auth headers.' });
  }

  // 6. JSON body syntax check
  if (hasBody && (tab.bodyMode === 'raw' || tab.bodyMode === 'json')) {
    try {
      JSON.parse(tab.bodyRaw);
    } catch {
      issues.push({ severity: 'error', code: 'invalid-json', message: 'Request body is not valid JSON', hint: 'Fix the JSON syntax error before sending.' });
    }
  }

  return issues;
}

function buildAiSystemPrompt(tab: TabSnapshot): string {
  return `You are a senior API testing expert. Review the following HTTP request and identify any issues, anti-patterns, security concerns, or best-practice violations.

Be concise. Format your response as a bulleted list. Each bullet should start with an emoji (⚠️ warning, ❌ error, ℹ️ tip) followed by the issue and a brief fix suggestion.

Only report genuine issues — do not fabricate problems.`;
}

function buildAiUserMessage(tab: TabSnapshot): string {
  const enabledHeaders = tab.headers.filter(h => h.enabled && h.key.trim());
  return `Method: ${tab.method}
URL: ${tab.url}
Auth: ${tab.authType}
Body mode: ${tab.bodyMode}
Body (first 500 chars): ${tab.bodyRaw.slice(0, 500) || '(empty)'}
Headers: ${enabledHeaders.map(h => `${h.key}: ${h.value}`).join(', ') || '(none)'}

Review this request for issues.`;
}

// ── Severity pill ────────────────────────────────────────────────────────────

const SEVERITY_STYLE: Record<Severity, { bg: string; text: string; label: string }> = {
  error:   { bg: '#ef444420', text: '#ef4444', label: 'Error' },
  warning: { bg: '#f59e0b20', text: '#f59e0b', label: 'Warn' },
  info:    { bg: '#3b82f620', text: '#3b82f6', label: 'Info' },
};

function SeverityPill({ severity }: { severity: Severity }) {
  const s = SEVERITY_STYLE[severity];
  return (
    <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: s.bg, color: s.text }}>
      {s.label}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AiPreflightPopover({ tab, onClose }: Props) {
  const [issues] = useState<Issue[]>(() => runDeterministicChecks(tab));
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDone, setAiDone] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Listen for AI streaming events
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.type === 'ai:chunk' && msg.source === 'preflight') {
        setAiText(t => t + (msg.chunk ?? ''));
      } else if (msg?.type === 'ai:complete' && msg.source === 'preflight') {
        setAiLoading(false);
        setAiDone(true);
      } else if (msg?.type === 'ai:error' && msg.source === 'preflight') {
        setAiText('AI analysis failed. Please try again.');
        setAiLoading(false);
        setAiDone(true);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleAskAi = useCallback(() => {
    setAiLoading(true);
    setAiText('');
    setAiDone(false);
    postMsg({
      type: 'ai:send',
      source: 'preflight',
      systemPrompt: buildAiSystemPrompt(tab),
      messages: [{ role: 'user', content: buildAiUserMessage(tab) }],
      stream: true,
    });
  }, [tab]);

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warnCount  = issues.filter(i => i.severity === 'warning').length;

  return (
    <div
      className="absolute right-0 z-50"
      style={{ top: '100%', marginTop: '4px' }}
    >
      <div
        ref={overlayRef}
        className="rounded-xl border shadow-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--color-panel)',
          borderColor: 'var(--color-surface-border)',
          minWidth: '340px',
          maxWidth: '600px',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
          <SparkleIcon size={13} style={{ color: 'var(--color-protocol-ai)' }} />
          <span className="text-[12px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Pre-flight Check</span>
          {errorCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1" style={{ backgroundColor: '#ef444425', color: '#ef4444' }}>
              {errorCount} error{errorCount > 1 ? 's' : ''}
            </span>
          )}
          {warnCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#f59e0b25', color: '#f59e0b' }}>
              {warnCount} warning{warnCount > 1 ? 's' : ''}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto cursor-pointer hover:opacity-70 transition-opacity text-[14px] leading-none"
            style={{ color: 'var(--color-text-muted)' }}
          >
            ✕
          </button>
        </div>

        {/* Issues list */}
        <div className="px-4 py-3 flex flex-col gap-2" style={{ maxHeight: '240px', overflowY: 'auto' }}>
          {issues.length === 0 ? (
            <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
              <span style={{ color: '#22c55e' }}>✓</span>
              No issues detected — request looks good
            </div>
          ) : (
            issues.map((issue, i) => (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex items-start gap-2">
                  <SeverityPill severity={issue.severity} />
                  <span className="text-[11.5px] font-medium flex-1" style={{ color: 'var(--color-text-primary)' }}>
                    {issue.message}
                  </span>
                </div>
                {issue.hint && (
                  <p className="text-[10.5px] pl-[44px]" style={{ color: 'var(--color-text-muted)' }}>
                    {issue.hint}
                  </p>
                )}
              </div>
            ))
          )}
        </div>

        {/* AI analysis section */}
        <div className="border-t px-4 pb-4 pt-3 flex flex-col gap-2" style={{ borderColor: 'var(--color-surface-border)' }}>
          {!aiLoading && !aiDone && (
            <button
              type="button"
              onClick={handleAskAi}
              className="flex items-center gap-1.5 self-start text-[11px] font-medium px-3 py-1.5 rounded-md cursor-pointer hover:opacity-90 transition-opacity"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--color-protocol-ai) 15%, transparent)',
                color: 'var(--color-protocol-ai)',
                border: '1px solid color-mix(in srgb, var(--color-protocol-ai) 35%, transparent)',
              }}
            >
              <SparkleIcon size={10} />
              Ask AI for deeper analysis
            </button>
          )}
          {(aiLoading || aiText) && (
            <div
              className="rounded-md px-3 py-2.5 text-[11px] leading-relaxed whitespace-pre-wrap"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--color-protocol-ai) 6%, var(--color-surface))',
                color: 'var(--color-text-primary)',
                border: '1px solid color-mix(in srgb, var(--color-protocol-ai) 20%, transparent)',
              }}
            >
              {aiLoading && !aiText && (
                <span style={{ color: 'var(--color-text-muted)' }}>Analyzing request…</span>
              )}
              {aiText}
              {aiLoading && <span className="animate-pulse">▋</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Helper: count issues for a tab (used by UrlBar for badge) ────────────────
export function countPreflightIssues(tab: TabSnapshot): { errors: number; warnings: number } {
  const issues = runDeterministicChecks(tab);
  return {
    errors:   issues.filter(i => i.severity === 'error').length,
    warnings: issues.filter(i => i.severity === 'warning').length,
  };
}
