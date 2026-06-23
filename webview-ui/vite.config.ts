import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

const DUI_ROOT = resolve(__dirname, '../../dui/src/lib');

export default defineConfig({
  root: resolve(__dirname),
  base: './',
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@salilvnair/dui/theme/core': resolve(DUI_ROOT, 'theme/core.ts'),
      '@salilvnair/dui/theme/utils': resolve(DUI_ROOT, 'theme/utils.ts'),
      '@salilvnair/dui/theme/editor': resolve(DUI_ROOT, 'theme/editor.tsx'),
    },
  },
  build: {
    outDir: resolve(__dirname, '..', 'webview', 'dist'),
    emptyOutDir: true,
    assetsInlineLimit: 8192,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          'monaco-editor': ['monaco-editor'],
        },
      },
    },
  },
  plugins: [react(), tailwindcss()],
});
