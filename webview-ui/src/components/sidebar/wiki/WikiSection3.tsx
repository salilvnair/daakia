/**
 * WikiSection3.tsx — GraphQL, WebSocket, gRPC, SOAP protocols
 */
import { SectionTitle, SubTitle, Steps, FeatureGrid, Callout, WikiTable, Code, WikiCard, Badge, Divider } from './WikiShared';

// ─── GraphQL ──────────────────────────────────────────────────────────────────
export function GraphQLSection() {
  return (
    <div className="dw-section" id="graphql">
      <SectionTitle emoji="🔷">GraphQL Client</SectionTitle>
      <Callout type="info" title="Activate">
        Click the <Badge variant="graphql">GQL</Badge> icon in the left protocol rail to switch to GraphQL mode.
      </Callout>

      <SubTitle>Live Demo — GraphQL Query</SubTitle>
      <div className="dw-live">
        <div className="dw-live-bar">
          <span className="dw-live-method" style={{ background: 'color-mix(in srgb, var(--dw-graphql) 14%, transparent)', color: 'var(--dw-graphql)' }}>GQL</span>
          <span className="dw-live-url">https://countries.trevorblades.com/graphql</span>
          <span className="dw-live-send" style={{ color: 'var(--dw-graphql)', borderColor: 'color-mix(in srgb, var(--dw-graphql) 35%, transparent)' }}>Run</span>
        </div>
        <div className="dw-live-tabs">
          {['Query', 'Variables', 'Headers', 'Auth'].map((t, i) => (
            <span key={t} className={`dw-live-tab${i === 0 ? ' active' : ''}`} style={i === 0 ? { color: 'var(--dw-graphql)', borderBottomColor: 'var(--dw-graphql)' } : {}}>{t}</span>
          ))}
        </div>
        <div className="dw-live-body">
          <div style={{ color: '#a855f7' }}>{'query '}<span style={{ color: '#22c55e' }}>GetCountry</span>{'($code: ID!) {'}</div>
          <div style={{ paddingLeft: 16 }}>country(code: $code) {'{'}</div>
          <div style={{ paddingLeft: 32 }}>name, capital, currency</div>
          <div style={{ paddingLeft: 16 }}>{'}'}</div>
          <div>{'}'}</div>
        </div>
        <div className="dw-live-status">
          <span className="ok">200 OK</span>
          <span className="muted">Schema loaded ✓</span>
          <span className="muted">389ms</span>
        </div>
      </div>

      <SubTitle>Connect Flow</SubTitle>
      <Steps steps={[
        'Click the <strong>GQL</strong> protocol icon in the left rail',
        'Enter your GraphQL endpoint URL',
        'Click <strong>Connect</strong> — Daakia runs schema introspection',
        'Documentation (📖) and Schema (⟨/⟩) sidebar icons become active',
        'Write a query in the Query editor → click <strong>Run</strong>',
      ]} />

      <SubTitle>Sidebar Panels (after Connect)</SubTitle>
      <FeatureGrid items={[
        { emoji: '📖', title: 'Documentation', desc: 'Root Types, all schema types with color coding — search + filter.' },
        { emoji: '⟨/⟩', title: 'Schema SDL', desc: 'Full Schema Definition Language view — read-only, syntax highlighted.' },
        { emoji: '📁', title: 'Collections', desc: 'Save GraphQL requests to collections for later use.' },
        { emoji: '🕐', title: 'History', desc: 'All executed queries — click to replay.' },
        { emoji: '🌿', title: 'Environments', desc: 'Shared environments — {{gql_host}} resolves in endpoints and headers.' },
      ]} />

      <Callout type="tip">
        GraphQL Headers and Auth tabs are <strong>identical</strong> to REST — same KeyValueTable, same auth editor. Variables like <Code>{'{{authToken}}'}</Code> resolve the same way.
      </Callout>
    </div>
  );
}

