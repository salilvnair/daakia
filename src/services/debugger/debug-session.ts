/**
 * DebugSession — Manages async script execution with breakpoint support.
 *
 * Uses Node.js vm module with async IIFE wrapper. The injected `__bp()` function
 * returns a Promise that only resolves when the user tells us to continue/step.
 * While paused, the Node.js event loop remains free so we can receive commands.
 */
import * as vm from 'vm';
import * as crypto from 'crypto';
import * as http from 'http';
import * as https from 'https';
import { instrumentSource, serializeVar } from './script-instrumenter';
import type { ScriptContext, ScriptResult, SubRequestEntry, TestResult, StructuredLogEntry } from '../script-runtime';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DebugAction = 'continue' | 'stepOver' | 'stepInto' | 'stepOut' | 'stop';

export interface DebugVariable {
  name: string;
  value: unknown;
  type: string;
}

export interface DebugCallFrame {
  fn: string;
  file: string;
  line: number;
  col: number;
  isUser: boolean;
}

export interface DebugPausedState {
  line: number;
  variables: DebugVariable[];
  logs: string[];
  phase: 'pre-request' | 'post-response';
  callStack?: DebugCallFrame[];
}

export interface DebugSessionCallbacks {
  onPaused: (state: DebugPausedState) => void;
  onResumed: () => void;
  onCompleted: (result: ScriptResult) => void;
  onError: (message: string) => void;
  onLog: (entry: StructuredLogEntry) => void;
  onSubRequest?: (entry: SubRequestEntry) => void;
}

// ─── Debug Session ────────────────────────────────────────────────────────────

export class DebugSession {
  private breakpoints: Set<number> = new Set();
  private conditions: Map<number, string> = new Map();
  private stepMode: boolean = false;
  private stopped: boolean = false;
  private resolveBreakpoint: ((action: DebugAction) => void) | null = null;
  private callbacks: DebugSessionCallbacks;
  private phase: 'pre-request' | 'post-response';
  private logs: string[] = [];

  constructor(callbacks: DebugSessionCallbacks, phase: 'pre-request' | 'post-response') {
    this.callbacks = callbacks;
    this.phase = phase;
  }

  setBreakpoints(lines: number[]): void {
    this.breakpoints = new Set(lines);
  }

  setConditions(conditions: Record<number, string>): void {
    this.conditions = new Map(Object.entries(conditions).map(([k, v]) => [Number(k), v]));
  }

  /**
   * Resume execution with the given action.
   */
  resume(action: DebugAction): void {
    if (action === 'stop') {
      this.stopped = true;
    }
    if (action === 'stepOver' || action === 'stepInto') {
      this.stepMode = true;
    } else {
      this.stepMode = false;
    }
    if (this.resolveBreakpoint) {
      const resolve = this.resolveBreakpoint;
      this.resolveBreakpoint = null;
      resolve(action);
    }
  }

