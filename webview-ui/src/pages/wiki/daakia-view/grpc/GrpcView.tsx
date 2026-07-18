import { WikiScrollPage, CaptureCard } from '../capture/CaptureScrollView';
import { WikiHero, SectionTitle, SubTitle, Steps, FeatureGrid, Callout, WikiTable, WikiCard, Code, CodeBlock, Collapsible, Divider, ProtocolActivateNote, chips, TocBar, type TocItem } from '../shared/WikiShared';
import { ProtocolGrpcBadge } from '../../../../icons';
import { GRPC_CAPTURES } from './captures';

const TOC_ITEMS: TocItem[] = [
  { id: 'grpc-protocol', emoji: '📖', label: 'What is gRPC?' },
  { id: 'grpc-overview', emoji: '🟣', label: 'Overview' },
  { id: 'grpc-proto', emoji: '📜', label: 'Proto Import' },
  { id: 'grpc-calltypes', emoji: '🔄', label: 'Call Types' },
  { id: 'grpc-metadata', emoji: '🔑', label: 'Metadata & TLS' },
  { id: 'grpc-scripts', emoji: '📜', label: 'Scripts' },
  { id: 'grpc-response', emoji: '📥', label: 'Response' },
  { id: 'grpc-tips', emoji: '💡', label: 'Tips' },
];

