/**
 * SOAP wiki captures (E-wiki-capture-soap) — see wiki-capture-rest.test.ts for the pattern.
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

const BASE_PATCH = {
  protocol: 'soap',
  url: 'https://api.example.com/weather.asmx',
  soapVersion: '1.1' as const,
  soapAction: 'http://mock.daakia.io/weather/GetWeather',
  soapEnvelope: ENVELOPE,
};

const SCREENS: ScreenSpec[] = [
  {
    id: 'soap-envelope',
    label: 'SOAP — Envelope',
    explanation: 'Raw SOAP envelope XML editor — full control over the request body, with SOAPAction header and version (1.1/1.2) selectors.',
    directives: [
      { action: 'addTab', patch: BASE_PATCH },
      { action: 'click', selector: 'button[data-tab="envelope"]' },
      { action: 'wait', ms: 1800 },
    ],
  },
  {
    id: 'soap-auth',
    label: 'SOAP — Authorization',
    explanation: 'Auth editor for SOAP calls, plus WS-Security (UsernameToken, X.509) configuration for enterprise SOAP services.',
    directives: [
      { action: 'addTab', patch: { ...BASE_PATCH, authType: 'basic', authData: { username: 'demo', password: 'demo-password' } } },
      { action: 'click', selector: 'button[data-tab="auth"]' },
      { action: 'wait', ms: 300 },
    ],
  },
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

  suiteTeardown(() => {
    if (manifest.length > 0) fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  });
});
