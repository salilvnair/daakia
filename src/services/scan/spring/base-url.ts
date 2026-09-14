/**
 * Where a Spring app would actually serve from.
 *
 * ── Why this is not just the port ──
 *
 * `server.port` and `server.servlet.context-path` are two settings and both
 * change the URL. An app on 8443 with a context path of `/checkout-api/v2`
 * serves `/checkout-api/v2/api/checkout` — so getting the port right and
 * missing the prefix produces an entire collection of 404s that look like the
 * code is wrong rather than the scan.
 *
 * ── Why a profile is chosen, not merged ──
 *
 * `application-local.yml` and `application-prod.yml` disagree on purpose.
 * Merging them produces a host that exists nowhere. So one is picked, the
 * screen says which, and its values win over the base file's.
 *
 * YAML is read with a small indentation-aware reader rather than a parser.
 * Spring config is a nested map of scalars, which is the part of YAML that is
 * regular; pulling in a parser for it would be a dependency for six keys.
 */

import type { BaseUrl, Provenance, RepoRoot, SourceRef } from '../api-detector';

/** Keys that matter, in the dotted spelling `.properties` uses. */
const PORT = 'server.port';
const CONTEXT = 'server.servlet.context-path';
const CONTEXT_REACTIVE = 'spring.webflux.base-path';
const SSL = 'server.ssl.enabled';

export interface ConfigValue {
  value: string;
  at: SourceRef;
}

/**
 * Read `a.b.c` out of a `.properties` file.
 *
 * Last one wins, the way Spring reads them — a repeated key in a properties
 * file is an override, not a mistake.
 */
export function readProperties(text: string, file: string): Map<string, ConfigValue> {
  const out = new Map<string, ConfigValue>();
  text.split(/\r?\n/).forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('!')) return;
    const eq = trimmed.search(/[=:]/);
    if (eq < 0) return;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key) out.set(key, { value, at: { file, line: i + 1, snippet: trimmed } });
  });
  return out;
}

/**
 * Read a Spring YAML file into the same dotted map.
 *
 * Indentation-aware: a stack of (indent, key) is enough for a tree of scalars,
 * which is all Spring configuration is. Lists and anchors are ignored rather
 * than half-understood.
 */
export function readYaml(text: string, file: string): Map<string, ConfigValue> {
  const out = new Map<string, ConfigValue>();
  const stack: { indent: number; key: string }[] = [];

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/\t/g, '  ');
    if (line.trim() === '' || line.trim().startsWith('#')) return;
    /* A document separator resets the tree: `---` starts a new profile block. */
    if (line.trim() === '---') { stack.length = 0; return; }
    if (line.trim().startsWith('-')) return;              // lists: not needed here

    const indent = line.length - line.trimStart().length;
    const m = /^([\w.$-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (!m) return;
    const [, key, rest] = m;

    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();

    if (rest === '' || rest.startsWith('#')) {
      stack.push({ indent, key });
      return;
    }
    const path = [...stack.map(s => s.key), key].join('.');
    const value = rest.replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '');
    out.set(path, { value, at: { file, line: i + 1, snippet: line.trim() } });
  });

  return out;
}

/** Every Spring config file in the repo, base first then profiles. */
export function configFiles(root: RepoRoot): string[] {
  return root.files.filter(f =>
    /(^|\/)application(-[\w.-]+)?\.(ya?ml|properties)$/.test(f)
    /* Test configuration describes a test run, not the app you want to call. */
    && !/(^|\/)(test|it)\//.test(f)
    && !/src\/test\//.test(f));
}

/** The profile suffix of a config file, or undefined for the base file. */
export function profileOf(file: string): string | undefined {
  return /application-([\w.-]+)\.(ya?ml|properties)$/.exec(file)?.[1];
}

/** Every profile the repo has a file for. */
export function profiles(root: RepoRoot): string[] {
  const out: string[] = [];
  for (const f of configFiles(root)) {
    const p = profileOf(f);
    if (p && !out.includes(p)) out.push(p);
  }
  return out.sort();
}

function readFile(root: RepoRoot, file: string): Map<string, ConfigValue> {
  const text = root.read(file);
  if (!text) return new Map();
  return /\.(ya?ml)$/.test(file) ? readYaml(text, file) : readProperties(text, file);
}

/**
 * The effective configuration: the base file, then the chosen profile over it.
 *
 * `${PORT:8080}` — a placeholder with a default — resolves to the default,
 * because that is what the app does when the variable is unset, which is the
 * situation somebody scanning a repository is in.
 */
export function effectiveConfig(root: RepoRoot, profile?: string): Map<string, ConfigValue> {
  const merged = new Map<string, ConfigValue>();
  for (const f of configFiles(root)) {
    const p = profileOf(f);
    if (p !== undefined && p !== profile) continue;
    for (const [k, v] of readFile(root, f)) {
      merged.set(k, { ...v, value: resolvePlaceholder(v.value) });
    }
  }
  return merged;
}

/** `${SERVER_PORT:8443}` → `8443`; `${SERVER_PORT}` → unresolvable. */
export function resolvePlaceholder(value: string): string {
  const m = /^\$\{([^:}]+)(?::([^}]*))?\}$/.exec(value.trim());
  if (!m) return value;
  return m[2] ?? '';
}

/**
 * Put the base URL together, keeping where each part came from.
 *
 * The parts are reported separately because the screen shows the working: a
 * wrong context path is invisible in a finished URL and obvious in a list of
 * three lines that each name a file.
 */
export function springBaseUrl(root: RepoRoot, profile?: string): BaseUrl | undefined {
  const cfg = effectiveConfig(root, profile);
  if (cfg.size === 0) return undefined;

  const portCfg = cfg.get(PORT);
  const ctxCfg = cfg.get(CONTEXT) ?? cfg.get(CONTEXT_REACTIVE);
  const sslCfg = cfg.get(SSL);

  const port = portCfg?.value && /^\d+$/.test(portCfg.value) ? portCfg.value : '8080';
  const portProv: Provenance = portCfg && /^\d+$/.test(portCfg.value)
    ? { kind: 'read', at: portCfg.at }
    : { kind: 'generated', rule: 'server.port unset — Spring defaults to 8080' };

  const secure = sslCfg?.value === 'true';
  const schemeProv: Provenance = sslCfg
    ? { kind: 'read', at: sslCfg.at }
    : { kind: 'generated', rule: 'server.ssl.enabled unset — http' };

  const context = (ctxCfg?.value ?? '').trim();
  const clean = context === '' || context === '/'
    ? ''
    : '/' + context.replace(/^\/+/, '').replace(/\/+$/, '');

  return {
    url: `${secure ? 'https' : 'http'}://localhost:${port}${clean}`,
    parts: {
      scheme: schemeProv,
      port: portProv,
      ...(ctxCfg ? { contextPath: { kind: 'read' as const, at: ctxCfg.at } } : {}),
    },
  };
}
