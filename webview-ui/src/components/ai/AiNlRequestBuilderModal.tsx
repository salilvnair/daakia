/**
 * AiNlRequestBuilderModal — Sprint 11.2
 * "Get all admin users created after Jan 1st" → AI builds the exact request:
 * method, URL, query params, headers, body. Works for REST, GraphQL, gRPC, SOAP.
 * Gate: nlRequestBuilder feature flag
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';
import { ModalView, AIButtonView } from '../../dui';

interface Props {
  protocol: string;
  currentUrl?: string;
  onApply?: (result: NlRequestResult) => void;
  onClose: () => void;
}

export interface NlRequestResult {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  body?: string;
}

const ACCENT = 'var(--color-protocol-ai)';

const SYSTEM_PROMPTS: Record<string, string> = {
  rest: `You are an API expert. Convert a plain-English request description into a precise REST API request.

Output a JSON object with these fields (include only applicable ones):
{
  "method": "GET|POST|PUT|PATCH|DELETE",
  "url": "/api/path/with/{params}",
  "queryParams": {"key": "value"},
  "headers": {"Content-Type": "application/json", "Authorization": "Bearer {{token}}"},
  "body": {"field": "value"}
}

Then add a brief "## Explanation" section in Markdown explaining what each part does.
Use {{variableName}} for environment variables. Keep the URL path relative.`,
  graphql: `You are a GraphQL expert. Convert a plain-English request description into a GraphQL operation.

Output:
1. The GraphQL query/mutation/subscription (with variables defined)
2. A variables JSON object
3. Brief explanation of the operation

Format:
\`\`\`graphql
query/mutation/subscription OperationName($var: Type!) {
  field { subfield }
}
\`\`\`

Variables:
\`\`\`json
{"var": "value"}
\`\`\``,
  grpc: `You are a gRPC expert. Convert a plain-English request description into a gRPC call specification.

Output:
1. Service and method name (e.g. UserService.GetUser)
2. Request JSON payload
3. Brief explanation

Format clearly with headers for each section.`,
  soap: `You are a SOAP expert. Convert a plain-English request description into a SOAP envelope.

Output:
1. SOAP Action
2. Complete SOAP XML envelope
3. Brief explanation

Use proper SOAP 1.1/1.2 format.`,
};

function parseJsonBlock(raw: string): NlRequestResult | null {
  const match = raw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/im) || raw.match(/(\{[\s\S]*?\})/m);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

export function AiNlRequestBuilderModal({ protocol, currentUrl, onApply, onClose }: Props) {
  const [description, setDescription] = useState('');
  const [result, setResult] = useState('');
  const [parsed, setParsed] = useState<NlRequestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const streamRef = useRef('');
  const inputRef = useRef<HTMLInputElement>(null);
  const proto = (protocol || 'rest').toLowerCase();
  const systemPrompt = SYSTEM_PROMPTS[proto] || SYSTEM_PROMPTS.rest;

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStream:chunk') {
        streamRef.current += msg.chunk;
        setResult(streamRef.current);
      } else if (msg?.type === 'aiStream:done') {
        const raw = streamRef.current;
        setResult(raw);
        if (proto === 'rest') setParsed(parseJsonBlock(raw));
        setLoading(false);
      } else if (msg?.type === 'aiStream:error') {
        setError(msg.error || 'AI request failed');
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [proto]);

  const handleBuild = useCallback(() => {
    if (!description.trim() || loading) return;
    streamRef.current = '';
    setResult('');
    setParsed(null);
    setError('');
    setLoading(true);
    postMsg({
      type: 'aiStream',
      payload: {
        systemPrompt,
        userMessage: `${currentUrl ? `Base URL context: ${currentUrl}\n\n` : ''}Protocol: ${proto.toUpperCase()}\n\nRequest description: ${description.trim()}`,
        templateKey: 'rest.body.generate',
      },
    });
  }, [description, loading, systemPrompt, proto, currentUrl]);

  const protocolBadge = (
    <span style={{
      fontSize: 10, padding: '1px 6px', borderRadius: 4, fontFamily: 'var(--font-mono)',
      textTransform: 'uppercase', fontWeight: 600,
      background: 'color-mix(in srgb, var(--color-protocol-ai) 15%, transparent)',
      color: ACCENT,
    }}>
      {proto.toUpperCase()}
    </span>
  );

  return (
    <ModalView
      open
      onClose={onClose}
      title="Natural Language Request Builder ✦"
      size="md"
      headerColor="var(--color-protocol-ai)"
      headerIcon={
        <div style={{
          width: 26, height: 26, borderRadius: 6, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'color-mix(in srgb, var(--color-protocol-ai) 18%, transparent)',
        }}>
          <SparkleIcon size={13} style={{ color: ACCENT }} />
        </div>
      }
      headerRight={protocolBadge}
      footerRight={
        parsed && onApply
          ? <AIButtonView label="Apply to Request" size="sm" accentColor="var(--color-success)" onClick={() => { onApply(parsed!); onClose(); }} />
          : undefined
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>
          Describe your API request in plain English. AI builds the exact request: method, URL, params, headers, and body.
        </p>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={inputRef}
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleBuild(); if (e.key === 'Escape') onClose(); }}
            placeholder='e.g. "Get all admin users created after Jan 1st, paginated by 20"'
            style={{
              flex: 1, height: 32, padding: '0 10px', borderRadius: 6, fontSize: 11,
              background: 'var(--color-input-bg)',
              border: '1px solid var(--color-input-border)',
              color: 'var(--color-text-primary)',
              outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={handleBuild}
            disabled={!description.trim() || loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              height: 32, padding: '0 12px', borderRadius: 6, fontSize: 11,
              fontWeight: 500, cursor: 'pointer', flexShrink: 0, border: 'none',
              background: ACCENT, color: 'var(--color-btn-primary-text, #fff)',
              opacity: (!description.trim() || loading) ? 0.4 : 1,
            }}
          >
            {loading
              ? <span style={{ width: 12, height: 12, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
              : <SparkleIcon size={11} />}
            {loading ? 'Building…' : 'Build'}
          </button>
        </div>

        {error && (
          <p style={{
            fontSize: 11, padding: '6px 10px', borderRadius: 6, margin: 0,
            background: 'color-mix(in srgb, var(--color-error) 12%, transparent)',
            color: 'var(--color-error)',
          }}>
            {error}
          </p>
        )}

        {result && (
          <div style={{
            borderRadius: 8, padding: 12, overflowY: 'auto', maxHeight: 340,
            border: '1px solid var(--color-surface-border)',
            background: 'var(--color-surface)',
          }}>
            <MdViewer content={result} />
          </div>
        )}
      </div>
    </ModalView>
  );
}
