import { WikiScrollPage, CaptureCard } from '../capture/CaptureScrollView';
import { WikiHero, SectionTitle, SubTitle, Steps, Callout, WikiTable, WikiCard, Code, ProtocolChip, ProtocolActivateNote, Divider, chips, TocBar, type TocItem } from '../shared/WikiShared';
import { ServerIcon } from '../../../../icons';
import { MOCK_SERVER_CAPTURES } from './captures';

const PROTOCOL_COLORS: Record<string, string> = {
  REST: 'var(--dw-rest)', GraphQL: 'var(--dw-graphql)', WebSocket: 'var(--dw-ws)',
  SSE: '#f59e0b', 'Socket.IO': '#22c55e', MQTT: '#06b6d4',
  gRPC: 'var(--dw-grpc)', SOAP: 'var(--dw-soap)',
};

const TOC_ITEMS: TocItem[] = [
  { id: 'mock-routes', emoji: '🛣️', label: 'Routes' },
  { id: 'mock-state-machine', emoji: '🔀', label: 'State Machine' },
  { id: 'mock-chaos', emoji: '⚡', label: 'Chaos' },
  { id: 'mock-traffic', emoji: '📡', label: 'Traffic' },
  { id: 'mock-protocols', emoji: '🧩', label: 'Per-Protocol Config' },
  { id: 'mock-importexport', emoji: '📦', label: 'Import/Export' },
  { id: 'mock-catalog', emoji: '📚', label: 'Catalog & AI' },
];

