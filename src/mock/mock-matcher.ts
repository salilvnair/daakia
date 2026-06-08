/**
 * mock-matcher.ts — Advanced request matching engine for WireMock-grade routing.
 * Implements 6A.1 (URL), 6A.2 (headers/cookies), 6A.3 (body), 6A.4 (composite AND/OR/NOT).
 */
import type { MockRoute, MatchRule, BodyMatcher, UrlMatchConfig, MatchType } from './mock-types';

// ─── URL Matching (6A.1) ─────────────────────────────────────────────────────

/**
 * Returns the matched path params if the route URL pattern matches the request path.
 * Returns null if no match.
 */
export function matchUrl(
  routePath: string,
  requestPath: string,
  urlMatch?: UrlMatchConfig,
): { matched: boolean; params: Record<string, string> } {
  const params: Record<string, string> = {};

  if (!urlMatch || urlMatch.type === 'exact' || urlMatch.type === 'template') {
    // Legacy: colon-param matching (/:id)
    if (routePath === requestPath) return { matched: true, params };
    const matched = matchColonParams(urlMatch?.type === 'template' ? (urlMatch.value || routePath) : routePath, requestPath, params);
    return { matched, params };
  }

  const pattern = urlMatch.value || routePath;
  const ci = urlMatch.caseInsensitive;
  const testPath = ci ? requestPath.toLowerCase() : requestPath;
  const testPattern = ci ? pattern.toLowerCase() : pattern;

  switch (urlMatch.type) {
    case 'regex': {
      try {
        const re = new RegExp(testPattern);
        const m = re.exec(testPath);
        if (m) {
          // Named capture groups → params
          if (m.groups) Object.assign(params, m.groups);
          return { matched: true, params };
        }
      } catch { /* invalid regex */ }
      return { matched: false, params };
    }
    case 'glob': {
      const reStr = globToRegex(testPattern);
      const re = new RegExp(`^${reStr}$`);
      return { matched: re.test(testPath), params };
    }
    case 'pathPrefix': {
      return { matched: testPath.startsWith(testPattern), params };
    }
    default:
      return { matched: matchColonParams(routePath, requestPath, params), params };
  }
}

function matchColonParams(routePath: string, requestPath: string, params: Record<string, string>): boolean {
  const routeParts = routePath.split('/').filter(Boolean);
  const reqParts = requestPath.split('/').filter(Boolean);
  if (routeParts.length !== reqParts.length) return false;
  return routeParts.every((part, i) => {
    if (part.startsWith(':')) { params[part.slice(1)] = reqParts[i]; return true; }
    return part === reqParts[i];
  });
}

/** Convert glob pattern to regex string: * → [^/]*, ** → .*, ? → [^/] */
function globToRegex(glob: string): string {
  return glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '[^/]*')
    .replace(//g, '.*')
    .replace(/\?/g, '[^/]');
}

// ─── Extract path params from colon-style route ───────────────────────────────

export function extractPathParams(routePath: string, requestPath: string): Record<string, string> {
  const params: Record<string, string> = {};
  matchColonParams(routePath, requestPath, params);
  return params;
}

// ─── Header/Cookie/Query Matching (6A.2) ────────────────────────────────────

export function matchRules(
  matchers: MatchRule[],
  values: Record<string, string | string[]>,
  logic: 'AND' | 'OR' = 'AND',
): boolean {
  if (matchers.length === 0) return true;

  const results = matchers.map(rule => {
    const raw = values[rule.key] ?? values[rule.key.toLowerCase()];
    const actualValue = Array.isArray(raw) ? raw.join(', ') : (raw ?? '');
    const result = applyMatchRule(rule, actualValue);
    return rule.negate ? !result : result;
  });

  return logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
}

