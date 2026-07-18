import { WikiScrollPage, CaptureCard } from '../capture/CaptureScrollView';
import {
  WikiHero, SectionTitle, SubTitle, FeatureGrid, Callout, Steps, WikiTable,
  Code, CodeBlock, Collapsible, Badge, WikiCard, Divider, ProtocolActivateNote, chips, TocBar, type TocItem,
} from '../shared/WikiShared';
import { ProtocolRestBadge } from '../../../../icons';
import { CONTENT_TYPE_OPTIONS } from '../../../../components/rest/request/bodyContentTypes';

/** What each real Content-Type value does — kept next to bodyContentTypes.ts so this list can't silently drift. */
const CONTENT_TYPE_NOTES: Record<string, string> = {
  'application/json': 'Default — full JSON editor, validation, bracket matching',
  'application/ld+json': 'JSON-LD — linked-data graphs with an @context/@type envelope',
  'application/hal+json': 'HAL+JSON — hypermedia APIs with an _links envelope',
  'application/vnd.api+json': 'JSON:API — the data/type/id/attributes envelope',
  'application/xml': 'Generic XML with an XML declaration',
  'text/xml': 'XML without the declaration — some legacy servers expect this over application/xml',
  'application/soap+xml': 'SOAP envelope template — Header/Body wrapper included',
  'text/plain': 'Unstructured text, no editor validation',
  'text/html': 'HTML document, starter boilerplate included',
  'text/css': 'CSS stylesheet',
  'text/csv': 'Comma-separated values',
  'text/markdown': 'Markdown document',
  'application/javascript': 'Raw JS source as the body (not the same as the Scripts tab)',
  'application/graphql': 'Raw GraphQL query text as the body — for GraphQL-over-plain-body servers, not the GraphQL tab',
  'application/yaml': 'YAML document',
  'multipart/form-data': 'Per-row Text/File toggle — real file pickers, mixed uploads in one request',
  'application/x-www-form-urlencoded': 'key=value&key2=value2 — classic HTML form encoding',
  'application/octet-stream': 'One file, sent as the raw request body (no multipart wrapper)',
  'application/msgpack': 'Binary MessagePack — same file-as-body flow as octet-stream, different Content-Type',
};
import { REST_CAPTURES } from './captures';

const TOC_ITEMS: TocItem[] = [
  { id: 'rest-protocol', emoji: '📖', label: 'What is REST?' },
  { id: 'rest-anatomy', emoji: '🧭', label: 'Anatomy' },
  { id: 'rest-params', emoji: '🔗', label: 'Params' },
  { id: 'rest-headers', emoji: '📋', label: 'Headers' },
  { id: 'rest-body', emoji: '📦', label: 'Body' },
  { id: 'rest-auth', emoji: '🔒', label: 'Auth' },
  { id: 'rest-scripts', emoji: '📜', label: 'Scripts' },
  { id: 'rest-variables', emoji: '🔤', label: 'Variables' },
  { id: 'rest-send', emoji: '🚀', label: 'Send & Code' },
  { id: 'rest-response', emoji: '📥', label: 'Response' },
  { id: 'rest-tips', emoji: '💡', label: 'Tips' },
];

