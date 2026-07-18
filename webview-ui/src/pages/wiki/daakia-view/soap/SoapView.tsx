import { WikiScrollPage, CaptureCard } from '../capture/CaptureScrollView';
import {
  WikiHero, SectionTitle, SubTitle, Steps, Callout, WikiTable, WikiCard,
  Code, CodeBlock, Collapsible, Divider, ProtocolActivateNote, chips, TocBar, type TocItem,
} from '../shared/WikiShared';
import { ProtocolSoapBadge } from '../../../../icons';
import { SOAP_CAPTURES } from './captures';

const TOC_ITEMS: TocItem[] = [
  { id: 'soap-protocol', emoji: '📖', label: 'What is SOAP?' },
  { id: 'soap-tabs', emoji: '🪪', label: 'Request Tabs' },
  { id: 'soap-wsdl', emoji: '📥', label: 'WSDL Import' },
  { id: 'soap-security', emoji: '🔐', label: 'WS-Security' },
  { id: 'soap-attachments', emoji: '📎', label: 'Attachments' },
  { id: 'soap-scripts', emoji: '📜', label: 'Scripts' },
  { id: 'soap-assertions', emoji: '✅', label: 'Assertions' },
  { id: 'soap-versions', emoji: '🔀', label: 'SOAP 1.1 vs 1.2' },
  { id: 'soap-response', emoji: '📥', label: 'Response' },
  { id: 'soap-tips', emoji: '💡', label: 'Tips' },
];

