/**
 * Script Runner — Sandboxed execution using the provider-based sandbox.
 *
 * This is the runtime engine that uses assembled providers.
 */
import * as vm from 'vm';
import type { ScriptContext, ScriptResult } from './types';
import { buildSandbox } from './sandbox';

const SCRIPT_TIMEOUT_MS = 15000;

/**
 * Run a script in the provider-assembled sandbox.
 * Scripts are wrapped in an async IIFE so dk.sendRequest() (which is async) works transparently.
 *
 * @param script - User's JavaScript source code
 * @param context - Execution context (request, response, variables)
 * @returns ScriptResult with logs, errors, updated variables, test results, etc.
 */
export async function runScript(script: string, context: ScriptContext): Promise<ScriptResult> {
  const startTime = Date.now();

  if (!script || !script.trim()) {
    return {
      success: true,
      logs: [],
      errors: [],
      structuredLogs: [],
      updatedEnvironmentVars: { ...context.environmentVariables },
      updatedCollectionVars: { ...context.collectionVariables },
      updatedGlobalVars: { ...(context.globalVariables || {}) },
      updatedSecretVars: { ...(context.secretVariables || {}) },
      testResults: [],
      subRequests: [],
      duration: 0,
    };
  }

  // Build sandbox from all providers (core + extensions)
  const {
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
    deactivateAll,
  } = buildSandbox(context);

  try {
    const vmContext = vm.createContext(sandbox);
    // Auto-inject await before dk.sendRequest( so users don't need to write await manually
    const asyncScript = script.replace(/(?<!await\s)dk\.sendRequest\s*\(/g, 'await dk.sendRequest(');
    const wrappedScript = `(async () => {\n${asyncScript}\n})()`;
    const vmScript = new vm.Script(wrappedScript, { filename: 'script.js' });
    const promise = vmScript.runInContext(vmContext, { timeout: SCRIPT_TIMEOUT_MS });
    await promise;

    return {
      success: true,
      logs,
      errors,
      structuredLogs,
      updatedEnvironmentVars: envVars,
      updatedCollectionVars: colVars,
      updatedGlobalVars: globalVars,
      updatedSecretVars: secretVars,
      testResults,
      subRequests,
      duration: Date.now() - startTime,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    structuredLogs.push({ level: 'error', args: [msg], timestamp: Date.now() });
    return {
      success: false,
      logs,
      errors,
      structuredLogs,
      updatedEnvironmentVars: envVars,
      updatedCollectionVars: colVars,
      updatedGlobalVars: globalVars,
      updatedSecretVars: secretVars,
      testResults,
      subRequests,
      duration: Date.now() - startTime,
    };
  } finally {
    deactivateAll();
  }
}
