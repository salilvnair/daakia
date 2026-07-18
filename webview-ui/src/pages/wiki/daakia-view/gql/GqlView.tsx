import { WikiScrollPage, CaptureCard } from '../capture/CaptureScrollView';
import {
  WikiHero, SectionTitle, SubTitle, Steps, FeatureGrid, Callout, WikiTable, WikiCard,
  Code, CodeBlock, Collapsible, Badge, Divider, ProtocolActivateNote, chips, TocBar, type TocItem,
} from '../shared/WikiShared';
import { ProtocolGraphQLBadge } from '../../../../icons';
import { GQL_CAPTURES } from './captures';

const TOC_ITEMS: TocItem[] = [
  { id: 'gql-protocol', emoji: '📖', label: 'What is GraphQL?' },
  { id: 'gql-connect', emoji: '🔌', label: 'Connect Flow' },
  { id: 'gql-urlbar', emoji: '🔗', label: 'Endpoint Bar' },
  { id: 'gql-query', emoji: '📝', label: 'Query & Variables' },
  { id: 'gql-headers', emoji: '📋', label: 'Headers & Auth' },
  { id: 'gql-scripts', emoji: '📜', label: 'Scripts' },
  { id: 'gql-subscription', emoji: '📡', label: 'Subscriptions' },
  { id: 'gql-response', emoji: '📥', label: 'Response' },
  { id: 'gql-panels', emoji: '📖', label: 'Sidebar Panels' },
  { id: 'gql-tips', emoji: '💡', label: 'Tips' },
];

