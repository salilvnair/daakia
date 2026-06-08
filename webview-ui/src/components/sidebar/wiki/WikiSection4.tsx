/**
 * WikiSection4.tsx — Mock Server, AI Assistant, Settings
 */
import { SectionTitle, SubTitle, Steps, FeatureGrid, Callout, WikiTable, Code, WikiCard, CmdList, Badge, Divider } from './WikiShared';

// ─── Mock Server ──────────────────────────────────────────────────────────────
export function MockServerSection() {
  return (
    <div className="dw-section" id="mock-server">
      <SectionTitle emoji="🎭">Mock Server</SectionTitle>
      <Callout type="tip" title="What is Mock Server?">
        Runs real local HTTP/WS/gRPC/MQTT servers on your machine — no internet needed. Perfect for frontend dev, testing, and demos.
      </Callout>

      <SubTitle>Supported Protocols</SubTitle>
      <div className="dw-protocol-row">
        {[
          { label: 'REST', color: 'var(--dw-rest)', bg: 'color-mix(in srgb, var(--dw-rest) 12%, transparent)', border: 'color-mix(in srgb, var(--dw-rest) 30%, transparent)' },
          { label: 'GraphQL', color: 'var(--dw-graphql)', bg: 'color-mix(in srgb, var(--dw-graphql) 12%, transparent)', border: 'color-mix(in srgb, var(--dw-graphql) 30%, transparent)' },
          { label: 'WebSocket', color: 'var(--dw-ws)', bg: 'color-mix(in srgb, var(--dw-ws) 12%, transparent)', border: 'color-mix(in srgb, var(--dw-ws) 30%, transparent)' },
          { label: 'SSE', color: '#f59e0b', bg: 'color-mix(in srgb, #f59e0b 12%, transparent)', border: 'color-mix(in srgb, #f59e0b 30%, transparent)' },
          { label: 'Socket.IO', color: '#22c55e', bg: 'color-mix(in srgb, #22c55e 12%, transparent)', border: 'color-mix(in srgb, #22c55e 30%, transparent)' },
          { label: 'MQTT', color: '#06b6d4', bg: 'color-mix(in srgb, #06b6d4 12%, transparent)', border: 'color-mix(in srgb, #06b6d4 30%, transparent)' },
          { label: 'gRPC', color: 'var(--dw-grpc)', bg: 'color-mix(in srgb, var(--dw-grpc) 12%, transparent)', border: 'color-mix(in srgb, var(--dw-grpc) 30%, transparent)' },
          { label: 'SOAP', color: 'var(--dw-soap)', bg: 'color-mix(in srgb, var(--dw-soap) 12%, transparent)', border: 'color-mix(in srgb, var(--dw-soap) 30%, transparent)' },
        ].map(p => (
          <span key={p.label} className="dw-protocol-chip" style={{ color: p.color, background: p.bg, borderColor: p.border }}>
            {p.label}
          </span>
        ))}
      </div>

      <SubTitle>Create & Run a REST Mock Server</SubTitle>
      <Steps steps={[
        'Click the <strong>Mock Server</strong> icon in the left rail',
        'Click <strong>+ Create Mock Server</strong> → name it, select protocol <strong>REST</strong>',
        'Click <strong>+ Add Route</strong> → set method (<strong>GET</strong>), path (<strong>/api/users</strong>)',
        'Set the response body JSON and status code (<strong>200</strong>)',
        'Click <strong>▶ Start</strong> → server starts on a random port (e.g. 8043)',
        'Test it: <Code>GET http://localhost:8043/api/users</Code>',
      ]} />

      <SubTitle>Activity Log</SubTitle>
      <Callout type="info">
        The Activity Log at the bottom of the Mock panel shows every request in real-time:
        method, path, status, timestamp. Click any entry to see request headers, body, response headers, and response body.
      </Callout>

      <SubTitle>Protocol-Specific Features</SubTitle>
      <WikiTable
        headers={['Protocol', 'Key Config']}
        rows={[
          [<Badge variant="rest">REST</Badge>, 'Routes: method + path + response body + headers + delay. Path params (:id). Hot-reload.'],
          [<Badge variant="graphql">GraphQL</Badge>, 'Custom SDL schema + mock operations per query/mutation. Introspection included.'],
          [<Badge variant="ws">WebSocket</Badge>, 'On Connect / On Message (regex pattern) / On Disconnect handlers. Broadcast toggle.'],
          ['SSE', 'Event streams with name, data, interval, and delay. Multiple event types.'],
          ['Socket.IO', 'Event-based handlers — emit and respond with namespaces.'],
          ['MQTT', 'Topic subscriptions with publish delay and interval.'],
          [<Badge variant="grpc">gRPC</Badge>, 'Method-level responses with streaming support and delay.'],
          [<Badge variant="soap">SOAP</Badge>, 'Service → Operation hierarchy. Static, fault, or script response types.'],
        ]}
      />

      <SubTitle>AI Generate — Create Mock Content Automatically</SubTitle>
      <WikiCard title="✨ Generate with AI" icon="🤖">
        <Steps steps={[
          'Add a description to your mock server (e.g. "E-commerce product catalog API")',
          'Click the <strong>✨ Generate</strong> button in the protocol config section',
          'Review the AI-generated routes/operations/handlers in the preview panel',
          'Click <strong>Add</strong> on each item to add it to the server',
          'The server description is used as mandatory context — AI generates domain-appropriate data',
        ]} />
        <Callout type="ok">
          AI understands the server description as the primary context. A "banking API" gets account numbers and balances; a "chat app" gets users and messages.
        </Callout>
      </WikiCard>

      <SubTitle>Load Samples</SubTitle>
      <Callout type="info">
        Every protocol has a <strong>Load Sample</strong> dropdown — choose a pre-built realistic scenario (Calculator, Weather, E-commerce, Chat) to get started in seconds.
        Loading a sample <strong>replaces</strong> existing config (no duplicates).
      </Callout>

      <SubTitle>Settings</SubTitle>
      <WikiTable
        headers={['Setting', 'Default', 'Description']}
        rows={[
          ['Port Range', '8000–9000', 'Servers auto-pick a free port within this range'],
          ['Mock Icon Glow', 'On', 'Pulsing animation on the Mock sidebar icon when a server is running'],
          ['Hot Reload', 'Always', 'Route changes apply instantly to running servers — no restart needed'],
        ]}
      />
    </div>
  );
}

