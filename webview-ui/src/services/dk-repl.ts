/**
 * dk-repl.ts — Shared dk object definition for the REPL console.
 * Single source of truth for the dk API shape used in both the REPL sandbox
 * and Monaco intellisense completions.
 *
 * ⚠️ KEEP IN SYNC WITH: src/services/script-runtime/core/ (backend providers)
 * The real dk runtime lives there. When you add/remove dk.* methods in providers,
 * update this file's createDkStub() and getDkCompletions() to match.
 *
 * This file provides:
 *   1. createDkStub(consoleMock) — returns a dk object for REPL eval
 *   2. getDkCompletions(text, monaco, position) — Monaco CompletionItem definitions
 *   3. replSendRequest(opts) — sends HTTP request via extension host postMessage
 */

import { postMsg } from '../vscode';

// ─── REPL Eval Context (sent to extension host) ─────────────────────────────

/** Context sent to extension host for REPL evaluation */
export interface ReplEvalContext {
  envVars: Record<string, string>;
  globalVars: Record<string, string>;
  collectionVars: Record<string, string>;
  request: { method: string; url: string; headers: Record<string, string>; body: string | null };
  response: { status: number; statusText: string; headers: Record<string, string>; body: string; time: number; size: number } | null;
}

/** Result from extension host REPL eval */
export interface ReplEvalResult {
  logs: { level: 'log' | 'info' | 'warn' | 'error' | 'debug'; args: unknown[]; timestamp: number }[];
  result: unknown;
  error?: string;
  envUpdates: Record<string, string>;
  globalUpdates: Record<string, string>;
}