// ─── WebSocket ────────────────────────────────────────────────────────────────
export function WebSocketSection() {
  return (
    <div className="dw-section" id="websocket">
      <SectionTitle emoji="🟢">WebSocket Client</SectionTitle>
      <Callout type="info" title="Activate">
        Click the <Badge variant="ws">WS</Badge> icon in the left protocol rail to switch to WebSocket mode.
      </Callout>

      <SubTitle>Live Demo — WebSocket Session</SubTitle>
      <div className="dw-live">
        <div className="dw-live-bar">
          <span className="dw-live-method" style={{ background: 'color-mix(in srgb, var(--dw-ws) 14%, transparent)', color: 'var(--dw-ws)' }}>WS</span>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--dw-ws)', flexShrink: 0 }} />
          <span className="dw-live-url">wss://echo.websocket.org</span>
          <span className="dw-live-send" style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.35)' }}>Disconnect</span>
        </div>
        <div className="dw-live-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ background: 'color-mix(in srgb, var(--dw-ws) 14%, transparent)', borderRadius: 6, padding: '4px 8px', maxWidth: '70%', fontSize: 11 }}>
              ↑ <strong style={{ color: 'var(--dw-ws)' }}>Sent</strong> — {'{"type":"ping","id":1}'}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ background: 'color-mix(in srgb, #818cf8 14%, transparent)', borderRadius: 6, padding: '4px 8px', maxWidth: '70%', fontSize: 11 }}>
              ↓ <strong style={{ color: '#818cf8' }}>Received</strong> — {'{"type":"pong","id":1}'}
            </div>
          </div>
        </div>
        <div className="dw-live-tabs">
          {['Communication', 'Protocols'].map((t, i) => (
            <span key={t} className={`dw-live-tab${i === 0 ? ' active' : ''}`} style={i === 0 ? { color: 'var(--dw-ws)', borderBottomColor: 'var(--dw-ws)' } : {}}>{t}</span>
          ))}
        </div>
      </div>

      <SubTitle>Features</SubTitle>
      <FeatureGrid items={[
        { emoji: '🔌', title: 'Connect/Disconnect', desc: 'URL bar connects/disconnects. Dot indicator: grey=off, green=on.' },
        { emoji: '📨', title: 'Send Messages', desc: 'JSON or Raw mode — Monaco editor at bottom. Clear input toggle.' },
        { emoji: '📜', title: 'Message Log', desc: 'Collapsible entries — green dot=sent, purple dot=received. Auto-scroll.' },
        { emoji: '🔧', title: 'Protocols Tab', desc: 'Set WebSocket subprotocols (e.g. graphql-ws) — enable/disable each.' },
      ]} />

      <WikiTable
        headers={['Subprotocol', 'Used With']}
        rows={[
          ['graphql-ws', 'GraphQL subscriptions over WebSocket'],
          ['subscriptions-transport-ws', 'Older Apollo GraphQL subscriptions'],
          ['wamp', 'Web Application Messaging Protocol (pub/sub, RPC)'],
          ['soap', 'SOAP messages over WebSocket'],
        ]}
      />

      <Callout type="tip">
        Environment variables resolve in both WebSocket <strong>URL</strong> and <strong>message body</strong>.
        <Code>{'{{ws_host}}'}</Code> in URL → connects to the resolved host.
        <Code>{'{"userId": "{{user_id}}"}'}</Code> in message → sends resolved value.
      </Callout>
    </div>
  );
}

// ─── gRPC ─────────────────────────────────────────────────────────────────────
export function GrpcSection() {
  return (
    <div className="dw-section" id="grpc">
      <SectionTitle emoji="🟣">gRPC Client</SectionTitle>
      <Callout type="info" title="Activate">
        Click the <Badge variant="grpc">gRPC</Badge> icon in the left protocol rail to switch to gRPC mode.
      </Callout>

      <FeatureGrid items={[
        { emoji: '📜', title: 'Proto Import', desc: 'Load .proto files to discover services and methods automatically.' },
        { emoji: '🔄', title: 'Streaming', desc: 'Unary, server streaming, client streaming, and bidirectional streaming.' },
        { emoji: '🔑', title: 'TLS + Auth', desc: 'Configure TLS certificates and gRPC metadata for auth.' },
        { emoji: '📁', title: 'Collections', desc: 'Save gRPC calls to collections, inherit auth.' },
        { emoji: '🎭', title: 'Mock Server', desc: 'gRPC mock server with configurable method responses and delays.' },
      ]} />

      <Steps steps={[
        'Click <strong>gRPC</strong> icon in the left protocol rail',
        'Import a .proto file — Daakia discovers all services and methods',
        'Select a service and method from the dropdowns',
        'Fill in the request JSON body (auto-generated from proto schema)',
        'Click <strong>Invoke</strong> to execute',
      ]} />
    </div>
  );
}

