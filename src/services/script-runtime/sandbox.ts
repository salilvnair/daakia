/**
 * Sandbox Builder — Assembles providers into a VM sandbox.
 *
 * This is the heart of the runtime: it takes all registered providers (core + extensions),
 * activates them in priority order, and merges their contributions into a single sandbox
 * object ready for Node's `vm.createContext()`.
 */
import type {
  ScriptContext,
  ScriptProvider,
  ProviderContext,
  ProviderContribution,
  StructuredLogEntry,
  SubRequestEntry,
  TestResult,
} from './types';
import { coreProviders } from './core';
import { loadExtensionProviders } from './extensions';

export interface SandboxResult {
  sandbox: Record<string, unknown>;
  /** Collected logs after execution */
  logs: string[];
  errors: string[];
  structuredLogs: StructuredLogEntry[];
  testResults: TestResult[];
  subRequests: SubRequestEntry[];
  /** Mutable var references (read final state after execution) */
  envVars: Record<string, string>;
  colVars: Record<string, string>;
  globalVars: Record<string, string>;
  secretVars: Record<string, string>;
  /** Call to cleanup all providers */
  deactivateAll: () => void;
}

/**
 * Build a complete VM sandbox from all registered providers.
 *
 * @param context - The script execution context (request, response, variables)
 * @param extraProviders - Optional additional providers to include (e.g., debug __bp)
 * @returns SandboxResult with the assembled sandbox and collection arrays
 */
export function buildSandbox(context: ScriptContext, extraProviders?: ScriptProvider[]): SandboxResult {
  // Mutable state containers
  const logs: string[] = [];
  const errors: string[] = [];
  const structuredLogs: StructuredLogEntry[] = [];
  const testResults: TestResult[] = [];
  const subRequests: SubRequestEntry[] = [];
  const envVars = { ...context.environmentVariables };
  const colVars = { ...context.collectionVariables };
  const globalVars = { ...(context.globalVariables || {}) };
  const secretVars = { ...(context.secretVariables || {}) };

  // Helper functions for provider context
  const formatArg = (arg: unknown): string => {
    if (typeof arg === 'string') return arg;
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    try { return JSON.stringify(arg); } catch { return String(arg); }
  };

  /** Mask any secret values in a string */
  const maskSecrets = (str: string): string => {
    let masked = str;
    for (const val of Object.values(secretVars)) {
      if (val && val.length > 0) {
        masked = masked.replaceAll(val, '***');
      }
    }
    return masked;
  };

  const safeCloneArg = (arg: unknown): unknown => {
    if (arg === null || arg === undefined) return arg;
    if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') return arg;
    try { return JSON.parse(JSON.stringify(arg)); } catch { return String(arg); }
  };

  // Build provider context
  const providerCtx: ProviderContext = {
    scriptContext: context,
    envVars,
    colVars,
    globalVars,
    secretVars,
    log: (level, ...args) => {
      const msg = maskSecrets(args.map(formatArg).join(' '));
      if (level === 'error') {
        errors.push(msg);
      } else {
        const prefix = level === 'log' ? '' : `[${level.toUpperCase()}] `;
        logs.push(prefix + msg);
      }
      structuredLogs.push({ level, args: args.map(a => {
        const cloned = safeCloneArg(a);
        if (typeof cloned === 'string') return maskSecrets(cloned);
        return cloned;
      }), timestamp: Date.now() });
    },
    addSubRequest: (entry) => subRequests.push(entry),
    addTestResult: (result) => testResults.push(result),
  };

  // Gather all providers: core + extensions + extra
  const extensionProviders = loadExtensionProviders();
  const allProviders: ScriptProvider[] = [
    ...coreProviders,
    ...extensionProviders,
    ...(extraProviders || []),
  ].sort((a, b) => (b.priority ?? 50) - (a.priority ?? 50));

  // Activate all providers and collect contributions
  const dkApi: Record<string, unknown> = {};
  const sandbox: Record<string, unknown> = {};
  const activatedProviders: ScriptProvider[] = [];

  for (const provider of allProviders) {
    const contribution: ProviderContribution = provider.activate(providerCtx);
    activatedProviders.push(provider);

    // Merge dk.* contributions
    if (contribution.dk) {
      Object.assign(dkApi, contribution.dk);
    }

    // Merge top-level globals
    if (contribution.globals) {
      Object.assign(sandbox, contribution.globals);
    }
  }

  // Expose dk API under both names
  sandbox.dk = dkApi;
  sandbox.daakia = dkApi;

  return {
    sandbox,
    logs,
    errors,
    structuredLogs,
    testResults,
    subRequests,
    envVars,
    colVars,
    globalVars,
    secretVars,
    deactivateAll: () => {
      for (const p of activatedProviders) {
        if (p.deactivate) p.deactivate();
      }
    },
  };
}
