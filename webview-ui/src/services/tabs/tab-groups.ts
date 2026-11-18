/**
 * Tab groups, as Chrome and Edge have them: a named, coloured run of tabs that
 * folds into its chip.
 *
 * Everything here is a pure function from (tabs, groups) to (tabs, groups), so
 * the rules that make groups predictable are tested on their own, not through
 * the tab bar:
 *
 * - a group's tabs always sit together, starting where its first tab was;
 * - a group with no tabs left is gone;
 * - pinned tabs are never in a group, and sit at the start;
 * - a group made by Group tabs (by protocol, host or collection) knows what it
 *   gathered, and a new tab that matches joins it. A group someone made by
 *   hand collects nothing by itself.
 */

/** What Group tabs gathers on. */
export type GroupBy = 'protocol' | 'host' | 'collection';

export interface TabGroup {
  id: string;
  name: string;
  /** A CSS colour — a protocol's own variable for a protocol group. */
  color: string;
  /** Folded down to its chip. */
  collapsed: boolean;
  /** Set on a group Group tabs made: what it gathered on, and the value new tabs are matched on. */
  auto?: { by: GroupBy; key: string };
}

/** The part of a tab the group rules read. */
export interface GroupableTab {
  id: string;
  type: string;
  protocol: string;
  pinned?: boolean;
  groupId?: string;
  authData?: Record<string, string>;
  url?: string;
  collectionId?: string;
}

/** The colours a hand-made group takes, in turn. Chrome's eight, in Daakia's palette. */
export const GROUP_COLORS = [
  'var(--color-info, #3b82f6)',
  'var(--color-warning, #f59e0b)',
  'var(--color-success, #22c55e)',
  '#ec4899',
  '#8b5cf6',
  '#06b6d4',
  'var(--color-error, #ef4444)',
  '#94a3b8',
];

const PROTOCOL_GROUPS: Record<string, { name: string; color: string }> = {
  rest: { name: 'REST', color: 'var(--color-protocol-rest)' },
  graphql: { name: 'GraphQL', color: 'var(--color-protocol-graphql)' },
  websocket: { name: 'WebSocket', color: 'var(--color-protocol-websocket)' },
  sse: { name: 'SSE', color: 'var(--color-protocol-sse)' },
  socketio: { name: 'Socket.IO', color: 'var(--color-protocol-socketio)' },
  mqtt: { name: 'MQTT', color: 'var(--color-protocol-mqtt)' },
  grpc: { name: 'gRPC', color: 'var(--color-protocol-grpc)' },
  soap: { name: 'SOAP', color: 'var(--color-protocol-soap)' },
  ai: { name: 'AI', color: 'var(--color-protocol-ai)' },
  mcp: { name: 'MCP', color: 'var(--color-protocol-mcp)' },
  scratchpad: { name: 'Scratchpads', color: 'var(--color-scratchpad)' },
};

/**
 * Which protocol group a tab belongs in, or null for one Group by protocol
 * leaves alone. The realtime transports share a protocol and differ by
 * `rt_protocol`, so an SSE tab is SSE, not WebSocket.
 */
export function protocolKey(tab: GroupableTab): string | null {
  if (tab.type === 'scratchpad') return 'scratchpad';
  if (tab.type !== 'request') return null;
  if (tab.protocol === 'websocket') return tab.authData?.rt_protocol || 'websocket';
  return tab.protocol;
}

/**
 * The server a request goes to, as written: `api.example.com`, or
 * `{{baseUrl}}` when the URL starts with a variable — two requests on the same
 * variable go to the same place whatever it resolves to.
 */
