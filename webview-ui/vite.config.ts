import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { SHARED_ALIASES } from './shared-aliases';

/*
  The version the About screen reports.

  Read from the extension manifest at build time rather than restated in the
  webview: a version typed in two places is a version that will eventually
  disagree with itself, and the one place people check it is the screen that
  would be wrong.
*/
const MANIFEST = resolve(__dirname, '..', 'package.json');
const EXTENSION_VERSION = JSON.parse(readFileSync(MANIFEST, 'utf8')).version as string;

/**
 * Restart the dev server when the manifest's version changes.
 *
 * A config is evaluated once, when the server starts — so a dev server
 * started before a release bump goes on reporting the old version, on the one
 * screen whose job is to say which version this is, for as long as it keeps
 * running. Nothing is wrong with the build; the page is simply older than the
 * number. Watching the file turns that into a restart nobody has to know to
 * ask for.
 */
function watchManifestVersion() {
  return {
    name: 'daakia-watch-manifest-version',
    configureServer(server: { watcher: { add: (p: string) => void; on: (e: string, cb: (p: string) => void) => void }; restart: () => void }) {
      server.watcher.add(MANIFEST);
      server.watcher.on('change', (file: string) => {
        if (resolve(file) !== MANIFEST) return;
        const now = JSON.parse(readFileSync(MANIFEST, 'utf8')).version as string;
        if (now !== EXTENSION_VERSION) server.restart();
      });
    },
  };
}

export default defineConfig({
  root: resolve(__dirname),
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(EXTENSION_VERSION),
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'monaco-editor', '@monaco-editor/react'],
    alias: SHARED_ALIASES,
  },
  optimizeDeps: {
    // monaco-setup.js uses Vite-specific `?worker&inline` import suffixes —
    // esbuild's dependency prebundler doesn't understand that syntax and
    // fails outright. When @salilvnair/dui was a symlinked file: dependency
    // Vite auto-skipped prebundling it (linked packages are treated as
    // source); now that it's a real npm install it gets swept into
    // prebundling like anything else, so it needs an explicit exclude to
    // keep going through Vite's normal (worker-aware) pipeline instead.
    exclude: ['@salilvnair/dui'],
  },
  build: {
    outDir: resolve(__dirname, '..', 'webview', 'dist'),
    emptyOutDir: true,
    assetsInlineLimit: 8192,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        main:    resolve(__dirname, 'index.html'),
        sidebar: resolve(__dirname, 'sidebar.html'),
      },
      output: {
        manualChunks: {
          'monaco-editor': ['monaco-editor'],
        },
      },
    },
  },
  plugins: [react(), tailwindcss(), watchManifestVersion()],
});
