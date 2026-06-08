/**
 * WikiSection1.tsx — Quick Start, REST API, Collections, Environments
 */
import { SectionTitle, SubTitle, Steps, FeatureGrid, LiveRestScreen, Callout, WikiTable, ShortcutGrid, Code, Collapsible, WikiCard, Badge, ParamsTabPanel, HeadersTabPanel, BodyTabPanel, AuthTabPanel } from './WikiShared';

// ─── Quick Start ──────────────────────────────────────────────────────────────
export function QuickStartSection() {
  return (
    <div className="dw-section" id="quick-start">
      <SectionTitle emoji="🚀">Quick Start</SectionTitle>
      <Callout type="tip" title="Open Daakia">
        Press <strong>Ctrl+Shift+P</strong> → type <strong>Daakia: Open Panel</strong> → press Enter
      </Callout>
      <SubTitle>Your First Request in 30 Seconds</SubTitle>
      <Steps steps={[
        'Open Daakia via Command Palette (<strong>Ctrl+Shift+P</strong> → "Daakia: Open Panel")',
        'Type a URL in the URL bar — e.g. <strong>https://httpbin.org/get</strong>',
        'Make sure method is <strong>GET</strong> (default)',
        'Click <strong>Send</strong> or press <strong>Ctrl+Enter</strong>',
        'Response appears in the panel below — see status, body, headers, timing',
      ]} />
      <LiveRestScreen
        method="GET"
        url="https://httpbin.org/get"
        statusCode={200}
        responseContent='{"url":"https://httpbin.org/get","headers":{...}}'
        responseTime="187ms"
        responseSize="428 B"
      />
      <SubTitle>Keyboard Shortcuts</SubTitle>
      <ShortcutGrid items={[
        { label: 'Send request',         keys: ['Ctrl+Enter'] },
        { label: 'New tab',              keys: ['Ctrl+T'] },
        { label: 'Close tab',            keys: ['Ctrl+W'] },
        { label: 'Save request',         keys: ['Ctrl+S'] },
        { label: 'Save As',              keys: ['Ctrl+Shift+S'] },
        { label: 'Format body JSON',     keys: ['Alt+Shift+F'] },
        { label: 'Toggle sidebar panel', keys: ['Click icon'] },
      ]} />
      <SubTitle>What Daakia Can Do</SubTitle>
      <FeatureGrid items={[
        { emoji: '📡', title: 'REST API Client', desc: 'Send HTTP requests with full control over headers, body, auth, and scripts' },
        { emoji: '🔷', title: 'GraphQL Client', desc: 'Execute queries, mutations, and subscriptions with schema introspection' },
        { emoji: '🟢', title: 'WebSocket Client', desc: 'Real-time bidirectional messaging with log and protocols support' },
        { emoji: '🟣', title: 'gRPC Client', desc: 'Proto-based RPC calls with unary and streaming support' },
        { emoji: '🪪', title: 'SOAP Client', desc: 'Full WSDL-driven SOAP 1.1/1.2 with WS-Security and assertions' },
        { emoji: '🎭', title: 'Mock Server', desc: 'Local mock servers for all protocols — REST, GraphQL, WS, SSE, MQTT, gRPC, SOAP' },
        { emoji: '🤖', title: 'AI Assistant', desc: 'Daakia AI panel + @daakia VS Code chat participant with 8 specialized agents' },
        { emoji: '📁', title: 'Collections', desc: 'Organize requests into folders, import from Postman/OpenAPI/Bruno/HAR' },
        { emoji: '🌿', title: 'Environments', desc: 'Layered variable resolution: global → collection → env → request' },
        { emoji: '📝', title: 'Scripts', desc: 'Pre-request and post-response JavaScript scripts with daakia.test() assertions' },
      ]} />
    </div>
  );
}