export function GqlView() {
  const byId = Object.fromEntries(GQL_CAPTURES.map(c => [c.id, c]));
  const cap = (id: string) => byId[id] && <CaptureCard entry={byId[id]} />;

  return (
    <WikiScrollPage
      hero={
        <WikiHero
          emoji="🔷"
          title="GraphQL Client"
          subtitle="Query, mutation, and subscription editor with schema-aware autocomplete, scripting, and live events — same request scaffolding as REST underneath."
          chips={chips(['Query', 'Variables', 'Headers', 'Auth', 'Scripts', 'Subscriptions'])}
        />
      }
      toc={<TocBar items={TOC_ITEMS} />}
    >

      {/* ── Connect flow ─────────────────────────────────────────────── */}
      <div>
        <ProtocolActivateNote icon={<ProtocolGraphQLBadge size={20} />} color="var(--color-protocol-graphql)" name="GraphQL" />
      </div>

      <Divider />

      <div>
        <SectionTitle id="gql-protocol" emoji="📖">What is GraphQL?</SectionTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          <strong>GraphQL</strong> is a query language for APIs and a server-side runtime for executing those queries
          against a strongly-typed schema, originally developed at Facebook and open-sourced in 2015. Unlike REST,
          where the server decides the shape of each endpoint's response, GraphQL flips that: the client sends a
          query describing <em>exactly</em> the fields it wants, across potentially multiple related resources, and
          the server returns a JSON object shaped to match that query — no more, no less. There's typically just{' '}
          <strong>one endpoint</strong> (conventionally <Code>/graphql</Code>), and every request — whether it reads
          or writes data — is an HTTP POST with a JSON body containing the query text and any variables.
        </p>
        <SubTitle>The three operation types</SubTitle>
        <WikiTable
          headers={['Operation', 'Purpose', 'REST analogue']}
          rows={[
            ['query', 'Read data — safe, no side effects, cacheable in principle', 'GET'],
            ['mutation', 'Create/update/delete data — has side effects', 'POST / PUT / PATCH / DELETE'],
            ['subscription', 'A long-lived operation that pushes updated results over time, usually over WebSocket', '(no REST equivalent — closest is realtime WS/SSE)'],
          ]}
        />
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          The GraphQL spec itself doesn't mandate a transport — queries and mutations are conventionally sent over
          HTTP POST, but subscriptions need a persistent connection, which is why Daakia's Subscription sub-tab opens
          a real WebSocket using the <Code>graphql-ws</Code> subprotocol instead of another HTTP request.
        </p>
        <SubTitle>What actually goes over the wire</SubTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          A GraphQL "query" is really a small domain-specific language, not free-form text — every request is a
          single HTTP POST whose JSON body wraps the query string plus a separate variables object:
        </p>
        <CodeBlock label="The query, as you'd write it in the Query editor" lang="graphql">
{`query GetUser($id: ID!) {
  user(id: $id) {
    id
    name
    email
    posts(first: 5) {
      title
      publishedAt
    }
  }
}`}
        </CodeBlock>
        <CodeBlock label="What actually goes out over HTTP — POST body" lang="json">
{`{
  "query": "query GetUser($id: ID!) { user(id: $id) { id name email posts(first: 5) { title publishedAt } } }",
  "variables": { "id": "42" },
  "operationName": "GetUser"
}`}
        </CodeBlock>
        <CodeBlock label="A typical response — shaped exactly like the query" lang="json">
{`{
  "data": {
    "user": {
      "id": "42",
      "name": "Alice Johnson",
      "email": "alice@example.com",
      "posts": [
        { "title": "Hello GraphQL", "publishedAt": "2026-06-01T00:00:00Z" }
      ]
    }
  }
}`}
        </CodeBlock>
        <Callout type="warn">
          GraphQL almost always answers with HTTP <Code>200 OK</Code>, even when the query partially or completely
          failed — errors are reported inside the JSON body's own <Code>errors</Code> array, not via the HTTP status
          line. That's precisely why Daakia raises its own <Code>⚠ GraphQL Errors</Code> flag on the response panel
          instead of relying on the status code — see the Response Panel section below.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="gql-connect" emoji="🔌">Connect Flow</SectionTitle>
        <Steps steps={[
          'Click the <strong>GQL</strong> protocol icon in the left rail',
          'Enter your GraphQL endpoint URL',
          'Click <strong>Connect</strong> — the button shows "connecting…" immediately, then Daakia sends one real introspection query to the endpoint',
          'On success, the full schema (raw JSON + a generated SDL string) is stored on the tab — Documentation (📖) and Schema (⟨/⟩) sidebar icons become active',
          'Write a query in the Query editor → click <strong>Run</strong> (or <Code>Ctrl+Enter</Code>)',
        ]} />
        <Callout type="info">
          Introspection is <strong>not automatic</strong> — it only runs the moment you click Connect, once.{' '}
          <strong>Disconnect</strong> just clears the locally-stored schema; it doesn't call the server. There's no
          background polling or re-introspection.
        </Callout>
        <SubTitle>What Daakia Auto-Populates for You</SubTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          Unlike REST's several auto-set headers, GraphQL only has one — and it's the same on both Connect and every
          query Run:
        </p>
        <WikiTable
          headers={['Header', 'When', 'Value']}
          rows={[
            ['Content-Type', 'Every introspection call and every query/mutation execution', <><Code>application/json</Code> — a manual row with the same key in the Headers tab overrides it</>],
          ]}
        />
      </div>

      {/* ── Endpoint bar ──────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="gql-urlbar" emoji="🔗">The Endpoint Bar</SectionTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          A lighter, separate input from REST's URL bar — same <Code>{'{{variableName}}'}</Code> highlighting and
          suggestion dropdown, but a smaller feature set:
        </p>
        <WikiTable
          headers={['Behavior', 'Details']}
          rows={[
            ['Variable highlighting', 'Same as REST — {{var}}, ${var}, and $daakia_{...}_$ all resolve and highlight inline'],
            ['Auto-suggestions', 'Mock servers first, then http(s):// protocol hints, then history/collection URLs — deduped, capped at 8'],
            ['Locked once connected', 'The endpoint field disables itself after a successful Connect — disconnect first to change it'],
            ['No cURL paste', 'Unlike REST, pasting a curl command here does nothing special — there is no Import cURL for GraphQL'],
            ['No auto scheme-fill', "Bare hosts aren't auto-prefixed with http:// the way REST's URL bar does — type the full URL"],
          ]}
        />
      </div>

      {/* ── Query & Variables ─────────────────────────────────────────── */}
      <div>
        <SectionTitle id="gql-query" emoji="📝">Query & Variables</SectionTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          The Query editor is one of six sub-tabs — <strong>Query, Variables, Headers, Authorization, Scripts,
          Subscription</strong> — laid out as tabs directly under the endpoint bar, same tab strip style as REST's
          request config row. You can open multiple named query tabs side-by-side (the <Code>+</Code> button next to
          the query tab strip) to keep several queries against the same endpoint without losing your place.
        </p>
        <Callout type="info">
          The Variables editor does <strong>not</strong> validate JSON as you type — Monaco's built-in JSON squiggles
          are the only live feedback. Real validation happens server-side, at execute time: an invalid Variables body
          fails the run with <Code>"Invalid variables JSON"</Code> rather than being caught while typing.
        </Callout>
      </div>
      {cap('graphql-query')}
      {cap('graphql-variables')}

      {/* ── Headers & Auth ────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="gql-headers" emoji="📋">Headers & Authorization</SectionTitle>
        <Callout type="tip">
          These two tabs are <strong>identical</strong> to REST — same KeyValueTable component, same AuthEditor. Bearer,
          Basic, API Key, OAuth 2.0 (Client Credentials + Authorization Code) all work exactly the same way, and{' '}
          <Code>{'{{authToken}}'}</Code>-style variables resolve the same way too.
        </Callout>
      </div>
      {cap('graphql-headers')}
      {cap('graphql-authorization')}

      <Divider />

      {/* ── Scripts ───────────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="gql-scripts" emoji="📜">Scripts</SectionTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          Same <Code>dk.*</Code> runtime as REST, same Pre-request / Post-response split — nothing GraphQL-specific
          about the API surface, it operates on the underlying HTTP call GraphQL makes under the hood:
        </p>
        <CodeBlock label="Post-response — assert no GraphQL errors came back">
{`dk.test('No GraphQL errors', () => {
  const body = dk.response.json();
  dk.expect(body.errors).toBeUndefined();
});
dk.env.set('user_id', dk.response.json().data.user.id);`}
        </CodeBlock>
      </div>
      {cap('graphql-scripts')}
      <WikiCard title="dk.* quick reference" icon="🧰">
        <WikiTable
          headers={['API', 'Scope', 'What it does']}
          rows={[
            [<Code>dk.request</Code>, 'Both', 'Read/mutate the underlying HTTP request before send'],
            [<Code>dk.response</Code>, 'Post-response only', 'status, headers, body, .json() — the raw GraphQL envelope, errors array included'],
            [<Code>dk.test(name, fn)</Code>, 'Both', 'Runs fn(), records pass/fail'],
            [<Code>dk.env / dk.collection / dk.global</Code>, 'Both', 'Get/set variables at each scope'],
          ]}
        />
      </WikiCard>

      {/* ── Subscriptions ─────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="gql-subscription" emoji="📡">Subscriptions</SectionTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          A dedicated live-events panel using the <Code>graphql-ws</Code> protocol over WebSocket — write a{' '}
          <Code>subscription {'{ ... }'}</Code> query in the Query editor, switch to the <strong>Subscription</strong>{' '}
          sub-tab, then Subscribe:
        </p>
        <WikiTable
          headers={['State', 'Meaning']}
          rows={[
            [<Badge variant="ok">Live</Badge>, 'Connected and actively receiving events — pulsing dot'],
            [<Badge variant="warn">Connecting…</Badge>, 'Handshake in progress'],
            ['Completed', 'Server sent a completion signal — the subscription ended cleanly, not an error'],
          ]}
        />
        <FeatureGrid items={[
          { emoji: '📋', title: 'Per-event copy', desc: 'Hover any event to copy its formatted JSON.' },
          { emoji: '⬇️', title: 'Auto-scroll toggle', desc: 'Pin to the latest event, or freeze to read older ones.' },
          { emoji: '🗑️', title: 'Clear', desc: 'Wipe the events log without disconnecting.' },
        ]} />
      </div>
      {cap('graphql-subscription')}

      <Divider />

      {/* ── Response ──────────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="gql-response" emoji="📥">Response Panel</SectionTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          One JSON panel — GraphQL always returns HTTP 200 for most errors, so Daakia parses the body and raises its
          own <Code>⚠ GraphQL Errors</Code> flag whenever the response's <Code>errors</Code> array is non-empty, even
          on a nominally successful status:
        </p>
        <WikiTable
          headers={['Signal', 'Where']}
          rows={[
            ['HTTP status + size + time', 'Status bar, top of the response panel'],
            ['⚠ GraphQL Errors', 'Appears next to the status the moment response.errors is a non-empty array — independent of the HTTP status code'],
          ]}
        />
        <Callout type="tip">
          Explain, Follow-ups, Smart Retry Advisor, and Pattern Baseline are the <strong>same AI toolbar</strong> as
          REST's response panel — same buttons, same size, same accent color.
        </Callout>
      </div>
      {cap('graphql-response')}

      <Divider />

      {/* ── Sidebar panels ────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="gql-panels" emoji="📖">Sidebar Panels (after Connect)</SectionTitle>
        <FeatureGrid items={[
          { emoji: '📖', title: 'Documentation', desc: 'Root Types, all schema types with color coding — search + filter.' },
          { emoji: '⟨/⟩', title: 'Schema SDL', desc: 'Full Schema Definition Language view — read-only, syntax highlighted.' },
          { emoji: '📁', title: 'Collections', desc: 'Save GraphQL requests to collections for later use.' },
          { emoji: '🕐', title: 'History', desc: 'All executed queries — click to replay.' },
          { emoji: '🌿', title: 'Environments', desc: 'Shared environments — {{gql_host}} resolves in endpoints and headers.' },
        ]} />
        <SubTitle>Documentation Explorer Color Coding</SubTitle>
        <WikiTable
          headers={['Kind', 'Examples', 'Color']}
          rows={[
            ['Scalar', 'String, Int, Float, Boolean, ID', 'Info blue'],
            ['Enum', 'Any GraphQL enum type', 'Warning amber'],
            ['Input Object', 'Any input type used as an argument', 'Warning amber'],
            ['Object / Interface / Union', 'Everything else', 'GraphQL purple'],
          ]}
        />
      </div>

      <Divider />

      {/* ── Tips ──────────────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="gql-tips" emoji="💡">Tips & Troubleshooting</SectionTitle>
        <Collapsible title={'🔌 Connect button seems stuck on "connecting…"'}>
          <p className="text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
            That's the one real introspection call — if the endpoint is slow or unreachable it will sit there until
            the request times out. Check the endpoint URL and any required auth headers first.
          </p>
        </Collapsible>
        <Collapsible title="📡 Subscribe button is disabled">
          <p className="text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
            It needs both a non-empty endpoint URL <em>and</em> a non-empty query in the editor — write your{' '}
            <Code>subscription {'{ }'}</Code> first.
          </p>
        </Collapsible>
        <Collapsible title="⚠️ Response shows 200 but I know it failed">
          <p className="text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
            Check the <Code>⚠ GraphQL Errors</Code> flag next to the status — GraphQL servers commonly return HTTP 200
            with an <Code>errors</Code> array in the body instead of a 4xx/5xx status.
          </p>
        </Collapsible>
        <Callout type="ok" title="Keyboard shortcut">
          <Code>Ctrl+Enter</Code> / <Code>Cmd+Enter</Code> runs the active query from anywhere in the tab.
        </Callout>
      </div>
    </WikiScrollPage>
  );
}
