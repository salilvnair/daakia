/**
 * Core Provider: JavaScript Builtins & Utilities
 *
 * Contributes: All essential JavaScript globals that the sandbox needs.
 * Also provides dk.interpolate() for resolving {{variable}} placeholders.
 *
 * This provider explicitly whitelists safe JS builtins. Anything NOT listed here
 * is intentionally blocked (e.g., eval, Function, process, require is separate).
 */
import { renderTemplate, hasTemplate } from '../../template/render';
import { requestContext } from '../../template/request-context';
import type { ScriptProvider } from '../types';

export const utilsProvider: ScriptProvider = {
  id: 'core:utils',
  name: 'JavaScript Builtins & Utilities',
  description: 'JSON, Math, Date, atob/btoa, encode/decode URI, dk.interpolate()',
  priority: 100,

  activate(ctx) {
    const { envVars, colVars, globalVars } = ctx;

    /*
      dk.interpolate — the same string handling a header gets.

      It used to substitute variables and `{{$dynamic}}` names itself, which
      meant a script and a header could disagree: `{{randomInt 1 100}}` worked
      in one and was left as literal text in the other, and nothing said why.
      It now runs the shared renderer, so whatever a value means on the
      request it means here too.

      Variables first, helpers second, matching the order the request path
      uses. Unknown names survive as `{{name}}` rather than becoming '' — a
      script that logs a template it did not resolve should show you which one.
    */
    const interpolate = (template: string): string => {
      const substituted = template.replace(/\{\{([a-zA-Z0-9_.\-]+)\}\}/g, (match, key: string) => {
        if (key in envVars) return envVars[key];
        if (key in colVars) return colVars[key];
        if (key in globalVars) return globalVars[key];
        return match;
      });
      if (!hasTemplate(substituted)) return substituted;

      const req = ctx.scriptContext.request;
      return renderTemplate(substituted, requestContext({
        method: req?.method ?? 'GET',
        url: req?.url ?? '',
        headers: req?.headers,
        body: typeof req?.body === 'string' ? req.body : '',
      }), { keepUnknown: true });
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
