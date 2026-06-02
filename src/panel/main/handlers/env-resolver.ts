/**
 * Shared environment variable resolution for all protocols.
 * Resolves {{var}}, ${var}, and $daakia_{var}_$ escape patterns.
 */
import { getAllEnvironments, getSetting } from '../../../storage/db';

/**
 * Load merged environment variables (dk_globals + global env + active env).
 * Priority (lowest → highest): dk_globals → Global env → Active env
 */
export function loadEnvVars(envId: string | undefined): Record<string, string> {
  const rows = getAllEnvironments();
  const vars: Record<string, string> = {};

  // dk.globals (script-set global vars — lowest priority)
  const dkGlobals = getSetting<Record<string, string>>('dk_globals');
  if (dkGlobals) {
    for (const [key, value] of Object.entries(dkGlobals)) {
      if (key) vars[key] = value;
    }
  }

  // Global environment (overrides dk_globals)
  const globalRow = rows.find(r => r.name === 'Global' || r.id === 'global');
  if (globalRow) {
    const globalVars = JSON.parse(globalRow.variables || '[]') as { key: string; currentValue?: string; initialValue?: string }[];
    for (const v of globalVars) {
      if (v.key) vars[v.key] = v.currentValue ?? v.initialValue ?? '';
    }
  }

  // Active environment (overrides global)
  const activeRow = envId
    ? rows.find(r => r.id === envId)
    : rows.find(r => r.is_active === 1);

  if (activeRow && activeRow !== globalRow) {
    const activeVars = JSON.parse(activeRow.variables || '[]') as { key: string; currentValue?: string; initialValue?: string }[];
    for (const v of activeVars) {
      if (v.key) vars[v.key] = v.currentValue ?? v.initialValue ?? '';
    }
  }

  return vars;
}

/**
 * Resolve all variable patterns in a string.
 * Supports: {{var}}, ${var}, $daakia_{var}_$ (escape → literal {{var}})
 */
export function resolveEnvString(input: string, vars: Record<string, string>): string {
  // First pass: escape syntax → placeholder
  let result = input.replace(/\$daakia_\{([\w.\-]+)\}_\$/g, (_m, varName) => `\x00ESC_DBL{${varName}}\x00`);
  result = result.replace(/\$daakia_\$([\w.\-]+)\$_\$/g, (_m, varName) => `\x00ESC_DLR{${varName}}\x00`);

  // Second pass: resolve {{var}} and ${var}
  result = result.replace(/\{\{([\w.\-]+)\}\}|\$\{([\w.\-]+)\}/g, (match, braceVar, dollarVar) => {
    const varName = braceVar || dollarVar;
    return vars[varName] ?? match;
  });

  // Third pass: restore escaped placeholders
  result = result.replace(/\x00ESC_DBL\{([\w.\-]+)\}\x00/g, (_m, varName) => `{{${varName}}}`);
  result = result.replace(/\x00ESC_DLR\{([\w.\-]+)\}\x00/g, (_m, varName) => `\${${varName}}`);
  return result;
}
