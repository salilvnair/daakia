import { defineConfig } from 'vitest/config';
import { SHARED_ALIASES } from './shared-aliases';

export default defineConfig({
  resolve: { alias: SHARED_ALIASES },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
