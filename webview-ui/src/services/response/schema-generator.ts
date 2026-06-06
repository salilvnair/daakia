/**
 * Schema generation from JSON response data.
 * Static generators exist for: typescript, javascript, python-dataclass, java.
 * All other langs use AI-powered generation (see schema-prompts.ts).
 */

export type SchemaLang =
  // TypeScript
  | 'typescript'
  | 'typescript-zod'
  // JSON
  | 'json-schema'
  // JavaScript
  | 'javascript'
  // Python
  | 'python-pydantic'
  | 'python-dataclass'
  // JVM
  | 'java'
  | 'kotlin'
  // Systems
  | 'go'
  | 'rust'
  // .NET / Mobile
  | 'csharp'
  | 'swift';

export function generateSchema(data: unknown, lang: SchemaLang): string {
  if (lang === 'typescript') return generateTsSchema(data);
  if (lang === 'javascript') return generateJsSchema(data);
  if (lang === 'python-dataclass') return generatePySchema(data);
  if (lang === 'java') return generateJavaSchema(data);
  // All other langs require AI generation
  return `// Static generation not available for this language.\n// Switch to AI mode to generate a ${lang} schema.`;
}

// ── Shared helpers ──

function inferType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── TypeScript ──

function generateTsSchema(data: unknown, name = 'JSONSchema'): string {
  const interfaces: string[] = [];

  function process(obj: unknown, iName: string): string {
    if (typeof obj !== 'object' || obj === null) return inferTsType(obj);
    if (Array.isArray(obj)) {
      if (obj.length === 0) return 'any[]';
      const itemType = process(obj[0], iName + 'Item');
      return `${itemType}[]`;
    }

    const fields: string[] = [];
    for (const [key, val] of Object.entries(obj)) {
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        const subName = capitalize(key);
        process(val, subName);
        fields.push(`    ${key}: ${subName};`);
      } else if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
        const subName = capitalize(key) + 'Item';
        process(val[0], subName);
        fields.push(`    ${key}: ${subName}[];`);
      } else {
        fields.push(`    ${key}: ${inferTsType(val)};`);
      }
    }
    interfaces.push(`export interface ${iName} {\n${fields.join('\n')}\n}`);
    return iName;
  }

  function inferTsType(val: unknown): string {
    if (val === null) return 'null';
    if (Array.isArray(val)) {
      if (val.length === 0) return 'any[]';
      return `${inferTsType(val[0])}[]`;
    }
    const t = typeof val;
    if (t === 'string') return 'string';
    if (t === 'number') return 'number';
    if (t === 'boolean') return 'boolean';
    return 'any';
  }

  const source = Array.isArray(data) && data.length > 0 ? data[0] : data;
  process(source, name);
  return interfaces.join('\n\n') + '\n';
}

// ── JavaScript ──

function generateJsSchema(data: unknown): string {
  const source = Array.isArray(data) && data.length > 0 ? data[0] : data;

  function buildShape(obj: unknown, indent = '  '): string {
    if (typeof obj !== 'object' || obj === null) return `"${typeof obj}"`;
    const entries = Object.entries(obj as Record<string, unknown>).map(([k, v]) => {
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        return `${indent}${k}: ${buildShape(v, indent + '  ')}`;
      }
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') {
        return `${indent}${k}: [${buildShape(v[0], indent + '  ')}]`;
      }
      return `${indent}${k}: "${inferType(v)}"`;
    });
    return `{\n${entries.join(',\n')}\n${indent.slice(2)}}`;
  }

  return `/** @typedef {Object} JSONSchema\n${describeFields(source, ' * ')}\n */\n\nconst schema = ${buildShape(source)};\n`;
}

function describeFields(obj: unknown, prefix: string): string {
  if (typeof obj !== 'object' || obj === null) return '';
  return Object.entries(obj as Record<string, unknown>).map(([k, v]) =>
    `${prefix}@property {${typeof v === 'object' ? 'Object' : typeof v}} ${k}`
  ).join('\n');
}

// ── Python ──

function generatePySchema(data: unknown): string {
  const source = Array.isArray(data) && data.length > 0 ? data[0] : data;
  const lines = ['from dataclasses import dataclass', 'from typing import List, Optional', '', ''];

  function process(obj: unknown, name: string) {
    if (typeof obj !== 'object' || obj === null) return;
    const fields: string[] = [];
    const nested: [string, unknown][] = [];

    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        const subName = capitalize(k);
        nested.push([subName, v]);
        fields.push(`    ${k}: ${subName}`);
      } else if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') {
        const subName = capitalize(k);
        nested.push([subName, v[0]]);
        fields.push(`    ${k}: List[${subName}]`);
      } else {
        fields.push(`    ${k}: ${pyType(v)}`);
      }
    }

    for (const [n, o] of nested) process(o, n);
    lines.push(`@dataclass`);
    lines.push(`class ${name}:`);
    lines.push(...fields);
    lines.push('');
  }

  function pyType(v: unknown): string {
    if (v === null) return 'Optional[str]';
    if (typeof v === 'string') return 'str';
    if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'float';
    if (typeof v === 'boolean') return 'bool';
    return 'str';
  }

  process(source, 'JSONSchema');
  return lines.join('\n') + '\n';
}

// ── Java ──

function generateJavaSchema(data: unknown): string {
  const source = Array.isArray(data) && data.length > 0 ? data[0] : data;
  const classes: string[] = [];

  function process(obj: unknown, name: string) {
    if (typeof obj !== 'object' || obj === null) return;
    const fields: string[] = [];
    const nested: [string, unknown][] = [];

    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        const subName = capitalize(k);
        nested.push([subName, v]);
        fields.push(`    private ${subName} ${k};`);
      } else if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') {
        const subName = capitalize(k);
        nested.push([subName, v[0]]);
        fields.push(`    private List<${subName}> ${k};`);
      } else {
        fields.push(`    private ${javaType(v)} ${k};`);
      }
    }

    for (const [n, o] of nested) process(o, n);
    classes.push(`public class ${name} {\n${fields.join('\n')}\n}`);
  }

  function javaType(v: unknown): string {
    if (v === null) return 'String';
    if (typeof v === 'string') return 'String';
    if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'double';
    if (typeof v === 'boolean') return 'boolean';
    return 'Object';
  }

  process(source, 'JSONSchema');
  return `import java.util.List;\n\n${classes.join('\n\n')}\n`;
}
