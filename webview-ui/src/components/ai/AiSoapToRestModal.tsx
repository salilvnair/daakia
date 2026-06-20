/**
 * AiSoapToRestModal — AI converts SOAP WSDL operations to equivalent REST endpoints with OpenAPI 3.1 output.
 * Task 10.14 — AI SOAP to REST Migrator · Gate: soapToRest
 */
import { useState, useRef, useEffect } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { SparkleIcon, CopyIcon, CheckIcon, DownloadIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { ModalView, AIButtonView, ButtonView, EditorView, SplitPanelView, ResizablePanelView } from '../../dui';

interface Props {
  onClose: () => void;
}

const ACCENT = 'var(--color-protocol-soap)';

const PLACEHOLDER_WSDL = `<definitions name="UserService"
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

  const outputLang = output.trim().includes('openapi:') ? 'yaml' : 'markdown';

  return (
    <ModalView
      open
      onClose={onClose}
      title="SOAP → REST Migrator ✦"
      size="xl"
      headerColor={ACCENT}
      headerGradient
      headerIcon={
        <div style={{
          width: 28, height: 28, borderRadius: 6, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `color-mix(in srgb, ${ACCENT} 20%, transparent)`,
          border: `1px solid color-mix(in srgb, ${ACCENT} 30%, transparent)`,
        }}>
          <SparkleIcon size={14} style={{ color: ACCENT }} />
        </div>
      }
      footerLeft={
        <AIButtonView
          label={loading ? 'Migrating…' : 'Migrate to REST ✦'}
          action="generate"
          size="md"
          accentColor={ACCENT}
          disabled={(!wsdl.trim() && !activeTab?.wsdl) || loading}
          onClick={migrate}
        />
      }
      footerRight={
        output ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <ButtonView
              variant="secondary"
              size="md"
              iconLeft={copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
              style={{ color: copied ? 'var(--color-success)' : ACCENT }}
              onClick={handleCopy}
            >
              {copied ? 'Copied!' : 'Copy'}
            </ButtonView>
            <ButtonView
              variant="secondary"
              size="md"
              iconLeft={<DownloadIcon size={12} />}
              style={{ color: ACCENT }}
              onClick={handleDownload}
            >
              Download
            </ButtonView>
          </div>
        ) : undefined
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <span style={{
            fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: 'var(--color-text-muted)',
          }}>
            WSDL / SOAP Source
          </span>
          <span style={{
            fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: ACCENT,
          }}>
            REST + OpenAPI 3.1
          </span>
        </div>

        {/* Resizable side-by-side editors */}
        <ResizablePanelView defaultHeight={380} minHeight={180} maxHeight={560}>
          <SplitPanelView
            direction="horizontal"
            defaultSplit={50}
            minFirst={200}
            minSecond={200}
            first={
              <EditorView
                value={wsdl}
                language="xml"
                onChange={setWsdl}
                height="100%"
                placeholder={PLACEHOLDER_WSDL}
              />
            }
            second={
              <EditorView
                value={output || (loading ? '' : '')}
                language={outputLang}
                height="100%"
                readOnly={!loading && !!output}
                placeholder={
                  loading
                    ? 'Migrating SOAP to REST…'
                    : error
                    ? `Error: ${error}`
                    : 'Migration result will appear here…'
                }
              />
            }
          />
        </ResizablePanelView>

        {error && (
          <p style={{ fontSize: 11, color: 'var(--color-error)', margin: 0 }}>⚠️ {error}</p>
        )}
      </div>
    </ModalView>
  );
}
