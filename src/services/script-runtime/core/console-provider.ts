/**
 * Core Provider: Console
 *
 * Contributes: console.log, console.info, console.warn, console.error, console.debug
 *
 * Captures all console output as structured log entries for the DevTools Console panel.
 */
import type { ScriptProvider } from '../types';

export const consoleProvider: ScriptProvider = {
  id: 'core:console',
  name: 'Console',
  description: 'console.log/info/warn/error/debug — captured for DevTools Console',
  priority: 100,

  activate(ctx) {
    const { log } = ctx;

    return {
      globals: {
        console: {
          log: (...args: unknown[]) => log('log', ...args),
          info: (...args: unknown[]) => log('info', ...args),
          warn: (...args: unknown[]) => log('warn', ...args),
          error: (...args: unknown[]) => log('error', ...args),
          debug: (...args: unknown[]) => log('debug', ...args),
        },
      },
    };
  },
};
