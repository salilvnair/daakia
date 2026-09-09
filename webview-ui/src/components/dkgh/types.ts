/**
 * The shape the host sends back from `dkgh:probe`.
 *
 * Mirrors `services/gh/gh.ts` deliberately rather than importing it — the
 * webview and the extension are separate TypeScript projects and neither can
 * reach the other's source. Keeping the duplication small and in one file is
 * the cost of that boundary; the alternative is a shared package for four
 * interfaces.
 */

export interface GhAccount {
  host: string;
  login: string;
  active: boolean;
  scopes: string[];
}

export interface GhAuthStatus {
  loggedIn: boolean;
  accounts: GhAccount[];
  hosts: string[];
}

export interface GhCapabilities {
  project: boolean;
  issueJson: boolean;
  searchIssues: boolean;
}

export interface GhEnv {
  present: boolean;
  binary?: string;
  version?: { version?: string; raw: string };
  capabilities?: GhCapabilities;
  auth?: GhAuthStatus;
  platform: string;
  /** Where it looked, when it found nothing. The install screen prints these. */
  triedPaths?: string[];
}

export const ACCENT = 'var(--color-dkgh)';

/** The active account on a host, or the first one gh listed. */
export function activeAccount(env: GhEnv | null): GhAccount | undefined {
  if (!env?.auth) return undefined;
  return env.auth.accounts.find(a => a.active) ?? env.auth.accounts[0];
}

/**
 * Does this account hold a scope?
 *
 * GitHub grants the narrower scope with the wider one — `project` covers
 * `read:project`. Treating them as unrelated strings is how a board with write
 * access decides it cannot read.
 */
export function hasScope(account: GhAccount | undefined, scope: string): boolean {
  if (!account) return false;
  const want = scope.toLowerCase();
  if (account.scopes.includes(want)) return true;
  if (want === 'read:project') return account.scopes.includes('project');
  if (want.startsWith('read:') && account.scopes.includes(want.slice(5))) return true;
  return false;
}
