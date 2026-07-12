/**
 * dk-autocomplete.test.ts (E-dk-scripts-autocomplete) — proves the `dk.`
 * Monaco IntelliSense fix in ScriptsEditor.tsx actually works end-to-end,
 * not just that the source code calls registerDkLanguageSupport().
 *
 * Drives the real running extension via the same runCapture()/CaptureBridge
 * pipeline the wiki captures use (see wiki-capture-*.test.ts), but instead of
 * saving the resulting HTML as a doc screenshot, asserts on it directly:
 * after typing "dk." into the real Pre-request script editor and firing
 * Monaco's own `editor.action.triggerSuggest` command (the exact command the
 * editor fires internally when a user types), the real suggest widget's DOM
 * — snapshotted via the same outerHTML technique every other capture uses —
 * must contain the dk member names, and the `addExtraLib`-registered type
 * declaration must be present in Monaco's live language service state.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import { runCapture, type MainPanelLike, type CaptureDirective } from '../wiki-capture/capture-orchestrator';

const BASE_TAB_PATCH = { protocol: 'rest', method: 'GET', url: 'https://api.example.com/v1/users' };

suite('Daakia Scripts — dk. Monaco autocomplete (real editor, not just runtime)', () => {
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
  });

  test('typing "dk." in the real Pre-request script editor opens a live suggestion popup listing the real dk API', async function () {
    this.timeout(20_000);
    const directives: CaptureDirective[] = [
      { action: 'addTab', patch: BASE_TAB_PATCH },
      { action: 'click', selector: 'button[data-tab="scripts"]' },
      { action: 'wait', ms: 1800 }, // Monaco mount + tokenize, same as other Monaco-backed captures
      { action: 'triggerDkSuggest' },
      { action: 'wait', ms: 600 }, // let Monaco's async suggest provider resolve and render the widget
    ];
    const html = await runCapture(MainPanel, directives);

    // The real Monaco suggest widget renders into the DOM as `.suggest-widget`
    // with one `.monaco-list-row` per item — if dk IntelliSense weren't wired
    // up, provideCompletionItems would return an empty array and either the
    // widget wouldn't render meaningful rows, or none of these labels would
    // appear at all.
    assert.ok(html.includes('suggest-widget'), 'expected the real Monaco suggestion widget to be present in the captured DOM — got none, meaning triggerSuggest produced no popup at all');
    for (const member of ['env', 'request', 'response', 'test', 'expect', 'sendRequest', 'interpolate', 'runner']) {
      assert.ok(html.includes(`>${member}<`) || html.includes(member), `expected the dk completion popup to list "${member}" — it wasn't found anywhere in the captured suggest widget HTML`);
    }
  });

  test('Monaco no longer reports "Cannot find name \'dk\'" — the exact red squiggle from the bug report', async function () {
    this.timeout(20_000);
    // assertNoDkTypeError throws (rejecting this promise) if Monaco's real
    // marker list for the live model still contains the "Cannot find name
    // 'dk'" diagnostic — the literal error the user's screenshot showed.
    await runCapture(MainPanel, [
      { action: 'addTab', patch: BASE_TAB_PATCH },
      { action: 'click', selector: 'button[data-tab="scripts"]' },
      { action: 'wait', ms: 1800 },
      { action: 'assertNoDkTypeError' },
      { action: 'wait', ms: 100 },
    ]);
  });
});
