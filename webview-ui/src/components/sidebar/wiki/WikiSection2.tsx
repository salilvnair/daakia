/**
 * WikiSection2.tsx — History, Auth, Scripts & Testing, Cookies, Timeline
 */
import { SectionTitle, SubTitle, Steps, FeatureGrid, LiveRestScreen, Callout, WikiTable, Code, Collapsible, WikiCard, Divider } from './WikiShared';

// ─── History ──────────────────────────────────────────────────────────────────
export function HistorySection() {
  return (
    <div className="dw-section" id="history">
      <SectionTitle emoji="🕐">History</SectionTitle>
      <FeatureGrid items={[
        { emoji: '📋', title: 'Auto-recorded', desc: 'Every sent request is saved automatically — method, URL, status, time.' },
        { emoji: '▶️', title: 'Replay', desc: 'Click any history entry to open it in a new tab with full headers, body, and auth.' },
        { emoji: '🗑️', title: 'Clear', desc: 'Delete individual entries or clear all history at once.' },
        { emoji: '💾', title: 'Persistent', desc: 'Stored in SQLite — history survives VS Code restarts.' },
      ]} />
      <SubTitle>Settings</SubTitle>
      <WikiTable
        headers={['Setting', 'Default', 'Where']}
        rows={[
          ['Max History Entries', '500', 'Settings → General → General'],
          ['Save Response in History', 'On', 'Settings → General → General'],
        ]}
      />
      <Callout type="info">
        Replaying a history entry that had a file upload will show the original file path. If the file was moved or deleted, a red warning ⚠️ appears on the form-data row.
      </Callout>
    </div>
  );
}

// ─── Authentication ───────────────────────────────────────────────────────────
export function AuthSection() {
  return (
    <div className="dw-section" id="auth">
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

      <SubTitle>Collection-Level Auth Inheritance</SubTitle>
      <Callout type="tip">
        Set auth once at the <strong>collection</strong> level — all requests inside inherit it.
        Override per-request if needed. Right-click collection → Properties → Auth tab.
      </Callout>
    </div>
  );
}

// ─── Scripts & Testing ────────────────────────────────────────────────────────
export function ScriptsSection() {
  return (
    <div className="dw-section" id="scripts">
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

      <SubTitle>Post-Response Scripts (Test Assertions)</SubTitle>
      <div className="dw-live">
        <div className="dw-live-bar">
          <span style={{ fontSize: 10, color: 'var(--dw-muted)', fontFamily: 'monospace' }}>post-response script</span>
        </div>
        <div className="dw-live-body" style={{ color: 'var(--color-text-primary)' }}>
          <div style={{ color: '#22c55e' }}>{'// ✅ These are all passing'}</div>
          <div>{'daakia.test("Status is 200", () => {'}</div>
          <div style={{ paddingLeft: 16 }}>{'daakia.expect(daakia.response.status).toBe(200);'}</div>
          <div>{'});'}</div>
          <div style={{ marginTop: 4 }}>{'daakia.test("Response time < 1s", () => {'}</div>
          <div style={{ paddingLeft: 16 }}>{'daakia.expect(daakia.response.time).toBeLessThan(1000);'}</div>
          <div>{'});'}</div>
          <div style={{ marginTop: 4 }}>{'const body = JSON.parse(daakia.response.body);'}</div>
          <div>{'daakia.test("Has id field", () => {'}</div>
          <div style={{ paddingLeft: 16 }}>{'daakia.expect(body).toHaveProperty("id");'}</div>
          <div>{'});'}</div>
          <div style={{ marginTop: 4 }}>{'// Save token for next request'}</div>
          <div>{'daakia.environment.set("token", body.access_token);'}</div>
        </div>
        <div className="dw-live-status">
          <span className="ok">3/3 tests passed</span>
          <span className="muted">Token saved to environment</span>
        </div>
      </div>

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
  );
}

// ─── Cookies ─────────────────────────────────────────────────────────────────
export function CookiesSection() {
  return (
    <div className="dw-section" id="cookies">
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
  );
}

// ─── Timeline ─────────────────────────────────────────────────────────────────
export function TimelineSection() {
  return (
    <div className="dw-section" id="timeline">
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

      <Divider />
    </div>
  );
}