// ─── REST API ─────────────────────────────────────────────────────────────────
export function RestApiSection() {
  return (
    <div className="dw-section" id="rest-api">
      <SectionTitle emoji="📡">REST API Client</SectionTitle>
      <SubTitle>URL Bar & Methods</SubTitle>
      <WikiTable
        headers={['Method', 'Color', 'Common Use']}
        rows={[
          [<Badge variant="ok">GET</Badge>, 'Green', 'Fetch data — no body required'],
          [<Badge variant="warn">POST</Badge>, 'Amber', 'Create resources, send JSON/form body'],
          [<Badge variant="rest">PUT</Badge>, 'Blue', 'Replace entire resource'],
          [<Badge variant="ai">PATCH</Badge>, 'Purple', 'Partial update to a resource'],
          [<span className="dw-badge warn">DELETE</span>, 'Red', 'Remove a resource'],
          ['HEAD / OPTIONS', 'Gray', 'Metadata checks and CORS preflight'],
        ]}
      />
      <SubTitle>Request Config Tabs</SubTitle>
      <FeatureGrid items={[
        { emoji: '🔗', title: 'Params', desc: 'Query params with enable/disable toggle. Badge shows count.' },
        { emoji: '📋', title: 'Headers', desc: 'Key-Value table with autocomplete. AI can suggest headers.' },
        { emoji: '📦', title: 'Body', desc: 'JSON, XML, Form-data, URL-encoded, Raw, Binary, GraphQL modes' },
        { emoji: '🔒', title: 'Auth', desc: 'Bearer, Basic, API Key, OAuth 2.0 (Client Credentials + Auth Code)' },
        { emoji: '📜', title: 'Scripts', desc: 'Pre-request and Post-response JavaScript scripts' },
        { emoji: '🔤', title: 'Variables', desc: 'Request-level variable overrides (highest priority)' },
      ]} />

      <SubTitle>Tab Panel Previews</SubTitle>
      <LiveRestScreen method="GET" url="https://api.example.com/users" activeTab="Params" tabPanel={<ParamsTabPanel />} />
      <LiveRestScreen method="POST" url="https://api.example.com/messages" activeTab="Headers" tabPanel={<HeadersTabPanel />} />
      <LiveRestScreen method="POST" url="https://api.example.com/users" activeTab="Body" tabPanel={<BodyTabPanel />} />
      <LiveRestScreen method="GET" url="https://api.example.com/orders" activeTab="Auth" tabPanel={<AuthTabPanel />} />

      <SubTitle>Live Demo — JSON POST Request</SubTitle>
      <LiveRestScreen
        method="POST"
        url="https://api.example.com/users"
        activeTab="Body"
        bodyContent='{"name": "Alice Smith", "role": "admin", "email": "alice@example.com"}'
        statusCode={201}
        statusText="Created"
        responseContent='{"id": 42, "name": "Alice Smith", "createdAt": "2026-06-07T10:00:00Z"}'
        responseTime="312ms"
        responseSize="98 B"
      />

      <SubTitle>Response Panel Tabs</SubTitle>
      <FeatureGrid items={[
        { emoji: '📄', title: 'Body', desc: 'Pretty-printed JSON, XML, or raw text with syntax highlight. Copy button.' },
        { emoji: '📋', title: 'Headers', desc: 'All response headers as key-value pairs.' },
        { emoji: '⏱️', title: 'Timeline', desc: 'DNS, TCP, TLS, TTFB, and download phase timings with visual bars.' },
        { emoji: '🍪', title: 'Cookies', desc: 'Cookies set by the response — name, value, domain, expiry.' },
        { emoji: '✅', title: 'Tests', desc: 'Script assertion results — pass/fail with details.' },
        { emoji: '📊', title: 'Network Logs', desc: 'Actual sent headers, content-type, boundary strings.' },
      ]} />

      <SubTitle>Send Actions</SubTitle>
      <WikiTable
        headers={['Action', 'How']}
        rows={[
          ['Send request',       'Main Send button or Ctrl+Enter'],
          ['Send & Download',    'Click ▾ arrow next to Send → "Send & Download" — saves response to file'],
          ['Import cURL',        'Click ▾ arrow → "Import cURL" — paste curl command to fill tab'],
          ['Show Code',          'Click ▾ arrow → "Show Code" — generate curl, JS, Python, Go, Java etc.'],
          ['Clear All',          'Click ▾ arrow → "Clear All" — resets tab to blank state'],
        ]}
      />

      <Callout type="info" title="Variable Highlighting">
        Type <Code>{'{{variableName}}'}</Code> anywhere — URL, headers, body — and it highlights in blue when the variable exists in the active environment.
        Use <Code>{'$daakia_{varName}_$'}</Code> to send the literal <Code>{'{{...}}'}</Code> text without substitution.
      </Callout>

      <Collapsible title="Body Modes Explained">
        <WikiTable
          headers={['Mode', 'Use Case']}
          rows={[
            ['JSON', 'application/json — Monaco editor with syntax highlighting'],
            ['Raw', 'Custom content-type: XML, YAML, plain text, HTML'],
            ['Form Data', 'multipart/form-data — supports file uploads'],
            ['URL Encoded', 'application/x-www-form-urlencoded — key=value&key2=value2'],
            ['Binary', 'Upload a single file as raw body bytes'],
            ['GraphQL', 'GraphQL query + variables — sends as JSON with {"query":"..."}'],
          ]}
        />
      </Collapsible>
    </div>
  );
}