// ─── AI Assistant ─────────────────────────────────────────────────────────────
export function AiAssistantSection() {
  return (
    <div className="dw-section" id="ai-assistant">
      <SectionTitle emoji="🤖">AI Assistant</SectionTitle>
      <Callout type="info" title="Two Ways to Use AI">
        <strong>1. Daakia AI Panel</strong> — full chat in a panel tab (click <Badge variant="ai">✦</Badge> in left rail).
        <br />
        <strong>2. @daakia in VS Code</strong> — lightweight AI in the Copilot chat sidebar.
      </Callout>

      <SubTitle>Live Demo — AI Chat</SubTitle>
      <div className="dw-live">
        <div className="dw-live-bar">
          <span className="dw-live-method" style={{ background: 'color-mix(in srgb, var(--dw-ai) 14%, transparent)', color: 'var(--dw-ai)' }}>✦ AI</span>
          <span className="dw-live-url">Daakia AI</span>
          <span className="dw-live-send" style={{ color: 'var(--dw-ai)', borderColor: 'color-mix(in srgb, var(--dw-ai) 35%, transparent)' }}>Clear</span>
        </div>
        <div className="dw-live-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ background: 'color-mix(in srgb, var(--dw-ai) 10%, transparent)', borderRadius: 6, padding: '6px 10px', maxWidth: '80%', fontSize: 11, border: '1px solid color-mix(in srgb, var(--dw-ai) 20%, transparent)' }}>
              GET all users from jsonplaceholder.typicode.com
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ fontSize: 16 }}>✦</span>
            <div style={{ fontSize: 11, lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--dw-fg)', display: 'block', marginBottom: 4 }}>REST API Request</strong>
              <span style={{ color: 'var(--dw-muted)' }}>
                {'GET https://jsonplaceholder.typicode.com/users'}
                <br />
                {'Headers: Accept: application/json'}
                <br />
                {'Returns array of 10 user objects with name, email, address'}
              </span>
            </div>
          </div>
        </div>
        <div className="dw-live-status">
          <span style={{ color: 'var(--dw-ai)', fontSize: 10 }}>GPT-4o  ·  gpt-4o-mini  ·  Claude Sonnet</span>
        </div>
      </div>

      <SubTitle>AI Agents — 8 Specialized Assistants</SubTitle>
      <WikiTable
        headers={['Agent', 'Triggered by']}
        rows={[
          ['REST API Agent', 'Describing an HTTP request in plain English'],
          ['Mock Server Agent', 'Asking to design a mock endpoint or API'],
          ['Test Script Agent', 'Asking to write test assertions or validations'],
          ['cURL Import Agent', 'Pasting a curl command directly in chat'],
          ['GraphQL Agent', 'Asking for GQL queries, mutations, or subscriptions'],
          ['SOAP Agent', 'Requesting a SOAP envelope or WS-Security setup'],
          ['Security Agent', 'Asking to scan or review requests for vulnerabilities'],
          ['Documentation Agent', 'Asking to document an endpoint or generate OpenAPI'],
        ]}
      />

      <SubTitle>@daakia VS Code Slash Commands</SubTitle>
      <CmdList items={[
        { name: '/request', desc: 'Build an API request from plain English — returns method, URL, headers, body' },
        { name: '/mock', desc: 'Design a mock endpoint — returns route, status, response body with realistic data' },
        { name: '/test', desc: 'Generate dk.test() assertions for a given endpoint response' },
        { name: '/curl', desc: 'Parse and explain a cURL command, with "Open in Daakia" button' },
        { name: '/explain', desc: 'Explain concepts: What is OAuth2? Difference between PUT and PATCH?' },
      ]} />

      <SubTitle>Inline AI Features (inside REST tabs)</SubTitle>
      <FeatureGrid items={[
        { emoji: '🔍', title: 'Ask AI Why', desc: 'Click "Ask AI why" next to any error status (404, 401, 0). AI explains the problem and suggests fixes inline.' },
        { emoji: '💬', title: 'Response Explainer', desc: 'Click "Explain" in the response toolbar — AI describes the JSON in plain English.' },
        { emoji: '🔄', title: 'Follow-up Requests', desc: 'Click "Follow-ups" — AI suggests 3–5 useful API calls based on the current response.' },
        { emoji: '✨', title: 'Header Suggestions', desc: 'Click "✨ Suggest headers" — AI recommends relevant headers for the current request.' },
        { emoji: '📐', title: 'Schema Generator', desc: 'Click ⋮ → Generate Data Schema — TypeScript, Zod, JSON Schema, Pydantic, Go.' },
      ]} />

      <SubTitle>Supported AI Providers</SubTitle>
      <WikiTable
        headers={['Provider', 'Notes']}
        rows={[
          ['GitHub Copilot', 'No API key needed — uses VS Code LM API. Always shown first.'],
          ['OpenAI', 'Add API key in Settings → LLM Providers. Models: gpt-4o, gpt-4o-mini, o3-mini.'],
          ['Anthropic', 'Add API key. Models: Claude Sonnet, Claude Haiku.'],
          ['Google Gemini', 'Add API key. Models: Gemini 2.0 Flash, Gemini 1.5 Pro.'],
          ['Custom / Local', 'OpenAI-compatible endpoint — use with Ollama, LM Studio, vLLM.'],
        ]}
      />

      <SubTitle>Prompt Library — Customize AI Behavior</SubTitle>
      <Steps steps={[
        'Open Settings → <strong>Prompt Library</strong>',
        'Click <strong>Edit</strong> on any agent card (e.g. General Assistant)',
        'Modify the system prompt — e.g. add "Always respond in bullet points."',
        'Click <strong>Save</strong> — card shows <strong>CUSTOM</strong> badge',
        'Your custom prompt is used for all future AI interactions with that agent',
        'Click the <strong>trash icon</strong> to reset back to the built-in default',
      ]} />

      <SubTitle>AI Audit Trail</SubTitle>
      <Callout type="info">
        Settings → AI Audit shows a log of every AI request — provider, model, tokens used, and timestamp.
        Use this to monitor usage and track costs.
      </Callout>
    </div>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────
export function SettingsSection() {
  return (
    <div className="dw-section" id="settings">
      <SectionTitle emoji="⚙️">Settings & Configuration</SectionTitle>
      <WikiTable
        headers={['Section', 'What you configure']}
        rows={[
          ['General → General', 'Follow redirects, SSL verify, request timeout, max history, max AI chat messages'],
          ['General → Encoding', 'Query parameter URL encoding: Enable / Disable / Auto'],
          ['General → Proxy', 'No proxy, System proxy, or Manual proxy (host, port, auth, bypass list)'],
          ['Theme', 'Light / Dark — follows VS Code theme by default'],
          ['Mock Server', 'Port range (default 8000–9000), Mock icon glow animation toggle'],
          ['LLM Provider', 'Add API keys for OpenAI, Anthropic, Gemini, custom endpoints'],
          ['AI Features', '8 feature toggles — disable Error Diagnosis, Header Suggestions, etc.'],
          ['Prompt Library', 'Customize system prompts for all 8 AI agents'],
          ['AI Audit', 'View log of all AI API calls with tokens and cost'],
          ['Developer Tools', 'Advanced devtools (debug, network inspection)'],
        ]}
      />

      <SubTitle>Storage</SubTitle>
      <WikiCard title="Where your data lives" icon="💾">
        <WikiTable
          headers={['Data', 'Storage']}
          rows={[
            ['Collections, Requests, History', 'SQLite database — survives VS Code restarts'],
            ['Environments, Variables', 'SQLite database'],
            ['Mock Server configs', <Code>~/.salilvnair/daakia-vsce/mock-servers.json</Code>],
            ['API Keys (OpenAI, etc.)', 'OS Keychain — macOS Keychain / Windows Credential Store'],
            ['AI Chat History', 'SQLite database (trimmed at max messages limit)'],
            ['Settings, Prefs', 'SQLite database + VS Code workspace settings'],
          ]}
        />
      </WikiCard>

      <SubTitle>SQLite Status</SubTitle>
      <Callout type="info">
        If you see a red "SQLite unavailable" banner at the bottom left of Daakia, click <strong>Rebuild</strong>.
        This happens if native SQLite binaries weren't built for your Node.js version — Rebuild compiles them.
      </Callout>

      <Divider />

      <SubTitle>Tips & Best Practices</SubTitle>
      <FeatureGrid items={[
        { emoji: '🎯', title: 'Use Environments', desc: 'Keep baseUrl in an environment. Switch Dev/Staging/Prod instantly without editing URLs.' },
        { emoji: '🔐', title: 'Secret Variables', desc: 'Mark API keys as Secret type — they display as •••••• and are never logged.' },
        { emoji: '📜', title: 'Chain Requests', desc: 'Post-response script: extract a token → set in environment → next request uses it.' },
        { emoji: '🎭', title: 'Mock Early', desc: 'Create mock servers before the backend exists — frontend team keeps moving.' },
        { emoji: '✅', title: 'Test Everything', desc: 'Add post-response test scripts to catch regressions across API changes.' },
        { emoji: '🤖', title: 'AI Shortcuts', desc: 'Use AI for tedious tasks — paste curl → get Daakia request. Send response → get schema.' },
        { emoji: '📁', title: 'Import Existing', desc: 'Import from Postman or Bruno to migrate your existing API collection in seconds.' },
        { emoji: '🔗', title: 'GraphQL Schemas', desc: 'Run Connect once — schema loads. Use Documentation panel to explore type definitions.' },
      ]} />
    </div>
  );
}