/** Send code to extension host for evaluation in Node.js vm sandbox */
export function replEval(code: string, context: ReplEvalContext): Promise<ReplEvalResult> {
  const nonce = `repl_eval_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve) => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.type === 'replEvalResult' && msg.nonce === nonce) {
        window.removeEventListener('message', handler);
        resolve(msg.result as ReplEvalResult);
      }
    };
    window.addEventListener('message', handler);
    setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve({ logs: [], result: undefined, error: 'REPL eval timeout (30s)', envUpdates: {}, globalUpdates: {} });
    }, 30000);
    postMsg({ type: 'replEval', nonce, code, context });
  });
}

// ─── dk Runtime Factory ──────────────────────────────────────────────────────

export interface ConsoleMock {
  log: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

/** Live runtime context passed from stores — makes the REPL real, not mock */
export interface DkRuntimeContext {
  /** Active environment variables: { key → currentValue } */
  envVars: Record<string, string>;
  /** Global variables: { key → currentValue } */
  globalVars: Record<string, string>;
  /** Collection variables (if any): { key → currentValue } */
  collectionVars: Record<string, string>;
  /** Current request data from active tab */
  request: { method: string; url: string; headers: Record<string, string>; body: string | null };
  /** Last response data from active tab (null if no response yet) */
  response: { status: number; statusText: string; headers: Record<string, string>; body: string; time: number; size: number } | null;
  /** Callbacks to persist variable changes back to stores */
  onEnvSet?: (key: string, value: string) => void;
  onGlobalSet?: (key: string, value: string) => void;
  onEnvUnset?: (key: string) => void;
  onGlobalUnset?: (key: string) => void;
}

/** Options for dk.sendRequest() */
export interface DkSendRequestOpts {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

/** Result from dk.sendRequest() */
export interface DkSendRequestResult {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  time: number;
  json: () => unknown;
  text: () => string;
}

/** Async function that sends HTTP request via extension host */
export type SendRequestFn = (opts: DkSendRequestOpts) => Promise<DkSendRequestResult>;

/**
 * Creates a LIVE dk object for REPL execution.
 * When `ctx` is provided, dk.env.get() returns real values, dk.response has real data, etc.
 * When `ctx` is omitted, falls back to stub behavior (shows placeholder messages).
 */
export function createDkStub(consoleMock: ConsoleMock, ctx?: DkRuntimeContext, sendRequestFn?: SendRequestFn) {
  // Live variable store factory — reads/writes real data
  const makeLiveVarStore = (
    vars: Record<string, string>,
    prefix: string,
    onSet?: (key: string, value: string) => void,
    onUnset?: (key: string) => void,
  ) => ({
    get: (key: string): string | undefined => vars[key],
    set: (key: string, val: unknown) => {
      const strVal = String(val);
      vars[key] = strVal;
      onSet?.(key, strVal);
    },
    has: (key: string): boolean => key in vars,
    unset: (key: string) => {
      delete vars[key];
      onUnset?.(key);
    },
    toObject: () => ({ ...vars }),
    clear: () => {
      Object.keys(vars).forEach(k => delete vars[k]);
      consoleMock.info(`dk.${prefix}.clear()`);
    },
  });

  // Stub factory (no live context)
  const makeStubVarStore = (prefix: string) => ({
    get: (key: string) => { consoleMock.warn(`dk.${prefix}.get("${key}") — no live environment. Send a request first.`); return undefined; },
    set: (key: string, val: unknown) => { consoleMock.info(`dk.${prefix}.set("${key}", ${JSON.stringify(val)})`); },
    has: (_key: string) => false,
    unset: (key: string) => { consoleMock.info(`dk.${prefix}.unset("${key}")`); },
    toObject: () => ({}),
    clear: () => { consoleMock.info(`dk.${prefix}.clear()`); },
  });

  // Choose real or stub based on context
  const envStore = ctx
    ? makeLiveVarStore(ctx.envVars, 'env', ctx.onEnvSet, ctx.onEnvUnset)
    : makeStubVarStore('env');
  const globalsStore = ctx
    ? makeLiveVarStore(ctx.globalVars, 'globals', ctx.onGlobalSet, ctx.onGlobalUnset)
    : makeStubVarStore('globals');
  const colVarStore = ctx
    ? makeLiveVarStore(ctx.collectionVars, 'collectionVariables')
    : makeStubVarStore('collectionVariables');

  // Response object — live or empty
  const responseObj = ctx?.response
    ? {
        status: ctx.response.status,
        statusText: ctx.response.statusText,
        headers: ctx.response.headers,
        body: ctx.response.body,
        time: ctx.response.time,
        size: ctx.response.size,
        json: () => { try { return JSON.parse(ctx.response!.body); } catch { return null; } },
        text: () => ctx.response!.body,
      }
    : {
        status: 0,
        statusText: '',
        headers: {} as Record<string, string>,
        body: '',
        time: 0,
        size: 0,
        json: () => null,
        text: () => '',
      };

  // Request object — live or empty
  const requestObj = ctx
    ? { method: ctx.request.method, url: ctx.request.url, headers: ctx.request.headers, body: ctx.request.body, params: {} as Record<string, string> }
    : { method: 'GET', url: '', headers: {} as Record<string, string>, body: null as string | null, params: {} as Record<string, string> };

  return {
    // Variable stores (LIVE when context provided)
    env: envStore,
    globals: globalsStore,
    environment: envStore, // alias
    collectionVariables: colVarStore,

    // Request context (LIVE)
    request: requestObj,

    // Response context (LIVE)
    response: responseObj,

    // Testing
    test: (name: string, fn: () => void) => {
      try { fn(); consoleMock.info(`✓ ${name}`); }
      catch (e: any) { consoleMock.error(`✗ ${name}: ${e.message}`); }
    },

    // Assertions
    expect: (value: unknown) => ({
      toBe: (expected: unknown) => { if (value !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`); },
      toEqual: (expected: unknown) => { if (JSON.stringify(value) !== JSON.stringify(expected)) throw new Error(`Expected deep equal to ${JSON.stringify(expected)}`); },
      toBeTruthy: () => { if (!value) throw new Error(`Expected truthy, got ${JSON.stringify(value)}`); },
      toBeFalsy: () => { if (value) throw new Error(`Expected falsy, got ${JSON.stringify(value)}`); },
      toBeGreaterThan: (n: number) => { if ((value as number) <= n) throw new Error(`Expected > ${n}, got ${value}`); },
      toBeLessThan: (n: number) => { if ((value as number) >= n) throw new Error(`Expected < ${n}, got ${value}`); },
      toBeGreaterThanOrEqual: (n: number) => { if ((value as number) < n) throw new Error(`Expected >= ${n}, got ${value}`); },
      toBeLessThanOrEqual: (n: number) => { if ((value as number) > n) throw new Error(`Expected <= ${n}, got ${value}`); },
      toContain: (item: unknown) => { if (!(value as any[]).includes(item)) throw new Error(`Does not contain ${JSON.stringify(item)}`); },
      toHaveProperty: (key: string) => { if (typeof value !== 'object' || value === null || !(key in value)) throw new Error(`Missing property "${key}"`); },
      toHaveLength: (n: number) => { if ((value as any[]).length !== n) throw new Error(`Expected length ${n}, got ${(value as any[]).length}`); },
      toMatch: (pattern: RegExp) => { if (!pattern.test(String(value))) throw new Error(`Does not match ${pattern}`); },
      toBeNull: () => { if (value !== null) throw new Error(`Expected null, got ${JSON.stringify(value)}`); },
      toBeUndefined: () => { if (value !== undefined) throw new Error(`Expected undefined, got ${JSON.stringify(value)}`); },
      toBeDefined: () => { if (value === undefined) throw new Error(`Expected defined, got undefined`); },
      toBeInstanceOf: (cls: any) => { if (!(value instanceof cls)) throw new Error(`Not an instance of ${cls.name}`); },
      toMatchSchema: (schema: Record<string, unknown>) => {
        // Note: actual validation runs on extension host; this is a stub for autocomplete/docs
        consoleMock.info('dk.expect().toMatchSchema() — schema validation runs on extension host via scripts');
      },
      not: {
        toBe: (expected: unknown) => { if (value === expected) throw new Error(`Expected NOT ${JSON.stringify(expected)}`); },
        toEqual: (expected: unknown) => { if (JSON.stringify(value) === JSON.stringify(expected)) throw new Error(`Expected NOT deep equal`); },
        toBeTruthy: () => { if (value) throw new Error(`Expected NOT truthy`); },
        toContain: (item: unknown) => { if ((value as any[]).includes(item)) throw new Error(`Should not contain ${JSON.stringify(item)}`); },
      },
    }),

    // HTTP from scripts — LIVE via extension host when sendRequestFn provided
    sendRequest: (opts?: unknown): Promise<DkSendRequestResult> | DkSendRequestResult => {
      if (sendRequestFn && opts && typeof opts === 'object' && 'url' in opts) {
        return sendRequestFn(opts as DkSendRequestOpts);
      }
      consoleMock.warn('dk.sendRequest() requires a url. Usage: await dk.sendRequest({ method: "GET", url: "https://..." })');
      return { status: 0, statusText: '', headers: {}, body: '', time: 0, json: () => null, text: () => '' };
    },

    // Template interpolation (uses live env if available)
    interpolate: (str: string) => {
      if (!ctx) {
        consoleMock.info(`dk.interpolate("${str}") — no live env context`);
        return str;
      }
      return str.replace(/\{\{([\w.\-]+)\}\}|\$\{([\w.\-]+)\}/g, (match, braceVar, dollarVar) => {
        const varName = braceVar || dollarVar;
        if (varName in ctx.envVars) return ctx.envVars[varName];
        if (varName in ctx.globalVars) return ctx.globalVars[varName];
        if (varName in ctx.collectionVars) return ctx.collectionVars[varName];
        return match;
      });
    },

    // Collection runner control
    runner: {
      setNextRequest: (name: string) => { consoleMock.info(`dk.runner.setNextRequest("${name}")`); },
    },

    // Utility
    info: () => ({
      version: '1.0.0',
      runtime: ctx ? 'Daakia REPL (live — sendRequest enabled)' : 'Daakia REPL (no context — send a request first)',
      api: {
        'dk.env': 'get(key), set(key, val), has(key), unset(key), toObject(), clear()',
        'dk.globals': 'get(key), set(key, val), has(key), unset(key), toObject(), clear()',
        'dk.environment': 'Alias for dk.env',
        'dk.collectionVariables': 'Collection-scoped variables',
        'dk.request': '{ method, url, headers, body, params }',
        'dk.response': '{ status, statusText, headers, body, time, size, json(), text() }',
        'dk.test(name, fn)': 'Define a test assertion',
        'dk.expect(val)': '.toBe(), .toEqual(), .toBeTruthy(), .toContain(), .not.toBe(), ...',
        'dk.sendRequest(opts)': 'Send HTTP request (await dk.sendRequest({ url, method?, headers?, body? }))',
        'dk.interpolate(str)': 'Resolve {{var}} templates',
        'dk.runner.setNextRequest(name)': 'Set next request in collection run',
      },
    }),
  };
}

