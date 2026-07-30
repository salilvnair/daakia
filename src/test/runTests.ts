/**
 * VS Code Extension Integration Test Runner (7.9)
 * Runs tests inside a VS Code instance using @vscode/test-electron.
 *
 * Run with: npm run test:e2e
 */
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

async function main() {
  try {
    // Dynamically import to avoid compile errors if package not installed
    const { runTests } = await import('@vscode/test-electron');

    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    // Isolate the SQLite DB (and mock-servers.json) used by tests from the
    // developer's real, persistent Daakia data — see storage/db.ts initDb()
    // and mock/mock-server-manager.ts initMockServerManager(), which both
    // honor DAAKIA_TEST_DB_PATH. Without this, e2e tests would read/write
    // the same ~/.salilvnair/daakia-vsce/ files as a real, everyday install.
    const testDbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daakia-e2e-db-'));
    const testDbPath = path.join(testDbDir, 'daakia.db');

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      // --window-size pins the Extension Development Host to a fixed size —
      // without it, Electron reuses whatever size was last saved (varies by
      // machine/display), so the wiki captures' actual rendered width drifted
      // run-to-run. That silently broke CaptureCard's crop math (see
      // CollectionsEnvView.tsx's SIDEBAR_PANEL_CROP): its DESIGN_WIDTH=1280
      // assumption only holds if every capture really is taken at 1280px.
      launchArgs: ['--disable-extensions', '--window-size=1280,800'],
      extensionTestsEnv: { DAAKIA_TEST_DB_PATH: testDbPath },
    });

    fs.rmSync(testDbDir, { recursive: true, force: true });
  } catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  }
}

main();
