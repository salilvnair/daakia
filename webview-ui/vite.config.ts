import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname),
  base: './',
  resolve: {
    dedupe: ['react', 'react-dom', 'monaco-editor', '@monaco-editor/react'],
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
  plugins: [react(), tailwindcss()],
});
