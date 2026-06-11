import { SCHEMA } from './core';

export function generateYaml(): string {
  const computed = getComputedStyle(document.documentElement);
  const lines = [
    '# Daakia Theme Configuration',
    `# Exported: ${new Date().toISOString()}`,
    '# Edit color values and upload back to apply live — no rebuild needed.',
    '',
  ];
  let currentGroup = '';
  for (const entry of SCHEMA) {
    if (entry.group !== currentGroup) {
      if (currentGroup) lines.push('');
      lines.push(`${entry.group}:`);
      currentGroup = entry.group;
    }
    const val = computed.getPropertyValue(entry.cssVar).trim() || 'inherit';
    lines.push(`  ${entry.key}: "${val}"  # ${entry.comment}  (${entry.cssVar})`);
  }
  lines.push('');
  return lines.join('\n');
}

export function parseThemeYaml(text: string): Record<string, string> {
  const map: Record<string, string> = {};
  let currentGroup = '';
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line || line.trim().startsWith('#')) continue;
    const stripped = line.trimStart();
    const indent   = line.length - stripped.length;
    const content  = stripped.replace(/#.*$/, '').trimEnd();
    if (indent === 0) {
      if (content.endsWith(':') && !content.includes(': ')) {
        currentGroup = content.slice(0, -1).trim();
      }
    } else if (indent > 0 && currentGroup) {
      const colonIdx = content.indexOf(':');
      if (colonIdx > 0) {
        const yamlKey = content.slice(0, colonIdx).trim();
        let value     = content.slice(colonIdx + 1).trim();
        if (value.length >= 2 &&
          ((value[0] === '"' && value[value.length - 1] === '"') ||
           (value[0] === "'" && value[value.length - 1] === "'"))) {
          value = value.slice(1, -1);
        }
        if (value) {
          const entry = SCHEMA.find(s => s.group === currentGroup && s.key === yamlKey);
          if (entry) map[entry.cssVar] = value;
        }
      }
    }
  }
  return map;
}

export function applyThemeVars(cssVarMap: Record<string, string>): void {
  for (const [cssVar, value] of Object.entries(cssVarMap)) {
    document.documentElement.style.setProperty(cssVar, value);
  }
}

export function resetThemeVars(): void {
  for (const entry of SCHEMA) {
    document.documentElement.style.removeProperty(entry.cssVar);
  }
}

export function readCurrentColors(): Record<string, string> {
  const computed = getComputedStyle(document.documentElement);
  const result: Record<string, string> = {};
  for (const entry of SCHEMA) {
    result[entry.cssVar] = computed.getPropertyValue(entry.cssVar).trim();
  }
  return result;
}

export function toHexSafe(val: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(val.trim())) return val.trim();
  return '#6366f1';
}