// ─── SOAP ─────────────────────────────────────────────────────────────────────
export function SoapSection() {
  return (
    <div className="dw-section" id="soap">
      <SectionTitle emoji="🪪">SOAP Client</SectionTitle>
      <Callout type="info" title="Activate">
        Click the <Badge variant="soap">SOAP</Badge> coral icon in the left protocol rail.
      </Callout>

      <SubTitle>Request Config Tabs</SubTitle>
      <WikiTable
        headers={['Tab', 'What it does']}
        rows={[
          ['Envelope', 'Monaco XML editor — write your SOAP 1.1/1.2 envelope here'],
          ['Form', 'Schema-driven form inputs (generated from WSDL operation schema)'],
          ['Headers', 'Custom HTTP headers (same KeyValueTable as REST)'],
          ['WS-Security', 'Configure UsernameToken, PasswordDigest, Nonce, Created timestamp'],
          ['Auth', 'HTTP-level auth (Bearer, Basic — same as REST)'],
          ['Assertions', 'XPath Match and Schema Valid assertions — run after response'],
          ['Scripts', 'Pre/post JavaScript scripts'],
          ['WSDL', 'Browse the parsed WSDL tree structure'],
        ]}
      />

      <SubTitle>WSDL Import & Operation Selector</SubTitle>
      <Steps steps={[
        'Click the <strong>WSDL</strong> button in the URL bar',
        'Enter WSDL URL (e.g. <Code>http://www.dneonline.com/calculator.asmx?WSDL</Code>) → Load',
        'The Operation Selector appears below the URL bar',
        'Select service, port, and operation — URL, SOAPAction, version auto-fill',
        'Envelope tab gets a skeleton XML for the selected operation',
      ]} />

      <WikiCard title="WS-Security in 3 steps" icon="🔐">
        <Steps steps={[
          'Go to <strong>WS-Security</strong> tab → toggle Enable',
          'Enter username + password, select PasswordDigest (or PasswordText)',
          'Check Include Nonce and Include Created → click <strong>Generate & Inject</strong>',
        ]} />
        <Callout type="ok">
          The envelope's {'<soap:Header>'} gets a complete {'<wsse:Security>'} block with UsernameToken, digest, nonce, and timestamp.
        </Callout>
      </WikiCard>

      <SubTitle>Assertions</SubTitle>
      <WikiTable
        headers={['Type', 'Expression', 'Pass Condition']}
        rows={[
          ['XPath Match', '//AddResult', 'XPath exists and matches expected value'],
          ['Schema Valid', '(optional element name)', 'Response has valid SOAP Envelope and Body'],
          ['Response Time', '<threshold ms>', 'Response time is under threshold'],
        ]}
      />

      <SubTitle>SOAP 1.1 vs 1.2</SubTitle>
      <WikiTable
        headers={['Feature', 'SOAP 1.1', 'SOAP 1.2']}
        rows={[
          ['Content-Type', 'text/xml', 'application/soap+xml'],
          ['SOAPAction', 'Separate HTTP header', 'Embedded in Content-Type (action= param)'],
          ['Namespace', 'http://schemas.xmlsoap.org/soap/envelope/', 'http://www.w3.org/2003/05/soap-envelope'],
          ['Error element', 'soap:Fault', 'soap:Fault (same, different structure)'],
        ]}
      />

      <Callout type="tip">
        Import SoapUI project XML files to bring in all your existing services, interfaces, and request envelopes instantly.
      </Callout>

      <Divider />
    </div>
  );
}