export function MockServerView() {
  const byId = Object.fromEntries(MOCK_SERVER_CAPTURES.map(c => [c.id, c]));
  const cap = (id: string) => byId[id] && <CaptureCard entry={byId[id]} />;
  return (
    <WikiScrollPage
      hero={
        <WikiHero
          emoji="🎭"
          title="Mock Server"
          subtitle="Spin up real local HTTP/WS/gRPC/MQTT servers with routes, catalogs, state machines, and fault injection — no internet needed."
          chips={chips(['Routes', 'Catalog', 'State Machine', 'Fault Injection'])}
        />
      }
      toc={<TocBar items={TOC_ITEMS} />}
    >
      <div>
        <ProtocolActivateNote icon={<ServerIcon size={18} strokeWidth={1.8} style={{ color: 'var(--color-mock-server)' }} />} color="var(--color-mock-server)" name="Mock Server" />
      </div>

      <Divider />

      <div>
        <Callout type="tip" title="What is Mock Server?">
          Runs real local HTTP/WS/gRPC/MQTT servers on your machine — no internet needed. Perfect for frontend dev, testing, and demos.
        </Callout>
        <div className="dw-protocol-row">
          {[
            { label: 'REST', color: 'var(--dw-rest)' }, { label: 'GraphQL', color: 'var(--dw-graphql)' },
            { label: 'WebSocket', color: 'var(--dw-ws)' }, { label: 'SSE', color: '#f59e0b' },
            { label: 'Socket.IO', color: '#22c55e' }, { label: 'MQTT', color: '#06b6d4' },
            { label: 'gRPC', color: 'var(--dw-grpc)' }, { label: 'SOAP', color: 'var(--dw-soap)' },
          ].map(p => (
            <span key={p.label} className="dw-protocol-chip" style={{ color: p.color, background: `color-mix(in srgb, ${p.color} 12%, transparent)`, borderColor: `color-mix(in srgb, ${p.color} 30%, transparent)` }}>
              {p.label}
            </span>
          ))}
        </div>
        <SectionTitle id="mock-routes" emoji="🛣️">Create & Run a REST Mock Server</SectionTitle>
        <Steps steps={[
          'Click the <strong>Mock Server</strong> icon in the left rail',
          'Click <strong>+ Create Mock Server</strong> → name it, select protocol <strong>REST</strong>',
          'Click <strong>+ Add Route</strong> → set method (<strong>GET</strong>), path (<strong>/api/users</strong>)',
          'Set the response body JSON and status code (<strong>200</strong>)',
          'Click <strong>▶ Start</strong> → server starts on a random port (e.g. 8043)',
          'Test it: <strong>GET http://localhost:8043/api/users</strong>',
        ]} />
        <SubTitle>Route Fields</SubTitle>
        <WikiTable
          headers={['Field', 'Options']}
          rows={[
            ['Body Source', <>Inline (write JSON/XML/text directly) or File (pick a real file — Content-Type/Content-Disposition auto-derive from its extension unless you override them in Response Headers)</>],
            ['Response Body format', <>A 3-value pill: <Code>json</Code> / <Code>xml</Code> / <Code>plain</Code> — picking one also writes the matching Content-Type into the route's headers</>],
            ['Delay', 'Milliseconds before the response is sent, for simulating latency'],
            ['Enabled', 'Toggle a route off without deleting it'],
          ]}
        />
      </div>

      {byId['mockserver-rest-routes'] && <CaptureCard entry={byId['mockserver-rest-routes']} />}

      <div>
        <SubTitle>Route Editor — 3 Sub-Tabs</SubTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          Every route (any protocol) opens into its own editor with three sub-tabs, plus an optional Sequence feature
          for the Response tab:
        </p>
        <WikiTable
          headers={['Sub-tab', 'What it configures']}
          rows={[
            ['Response', 'Body Source, format, status code, headers, delay — the fields listed above'],
            ['Matching', 'Extra conditions beyond method+path — query params, headers, body content — so several routes can share a method+path and respond differently'],
            ['Advanced', 'Per-route Chaos/Fault Injection override and a per-route rate limit, independent of the server-wide Chaos settings'],
          ]}
        />
      </div>
      {cap('mockserver-route-response')}
      {cap('mockserver-route-matching')}
      {cap('mockserver-route-advanced')}

      <div>
        <SubTitle>Sequence — Multi-Response Routes</SubTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          Define an ordered list of different responses for the same route — each hit advances to the next one
          (round-robin or once-through), for simulating a value that changes across repeated calls (e.g. a job status
          going pending → processing → done).
        </p>
      </div>
      {cap('mockserver-route-sequence')}

      <div>
        <Callout type="info" title="Activity Log">
          The Activity Log at the bottom of the Mock panel shows every request in real-time:
          method, path, status, timestamp. Click any entry to see request headers, body, response headers, and response body.
        </Callout>
        <SubTitle>Protocol-Specific Features</SubTitle>
        <WikiTable
          headers={['Protocol', 'Key Config']}
          rows={[
            [<ProtocolChip label="REST" color={PROTOCOL_COLORS.REST} />, 'Routes: method + path + response body + headers + delay. Path params (:id). Hot-reload.'],
            [<ProtocolChip label="GraphQL" color={PROTOCOL_COLORS.GraphQL} />, 'Custom SDL schema + mock operations per query/mutation. Introspection included.'],
            [<ProtocolChip label="WebSocket" color={PROTOCOL_COLORS.WebSocket} />, 'On Connect / On Message (regex pattern) / On Disconnect handlers. Broadcast toggle.'],
            [<ProtocolChip label="SSE" color={PROTOCOL_COLORS.SSE} />, 'Event streams with name, data, interval, and delay. Multiple event types.'],
            [<ProtocolChip label="Socket.IO" color={PROTOCOL_COLORS['Socket.IO']} />, 'Event-based handlers — emit and respond with namespaces.'],
            [<ProtocolChip label="MQTT" color={PROTOCOL_COLORS.MQTT} />, 'Topic subscriptions with publish delay and interval.'],
            [<ProtocolChip label="gRPC" color={PROTOCOL_COLORS.gRPC} />, 'Method-level responses with streaming support and delay.'],
            [<ProtocolChip label="SOAP" color={PROTOCOL_COLORS.SOAP} />, 'Service → Operation hierarchy. Static, fault, or script response types.'],
          ]}
        />
        <Callout type="tip">
          All 10 protocol tabs shown above (plus AI and MCP) are real, independently-running backends — this isn't a
          REST-only mock server with cosmetic protocol labels.
        </Callout>
      </div>

      <div>
        <SectionTitle id="mock-state-machine" emoji="🔀">State Machine — Gate a Route Behind Session State</SectionTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          A route can require the session to be in a specific state before it'll match — useful for simulating
          multi-step flows (login → checkout → confirm) where hitting a step out of order should realistically fail.
          It's a real two-step selector, not a manual "required state" field:
        </p>
        <WikiTable
          headers={['Step', 'What it does']}
          rows={[
            ['1 — State Machine', 'Which connected workflow gates this route. Skipped automatically if the server only has one workflow connected.'],
            ['2 — Trigger Event', <>Which event this route requires — populated from the real event labels on the chosen workflow's transitions. With only one workflow, a <Code>None — always matches, no state gating</Code> option is also offered.</>],
          ]}
        />
        <Callout type="info">
          Enforcement is real: a gated route only matches once the session can actually fire that event from its
          current state. Hit it too early and you get a <strong>409</strong>, not a 404 — with a message naming the exact
          event(s) needed and the shortest real path to get there (computed via BFS over the workflow graph), not a
          generic "not found."
        </Callout>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          A successful match actually advances the session's state — so the next gated route in the sequence becomes
          reachable.
        </p>
      </div>
      {cap('mockserver-statemachine')}

      <div>
        <SubTitle>The Visual Canvas</SubTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          The workflow itself is designed on a real node/edge canvas — states as nodes, events as edges —{' '}
          <strong>Connect to Mock Server</strong> wires the finished workflow into the server so routes can reference
          its states and events.
        </p>
      </div>
      {cap('mockserver-flow')}

      <Divider />

      {byId['mockserver-rest-catalog'] && <CaptureCard entry={byId['mockserver-rest-catalog']} />}

      <div>
        <SectionTitle id="mock-chaos" emoji="⚡">Chaos — Fault Injection</SectionTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          Two levels: a global dial for the whole server, and a per-route override. Both use a probability slider
          (0–100%, 5% steps) plus quick Low/Medium/High presets. Fault types are protocol-aware:
        </p>
        <WikiTable
          headers={['Protocol group', 'Fault types']}
          rows={[
            ['HTTP-based (REST, GraphQL, gRPC, SOAP)', 'Random 5xx, Empty Response, Malformed JSON, Timeout, Connection Reset, Chunked Dribble'],
            ['Realtime (WebSocket, SSE, Socket.IO, MQTT)', 'Random Disconnect, Message Delay, Corrupt Payload, Missed Heartbeat, Timeout, Connection Reset'],
          ]}
        />
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          There's also a Global Rate Limit sub-section (requests per second/minute/hour window), and per-route Fault
          Injection additionally supports its own rate limit that returns a real <Code>429</Code> with a{' '}
          <Code>Retry-After</Code> header once a burst allowance is exceeded.
        </p>
      </div>
      {cap('mockserver-chaos')}

      <Divider />

      <div>
        <SectionTitle id="mock-traffic" emoji="📡">Traffic — Record, Proxy & Inspect</SectionTitle>
        <WikiTable
          headers={['Sub-tab', 'What it does']}
          rows={[
            ['Record & Proxy', 'Toggle recording, set a real Proxy Target URL — live requests are forwarded to that real API and every interaction is captured'],
            ['Recorded (N)', 'Browse captured requests, select some, and either "Convert to Routes" directly or run "✦ AI Enrich" to have AI fill in realistic variations first'],
            ['Protocol Traffic (N)', 'Non-REST protocols only — a live activity feed of realtime/gRPC/SOAP traffic, separate from the REST recorder'],
          ]}
        />
      </div>
      {cap('mockserver-traffic')}

      <Divider />

      <div>
        <SectionTitle id="mock-protocols" emoji="🧩">Per-Protocol Config</SectionTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          Every non-REST protocol tab has its own dedicated config screen — not a shared generic form:
        </p>
      </div>
      {cap('mockserver-graphql-schema')}
      {cap('mockserver-soap-services')}
      {cap('mockserver-ws-handlers')}
      {cap('mockserver-sio-messages')}
      {cap('mockserver-sse-events')}
      {cap('mockserver-mqtt-topics')}

      <Divider />

      <div>
        <SectionTitle id="mock-catalog" emoji="📚">Catalog & AI Generation</SectionTitle>
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
        <Callout type="info" title="Load Samples vs. Catalog">
          <strong>Load Sample</strong> is a quick dropdown of hand-built fixture sets (Calculator, Weather, E-commerce,
          Chat) — picking one <strong>replaces</strong> existing config, no duplicates, and can also install a matching
          pre-built State Machine workflow. The <strong>📚 Catalog</strong> tab is the same idea but
          organized as a searchable, tagged library of route bundles (e.g. "Users CRUD", "Auth Flow", "Error
          Scenarios") you can browse and add from, rather than one flat dropdown.
        </Callout>
      </div>

      {byId['mockserver-grpc-routes'] && <CaptureCard entry={byId['mockserver-grpc-routes']} />}

      <div>
        <SectionTitle id="mock-importexport" emoji="📦">Import & Export</SectionTitle>
        <WikiTable
          headers={['Protocol', 'Import formats']}
          rows={[
            [<ProtocolChip label="REST" color={PROTOCOL_COLORS.REST} />, 'OpenAPI 3.x (YAML/JSON), Postman Collection v2.0/2.1, WireMock stub-mappings JSON'],
            [<ProtocolChip label="GraphQL" color={PROTOCOL_COLORS.GraphQL} />, 'GraphQL SDL'],
            [<ProtocolChip label="gRPC" color={PROTOCOL_COLORS.gRPC} />, '.proto files'],
            [<ProtocolChip label="SOAP" color={PROTOCOL_COLORS.SOAP} />, 'WSDL'],
            [<ProtocolChip label="WebSocket" color={PROTOCOL_COLORS.WebSocket} />, 'JSON event-definition array'],
            [<ProtocolChip label="SSE" color={PROTOCOL_COLORS.SSE} />, 'JSON event-definition array'],
            [<ProtocolChip label="Socket.IO" color={PROTOCOL_COLORS['Socket.IO']} />, 'JSON event-definition array'],
            [<ProtocolChip label="MQTT" color={PROTOCOL_COLORS.MQTT} />, 'JSON event-definition array'],
          ]}
        />
        <Callout type="info">
          There is no HAR import for mock routes — that's only supported for importing real request history into
          Collections, not for building mock routes.
        </Callout>
      </div>
      {cap('mockserver-import')}
      {cap('mockserver-export')}
      {cap('mockserver-wsdl')}

      <div>
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
    </WikiScrollPage>
  );
}