export function GrpcView() {
  const byId = Object.fromEntries(GRPC_CAPTURES.map(c => [c.id, c]));
  const cap = (id: string) => byId[id] && <CaptureCard entry={byId[id]} />;
  return (
    <WikiScrollPage
      hero={
        <WikiHero
          emoji="🟣"
          title="gRPC Client"
          subtitle="Call unary and streaming RPCs — import a .proto file for auto-discovery, or use server reflection."
          chips={chips(['Unary', 'Streaming', 'Proto Import', 'Reflection'])}
        />
      }
      toc={<TocBar items={TOC_ITEMS} />}
    >
      <div>
        <ProtocolActivateNote icon={<ProtocolGrpcBadge size={20} />} color="var(--color-protocol-grpc)" name="gRPC" />
      </div>

      <Divider />

      <div>
        <SectionTitle id="grpc-protocol" emoji="📖">What is gRPC?</SectionTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          <strong>gRPC</strong> ("gRPC Remote Procedure Calls") is an open-source RPC framework originally built by
          Google, built on top of <strong>HTTP/2</strong> and <strong>Protocol Buffers</strong> (protobuf). Instead
          of a client constructing an HTTP request against a resource URL the way REST does, gRPC lets you call a
          method on a remote service as if it were a local function — <Code>UserService.GetUser(request)</Code> —
          and the framework handles serializing the call, sending it over the network, and deserializing the reply.
          Both the service's methods and the shape of every message are defined up front in a{' '}
          <Code>.proto</Code> file, which is why gRPC needs a schema (imported or reflected) before you can even
          build a call — there's no equivalent of REST's "just type a URL and go".
        </p>
        <SubTitle>Why HTTP/2, specifically</SubTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          gRPC deliberately requires HTTP/2 rather than HTTP/1.1, because it depends on three HTTP/2 features REST
          over HTTP/1.1 doesn't have:
        </p>
        <WikiTable
          headers={['HTTP/2 feature', 'What gRPC uses it for']}
          rows={[
            ['Multiplexing', 'Many concurrent RPCs share one TCP connection without blocking each other (no HTTP/1.1 head-of-line blocking)'],
            ['Bidirectional streaming', 'Client and server can each send a sequence of messages on the same call, independently — the basis for all 3 streaming call types below'],
            ['Binary framing + HPACK header compression', 'Lower overhead per call than repeated plain-text HTTP/1.1 headers, and safer/faster to parse than text'],
          ]}
        />
        <SubTitle>Protocol Buffers — the wire format</SubTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          A <Code>.proto</Code> file defines messages and services in a compact IDL (interface definition language).
          The protobuf compiler turns that into real client/server code for whatever language you're using — the{' '}
          <strong>Proto Import</strong> section below is Daakia's version of that step, done for you automatically:
        </p>
        <CodeBlock label="user_service.proto — the service contract" lang="protobuf">
{`syntax = "proto3";
package users.v1;

service UserService {
  rpc GetUser (GetUserRequest) returns (User);
  rpc ListUsers (ListUsersRequest) returns (stream User); // server streaming
}

message GetUserRequest {
  string id = 1;
}

message User {
  string id = 1;
  string name = 2;
  string email = 3;
}`}
        </CodeBlock>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          On the wire, protobuf messages are <strong>binary</strong>, not JSON — every field is encoded as a tag
          number (the <Code>= 1</Code>, <Code>= 2</Code> you see above) plus a length-prefixed value, which is why
          protobuf payloads are smaller and faster to parse than the equivalent JSON, but also why they're
          unreadable without the schema. That's the tradeoff gRPC makes versus REST/GraphQL's human-readable JSON:
          more efficient over the wire, but you can't just "read" a raw gRPC payload the way you can inspect REST's
          Raw response tab — Daakia decodes it back into JSON for you using the imported <Code>.proto</Code>{' '}
          definitions before showing it in the Body tab.
        </p>
        <Callout type="tip">
          gRPC also defines its own status model — <Code>grpc-status</Code> and <Code>grpc-message</Code> trailers
          sent <em>after</em> the message body, not an HTTP status code — which is exactly what the Response panel's{' '}
          <strong>Metadata</strong> tab surfaces.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="grpc-overview" emoji="🟣">Overview</SectionTitle>
        <FeatureGrid items={[
          { emoji: '📜', title: 'Proto Import', desc: 'Load .proto files to discover services and methods automatically.' },
          { emoji: '🔄', title: 'Streaming', desc: 'Unary, server streaming, client streaming, and bidirectional streaming.' },
          { emoji: '🔑', title: 'TLS + Metadata', desc: 'One-toggle TLS (no cert fields) plus a key/value metadata editor for auth.' },
          { emoji: '📁', title: 'Collections', desc: 'Save gRPC calls to collections, inherit auth.' },
          { emoji: '🎭', title: 'Mock Server', desc: 'gRPC mock server with configurable method responses and delays.' },
        ]} />
        <SubTitle>Request Config Tabs</SubTitle>
        <WikiTable
          headers={['Tab', 'What it configures']}
          rows={[
            ['Message', 'The request body JSON, sent to the selected RPC method'],
            ['Metadata', 'Key/value header-equivalent — same table component as REST Headers'],
            ['Service Definition', 'Import a .proto file or run Server Reflection to discover services/methods'],
            ['Auth', 'Same AuthEditor as REST — Bearer, Basic, API Key, OAuth 2.0, Digest'],
            ['Scripts', 'Pre-request / Post-response dk.* runtime, same as every other protocol'],
          ]}
        />
        <Steps steps={[
          'Click <strong>gRPC</strong> icon in the left protocol rail',
          'Import a .proto file, or use Server Reflection — Daakia discovers all services and methods',
          'Select a service and method from the dropdowns — the call type badge (Unary/Server Stream/Client Stream/Bidi Stream) is inferred automatically from the proto\'s stream flags',
          'Write the request JSON body yourself in the Message tab',
          'Click <strong>Invoke</strong> to execute',
        ]} />
        <Callout type="warn">
          The Message body is <strong>not</strong> auto-generated from the proto schema — selecting a method leaves the
          editor as whatever was already there (empty <Code>{'{ }'}</Code> by default). Build the JSON body by hand from
          the method's request message fields.
        </Callout>
      </div>

      {byId['grpc-message'] && <CaptureCard entry={byId['grpc-message']} />}

      <div>
        <SectionTitle id="grpc-proto" emoji="📜">Proto Import — Exactly Two Ways</SectionTitle>
        <WikiTable
          headers={['Method', 'How']}
          rows={[
            ['Upload .proto', 'Button in the Service Definition tab opens a native VS Code file picker filtered to .proto files'],
            ['Server Reflection', 'Button in the same tab calls the target server\'s gRPC reflection service directly — no file needed'],
          ]}
        />
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          There's no third "paste a .proto" option in the request builder (that only exists inside the separate Mock
          Server AI route generator).
        </p>
      </div>

      {byId['grpc-proto'] && <CaptureCard entry={byId['grpc-proto']} />}

      <div>
        <SectionTitle id="grpc-calltypes" emoji="🔄">The 4 Call Types</SectionTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          Not a dropdown you pick — Daakia reads the proto's <Code>requestStream</Code>/<Code>responseStream</Code>{' '}
          flags for the selected method and shows a colored badge automatically:
        </p>
        <WikiTable
          headers={['Call Type', 'Streams']}
          rows={[
            ['Unary', 'One request, one response — the default for most RPCs'],
            ['Server Stream', 'One request, a stream of responses'],
            ['Client Stream', 'A stream of requests, one response'],
            ['Bidi Stream', 'Both sides stream independently'],
          ]}
        />
      </div>

      <div>
        <SectionTitle id="grpc-metadata" emoji="🔑">Metadata & TLS</SectionTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          Metadata is gRPC's header equivalent — same key/value table component as REST Headers, just bound to a
          separate field. Nothing is auto-added to it; every row is exactly what you typed. AI header suggestions
          (✨) are available here too, same opt-in feature as REST.
        </p>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          TLS is a single lock-icon toggle in the URL bar — <strong>on</strong> uses a standard SSL credential, <strong>off</strong>{' '}
          uses an insecure channel. There are no client certificate, private key, or CA bundle fields to configure.
        </p>
      </div>
      {cap('grpc-metadata')}
      {cap('grpc-auth')}

      <Divider />

      {/* ── Scripts ───────────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="grpc-scripts" emoji="📜">Scripts</SectionTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          Same <Code>dk.*</Code> runtime and Pre-request/Post-response split as every other protocol:
        </p>
        <CodeBlock label="Post-response — assert the RPC's grpc-status trailer">
{`dk.test('gRPC call succeeded', () => {
  dk.expect(dk.response.status).toBe(200);
});`}
        </CodeBlock>
      </div>
      {cap('grpc-scripts')}

      <Divider />

      {/* ── Response ──────────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="grpc-response" emoji="📥">Response Panel</SectionTitle>
        <WikiTable
          headers={['Tab', 'Answers']}
          rows={[
            ['Body', 'What did the server send back? For streaming calls, each message appears as it arrives.'],
            ['Metadata', 'What trailing metadata came with it — grpc-status, grpc-message, custom trailers?'],
            ['Tests', 'Did my Post-response dk.test() assertions pass?'],
            ['Timeline', 'Where did the time go — connection setup, TLS handshake, time-to-first-byte?'],
          ]}
        />
        <Callout type="tip">
          Explain (teal) / Follow-ups (teal) / Record Baseline (red) / ⋮ AI Actions in the response toolbar are the
          exact same <Code>xs</Code>-sized DUI <Code>AIButtonView</Code> pills as REST's response panel — same colors,
          same widths, same layout.
        </Callout>
      </div>
      {cap('grpc-response-body')}
      {cap('grpc-response-metadata')}
      {cap('grpc-response-tests')}
      {cap('grpc-response-timeline')}

      <Divider />

      {/* ── Tips ──────────────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="grpc-tips" emoji="💡">Tips & Troubleshooting</SectionTitle>
        <Collapsible title="🔌 Server Reflection returns no services">
          <p className="text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
            The target server needs the reflection service registered — many production gRPC servers disable it
            deliberately. Upload the .proto file instead if reflection comes back empty.
          </p>
        </Collapsible>
        <Collapsible title="🔑 Call fails with an auth/permission error">
          <p className="text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
            Check the Metadata tab, not Auth — some servers expect the token as a plain metadata row (e.g.{' '}
            <Code>authorization: Bearer …</Code>) rather than through the Auth tab's Bearer Token type.
          </p>
        </Collapsible>
        <WikiCard title="dk.* quick reference" icon="🧰">
          <WikiTable
            headers={['API', 'Scope', 'What it does']}
            rows={[
              [<Code>dk.request</Code>, 'Both', 'Read/mutate metadata, method, message body before send'],
              [<Code>dk.response</Code>, 'Post-response only', 'status (mapped grpc-status), headers (metadata), body, .json()'],
              [<Code>dk.test(name, fn)</Code>, 'Both', 'Runs fn(), records pass/fail'],
            ]}
          />
        </WikiCard>
      </div>
    </WikiScrollPage>
  );
}
