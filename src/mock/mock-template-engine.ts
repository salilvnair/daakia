/**
 * mock-template-engine.ts — Handlebars-compatible response templating engine.
 * Implements 6A.7 (template variables) and 6A.8 (built-in helpers).
 *
 * Supported syntax:
 *   {{request.url}}, {{request.headers.Authorization}}, {{request.body.email}}
 *   {{randomValue type='UUID'}}, {{now format='ISO'}}, {{faker.name.firstName}}
 *   {{upper value}}, {{lower value}}, {{trim value}}
 *   {{add x y}}, {{subtract x y}}, {{multiply x y}}, {{divide x y}}
 *   {{base64 value}}, {{md5 value}}, {{sha256 value}}, {{urlEncode value}}
 *   {{#if condition}}...{{/if}}, {{#each array}}...{{/each}}
 *   {{assign name value}}, {{val name}}
 */
import * as crypto from 'crypto';

export interface TemplateRequestContext {
  url: string;
  path: string;
  method: string;
  headers: Record<string, string>;
  cookies: Record<string, string>;
  queryParams: Record<string, string>;
  body: string;
  parsedBody?: unknown;
  pathParams: Record<string, string>;
  host: string;
  port: number;
  pathSegments: string[];
  stateVars?: Record<string, unknown>;
}

/**
 * Render a Handlebars-style template given a request context.
 */
export function renderTemplate(template: string, ctx: TemplateRequestContext): string {
  const vars: Record<string, unknown> = {}; // {{assign}} variables

  // Process block helpers first (if/each)
  let result = processBlockHelpers(template, ctx, vars);

  // Then process inline expressions
  result = processInlineExpressions(result, ctx, vars);

  return result;
}

// ─── Block helpers ────────────────────────────────────────────────────────────

