/**
 * AiNlRequestBuilderModal — Sprint 11.2
 * "Get all admin users created after Jan 1st" → AI builds the exact request:
 * method, URL, query params, headers, body. Works for REST, GraphQL, gRPC, SOAP.
 * Gate: nlRequestBuilder feature flag
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, SparkleIcon } from '../../icons';
import { MdViewer } from '../shared/display/MdViewer';
import { postMsg } from '../../vscode';

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

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) e.preventDefault(); }}
    >
      <div
        className="relative flex flex-col rounded-lg overflow-hidden shadow-2xl"
        style={{ width: 580, maxHeight: '84vh', background: 'var(--color-bg-panel)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
          <span className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>Natural Language Request Builder ✦</span>
          <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded font-mono uppercase"
            style={{ background: 'color-mix(in srgb, var(--color-protocol-ai) 15%, transparent)', color: ACCENT }}>
            {proto.toUpperCase()}
          </span>
          <button type="button" onClick={onClose} className="ml-auto cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>
            <CloseIcon size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-4 overflow-y-auto flex-1">
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            Describe your API request in plain English. AI builds the exact request: method, URL, params, headers, and body.
          </p>

          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleBuild(); if (e.key === 'Escape') onClose(); }}
              placeholder='e.g. "Get all admin users created after Jan 1st, paginated by 20"'
              className="h-[26px] px-2.5 rounded text-[11px] flex-1"
              style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
            />
            <button
              type="button"
              onClick={handleBuild}
              disabled={!description.trim() || loading}
              className="flex items-center gap-1.5 h-[26px] px-3 rounded text-[11px] font-medium cursor-pointer disabled:opacity-40 shrink-0"
              style={{ background: ACCENT, color: '#fff' }}
            >
              {loading ? <span className="inline-block w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <SparkleIcon size={11} />}
              {loading ? 'Building…' : 'Build'}
            </button>
          </div>

          {error && <p className="text-[11px] px-2.5 py-1.5 rounded" style={{ background: 'color-mix(in srgb, var(--color-error) 12%, transparent)', color: 'var(--color-error)' }}>{error}</p>}

          {result && (
            <div className="flex flex-col gap-2">
              <div className="rounded border p-3 overflow-y-auto" style={{ maxHeight: 340, borderColor: 'var(--color-border)', background: 'var(--color-bg-surface)' }}>
                <MdViewer content={result} />
              </div>
              {parsed && onApply && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => { onApply(parsed); onClose(); }}
                    className="flex items-center gap-1.5 h-[26px] px-3 rounded text-[11px] font-medium cursor-pointer"
                    style={{ background: 'var(--color-success)', color: '#fff' }}
                  >
                    Apply to Request
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