export function RestView() {
  const byId = Object.fromEntries(REST_CAPTURES.map(c => [c.id, c]));
  const cap = (id: string) => byId[id] && <CaptureCard entry={byId[id]} />;

  return (
    <WikiScrollPage
      hero={
        <WikiHero
          emoji="📡"
          title="REST API Client"
          subtitle="Build, script, and debug HTTP requests — params to response, one panel."
          chips={chips(['GET/POST/PUT/PATCH/DELETE', 'Auth', 'Pre/Post Scripts', 'Variables', 'Code Gen', 'Timeline'])}
        />
      }
      toc={<TocBar items={TOC_ITEMS} />}
    >

      {/* ── Anatomy overview ─────────────────────────────────────────── */}
      <div>
        <ProtocolActivateNote icon={<ProtocolRestBadge size={20} />} color="var(--color-protocol-rest)" name="REST" />
      </div>

      <Divider />

      <div>
        <SectionTitle id="rest-protocol" emoji="📖">What is REST?</SectionTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          <strong>REST</strong> (Representational State Transfer) is an architectural style for networked systems,
          defined by Roy Fielding in his 2000 doctoral dissertation. It isn't a protocol or a standard you implement
          against a spec — it's a set of constraints that, applied on top of plain HTTP, make an API predictable and
          cacheable. A REST API is really just <strong>ordinary HTTP</strong>: a client sends a request line (method
          + URL), a set of headers, and an optional body over TCP (usually TLS-wrapped as HTTPS); the server replies
          with a status line, its own headers, and an optional body. There's no framing layer, no schema negotiation,
          no persistent connection required — every request is a fresh, independent exchange.
        </p>
        <SubTitle>The constraints that make an API "RESTful"</SubTitle>
        <WikiTable
          headers={['Constraint', 'What it means in practice']}
          rows={[
            ['Client–server', 'UI concerns and data-storage concerns are separated — the client never needs to know how the server persists data'],
            ['Stateless', 'Every request carries everything needed to understand it (auth token, params) — the server keeps no per-client session between calls'],
            ['Cacheable', 'Responses declare whether they can be cached (Cache-Control, ETag) so clients and intermediaries can skip a round-trip'],
            ['Uniform interface', 'Resources are identified by a URI, manipulated through a small fixed set of HTTP methods, and represented in a standard media type (usually JSON)'],
            ['Layered system', 'A client can\'t tell whether it\'s talking directly to the origin server or through a proxy/load balancer/cache in between'],
            ['Code on demand (optional)', 'A response can include executable logic (e.g. JavaScript) the client runs — rarely used in API design today'],
          ]}
        />
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          "Statelessness" is the one that trips people up most: it doesn't mean the <em>server's data</em> can't
          change (a database is obviously stateful) — it means the server holds no memory of <em>this client's
          previous requests</em>. That's why every REST call re-sends its auth header instead of relying on a
          server-side login session, and it's exactly what makes REST APIs horizontally scalable — any server in a
          pool can handle any request, because none of them are holding client-specific state.
        </p>
        <SubTitle>How a request actually travels over the wire</SubTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          Strip away the client library and this is the literal byte stream a REST call sends and receives — this is
          exactly what Daakia's <strong>Raw</strong> response tab shows you, unformatted:
        </p>
        <CodeBlock label="Raw HTTP/1.1 request" lang="http">
{`POST /v1/users HTTP/1.1
Host: api.example.com
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.mock_token
Content-Length: 42

{"name":"Alice Johnson","role":"admin"}`}
        </CodeBlock>
        <CodeBlock label="Raw HTTP/1.1 response" lang="http">
{`HTTP/1.1 201 Created
Content-Type: application/json
Location: /v1/users/42
Content-Length: 68

{"id":42,"name":"Alice Johnson","role":"admin","createdAt":"2026-07-15T02:08:00Z"}`}
        </CodeBlock>
        <Callout type="tip">
          The <Code>Location</Code> header on a <Code>201 Created</Code> response, the <Code>Content-Type</Code>{' '}
          negotiation via <Code>Accept</Code>, and status codes like <Code>304 Not Modified</Code> for caching are
          all part of REST's "uniform interface" doing real work — not decoration. A well-designed REST API leans on
          HTTP's own semantics instead of inventing a custom envelope on top.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="rest-anatomy" emoji="🧭">Anatomy of a Request</SectionTitle>
        <WikiTable
          headers={['Method', 'Idempotent?', 'Typical Use']}
          rows={[
            [<Badge variant="ok">GET</Badge>, 'Yes', 'Fetch data — no body sent'],
            [<Badge variant="warn">POST</Badge>, 'No', 'Create a resource — JSON/form body'],
            [<Badge variant="rest">PUT</Badge>, 'Yes', 'Replace a resource entirely — needs a full body'],
            [<Badge variant="ai">PATCH</Badge>, 'No', 'Partial update — send only changed fields'],
            [<span className="dw-badge warn">DELETE</span>, 'Yes', 'Remove a resource — usually no body'],
            ['HEAD / OPTIONS', 'Yes', 'Metadata checks, CORS preflight — no response body'],
          ]}
        />
        <SubTitle>Request Config Tabs</SubTitle>
        <FeatureGrid items={[
          { emoji: '🔗', title: 'Params', desc: 'Query params, two-way synced with the URL bar.' },
          { emoji: '📋', title: 'Headers', desc: 'Key/value table + AI ✨ suggest.' },
          { emoji: '📦', title: 'Body', desc: 'JSON/XML/Form-Data/URL-Encoded/Binary/GraphQL editor.' },
          { emoji: '🔒', title: 'Auth', desc: 'Bearer, Basic, API Key, OAuth 2.0, Digest.' },
          { emoji: '📜', title: 'Scripts', desc: 'Pre-request / Post-response dk.* runtime.' },
          { emoji: '🔤', title: 'Variables', desc: 'Request-scoped, highest-priority overrides.' },
        ]} />
        <Callout type="info">
          <Code>{'{{variableName}}'}</Code> resolves against environment → collection → global (in that order) and
          highlights blue when found — in URL, headers, or body. Escape a literal <Code>{'{{...}}'}</Code> as{' '}
          <Code>{'$daakia_{varName}_$'}</Code> to skip substitution.
        </Callout>
      </div>

      <Divider />

      {/* ── Params ────────────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="rest-params" emoji="🔗">Query Parameters</SectionTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          Two-way synced with the URL bar — type in either place, the other updates. Uncheck a row to drop it from the
          request without deleting the value. For example, with <Code>sort=created_at</Code> unchecked in the table,
          the URL bar only shows the two enabled params:
        </p>
        <CodeBlock label="Resulting URL" lang="bash">
{`GET https://api.example.com/users?page=1&limit=20`}
        </CodeBlock>
        <SubTitle>The URL Bar Itself</SubTitle>
        <WikiTable
          headers={['Behavior', 'Details']}
          rows={[
            ['Method + URL, one control', 'The method dropdown and URL input are a single unified field — no separate method selector row'],
            ['Two-way param sync', 'Editing the query string here updates the Params table, and vice versa — same underlying state'],
            ['Variable highlighting', <><Code>{'{{variableName}}'}</Code> highlights blue inline the moment it resolves against env → collection → global</>],
            ['Auto-suggestions', 'Dropdown shows your request History, saved Collection URLs, and running Mock Server routes as you type'],
            ['Scheme auto-fill', 'Typing a bare host with no protocol (e.g. api.example.com/users) sends as http:// automatically — no need to type it'],
            ['Paste-safe', 'Invisible characters picked up from copy-paste (zero-width spaces, BOM, NBSP) are stripped automatically before sending'],
            ['Import cURL', <>Not auto-parsed on paste — use <strong>Send ▾ → Import cURL</strong> to turn a full curl command into a real request (method, headers, body, all parsed)</>],
          ]}
        />
      </div>
      {cap('rest-params')}

      {/* ── Headers ───────────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="rest-headers" emoji="📋">Headers</SectionTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          Same key/value editor as Params. <strong>✨ Suggest headers</strong> looks at method/URL/body and proposes a
          starting set instead of typing from memory:
        </p>
        <CodeBlock label="AI suggestion for a POST with a JSON body" lang="yaml">
{`Content-Type: application/json
Accept: application/json
X-Request-ID: {{$random.uuid}}`}
        </CodeBlock>
        <SubTitle>What Daakia Auto-Populates for You</SubTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          These are added to the actual outgoing request automatically — they don't need a row in this table, and a
          manual row with the same key always wins if you add one:
        </p>
        <WikiTable
          headers={['Header', 'When it’s added', 'Value']}
          rows={[
            ['Content-Type', 'Any time the Body tab has content and you have not set it yourself', 'Derived from the Body mode — e.g. application/json for JSON mode, multipart/form-data; boundary=... for Form Data (boundary is always regenerated, even if you did set one)'],
            ['Authorization', 'Any time the Auth tab is not "No Auth"', 'Bearer {token} for Bearer Token, Basic base64(user:pass) for Basic Auth, Bearer {access_token} for OAuth 2.0'],
            ['(your custom header name)', 'Auth tab set to API Key with "Header" as the destination', 'The exact header name and value you typed in the Auth tab — not a fixed name'],
          ]}
        />
        <Callout type="info">
          Nothing else is invented for you — Accept, User-Agent, X-Request-ID, etc. are never added automatically.
          That's what <strong>✨ Suggest headers</strong> above is for: it proposes them, you approve them.
        </Callout>
      </div>
      {cap('rest-headers')}

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="rest-body" emoji="📦">Body</SectionTitle>
        <WikiTable
          headers={['Mode', 'Content-Type', 'Notes']}
          rows={[
            ['JSON', 'application/json', 'Default — full editor, validation, bracket matching'],
            ['XML', 'application/xml', 'SOAP-adjacent / legacy APIs'],
            ['Raw', '(whatever you set)', 'YAML, plain text, anything without a dedicated mode'],
            ['Form Data', 'multipart/form-data', 'Per-row Text/File toggle — mixed uploads'],
            ['URL Encoded', 'application/x-www-form-urlencoded', 'key=value&key2=value2'],
            ['Binary', '(per file)', 'Single file as the raw request body'],
            ['GraphQL', 'application/json', 'Wrapped as {"query": "...", "variables": {...}}'],
          ]}
        />
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          That's the 7 modes. The actual Content-Type dropdown has {CONTENT_TYPE_OPTIONS.filter(o => !o.isHeader && o.value !== 'none').length} specific
          values grouped the same way Bruno/Postman group theirs — expand for the full list and what each one actually does:
        </p>
        <Collapsible title="Full Content-Type list, grouped">
          <WikiTable
            headers={['Group', 'Content-Type', 'What it does']}
            rows={CONTENT_TYPE_OPTIONS.filter(o => o.value !== 'none').map(o =>
              o.isHeader
                ? [<strong key={o.value}>{o.label.toUpperCase()}</strong>, '', '']
                : ['', <Code key={o.value}>{o.value}</Code>, CONTENT_TYPE_NOTES[o.value] || '']
            )}
          />
        </Collapsible>
      </div>
      {cap('rest-body-json')}
      <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
        Form Data mode — any row can flip from a plain field to a real file picker in the same request:
      </p>
      {cap('rest-body-formdata')}

      {/* ── Auth ──────────────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="rest-auth" emoji="🔒">Authorization</SectionTitle>
        <WikiTable
          headers={['Type', 'Sends']}
          rows={[
            ['Bearer Token', <Code>Authorization: Bearer {'{{token}}'}</Code>],
            ['Basic Auth', 'Authorization: Basic base64(user:pass)'],
            ['API Key', 'A header or query param, your choice'],
            ['OAuth 2.0', 'Client Credentials or Authorization Code — fetches + caches a real access token'],
            ['Digest', 'Challenge-response for legacy/enterprise APIs'],
          ]}
        />
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          Set once at the collection level, inherit it on every request underneath — or override per-request.
        </p>
      </div>
      {cap('rest-auth')}

      <Divider />

      {/* ── Scripts ───────────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="rest-scripts" emoji="📜">Scripts</SectionTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          <strong>Pre-request</strong> runs before the network call; <strong>Post-response</strong> runs after. Same{' '}
          <Code>dk.*</Code> runtime, different lifecycle:
        </p>
        <CodeBlock label="Pre-request — refresh an auth token before sending">
{`const res = await dk.sendRequest({
  method: 'POST',
  url: 'https://api.example.com/auth/refresh',
  body: JSON.stringify({ refreshToken: dk.env.get('refresh_token') }),
});
if (res.status === 200) {
  dk.env.set('auth_token', res.json().token);
}`}
        </CodeBlock>
        <CodeBlock label="Post-response — assert the response, chain a variable">
{`dk.test('Status is 200', () => {
  dk.expect(dk.response.status).toBe(200);
});
dk.test('Has a user id', () => {
  dk.expect(dk.response.json()).toHaveProperty('id');
});
dk.env.set('user_id', dk.response.json().id);`}
        </CodeBlock>
      </div>
      {cap('rest-scripts')}
      <WikiCard title="dk.* quick reference" icon="🧰">
        <WikiTable
          headers={['API', 'Scope', 'What it does']}
          rows={[
            [<Code>dk.request</Code>, 'Both', 'Read/mutate method, url, headers, body before send'],
            [<Code>dk.response</Code>, 'Post-response only', 'status, headers, body, .json()'],
            [<Code>dk.test(name, fn)</Code>, 'Both', 'Runs fn(), records pass/fail — never throws out'],
            [<Code>dk.expect(x)</Code>, 'Both', '.toBe / .toEqual / .toContain / .toHaveProperty / …'],
            [<Code>dk.sendRequest(opts)</Code>, 'Both', 'Async sub-request — chaining, token refresh, setup'],
            [<Code>dk.env / dk.collection / dk.global</Code>, 'Both', 'Get/set variables at each scope'],
          ]}
        />
      </WikiCard>
      <Callout type="warn" title="dk.response is undefined during Pre-request">
        There's no response yet, so <Code>dk.response.status</Code> throws{' '}
        <Code>Cannot read properties of undefined</Code>. Response assertions belong in{' '}
        <strong>Post-response</strong> — Pre-request is for setting up the request (tokens, dynamic headers,
        timestamps).
      </Callout>
      <Callout type="info" title="Pre-request test results don't reach the Tests tab">
        Only <strong>Post-response</strong> <Code>dk.test()</Code> results are aggregated into the response — a
        passing test written in Pre-request still won't show up. If a test silently "vanishes", check the tab it's in.
      </Callout>

      {/* ── Variables ─────────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="rest-variables" emoji="🔤">Variables</SectionTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          Request-scoped, exists only on this tab. Resolution order, highest wins:
        </p>
        <Steps steps={[
          'Request Variables — set here, this tab only',
          'Environment Variables — active environment (dev/staging/prod)',
          'Collection Variables — shared across the collection',
          'Global Variables — shared across the whole workspace',
        ]} />
      </div>
      {cap('rest-variables')}

      <Divider />

      {/* ── Send + Code Gen ───────────────────────────────────────────── */}
      <div>
        <SectionTitle id="rest-send" emoji="🚀">Send, Import &amp; Generate Code</SectionTitle>
        <WikiTable
          headers={['Action', 'How']}
          rows={[
            ['Send', 'Send button, or Ctrl+Enter'],
            ['Send & Download', '▾ next to Send → "Send & Download" — saves response to a file'],
            ['Import cURL / code', '▾ next to Send → "Import cURL" — paste curl, or AI-extract from any language'],
            ['Generate code', '▾ next to Send → "Show code" — cURL, fetch, axios, Python, Go, Java, C#, PHP, Ruby'],
            ['Clear All', '▾ next to Send → "Clear All"'],
          ]}
        />
        <CodeBlock label="Generate Code output — cURL" lang="bash">
{`curl -X POST https://api.example.com/users \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer {{auth_token}}" \\
  -d '{"name":"Alice","role":"admin"}'`}
        </CodeBlock>
      </div>
      {cap('rest-generate-code')}
      {cap('rest-import-curl')}

      <Divider />

      {/* ── Response ──────────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="rest-response" emoji="📥">Response Panel</SectionTitle>
        <WikiTable
          headers={['Tab', 'Answers']}
          rows={[
            ['JSON', 'What did the server send back? (pretty-printed, filterable)'],
            ['Raw', 'What EXACTLY did the server send, unformatted?'],
            ['Headers', 'What headers came with it?'],
            ['Cookies', 'Did a session/auth cookie get set?'],
            ['Tests', 'Did my Post-response assertions pass?'],
            ['Timeline', 'Where did the time go — DNS, TLS, TTFB, download?'],
          ]}
        />
      </div>
      {cap('rest-response-json')}
      {cap('rest-response-raw')}
      {cap('rest-response-headers')}
      {cap('rest-response-cookies')}
      {cap('rest-response-tests')}
      {cap('rest-response-timeline')}

      <Divider />

      {/* ── Tips ──────────────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="rest-tips" emoji="💡">Tips &amp; Troubleshooting</SectionTitle>
        <Collapsible title="🔍 My variable isn't resolving">
          <p className="text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
            Check an environment is actually selected — a variable defined only in an <em>inactive</em> environment
            won't resolve, even if the name is correct.
          </p>
        </Collapsible>
        <Collapsible title="🔗 A variable my script wrote isn't available in the next request">
          <p className="text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
            Variable writes persist after the script finishes, not mid-flight. Pre-request → Post-response within the{' '}
            <em>same</em> request works; across two separate requests, chain a real request instead:
          </p>
          <CodeBlock label="Chaining a value into the next request">
{`// Request A — Post-response
dk.env.set('user_id', dk.response.json().id);

// Request B — Pre-request (reads the value Request A just wrote)
const id = dk.env.get('user_id');`}
          </CodeBlock>
        </Collapsible>
        <Collapsible title="🧪 The Tests tab isn't showing up">
          <p className="text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
            It only renders once the response has test results, script logs, or script errors — and only{' '}
            <strong>Post-response</strong> tests count. Move <Code>dk.test()</Code> out of Pre-request.
          </p>
        </Collapsible>
        <Callout type="ok" title="Keyboard shortcut">
          <Code>Ctrl+Enter</Code> / <Code>Cmd+Enter</Code> sends from anywhere in the tab.
        </Callout>
      </div>
    </WikiScrollPage>
  );
}
