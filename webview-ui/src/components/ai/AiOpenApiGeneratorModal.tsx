/**
 * AiOpenApiGeneratorModal — Generates a full OpenAPI 3.1 spec from the active collection.
 * Task 10.10 — AI OpenAPI 3.1 Generator · Gate: openApiGenerator
 */
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTabsStore } from '../../store/tabs-store';
import { CloseIcon, SparkleIcon, CopyIcon, CheckIcon, DownloadIcon } from '../../icons';
import { postMsg } from '../../vscode';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-ai)';

export function AiOpenApiGeneratorModal({ onClose }: Props) {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const allTabs = useTabsStore(s => s.tabs);
  const [format, setFormat] = useState<'yaml' | 'json'>('yaml');
  const [spec, setSpec] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const streamRef = useRef('');

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStream:chunk') { streamRef.current += msg.chunk; setSpec(streamRef.current); }
      else if (msg?.type === 'aiStream:done') { setLoading(false); }
      else if (msg?.type === 'aiStream:error') { setError(msg.error || 'Generation failed'); setLoading(false); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const generate = () => {
    if (!activeTab || loading) return;
    streamRef.current = ''; setSpec(''); setError(''); setLoading(true);

    const requestTabs = allTabs.filter(t => t.protocol === 'rest' || t.protocol === 'graphql');
    const endpointSummary = requestTabs.slice(0, 20).map(t =>
      `- ${t.method || 'GET'} ${t.url || '(no URL)'}: ${t.name || 'Unnamed'}`
    ).join('\n') || '- GET https://api.example.com/users: Get Users';

    postMsg({
      type: 'aiChat',
      tabId: activeTab.id,
      messages: [{
        role: 'user',
        content: `Generate a complete OpenAPI 3.1.0 specification for the following API endpoints. Output ONLY valid ${format.toUpperCase()} — no explanation text, no markdown fences.

Endpoints discovered in the collection:
${endpointSummary}

Requirements:
1. OpenAPI version: 3.1.0
2. Include info: title, version, description, contact
3. For each endpoint: summary, description, operationId, tags, parameters (path/query/header), requestBody (if POST/PUT/PATCH), responses (200, 400, 401, 404, 500)
4. Define reusable schemas in components/schemas for all request/response bodies
5. Include securitySchemes (Bearer JWT, API Key, Basic Auth)
6. Add realistic example values for all fields
7. Use proper JSON Schema with type, format, description for every property
8. Output as ${format === 'yaml' ? 'clean YAML' : 'formatted JSON'}

Start the output with ${format === 'yaml' ? 'openapi: "3.1.0"' : '{"openapi": "3.1.0"'} and include nothing else.`,
      }],
      stream: true,
    });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(spec).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = () => {
    const blob = new Blob([spec], { type: format === 'yaml' ? 'text/yaml' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `openapi.${format}`; a.click();
    URL.revokeObjectURL(url);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} onMouseDown={e => e.stopPropagation()}>
      <div className="relative flex flex-col rounded-2xl border shadow-2xl overflow-hidden" style={{ backgroundColor: 'var(--color-panel)', borderColor: `color-mix(in srgb, ${ACCENT} 30%, var(--color-surface-border))`, width: 700, maxHeight: '85vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <div className="flex items-center gap-2">
            <SparkleIcon size={14} style={{ color: ACCENT }} />
            <span className="text-[13px] font-semibold" style={{ color: ACCENT }}>OpenAPI 3.1 Generator ✦</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg overflow-hidden border" style={{ borderColor: 'var(--color-surface-border)' }}>
              {(['yaml', 'json'] as const).map(f => (
                <button key={f} type="button" onClick={() => setFormat(f)}
                  className="px-2.5 py-1 text-[10.5px] font-medium cursor-pointer transition-all"
                  style={{ backgroundColor: format === f ? `color-mix(in srgb, ${ACCENT} 15%, transparent)` : 'transparent', color: format === f ? ACCENT : 'var(--color-text-muted)' }}
                >{f.toUpperCase()}</button>
              ))}
            </div>
            {spec && (
              <>
                <button type="button" onClick={handleCopy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer" style={{ color: copied ? 'var(--color-success)' : ACCENT, backgroundColor: `color-mix(in srgb, ${ACCENT} 10%, transparent)` }}>
                  {copied ? <CheckIcon size={11} /> : <CopyIcon size={11} />}{copied ? 'Copied!' : 'Copy'}
                </button>
                <button type="button" onClick={handleDownload} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer" style={{ color: ACCENT, backgroundColor: `color-mix(in srgb, ${ACCENT} 10%, transparent)` }}>
                  <DownloadIcon size={11} />Download
                </button>
              </>
            )}
            <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-[var(--color-hover)] cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>
              <CloseIcon size={13} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] p-5 min-h-0">
          {!spec && !loading && !error && (
            <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
              <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                Scan all open REST/GraphQL tabs and generate a complete OpenAPI 3.1 spec with schemas, examples, and auth schemes.
              </p>
              <button type="button" onClick={generate}
                className="flex items-center gap-2 h-[36px] px-5 rounded-xl text-[12px] font-semibold cursor-pointer text-white hover:opacity-90 transition-opacity"
                style={{ backgroundColor: ACCENT }}
              >
                <SparkleIcon size={12} />Generate OpenAPI Spec ✦
              </button>
            </div>
          )}
          {error && <p className="text-[11px] px-3 py-2 rounded-lg mb-3" style={{ color: 'var(--color-error)', backgroundColor: 'color-mix(in srgb, var(--color-error) 8%, transparent)' }}>{error}</p>}
          {loading && !spec && <p className="text-[11px] animate-pulse text-center py-8" style={{ color: ACCENT }}>Generating OpenAPI spec…</p>}
          {spec && (
            <pre className="text-[11.5px] font-mono whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>{spec}</pre>
          )}
        </div>

        {/* Footer */}
        {spec && (
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
