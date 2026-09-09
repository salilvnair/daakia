/**
 * Reading what `gh` says about itself.
 *
 * These are pure string functions, deliberately separated from the process
 * running in `gh.ts`, because they are the part with all the edge cases and
 * none of the I/O: `gh auth status` has changed shape across versions, prints
 * differently for one account than for two, and is the only place dkgh learns
 * which hosts and scopes it has. Parsing it in a file that spawns nothing means
 * every one of those shapes can be pinned by a test with a fixture string.
 *
 * There is deliberately no function here that returns a token. `gh auth status`
 * prints one masked and dkgh never unmasks it; `gh auth token` is not called
 * anywhere in this codebase, and the whole argument for shelling out to `gh`
 * rests on that staying true.
 */

/** What `gh --version` reports. */
export interface GhVersion {
  /** `2.63.2`, or undefined when the output was not recognisable. */
  version?: string;
  major: number;
  minor: number;
  patch: number;
  /** The first line, kept verbatim for display when parsing failed. */
  raw: string;
}

/**
 * Parse `gh --version`.
 *
 * The first line is `gh version 2.63.2 (2024-12-05)` on every build we have
 * seen, but a distribution is free to patch that string, so a failure to match
 * yields zeros and the raw line rather than throwing. A version we cannot read
 * is not a reason to refuse to run — capability detection is what actually
 * gates features, and this number is for the reader.
 */
export function parseGhVersion(stdout: string): GhVersion {
  const raw = (stdout || '').trim().split(/\r?\n/)[0]?.trim() ?? '';
  const m = raw.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) return { major: 0, minor: 0, patch: 0, raw };
  return {
    version: `${m[1]}.${m[2]}.${m[3]}`,
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    raw,
  };
}

/** One account on one host, as `gh auth status` describes it. */
export interface GhAccount {
  host: string;
  login: string;
  /** True when gh would use this account for this host. */
  active: boolean;
  /** Lower-cased, deduplicated. Empty when gh did not print a scopes line. */
  scopes: string[];
}

export interface GhAuthStatus {
  loggedIn: boolean;
  accounts: GhAccount[];
  /** Distinct hosts, in the order gh printed them. */
  hosts: string[];
}

/*
  Two shapes, because gh changed this output around 2.40 and plenty of pinned
  corporate installs predate that.

    modern:  ✓ Logged in to github.com account salilvnair (keyring)
    older:   ✓ Logged in to github.com as salilvnair (oauth_token)

  Both are matched by one expression rather than two passes: the alternation is
  the only difference, and keeping them together means a future third spelling
  is one more branch in one place.
*/
const LOGGED_IN = /Logged in to (\S+)\s+(?:account|as)\s+(\S+)/i;

/** `- Token scopes: 'gist', 'repo'` and `✓ Token scopes: gist, repo`. */
const SCOPES = /Token scopes:\s*(.*)$/i;

/** `- Active account: true` — absent entirely in the older format. */
const ACTIVE = /Active account:\s*(true|false)/i;

/**
 * Parse `gh auth status`.
 *
 * Note it is fed stdout AND stderr concatenated by the caller: gh has printed
 * this to one or the other depending on version and on whether it considered
 * the state an error, and a parser that reads only stdout reports "not logged
 * in" on a perfectly authenticated machine. That was worth a comment because it
 * looks like a mistake.
 */
export function parseAuthStatus(output: string): GhAuthStatus {
  const lines = (output || '').split(/\r?\n/);
  const accounts: GhAccount[] = [];

  for (const line of lines) {
    const login = line.match(LOGGED_IN);
    if (login) {
      accounts.push({
        host: login[1],
        login: login[2],
        /* Assumed active until a later line says otherwise. The older format
           never says, and in that format there is only ever one account per
           host — so "active" is the right default rather than a guess. */
        active: true,
        scopes: [],
      });
      continue;
    }
    /* Everything below a login line belongs to it, until the next one. */
    const current = accounts[accounts.length - 1];
    if (!current) continue;

    const active = line.match(ACTIVE);
    if (active) {
      current.active = active[1].toLowerCase() === 'true';
      continue;
    }

    const scopes = line.match(SCOPES);
    if (scopes) {
      current.scopes = splitScopes(scopes[1]);
    }
  }

  const hosts: string[] = [];
  for (const a of accounts) if (!hosts.includes(a.host)) hosts.push(a.host);

  return { loggedIn: accounts.length > 0, accounts, hosts };
}

/** `'gist', 'read:org'` and `gist, read:org` both become `['gist','read:org']`. */
function splitScopes(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(',')) {
    const scope = part.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
    if (scope && !out.includes(scope)) out.push(scope);
  }
  return out;
}

/** The account gh would use for a given host, if any. */
export function accountFor(status: GhAuthStatus, host: string): GhAccount | undefined {
  const onHost = status.accounts.filter(a => a.host === host);
  return onHost.find(a => a.active) ?? onHost[0];
}

/**
 * Does this account hold a scope?
 *
 * `repo` implies its children, and `project` implies `read:project` — GitHub
 * grants the narrower one automatically with the wider. Treating them as
 * unrelated strings is how a board that has write access decides it cannot
 * read.
 */
export function hasScope(account: GhAccount | undefined, scope: string): boolean {
  if (!account) return false;
  const want = scope.toLowerCase();
  if (account.scopes.includes(want)) return true;
  if (want === 'read:project') return account.scopes.includes('project');
  if (want.startsWith('read:') && account.scopes.includes(want.slice(5))) return true;
  return false;
}