function applyMatchRule(rule: MatchRule, value: string): boolean {
  const ruleValue = rule.caseInsensitive ? rule.value.toLowerCase() : rule.value;
  const testValue = rule.caseInsensitive ? value.toLowerCase() : value;

  switch (rule.matchType as MatchType) {
    case 'equalTo':       return testValue === ruleValue;
    case 'contains':      return testValue.includes(ruleValue);
    case 'startsWith':    return testValue.startsWith(ruleValue);
    case 'endsWith':      return testValue.endsWith(ruleValue);
    case 'notContaining': return !testValue.includes(ruleValue);
    case 'present':       return value !== '';
    case 'absent':        return value === '';
    case 'regex': {
      try { return new RegExp(rule.value, rule.caseInsensitive ? 'i' : '').test(value); }
      catch { return false; }
    }
    default: return true;
  }
}

// ─── Body Matching (6A.3) ───────────────────────────────────────────────────

export function matchBody(matcher: BodyMatcher, body: string): boolean {
  const result = applyBodyMatcher(matcher, body);
  return matcher.negate ? !result : result;
}

function applyBodyMatcher(matcher: BodyMatcher, body: string): boolean {
  switch (matcher.matchType) {
    case 'equalTo':
      return body.trim() === matcher.value.trim();

    case 'contains':
      return body.includes(matcher.value);

    case 'regex': {
      try { return new RegExp(matcher.value).test(body); }
      catch { return false; }
    }

    case 'equalToJson': {
      try {
        const a = JSON.parse(body);
        const b = JSON.parse(matcher.value);
        return deepEqual(a, b, {
          ignoreArrayOrder: matcher.ignoreArrayOrder,
          ignoreExtraElements: matcher.ignoreExtraElements,
        });
      } catch { return false; }
    }

    case 'matchesJsonPath': {
      try {
        const obj = JSON.parse(body);
        return evaluateJsonPath(matcher.value, obj) !== undefined;
      } catch { return false; }
    }

    case 'matchesJsonSchema': {
      try {
        const obj = JSON.parse(body);
        const schema = JSON.parse(matcher.value);
        return validateJsonSchema(obj, schema);
      } catch { return false; }
    }

    case 'equalToXml': {
      // Structural XML comparison (strip whitespace, compare normalized)
      return normalizeXml(body) === normalizeXml(matcher.value);
    }

    case 'matchesXPath': {
      // Simple XPath: just check if element exists by name
      return evaluateSimpleXPath(matcher.value, body);
    }

    default:
      return true;
  }
}

// ─── Full route matching (combines all conditions) ───────────────────────────

interface RequestContext {
  method: string;
  path: string;
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  cookies: Record<string, string>;
  body: string;
}

export function routeMatchesRequest(
  route: MockRoute,
  ctx: RequestContext,
): { matched: boolean; params: Record<string, string> } {
  if (!route.enabled) return { matched: false, params: {} };

  // Method matching
  if (route.method !== 'ANY' && route.method !== ctx.method.toUpperCase()) {
    return { matched: false, params: {} };
  }

  // URL matching
  const urlResult = matchUrl(route.path, ctx.path, route.urlMatch);
  if (!urlResult.matched) return { matched: false, params: {} };

  const logic = route.compositeLogic ?? 'AND';

  // Header matchers (6A.2)
  if (route.headerMatchers?.length) {
    if (!matchRules(route.headerMatchers, ctx.headers, logic)) {
      return { matched: false, params: urlResult.params };
    }
  }

  // Query param matchers
  if (route.queryParamMatchers?.length) {
    if (!matchRules(route.queryParamMatchers, ctx.queryParams, logic)) {
      return { matched: false, params: urlResult.params };
    }
  }

  // Cookie matchers
  if (route.cookieMatchers?.length) {
    if (!matchRules(route.cookieMatchers, ctx.cookies, logic)) {
      return { matched: false, params: urlResult.params };
    }
  }

  // Body matcher (6A.3)
  if (route.bodyMatcher) {
    if (!matchBody(route.bodyMatcher, ctx.body)) {
      return { matched: false, params: urlResult.params };
    }
  }

  return { matched: true, params: urlResult.params };
}

/** Sort routes by priority (lower number = higher priority, undefined = lowest) */
export function sortRoutesByPriority(routes: MockRoute[]): MockRoute[] {
  return [...routes].sort((a, b) => {
    const pa = a.priority ?? 9999;
    const pb = b.priority ?? 9999;
    return pa - pb;
  });
}

// ─── JSONPath evaluator (subset: $., $.[], [?(@.)]) ─────────────────────────