// ─── Collections ──────────────────────────────────────────────────────────────
export function CollectionsSection() {
  return (
    <div className="dw-section" id="collections">
      <SectionTitle emoji="📁">Collections</SectionTitle>
      <FeatureGrid items={[
        { emoji: '📂', title: 'Organize', desc: 'Create nested folders and group requests by domain, project, or environment.' },
        { emoji: '✏️', title: 'CRUD', desc: 'Right-click any item — Rename, Duplicate, Delete, Move — inline editing.' },
        { emoji: '🖱️', title: 'Drag & Drop', desc: 'Reorder requests and folders by dragging. Move between collections.' },
        { emoji: '▶️', title: 'Collection Runner', desc: 'Run all requests in a collection sequentially with optional delay and stop-on-error.' },
      ]} />

      <SubTitle>Import Formats</SubTitle>
      <WikiTable
        headers={['Format', 'How to Import', 'What you get']}
        rows={[
          ['Postman v2.1', 'Right-click → Import from Postman', 'Full collection tree, headers, bodies, env vars'],
          ['OpenAPI 3.0', 'Right-click → Import from OpenAPI', 'Endpoints as requests with path params as {{param}}'],
          ['Swagger 2.0', 'Right-click → Import from OpenAPI', 'Same as OpenAPI 3.0'],
          ['HAR File', 'Right-click → Import from HAR', 'Requests grouped by domain with full headers & bodies'],
          ['Bruno', 'Right-click → Import from Bruno', 'Folder structure, .bru files, disabled entries (~ prefix)'],
        ]}
      />

      <SubTitle>Collection Properties</SubTitle>
      <WikiCard title="Collection-Level Settings" icon="⚙️">
        <Steps steps={[
          'Right-click a collection → <strong>Properties</strong>',
          '<strong>Variables tab</strong>: Set variables for all requests in this collection',
          '<strong>Auth tab</strong>: Set shared auth (Bearer, Basic, OAuth) — all child requests inherit it',
          '<strong>Scripts tab</strong>: Pre-request and post-response scripts that run for ALL requests in the collection',
        ]} />
        <Callout type="info">
          Auth priority: Request-level auth overrides collection auth. Collection auth overrides no auth.
        </Callout>
      </WikiCard>

      <SubTitle>Collection Runner</SubTitle>
      <Steps steps={[
        'Right-click a collection → <strong>Run Collection</strong>',
        'Set optional delay between requests (ms) and toggle <strong>Stop on error</strong>',
        'Click <strong>Run</strong> — requests execute sequentially in tree order',
        'See live progress: current request, pass/fail status per request',
        'Use <strong>Stop</strong> button to abort mid-run',
      ]} />
    </div>
  );
}

// ─── Environments & Variables ─────────────────────────────────────────────────
export function EnvironmentsSection() {
  return (
    <div className="dw-section" id="environments">
      <SectionTitle emoji="🌿">Environments & Variables</SectionTitle>
      <Callout type="tip" title="Variable Priority (Highest → Lowest)">
        Request Variables → Active Environment → Collection Variables → Global Variables
      </Callout>

      <SubTitle>Creating Environments</SubTitle>
      <Steps steps={[
        'Open the Environments panel (sidebar icon — stacked layers)',
        'Click <strong>+</strong> → New Environment → name it (e.g. "Dev", "Staging", "Prod")',
        'Add variables: key = <Code>baseUrl</Code>, value = <Code>https://dev.api.example.com</Code>',
        'Select the environment in the <strong>TabBar dropdown</strong> (per-tab)',
        'Use <Code>{"{{baseUrl}}"}</Code> anywhere in URL, headers, body, scripts',
      ]} />

      <SubTitle>Variable Types</SubTitle>
      <WikiTable
        headers={['Type', 'Behavior', 'Use For']}
        rows={[
          ['Default', 'Value shown in plain text', 'Base URLs, usernames, non-sensitive config'],
          ['Secret', 'Value masked (••••••) — eye icon to reveal', 'API keys, passwords, tokens'],
          ['Global', 'Available to ALL environments, no need to switch', 'App-wide constants like app name, version'],
        ]}
      />

      <SubTitle>Live Demo — Variable Resolution</SubTitle>
      <div className="dw-live">
        <div className="dw-live-bar">
          <span className="dw-live-method get">GET</span>
          <span className="dw-live-url">
            <span className="dw-var">{'{{baseUrl}}'}</span>/api/users?version=<span className="dw-var">{'{{apiVersion}}'}</span>
          </span>
          <span className="dw-live-send">Send</span>
        </div>
        <div className="dw-live-body" style={{ fontSize: 11, color: 'var(--dw-muted)' }}>
          Resolved → <strong style={{ color: 'var(--dw-fg)' }}>https://dev.api.example.com/api/users?version=v2</strong>
          <br />Environment: Dev | baseUrl=https://dev.api.example.com | apiVersion=v2
        </div>
        <div className="dw-live-status">
          <span className="ok">200 OK</span>
          <span className="muted">1.1 KB</span>
          <span className="muted">289ms</span>
        </div>
      </div>

      <SubTitle>Script-Level Variables</SubTitle>
      <WikiTable
        headers={['API', 'Example']}
        rows={[
          ['Read var from script', <Code>daakia.environment.get("baseUrl")</Code>],
          ['Write var from script', <Code>daakia.environment.set("token", response.json.token)</Code>],
          ['Collection var', <Code>daakia.collectionVariables.set("id", "42")</Code>],
          ['Global var', <Code>daakia.globals.set("sessionId", crypto.randomUUID())</Code>],
        ]}
      />

      <Callout type="info" title="Escape Syntax">
        Wrap in <Code>{'$daakia_'}</Code> ... <Code>{'_$'}</Code> to prevent variable substitution.
        E.g. <Code>{'$daakia_{username}_$'}</Code> sends literal text <Code>{'{{username}}'}</Code>.
      </Callout>
    </div>
  );
}
