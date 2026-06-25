import React from 'react';
import {
  SectionCard, SectionHeader, FeatureRow, ProtocolBadge,
  ShortcutRow, TipBox, Chip, SubHeader, InfoRow, PROTOCOL_COLORS,
} from './WelcomeShared';

// ─── vscode API bridge (acquired once at module level) ────────────────────────
declare function acquireVsCodeApi(): { postMessage: (msg: unknown) => void };
const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;
function openPanel() { vscode?.postMessage({ command: 'openPanel' }); }

// ─── Root ─────────────────────────────────────────────────────────────────────

export function WelcomeSidebar() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <OpenButton />
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '10px 8px 28px',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}>
        <QuickStartSection />
        <ProtocolsSection />
        <RestSection />
        <GraphQLSection />
        <WebSocketSection />
        <GrpcSection />
        <SoapSection />
        <AiSection />
        <McpSection />
        <MockServerSection />
        <CollectionsSection />
        <EnvironmentsSection />
        <WikiFooter />
      </div>
    </div>
  );
}

// ─── Open Button ─────────────────────────────────────────────────────────────

function OpenButton() {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button
      onClick={openPanel}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        width: 'calc(100% - 16px)',
        margin: '10px 8px 0',
        padding: '9px 16px',
        border: 'none',
        borderRadius: 7,
        fontSize: 12,
        fontWeight: 700,
        cursor: 'pointer',
        background: hovered ? '#4f52d4' : '#6366f1',
        color: '#fff',
        transition: 'background 0.15s',
        flexShrink: 0,
        letterSpacing: '0.01em',
        fontFamily: 'inherit',
      }}
    >
      <DaakiaIcon />
      Open Daakia Panel
    </button>
  );
}

function DaakiaIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" opacity="0.6" />
    </svg>
  );
}

// ─── Quick Start ─────────────────────────────────────────────────────────────

function QuickStartSection() {
  return (
    <SectionCard>
      <SectionHeader icon="⚡" label="Quick Start" />
      <TipBox title="Send your first request" accent="#6366f1">
        Type a URL → choose method → click <strong>Send</strong>
        <br />or press <code style={{ background: 'rgba(99,102,241,0.15)', padding: '0 4px', borderRadius: 3, fontFamily: 'monospace' }}>Ctrl+Enter</code>
      </TipBox>
      <ShortcutRow label="Send request"      keys={['Ctrl', 'Enter']} />
      <ShortcutRow label="New tab"           keys={['Ctrl', 'T']} />
      <ShortcutRow label="Save request"      keys={['Ctrl', 'S']} />
      <ShortcutRow label="Close tab"         keys={['Ctrl', 'W']} />
      <ShortcutRow label="Switch tab"        keys={['Ctrl', '1-9']} />
      <ShortcutRow label="Command Palette"   keys={['Ctrl', 'Shift', 'P']} />
    </SectionCard>
  );
}

// ─── Protocols ───────────────────────────────────────────────────────────────

const PROTOCOLS = [
  { label: 'REST',      color: PROTOCOL_COLORS.rest },
  { label: 'GraphQL',   color: PROTOCOL_COLORS.graphql },
  { label: 'WebSocket', color: PROTOCOL_COLORS.websocket },
  { label: 'gRPC',      color: PROTOCOL_COLORS.grpc },
  { label: 'SOAP',      color: PROTOCOL_COLORS.soap },
  { label: 'AI',        color: PROTOCOL_COLORS.ai },
  { label: 'MCP',       color: PROTOCOL_COLORS.mcp },
  { label: 'Mock',      color: PROTOCOL_COLORS.mock },
];

function ProtocolsSection() {
  return (
    <SectionCard>
      <SectionHeader icon="🔌" label="Protocols" />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {PROTOCOLS.map(p => <ProtocolBadge key={p.label} label={p.label} color={p.color} />)}
      </div>
    </SectionCard>
  );
}

// ─── REST ────────────────────────────────────────────────────────────────────

function RestSection() {
  const c = PROTOCOL_COLORS.rest;
  return (
    <SectionCard>
      <SectionHeader icon="📡" label="REST API" accent={c} />
      <FeatureRow icon="🔗" title="Params & Headers"
        desc="Key-value tables with enable/disable toggles, badge counts, AI header suggestions, and bulk-edit" />
      <FeatureRow icon="📦" title="Body"
        desc="JSON · XML · Form-data · URL-encoded · Binary · GraphQL modes with syntax highlighting" />
      <FeatureRow icon="🔐" title="Auth"
        desc="Bearer token, Basic, API Key, OAuth 2.0, Digest — saved per-request" />
      <FeatureRow icon="⏱️" title="Timeline"
        desc="DNS · TCP · TLS · TTFB breakdown with visual waterfall bars" />
      <FeatureRow icon="🍪" title="Cookie Jar"
        desc="Auto-capture and replay cookies per domain" />
      <FeatureRow icon="📋" title="Pre-request Scripts"
        desc="Run JS before each request to mutate headers, env vars, or body" />
      <FeatureRow icon="🔍" title="Response Inspector"
        desc="Syntax-highlighted JSON/XML, search, copy, format, size & status display" />
      <FeatureRow icon="⚙️" title="Environments"
        desc="Inject variables into URL, headers, body — swap dev/staging/prod instantly" />
    </SectionCard>
  );
}

