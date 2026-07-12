import { WikiScrollPage, CaptureCard } from '../capture/CaptureScrollView';
import { WikiHero, SubTitle, FeatureGrid, Callout, WikiTable, Code, Badge, chips } from '../shared/WikiShared';
import { WEBSOCKET_CAPTURES } from './captures';

export function WebSocketView() {
  const byId = Object.fromEntries(WEBSOCKET_CAPTURES.map(c => [c.id, c]));
  return (
    <WikiScrollPage hero={
      <WikiHero
        emoji="🟢"
        title="Realtime — WebSocket, SSE, Socket.IO, MQTT"
        subtitle="One tab, four realtime protocols — switch sub-protocol from the pills at the top of the panel."
        chips={chips(['WebSocket', 'SSE', 'Socket.IO', 'MQTT'])}
      />
    }>
      <div>
        <Callout type="info" title="Activate">
          Click the <Badge variant="ws">WS</Badge> icon in the left protocol rail, then pick a sub-protocol from the pills at the top of the panel.
        </Callout>
      </div>

      {byId['realtime-websocket'] && <CaptureCard entry={byId['realtime-websocket']} />}

      <div>
        <SubTitle>WebSocket Features</SubTitle>
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
      </div>

      {byId['realtime-sse'] && <CaptureCard entry={byId['realtime-sse']} />}
      {byId['realtime-socketio'] && <CaptureCard entry={byId['realtime-socketio']} />}
      {byId['realtime-mqtt'] && <CaptureCard entry={byId['realtime-mqtt']} />}

      <div>
        <Callout type="tip">
          Environment variables resolve in both the connection <strong>URL</strong> and <strong>message body</strong> for every sub-protocol.
          <Code>{'{{ws_host}}'}</Code> in URL → connects to the resolved host.
          <Code>{'{"userId": "{{user_id}}"}'}</Code> in message → sends resolved value.
        </Callout>
      </div>
    </WikiScrollPage>
  );
}
