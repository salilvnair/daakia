/**
 * Core Provider: Environment Variables
 *
 * Contributes: dk.env, dk.environment, dk.globals, dk.collectionVariables
 *
 * Provides read/write access to environment, collection, and global variables
 * from within scripts. Also supports .secret() to set values that are masked in console.
 */
import type { ScriptProvider } from '../types';

export const envProvider: ScriptProvider = {
  id: 'core:env',
  name: 'Environment Variables',
  description: 'dk.env.get/set/secret, dk.globals.get/set/secret, dk.collectionVariables.get/set',
  priority: 100,

  activate(ctx) {
    const { envVars, colVars, globalVars, secretVars } = ctx;

    const envApi = {
      get: (key: string): string | undefined => envVars[key] ?? secretVars[key],
      set: (key: string, value: string): void => { envVars[key] = String(value); },
      has: (key: string): boolean => key in envVars || key in secretVars,
      toObject: (): Record<string, string> => ({ ...envVars }),
      secret: (key: string, value: string): void => {
        secretVars[key] = String(value);
      },
    };

    return {
      dk: {
        env: envApi,
        environment: envApi, // full-name alias
        globals: {
          get: (key: string): string | undefined => globalVars[key] ?? secretVars[key],
          set: (key: string, value: string): void => { globalVars[key] = String(value); },
          has: (key: string): boolean => key in globalVars || key in secretVars,
          toObject: (): Record<string, string> => ({ ...globalVars }),
          secret: (key: string, value: string): void => {
            secretVars[key] = String(value);
          },
        },
        collectionVariables: {
          get: (key: string): string | undefined => colVars[key],
          set: (key: string, value: string): void => { colVars[key] = String(value); },
          has: (key: string): boolean => key in colVars,
          toObject: (): Record<string, string> => ({ ...colVars }),
        },
      },
    };
  },
};