function evaluateJsonPath(path: string, obj: unknown): unknown {
  if (path === '$') return obj;
  // Normalize: $.store.book[0].title → ['store', 'book', '0', 'title']
  const parts = path
    .replace(/^\$\.?/, '')
    .split(/[.\[\]]+/)
    .filter(Boolean);

  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (part.startsWith('?(@.')) {
      // Filter expression: ?(@.price < 10)
      if (!Array.isArray(current)) return undefined;
      const exprMatch = part.match(/\?\(@\.(\w+)\s*([<>=!]+)\s*([^)]+)\)/);
      if (!exprMatch) return current;
      const [, field, op, valStr] = exprMatch;
      const val = parseFloat(valStr) || valStr.replace(/['"]/g, '');
      current = (current as Record<string, unknown>[]).filter(item => {
        const iv = (item as Record<string, unknown>)[field];
        if (op === '<')  return Number(iv) < Number(val);
        if (op === '>')  return Number(iv) > Number(val);
        if (op === '<=') return Number(iv) <= Number(val);
        if (op === '>=') return Number(iv) >= Number(val);
        if (op === '==') return iv == val;
        if (op === '!=') return iv != val;
        return false;
      });
    } else if (part === '*') {
      if (Array.isArray(current)) return current;
      if (typeof current === 'object') return Object.values(current as object);
      return undefined;
    } else {
      current = (current as Record<string, unknown>)?.[part];
    }
  }
  return current;
}

// ─── JSON Schema validation (basic) ─────────────────────────────────────────

function validateJsonSchema(value: unknown, schema: Record<string, unknown>): boolean {
  if (schema.type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const required = (schema.required as string[]) || [];
    const obj = value as Record<string, unknown>;
    if (!required.every(k => k in obj)) return false;
    const properties = (schema.properties as Record<string, Record<string, unknown>>) || {};
    return Object.entries(properties).every(([k, subSchema]) => {
      if (!(k in obj)) return true;
      return validateJsonSchema(obj[k], subSchema);
    });
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) return false;
    const items = schema.items as Record<string, unknown>;
    if (items) return (value as unknown[]).every(item => validateJsonSchema(item, items));
    return true;
  }
  if (schema.type === 'string') return typeof value === 'string';
  if (schema.type === 'number') return typeof value === 'number';
  if (schema.type === 'integer') return Number.isInteger(value);
  if (schema.type === 'boolean') return typeof value === 'boolean';
  if (schema.type === 'null') return value === null;
  if (schema.enum) return (schema.enum as unknown[]).includes(value);
  return true; // no type constraint
}

// ─── Deep equality ───────────────────────────────────────────────────────────

function deepEqual(
  a: unknown,
  b: unknown,
  opts: { ignoreArrayOrder?: boolean; ignoreExtraElements?: boolean },
): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (!opts.ignoreArrayOrder && a.length !== b.length) return false;
    if (opts.ignoreArrayOrder) {
      // Every element in b must exist in a
      return b.every(bItem => a.some(aItem => deepEqual(aItem, bItem, opts)));
    }
    return a.every((item, i) => deepEqual(item, b[i], opts));
  }
  if (typeof a === 'object' && a !== null && b !== null) {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const aKeys = Object.keys(ao);
    const bKeys = Object.keys(bo);
    if (!opts.ignoreExtraElements && aKeys.length !== bKeys.length) return false;
    return bKeys.every(k => deepEqual(ao[k], bo[k], opts));
  }
  return false;
}

// ─── XML utilities ───────────────────────────────────────────────────────────

function normalizeXml(xml: string): string {
  return xml.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();
}

function evaluateSimpleXPath(xpath: string, xml: string): boolean {
  // Very basic: check if element path exists in XML string
  const parts = xpath.replace(/^\/+/, '').split('/');
  const lastTag = parts[parts.length - 1];
  return xml.includes(`<${lastTag}`) || xml.includes(`<${lastTag}/>`);
}

// ─── Cookie parsing ──────────────────────────────────────────────────────────

export function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  cookieHeader.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx < 0) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    cookies[key] = value;
  });
  return cookies;
}