// ─── GraphQL ─────────────────────────────────────────────────────────────────

function GraphQLSection() {
  const c = PROTOCOL_COLORS.graphql;
  return (
    <SectionCard>
      <SectionHeader icon="◈" label="GraphQL" accent={c} />
      <FeatureRow icon="🗂️" title="Schema Explorer"
        desc="Auto-introspect and browse types, queries, mutations, and subscriptions" />
      <FeatureRow icon="✍️" title="Query Builder"
        desc="Syntax-aware editor with field auto-complete from introspected schema" />
      <FeatureRow icon="📐" title="Variables & Fragments"
        desc="Dedicated JSON variable panel and reusable fragment management" />
      <FeatureRow icon="📡" title="Subscriptions"
        desc="Real-time subscription support over WebSocket transport" />
    </SectionCard>
  );
}

// ─── WebSocket ───────────────────────────────────────────────────────────────

function WebSocketSection() {
  const c = PROTOCOL_COLORS.websocket;
  return (
    <SectionCard>
      <SectionHeader icon="⚡" label="WebSocket" accent={c} />
      <FeatureRow icon="🔄" title="Connect / Disconnect"
        desc="Manual connect lifecycle with status indicator and reconnect control" />
      <FeatureRow icon="💬" title="Message History"
        desc="Timestamped send/receive log with filter, search, and copy per message" />
      <FeatureRow icon="📟" title="Binary & Text Frames"
        desc="Send raw text, JSON, or binary payloads with encoding selector" />
      <FeatureRow icon="🔁" title="Auto-reconnect"
        desc="Configurable retry delay and max-attempts with exponential backoff" />
    </SectionCard>
  );
}

// ─── gRPC ────────────────────────────────────────────────────────────────────

function GrpcSection() {
  const c = PROTOCOL_COLORS.grpc;
  return (
    <SectionCard>
      <SectionHeader icon="⚙️" label="gRPC" accent={c} />
      <FeatureRow icon="📄" title="Proto Upload & Compile"
        desc="Upload .proto files — services, methods, and message types auto-parsed" />
      <FeatureRow icon="📦" title="All Streaming Modes"
        desc="Unary · Server streaming · Client streaming · Bidirectional streaming" />
      <FeatureRow icon="🗂️" title="Package Browser"
        desc="Navigate nested proto packages and select method from dropdown" />
      <FeatureRow icon="🔐" title="TLS / mTLS"
        desc="Connect to secured gRPC endpoints with cert and key upload" />
    </SectionCard>
  );
}

// ─── SOAP ────────────────────────────────────────────────────────────────────

function SoapSection() {
  const c = PROTOCOL_COLORS.soap;
  return (
    <SectionCard>
      <SectionHeader icon="🧼" label="SOAP" accent={c} />
      <FeatureRow icon="📋" title="WSDL Auto-parse"
        desc="Load WSDL URL or file — services, ports, and bindings extracted automatically" />
      <FeatureRow icon="🔧" title="Operation Picker"
        desc="Select operation from dropdown; request envelope pre-filled from WSDL schema" />
      <FeatureRow icon="✏️" title="XML Editor"
        desc="Full XML editor with schema-aware hints and SOAP envelope template" />
    </SectionCard>
  );
}

// ─── AI Assistant ────────────────────────────────────────────────────────────

function AiSection() {
  const c = PROTOCOL_COLORS.ai;
  return (
    <SectionCard>
      <SectionHeader icon="✦" label="AI Assistant" accent={c} />
      <TipBox title="8 Specialized Agents" accent={c}>
        Click <strong>✦</strong> in the left rail to open the full AI panel
      </TipBox>
      <FeatureRow icon="🤖" title="Daakia AI Panel"
        desc="Chat with purpose-built agents: REST builder, test generator, mock designer, curl converter, debugger, and more"
        chips={['Builder', 'Tester', 'Debugger', 'MockGen', 'CurlBot']} chipColor={c} />
      <FeatureRow icon="@" title="@daakia in VS Code Chat"
        desc="Use slash commands from the VS Code chat panel without opening Daakia"
        chips={['/request', '/mock', '/test', '/curl', '/explain']} chipColor={c} />
      <FeatureRow icon="💡" title="Inline AI"
        desc="Hover any error or response → AI explains it, suggests fixes, and proposes follow-up requests" />
      <FeatureRow icon="🔑" title="Header Hints"
        desc="AI suggests missing auth headers, content-type, and common API headers inline" />
      <FeatureRow icon="🧪" title="AI Test Generation"
        desc="Generate Playwright, Jest, or Postman test scripts from any captured request" />
    </SectionCard>
  );
}

// ─── MCP ─────────────────────────────────────────────────────────────────────

