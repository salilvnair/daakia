/**
 * Script Runtime — Type definitions for the provider-based sandbox system.
 *
 * The Daakia script runtime uses a provider pattern (like Spring Boot auto-configuration):
 * - Core providers ship built-in functionality (dk.env, dk.sendRequest, dk.test, etc.)
 * - Extension providers can be dropped into `extensions/` to add capabilities (dk.readFile, fetch, etc.)
 *
 * Each provider implements `ScriptProvider` and contributes API surface to the sandbox.
 */

// ─── Script Execution Context ───────────────────────────────────────────────

export interface ScriptContext {
  /** Current request data (read-only in pre-request, available in both) */
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: string;
  };
  /** Response data (only available in post-response scripts) */
  response?: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    time: number;
    size: number;
  };
  /** Environment variables (key→value) the script can read/write */
  environmentVariables: Record<string, string>;
  /** Collection variables (key→value) the script can read/write */
  collectionVariables: Record<string, string>;
  /** Global variables (persisted across all environments) */
  globalVariables: Record<string, string>;
  /** Secret variables (masked in console output, session-only) */
  secretVariables?: Record<string, string>;
}

// ─── Script Execution Result ────────────────────────────────────────────────

export interface ScriptResult {
  success: boolean;
  logs: string[];
  errors: string[];
  structuredLogs: StructuredLogEntry[];
  updatedEnvironmentVars: Record<string, string>;
  updatedCollectionVars: Record<string, string>;
  updatedGlobalVars: Record<string, string>;
  updatedSecretVars: Record<string, string>;
  testResults: TestResult[];
  subRequests: SubRequestEntry[];
  duration: number;
}

export interface StructuredLogEntry {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  args: unknown[];
  timestamp: number;
}

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export interface SubRequestEntry {
  method: string;
  url: string;
  status: number;
  statusText: string;
  duration: number;
  timestamp: number;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
}

// ─── Provider System ────────────────────────────────────────────────────────

/**
 * Context passed to each provider's `activate()` method.
 * Gives providers access to the script context, logging, variable stores, etc.
 */
export interface ProviderContext {
  /** The full script execution context (request, response, variables) */
  scriptContext: ScriptContext;
  /** Mutable env vars — providers can read/write these */
  envVars: Record<string, string>;
  /** Mutable collection vars */
  colVars: Record<string, string>;
  /** Mutable global vars */
  globalVars: Record<string, string>;
  /** Mutable secret vars (values masked in console output) */
  secretVars: Record<string, string>;
  /** Push a log message */
  log: (level: StructuredLogEntry['level'], ...args: unknown[]) => void;
  /** Push a sub-request entry (for network panel) */
  addSubRequest: (entry: SubRequestEntry) => void;
  /** Push a test result */
  addTestResult: (result: TestResult) => void;
}

/**
 * What a provider contributes to the sandbox.
 *
 * - `dk`: Properties merged into the `dk` (and `daakia`) object
 * - `globals`: Properties added to the top-level sandbox (e.g., `fetch`, `crypto`)
 */
export interface ProviderContribution {
  /** Properties to merge into dk.* namespace */
  dk?: Record<string, unknown>;
  /** Properties to add to top-level sandbox globals */
  globals?: Record<string, unknown>;
}

/**
 * Base interface for all script runtime providers.
 *
 * Implement this to add capabilities to the Daakia script sandbox.
 * Core providers handle dk.env, dk.sendRequest, dk.test, console, crypto, etc.
 * Extension providers can add dk.readFile, fetch, or any custom functionality.
 *
 * @example
 * ```typescript
 * export const myProvider: ScriptProvider = {
 *   id: 'my-custom-provider',
 *   name: 'My Custom Provider',
 *   description: 'Adds dk.myFunction() to the sandbox',
 *   priority: 50,
 *   activate(ctx) {
 *     return {
 *       dk: {
 *         myFunction: () => { ... }
 *       },
 *       globals: {
 *         myGlobal: 'hello'
 *       }
 *     };
 *   }
 * };
 * ```
 */
export interface ScriptProvider {
  /** Unique identifier for this provider (e.g., 'core:env', 'ext:fetch') */
  id: string;
  /** Human-readable name (e.g., 'Environment Variables') */
  name: string;
  /** Short description of what this provider adds */
  description: string;
  /**
   * Priority — higher priority providers activate first.
   * Core providers use 100, extensions use 50 by default.
   * Use higher values if your provider must run before others.
   */
  priority?: number;
  /**
   * Activate this provider and return its contribution to the sandbox.
   * Called once per script execution with the current context.
   */
  activate(context: ProviderContext): ProviderContribution;
  /**
   * Optional cleanup after script execution completes.
   * Use for closing connections, flushing buffers, etc.
   */
  deactivate?(): void;
}
