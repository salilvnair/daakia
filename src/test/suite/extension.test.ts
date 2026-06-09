/**
 * Extension integration tests — 7.9
 * Tests that the extension activates, commands are registered,
 * and core services (SQLite, panel) initialize correctly.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Daakia Extension — Activation', () => {
  test('Extension is present', () => {
    const ext = vscode.extensions.getExtension('salilvnair.daakia');
    assert.ok(ext, 'Extension should be installed');
  });

  test('Extension activates without error', async () => {
    const ext = vscode.extensions.getExtension('salilvnair.daakia');
    if (ext && !ext.isActive) {
      await ext.activate();
    }
    assert.strictEqual(ext?.isActive, true, 'Extension should be active after activation');
  });

  test('daakia.openPanel command is registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('daakia.openPanel'), 'daakia.openPanel command should be registered');
  });

  test('daakia.newTab command is registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('daakia.newTab'), 'daakia.newTab command should be registered');
  });

  test('daakia.importCollection command is registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('daakia.importCollection'), 'daakia.importCollection command should be registered');
  });
});

suite('Daakia Extension — Storage', () => {
  test('SQLite DB initializes without error', async () => {
    // The extension exposes sqliteOk via the init message — we test indirectly
    // by verifying the extension activated cleanly (no thrown errors)
    const ext = vscode.extensions.getExtension('salilvnair.daakia');
    assert.ok(ext?.isActive, 'Extension must be active for SQLite to be initialized');
  });
});

suite('Daakia Extension — Webview Panel', () => {
  test('Opening panel does not throw', async () => {
    await assert.doesNotReject(
      () => vscode.commands.executeCommand('daakia.openPanel'),
      'Opening the Daakia panel should not throw'
    );
  });
});
