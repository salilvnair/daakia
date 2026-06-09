/**
 * VS Code Extension Integration Test Runner (7.9)
 * Runs tests inside a VS Code instance using @vscode/test-electron.
 *
 * Run with: npm run test:e2e
 */
import * as path from 'path';

async function main() {
  try {
    // Dynamically import to avoid compile errors if package not installed
    const { runTests } = await import('@vscode/test-electron');

    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: ['--disable-extensions'],
    });
  } catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  }
}

main();
