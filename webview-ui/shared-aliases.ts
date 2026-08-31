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

  /*
    The log format engine, shared for the same reason and on the same terms.

    `src/services/k8s/log-format.ts` is also import-free. The webview needs it
    because a format the user configured in Settings has to win over the
    webview's own heuristics when it decides what a log line's fields are —
    and a second implementation of `%{THREAD}` in the webview would be a
    second thing to keep matching the one that actually parses the logs.
  */
  '@daakia/log-format': resolve(__dirname, '..', 'src', 'services', 'k8s', 'log-format.ts'),
};
