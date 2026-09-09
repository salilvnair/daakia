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
  issueCreate: boolean;
  issueEdit: boolean;
  issueTypes: boolean;
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

/**
 * A repository as the picker sees it.
 *
 * Mirrors `services/gh/repos.ts` for the same reason as everything else in this
 * file: the two TypeScript projects cannot reach each other's source.
 *
 * `openIssues` counts issues and not pull requests — GitHub's own
 * `openIssuesCount` includes PRs, so a repository with four issues and thirty
 * PRs would advertise thirty-four and the board that opens next would show
 * four. A number that disagrees with the next screen is worse than no number.
 */
export interface RepoSummary {
  nameWithOwner: string;
  description?: string;
  isPrivate: boolean;
  isArchived: boolean;
  isFork: boolean;
  /** The upstream, when this is a fork. */
  parent?: string;
  openIssues: number;
  pushedAt?: string;
  /** How many issue forms. `undefined` means it was not looked up. */
  templates?: number;
  /** Whether it has an issue tracker at all — forks have one off by default. */
  hasIssues?: boolean;
  /** When the counts were read, for a row served from the last visit. */
  countedAt?: number;
}

/** Screen 03C — the fork, and where its issues really live. */
export interface ForkChoice {
  fork: RepoSummary;
  upstream?: RepoSummary;
  upstreamError?: string;
}

/** Screen 03B — why this account cannot open a repository. */
export interface RepoAccess {
  repo: string;
  verdict: 'visible' | 'sso' | 'not-found' | 'no-scope' | 'unknown';
  /** gh's own words, kept because they usually name the org. */
  said: string;
  org?: string;
}

/** The lists a write chooses from, read once when the board opens. */
export interface RepoMeta {
  repo: string;
  labels: { name: string; color: string; description?: string }[];
  milestones: { title: string; dueOn?: string }[];
  assignees: string[];
  /** What could not be read — named, rather than shown as an empty list. */
  unavailable: string[];
}
