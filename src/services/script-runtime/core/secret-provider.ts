/**
 * Core Provider: Secrets (legacy — now integrated into env-provider)
 *
 * Secret functionality is now provided via dk.env.secret() and dk.globals.secret().
 * This file is kept as a no-op placeholder to avoid import errors during transition.
 */
import type { ScriptProvider } from '../types';

export const secretProvider: ScriptProvider = {
  id: 'core:secret',
  name: 'Secrets (no-op)',
  description: 'Secrets are now accessed via dk.env.secret() and dk.globals.secret()',
  priority: 99,

  activate(_ctx) {
    // No-op — dk.env.secret() and dk.globals.secret() handle this now
    return { dk: {} };
  },
};