  /**
   * Run the script with debugging support. Returns a ScriptResult when complete.
   */
  async run(script: string, context: ScriptContext): Promise<ScriptResult> {
    const startTime = Date.now();
    const logs: string[] = [];
    const errors: string[] = [];
    const structuredLogs: StructuredLogEntry[] = [];
    const testResults: TestResult[] = [];
    const updatedEnvVars: Record<string, string> = { ...context.environmentVariables };
    const updatedColVars: Record<string, string> = { ...context.collectionVariables };
    const updatedGlobalVars: Record<string, string> = { ...(context.globalVariables || {}) };
    const updatedSecretVars: Record<string, string> = { ...(context.secretVariables || {}) };
    const subRequests: SubRequestEntry[] = [];
    this.logs = logs;

    if (!script || !script.trim()) {
      const result: ScriptResult = {
        success: true, logs: [], errors: [], structuredLogs: [],
        updatedEnvironmentVars: updatedEnvVars,
        updatedCollectionVars: updatedColVars,
        updatedGlobalVars, updatedSecretVars: { ...(context.secretVariables || {}) }, testResults: [], subRequests: [], duration: 0,
      };
      this.callbacks.onCompleted(result);
      return result;
    }

    // Build response object
    const responseObj = context.response ? Object.freeze({
      ...context.response,
      json: () => { try { return JSON.parse(context.response!.body); } catch { return null; } },
    }) : undefined;

    // dk.sendRequest — async HTTP directly in extension host (no child process)
    const sendRequest = async (opts: { method?: string; url: string; headers?: Record<string, string>; body?: string }) => {
      const method = (opts.method || 'GET').toUpperCase();
      const url = opts.url.match(/^https?:\/\//) ? opts.url : 'http://' + opts.url;
      const headers = opts.headers || {};
      const body = opts.body || '';
      const reqStartTime = Date.now();

      try {
        const parsed = await new Promise<{ status: number; statusText: string; headers: Record<string, string>; body: string }>((resolve, reject) => {
          const urlObj = new URL(url);
          const isHttps = urlObj.protocol === 'https:';
          const transport = isHttps ? https : http;

          const reqOpts: http.RequestOptions = {
            hostname: urlObj.hostname === 'localhost' ? '127.0.0.1' : urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method,
            headers,
            timeout: 10000,
          };

          const req = transport.request(reqOpts, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
              const hdrs: Record<string, string> = {};
              for (const [k, v] of Object.entries(res.headers)) {
                if (v) hdrs[k] = Array.isArray(v) ? v.join(', ') : v;
              }
              resolve({ status: res.statusCode || 0, statusText: res.statusMessage || '', headers: hdrs, body: data });
            });
          });

          req.on('error', (e) => reject(e));
          req.on('timeout', () => { req.destroy(new Error('Request timed out after 10000ms')); });
          if (body) req.write(body);
          req.end();
        });

        const duration = Date.now() - reqStartTime;
        const respBody = (parsed.body || '').slice(0, 50000);
        const entry: SubRequestEntry = {
          method, url, status: parsed.status || 0, statusText: parsed.statusText || '',
          duration, timestamp: reqStartTime,
          requestHeaders: headers, requestBody: body || undefined,
          responseHeaders: parsed.headers || {}, responseBody: respBody || undefined,
        };
        subRequests.push(entry);
        this.callbacks.onSubRequest?.(entry);
        return {
          status: parsed.status || 0, statusText: parsed.statusText || '',
          headers: parsed.headers || {}, body: parsed.body || '',
          json: () => { try { return JSON.parse(parsed.body); } catch { return null; } },
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const duration = Date.now() - reqStartTime;
        const entry: SubRequestEntry = {
          method, url, status: 0, statusText: msg, duration, timestamp: reqStartTime,
          requestHeaders: headers, requestBody: body || undefined,
          responseHeaders: {}, responseBody: undefined,
        };
        subRequests.push(entry);
        this.callbacks.onSubRequest?.(entry);
        return { status: 0, statusText: msg, headers: {}, body: '', json: () => null };
      }
    };

