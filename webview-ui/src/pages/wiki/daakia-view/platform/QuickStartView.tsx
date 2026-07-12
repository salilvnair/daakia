import { WikiScrollPage } from '../capture/CaptureScrollView';
import { WikiHero, SubTitle, Callout, Steps, LiveRestScreen, ShortcutGrid, FeatureGrid, chips } from '../shared/WikiShared';

export function QuickStartView() {
  return (
    <WikiScrollPage hero={
      <WikiHero
        emoji="🚀"
        title="Welcome to Daakia"
        subtitle="A full API client for REST, GraphQL, WebSocket, gRPC, and SOAP — plus a built-in mock server and AI assistant, all inside VS Code."
        chips={chips(['REST', 'GraphQL', 'WebSocket', 'gRPC', 'SOAP', 'Mock Server', 'AI'])}
      />
    }>
      <div>
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
          { label: 'Send request', keys: ['Ctrl+Enter'] },
          { label: 'New tab', keys: ['Ctrl+T'] },
          { label: 'Close tab', keys: ['Ctrl+W'] },
          { label: 'Save request', keys: ['Ctrl+S'] },
          { label: 'Save As', keys: ['Ctrl+Shift+S'] },
          { label: 'Format body JSON', keys: ['Alt+Shift+F'] },
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
    </WikiScrollPage>
  );
}
