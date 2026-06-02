/**
 * Core Provider: Sandboxed Require
 *
 * Contributes: require() (global) — whitelisted Node.js modules only
 *
 * Only allows: crypto, buffer, url, querystring, path, util.
 * All other require() calls throw a clear error.
 */
import type { ScriptProvider } from '../types';

/** Whitelist of allowed Node.js built-in modules */
const ALLOWED_MODULES: Record<string, () => unknown> = {
  'crypto': () => require('crypto'),
  'buffer': () => require('buffer'),
  'url': () => require('url'),
  'querystring': () => require('querystring'),
  'path': () => require('path'),
  'util': () => require('util'),
};

export const requireProvider: ScriptProvider = {
  id: 'core:require',
  name: 'Sandboxed Require',
  description: 'require() — whitelisted: crypto, buffer, url, querystring, path, util',
  priority: 80,

  activate() {
    const sandboxedRequire = (moduleName: string): unknown => {
      const loader = ALLOWED_MODULES[moduleName];
      if (loader) return loader();
      throw new Error(
        `require("${moduleName}") is not allowed in Daakia scripts. ` +
        `Allowed modules: ${Object.keys(ALLOWED_MODULES).join(', ')}`
      );
    };

    return {
      globals: {
        require: sandboxedRequire,
      },
    };
  },
};
