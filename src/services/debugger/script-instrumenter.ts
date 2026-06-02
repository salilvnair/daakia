/**
 * Script Instrumenter — Source-level instrumentation for breakpoint debugging.
 *
 * Injects `await __bp(lineNo, captureFn)` before every non-blank statement.
 * The async __bp function pauses execution when a breakpoint is hit or step mode is active.
 */

// ─── Static analysis ──────────────────────────────────────────────────────────

function collectVarNames(lines: string[], beforeIdx: number): string[] {
  const vars = new Set<string>(['dk', 'daakia']);
  const declRe = /(?:const|let|var)\s+([\w$]+)\s*(?:=|,|;|\n|$)/g;
  const destructRe = /(?:const|let|var)\s+\{([^}]+)\}/g;
  const fnParamRe = /function\s*[\w$]*\s*\(([^)]*)\)/g;
  const arrowParamRe = /(?:^|\s)\(([^)]*)\)\s*=>/g;

  for (let i = 0; i < beforeIdx && i < lines.length; i++) {
    const line = lines[i];
    let m: RegExpExecArray | null;

    declRe.lastIndex = 0;
    while ((m = declRe.exec(line)) !== null) {
      if (m[1] && /^[\w$]+$/.test(m[1])) vars.add(m[1]);
    }

    destructRe.lastIndex = 0;
    while ((m = destructRe.exec(line)) !== null) {
      m[1].split(',').forEach(p => {
        const name = p.trim().split(':')[0].trim().replace(/[=\s].*/, '');
        if (name && /^[\w$]+$/.test(name)) vars.add(name);
      });
    }

    fnParamRe.lastIndex = 0;
    while ((m = fnParamRe.exec(line)) !== null) {
      m[1].split(',').forEach(p => {
        const name = p.trim().replace(/[=\s].*/, '').replace(/^\.\.\./, '');
        if (name && /^[\w$]+$/.test(name)) vars.add(name);
      });
    }

    arrowParamRe.lastIndex = 0;
    while ((m = arrowParamRe.exec(line)) !== null) {
      m[1].split(',').forEach(p => {
        const name = p.trim().replace(/[=\s].*/, '').replace(/^\.\.\./, '');
        if (name && /^[\w$]+$/.test(name)) vars.add(name);
      });
    }
  }

  return [...vars];
}

function buildCaptureFn(varNames: string[]): string {
  if (!varNames.length) return '() => ({})';
  // Capture each variable independently — if one is out of scope, others still get captured
  const captures = varNames.map(v => `try { __v.${v} = ${v}; } catch(_) {}`).join(' ');
  return `() => { const __v = {}; ${captures} return __v; }`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

const CONTINUATION_RE = /^[.?:&|,)]|^\?\./;

/**
 * Count net open braces/brackets/parens in a line (ignoring those in strings/comments).
 * Returns positive for more openers, negative for more closers.
 */
function netBraceDepthChange(line: string): number {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (inLineComment) break;

    // Toggle string states (with escape handling)
    if (ch === '\\' && (inSingle || inDouble || inTemplate)) { i++; continue; }
    if (ch === "'" && !inDouble && !inTemplate) { inSingle = !inSingle; continue; }
    if (ch === '"' && !inSingle && !inTemplate) { inDouble = !inDouble; continue; }
    if (ch === '`' && !inSingle && !inDouble) { inTemplate = !inTemplate; continue; }

    if (inSingle || inDouble || inTemplate) continue;

    // Line comment
    if (ch === '/' && next === '/') { inLineComment = true; continue; }
    // Block comment start (simplified — skip rest)
    if (ch === '/' && next === '*') { inLineComment = true; continue; }

    if (ch === '{' || ch === '(' || ch === '[') depth++;
    if (ch === '}' || ch === ')' || ch === ']') depth--;
  }

  return depth;
}

/**
 * Instrument source by injecting `await __bp(lineNo, captureFn)` before every statement.
 * Only injects at brace depth 0 (top-level statements), skipping lines inside
 * multi-line object literals, arrays, and function call arguments.
 */
export function instrumentSource(source: string): string {
  const lines = source.split('\n');
  const result: string[] = [];
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const trimmed = lines[i].trim();

    // Only inject breakpoints at top-level (braceDepth === 0)
    if (trimmed.length > 0 && !CONTINUATION_RE.test(trimmed) && braceDepth === 0) {
      const varNames = collectVarNames(lines, i);
      const captureFn = buildCaptureFn(varNames);
      const indent = lines[i].match(/^(\s*)/)?.[1] || '';
      result.push(`${indent}await __bp(${lineNo}, ${captureFn});`);
    }

    result.push(lines[i]);

    // Update brace depth AFTER pushing the line
    if (trimmed.length > 0) {
      braceDepth += netBraceDepthChange(lines[i]);
      if (braceDepth < 0) braceDepth = 0; // safety clamp
    }
  }

  return result.join('\n');
}

/**
 * Serialize a runtime value for safe transport to webview.
 */
export function serializeVar(v: unknown, depth = 0): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'function') return `<Function: ${(v as { name?: string }).name || 'anonymous'}>`;
  if (v instanceof Promise) return '<Promise>';
  if (v instanceof Error) return `<Error: ${v.message}>`;
  if (v instanceof Buffer) return `<Buffer length=${v.length}>`;
  if (depth > 3) return '<nested>';

  // For objects/arrays, enumerate all keys including those with function values
  if (typeof v === 'object') {
    try {
      const keys = Object.keys(v as object);
      if (Array.isArray(v)) {
        if (v.length > 50) return `<Array(${v.length})>`;
        return v.slice(0, 50).map(item => serializeVar(item, depth + 1));
      }
      const result: Record<string, unknown> = {};
      for (const key of keys.slice(0, 50)) {
        const val = (v as Record<string, unknown>)[key];
        result[key] = serializeVar(val, depth + 1);
      }
      return result;
    } catch {
      try { return String(v); } catch { return '<unserializable>'; }
    }
  }

  try {
    const json = JSON.stringify(v);
    if (json.length > 2000) return JSON.parse(json.slice(0, 2000) + '..."truncated"');
    return JSON.parse(json);
  } catch {
    try { return String(v); } catch { return '<unserializable>'; }
  }
}
