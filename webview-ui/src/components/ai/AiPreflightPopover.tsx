/**
 * AiPreflightPopover — 4.6.5 AI Pre-flight Check
 *
 * DUI ModalView wrapper — centered modal with backdrop.
 * Runs deterministic checks immediately and offers AI deep analysis.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { SparkleIcon } from '../../icons';
import { ModalView, AIButtonView, ButtonView } from '@salilvnair/dui';
import { sendAiRequest } from '../../services/ai/ai-client';
import { useAiPromptTemplatesStore } from '../../store/prompt-template';

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

/** The request, as the `rest.preflight` template's variables. */
function preflightVariables(tab: TabSnapshot): Record<string, string> {
  const enabledHeaders = tab.headers.filter(h => h.enabled && h.key.trim());
  return {
    method: tab.method,
    url: tab.url,
    headers: enabledHeaders.map(h => `${h.key}: ${h.value}`).join(', ') || '(none)',
    authType: tab.authType,
    body: tab.bodyRaw.slice(0, 500) || '(empty)',
  };
}

/**
 * The answer, as issues in the same list the deterministic checks fill.
 *
 * The template asks for `[{severity,field,issue,fix}]`. A model that answers
 * with prose instead is not an error worth showing as one — the caller falls
 * back to printing what came back.
 */
function parseAiIssues(text: string): Issue[] | null {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  try {
    const rows = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(rows)) return null;
    return rows
      .filter(r => r && typeof r === 'object' && (r.issue || r.message))
      .map(r => ({
        severity: (String(r.severity ?? 'info').toLowerCase() as Severity) || 'info',
        code: 'ai',
        message: String(r.field ? `${r.field}: ${r.issue ?? r.message}` : (r.issue ?? r.message)),
        hint: r.fix ? String(r.fix) : undefined,
      }))
      .map(i => ({ ...i, severity: (['error', 'warning', 'info'] as Severity[]).includes(i.severity) ? i.severity : 'info' }));
  } catch {
    return null;
  }
}

// ── Severity pill ────────────────────────────────────────────────────────────

const SEVERITY_STYLE: Record<Severity, { bg: string; text: string; label: string }> = {
  error:   { bg: 'color-mix(in srgb, var(--color-error) 15%, transparent)',   text: 'var(--color-error)',   label: 'Error' },
  warning: { bg: 'color-mix(in srgb, var(--color-warning) 15%, transparent)', text: 'var(--color-warning)', label: 'Warn' },
  info:    { bg: 'color-mix(in srgb, var(--color-info) 15%, transparent)',    text: 'var(--color-info)',    label: 'Info' },
};

