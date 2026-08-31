import { resolve } from 'node:path';

/**
 * Module aliases used by both the app build and the test runner.
 *
 * They live here because vitest does not read `vite.config.ts`, so an alias
 * declared in one and not the other resolves fine in the app and fails only
 * under test — or, worse, the other way round. One object, imported twice.
 */
export const SHARED_ALIASES = {
  /*
    The dk8s prompt text, shared with the extension host rather than copied.

    `src/panel/chat/dk8s-prompts.ts` is a pure data module — no imports at all,
    just template literals — so both sides can read the same file. The
    alternative was pasting four hundred lines of prompt into the webview so
    the Prompt Library could show them, which guarantees the library eventually
    displays something the host is no longer sending.
  */
  '@daakia/dk8s-prompts': resolve(__dirname, '..', 'src', 'panel', 'chat', 'dk8s-prompts.ts'),
};
