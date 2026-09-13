/// <reference types="vite/client" />

/**
 * The extension manifest's version, injected by `vite.config.ts` at build time.
 *
 * Declared rather than imported so the webview never reads the extension's
 * `package.json` at runtime — it cannot, and a version restated by hand is a
 * version that eventually disagrees with the one actually installed.
 */
declare const __APP_VERSION__: string;