export function SoapView() {
  const byId = Object.fromEntries(SOAP_CAPTURES.map(c => [c.id, c]));
  const cap = (id: string) => byId[id] && <CaptureCard entry={byId[id]} />;
  return (
    <WikiScrollPage
      hero={
        <WikiHero
          emoji="🪪"
          title="SOAP Client"
          subtitle="XML envelopes, WS-Security, WSDL import, attachments, and XPath response assertions."
          chips={chips(['Envelope', 'WS-Security', 'WSDL', 'Assertions', 'Attachments'])}
        />
      }
      toc={<TocBar items={TOC_ITEMS} />}
    >
      <div>
        <ProtocolActivateNote icon={<ProtocolSoapBadge size={20} />} color="var(--color-protocol-soap)" name="SOAP" />
      </div>

      <Divider />

      <div>
        <SectionTitle id="soap-protocol" emoji="📖">What is SOAP?</SectionTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          <strong>SOAP</strong> (Simple Object Access Protocol) is an XML-based messaging protocol for exchanging
          structured information between applications, standardized by the W3C. Where REST treats HTTP itself as
          the protocol (methods, status codes, URLs all carry meaning), SOAP treats HTTP as just a{' '}
          <em>transport</em> — nearly every real-world SOAP call is an HTTP POST, but the actual protocol semantics
          (what operation to call, what arguments, what came back, whether it failed) all live inside the XML{' '}
          <strong>envelope</strong> in the body, not in the HTTP layer. That's also why SOAP isn't tied to HTTP at
          all in principle — the spec allows SMTP or other transports too, though HTTP dominates in practice.
        </p>
        <SubTitle>The envelope structure</SubTitle>
        <WikiTable
          headers={['Element', 'Required?', 'Purpose']}
          rows={[
            ['Envelope', 'Yes', 'The root element — identifies the whole document as a SOAP message and declares the XML namespace (which differs between SOAP 1.1 and 1.2)'],
            ['Header', 'No', 'Optional metadata processed before the Body — auth tokens, WS-Security, routing info, transaction IDs'],
            ['Body', 'Yes', 'The actual payload — the operation call and its arguments, or the operation\'s response'],
            ['Fault', 'No (inside Body)', 'How SOAP reports errors — a structured element inside Body instead of relying on the HTTP status code'],
          ]}
        />
        <CodeBlock label="A real SOAP 1.1 request envelope" lang="xml">
{`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
    <AuthToken xmlns="http://example.com/auth">eyJhbGciOiJIUzI1NiJ9.mock_token</AuthToken>
  </soap:Header>
  <soap:Body>
    <GetUserById xmlns="http://example.com/users">
      <UserId>42</UserId>
    </GetUserById>
  </soap:Body>
</soap:Envelope>`}
        </CodeBlock>
        <CodeBlock label="The matching response envelope" lang="xml">
{`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetUserByIdResponse xmlns="http://example.com/users">
      <User>
        <Id>42</Id>
        <Name>Alice Johnson</Name>
        <Email>alice@example.com</Email>
      </User>
    </GetUserByIdResponse>
  </soap:Body>
</soap:Envelope>`}
        </CodeBlock>
        <SubTitle>WSDL — how a client knows what to send</SubTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          A SOAP service publishes a <strong>WSDL</strong> (Web Services Description Language) document — its own
          XML file describing every operation, the exact shape of each request/response message, the data types
          involved, and the URL to send calls to. It's the SOAP equivalent of a GraphQL schema or an OpenAPI spec:
          machine-readable enough that a tool can read it and generate a working client without a human writing the
          envelope by hand — exactly what Daakia's <strong>WSDL Import</strong> below does, turning a WSDL operation
          straight into a skeleton envelope.
        </p>
        <Callout type="tip">
          A SOAP <strong>Fault</strong> (the error-reporting element inside Body) is why a SOAP call can come back
          with HTTP <Code>200 OK</Code> and still represent a failure — same class of "check the body, not just the
          status code" behavior as GraphQL's <Code>errors</Code> array, for a completely different historical reason.
        </Callout>
      </div>

      <Divider />

      <div>
        <SectionTitle id="soap-tabs" emoji="🪪">Request Config Tabs</SectionTitle>
        <WikiTable
          headers={['Tab', 'What it does']}
          rows={[
            ['Envelope', 'Monaco XML editor — write your SOAP 1.1/1.2 envelope here'],
            ['Form', 'Schema-driven form inputs (generated from WSDL operation schema) — syncs back into Envelope'],
            ['Headers', 'Custom HTTP headers (same KeyValueTable as REST) — applied on top of Daakia\'s auto-set ones'],
            ['WS-Security', 'Configure UsernameToken (PasswordText / PasswordDigest), Nonce, Created, Timestamp'],
            ['Auth', 'HTTP-level auth (Bearer, Basic, API Key, OAuth 2.0 — same as REST), separate from WS-Security'],
            ['Attachments', 'MTOM/SwA binary file attachments alongside the envelope'],
            ['Assertions', 'XPath Match, Schema Valid, and Response Time — run after response'],
            ['Scripts', 'Pre/post JavaScript, same dk.* runtime as every other protocol'],
            ['WSDL', 'Browse the parsed WSDL tree structure'],
          ]}
        />
        <SubTitle>What Daakia Auto-Populates for You</SubTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          SOAP has its own request executor (separate from REST's) that sets these before your Headers tab rows are
          applied on top:
        </p>
        <WikiTable
          headers={['Header', 'SOAP 1.1', 'SOAP 1.2']}
          rows={[
            ['Content-Type', <Code>{'text/xml;charset=UTF-8'}</Code>, <Code>{'application/soap+xml;charset=UTF-8;action="..."'}</Code>],
            ['SOAPAction', 'Separate header, always set', 'Not sent — the action is embedded in Content-Type instead'],
            ['Content-Length', 'Auto-calculated from the envelope body', 'Auto-calculated from the envelope body'],
          ]}
        />
      </div>
      {cap('soap-envelope')}
      {cap('soap-form')}
      {cap('soap-headers')}

      {/* ── WSDL ──────────────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="soap-wsdl" emoji="📥">WSDL Import & Operation Selector</SectionTitle>
        <Steps steps={[
          'Click the <strong>WSDL</strong> button in the URL bar',
          'Enter a WSDL URL (e.g. http://www.dneonline.com/calculator.asmx?WSDL) → Load, or upload a local .wsdl file',
          'The endpoint URL auto-fills from the first port address in the WSDL, and the full operations tree loads',
          'The Operation Selector appears below the URL bar — pick service, port, and operation',
          'The Envelope tab is replaced with a real skeleton XML built from that operation\'s input schema (fields filled with <Code>?</Code> placeholders)',
        ]} />
        <Callout type="info">
          A separate <strong>"Import to Collection"</strong> action (in the WSDL import dialog) goes further — it creates
          one saved collection request per WSDL operation, each with its own pre-built envelope and headers, instead of
          just loading one operation into the live tab.
        </Callout>
      </div>
      {cap('soap-wsdl')}

      <Divider />

      {/* ── WS-Security ───────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="soap-security" emoji="🔐">WS-Security</SectionTitle>
        <WikiCard title="UsernameToken, real fields" icon="🔐">
          <Steps steps={[
            'Go to <strong>WS-Security</strong> tab → toggle Enable',
            'Enter username + password, choose <Code>PasswordText</Code> or <Code>PasswordDigest</Code> as the password type',
            'Toggle <strong>Add Nonce</strong>, <strong>Add Created</strong>, and <strong>Add Timestamp</strong> independently — Created and Timestamp are separate flags, not one setting',
            'Set a Timestamp TTL if Add Timestamp is on → click <strong>Generate & Inject</strong>',
          ]} />
          <Callout type="ok">
            The envelope's {'<soap:Header>'} gets a complete {'<wsse:Security>'} block with UsernameToken, the chosen
            password type, and whichever of Nonce/Created/Timestamp you enabled.
          </Callout>
        </WikiCard>
      </div>
      {cap('soap-wssecurity')}

      <div>
        <SubTitle>HTTP-Level Authorization</SubTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          A separate tab from WS-Security — this is transport-level auth (Bearer, Basic, API Key, OAuth 2.0), the same
          AuthEditor REST uses. Some services need both at once: HTTP auth to reach the endpoint, WS-Security inside
          the envelope for the SOAP service itself.
        </p>
      </div>
      {cap('soap-authorization')}
      {cap('soap-auth')}

      <Divider />

      {/* ── Attachments ───────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="soap-attachments" emoji="📎">Attachments</SectionTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          MTOM/SwA binary attachments — pick real files to send alongside the XML envelope, for services that expect
          large payloads (documents, images) sent as multipart attachments rather than base64-inlined in the XML.
        </p>
      </div>
      {cap('soap-attachments')}

      <Divider />

      {/* ── Scripts ───────────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="soap-scripts" emoji="📜">Scripts</SectionTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          Same <Code>dk.*</Code> Pre-request/Post-response runtime as REST — useful for injecting a fresh WS-Security
          timestamp or asserting on the parsed XML response:
        </p>
        <CodeBlock label="Post-response — assert no soap:Fault came back">
{`dk.test('No SOAP Fault', () => {
  dk.expect(dk.response.body).not.toContain('soap:Fault');
});`}
        </CodeBlock>
      </div>
      {cap('soap-scripts')}

      <Divider />

      {/* ── Assertions ────────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="soap-assertions" emoji="✅">Assertions</SectionTitle>
        <WikiTable
          headers={['Type', 'Expression', 'Pass Condition']}
          rows={[
            ['XPath Match', '//AddResult', 'XPath exists and matches expected value'],
            ['Schema Valid', '(optional element name)', 'Response has valid SOAP Envelope and Body'],
            ['Response Time', '<threshold ms>', 'Response time is under threshold'],
          ]}
        />
      </div>
      {cap('soap-assertions')}

      <div>
        <SectionTitle id="soap-versions" emoji="🔀">SOAP 1.1 vs 1.2</SectionTitle>
        <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          There's no separate content-type dropdown like REST's Body tab — just a 2-value <Code>1.1</Code> /{' '}
          <Code>1.2</Code> version switch in the URL bar next to the endpoint, and Daakia derives everything else from it:
        </p>
        <WikiTable
          headers={['Feature', 'SOAP 1.1', 'SOAP 1.2']}
          rows={[
            ['Content-Type', 'text/xml;charset=UTF-8', 'application/soap+xml;charset=UTF-8;action="..."'],
            ['SOAPAction', 'Separate HTTP header', 'Embedded in Content-Type (action= param) — no separate header sent'],
            ['Envelope namespace', 'http://schemas.xmlsoap.org/soap/envelope/', 'http://www.w3.org/2003/05/soap-envelope'],
            ['Error element', 'soap:Fault', 'soap:Fault (same element, different internal structure)'],
          ]}
        />
        <Callout type="tip">
          Import SoapUI project XML files to bring in all your existing services, interfaces, and request envelopes instantly.
        </Callout>
      </div>

      <Divider />

      {/* ── Response ──────────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="soap-response" emoji="📥">Response Panel</SectionTitle>
        <WikiTable
          headers={['Tab', 'Answers']}
          rows={[
            ['Body', 'The raw XML response envelope, pretty-printed — soap:Fault errors render here too, not a separate error state'],
            ['Headers', 'What HTTP headers came back with the envelope?'],
            ['Tests', 'Combined results — both the Assertions tab checks and any Post-response dk.test() results'],
          ]}
        />
        <Callout type="tip">
          Explain, Follow-ups, WSDL Explainer ✦, and SOAP → REST Migrator ✦ in the response/URL-bar toolbars are the
          exact same <Code>xs</Code>-sized, <Code>var(--color-protocol-ai)</Code>-colored buttons as every other
          protocol.
        </Callout>
      </div>
      {cap('soap-response-body')}
      {cap('soap-response-headers')}
      {cap('soap-response-tests')}

      <Divider />

      {/* ── Tips ──────────────────────────────────────────────────────── */}
      <div>
        <SectionTitle id="soap-tips" emoji="💡">Tips & Troubleshooting</SectionTitle>
        <Collapsible title="📥 WSDL import fails or shows no operations">
          <p className="text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
            Confirm the URL actually returns a WSDL document (try opening it in a browser first) — some services
            require <Code>?wsdl</Code> in a specific case, or auth headers before the WSDL itself is even reachable.
          </p>
        </Collapsible>
        <Collapsible title="🔐 Server rejects the request with a security fault">
          <p className="text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
            Check whether the service expects <Code>PasswordDigest</Code> instead of <Code>PasswordText</Code>, and
            whether it requires a <Code>Timestamp</Code> element — some strict WS-Security servers reject requests
            without one even if the password itself is correct.
          </p>
        </Collapsible>
        <Collapsible title="✅ XPath assertion never matches">
          <p className="text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
            SOAP responses are namespaced — a bare <Code>//AddResult</Code> can fail to match if the server uses a
            namespace prefix. Check the Response Body tab's raw XML for the actual element name and namespace first.
          </p>
        </Collapsible>
      </div>
    </WikiScrollPage>
  );
}