export function hostKey(tab: GroupableTab): string | null {
  if (tab.type !== 'request') return null;
  const m = (tab.url ?? '').trim().match(/^(?:[a-z][a-z0-9+.-]*:\/\/)?([^/?#\s]+)/i);
  return m ? m[1].toLowerCase() : null;
}

/** The key a tab is grouped on for each way of grouping, or null for a tab that way leaves alone. */
export function keyFor(tab: GroupableTab, by: GroupBy): string | null {
  if (by === 'protocol') return protocolKey(tab);
  if (by === 'host') return hostKey(tab);
  return tab.type === 'request' && tab.collectionId ? tab.collectionId : null;
}

let seq = 0;
export const newGroupId = () => `tg-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** The first of the eight colours no group is wearing, or the least used. */
export function nextColor(groups: readonly TabGroup[]): string {
  const used = new Map<string, number>();
  for (const g of groups) used.set(g.color, (used.get(g.color) ?? 0) + 1);
  return [...GROUP_COLORS].sort((a, b) => (used.get(a) ?? 0) - (used.get(b) ?? 0))[0];
}

/**
 * The invariants, restored: pinned first and ungrouped, each group's tabs
 * together where its first tab stands, empty groups and dangling ids gone.
 * Every other function ends here.
 */
export function normalize<T extends GroupableTab>(tabs: readonly T[], groups: readonly TabGroup[]): { tabs: T[]; groups: TabGroup[] } {
  const known = new Set(groups.map(g => g.id));
  const clean = tabs.map(t => (t.groupId && (t.pinned || !known.has(t.groupId)) ? { ...t, groupId: undefined } : t));
  const pinned = clean.filter(t => t.pinned);
  const rest = clean.filter(t => !t.pinned);
  const out: T[] = [...pinned];
  const placed = new Set<string>();
  for (const t of rest) {
    if (!t.groupId) { out.push(t); continue; }
    if (placed.has(t.groupId)) continue;
    placed.add(t.groupId);
    out.push(...rest.filter(x => x.groupId === t.groupId));
  }
  const live = new Set(out.map(t => t.groupId).filter(Boolean));
  return { tabs: out, groups: groups.filter(g => live.has(g.id)) };
}

/** A new group around these tabs, named and coloured, in place of the first of them. */
export function createGroup<T extends GroupableTab>(
  tabs: readonly T[], groups: readonly TabGroup[], tabIds: readonly string[],
  opts: { name?: string; color?: string; id?: string } = {},
): { tabs: T[]; groups: TabGroup[]; groupId: string } {
  const ids = new Set(tabIds.filter(id => tabs.some(t => t.id === id && !t.pinned)));
  const id = opts.id ?? newGroupId();
  if (ids.size === 0) return { ...normalize(tabs, groups), groupId: id };
  const group: TabGroup = { id, name: opts.name ?? '', color: opts.color ?? nextColor(groups), collapsed: false };
  /* Gather the chosen tabs where the first of them stands. */
  const first = tabs.findIndex(t => ids.has(t.id));
  const chosen = tabs.filter(t => ids.has(t.id)).map(t => ({ ...t, groupId: id }));
  const others = tabs.filter(t => !ids.has(t.id));
  const at = others.filter((_, i) => tabs.indexOf(others[i]) < first).length;
  const next = [...others.slice(0, at), ...chosen, ...others.slice(at)];
  return { ...normalize(next, [...groups, group]), groupId: id };
}

/** Put a tab at the end of a group, or out of every group with `null`, just after the one it left. */
export function moveToGroup<T extends GroupableTab>(
  tabs: readonly T[], groups: readonly TabGroup[], tabId: string, groupId: string | null,
): { tabs: T[]; groups: TabGroup[] } {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab || tab.pinned || (groupId && !groups.some(g => g.id === groupId))) return normalize(tabs, groups);
  const without = tabs.filter(t => t.id !== tabId);
  const target = groupId ?? tab.groupId;
  const lastOf = target ? without.map(t => t.groupId).lastIndexOf(target) : -1;
  const at = lastOf === -1 ? (groupId ? without.length : tabs.indexOf(tab)) : lastOf + 1;
  const moved = { ...tab, groupId: groupId ?? undefined };
  return normalize([...without.slice(0, at), moved, ...without.slice(at)], groups);
}

/**
 * Group similar tabs. Every tab with a key for this way of grouping goes into
 * the group for that key, made where there is none yet: by protocol in the
 * protocol's colour, by host or collection in the next free one. Groups appear
 * in the order their first tab stood; tabs in a hand-made group stay put, and
 * so do tabs in a group made another way.
 *
 * `nameOf` turns a key into a group's name — a collection's id into its name.
 */
export function groupBy<T extends GroupableTab>(
  tabs: readonly T[], groups: readonly TabGroup[], by: GroupBy, nameOf: (key: string) => string = k => k,
): { tabs: T[]; groups: TabGroup[] } {
  const next = [...groups];
  const byKey = new Map(next.filter(g => g.auto?.by === by).map(g => [g.auto!.key, g.id]));
  const keep = new Set(next.filter(g => g.auto?.by !== by).map(g => g.id));
  const assigned = tabs.map(t => {
    if (t.pinned || (t.groupId && keep.has(t.groupId))) return t;
    const key = keyFor(t, by);
    if (!key) return t;
    let id = byKey.get(key);
    if (!id) {
      const meta = by === 'protocol' ? PROTOCOL_GROUPS[key] : undefined;
      id = newGroupId();
      next.push({
        id,
        name: meta?.name ?? (by === 'protocol' ? key.toUpperCase() : nameOf(key)),
        color: meta?.color ?? nextColor(next),
        collapsed: false,
        auto: { by, key },
      });
      byKey.set(key, id);
    }
    return { ...t, groupId: id };
  });
  return normalize(assigned, next);
}

export const groupByProtocol = <T extends GroupableTab>(tabs: readonly T[], groups: readonly TabGroup[]) => groupBy(tabs, groups, 'protocol');

/** The group a new tab joins: one Group tabs made whose key it matches. */
export function autoGroupFor(tab: GroupableTab, groups: readonly TabGroup[]): string | undefined {
  return groups.find(g => g.auto && keyFor(tab, g.auto.by) === g.auto.key)?.id;
}

export function ungroup<T extends GroupableTab>(tabs: readonly T[], groups: readonly TabGroup[], groupId: string): { tabs: T[]; groups: TabGroup[] } {
  return normalize(tabs.map(t => (t.groupId === groupId ? { ...t, groupId: undefined } : t)), groups.filter(g => g.id !== groupId));
}

export function ungroupAll<T extends GroupableTab>(tabs: readonly T[]): { tabs: T[]; groups: TabGroup[] } {
  return { tabs: tabs.map(t => (t.groupId ? { ...t, groupId: undefined } : t)), groups: [] };
}

/**
 * Move a whole group so it starts just before `beforeTabId` (or at the end
 * with null). A target inside the group itself is no move.
 */
export function moveGroup<T extends GroupableTab>(
  tabs: readonly T[], groups: readonly TabGroup[], groupId: string, beforeTabId: string | null,
): { tabs: T[]; groups: TabGroup[] } {
  const members = tabs.filter(t => t.groupId === groupId);
  if (!members.length || (beforeTabId && members.some(t => t.id === beforeTabId))) return normalize(tabs, groups);
  const others = tabs.filter(t => t.groupId !== groupId);
  /* Before a tab in another group means before that whole group. */
  const target = beforeTabId ? others.find(t => t.id === beforeTabId) : undefined;
  const at = target
    ? (target.groupId ? others.findIndex(t => t.groupId === target.groupId) : others.indexOf(target))
    : others.length;
  return normalize([...others.slice(0, at), ...members, ...others.slice(at)], groups);
}

/** One run of the strip: a pinned or loose tab, or a group with its tabs. */
export type StripPiece<T> =
  | { kind: 'tab'; tab: T }
  | { kind: 'group'; group: TabGroup; tabs: T[] };

/** The strip in drawing order, from already-normalized tabs. */
export function stripPieces<T extends GroupableTab>(tabs: readonly T[], groups: readonly TabGroup[]): StripPiece<T>[] {
  const byId = new Map(groups.map(g => [g.id, g]));
  const out: StripPiece<T>[] = [];
  for (const t of tabs) {
    const g = t.groupId ? byId.get(t.groupId) : undefined;
    if (!g) { out.push({ kind: 'tab', tab: t }); continue; }
    const last = out[out.length - 1];
    if (last?.kind === 'group' && last.group.id === g.id) last.tabs.push(t);
    else out.push({ kind: 'group', group: g, tabs: [t] });
  }
  return out;
}