function processBlockHelpers(
  template: string,
  ctx: TemplateRequestContext,
  vars: Record<string, unknown>,
): string {
  // {{#if expr}}...{{else}}...{{/if}}
  template = template.replace(
    /\{\{#if\s+([^}]+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,
    (_, expr, ifBody, elseBody = '') => {
      const val = resolveValue(expr.trim(), ctx, vars);
      const truthy = val && val !== 'false' && val !== '0' && val !== '';
      return truthy ? processBlockHelpers(ifBody, ctx, vars) : processBlockHelpers(elseBody, ctx, vars);
    },
  );

  // {{#each array}}...{{this}}...{{/each}}
  template = template.replace(
    /\{\{#each\s+([^}]+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (_, pathExpr, body) => {
      const arr = resolveValue(pathExpr.trim(), ctx, vars);
      if (!Array.isArray(arr)) return '';
      return arr.map((item, index) => {
        const itemCtx = { ...ctx };
        const itemVars = { ...vars, this: item, '@index': index, '@first': index === 0, '@last': index === arr.length - 1 };
        let itemBody = body.replace(/\{\{this(?:\.(\w+))?\}\}/g, (_: string, field: string) => {
          if (!field) return String(item ?? '');
          return String((item as Record<string, unknown>)?.[field] ?? '');
        });
        itemBody = processBlockHelpers(itemBody, itemCtx, itemVars);
        return processInlineExpressions(itemBody, itemCtx, itemVars);
      }).join('');
    },
  );

  // {{#range start end}}...{{this}}...{{/range}}
  template = template.replace(
    /\{\{#range\s+(\d+)\s+(\d+)\}\}([\s\S]*?)\{\{\/range\}\}/g,
    (_, startStr, endStr, body) => {
      const start = parseInt(startStr), end = parseInt(endStr);
      const arr = Array.from({ length: end - start }, (_, i) => start + i);
      return arr.map(i => body.replace(/\{\{this\}\}/g, String(i))).join('');
    },
  );

  return template;
}

// ─── Inline expression processor ─────────────────────────────────────────────

function processInlineExpressions(
  template: string,
  ctx: TemplateRequestContext,
  vars: Record<string, unknown>,
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, expr) => {
    try {
      return String(evaluateExpression(expr.trim(), ctx, vars) ?? '');
    } catch {
      return match; // leave unresolved expressions as-is
    }
  });
}

// ─── Expression evaluator ─────────────────────────────────────────────────────

function evaluateExpression(
  expr: string,
  ctx: TemplateRequestContext,
  vars: Record<string, unknown>,
): unknown {
  // Handle quoted strings
  if ((expr.startsWith("'") && expr.endsWith("'")) || (expr.startsWith('"') && expr.endsWith('"'))) {
    return expr.slice(1, -1);
  }

  // Parse helper name + args: helper arg1 arg2 key='value'
  const tokens = tokenize(expr);
  if (tokens.length === 0) return '';
  const [helperName, ...rawArgs] = tokens;
  const args = rawArgs.map(a => resolveArg(a, ctx, vars));

  // ─── Request context variables ─────────────────────────────────────────────
  if (helperName.startsWith('request.') || helperName.startsWith('state.')) {
    return resolveValue(helperName, ctx, vars);
  }

  // ─── Assign / val ──────────────────────────────────────────────────────────
  if (helperName === 'assign') {
    const name = rawArgs[0]?.replace(/['"]/g, '');
    const val = args[1] ?? '';
    if (name) vars[name] = val;
    return '';
  }
  if (helperName === 'val') {
    const name = rawArgs[0]?.replace(/['"]/g, '');
    return name ? vars[name] : '';
  }

  // ─── Random helpers ────────────────────────────────────────────────────────
  if (helperName === 'randomValue') {
    const opts = parseNamedArgs(rawArgs);
    const type = opts.type || 'UUID';
    return generateRandom(type.replace(/['"]/g, ''));
  }
  if (helperName === 'randomInt') {
    const min = parseInt(String(args[0] ?? '0'));
    const max = parseInt(String(args[1] ?? '100'));
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  if (helperName === 'randomDecimal') {
    const min = parseFloat(String(args[0] ?? '0'));
    const max = parseFloat(String(args[1] ?? '1'));
    return (Math.random() * (max - min) + min).toFixed(2);
  }
  if (helperName === 'pickRandom') {
    if (args.length === 0) return '';
    return args[Math.floor(Math.random() * args.length)];
  }

  // ─── Date/time helpers ─────────────────────────────────────────────────────
  if (helperName === 'now') {
    const opts = parseNamedArgs(rawArgs);
    const fmt = opts.format?.replace(/['"]/g, '') || 'ISO';
    const offset = parseInt(opts.offset?.replace(/['"]/g, '') || '0') || 0;
    const d = new Date(Date.now() + offset * 1000);
    return formatDate(d, fmt);
  }
  if (helperName === 'formatDate') {
    const d = new Date(String(args[0] || ''));
    const fmt = String(args[1] || 'ISO');
    return isNaN(d.getTime()) ? '' : formatDate(d, fmt);
  }

  // ─── String helpers ────────────────────────────────────────────────────────
  if (helperName === 'upper')     return String(args[0] ?? '').toUpperCase();
  if (helperName === 'lower')     return String(args[0] ?? '').toLowerCase();
  if (helperName === 'trim')      return String(args[0] ?? '').trim();
  if (helperName === 'capitalize') {
    const s = String(args[0] ?? '');
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }
  if (helperName === 'replace') {
    return String(args[0] ?? '').replaceAll(String(args[1] ?? ''), String(args[2] ?? ''));
  }
  if (helperName === 'substring') {
    return String(args[0] ?? '').slice(parseInt(String(args[1] ?? '0')), parseInt(String(args[2] ?? '999')));
  }
  if (helperName === 'split') {
    const parts = String(args[0] ?? '').split(String(args[1] ?? ','));
    const idx = args[2] !== undefined ? parseInt(String(args[2])) : undefined;
    return idx !== undefined ? (parts[idx] ?? '') : JSON.stringify(parts);
  }

  // ─── Math helpers ──────────────────────────────────────────────────────────
  if (helperName === 'add')      return Number(args[0] ?? 0) + Number(args[1] ?? 0);
  if (helperName === 'subtract') return Number(args[0] ?? 0) - Number(args[1] ?? 0);
  if (helperName === 'multiply') return Number(args[0] ?? 0) * Number(args[1] ?? 1);
  if (helperName === 'divide')   return Number(args[1] ?? 1) !== 0 ? Number(args[0] ?? 0) / Number(args[1]) : 0;
  if (helperName === 'mod')      return Number(args[0] ?? 0) % Number(args[1] ?? 1);

  // ─── JSON helpers ──────────────────────────────────────────────────────────
  if (helperName === 'jsonPath') {
    try {
      const obj = JSON.parse(String(args[0] ?? '{}'));
      return evaluateSimpleJsonPath(String(args[1] ?? '$'), obj);
    } catch { return ''; }
  }
  if (helperName === 'toJson') {
    try { return JSON.stringify(args[0], null, 2); } catch { return ''; }
  }
  if (helperName === 'parseJson') {
    try { return JSON.parse(String(args[0] ?? '{}')); } catch { return ''; }
  }
  if (helperName === 'formatJson') {
    try { return JSON.stringify(JSON.parse(String(args[0] ?? '{}')), null, 2); } catch { return String(args[0] ?? ''); }
  }

  // ─── Encoding helpers ──────────────────────────────────────────────────────
  if (helperName === 'base64') {
    const opts = parseNamedArgs(rawArgs);
    const val = String(args[0] ?? '');
    if (opts.decode === 'true') return Buffer.from(val, 'base64').toString('utf8');
    return Buffer.from(val).toString('base64');
  }
  if (helperName === 'urlEncode') {
    const opts = parseNamedArgs(rawArgs);
    if (opts.decode === 'true') return decodeURIComponent(String(args[0] ?? ''));
    return encodeURIComponent(String(args[0] ?? ''));
  }
  if (helperName === 'md5') {
    return crypto.createHash('md5').update(String(args[0] ?? '')).digest('hex');
  }
  if (helperName === 'sha256') {
    return crypto.createHash('sha256').update(String(args[0] ?? '')).digest('hex');
  }

  // ─── Conditional helpers ───────────────────────────────────────────────────
  if (helperName === 'eq')       return String(args[0]) === String(args[1]) ? 'true' : 'false';
  if (helperName === 'ne')       return String(args[0]) !== String(args[1]) ? 'true' : 'false';
  if (helperName === 'gt')       return Number(args[0]) > Number(args[1]) ? 'true' : 'false';
  if (helperName === 'lt')       return Number(args[0]) < Number(args[1]) ? 'true' : 'false';
  if (helperName === 'contains') return String(args[0]).includes(String(args[1])) ? 'true' : 'false';
  if (helperName === 'matches') {
    try { return new RegExp(String(args[1])).test(String(args[0])) ? 'true' : 'false'; }
    catch { return 'false'; }
  }

  // ─── Faker helpers ─────────────────────────────────────────────────────────
  if (helperName.startsWith('faker.')) {
    return generateFakerValue(helperName);
  }

  // ─── Array helpers ─────────────────────────────────────────────────────────
  if (helperName === 'arrayJoin') {
    try {
      const arr = typeof args[0] === 'string' ? JSON.parse(args[0] as string) : args[0];
      return Array.isArray(arr) ? arr.join(String(args[1] ?? ', ')) : '';
    } catch { return ''; }
  }

  // Fallback: try as a simple value path
  return resolveValue(helperName, ctx, vars);
}

// ─── Value resolver ───────────────────────────────────────────────────────────

function resolveValue(path: string, ctx: TemplateRequestContext, vars: Record<string, unknown>): unknown {
  if (vars[path] !== undefined) return vars[path];

  const parts = path.split('.');
  if (parts[0] === 'request') {
    const key = parts[1];
    if (key === 'url')    return ctx.url;
    if (key === 'path')   return ctx.path;
    if (key === 'method') return ctx.method;
    if (key === 'host')   return ctx.host;
    if (key === 'port')   return ctx.port;
    if (key === 'body') {
      if (parts.length === 2) return ctx.body;
      // request.body.field
      try {
        const obj = ctx.parsedBody ?? JSON.parse(ctx.body);
        return getNestedValue(obj as Record<string, unknown>, parts.slice(2));
      } catch { return ''; }
    }
    if (key === 'headers')     return parts[2] ? ctx.headers[parts[2]] ?? ctx.headers[parts[2].toLowerCase()] ?? '' : JSON.stringify(ctx.headers);
    if (key === 'query')       return parts[2] ? ctx.queryParams[parts[2]] ?? '' : JSON.stringify(ctx.queryParams);
    if (key === 'cookies')     return parts[2] ? ctx.cookies[parts[2]] ?? '' : JSON.stringify(ctx.cookies);
    if (key === 'pathSegments') {
      const idx = parseInt(parts[2] ?? '0');
      return ctx.pathSegments[idx] ?? '';
    }
    if (key === 'pathParams')  return parts[2] ? ctx.pathParams[parts[2]] ?? '' : JSON.stringify(ctx.pathParams);
  }

  if (parts[0] === 'state' && ctx.stateVars) {
    return parts[1] ? ctx.stateVars[parts[1]] : '';
  }

  return '';
}

function resolveArg(arg: string, ctx: TemplateRequestContext, vars: Record<string, unknown>): unknown {
  if ((arg.startsWith("'") && arg.endsWith("'")) || (arg.startsWith('"') && arg.endsWith('"'))) {
    return arg.slice(1, -1);
  }
  if (arg.includes('=')) return arg; // named arg, handled separately
  const num = Number(arg);
  if (!isNaN(num) && arg !== '') return num;
  return resolveValue(arg, ctx, vars);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tokenize(expr: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';
  for (const ch of expr) {
    if (!inQuote && (ch === "'" || ch === '"')) { inQuote = true; quoteChar = ch; current += ch; }
    else if (inQuote && ch === quoteChar) { inQuote = false; current += ch; }
    else if (!inQuote && ch === ' ') { if (current) { tokens.push(current); current = ''; } }
    else { current += ch; }
  }
  if (current) tokens.push(current);
  return tokens;
}

function parseNamedArgs(rawArgs: string[]): Record<string, string> {
  const opts: Record<string, string> = {};
  rawArgs.forEach(arg => {
    const eqIdx = arg.indexOf('=');
    if (eqIdx >= 0) {
      const k = arg.slice(0, eqIdx).trim();
      const v = arg.slice(eqIdx + 1).trim();
      opts[k] = v;
    }
  });
  return opts;
}

function getNestedValue(obj: Record<string, unknown>, parts: string[]): unknown {
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return '';
    current = (current as Record<string, unknown>)[part];
  }
  return current ?? '';
}

function evaluateSimpleJsonPath(path: string, obj: unknown): unknown {
  const parts = path.replace(/^\$\.?/, '').split(/[.\[\]]+/).filter(Boolean);
  let current = obj;
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return '';
    current = (current as Record<string, unknown>)[part];
  }
  return current ?? '';
}

function formatDate(d: Date, fmt: string): string {
  if (fmt === 'ISO') return d.toISOString();
  if (fmt === 'UTC') return d.toUTCString();
  if (fmt === 'epoch') return String(Math.floor(d.getTime() / 1000));
  if (fmt === 'ms') return String(d.getTime());
  // Simple format: YYYY-MM-DD HH:mm:ss
  return fmt
    .replace('YYYY', d.getFullYear().toString())
    .replace('MM', String(d.getMonth() + 1).padStart(2, '0'))
    .replace('DD', String(d.getDate()).padStart(2, '0'))
    .replace('HH', String(d.getHours()).padStart(2, '0'))
    .replace('mm', String(d.getMinutes()).padStart(2, '0'))
    .replace('ss', String(d.getSeconds()).padStart(2, '0'));
}

// ─── Random value generator ───────────────────────────────────────────────────

function generateRandom(type: string): string {
  switch (type.toUpperCase()) {
    case 'UUID':        return crypto.randomUUID();
    case 'ALPHABETIC':  return randomString(10, 'abcdefghijklmnopqrstuvwxyz');
    case 'ALPHANUMERIC':return randomString(12, 'abcdefghijklmnopqrstuvwxyz0123456789');
    case 'NUMERIC':     return randomString(8, '0123456789');
    case 'HEX':         return crypto.randomBytes(8).toString('hex');
    case 'EMAIL':       return `${randomString(6, 'abcdefghijklmnopqrstuvwxyz')}@example.com`;
    default:            return crypto.randomUUID();
  }
}

function randomString(len: number, chars: string): string {
  let result = '';
  for (let i = 0; i < len; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

// ─── Faker helpers ────────────────────────────────────────────────────────────

const FIRST_NAMES = ['Alice', 'Bob', 'Carol', 'David', 'Eve', 'Frank', 'Grace', 'Henry', 'Iris', 'Jack'];
const LAST_NAMES  = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Wilson', 'Moore'];
const CITIES      = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'Dallas', 'San Diego', 'San Jose'];
const COUNTRIES   = ['United States', 'Canada', 'United Kingdom', 'Germany', 'France', 'Japan', 'Australia', 'Brazil', 'India', 'China'];
const COMPANIES   = ['Acme Corp', 'Globex', 'Initech', 'Umbrella Corp', 'Stark Industries', 'Wayne Enterprises', 'Dunder Mifflin'];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function generateFakerValue(helper: string): string {
  const [, category, method] = helper.split('.');
  switch (`${category}.${method}`) {
    case 'name.firstName':    return pick(FIRST_NAMES);
    case 'name.lastName':     return pick(LAST_NAMES);
    case 'name.fullName':     return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    case 'internet.email':    return `${pick(FIRST_NAMES).toLowerCase()}.${pick(LAST_NAMES).toLowerCase()}@example.com`;
    case 'internet.url':      return `https://example.com/${randomString(6, 'abcdefghijklmnopqrstuvwxyz')}`;
    case 'address.city':      return pick(CITIES);
    case 'address.country':   return pick(COUNTRIES);
    case 'address.zipCode':   return randomString(5, '0123456789');
    case 'company.name':      return pick(COMPANIES);
    case 'phone.number':      return `+1-${randomString(3, '0123456789')}-${randomString(3, '0123456789')}-${randomString(4, '0123456789')}`;
    case 'lorem.word':        return pick(['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing']);
    case 'lorem.sentence':    return 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';
    case 'lorem.paragraph':   return 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';
    case 'datatype.number':   return String(Math.floor(Math.random() * 10000));
    case 'datatype.boolean':  return String(Math.random() > 0.5);
    case 'datatype.uuid':     return crypto.randomUUID();
    default:                  return `[faker.${category}.${method}]`;
  }
}
