/**
 * Core Provider: Crypto
 *
 * Contributes: crypto (global) — subset of Web Crypto API
 *
 * Provides randomUUID, randomBytes, createHash, createHmac in the sandbox.
 */
import * as nodeCrypto from 'crypto';
import type { ScriptProvider } from '../types';

export const cryptoProvider: ScriptProvider = {
  id: 'core:crypto',
  name: 'Crypto',
  description: 'crypto.randomUUID(), createHash(), createHmac(), randomBytes()',
  priority: 80,

  activate() {
    return {
      globals: {
        crypto: {
          randomUUID: () => nodeCrypto.randomUUID(),
          randomBytes: (size: number) => nodeCrypto.randomBytes(size),
          createHash: (algo: string) => nodeCrypto.createHash(algo),
          createHmac: (algo: string, key: string) => nodeCrypto.createHmac(algo, key),
        },
      },
    };
  },
};