// ─── REPL sendRequest via Extension Host ─────────────────────────────────────

/** Sends HTTP request via extension host postMessage — used by REPL dk.sendRequest() */
export function replSendRequest(opts: DkSendRequestOpts): Promise<DkSendRequestResult> {
  const nonce = `repl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve) => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.type === 'replSendRequestResult' && msg.nonce === nonce) {
        window.removeEventListener('message', handler);
        const r = msg.result;
        resolve({
          status: r.status ?? 0,
          statusText: r.statusText ?? '',
          headers: r.headers ?? {},
          body: r.body ?? '',
          time: r.time ?? 0,
          json: () => { try { return JSON.parse(r.body ?? ''); } catch { return null; } },
          text: () => r.body ?? '',
        });
      }
    };
    window.addEventListener('message', handler);
    setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve({ status: 0, statusText: 'Timeout', headers: {}, body: '', time: 0, json: () => null, text: () => '' });
    }, 30000);
    postMsg({ type: 'replSendRequest', nonce, opts });
  });
}

// ─── Monaco Autocomplete Definitions ─────────────────────────────────────────

export function getDkCompletions(textUntilPosition: string, monaco: any, position: any) {
  const range = {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: position.column,
    endColumn: position.column,
  };

  // Top-level dk. properties
  if (/\bdk\.\s*$/.test(textUntilPosition)) {
    return [
      { label: 'env', kind: monaco.languages.CompletionItemKind.Module, insertText: 'env', detail: 'Environment variables (shorthand)', range },
      { label: 'globals', kind: monaco.languages.CompletionItemKind.Module, insertText: 'globals', detail: 'Global variables', range },
      { label: 'environment', kind: monaco.languages.CompletionItemKind.Module, insertText: 'environment', detail: 'Environment variables (full)', range },
      { label: 'collectionVariables', kind: monaco.languages.CompletionItemKind.Module, insertText: 'collectionVariables', detail: 'Collection-level variables', range },
      { label: 'request', kind: monaco.languages.CompletionItemKind.Property, insertText: 'request', detail: '{ method, url, headers, body, params }', range },
      { label: 'response', kind: monaco.languages.CompletionItemKind.Property, insertText: 'response', detail: '{ status, statusText, headers, body, time, size, json(), text() }', range },
      { label: 'test', kind: monaco.languages.CompletionItemKind.Function, insertText: 'test("${1:name}", () => {\n  ${2}\n})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Define a test assertion', range },
      { label: 'expect', kind: monaco.languages.CompletionItemKind.Function, insertText: 'expect(${1:value})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Create assertion chain', range },
      { label: 'sendRequest', kind: monaco.languages.CompletionItemKind.Function, insertText: 'sendRequest({\n  method: "${1:GET}",\n  url: "${2:https://}",\n  headers: {},\n})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Send HTTP request from script', range },
      { label: 'interpolate', kind: monaco.languages.CompletionItemKind.Function, insertText: 'interpolate("${1:{{var}}}")', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Resolve {{var}} template', range },
      { label: 'runner', kind: monaco.languages.CompletionItemKind.Module, insertText: 'runner', detail: 'Collection runner control', range },
      { label: 'info', kind: monaco.languages.CompletionItemKind.Function, insertText: 'info()', detail: 'Show dk API documentation', range },
    ];
  }

  // dk.env. / dk.globals. / dk.environment. / dk.collectionVariables.
  if (/\bdk\.(env|globals|environment|collectionVariables)\.\s*$/.test(textUntilPosition)) {
    return [
      { label: 'get', kind: monaco.languages.CompletionItemKind.Function, insertText: 'get("${1:key}")', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Get variable value', range },
      { label: 'set', kind: monaco.languages.CompletionItemKind.Function, insertText: 'set("${1:key}", ${2:value})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Set variable value', range },
      { label: 'has', kind: monaco.languages.CompletionItemKind.Function, insertText: 'has("${1:key}")', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Check if variable exists', range },
      { label: 'unset', kind: monaco.languages.CompletionItemKind.Function, insertText: 'unset("${1:key}")', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Remove a variable', range },
      { label: 'toObject', kind: monaco.languages.CompletionItemKind.Function, insertText: 'toObject()', detail: 'Get all variables as object', range },
      { label: 'clear', kind: monaco.languages.CompletionItemKind.Function, insertText: 'clear()', detail: 'Remove all variables', range },
    ];
  }

  // dk.request.
  if (/\bdk\.request\.\s*$/.test(textUntilPosition)) {
    return [
      { label: 'method', kind: monaco.languages.CompletionItemKind.Property, insertText: 'method', detail: 'HTTP method (GET, POST, etc.)', range },
      { label: 'url', kind: monaco.languages.CompletionItemKind.Property, insertText: 'url', detail: 'Request URL', range },
      { label: 'headers', kind: monaco.languages.CompletionItemKind.Property, insertText: 'headers', detail: 'Request headers object', range },
      { label: 'body', kind: monaco.languages.CompletionItemKind.Property, insertText: 'body', detail: 'Request body', range },
      { label: 'params', kind: monaco.languages.CompletionItemKind.Property, insertText: 'params', detail: 'Query parameters object', range },
    ];
  }

  // dk.response.
  if (/\bdk\.response\.\s*$/.test(textUntilPosition)) {
    return [
      { label: 'status', kind: monaco.languages.CompletionItemKind.Property, insertText: 'status', detail: 'HTTP status code (e.g. 200)', range },
      { label: 'statusText', kind: monaco.languages.CompletionItemKind.Property, insertText: 'statusText', detail: 'Status text (OK, Not Found, etc.)', range },
      { label: 'headers', kind: monaco.languages.CompletionItemKind.Property, insertText: 'headers', detail: 'Response headers object', range },
      { label: 'body', kind: monaco.languages.CompletionItemKind.Property, insertText: 'body', detail: 'Response body string', range },
      { label: 'time', kind: monaco.languages.CompletionItemKind.Property, insertText: 'time', detail: 'Response time in ms', range },
      { label: 'size', kind: monaco.languages.CompletionItemKind.Property, insertText: 'size', detail: 'Response size in bytes', range },
      { label: 'json', kind: monaco.languages.CompletionItemKind.Function, insertText: 'json()', detail: 'Parse body as JSON', range },
      { label: 'text', kind: monaco.languages.CompletionItemKind.Function, insertText: 'text()', detail: 'Get body as text', range },
    ];
  }

  // dk.expect().
  if (/\bdk\.expect\([^)]*\)\.\s*$/.test(textUntilPosition)) {
    return [
      { label: 'toBe', kind: monaco.languages.CompletionItemKind.Function, insertText: 'toBe(${1:expected})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Strict equality (===)', range },
      { label: 'toEqual', kind: monaco.languages.CompletionItemKind.Function, insertText: 'toEqual(${1:expected})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Deep equality', range },
      { label: 'toBeTruthy', kind: monaco.languages.CompletionItemKind.Function, insertText: 'toBeTruthy()', detail: 'Value is truthy', range },
      { label: 'toBeFalsy', kind: monaco.languages.CompletionItemKind.Function, insertText: 'toBeFalsy()', detail: 'Value is falsy', range },
      { label: 'toBeGreaterThan', kind: monaco.languages.CompletionItemKind.Function, insertText: 'toBeGreaterThan(${1:n})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'value > n', range },
      { label: 'toBeLessThan', kind: monaco.languages.CompletionItemKind.Function, insertText: 'toBeLessThan(${1:n})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'value < n', range },
      { label: 'toContain', kind: monaco.languages.CompletionItemKind.Function, insertText: 'toContain(${1:item})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Array/string contains item', range },
      { label: 'toHaveProperty', kind: monaco.languages.CompletionItemKind.Function, insertText: 'toHaveProperty("${1:key}")', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Object has property', range },
      { label: 'toHaveLength', kind: monaco.languages.CompletionItemKind.Function, insertText: 'toHaveLength(${1:n})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Array/string has length', range },
      { label: 'toMatch', kind: monaco.languages.CompletionItemKind.Function, insertText: 'toMatch(/${1:pattern}/)', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Matches regex', range },
      { label: 'toBeNull', kind: monaco.languages.CompletionItemKind.Function, insertText: 'toBeNull()', detail: 'Value is null', range },
      { label: 'toBeUndefined', kind: monaco.languages.CompletionItemKind.Function, insertText: 'toBeUndefined()', detail: 'Value is undefined', range },
      { label: 'toBeDefined', kind: monaco.languages.CompletionItemKind.Function, insertText: 'toBeDefined()', detail: 'Value is defined', range },
      { label: 'toMatchSchema', kind: monaco.languages.CompletionItemKind.Function, insertText: 'toMatchSchema(${1:schema})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Validate against JSON Schema', range },
      { label: 'not', kind: monaco.languages.CompletionItemKind.Property, insertText: 'not', detail: 'Negate assertion', range },
    ];
  }

  // dk.expect().not.
  if (/\bdk\.expect\([^)]*\)\.not\.\s*$/.test(textUntilPosition)) {
    return [
      { label: 'toBe', kind: monaco.languages.CompletionItemKind.Function, insertText: 'toBe(${1:expected})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'NOT strict equal', range },
      { label: 'toEqual', kind: monaco.languages.CompletionItemKind.Function, insertText: 'toEqual(${1:expected})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'NOT deep equal', range },
      { label: 'toBeTruthy', kind: monaco.languages.CompletionItemKind.Function, insertText: 'toBeTruthy()', detail: 'NOT truthy', range },
      { label: 'toContain', kind: monaco.languages.CompletionItemKind.Function, insertText: 'toContain(${1:item})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'NOT contains', range },
    ];
  }

  // dk.runner.
  if (/\bdk\.runner\.\s*$/.test(textUntilPosition)) {
    return [
      { label: 'setNextRequest', kind: monaco.languages.CompletionItemKind.Function, insertText: 'setNextRequest("${1:name}")', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Set next request in collection run', range },
    ];
  }

  return [];
}
