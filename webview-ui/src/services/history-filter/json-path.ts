/**
 * The small half of JSONPath — the half people actually type into a filter.
 *
 * ── Why a subset, and why our own ──
 *
 * A filter row asks "does `$.data.items[*].sku` contain ABC". It does not ask
 * for script expressions, filters or slices, and a full JSONPath implementation
 * would bring an evaluator that can run arbitrary expressions against strings
 * that came out of somebody else's server. The subset below covers the paths a
 * person writes by hand and has nothing in it that executes.
 *
 * Supported: `$`, `.name`, `['name']`, `[0]`, `[*]`, `..name` (recursive
 * descent). Anything else makes the path invalid, which the panel says out loud
 * rather than silently matching nothing.
 *
 * ── Why it returns a list ──
 *
 * `$.items[*].sku` has as many answers as there are items, and a condition on
 * it means "any of them". Collapsing to the first would make `equals` quietly
 * mean "the first one equals", which is a different filter and a wrong one.
 */

type Step =
  | { kind: 'key'; name: string }
  | { kind: 'index'; at: number }
  | { kind: 'wildcard' }
  | { kind: 'descend'; name: string };

export interface ParsedPath {
  steps: Step[];
}

/** `undefined` when the path is not one we can run — never a silent empty. */
export function parsePath(input: string): ParsedPath | undefined {
  let rest = input.trim();
  if (!rest) return undefined;
  /* A leading `$` is conventional but not required: somebody who typed
     `data.items` meant the same path and should not have to be told. */
  if (rest.startsWith('$')) rest = rest.slice(1);

  const steps: Step[] = [];
  while (rest.length > 0) {
    if (rest.startsWith('..')) {
      const m = rest.slice(2).match(/^([A-Za-z_$][\w$-]*)/);
      if (!m) return undefined;
      steps.push({ kind: 'descend', name: m[1] });
      rest = rest.slice(2 + m[1].length);
      continue;
    }
    if (rest.startsWith('.')) {
      const after = rest.slice(1);
      if (after.startsWith('*')) { steps.push({ kind: 'wildcard' }); rest = after.slice(1); continue; }
      const m = after.match(/^([A-Za-z_$][\w$-]*)/);
      if (!m) return undefined;
      steps.push({ kind: 'key', name: m[1] });
      rest = after.slice(m[1].length);
      continue;
    }
    if (rest.startsWith('[')) {
      const close = rest.indexOf(']');
      if (close < 0) return undefined;
      const inner = rest.slice(1, close).trim();
      rest = rest.slice(close + 1);
      if (inner === '*') { steps.push({ kind: 'wildcard' }); continue; }
      const quoted = inner.match(/^'([^']*)'$/) ?? inner.match(/^"([^"]*)"$/);
      if (quoted) { steps.push({ kind: 'key', name: quoted[1] }); continue; }
      if (/^-?\d+$/.test(inner)) { steps.push({ kind: 'index', at: Number(inner) }); continue; }
      return undefined;
    }
    /* A bare first segment, as in `data.items` — only legal at the start. */
    if (steps.length === 0) {
      const m = rest.match(/^([A-Za-z_$][\w$-]*)/);
      if (!m) return undefined;
      steps.push({ kind: 'key', name: m[1] });
      rest = rest.slice(m[1].length);
      continue;
    }
    return undefined;
  }
  return { steps };
}

/** Every value the path reaches. Empty means the path matched nothing. */
export function queryPath(root: unknown, path: ParsedPath): unknown[] {
  let current: unknown[] = [root];
  for (const step of path.steps) {
    const next: unknown[] = [];
    for (const node of current) {
      switch (step.kind) {
        case 'key':
          if (node && typeof node === 'object' && !Array.isArray(node)) {
            const rec = node as Record<string, unknown>;
            if (step.name in rec) next.push(rec[step.name]);
          } else if (Array.isArray(node)) {
            /* `items.sku` over an array means every element's `sku`, which is
               what a person writing the short form meant. */
            for (const el of node) {
              if (el && typeof el === 'object' && step.name in (el as object)) {
                next.push((el as Record<string, unknown>)[step.name]);
              }
            }
          }
          break;
        case 'index':
          if (Array.isArray(node)) {
            const at = step.at < 0 ? node.length + step.at : step.at;
            if (at >= 0 && at < node.length) next.push(node[at]);
          }
          break;
        case 'wildcard':
          if (Array.isArray(node)) next.push(...node);
          else if (node && typeof node === 'object') next.push(...Object.values(node as object));
          break;
        case 'descend':
          collect(node, step.name, next);
          break;
      }
    }
    current = next;
    if (current.length === 0) return current;
  }
  return current;
}

function collect(node: unknown, name: string, out: unknown[]): void {
  if (Array.isArray(node)) { for (const el of node) collect(el, name, out); return; }
  if (!node || typeof node !== 'object') return;
  const rec = node as Record<string, unknown>;
  if (name in rec) out.push(rec[name]);
  for (const value of Object.values(rec)) collect(value, name, out);
}

/**
 * How a found value is compared against typed text.
 *
 * Everything becomes a string, because the value in the box is a string and
 * `status: 200` should be found by typing `200`. Objects serialise so that
 * `contains` can still look inside one.
 */
export function asText(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return '';
  if (typeof value === 'object') { try { return JSON.stringify(value); } catch { return ''; } }
  return String(value);
}
