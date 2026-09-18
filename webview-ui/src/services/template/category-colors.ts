/**
 * A colour per kind of dynamic value, used everywhere they are listed.
 *
 * The reference tables, the snippet panel and the `{{` popup all show the same
 * hundred-odd entries, and a single accent across all of them turned every one
 * of those surfaces into a wall of grey text — nothing to steer by, so you
 * read every row to find the one you wanted.
 *
 * Colour here carries the category, which is the only grouping that helps
 * while scanning: date helpers together, request helpers together. One map so
 * `{{now}}` is the same colour in the wiki as it is in the snippet list.
 *
 * Every value is a theme token, so both themes stay legible and a palette
 * change reaches this too.
 */
import type { HelperCategory } from '@daakia/template-catalog';

export const HELPER_COLORS: Record<HelperCategory, string> = {
  random: 'var(--color-protocol-soap, #f97316)',
  date: 'var(--color-protocol-websocket, #22c55e)',
  request: 'var(--color-protocol-rest, #6366f1)',
  string: 'var(--color-protocol-graphql, #c084fc)',
  number: 'var(--color-protocol-grpc, #06b6d4)',
  json: 'var(--color-mock-server, #eab308)',
  encode: 'var(--color-settings, #2a9d8f)',
  logic: 'var(--color-accent, #38bdf8)',
  fake: 'var(--color-ai, #a855f7)',
};

/**
 * The registry's categories, which are its own and longer than the helpers'.
 *
 * Unknown names fall back rather than throw: the list arrives from the host at
 * runtime, and a provider added there should show up in a sensible colour
 * without this file having to be edited in the same commit.
 */
const DYNAMIC_COLORS: Record<string, string> = {
  identity: 'var(--color-protocol-graphql, #c084fc)',
  datetime: 'var(--color-protocol-websocket, #22c55e)',
  number: 'var(--color-protocol-grpc, #06b6d4)',
  text: 'var(--color-protocol-soap, #f97316)',
  person: 'var(--color-ai, #a855f7)',
  network: 'var(--color-protocol-rest, #6366f1)',
  color: 'var(--color-mock-server, #eab308)',
  location: 'var(--color-settings, #2a9d8f)',
  company: 'var(--color-dkgh, #8b949e)',
  custom: 'var(--color-accent, #38bdf8)',
};

export function dynamicColor(category: string): string {
  return DYNAMIC_COLORS[category] ?? 'var(--color-accent, #38bdf8)';
}

/** Title case for a registry category, which arrives lowercase. */
export function categoryLabel(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}