function McpSection() {
  const c = PROTOCOL_COLORS.mcp;
  return (
    <SectionCard>
      <SectionHeader icon="🔗" label="MCP — Model Context Protocol" accent={c} />
      <FeatureRow icon="🖥️" title="Server Management"
        desc="Add, configure, and toggle STDIO or HTTP MCP servers from a central panel" />
      <FeatureRow icon="🛠️" title="Tools Browser"
        desc="Discover, inspect, and invoke tools exposed by connected MCP servers" />
      <FeatureRow icon="📚" title="Resources & Prompts"
        desc="Browse resources and prompt templates served by each MCP server" />
      <FeatureRow icon="🔑" title="Auth & Env Vars"
        desc="Manage per-server environment variables with secret masking, bulk-edit, and insert-row" />
      <FeatureRow icon="⚙️" title="Config Editor"
        desc="Raw JSON editor with Load Example, Copy, and Apply for rapid server config" />
    </SectionCard>
  );
}

// ─── Mock Server ─────────────────────────────────────────────────────────────

function MockServerSection() {
  const c = PROTOCOL_COLORS.mock;
  return (
    <SectionCard>
      <SectionHeader icon="🎭" label="Mock Server" accent={c} />
      <SubHeader>Protocols</SubHeader>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 7 }}>
        {['REST', 'GraphQL', 'WebSocket', 'SSE', 'Socket.IO', 'MQTT', 'gRPC', 'SOAP', 'MCP'].map(p => (
          <Chip key={p} label={p} color={c} />
        ))}
      </div>
      <FeatureRow icon="⚡" title="Local Servers"
        desc="Spin up typed mock servers with hot-reload on route changes" />
      <FeatureRow icon="🤖" title="AI Generate"
        desc="Describe your API in plain text → AI generates routes, responses, and schemas automatically" />
      <FeatureRow icon="📝" title="WireMock Mode"
        desc="Import/export WireMock JSON stubs; full pattern matching (URL, method, headers, body)" />
      <FeatureRow icon="🔀" title="State Machine Workflows"
        desc="Model multi-step stateful flows: states, transitions, guards, and auto-advance timers" />
      <FeatureRow icon="💥" title="Fault Injection & Chaos"
        desc="Inject latency, timeouts, 5xx errors, and random failures per route or globally" />
      <FeatureRow icon="🔔" title="Webhook Callbacks"
        desc="Fire outbound POST callbacks after a route matches — supports template variables" />
      <FeatureRow icon="🔍" title="Traffic Inspector"
        desc="Live log of all requests hitting mock servers with matched route, latency, and body" />
      <FeatureRow icon="🎨" title="Template Editor"
        desc="Handlebars templates with request variables — dynamic responses from static definitions" />
      <FeatureRow icon="📦" title="Import / Export"
        desc="Snapshot and restore mock server definitions as portable JSON packages" />
    </SectionCard>
  );
}

// ─── Collections ─────────────────────────────────────────────────────────────

function CollectionsSection() {
  return (
    <SectionCard>
      <SectionHeader icon="📁" label="Collections" />
      <FeatureRow icon="📂" title="Organize Requests"
        desc="Nested folders with drag-to-reorder, right-click context menu, and rename in-place" />
      <FeatureRow icon="📥" title="Import"
        desc="Postman v2.1 · OpenAPI 3.0 · HAR · Bruno — one-click import with full header/body preservation" />
      <FeatureRow icon="📤" title="Export"
        desc="Export any folder or full collection as Postman or OpenAPI format" />
      <FeatureRow icon="▶️" title="Collection Runner"
        desc="Run all requests sequentially with configurable delay, variable injection, and stop-on-error" />
      <FeatureRow icon="🔗" title="Share & Sync"
        desc="Collections persisted in SQLite — no cloud required, no account needed" />
    </SectionCard>
  );
}

// ─── Environments ─────────────────────────────────────────────────────────────

function EnvironmentsSection() {
  return (
    <SectionCard>
      <SectionHeader icon="🌍" label="Environments & Variables" />
      <FeatureRow icon="🔧" title="Multiple Environments"
        desc="Define dev, staging, prod — switch active env from the toolbar in one click" />
      <FeatureRow icon="💉" title="Variable Injection"
        desc="Use {{variable}} in any URL, header, body, or auth field — resolved at send time" />
      <FeatureRow icon="🔒" title="Secret Masking"
        desc="Mark variables as secret — values hidden in the UI, never logged in history" />
      <FeatureRow icon="📋" title="Global Variables"
        desc="Shared variables available across all collections and environments" />
    </SectionCard>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function WikiFooter() {
  return (
    <div
      onClick={openPanel}
      style={{
        fontSize: 10,
        color: 'var(--vscode-descriptionForeground)',
        textAlign: 'center',
        padding: '8px 0 4px',
        borderTop: '1px solid var(--vscode-widget-border, rgba(128,128,128,0.15))',
        marginTop: 4,
        cursor: 'pointer',
      }}
    >
      Full feature docs →{' '}
      <span style={{ color: '#818cf8', textDecoration: 'underline' }}>Settings → Daakia Wiki</span>
    </div>
  );
}
