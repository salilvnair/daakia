/**
 * Variable Registry — central store for all variable resolvers.
 * Provides register/unregister/resolve operations.
 */
import type { VariableResolver, VariableCategory } from './types';

// ─── Registry ────────────────────────────────────────────────────────────────

const registry = new Map<string, VariableResolver>();

/**
 * Register a variable resolver. Overwrites if same name exists.
 * Names should NOT include the `$` prefix.
 */
export function registerResolver(resolver: VariableResolver): void {
  registry.set(resolver.name, resolver);
}

/**
 * Register multiple resolvers at once.
 */
export function registerResolvers(resolvers: VariableResolver[]): void {
  for (const r of resolvers) registry.set(r.name, r);
}

/**
 * Unregister a variable resolver by name.
 */
export function unregisterResolver(name: string): void {
  registry.delete(name);
}

/**
 * Get a resolver by name (without $).
 */
export function getResolver(name: string): VariableResolver | undefined {
  return registry.get(name);
}

/**
 * Get all registered resolvers.
 */
export function getAllResolvers(): VariableResolver[] {
  return Array.from(registry.values());
}

/**
 * Get resolvers grouped by category.
 */
export function getResolversByCategory(): Record<VariableCategory, VariableResolver[]> {
  const grouped: Record<VariableCategory, VariableResolver[]> = {
    identity: [], datetime: [], network: [], text: [],
    number: [], color: [], person: [], location: [],
    company: [], custom: [],
  };
  for (const r of registry.values()) {
    grouped[r.category].push(r);
  }
  return grouped;
}

/**
 * Resolve a single variable key (with or without $).
 * Returns the resolved value or the original `{{key}}` if no resolver found.
 */
export function resolveVariable(key: string): string {
  const name = key.startsWith('$') ? key.slice(1) : key;
  const resolver = registry.get(name);
  if (resolver) return resolver.resolve();
  return `{{${key}}}`;
}

/**
 * Resolve all {{$variable}} and {{variable}} placeholders in a string.
 * Environment variables should be resolved separately before/after this.
 */
export function resolveAll(text: string): string {
  return text.replace(/\{\{(\$?[a-zA-Z0-9_]+)\}\}/g, (match, key: string) => {
    const name = key.startsWith('$') ? key.slice(1) : key;
    const resolver = registry.get(name);
    if (resolver) return resolver.resolve();
    return match;
  });
}
