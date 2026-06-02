/**
 * Extension Provider Loader
 *
 * Discovers and loads user-defined providers from the workspace's
 * `.salilvnair/daakia-vsce/extensions/` directory (or a configured path).
 *
 * Extension providers are .js files that export a `provider` object
 * conforming to the ScriptProvider interface.
 *
 * This is the "Spring Boot auto-configuration" equivalent:
 * drop a file in the directory → it gets picked up automatically.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { ScriptProvider } from '../types';

/** Cache of loaded extension providers (reset on reload) */
let cachedExtensions: ScriptProvider[] | null = null;
let lastLoadTime = 0;
const CACHE_TTL_MS = 10000; // Re-scan every 10 seconds

/**
 * Load all extension providers from the workspace's .salilvnair/daakia-vsce/extensions/ directory.
 * Returns empty array if directory doesn't exist or has no valid providers.
 */
export function loadExtensionProviders(): ScriptProvider[] {
  const now = Date.now();
  if (cachedExtensions && (now - lastLoadTime) < CACHE_TTL_MS) {
    return cachedExtensions;
  }

  cachedExtensions = [];
  lastLoadTime = now;

  // Look for extensions in workspace folder
  const workspaceFolders = getWorkspaceFolders();
  for (const folder of workspaceFolders) {
    const extDir = path.join(folder, '.salilvnair', 'daakia-vsce', 'extensions');
    if (!fs.existsSync(extDir)) continue;

    const files = fs.readdirSync(extDir).filter(f => f.endsWith('.js'));
    for (const file of files) {
      try {
        const fullPath = path.join(extDir, file);
        // Clear require cache so edits are picked up
        delete require.cache[require.resolve(fullPath)];
        const mod = require(fullPath);
        const provider: ScriptProvider = mod.provider || mod.default;

        if (provider && provider.id && provider.name && typeof provider.activate === 'function') {
          // Force extension priority to be <= 50 (can't override core)
          provider.priority = Math.min(provider.priority ?? 50, 50);
          cachedExtensions.push(provider);
        }
      } catch {
        // Silently skip invalid extensions — don't crash the script runner
      }
    }
  }

  return cachedExtensions;
}

/**
 * Force reload of extension providers (clear cache).
 * Call when workspace changes or user requests refresh.
 */
export function reloadExtensions(): void {
  cachedExtensions = null;
  lastLoadTime = 0;
}

/** Get workspace folder paths (VS Code API or fallback to cwd) */
function getWorkspaceFolders(): string[] {
  try {
    // In VS Code extension context, use the vscode API
    const vscode = require('vscode');
    return (vscode.workspace.workspaceFolders || []).map((f: { uri: { fsPath: string } }) => f.uri.fsPath);
  } catch {
    // Fallback: use current working directory
    return [process.cwd()];
  }
}