    // Build dk API
    const daakiaApi = {
      env: {
        get: (key: string) => updatedEnvVars[key] ?? updatedSecretVars[key],
        set: (key: string, value: string) => { updatedEnvVars[key] = String(value); },
        has: (key: string) => key in updatedEnvVars || key in updatedSecretVars,
        toObject: () => ({ ...updatedEnvVars }),
        secret: (key: string, value: string) => {
          updatedSecretVars[key] = String(value);
        },
      },
      environment: {
        get: (key: string) => updatedEnvVars[key] ?? updatedSecretVars[key],
        set: (key: string, value: string) => { updatedEnvVars[key] = String(value); },
        has: (key: string) => key in updatedEnvVars || key in updatedSecretVars,
        toObject: () => ({ ...updatedEnvVars }),
        secret: (key: string, value: string) => {
          updatedSecretVars[key] = String(value);
        },
      },
      globals: {
        get: (key: string) => updatedGlobalVars[key] ?? updatedSecretVars[key],
        set: (key: string, value: string) => { updatedGlobalVars[key] = String(value); },
        has: (key: string) => key in updatedGlobalVars || key in updatedSecretVars,
        toObject: () => ({ ...updatedGlobalVars }),
        secret: (key: string, value: string) => {
          updatedSecretVars[key] = String(value);
        },
      },
      collectionVariables: {
        get: (key: string) => updatedColVars[key],
        set: (key: string, value: string) => { updatedColVars[key] = String(value); },
        has: (key: string) => key in updatedColVars,
        toObject: () => ({ ...updatedColVars }),
      },
      request: Object.freeze({ ...context.request }),
      response: responseObj,
      test: (name: string, fn: () => void) => {
        try { fn(); testResults.push({ name, passed: true }); }
        catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          testResults.push({ name, passed: false, error: msg });
        }
      },
      expect: createExpect(),
      sendRequest,
    };

    // Mask secret values in console output
    const maskSecrets = (str: string): string => {
      let masked = str;
      for (const val of Object.values(updatedSecretVars)) {
        if (val && val.length > 0) masked = masked.replaceAll(val, '***');
      }
      return masked;
    };

    // Sandboxed console
    const sandboxConsole = {
      log: (...args: unknown[]) => {
        const msg = maskSecrets(args.map(formatArg).join(' '));
        logs.push(msg);
        const entry: StructuredLogEntry = { level: 'log', args: args.map(safeCloneArg), timestamp: Date.now() };
        structuredLogs.push(entry);
        this.callbacks.onLog(entry);
      },
      info: (...args: unknown[]) => {
        logs.push(`[INFO] ${args.map(formatArg).join(' ')}`);
        const entry: StructuredLogEntry = { level: 'info', args: args.map(safeCloneArg), timestamp: Date.now() };
        structuredLogs.push(entry);
        this.callbacks.onLog(entry);
      },
      warn: (...args: unknown[]) => {
        logs.push(`[WARN] ${args.map(formatArg).join(' ')}`);
        const entry: StructuredLogEntry = { level: 'warn', args: args.map(safeCloneArg), timestamp: Date.now() };
        structuredLogs.push(entry);
        this.callbacks.onLog(entry);
      },
      error: (...args: unknown[]) => {
        errors.push(args.map(formatArg).join(' '));
        const entry: StructuredLogEntry = { level: 'error', args: args.map(safeCloneArg), timestamp: Date.now() };
        structuredLogs.push(entry);
        this.callbacks.onLog(entry);
      },
      debug: (...args: unknown[]) => {
        logs.push(`[DEBUG] ${args.map(formatArg).join(' ')}`);
        const entry: StructuredLogEntry = { level: 'debug', args: args.map(safeCloneArg), timestamp: Date.now() };
        structuredLogs.push(entry);
        this.callbacks.onLog(entry);
      },
    };

    // The core __bp function — pauses execution at breakpoints
    const __bp = async (lineNo: number, captureFn: () => Record<string, unknown>): Promise<void> => {
      if (this.stopped) throw new Error('__DEBUG_STOPPED__');

      const isBreakpoint = this.breakpoints.has(lineNo);
      const shouldPause = isBreakpoint || this.stepMode;
      if (!shouldPause) return;

      // For conditional breakpoints, evaluate the condition before pausing
      if (isBreakpoint && !this.stepMode && this.conditions.has(lineNo)) {
        const condition = this.conditions.get(lineNo)!;
        let captured: Record<string, unknown> = {};
        try { captured = captureFn(); } catch { /* ignore */ }
        try {
          // Evaluate condition in the context of current variables
          const condFn = new Function(...Object.keys(captured), `return (${condition});`);
          const result = condFn(...Object.values(captured));
          if (!result) return; // Condition not met, skip this breakpoint
        } catch {
          // If condition evaluation fails, pause anyway (user may want to debug the condition)
        }
      }

      // Capture variables
      let captured: Record<string, unknown> = {};
      try { captured = captureFn(); } catch { /* ignore */ }

      const variables: DebugVariable[] = Object.entries(captured).map(([name, value]) => ({
        name,
        value: serializeVar(value),
        type: value === null ? 'null' : typeof value,
      }));

      // Capture call stack from current Error stack trace
      const callStack: DebugCallFrame[] = [];
      try {
        const stack = new Error().stack || '';
        const lines = stack.split('\n').slice(1); // skip "Error" line
        for (const frame of lines) {
          const match = frame.match(/^\s+at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/) ||
                        frame.match(/^\s+at\s+(.+?):(\d+):(\d+)/);
          if (match) {
            if (match.length === 5) {
              const file = match[2];
              const isUser = file === 'debug-script.js';
              callStack.push({
                fn: match[1],
                file: isUser ? file : `<daakia>/${file.split(/[\\/]/).pop() || file}`,
                line: parseInt(match[3], 10) - (isUser ? 1 : 0), // offset for wrapper
                col: parseInt(match[4], 10),
                isUser,
              });
            } else {
              callStack.push({
                fn: '<anonymous>',
                file: match[1],
                line: parseInt(match[2], 10),
                col: parseInt(match[3], 10),
                isUser: match[1] === 'debug-script.js',
              });
            }
          }
        }
      } catch { /* ignore stack parse errors */ }

      // Notify webview we're paused
      this.callbacks.onPaused({
        line: lineNo,
        variables,
        logs: [...logs],
        phase: this.phase,
        callStack,
      });

      // Wait for user action
      const action = await new Promise<DebugAction>((resolve) => {
        this.resolveBreakpoint = resolve;
      });

      if (action === 'stop') {
        this.stopped = true;
        throw new Error('__DEBUG_STOPPED__');
      }

      this.callbacks.onResumed();
    };

    // Instrument source and wrap in async IIFE
    const instrumented = instrumentSource(script);
    // Auto-inject await before dk.sendRequest( so users don't need to write it
    const asyncInstrumented = instrumented.replace(/(?<!await\s)dk\.sendRequest\s*\(/g, 'await dk.sendRequest(');
    const wrapped = `(async () => {\n${asyncInstrumented}\n})()`;

    const sandbox: Record<string, unknown> = {
      daakia: daakiaApi,
      dk: daakiaApi,
      console: sandboxConsole,
      __bp,
      setTimeout: undefined,
      setInterval: undefined,
      JSON, parseInt, parseFloat, isNaN, isFinite,
      encodeURIComponent, decodeURIComponent, encodeURI, decodeURI,
      atob: (str: string) => Buffer.from(str, 'base64').toString('binary'),
      btoa: (str: string) => Buffer.from(str, 'binary').toString('base64'),
      Date, Math, Object, Array, String, Number, Boolean, RegExp,
      Error, TypeError, RangeError,
      Map, Set, WeakMap, WeakSet, Promise, Symbol, Proxy, Reflect,
      crypto: {
        randomUUID: () => crypto.randomUUID(),
        randomBytes: (size: number) => crypto.randomBytes(size),
        createHash: (algo: string) => crypto.createHash(algo),
        createHmac: (algo: string, key: string) => crypto.createHmac(algo, key),
      },
      require: createSandboxedRequire(),
    };

    try {
      const vmContext = vm.createContext(sandbox);
      const vmScript = new vm.Script(wrapped, { filename: 'debug-script.js' });
      // No timeout — user controls execution flow
      await vmScript.runInContext(vmContext);

      const result: ScriptResult = {
        success: true, logs, errors, structuredLogs,
        updatedEnvironmentVars: updatedEnvVars,
        updatedCollectionVars: updatedColVars,
        updatedGlobalVars, updatedSecretVars, testResults, subRequests,
        duration: Date.now() - startTime,
      };
      this.callbacks.onCompleted(result);
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === '__DEBUG_STOPPED__') {
        const result: ScriptResult = {
          success: false, logs, errors: ['__DEBUG_STOPPED__'], structuredLogs,
          updatedEnvironmentVars: updatedEnvVars,
          updatedCollectionVars: updatedColVars,
          updatedGlobalVars, updatedSecretVars, testResults, subRequests,
          duration: Date.now() - startTime,
        };
        this.callbacks.onCompleted(result);
        return result;
      }
      errors.push(msg);
      structuredLogs.push({ level: 'error', args: [msg], timestamp: Date.now() });
      const result: ScriptResult = {
        success: false, logs, errors, structuredLogs,
        updatedEnvironmentVars: updatedEnvVars,
        updatedCollectionVars: updatedColVars,
        updatedGlobalVars, updatedSecretVars, testResults, subRequests,
        duration: Date.now() - startTime,
      };
      this.callbacks.onError(msg);
      return result;
    }
  }
}

