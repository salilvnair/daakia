/**
 * AiOpenApiGeneratorModal — Generates a full OpenAPI 3.1 spec from the active collection.
 * Task 10.10 — AI OpenAPI 3.1 Generator · Gate: openApiGenerator
 */
import { useState, useRef, useEffect } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { SparkleIcon, DownloadIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { ModalView, AIButtonView, CopyButtonView, ButtonView } from '@salilvnair/dui';

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

  const handleDownload = () => {
    const blob = new Blob([spec], { type: format === 'yaml' ? 'text/yaml' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `openapi.${format}`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ModalView
      open
      onClose={onClose}
      title="OpenAPI 3.1 Generator ✦"
      size="xl"
      headerColor={ACCENT}
      headerIcon={
        <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${ACCENT} 20%, transparent)` }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
        </div>
      }
      headerRight={
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--color-surface-border)' }}>
          {(['yaml', 'json'] as const).map(f => (
            <button key={f} type="button" onClick={() => setFormat(f)}
              className="px-2.5 py-1 text-[10.5px] font-medium cursor-pointer transition-all"
              style={{ backgroundColor: format === f ? `color-mix(in srgb, ${ACCENT} 15%, transparent)` : 'transparent', color: format === f ? ACCENT : 'var(--color-text-muted)' }}
            >{f.toUpperCase()}</button>
          ))}
        </div>
      }
      footerLeft={
        spec ? (
          <AIButtonView label="Regenerate" size="md" accentColor={ACCENT} onClick={generate} />
        ) : undefined
      }
      footerRight={
        spec ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <CopyButtonView text={spec} title="Copy" size="md" accentColor={ACCENT} />
            <ButtonView size="md" variant="secondary" onClick={handleDownload}>
              <DownloadIcon size={12} style={{ marginRight: 4 }} />Download
            </ButtonView>
          </div>
        ) : undefined
      }
    >
      {!spec && !loading && !error && (
        <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
          <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
            Scan all open REST/GraphQL tabs and generate a complete OpenAPI 3.1 spec with schemas, examples, and auth schemes.
          </p>
          <AIButtonView label="Generate OpenAPI Spec ✦" size="md" accentColor={ACCENT} onClick={generate} />
        </div>
      )}
      {error && <p className="text-[11px] px-3 py-2 rounded-lg mb-3" style={{ color: 'var(--color-error)', backgroundColor: 'color-mix(in srgb, var(--color-error) 8%, transparent)' }}>{error}</p>}
      {loading && !spec && <p className="text-[11px] animate-pulse text-center py-8" style={{ color: ACCENT }}>Generating OpenAPI spec…</p>}
      {spec && (
        <pre className="text-[11.5px] font-mono whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>{spec}</pre>
      )}
    </ModalView>
  );
}
