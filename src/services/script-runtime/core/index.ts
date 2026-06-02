/**
 * Core Providers — Registry of all built-in script runtime providers.
 *
 * These ship with Daakia and provide the standard dk.* API surface.
 * They are loaded in priority order (highest first).
 */
import type { ScriptProvider } from '../types';
import { envProvider } from './env-provider';
import { secretProvider } from './secret-provider';
import { requestProvider } from './request-provider';
import { testProvider } from './test-provider';
import { consoleProvider } from './console-provider';
import { cryptoProvider } from './crypto-provider';
import { utilsProvider } from './utils-provider';
import { requireProvider } from './require-provider';

/**
 * All core providers, sorted by priority (highest first).
 */
export const coreProviders: ScriptProvider[] = [
  envProvider,
  secretProvider,
  requestProvider,
  testProvider,
  consoleProvider,
  cryptoProvider,
  utilsProvider,
  requireProvider,
].sort((a, b) => (b.priority ?? 50) - (a.priority ?? 50));

export {
  envProvider,
  secretProvider,
  requestProvider,
  testProvider,
  consoleProvider,
  cryptoProvider,
  utilsProvider,
  requireProvider,
};
