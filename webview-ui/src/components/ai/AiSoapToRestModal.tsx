/**
 * AiSoapToRestModal — AI converts SOAP WSDL operations to equivalent REST endpoints with OpenAPI 3.1 output.
 * Task 10.14 — AI SOAP to REST Migrator · Gate: soapToRest
 */
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTabsStore } from '../../store/tabs-store';
import { CloseIcon, SparkleIcon, CopyIcon, CheckIcon, DownloadIcon } from '../../icons';
import { postMsg } from '../../vscode';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-soap)';

const PLACEHOLDER = `<definitions name="UserService"
  targetNamespace="http://example.com/user"
  xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:tns="http://example.com/user"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema">

  <message name="GetUserRequest">
    <part name="userId" type="xsd:string"/>
  </message>
  <message name="GetUserResponse">
    <part name="user" type="tns:User"/>
  </message>

  <portType name="UserPortType">
    <operation name="GetUser">
      <input message="tns:GetUserRequest"/>
      <output message="tns:GetUserResponse"/>
    </operation>
  </portType>
</definitions>`;

export function AiSoapToRestModal({ onClose }: Props) {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const [wsdl, setWsdl] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const streamRef = useRef('');

  useEffect(() => {
    if (activeTab?.wsdl) setWsdl(activeTab.wsdl as string);
  }, [activeTab?.wsdl]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (msg?.type === 'aiStream:chunk') { streamRef.current += msg.chunk; setOutput(streamRef.current); }
      else if (msg?.type === 'aiStream:done') { setLoading(false); }
      else if (msg?.type === 'aiStream:error') { setError(msg.error || 'Migration failed'); setLoading(false); }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const migrate = () => {
    if (!activeTab || !(wsdl || activeTab?.wsdl) || loading) return;
    streamRef.current = ''; setOutput(''); setError(''); setLoading(true);
    const source = wsdl || String(activeTab?.wsdl || '');
    postMsg({
      type: 'aiChat',
      tabId: activeTab.id,
      messages: [{
        role: 'user',
        content: `You are an API migration expert specializing in SOAP to REST conversions. Convert the following SOAP WSDL to a modern RESTful API with OpenAPI 3.1 specification.

WSDL Source:
\`\`\`xml
${source.slice(0, 4000)}
\`\`\`

Migration requirements:
1. Map each SOAP operation to a REST endpoint with appropriate HTTP method (GET for reads, POST for creates, PUT/PATCH for updates, DELETE for deletes)
2. Convert SOAP input messages to REST request bodies (POST/PUT) or query params (GET)
3. Convert SOAP output messages to JSON response schemas
4. Map SOAP complex types to JSON Schema objects in OpenAPI components
5. Use RESTful URL patterns: /resources/{id} not /getResource?id=x
6. Generate a complete OpenAPI 3.1 YAML spec
7. Include a migration guide section at the top showing SOAP operation → REST endpoint mapping table

Output format:
## Migration Guide
| SOAP Operation | REST Endpoint | Method |
|---|---|---|
...

## OpenAPI 3.1 Spec
\`\`\`yaml
openapi: "3.1.0"
...
\`\`\``,
      }],
      stream: true,
    });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(output).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = () => {
    const blob = new Blob([output], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'soap-to-rest-migration.md'; a.click();
    URL.revokeObjectURL(url);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} onMouseDown={e => e.stopPropagation()}>
      <div className="relative flex flex-col rounded-2xl border shadow-2xl overflow-hidden" style={{ backgroundColor: 'var(--color-panel)', borderColor: `color-mix(in srgb, ${ACCENT} 30%, var(--color-surface-border))`, width: 820, maxHeight: '87vh' }}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <div className="flex items-center gap-2">
            <SparkleIcon size={14} style={{ color: ACCENT }} />
            <span className="text-[13px] font-semibold" style={{ color: ACCENT }}>SOAP → REST Migrator ✦</span>
          </div>
          <div className="flex items-center gap-2">
            {output && (
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

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: WSDL input */}
          <div className="flex flex-col flex-1 border-r min-w-0" style={{ borderColor: 'var(--color-surface-border)' }}>
            <div className="px-3 py-1.5 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>WSDL / SOAP</span>
            </div>
            <textarea
              value={wsdl}
              onChange={e => setWsdl(e.target.value)}
              className="flex-1 p-3 text-[11px] font-mono resize-none outline-none bg-transparent"
              style={{ color: 'var(--color-text-primary)' }}
              placeholder={PLACEHOLDER}
            />
          </div>
          {/* Right: OpenAPI output */}
          <div className="flex flex-col flex-1 min-w-0">
            <div className="px-3 py-1.5 border-b" style={{ borderColor: 'var(--color-surface-border)' }}>
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: ACCENT }}>REST + OpenAPI 3.1</span>
            </div>
            <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] p-3">
              {loading && !output && <p className="text-[11px] animate-pulse" style={{ color: ACCENT }}>Migrating SOAP to REST…</p>}
              {error && <p className="text-[11px]" style={{ color: 'var(--color-error)' }}>{error}</p>}
              {output && <pre className="text-[11px] font-mono whitespace-pre-wrap" style={{ color: 'var(--color-text-primary)' }}>{output}</pre>}
              {!loading && !output && !error && <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Migration result will appear here…</p>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 px-5 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--color-surface-border)' }}>
          <button type="button" onClick={migrate} disabled={(!wsdl.trim() && !activeTab?.wsdl) || loading}
            className="flex items-center gap-2 h-[34px] px-5 rounded-xl text-[12px] font-semibold cursor-pointer text-white hover:opacity-90 transition-opacity disabled:opacity-40"
            style={{ backgroundColor: ACCENT }}
          >
            <SparkleIcon size={11} />{loading ? 'Migrating…' : 'Migrate to REST ✦'}
          </button>
          <div className="flex-1" />
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[12px] font-medium cursor-pointer hover:bg-[var(--color-hover)]" style={{ color: 'var(--color-text-muted)' }}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
