import { WikiScrollPage, CaptureCard } from '../capture/CaptureScrollView';
import { WikiHero, SubTitle, Steps, Callout, WikiTable, WikiCard, Badge, chips } from '../shared/WikiShared';
import { SOAP_CAPTURES } from './captures';

export function SoapView() {
  const byId = Object.fromEntries(SOAP_CAPTURES.map(c => [c.id, c]));
  return (
    <WikiScrollPage hero={
      <WikiHero
        emoji="🪪"
        title="SOAP Client"
        subtitle="XML envelopes, WS-Security, WSDL import, and XPath response assertions."
        chips={chips(['Envelope', 'WS-Security', 'WSDL', 'Assertions'])}
      />
    }>
      <div>
        <Callout type="info" title="Activate">
          Click the <Badge variant="soap">SOAP</Badge> coral icon in the left protocol rail.
        </Callout>
        <SubTitle>Request Config Tabs</SubTitle>
        <WikiTable
          headers={['Tab', 'What it does']}
          rows={[
            ['Envelope', 'Monaco XML editor — write your SOAP 1.1/1.2 envelope here'],
            ['Form', 'Schema-driven form inputs (generated from WSDL operation schema)'],
            ['Headers', 'Custom HTTP headers (same KeyValueTable as REST)'],
            ['WS-Security', 'Configure UsernameToken, PasswordDigest, Nonce, Created timestamp'],
            ['Auth', 'HTTP-level auth (Bearer, Basic — same as REST)'],
            ['Assertions', 'XPath Match and Schema Valid assertions — run after response'],
            ['Scripts', 'Pre/post JavaScript scripts'],
            ['WSDL', 'Browse the parsed WSDL tree structure'],
          ]}
        />
      </div>

      {byId['soap-envelope'] && <CaptureCard entry={byId['soap-envelope']} />}

      <div>
        <SubTitle>WSDL Import & Operation Selector</SubTitle>
        <Steps steps={[
          'Click the <strong>WSDL</strong> button in the URL bar',
          'Enter WSDL URL (e.g. http://www.dneonline.com/calculator.asmx?WSDL) → Load',
          'The Operation Selector appears below the URL bar',
          'Select service, port, and operation — URL, SOAPAction, version auto-fill',
          'Envelope tab gets a skeleton XML for the selected operation',
        ]} />

        <WikiCard title="WS-Security in 3 steps" icon="🔐">
          <Steps steps={[
            'Go to <strong>WS-Security</strong> tab → toggle Enable',
            'Enter username + password, select PasswordDigest (or PasswordText)',
            'Check Include Nonce and Include Created → click <strong>Generate & Inject</strong>',
          ]} />
          <Callout type="ok">
            The envelope's {'<soap:Header>'} gets a complete {'<wsse:Security>'} block with UsernameToken, digest, nonce, and timestamp.
          </Callout>
        </WikiCard>
      </div>

      {byId['soap-auth'] && <CaptureCard entry={byId['soap-auth']} />}

      <div>
        <SubTitle>Assertions</SubTitle>
        <WikiTable
          headers={['Type', 'Expression', 'Pass Condition']}
          rows={[
            ['XPath Match', '//AddResult', 'XPath exists and matches expected value'],
            ['Schema Valid', '(optional element name)', 'Response has valid SOAP Envelope and Body'],
            ['Response Time', '<threshold ms>', 'Response time is under threshold'],
          ]}
        />
        <SubTitle>SOAP 1.1 vs 1.2</SubTitle>
        <WikiTable
          headers={['Feature', 'SOAP 1.1', 'SOAP 1.2']}
          rows={[
            ['Content-Type', 'text/xml', 'application/soap+xml'],
            ['SOAPAction', 'Separate HTTP header', 'Embedded in Content-Type (action= param)'],
            ['Namespace', 'http://schemas.xmlsoap.org/soap/envelope/', 'http://www.w3.org/2003/05/soap-envelope'],
            ['Error element', 'soap:Fault', 'soap:Fault (same, different structure)'],
          ]}
        />
        <Callout type="tip">
          Import SoapUI project XML files to bring in all your existing services, interfaces, and request envelopes instantly.
        </Callout>
      </div>
    </WikiScrollPage>
  );
}
