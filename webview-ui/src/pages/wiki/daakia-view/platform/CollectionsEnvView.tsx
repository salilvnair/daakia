import { WikiScrollPage, CaptureCard } from '../capture/CaptureScrollView';
import { WikiHero, SectionTitle, SubTitle, Steps, FeatureGrid, Callout, WikiTable, Code, Collapsible, WikiCard, Divider, chips } from '../shared/WikiShared';
import { PLATFORM_CAPTURES } from './captures';

// A pixel `crop` here (x/width slice of the capture, to zoom into just the
// sidebar panel) previously lived on this constant, but it kept silently
// breaking: CaptureScrollView.tsx's crop math assumes every capture is
// authored at exactly its DESIGN_WIDTH (1280px), and this app's actual
// captured layout doesn't reliably measure at that width — pinning the e2e
// test window size (`--window-size=1280,800` in src/test/runTests.ts) and
// re-measuring still produced inconsistent numbers between an isolated
// harness and the live wiki render (981 vs. 1348+), which pointed at a
// deeper CSS-context-dependent layout difference rather than one bad
// number to fix. A hardcoded x-crop is too fragile for this specific
// screen: no crop is passed below, so the full capture always renders
// (smaller, but never a blank box next to real content).

export function CollectionsEnvView() {
  const byId = Object.fromEntries(PLATFORM_CAPTURES.map(c => [c.id, c]));
  return (
    <WikiScrollPage hero={
      <WikiHero
        emoji="🗂️"
        title="Collections, Environments & More"
        subtitle="Everything that lives around a request — folders, variables, history, auth, scripts, cookies, and the request timeline."
        chips={chips(['Collections', 'Environments', 'History', 'Auth', 'Scripts', 'Cookies'])}
      />
    }>
      {/* ─── Collections ──────────────────────────────────────────── */}
      <div>
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
        {byId['platform-sidebar-collections'] && <CaptureCard entry={byId['platform-sidebar-collections']} />}
      </div>

      <Divider />

      {/* ─── Environments ─────────────────────────────────────────── */}
      <div>
        <SectionTitle emoji="🌿">Environments & Variables</SectionTitle>
        <Callout type="tip" title="Variable Priority (Highest → Lowest)">
          Request Variables → Active Environment → Collection Variables → Global Variables
        </Callout>
        <SubTitle>Creating Environments</SubTitle>
        <Steps steps={[
          'Open the Environments panel (sidebar icon — stacked layers)',
          'Click <strong>+</strong> → New Environment → name it (e.g. "Dev", "Staging", "Prod")',
          'Add variables: key = baseUrl, value = https://dev.api.example.com',
          'Select the environment in the <strong>TabBar dropdown</strong> (per-tab)',
          'Use <strong>{{baseUrl}}</strong> anywhere in URL, headers, body, scripts',
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
        {byId['platform-sidebar-environments'] && <CaptureCard entry={byId['platform-sidebar-environments']} />}
      </div>

      <Divider />

      {/* ─── History ──────────────────────────────────────────────── */}
      <div>
        <SectionTitle emoji="🕐">History</SectionTitle>
        <FeatureGrid items={[
          { emoji: '📋', title: 'Auto-recorded', desc: 'Every sent request is saved automatically — method, URL, status, time.' },
          { emoji: '▶️', title: 'Replay', desc: 'Click any history entry to open it in a new tab with full headers, body, and auth.' },
          { emoji: '🗑️', title: 'Clear', desc: 'Delete individual entries or clear all history at once.' },
          { emoji: '💾', title: 'Persistent', desc: 'Stored in SQLite — history survives VS Code restarts.' },
        ]} />
        <Callout type="info">
          Replaying a history entry that had a file upload will show the original file path. If the file was moved or deleted, a red warning ⚠️ appears on the form-data row.
        </Callout>
        {byId['platform-sidebar-history'] && <CaptureCard entry={byId['platform-sidebar-history']} />}
      </div>

      <Divider />

      {/* ─── Authentication ───────────────────────────────────────── */}
      <div>
        <SectionTitle emoji="🔒">Authentication</SectionTitle>
        <SubTitle>Built-in Auth Types</SubTitle>
        <WikiTable
          headers={['Type', 'What it sends', 'Best for']}
          rows={[
            ['Bearer Token', 'Authorization: Bearer <token>', 'JWT APIs, OAuth protected endpoints'],
            ['Basic Auth', 'Authorization: Basic <base64(user:pass)>', 'HTTP Basic Auth, legacy APIs'],
            ['API Key', 'Header: X-API-Key: <key> (or query param)', 'API gateway keys, service tokens'],
            ['OAuth 2.0', 'Authorization: Bearer <fetched-token>', 'Modern APIs with login flow'],
          ]}
        />
        <SubTitle>OAuth 2.0 Grant Types</SubTitle>
        <WikiCard title="Client Credentials" icon="🔑">
          <Steps steps={[
            'Go to request <strong>Auth</strong> tab → select OAuth 2.0',
            'Set Grant Type: <strong>Client Credentials</strong>',
            'Fill Token URL, Client ID, Client Secret, (optional) Scope',
            'Click <strong>Get Token</strong> → token is fetched automatically',
            'Token is injected as <strong>Authorization: Bearer ...</strong> on send',
          ]} />
        </WikiCard>
        <WikiCard title="Authorization Code (PKCE)" icon="🌐">
          <Steps steps={[
            'Grant Type: <strong>Authorization Code</strong>',
            'Fill Auth URL, Token URL, Client ID, Redirect URI, Scope',
            'Check <strong>Use PKCE (S256)</strong> for modern OAuth servers',
            'Click <strong>Get Token</strong> — browser opens to your login page',
            'After login, browser redirects back and Daakia captures the token',
          ]} />
          <Callout type="info">
            Default redirect URI: <Code>http://localhost:43789/callback</Code> — Daakia starts a local server to catch the OAuth callback.
          </Callout>
        </WikiCard>
        <Callout type="tip">
          Set auth once at the <strong>collection</strong> level — all requests inside inherit it.
          Override per-request if needed. Right-click collection → Properties → Auth tab.
        </Callout>
      </div>

      <Divider />

      {/* ─── Scripts & Testing ────────────────────────────────────── */}
      <div>
        <SectionTitle emoji="📝">Scripts & Testing</SectionTitle>
        <Callout type="info" title="What are Scripts?">
          JavaScript snippets that run before a request (Pre-request) or after the response (Post-response).
          Use them to set dynamic headers, chain requests, and write automated test assertions.
        </Callout>
        <SubTitle>Pre-Request Scripts</SubTitle>
        <WikiTable
          headers={['Task', 'Code Example']}
          rows={[
            ['Set env variable', <Code>{'daakia.environment.set("ts", Date.now().toString())'}</Code>],
            ['Read env variable', <Code>{'const host = daakia.environment.get("baseUrl")'}</Code>],
            ['Log something', <Code>{'console.log("Request URL:", daakia.request.url)'}</Code>],
            ['Abort request', <Code>{'throw new Error("Abort: missing auth token!")'}</Code>],
            ['Set request header', <Code>{'daakia.request.headers["X-Ts"] = Date.now().toString()'}</Code>],
          ]}
        />
        <SubTitle>Assertion Matchers</SubTitle>
        <WikiTable
          headers={['Matcher', 'Checks']}
          rows={[
            [<Code>toBe(value)</Code>, 'Strict equality (===)'],
            [<Code>toEqual(value)</Code>, 'Deep equality for objects/arrays'],
            [<Code>toBeTruthy()</Code>, 'Value is truthy (non-null, non-empty)'],
            [<Code>toBeFalsy()</Code>, 'Value is falsy (null, 0, "", false)'],
            [<Code>toContain(val)</Code>, 'String contains or array includes val'],
            [<Code>toBeGreaterThan(n)</Code>, 'Value > n'],
            [<Code>toBeLessThan(n)</Code>, 'Value < n'],
            [<Code>toHaveProperty(key)</Code>, 'Object has property key'],
            [<Code>toHaveStatus(code)</Code>, 'Response status equals code'],
          ]}
        />
        <SubTitle>daakia.response Object</SubTitle>
        <WikiTable
          headers={['Property', 'Type', 'Value']}
          rows={[
            [<Code>daakia.response.status</Code>, 'number', 'HTTP status code (200, 201, 404...)'],
            [<Code>daakia.response.body</Code>, 'string', 'Raw response body as string'],
            [<Code>daakia.response.time</Code>, 'number', 'Total response time in milliseconds'],
            [<Code>daakia.response.headers</Code>, 'object', 'Response headers as key-value map'],
            [<Code>daakia.response.size</Code>, 'number', 'Response size in bytes'],
          ]}
        />
        <Collapsible title="Collection-Level Scripts">
          Collection scripts run BEFORE request-level scripts (pre-request) and AFTER them (post-response).
          Order: Collection Pre → Request Pre → HTTP call → Request Post → Collection Post.
          Right-click collection → Properties → Scripts tab to set them.
        </Collapsible>
      </div>

      <Divider />

      {/* ─── Cookies ──────────────────────────────────────────────── */}
      <div>
        <SectionTitle emoji="🍪">Cookies</SectionTitle>
        <FeatureGrid items={[
          { emoji: '📥', title: 'Auto-capture', desc: 'Cookies from Set-Cookie headers are automatically stored per domain.' },
          { emoji: '📤', title: 'Auto-send', desc: 'Stored cookies are sent with subsequent requests to the same domain.' },
          { emoji: '👁️', title: 'Cookie Viewer', desc: 'See all cookies in the Response panel → Cookies tab after a request.' },
          { emoji: '🌐', title: 'Domain-scoped', desc: 'Cookies are isolated per domain — httpbin.org and api.example.com are separate.' },
        ]} />
        <Callout type="info">
          Cookie jar is global across tabs — all tabs share cookies for the same domain.
          Test cookie flows: <Code>GET /cookies/set?name=daakia</Code> → <Code>GET /cookies</Code> → second request automatically includes the cookie.
        </Callout>
      </div>

      <Divider />

      {/* ─── Timeline ─────────────────────────────────────────────── */}
      <div>
        <SectionTitle emoji="⏱️">Timeline & Network</SectionTitle>
        <SubTitle>Timeline Breakdown</SubTitle>
        <WikiTable
          headers={['Phase', 'What it measures']}
          rows={[
            ['DNS Lookup', 'Time to resolve hostname to IP (0ms for localhost)'],
            ['TCP Connection', 'Time to establish the TCP connection'],
            ['TLS Handshake', 'Time for SSL/TLS negotiation (HTTPS only)'],
            ['Request Sent', 'Time to transmit the request headers and body'],
            ['Waiting (TTFB)', 'Time to First Byte — server processing time'],
            ['Content Download', 'Time to receive the full response body'],
            ['Total', 'Sum of all phases'],
          ]}
        />
        <Callout type="tip">
          Use <strong>GET https://httpbin.org/delay/2</strong> to see a slow TTFB (2s waiting phase) vs fast download. Great for debugging slow APIs.
        </Callout>
        <SubTitle>Network Logs</SubTitle>
        <Callout type="info">
          Network Logs in the Timeline tab show the <strong>actual sent request</strong> — including auto-added headers (Content-Type, Authorization) that don't appear in the Headers tab.
          Great for debugging multipart boundaries and auth token injection.
        </Callout>
      </div>

      <Divider />

      {/* ─── DevTools ─────────────────────────────────────────────── */}
      <div>
        <SectionTitle emoji="🛠️">DevTools Panel</SectionTitle>
        <Callout type="info" title="Not the same as the Response panel">
          The bottom DevTools panel is app-wide — it aggregates script console output and network activity across every tab, independent of whichever single request/response you're currently looking at.
        </Callout>
        <SubTitle>Console</SubTitle>
        <Steps steps={[
          'Click the <strong>DevTools</strong> icon in the top toolbar (or it opens automatically on the first script log)',
          'Pre-request, post-response, and collection-level script <Code>console.log</Code> calls all land here, tagged with which request produced them',
          '<Code>dk.test()</Code> assertion results (pass ✓ / fail ✗) appear as log entries too',
          'Filter by level (log / info / warn / error) or clear the console entirely',
        ]} />
        {byId['platform-devtools-console'] && <CaptureCard entry={byId['platform-devtools-console']} />}
        <SubTitle>Network</SubTitle>
        <Callout type="tip">
          Every request Daakia sends — across REST, GraphQL, gRPC, SOAP, and realtime protocols — appears here with full headers, bodies, timing, and size, so you can review past traffic without re-running anything.
        </Callout>
        {byId['platform-devtools-network'] && <CaptureCard entry={byId['platform-devtools-network']} />}
      </div>
    </WikiScrollPage>
  );
}