function SeverityPill({ severity }: { severity: Severity }) {
  const s = SEVERITY_STYLE[severity];
  return (
    <span
      style={{
        fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, flexShrink: 0,
        backgroundColor: s.bg, color: s.text,
      }}
    >
      {s.label}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AiPreflightPopover({ tab, onClose }: Props) {
  const [issues] = useState<Issue[]>(() => runDeterministicChecks(tab));
  const [aiText, setAiText] = useState('');
  const [aiIssues, setAiIssues] = useState<Issue[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDone, setAiDone] = useState(false);
  const requestId = useRef('');
  const accumulated = useRef('');
  const resolve = useAiPromptTemplatesStore(s => s.resolve);

  /*
    Keyed on `tabId`, which is what the host actually replies with. This
    listened for `source: 'preflight'` — a field the host has never sent — so
    every chunk was discarded and the button spun until the modal closed.
  */
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (!requestId.current || msg?.tabId !== requestId.current) return;

      if (msg.type === 'ai:chunk') {
        accumulated.current += (msg.delta as string) || (msg.text as string) || '';
        setAiText(accumulated.current);
      } else if (msg.type === 'ai:complete') {
        const payload = msg.message as { content?: string } | undefined;
        const text = accumulated.current || payload?.content || '';
        const parsed = parseAiIssues(text);
        if (parsed && parsed.length > 0) { setAiIssues(parsed); setAiText(''); }
        else if (!text.trim()) setAiText('The model returned nothing to report.');
        setAiLoading(false);
        setAiDone(true);
        requestId.current = '';
      } else if (msg.type === 'ai:error') {
        setAiText((msg.message as string) || 'Could not analyse the request — check the AI provider settings.');
        setAiLoading(false);
        setAiDone(true);
        requestId.current = '';
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleAskAi = useCallback(() => {
    setAiLoading(true);
    setAiText('');
    setAiIssues([]);
    setAiDone(false);
    accumulated.current = '';
    requestId.current = sendAiRequest({
      stage: 'rest.preflight',
      screen: 'REST · Request',
      systemPrompts: [resolve('rest.preflight.system')],
      userPrompt: resolve('rest.preflight', preflightVariables(tab)),
      settings: { temperature: 0.2, maxTokens: 900 },
    });
  }, [tab, resolve]);

  /* The AI's findings join the deterministic ones rather than sitting in a
     second list — they are the same kind of thing to the person reading. */
  const allIssues = [...issues, ...aiIssues];

  const errorCount = allIssues.filter(i => i.severity === 'error').length;
  const warnCount  = allIssues.filter(i => i.severity === 'warning').length;

  const headerBadges = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {errorCount > 0 && (
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20,
          background: 'color-mix(in srgb, var(--color-error) 18%, transparent)',
          color: 'var(--color-error)',
        }}>
          {errorCount} error{errorCount > 1 ? 's' : ''}
        </span>
      )}
      {warnCount > 0 && (
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20,
          background: 'color-mix(in srgb, var(--color-warning) 18%, transparent)',
          color: 'var(--color-warning)',
        }}>
          {warnCount} warning{warnCount > 1 ? 's' : ''}
        </span>
      )}
      {errorCount === 0 && warnCount === 0 && (
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20,
          background: 'color-mix(in srgb, var(--color-success) 18%, transparent)',
          color: 'var(--color-success)',
        }}>
          All clear
        </span>
      )}
    </div>
  );

  return (
    <ModalView
      open
      onClose={onClose}
      title="Pre-flight Check"
      size="sm"
      headerColor="var(--color-protocol-ai)"
      headerIcon={
        <div style={{
          width: 26, height: 26, borderRadius: 6, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'color-mix(in srgb, var(--color-protocol-ai) 18%, transparent)',
        }}>
          <SparkleIcon size={13} style={{ color: 'var(--color-protocol-ai)' }} />
        </div>
      }
      headerRight={headerBadges}
      footerRight={!aiLoading && !aiDone ? (
        <AIButtonView label="Ask AI for deeper analysis" size="sm" onClick={handleAskAi} />
      ) : undefined}
    >
      {/* Issues list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {allIssues.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--color-text-secondary)' }}>
            <span style={{ color: 'var(--color-success)' }}>✓</span>
            No issues detected — request looks good
          </div>
        ) : (
          allIssues.map((issue, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <SeverityPill severity={issue.severity} />
                <span style={{ fontSize: 11.5, fontWeight: 500, flex: 1, color: 'var(--color-text-primary)' }}>
                  {issue.message}
                </span>
              </div>
              {issue.hint && (
                <p style={{ fontSize: 10.5, paddingLeft: 44, margin: 0, color: 'var(--color-text-muted)' }}>
                  {issue.hint}
                </p>
              )}
            </div>
          ))
        )}
      </div>

      {/* AI streaming response */}
      {(aiLoading || aiText) && (
        <div
          style={{
            marginTop: 14,
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 11,
            lineHeight: 1.7,
            whiteSpace: 'pre-wrap',
            background: 'color-mix(in srgb, var(--color-protocol-ai) 6%, var(--color-surface))',
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
    </ModalView>
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
