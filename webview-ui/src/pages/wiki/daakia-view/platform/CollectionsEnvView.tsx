import { WikiScrollPage, CaptureCard } from '../capture/CaptureScrollView';
import { WikiHero, SectionTitle, SubTitle, Steps, FeatureGrid, Callout, WikiTable, Code, Collapsible, WikiCard, Divider, ProtocolActivateNote, chips, TocBar, type TocItem } from '../shared/WikiShared';
import { CollectionsFolderIcon, ClockIcon, LayersIcon } from '../../../../icons';
import { PLATFORM_CAPTURES } from './captures';

const TOC_ITEMS: TocItem[] = [
  { id: 'ce-collections', emoji: '📁', label: 'Collections' },
  { id: 'ce-environments', emoji: '🌿', label: 'Environments' },
  { id: 'ce-history', emoji: '🕐', label: 'History' },
  { id: 'ce-auth', emoji: '🔒', label: 'Auth' },
  { id: 'ce-scripts', emoji: '📝', label: 'Scripts' },
  { id: 'ce-cookies', emoji: '🍪', label: 'Cookies' },
  { id: 'ce-timeline', emoji: '⏱️', label: 'Timeline' },
  { id: 'ce-devtools', emoji: '🛠️', label: 'DevTools' },
];

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
  const cap = (id: string) => byId[id] && <CaptureCard entry={byId[id]} />;
  return (
    <WikiScrollPage
      hero={
        <WikiHero
          emoji="🗂️"
          title="Collections, Environments & More"
          subtitle="Everything that lives around a request — folders, variables, history, auth, scripts, cookies, and the request timeline."
          chips={chips(['Collections', 'Environments', 'History', 'Auth', 'Scripts', 'Cookies'])}
        />
      }
      toc={<TocBar items={TOC_ITEMS} />}
    >
      {/* ─── Collections ──────────────────────────────────────────── */}
      <div>
        <ProtocolActivateNote
          icon={<CollectionsFolderIcon size={18} style={{ color: 'var(--color-sidebar-collections)' }} />}
          color="var(--color-sidebar-collections)"
          name="Collections, Environments & More"
          extraIcons={[
            { icon: <ClockIcon size={18} style={{ color: 'var(--color-sidebar-history)' }} />, color: 'var(--color-sidebar-history)' },
            { icon: <LayersIcon size={18} style={{ color: 'var(--color-sidebar-environments)' }} />, color: 'var(--color-sidebar-environments)' },
          ]}
          actionText="in the right sidebar — Collections, History, or Environments."
        />
      </div>

      <Divider />

      <div>
        <SectionTitle id="ce-collections" emoji="📁">Collections</SectionTitle>
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
            ['Postman v2.0/2.1', 'Right-click → Import from Postman', 'Full collection tree, headers, bodies, env vars'],
            ['OpenAPI 3.0', 'Right-click → Import from OpenAPI', 'Endpoints as requests with path params as {{param}}'],
            ['Swagger 2.0', 'Right-click → Import from OpenAPI', 'Same as OpenAPI 3.0'],
            ['HAR File', 'Right-click → Import from HAR', 'Requests grouped by domain with full headers & bodies'],
            ['Bruno', 'Right-click → Import from Bruno', 'Folder structure, .bru files, disabled entries (~ prefix)'],
            ['Insomnia', 'Right-click → Import from Insomnia', 'Workspace/request tree, environments'],
            ['Thunder Client', 'Right-click → Import from Thunder Client', 'Collection tree and saved requests'],
            ['HTTPie', 'Right-click → Import from HTTPie', 'Single requests from HTTPie command syntax'],
          ]}
        />
        <SubTitle>Export Formats</SubTitle>
        <WikiTable
          headers={['Format', 'Notes']}
          rows={[
            ['Daakia JSON', 'Native format — round-trips perfectly back into Daakia'],
            ['Postman', 'Collection v2.1-compatible JSON'],
            ['Insomnia', 'Insomnia workspace export'],
            ['Bruno (.bru)', 'Bruno\'s plain-text request format'],
            ['HTTPie', 'Command-line HTTPie syntax, one file per request'],
            ['OpenAPI 3.0', 'Reverse-generated spec from your requests'],
            ['API Docs (Markdown)', 'Human-readable Markdown documentation of the collection'],
          ]}
        />
        <Callout type="info">
          The top-level sidebar toolbar's "Export as JSON" shortcut isn't wired up yet (shows a "not implemented" toast)
          — use right-click → Export on a specific collection for the real export flow.
        </Callout>
        <SubTitle>Collection Properties</SubTitle>
        <WikiCard title="Collection-Level Settings" icon="⚙️">
          <Steps steps={[
            'Right-click a collection → <strong>Properties</strong>',
            '<strong>Variables tab</strong>: Set variables for all requests directly in this collection/folder',
            '<strong>Auth tab</strong>: Set shared auth (Bearer, Basic, OAuth) — requests directly inside inherit it',
            '<strong>Scripts tab</strong>: Pre-request and post-response scripts that run for requests directly in this collection/folder',
          ]} />
          <Callout type="warn">
            Inheritance is <strong>one level deep only</strong> — a request only inherits from the folder it's
            directly placed in, not from that folder's parent or the collection root. Nesting a request two folders
            deep does NOT walk up the chain to find auth/scripts/variables set higher up; set them on the immediate
            containing folder.
          </Callout>
        </WikiCard>
        {cap('collections-properties-variables')}
        {cap('collections-properties-authorization')}
        {cap('collections-properties-headers')}
        {cap('collections-properties-scripts')}
        <SubTitle>Collection Runner</SubTitle>
        <Steps steps={[
          'Right-click a collection → <strong>Run Collection</strong>',
          'Set optional delay between requests (ms) and toggle <strong>Stop on error</strong>',
          'Click <strong>Run</strong> — requests execute sequentially in tree order',
          'See live progress: current request, pass/fail status per request',
          'Use <strong>Stop</strong> button to abort mid-run',
        ]} />
        {cap('collections-runner-runner')}
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          A separate <strong>CLI export</strong> turns the same run into a standalone command — for running the exact
          same sequence outside VS Code, e.g. in a CI pipeline.
        </p>
        {cap('collections-runner-cli')}
        <SubTitle>Creating & Importing</SubTitle>
        {cap('collections-new-item-modal')}
        {cap('collections-import-insomnia-modal')}
        {byId['platform-sidebar-collections'] && <CaptureCard entry={byId['platform-sidebar-collections']} />}
      </div>

      <Divider />

      {/* ─── Environments ─────────────────────────────────────────── */}
      <div>
        <SectionTitle id="ce-environments" emoji="🌿">Environments & Variables</SectionTitle>
        <Callout type="tip" title="Variable Priority (Highest → Lowest)">
          Request Variables → Collection Variables → Active Environment → Global Environment
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
          ]}
        />
        <Callout type="info">
          "Global" isn't a per-variable toggle inside a normal environment — it's a whole separate, always-active{' '}
          <strong>Global</strong> environment. Variables you add there resolve everywhere without switching, which is
          why they act like app-wide constants.
        </Callout>
        <SubTitle>Script-Level Variables</SubTitle>
        <WikiTable
          headers={['API', 'Example']}
          rows={[
            ['Read var from script', <Code>dk.env.get("baseUrl")</Code>],
            ['Write var from script', <Code>dk.env.set("token", dk.response.json().token)</Code>],
            ['Collection var', <Code>dk.collectionVariables.set("id", "42")</Code>],
            ['Global var', <Code>dk.globals.set("sessionId", crypto.randomUUID())</Code>],
          ]}
        />
        <Callout type="info" title="Escape Syntax">
          Wrap in <Code>{'$daakia_'}</Code> ... <Code>{'_$'}</Code> to prevent variable substitution.
          E.g. <Code>{'$daakia_{username}_$'}</Code> sends literal text <Code>{'{{username}}'}</Code>.
        </Callout>
        {byId['platform-sidebar-environments'] && <CaptureCard entry={byId['platform-sidebar-environments']} />}
        {cap('platform-global-variables-modal')}
      </div>

      <Divider />

      {/* ─── History ──────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="ce-history" emoji="🕐">History</SectionTitle>
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
        <SectionTitle id="ce-auth" emoji="🔒">Authentication</SectionTitle>
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
          Set auth once on a collection or folder — requests placed directly inside inherit it (one level, see the
          inheritance note above). Override per-request if needed. Right-click → Properties → Auth tab.
        </Callout>
      </div>
      {cap('platform-auth-main')}

      <Divider />

      {/* ─── Scripts & Testing ────────────────────────────────────── */}
      <div>
        <SectionTitle id="ce-scripts" emoji="📝">Scripts & Testing</SectionTitle>
        <Callout type="info" title="What are Scripts?">
          JavaScript snippets that run before a request (Pre-request) or after the response (Post-response).
          Use them to set dynamic headers, chain requests, and write automated test assertions.
        </Callout>
        {cap('platform-scripts-main')}
        <SubTitle>Pre-Request Scripts</SubTitle>
        <WikiTable
          headers={['Task', 'Code Example']}
          rows={[
            ['Set env variable', <Code>{'dk.env.set("ts", Date.now().toString())'}</Code>],
            ['Read env variable', <Code>{'const host = dk.env.get("baseUrl")'}</Code>],
            ['Log something', <Code>{'console.log("Request URL:", dk.request.url)'}</Code>],
            ['Abort request', <Code>{'throw new Error("Abort: missing auth token!")'}</Code>],
            ['Set request header', <Code>{'dk.request.headers["X-Ts"] = Date.now().toString()'}</Code>],
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
            [<Code>toHaveLength(n)</Code>, 'String/array has length n'],
            [<Code>toMatchSchema(schema)</Code>, "Value matches a JSON Schema-like shape — the real way to assert a type (e.g. { type: 'array' })"],
          ]}
        />
        <SubTitle>dk.response Object</SubTitle>
        <WikiTable
          headers={['Property', 'Type', 'Value']}
          rows={[
            [<Code>dk.response.status</Code>, 'number', 'HTTP status code (200, 201, 404...)'],
            [<Code>dk.response.body</Code>, 'string', 'Raw response body as string'],
            [<Code>dk.response.json()</Code>, 'method', 'Parses body as JSON — returns null if it isn\'t valid JSON'],
            [<Code>dk.response.time</Code>, 'number', 'Total response time in milliseconds'],
            [<Code>dk.response.headers</Code>, 'object', 'Response headers as key-value map'],
            [<Code>dk.response.size</Code>, 'number', 'Response size in bytes'],
          ]}
        />
        <Callout type="warn">
          There's no <Code>daakia.*</Code> namespace — every script API is under <Code>dk.*</Code> (e.g. <Code>dk.env</Code>,{' '}
          <Code>dk.request</Code>, <Code>dk.response</Code>, <Code>dk.test</Code>, <Code>dk.expect</Code>). Methods like{' '}
          <Code>dk.setVariable</Code>, <Code>dk.fetch</Code>, or <Code>.toBeArray()</Code> that show up in older AI-generated
          scripts don't exist — use <Code>dk.env.set</Code>, <Code>dk.sendRequest({'{ url }'})</Code>, and{' '}
          <Code>toMatchSchema({'{ type: \'array\' }'})</Code> instead.
        </Callout>
        <Collapsible title="Collection-Level Scripts">
          Collection scripts run BEFORE request-level scripts (pre-request) and AFTER them (post-response).
          Order: Collection Pre → Request Pre → HTTP call → Request Post → Collection Post.
          Right-click collection → Properties → Scripts tab to set them.
        </Collapsible>
      </div>

      <Divider />

      {/* ─── Cookies ──────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="ce-cookies" emoji="🍪">Cookies</SectionTitle>
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
      {cap('platform-cookie-manager')}

      <Divider />

      {/* ─── Timeline ─────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="ce-timeline" emoji="⏱️">Timeline & Network</SectionTitle>
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
        <SectionTitle id="ce-devtools" emoji="🛠️">DevTools Panel</SectionTitle>
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
        <SubTitle>AI Insights & Performance</SubTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          Two more DevTools sub-tabs: AI Insights surfaces patterns/anomalies across recent traffic automatically,
          and Performance tracks the extension's own memory footprint and timing — separate from any single
          request's Timeline tab.
        </p>
        {cap('devtools-ai-insights')}
        {cap('devtools-performance')}
      </div>
    </WikiScrollPage>
  );
}
