/**
 * The dk8s prefs that travel with a shared workspace.
 *
 * ── What and why ──
 *
 * A determinant is a question somebody keeps asking a log — which APIs ran,
 * what went downstream, what retried — and it is only worth writing down if
 * the next person to open the pod gets it too. So a workspace shared through
 * Git Sync carries, beside its collections and environments, these prefs:
 *
 *   dk8s.loggers        the logger catalogue, and with it every determinant
 *   dk8s.fields.custom  the field readers written in Settings → DK8S → Fields
 *
 * Adding a key here is all it takes for another one to travel the same way.
 *
 * ── Where they are read from, and written to ──
 *
 * Read from the webview's own prefs (the `ui_state` row the panel saves), as
 * the raw strings the webview stored, so the host never needs to understand
 * them. On the other side they are NOT written into the teammate's prefs: they
 * are kept beside their read-only copy of the workspace and handed to the
 * webview, which shows them as the team's rather than as the reader's own.
 * Writing into somebody's prefs from under an open panel would be overwritten
 * by the panel's next save — and would make a teammate's question one the
 * reader has to delete, only for the next sync to bring it back.
 *
 * Pure: the shape checks live here, where they can be tested without a
 * database. `git-sync.ts` does the reading and the keeping.
 */

/** The pref keys a shared workspace carries. */
export const DK8S_SHARED_PREF_KEYS = ['dk8s.loggers', 'dk8s.fields.custom'] as const;

/** A shared pref's value is a stored string; anything past this is not a pref. */
const MAX_VALUE_CHARS = 512 * 1024;

/**
 * The shared keys out of a prefs object, and nothing else.
 *
 * Only the listed keys, only string values, only values of a sane size. Prefs
 * hold a great deal that is nobody else's business — which settings page you
 * were on, your scroll positions, the pod you starred — and a shared file is
 * readable by everyone with the repo.
 */
export function pickDk8sPrefs(prefs: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!prefs || typeof prefs !== 'object') return out;
  for (const key of DK8S_SHARED_PREF_KEYS) {
    const value = (prefs as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.length > 0 && value.length <= MAX_VALUE_CHARS) out[key] = value;
  }
  return out;
}

/** One teammate's shared workspace, as the webview is handed it. */
export interface TeamDk8sPrefs {
  /** The local id of the read-only copy of their workspace. */
  workspaceId: string;
  workspaceName: string;
  ownerId: string;
  ownerName: string;
  prefs: Record<string, string>;
}

/**
 * A stored entry, checked on the way out.
 *
 * What is kept came from a file anybody with the repo can edit, so it is read
 * as untrusted: the same key filter as on the way in, and a malformed entry is
 * dropped rather than handed to a page.
 */
export function readTeamEntry(raw: unknown): TeamDk8sPrefs | undefined {
  const v = raw as Partial<TeamDk8sPrefs> | undefined;
  if (!v || typeof v !== 'object') return undefined;
  if (typeof v.workspaceId !== 'string' || typeof v.ownerId !== 'string') return undefined;
  const prefs = pickDk8sPrefs(v.prefs);
  if (!Object.keys(prefs).length) return undefined;
  return {
    workspaceId: v.workspaceId,
    workspaceName: typeof v.workspaceName === 'string' ? v.workspaceName : 'Shared workspace',
    ownerId: v.ownerId,
    ownerName: typeof v.ownerName === 'string' && v.ownerName ? v.ownerName : v.ownerId.slice(0, 8),
    prefs,
  };
}
