/** Pure jq-like filter engine for JSON data */

export function applyJqFilter(data: unknown, query: string): unknown {
  if (query === '.') return data;

  // Handle leading dot
  let path = query.startsWith('.') ? query.slice(1) : query;
  if (!path) return data;

  let current: any = data;

  // Tokenize: split on dots but respect [] brackets
  const tokens: string[] = [];
  let buf = '';
  for (let i = 0; i < path.length; i++) {
    const ch = path[i];
    if (ch === '.' && buf) { tokens.push(buf); buf = ''; }
    else if (ch === '[') {
      if (buf) { tokens.push(buf); buf = ''; }
      const end = path.indexOf(']', i);
      if (end === -1) throw new Error(`jq: error: unmatched '[' at position ${i}`);
      tokens.push(path.slice(i, end + 1));
      i = end;
    } else if (ch !== '.') {
      buf += ch;
    }
  }
  if (buf) tokens.push(buf);

  for (const token of tokens) {
    if (current === undefined || current === null) {
      throw new Error(`jq: error: null cannot be indexed by "${token}"`);
    }

    // Array iteration: []
    if (token === '[]') {
      if (!Array.isArray(current)) throw new Error(`jq: error: cannot iterate over non-array`);
      const remaining = tokens.slice(tokens.indexOf(token) + 1);
      if (remaining.length === 0) return current;
      return current.map(item => applyJqFilter(item, '.' + remaining.join('.')));
    }

    // Array index: [0], [1], etc.
    const idxMatch = token.match(/^\[(\d+)\]$/);
    if (idxMatch) {
      const idx = parseInt(idxMatch[1]);
      if (!Array.isArray(current)) throw new Error(`jq: error: cannot index non-array with ${idx}`);
      if (idx >= current.length) throw new Error(`jq: error: index ${idx} out of bounds (length ${current.length})`);
      current = current[idx];
      continue;
    }

    // Object field access
    if (typeof current !== 'object' || current === null) {
      throw new Error(`jq: error: ${token} is not defined at <top-level>`);
    }
    if (!(token in current)) {
      throw new Error(`jq: error: ${token}/0 is not defined at <top-level>, ...`);
    }
    current = current[token];
  }

  return current;
}
