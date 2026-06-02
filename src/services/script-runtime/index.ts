/**
 * Script Runtime — Public API
 *
 * This is the main entry point for the Daakia script runtime system.
 * Re-exports everything consumers need.
 *
 * Architecture:
 * - `core/` — Built-in providers (env, request, test, console, crypto, utils, require)
 * - `extensions/` — User-defined providers (auto-discovered from .salilvnair/daakia-vsce/extensions/)
 * - `sandbox.ts` — Assembles providers into VM sandbox
 * - `runner.ts` — Executes scripts in the sandbox
 * - `types.ts` — All interfaces and type definitions
 */

// Types
export type {
  ScriptContext,
  ScriptResult,
  StructuredLogEntry,
  TestResult,
  SubRequestEntry,
  ScriptProvider,
  ProviderContext,
  ProviderContribution,
} from './types';

// Runner
export { runScript } from './runner';

// Sandbox (for DebugSession which builds its own sandbox)
export { buildSandbox } from './sandbox';
export type { SandboxResult } from './sandbox';

// Extensions
export { loadExtensionProviders, reloadExtensions } from './extensions';

// Core providers (for reference/testing)
export { coreProviders } from './core';
