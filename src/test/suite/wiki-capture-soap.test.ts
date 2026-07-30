/**
 * SOAP wiki captures — see wiki-capture-rest.test.ts for the pattern.
 * Now includes populated response envelope for the Body/Headers/Tests
 * response sub-tabs, and covers Form / Headers / WS-Security / Attachments /
 * Assertions / Scripts / WSDL sub-tabs so the wiki reflects every real tab.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { runCapture, type MainPanelLike, type CaptureDirective } from '../wiki-capture/capture-orchestrator';

interface ScreenSpec { id: string; label: string; explanation: string; directives: CaptureDirective[] }

const OUT_DIR = path.resolve(__dirname, '../../../plan/daakia_live/soap');

const ENVELOPE = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="http://mock.daakia.io/weather">
  <soap:Body>
    <tns:GetWeather>
      <tns:city>New York</tns:city>
    </tns:GetWeather>
  </soap:Body>
</soap:Envelope>`;

const RESPONSE_ENVELOPE = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="http://mock.daakia.io/weather">
  <soap:Body>
    <tns:GetWeatherResponse>
      <tns:city>New York</tns:city>
      <tns:temperature>72</tns:temperature>
      <tns:conditions>Partly Cloudy</tns:conditions>
      <tns:humidity>58</tns:humidity>
    </tns:GetWeatherResponse>
  </soap:Body>
</soap:Envelope>`;

const BASE_PATCH = {
  protocol: 'soap',
  url: 'https://api.example.com/weather.asmx',
  soapVersion: '1.1' as const,
  soapAction: 'http://mock.daakia.io/weather/GetWeather',
  soapEnvelope: ENVELOPE,
};

const RESPONSE_PATCH = {
  ...BASE_PATCH,
  response: {
    status: 200,
    statusText: 'OK',
    headers: {
      'content-type': 'text/xml;charset=UTF-8',
      'content-length': String(RESPONSE_ENVELOPE.length),
      'server': 'Microsoft-IIS/10.0',
      'x-powered-by': 'ASP.NET',
    },
    body: RESPONSE_ENVELOPE,
    size: RESPONSE_ENVELOPE.length,
    time: 137,
    contentType: 'text/xml',
    cookies: [],
  },
  scriptTestResults: [
    { name: 'No soap:Fault', passed: true, error: undefined },
    { name: 'temperature is numeric', passed: true, error: undefined },
  ],
  soapAssertions: [
    { id: 'a1', type: 'xpath', expression: '//temperature', expected: '72', enabled: true, passed: true },
    { id: 'a2', type: 'schema', expression: '', expected: '', enabled: true, passed: true },
    { id: 'a3', type: 'responseTime', expression: '', expected: '500', enabled: true, passed: true },
  ],
};

const SCREENS: ScreenSpec[] = [
  { id: 'soap-envelope', label: 'SOAP — Envelope',
    explanation: 'Raw SOAP envelope XML editor — full control over the request body, with SOAPAction header and version (1.1/1.2) selectors.',
    directives: [ { action: 'addTab', patch: BASE_PATCH }, { action: 'click', selector: 'button[data-tab="envelope"]' }, { action: 'wait', ms: 1800 } ] },
  { id: 'soap-form', label: 'SOAP — Form',
    explanation: "Schema-driven form inputs generated from the WSDL operation's input schema — syncs back into the Envelope tab.",
    directives: [ { action: 'addTab', patch: BASE_PATCH }, { action: 'click', selector: 'button[data-tab="form"]' }, { action: 'wait', ms: 600 } ] },
  { id: 'soap-headers', label: 'SOAP — Headers',
    explanation: "Custom HTTP headers applied on top of Daakia's auto-set Content-Type/SOAPAction/Content-Length.",
    directives: [ { action: 'addTab', patch: { ...BASE_PATCH, headers: [ { id: 'h1', key: 'X-Client-Id', value: 'daakia-wiki-demo', enabled: true }, { id: 'h2', key: 'X-Correlation-Id', value: '{{$random.uuid}}', enabled: true } ] } }, { action: 'click', selector: 'button[data-tab="headers"]' }, { action: 'wait', ms: 600 } ] },
  { id: 'soap-wssecurity', label: 'SOAP — WS-Security',
    explanation: 'UsernameToken WS-Security block builder — PasswordText/PasswordDigest, Nonce/Created/Timestamp toggles; Generate & Inject writes a real <wsse:Security> block.',
    directives: [ { action: 'addTab', patch: { ...BASE_PATCH, soapWsSecurity: { enabled: true, username: 'demo', password: 'demo-pass', passwordType: 'PasswordDigest', addNonce: true, addCreated: true, addTimestamp: true, timestampTtl: 300 } } }, { action: 'click', selector: 'button[data-tab="wssecurity"]' }, { action: 'wait', ms: 600 } ] },
  { id: 'soap-authorization', label: 'SOAP — Authorization',
    explanation: 'HTTP-level auth (Bearer, Basic, API Key, OAuth 2.0) — separate from WS-Security. Some services need both.',
    directives: [ { action: 'addTab', patch: { ...BASE_PATCH, authType: 'basic', authData: { username: 'demo', password: 'demo-password' } } }, { action: 'click', selector: 'button[data-tab="auth"]' }, { action: 'wait', ms: 600 } ] },
  { id: 'soap-attachments', label: 'SOAP — Attachments',
    explanation: 'MTOM/SwA binary attachments — real files sent alongside the XML envelope.',
    directives: [ { action: 'addTab', patch: BASE_PATCH }, { action: 'click', selector: 'button[data-tab="attachments"]' }, { action: 'wait', ms: 600 } ] },
  { id: 'soap-assertions', label: 'SOAP — Assertions',
    explanation: 'Post-response assertions — XPath Match (expression + expected value), Schema Valid, and Response Time.',
    directives: [ { action: 'addTab', patch: RESPONSE_PATCH }, { action: 'click', selector: 'button[data-tab="assertions"]' }, { action: 'wait', ms: 600 } ] },
  { id: 'soap-scripts', label: 'SOAP — Scripts',
    explanation: 'Pre-request / Post-response script editors — same dk.* runtime as every other protocol.',
    directives: [ { action: 'addTab', patch: { ...BASE_PATCH, preRequestScript: '// Set a dynamic Client-Id header\ndk.request.headers["X-Client-Id"] = "daakia-" + Date.now();', postResponseScript: 'dk.test("No SOAP Fault", () => {\n  dk.expect(dk.response.body).not.toContain("soap:Fault");\n});' } }, { action: 'click', selector: 'button[data-tab="scripts"]' }, { action: 'wait', ms: 1800 } ] },
  { id: 'soap-wsdl', label: 'SOAP — WSDL Browser',
    explanation: 'The parsed WSDL tree — services, ports, operations, message types — browse it after importing a WSDL.',
    directives: [ { action: 'addTab', patch: BASE_PATCH }, { action: 'click', selector: 'button[data-tab="wsdl"]' }, { action: 'wait', ms: 600 } ] },
  // Response-side sub-tabs (with populated envelope + real assertions + tests)
  { id: 'soap-response-body', label: 'SOAP — Response Body',
    explanation: 'The raw XML response envelope, pretty-printed — soap:Fault errors render here too, not as a separate error state.',
    directives: [ { action: 'addTab', patch: RESPONSE_PATCH }, { action: 'setResponseSubtab', responseProtocol: 'soap', subtab: 'body' }, { action: 'wait', ms: 1800 } ] },
  { id: 'soap-response-headers', label: 'SOAP — Response Headers',
    explanation: 'HTTP response headers that came back with the SOAP envelope.',
    directives: [ { action: 'addTab', patch: RESPONSE_PATCH }, { action: 'setResponseSubtab', responseProtocol: 'soap', subtab: 'headers' }, { action: 'wait', ms: 600 } ] },
  { id: 'soap-response-tests', label: 'SOAP — Response Tests',
    explanation: 'Combined results — Assertions tab XPath/Schema/Response-Time checks AND any Post-response dk.test() results.',
    directives: [ { action: 'addTab', patch: RESPONSE_PATCH }, { action: 'setResponseSubtab', responseProtocol: 'soap', subtab: 'tests' }, { action: 'wait', ms: 600 } ] },
];

suite('Daakia Wiki Capture — SOAP', () => {
  let MainPanel: MainPanelLike;

  suiteSetup(async function () {
    this.timeout(20_000);
    const ext = vscode.extensions.getExtension('salilvnair.daakia');
    if (!ext) throw new Error('extension not found');
    const exports = ext.isActive ? ext.exports : await ext.activate();
    MainPanel = exports.MainPanel as MainPanelLike;
    if (!MainPanel.currentPanel) await vscode.commands.executeCommand('daakia.openPanel');
    for (let i = 0; i < 40 && !MainPanel.currentPanel; i++) await new Promise(r => setTimeout(r, 250));
    if (!MainPanel.currentPanel) throw new Error('MainPanel.currentPanel never became available');
    await new Promise(r => setTimeout(r, 2500));
    fs.mkdirSync(OUT_DIR, { recursive: true });
  });

  const manifest: Array<{ id: string; label: string; explanation: string; file: string }> = [];

  for (const screen of SCREENS) {
    test(`capture ${screen.id}`, async function () {
      this.timeout(20_000);
      const html = await runCapture(MainPanel, screen.directives);
      if (html.length < 200) throw new Error(`${screen.id}: captured HTML looks too small (${html.length} chars)`);
      const file = `${screen.id}.html`;
      fs.writeFileSync(path.join(OUT_DIR, file), html, 'utf-8');
      manifest.push({ id: screen.id, label: screen.label, explanation: screen.explanation, file });
    });
  }

  // Merge into the existing manifest rather than overwriting it — this test file
  // may only cover a subset of the screens that end up in manifest.json (others
  // were added by a different test file, or copied in directly); overwriting
  // would silently delete every entry this run didn't touch.
  suiteTeardown(() => {
    if (manifest.length === 0) return;
    const manifestPath = path.join(OUT_DIR, 'manifest.json');
    let existing: Array<{ id: string; label: string; explanation: string; file: string }> = [];
    if (fs.existsSync(manifestPath)) {
      try { existing = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')); } catch { existing = []; }
    }
    const byId = new Map(existing.map(e => [e.id, e]));
    for (const e of manifest) byId.set(e.id, e);
    fs.writeFileSync(manifestPath, JSON.stringify(Array.from(byId.values()), null, 2), 'utf-8');
  });
});
