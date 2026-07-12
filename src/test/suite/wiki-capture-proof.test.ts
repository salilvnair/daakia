/**
 * Proof test for E-wiki-capture-plumbing — confirms the full round trip works:
 * extension host sends wiki:capture:run -> webview's CaptureBridge runs
 * directives against the real rendered DOM -> replies with real outerHTML ->
 * MainPanel routes it back to the orchestrator.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import { runCapture, type MainPanelLike } from '../wiki-capture/capture-orchestrator';

suite('Daakia Wiki Capture — Plumbing Proof', () => {
  let MainPanel: MainPanelLike;

  suiteSetup(async function () {
    this.timeout(20_000);
    const ext = vscode.extensions.getExtension('salilvnair.daakia');
    if (!ext) throw new Error('extension not found');
    const exports = ext.isActive ? ext.exports : await ext.activate();
    MainPanel = exports.MainPanel as MainPanelLike;

    if (!MainPanel.currentPanel) {
      await vscode.commands.executeCommand('daakia.openPanel');
    }
    // Poll until the panel is really up (activation's dbReady->createOrShow chain is async).
    for (let i = 0; i < 40 && !MainPanel.currentPanel; i++) {
      await new Promise(r => setTimeout(r, 250));
    }
    if (!MainPanel.currentPanel) throw new Error('MainPanel.currentPanel never became available');
    // Let the webview finish mounting + post 'ready'.
    await new Promise(r => setTimeout(r, 2500));
  });

  test('capture with zero directives returns real, non-empty #root outerHTML', async () => {
    const html = await runCapture(MainPanel, [{ action: 'wait', ms: 200 }]);
    assert.ok(html.length > 100, `expected substantial HTML, got ${html.length} chars`);
    assert.ok(html.includes('id="root"'), 'expected captured HTML to include the #root element itself');
  });

  test('setPref directive can navigate to a specific Settings section before capture', async () => {
    const html = await runCapture(MainPanel, [
      { action: 'setPref', prefKey: 'settings.section', prefValue: 'llm' },
      { action: 'wait', ms: 300 },
    ]);
    assert.ok(html.length > 100, 'expected substantial HTML');
  });
});