// ─── Helpers (same as core providers) ─────────────────────────────────────────

const ALLOWED_MODULES: Record<string, () => unknown> = {
  'crypto': () => require('crypto'),
  'buffer': () => require('buffer'),
  'url': () => require('url'),
  'querystring': () => require('querystring'),
  'path': () => require('path'),
  'util': () => require('util'),
};

function createSandboxedRequire() {
  return (moduleName: string): unknown => {
    const loader = ALLOWED_MODULES[moduleName];
    if (loader) return loader();
    throw new Error(`require("${moduleName}") is not allowed. Allowed: ${Object.keys(ALLOWED_MODULES).join(', ')}`);
  };
}

function createExpect() {
  return (actual: unknown) => ({
    toBe: (expected: unknown) => {
      if (actual !== expected) throw new Error(`Expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`);
    },
    toEqual: (expected: unknown) => {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
    },
    toBeTruthy: () => { if (!actual) throw new Error(`Expected ${JSON.stringify(actual)} to be truthy`); },
    toBeFalsy: () => { if (actual) throw new Error(`Expected ${JSON.stringify(actual)} to be falsy`); },
    toContain: (expected: unknown) => {
      const s = String(actual);
      if (!s.includes(String(expected))) throw new Error(`Expected "${s}" to contain "${expected}"`);
    },
    toHaveLength: (expected: number) => {
      const len = (actual as { length?: number })?.length;
      if (len !== expected) throw new Error(`Expected length ${len} to be ${expected}`);
    },
    toBeGreaterThan: (expected: number) => {
      if (Number(actual) <= expected) throw new Error(`Expected ${actual} to be greater than ${expected}`);
    },
    toBeLessThan: (expected: number) => {
      if (Number(actual) >= expected) throw new Error(`Expected ${actual} to be less than ${expected}`);
    },
  });
}

function formatArg(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg === null) return 'null';
  if (arg === undefined) return 'undefined';
  try { return JSON.stringify(arg); } catch { return String(arg); }
}

function safeCloneArg(arg: unknown): unknown {
  if (arg === null || arg === undefined) return arg;
  if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') return arg;
  try { return JSON.parse(JSON.stringify(arg)); } catch { return String(arg); }
}
