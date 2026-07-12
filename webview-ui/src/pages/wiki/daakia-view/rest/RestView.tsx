import { WikiScrollPage, CaptureCard } from '../capture/CaptureScrollView';
import { WikiHero, SubTitle, FeatureGrid, Callout, WikiTable, Code, Collapsible, Badge, chips } from '../shared/WikiShared';
import { REST_CAPTURES } from './captures';

export function RestView() {
  const byId = Object.fromEntries(REST_CAPTURES.map(c => [c.id, c]));
  return (
    <WikiScrollPage hero={
      <WikiHero
        emoji="📡"
        title="REST API Client"
        subtitle="Build and send GET/POST/PUT/PATCH/DELETE requests with full params, headers, body, auth, scripting, and response inspection."
        chips={chips(['Params', 'Headers', 'Body', 'Auth', 'Scripts', 'Response'])}
      />
    }>
      <div>
        <SubTitle>URL Bar & Methods</SubTitle>
        <WikiTable
          headers={['Method', 'Color', 'Common Use']}
          rows={[
            [<Badge variant="ok">GET</Badge>, 'Green', 'Fetch data — no body required'],
            [<Badge variant="warn">POST</Badge>, 'Amber', 'Create resources, send JSON/form body'],
            [<Badge variant="rest">PUT</Badge>, 'Blue', 'Replace entire resource'],
            [<Badge variant="ai">PATCH</Badge>, 'Purple', 'Partial update to a resource'],
            [<span className="dw-badge warn">DELETE</span>, 'Red', 'Remove a resource'],
            ['HEAD / OPTIONS', 'Gray', 'Metadata checks and CORS preflight'],
          ]}
        />
        <SubTitle>Request Config Tabs</SubTitle>
        <FeatureGrid items={[
          { emoji: '🔗', title: 'Params', desc: 'Query params with enable/disable toggle. Badge shows count.' },
          { emoji: '📋', title: 'Headers', desc: 'Key-Value table with autocomplete. AI can suggest headers.' },
          { emoji: '📦', title: 'Body', desc: 'JSON, XML, Form-data, URL-encoded, Raw, Binary, GraphQL modes' },
          { emoji: '🔒', title: 'Auth', desc: 'Bearer, Basic, API Key, OAuth 2.0 (Client Credentials + Auth Code)' },
          { emoji: '📜', title: 'Scripts', desc: 'Pre-request and Post-response JavaScript scripts' },
          { emoji: '🔤', title: 'Variables', desc: 'Request-level variable overrides (highest priority)' },
        ]} />
      </div>

      {byId['rest-params'] && <CaptureCard entry={byId['rest-params']} />}
      {byId['rest-headers'] && <CaptureCard entry={byId['rest-headers']} />}
      {byId['rest-body-json'] && <CaptureCard entry={byId['rest-body-json']} />}

      <Collapsible title="Body Modes Explained">
        <WikiTable
          headers={['Mode', 'Use Case']}
          rows={[
            ['JSON', 'application/json — Monaco editor with syntax highlighting'],
            ['Raw', 'Custom content-type: XML, YAML, plain text, HTML'],
            ['Form Data', 'multipart/form-data — supports file uploads'],
            ['URL Encoded', 'application/x-www-form-urlencoded — key=value&key2=value2'],
            ['Binary', 'Upload a single file as raw body bytes'],
            ['GraphQL', 'GraphQL query + variables — sends as JSON with {"query":"..."}'],
          ]}
        />
      </Collapsible>

      {byId['rest-auth'] && <CaptureCard entry={byId['rest-auth']} />}
      {byId['rest-scripts'] && <CaptureCard entry={byId['rest-scripts']} />}
      {byId['rest-variables'] && <CaptureCard entry={byId['rest-variables']} />}

      <div>
        <SubTitle>Response Panel Tabs</SubTitle>
        <FeatureGrid items={[
          { emoji: '📄', title: 'Body', desc: 'Pretty-printed JSON, XML, or raw text with syntax highlight. Copy button.' },
          { emoji: '📋', title: 'Headers', desc: 'All response headers as key-value pairs.' },
          { emoji: '⏱️', title: 'Timeline', desc: 'DNS, TCP, TLS, TTFB, and download phase timings with visual bars.' },
          { emoji: '🍪', title: 'Cookies', desc: 'Cookies set by the response — name, value, domain, expiry.' },
          { emoji: '✅', title: 'Tests', desc: 'Script assertion results — pass/fail with details.' },
          { emoji: '📊', title: 'Network Logs', desc: 'Actual sent headers, content-type, boundary strings.' },
        ]} />
      </div>

      {byId['rest-response'] && <CaptureCard entry={byId['rest-response']} />}

      <div>
        <SubTitle>Send Actions</SubTitle>
        <WikiTable
          headers={['Action', 'How']}
          rows={[
            ['Send request', 'Main Send button or Ctrl+Enter'],
            ['Send & Download', 'Click ▾ arrow next to Send → "Send & Download" — saves response to file'],
            ['Import cURL', 'Click ▾ arrow → "Import cURL" — paste curl command to fill tab'],
            ['Show Code', 'Click ▾ arrow → "Show Code" — generate curl, JS, Python, Go, Java etc.'],
            ['Clear All', 'Click ▾ arrow → "Clear All" — resets tab to blank state'],
          ]}
        />
        <Callout type="info" title="Variable Highlighting">
          Type <Code>{'{{variableName}}'}</Code> anywhere — URL, headers, body — and it highlights in blue when the variable exists in the active environment.
          Use <Code>{'$daakia_{varName}_$'}</Code> to send the literal <Code>{'{{...}}'}</Code> text without substitution.
        </Callout>
      </div>
    </WikiScrollPage>
  );
}
