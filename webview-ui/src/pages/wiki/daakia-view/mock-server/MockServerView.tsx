import { WikiScrollPage, CaptureCard } from '../capture/CaptureScrollView';
import { WikiHero, SubTitle, Steps, Callout, WikiTable, WikiCard, Badge, chips } from '../shared/WikiShared';
import { MOCK_SERVER_CAPTURES } from './captures';

export function MockServerView() {
  const byId = Object.fromEntries(MOCK_SERVER_CAPTURES.map(c => [c.id, c]));
  return (
    <WikiScrollPage hero={
      <WikiHero
        emoji="🎭"
        title="Mock Server"
        subtitle="Spin up real local HTTP/WS/gRPC/MQTT servers with routes, catalogs, state machines, and fault injection — no internet needed."
        chips={chips(['Routes', 'Catalog', 'State Machine', 'Fault Injection'])}
      />
    }>
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
        <SubTitle>Create & Run a REST Mock Server</SubTitle>
        <Steps steps={[
          'Click the <strong>Mock Server</strong> icon in the left rail',
          'Click <strong>+ Create Mock Server</strong> → name it, select protocol <strong>REST</strong>',
          'Click <strong>+ Add Route</strong> → set method (<strong>GET</strong>), path (<strong>/api/users</strong>)',
          'Set the response body JSON and status code (<strong>200</strong>)',
          'Click <strong>▶ Start</strong> → server starts on a random port (e.g. 8043)',
          'Test it: <strong>GET http://localhost:8043/api/users</strong>',
        ]} />
      </div>

      {byId['mockserver-rest-routes'] && <CaptureCard entry={byId['mockserver-rest-routes']} />}

      <div>
        <Callout type="info" title="Activity Log">
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
      </div>

      {byId['mockserver-rest-catalog'] && <CaptureCard entry={byId['mockserver-rest-catalog']} />}

      <div>
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
        <Callout type="info" title="Load Samples">
          Every protocol has a <strong>Load Sample</strong> dropdown — choose a pre-built realistic scenario (Calculator, Weather, E-commerce, Chat) to get started in seconds.
          Loading a sample <strong>replaces</strong> existing config (no duplicates).
        </Callout>
      </div>

      {byId['mockserver-grpc-routes'] && <CaptureCard entry={byId['mockserver-grpc-routes']} />}

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
