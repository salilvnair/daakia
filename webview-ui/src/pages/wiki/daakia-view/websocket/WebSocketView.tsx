import { WikiScrollPage, CaptureCard } from '../capture/CaptureScrollView';
import { WikiHero, SectionTitle, SubTitle, FeatureGrid, Callout, WikiTable, Code, CodeBlock, Divider, ProtocolActivateNote, chips, TocBar, type TocItem } from '../shared/WikiShared';
import { ProtocolRealtimeBadge } from '../../../../icons';
import { WEBSOCKET_CAPTURES } from './captures';

const TOC_ITEMS: TocItem[] = [
  { id: 'rt-protocol', emoji: '📖', label: 'What is Realtime?' },
  { id: 'rt-websocket', emoji: '🔌', label: 'WebSocket' },
  { id: 'rt-sse', emoji: '📡', label: 'SSE' },
  { id: 'rt-socketio', emoji: '🔷', label: 'Socket.IO' },
  { id: 'rt-mqtt', emoji: '📶', label: 'MQTT' },
];

export function WebSocketView() {
  const byId = Object.fromEntries(WEBSOCKET_CAPTURES.map(c => [c.id, c]));
  const cap = (id: string) => byId[id] && <CaptureCard entry={byId[id]} />;
  return (
    <WikiScrollPage
      hero={
        <WikiHero
          emoji="🟢"
          title="Realtime — WebSocket, SSE, Socket.IO, MQTT"
          subtitle="One tab, four realtime protocols — switch sub-protocol from the pills at the top of the panel."
          chips={chips(['WebSocket', 'SSE', 'Socket.IO', 'MQTT'])}
        />
      }
      toc={<TocBar items={TOC_ITEMS} />}
    >
      <div>
        <ProtocolActivateNote
          icon={<ProtocolRealtimeBadge size={20} />}
          color="var(--color-protocol-websocket)"
          name="Realtime"
          suffix=", then pick a sub-protocol from the pills at the top of the panel."
        >
          <Callout type="tip">
            SSE and Socket.IO automatically carry over whatever headers already exist on the tab (Socket.IO also
            forwards Auth) — no extra setup needed for those two. WebSocket connects with its own Subprotocols field
            (Protocols tab), and MQTT with its own Username/Password fields — each protocol's connect params live
            where that protocol actually needs them, not in a shared Headers tab.
          </Callout>
        </ProtocolActivateNote>
      </div>

      <Divider />

      <div>
        <SectionTitle id="rt-protocol" emoji="📖">What is Realtime Messaging?</SectionTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          REST, GraphQL, gRPC unary calls, and SOAP all share the same shape: the client asks a question, the server
          answers, the connection (or at least the logical exchange) is over. That's fine for "give me the current
          state of X" but useless for "tell me the moment X changes" — polling an endpoint every second is wasteful
          and still has up-to-a-second latency. <strong>Realtime protocols</strong> solve this by keeping a
          connection open and letting either side push data across it whenever something happens, instead of only
          replying to a request. Daakia's Realtime tab covers four different ways to do that, each with real
          tradeoffs — not just four skins on the same idea:
        </p>
        <WikiTable
          headers={['Protocol', 'Direction', 'Transport', 'Best for']}
          rows={[
            ['WebSocket', 'Full-duplex — both sides send anytime', 'TCP, upgraded from one HTTP handshake', 'Chat, games, collaborative editing — anything needing low-latency two-way traffic'],
            ['SSE', 'Server → client only', 'Plain HTTP, kept open', 'Live feeds, notifications, progress updates — server pushes, client never talks back on the same connection'],
            ['Socket.IO', 'Full-duplex, with fallbacks', 'WebSocket when available, long-polling otherwise', 'Same use cases as WebSocket, but where you need automatic reconnection/fallback for flaky networks'],
            ['MQTT', 'Full-duplex, broker-mediated', 'TCP (often over WebSocket in browsers)', 'IoT, telemetry, many-to-many pub/sub where publishers and subscribers never talk to each other directly'],
          ]}
        />
        <Callout type="tip">
          The dividing line that matters most: WebSocket and Socket.IO are <strong>peer-to-peer</strong> (you're
          talking directly to one server instance), while MQTT is <strong>broker-mediated</strong> (you publish to a
          topic, the broker decides who receives it) — that's why MQTT has QoS levels and retained messages, and
          plain WebSocket doesn't.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="rt-websocket" emoji="🔌">WebSocket</SectionTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          Standardized as <strong>RFC 6455</strong>, WebSocket starts life as a normal HTTP request that asks to be{' '}
          <em>upgraded</em> — the server swaps the connection from HTTP semantics to a lightweight framed protocol,
          on the exact same TCP connection, without a second handshake:
        </p>
        <CodeBlock label="Opening handshake — client request" lang="http">
{`GET /socket HTTP/1.1
Host: echo.example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13`}
        </CodeBlock>
        <CodeBlock label="Server accepts — HTTP 101 Switching Protocols" lang="http">
{`HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=`}
        </CodeBlock>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          <Code>Sec-WebSocket-Accept</Code> is a deterministic hash of the client's <Code>Sec-WebSocket-Key</Code> —
          the server proving it actually understood the WebSocket upgrade request, not just echoing a random value.
          After this exchange, every message travels as a small binary <strong>frame</strong> (a FIN bit, an opcode
          saying text/binary/ping/pong/close, an optional mask, and the payload) — Daakia's message composer just
          sends the payload; the framing itself is handled underneath, invisibly.
        </p>
        <FeatureGrid items={[
          { emoji: '🔌', title: 'Connect/Disconnect', desc: 'URL bar connects/disconnects. Dot indicator: grey=off, green=on.' },
          { emoji: '📨', title: 'Send Messages', desc: 'JSON or Raw mode — Monaco editor at bottom. Clear input toggle.' },
          { emoji: '📜', title: 'Message Log', desc: 'Collapsible entries — green dot=sent, purple dot=received. Auto-scroll.' },
          { emoji: '🔧', title: 'Protocols Tab', desc: 'Set WebSocket subprotocols (e.g. graphql-ws) — enable/disable each.' },
        ]} />
      </div>
      {cap('ws-communication')}

      <div>
        <SubTitle>Log</SubTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          Every log toolbar button — Clear log, Scroll to top, Scroll to bottom, Autoscroll — is the same <Code>xs</Code>{' '}
          icon-button size as REST's response toolbar, not a bigger custom size.
        </p>
      </div>
      {cap('ws-log')}

      <div>
        <SubTitle>Protocols</SubTitle>
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
      {cap('ws-protocols')}

      <div>
        <SubTitle>Templates</SubTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          Save a message payload once, re-send it with one click — handy for repeatedly firing the same ping/auth/
          subscribe frame while testing.
        </p>
      </div>
      {cap('ws-templates')}

      <div>
        <SubTitle>Auto-Reconnect — WebSocket Only</SubTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          The "⟳ Auto" toggle is real and client-side only — the other three protocols do not have it:
        </p>
        <WikiTable
          headers={['Setting', 'Behavior']}
          rows={[
            ['Off by default', 'Must be explicitly toggled on per tab'],
            ['Backoff formula', <>Delay = <Code>min(backoff × 2^attempt, 30000ms)</Code>, backoff defaults to 1000ms</>],
            ['Reset', 'Attempt counter resets to 0 the moment a reconnect succeeds'],
          ]}
        />
      </div>

      <Divider />

      {byId['realtime-sse'] && <CaptureCard entry={byId['realtime-sse']} />}

      <div>
        <SectionTitle id="rt-sse" emoji="📡">Server-Sent Events (SSE)</SectionTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          SSE is deliberately the simplest of the four — there's no upgrade handshake or binary framing at all. It's
          a plain HTTP response the server just never finishes sending, with <Code>Content-Type: text/event-stream</Code>{' '}
          and a specific line-based text format the browser's native <Code>EventSource</Code> API (and Daakia's own
          SSE panel) knows how to parse incrementally as bytes arrive:
        </p>
        <CodeBlock label="Response headers — the connection stays open" lang="http">
{`HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive`}
        </CodeBlock>
        <CodeBlock label="The event stream itself — each event separated by a blank line" lang="text">
{`event: order.created
data: {"orderId":"ord_42","total":89.5}
id: 1001

event: order.created
data: {"orderId":"ord_43","total":42.0}
id: 1002

: this is a comment/keepalive, ignored by the client`}
        </CodeBlock>
        <WikiTable
          headers={['Field', 'Default', 'Notes']}
          rows={[
            ['Event Type', <Code>data</Code>, 'The SSE event name to filter/listen for — matches the event: line above'],
          ]}
        />
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          Because it's just one directional HTTP response, SSE is inherently <strong>one-way</strong> — the client
          can never send a message back on the same connection (it would need a separate normal HTTP request for
          that). No auto-reconnect logic exists for SSE in Daakia (unlike browsers' native EventSource, which
          reconnects on its own using the optional <Code>retry:</Code> field) — a dropped connection stays dropped
          until you reconnect manually.
        </p>
      </div>

      <div>
        <SectionTitle id="rt-socketio" emoji="🔷">Socket.IO</SectionTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          Socket.IO is <strong>not</strong> the WebSocket protocol — it's a separate library and wire protocol built
          on top of its own transport layer, <strong>Engine.IO</strong>, which starts every connection as HTTP
          long-polling and then transparently upgrades to a real WebSocket if the network allows it, falling back
          gracefully if it doesn't. On top of that, Socket.IO adds its own packet format (connect/disconnect/event/
          ack packet types), <strong>namespaces</strong> (logically separate channels sharing one connection, default{' '}
          <Code>/</Code>), and <strong>rooms</strong> (server-side groupings within a namespace for targeted
          broadcasts) — none of which exist in plain WebSocket.
        </p>
        <CodeBlock label="What a client actually emits (conceptually — Daakia's Communication tab sends this for you)" lang="javascript">
{`socket.emit('order.subscribe', { orderId: 'ord_42' });

socket.on('order.updated', (payload) => {
  console.log(payload); // { orderId: 'ord_42', status: 'shipped' }
});`}
        </CodeBlock>
        <WikiTable
          headers={['Field', 'Default', 'Notes']}
          rows={[
            ['Namespace / Path', <Code>/socket.io</Code>, 'Standard Socket.IO namespace'],
            ['Event / Topic Name', '(none)', 'The event name to emit/listen on'],
            ['Event Data', '(none)', 'Payload sent with the event'],
          ]}
        />
      </div>
      {cap('sio-communication')}
      {cap('sio-log')}

      <div>
        <SubTitle>Authorization</SubTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          The only realtime panel with a real <strong>Authorization</strong> sub-tab — same auth editor as REST, sent
          as Socket.IO connection auth on handshake. Daakia's own reconnection is disabled on the Socket.IO client
          config, so — like SSE — a dropped connection needs a manual reconnect.
        </p>
      </div>
      {cap('sio-authorization')}

      <Divider />

      {byId['realtime-mqtt'] && <CaptureCard entry={byId['realtime-mqtt']} />}

      <div>
        <SectionTitle id="rt-mqtt" emoji="📶">MQTT</SectionTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          MQTT (Message Queuing Telemetry Transport) is a lightweight <strong>publish/subscribe</strong> protocol
          designed for constrained devices and unreliable networks — originally built for oil-pipeline telemetry,
          now the de-facto standard for IoT. The defining difference from WebSocket/Socket.IO: publishers and
          subscribers <strong>never talk to each other directly</strong>. Every client connects to a{' '}
          <strong>broker</strong>; publishers send messages to a named <strong>topic</strong>, and the broker fans
          each message out to every client currently subscribed to that topic (or a matching wildcard) — the
          publisher has no idea who, or how many clients, are listening.
        </p>
        <CodeBlock label="Conceptual publish/subscribe exchange over a topic" lang="text">
{`Client A  --SUBSCRIBE "sensors/kitchen/temperature", QoS 1-->  Broker
Client B  --PUBLISH   "sensors/kitchen/temperature", "22.5"-->  Broker
Broker    --forwards "22.5" to every subscriber of that topic--> Client A`}
        </CodeBlock>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          The most detailed of the four in Daakia's UI — a real broker connection form plus a Last Will and a
          Publish area, reflecting how much more configurable a real MQTT connection is than a WebSocket one:
        </p>
        <WikiTable
          headers={['Field', 'Default']}
          rows={[
            ['Client ID', <Code>daakia_&#123;timestamp&#125;</Code>],
            ['Username / Password', '(empty)'],
            ['Keep Alive', '60 seconds'],
            ['Clean Session', 'On'],
            ['Last Will — Topic / Message / QoS / Retain', '(empty)'],
          ]}
        />
        <SubTitle>QoS Levels (Publish, Subscribe, and Last Will)</SubTitle>
        <WikiTable
          headers={['QoS', 'Guarantee']}
          rows={[
            ['0', 'At most once — fire and forget, no acknowledgment'],
            ['1', 'At least once — acknowledged, may be delivered more than once'],
            ['2', 'Exactly once — acknowledged with a 4-step handshake, no duplicates'],
          ]}
        />
      </div>

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
