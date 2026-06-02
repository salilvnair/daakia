/**
 * Core Provider: JavaScript Builtins & Utilities
 *
 * Contributes: All essential JavaScript globals that the sandbox needs.
 * Also provides dk.interpolate() for resolving {{variable}} placeholders.
 *
 * This provider explicitly whitelists safe JS builtins. Anything NOT listed here
 * is intentionally blocked (e.g., eval, Function, process, require is separate).
 */
import { resolveVariable } from '../../variables';
import type { ScriptProvider } from '../types';

export const utilsProvider: ScriptProvider = {
  id: 'core:utils',
  name: 'JavaScript Builtins & Utilities',
  description: 'JSON, Math, Date, atob/btoa, encode/decode URI, dk.interpolate()',
  priority: 100,

  activate(ctx) {
    const { envVars, colVars, globalVars } = ctx;

    // dk.interpolate — resolve {{var}} and {{$dynamic}} placeholders in a string
    const interpolate = (template: string): string => {
      return template.replace(/\{\{(\$?[a-zA-Z0-9_.]+)\}\}/g, (_, key: string) => {
        if (key.startsWith('$')) return resolveVariable(key);
        if (key in envVars) return envVars[key];
        if (key in colVars) return colVars[key];
        if (key in globalVars) return globalVars[key];
        return `{{${key}}}`;
      });
    };

    return {
      dk: { interpolate },
      globals: {
        // Explicitly blocked (set to undefined to prevent prototype chain access)
        setTimeout: undefined,
        setInterval: undefined,
        // Encoding/decoding
        JSON,
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
        encodeURIComponent,
        decodeURIComponent,
        encodeURI,
        decodeURI,
        atob: (str: string) => Buffer.from(str, 'base64').toString('binary'),
        btoa: (str: string) => Buffer.from(str, 'binary').toString('base64'),
        // Essential JS constructors
        Date,
        Math,
        Object,
        Array,
        String,
        Number,
        Boolean,
        RegExp,
        Error,
        TypeError,
        RangeError,
        Map,
        Set,
        WeakMap,
        WeakSet,
        Promise,
        Symbol,
        Proxy,
        Reflect,
      },
    };
  },
};
