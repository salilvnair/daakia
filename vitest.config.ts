import { SHARED_ALIASES } from './webview-ui/shared-aliases';

/**
 * Root test config.
 *
 * It exists for one reason: some host tests import the webview's
 * `prompt-template.ts` to check that the Prompt Library and the extension host
 * agree about what a prompt is. That file reaches the shared dk8s prompt module
 * through an alias, so the runner has to know the alias too.
 *
 * The alias is defined once, in `webview-ui/shared-aliases.ts`, and imported by
 * all three configs — the app build, the webview tests, and this one.
 *
 * Exported as a plain object rather than through `defineConfig`: vitest is not
 * a dependency of the root package (it is run from the webview's install), so
 * importing `vitest/config` here fails to resolve.
 */
export default {
  resolve: { alias: SHARED_ALIASES },
  test: {
    /*
      `.test.ts` only. The `.mjs` files under src/test/fixtures are standalone
      scripts that end in `process.exit(0)` — vitest treats a process.exit
      inside a test file as a crash, so collecting them reports two dozen
      failures for scripts that are in fact passing. They are run directly,
      not through vitest.
    */
    include: ['src/**/*.test.ts'],
    /*
      `src/test/suite` is the VS Code integration suite: mocha tests that
      `import 'vscode'`, which only resolves inside a real extension host. They
      run through `npm run test:e2e`. Collected here they fail to import and
      report fifteen red files beside the unit tests that actually ran, which
      is how a green suite starts getting ignored.
    */
    exclude: ['**/node_modules/**', 'src/test/suite/**'],
  },
};
