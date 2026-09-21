/**
 * What can be changed in a workspace, per area — the one place that decides.
 *
 * ── Why a table, not "is it read-only" checks everywhere ──
 *
 * A teammate's shared workspace is a copy: its collections come from its owner
 * and are rebuilt on every sync, so an edit would be thrown away. But not
 * every area of it is theirs. The history is yours — you send requests from
 * their collections and the rows are your own. The environments arrive with
 * secret values blank, and filling those in is the one thing you have to do
 * before a request can work. So "read-only" is a per-area answer, and each
 * panel asks for its own area rather than guessing from the workspace.
 *
 * Buttons are disabled, never hidden: a control that vanishes reads as a bug,
 * one that is greyed out with a reason reads as a rule.
 */

export type WorkspaceArea = 'overview' | 'collections' | 'environments' | 'history';

export type WorkspacePermissions = Record<WorkspaceArea, boolean>;

export const EDITABLE_EVERYWHERE: WorkspacePermissions = {
  overview: true, collections: true, environments: true, history: true,
};

/** A teammate's shared workspace, imported read-only. */
export const SHARED_READ_ONLY: WorkspacePermissions = {
  /* Name, docs, import-into: theirs. */
  overview: false,
  collections: false,
  /* Secret values arrive blank; you fill them in. Stays on this machine. */
  environments: true,
  /* The requests you sent from it. */
  history: true,
};

export function permissionsFor(workspace: { owner_id?: string | null } | undefined): WorkspacePermissions {
  return workspace?.owner_id ? SHARED_READ_ONLY : EDITABLE_EVERYWHERE;
}

/** Tooltip on anything disabled by these rules. */
export const READ_ONLY_REASON = 'Read-only: this workspace is shared by a teammate. Copy it to your workspaces to change it.';

/**
 * Menu item ids that change the area they belong to, per panel.
 *
 * By id because every panel's menus are built as item lists, and a list is
 * something one function can walk — a check in each onClick is fifteen places
 * to forget one. Disabling a parent disables its whole submenu.
 */
export const COLLECTION_EDIT_IDS: ReadonlySet<string> = new Set([
  'new-request', 'new-folder', 'rename', 'duplicate', 'delete', 'properties', 'delete-all',
  'import', 'scan-code', 'ai-organize', 'ai-extract-env',
]);

export const ENVIRONMENT_EDIT_IDS: ReadonlySet<string> = new Set([
  'edit', 'duplicate', 'delete', 'delete-all',
  'import-postman', 'import-insomnia', 'import-json', 'import-dotenv',
]);

export const HISTORY_EDIT_IDS: ReadonlySet<string> = new Set(['delete', 'clear-all']);

/** History items that write into a collection, so follow the collections flag. */
export const HISTORY_TO_COLLECTION_IDS: ReadonlySet<string> = new Set(['save']);

interface MenuItem {
  id: string;
  disabled?: boolean;
  description?: string;
  children?: MenuItem[];
}

/** The same items, with the edits disabled when the area is not editable. */
export function lockEdits<T extends MenuItem>(items: T[], editable: boolean, ids: ReadonlySet<string>): T[] {
  if (editable) return items;
  return items.map(item => {
    if (ids.has(item.id)) return { ...item, disabled: true, description: READ_ONLY_REASON };
    return item.children
      ? { ...item, children: lockEdits(item.children as T[], editable, ids) }
      : item;
  });
}
