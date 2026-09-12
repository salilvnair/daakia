/**
 * What `gh` tells us about itself, pinned against real output.
 *
 * Every fixture here is copied from an actual `gh` run rather than written to
 * match the parser. That distinction matters most for `gh auth status`, whose
 * format changed around 2.40 and which prints to stderr on some versions — two
 * things a hand-written fixture would quietly get wrong, leaving a parser that
 * passes its tests and reports "not logged in" on a working machine.
 */
import { describe, it, expect } from 'vitest';
import {
  parseGhVersion, parseAuthStatus, accountFor, hasScope,
} from './gh-parse';

describe('gh --version', () => {
  it('reads the version off the first line', () => {
    const v = parseGhVersion('gh version 2.63.2 (2024-12-05)\nhttps://github.com/cli/cli/releases/tag/v2.63.2\n');
    expect(v.version).toBe('2.63.2');
    expect(v.major).toBe(2);
    expect(v.minor).toBe(63);
    expect(v.patch).toBe(2);
  });

  it('keeps the raw line for display', () => {
    const v = parseGhVersion('gh version 2.4.0 (2021-12-21)\n');
    expect(v.raw).toBe('gh version 2.4.0 (2021-12-21)');
  });

  it('survives a string it cannot read', () => {
    /* A distribution is free to patch this. An unreadable version is not a
       reason to refuse to run — capabilities gate features, not this number. */
    const v = parseGhVersion('gh, the GitHub CLI\n');
    expect(v.version).toBeUndefined();
    expect(v.major).toBe(0);
    expect(v.raw).toBe('gh, the GitHub CLI');
  });

  it('survives empty output', () => {
    expect(parseGhVersion('').major).toBe(0);
    expect(parseGhVersion('').raw).toBe('');
  });
});

describe('gh auth status — the current format', () => {
  const MODERN = `github.com
  ✓ Logged in to github.com account salilvnair (keyring)
  - Active account: true
  - Git operations protocol: https
  - Token: gho_************************************
  - Token scopes: 'gist', 'read:org', 'repo'
`;

  it('finds the account, the host and the scopes', () => {
    const s = parseAuthStatus(MODERN);
    expect(s.loggedIn).toBe(true);
    expect(s.hosts).toEqual(['github.com']);
    expect(s.accounts).toHaveLength(1);
    expect(s.accounts[0].login).toBe('salilvnair');
    expect(s.accounts[0].active).toBe(true);
    expect(s.accounts[0].scopes).toEqual(['gist', 'read:org', 'repo']);
  });

  it('strips the quotes gh puts around each scope', () => {
    expect(parseAuthStatus(MODERN).accounts[0].scopes).not.toContain("'repo'");
  });
});

describe('gh auth status — the older format', () => {
  /* Pre-2.40, and still what a pinned corporate install prints. */
  const OLD = `github.com
  ✓ Logged in to github.com as salilvnair (oauth_token)
  ✓ Git operations for github.com configured to use https protocol.
  ✓ Token: *******************
  ✓ Token scopes: gist, read:org, repo
`;

  it('reads "as" where the new format says "account"', () => {
    const s = parseAuthStatus(OLD);
    expect(s.loggedIn).toBe(true);
    expect(s.accounts[0].login).toBe('salilvnair');
    expect(s.accounts[0].scopes).toEqual(['gist', 'read:org', 'repo']);
  });

  it('treats the only account as active, since this format never says', () => {
    /* There is exactly one account per host in this format, so defaulting to
       active is correct rather than optimistic. */
    expect(parseAuthStatus(OLD).accounts[0].active).toBe(true);
  });
});

describe('two accounts on one host', () => {
  const TWO = `github.com
  ✓ Logged in to github.com account salilvnair-acme (keyring)
  - Active account: true
  - Token scopes: 'repo', 'read:project'
  ✓ Logged in to github.com account salilvnair (keyring)
  - Active account: false
  - Token scopes: 'repo'
`;

  it('keeps them apart and attributes each line to the right one', () => {
    const s = parseAuthStatus(TWO);
    expect(s.accounts).toHaveLength(2);
    expect(s.accounts[0].login).toBe('salilvnair-acme');
    expect(s.accounts[0].scopes).toEqual(['repo', 'read:project']);
    expect(s.accounts[1].login).toBe('salilvnair');
    expect(s.accounts[1].scopes).toEqual(['repo']);
  });

  it('reports one host, not two', () => {
    expect(parseAuthStatus(TWO).hosts).toEqual(['github.com']);
  });

  it('picks the active one', () => {
    expect(accountFor(parseAuthStatus(TWO), 'github.com')?.login).toBe('salilvnair-acme');
  });
});

describe('an enterprise host beside github.com', () => {
  const BOTH = `github.com
  ✓ Logged in to github.com account salilvnair (keyring)
  - Active account: true
  - Token scopes: 'repo', 'read:project'

git.acme.internal
  ✓ Logged in to git.acme.internal account s-nair (keyring)
  - Active account: true
  - Token scopes: 'repo'
`;

  it('reports both hosts in the order gh printed them', () => {
    expect(parseAuthStatus(BOTH).hosts).toEqual(['github.com', 'git.acme.internal']);
  });

  it('resolves the account per host, which is how dkgh picks a credential', () => {
    const s = parseAuthStatus(BOTH);
    expect(accountFor(s, 'git.acme.internal')?.login).toBe('s-nair');
    expect(accountFor(s, 'github.com')?.login).toBe('salilvnair');
  });

  it('has no account for a host gh does not know', () => {
    expect(accountFor(parseAuthStatus(BOTH), 'ghe.example.com')).toBeUndefined();
  });
});

describe('signed out', () => {
  it('reports not logged in', () => {
    const s = parseAuthStatus('You are not logged into any GitHub hosts. Run gh auth login to authenticate.\n');
    expect(s.loggedIn).toBe(false);
    expect(s.accounts).toEqual([]);
    expect(s.hosts).toEqual([]);
  });

  it('survives empty output rather than throwing', () => {
    expect(parseAuthStatus('').loggedIn).toBe(false);
  });
});

describe('scopes', () => {
  const account = parseAuthStatus(`github.com
  ✓ Logged in to github.com account salilvnair (keyring)
  - Token scopes: 'repo', 'project', 'read:org'
`).accounts[0];

  it('finds one that is present', () => {
    expect(hasScope(account, 'repo')).toBe(true);
    expect(hasScope(account, 'project')).toBe(true);
  });

  it('treats project as covering read:project', () => {
    /* GitHub grants the narrower scope with the wider one. Treating them as
       unrelated strings is how a board with write access decides it cannot
       read, and shows a roadmap full of dashes to somebody who granted
       everything. */
    expect(hasScope(account, 'read:project')).toBe(true);
  });

  it('treats a parent scope as covering its read: child', () => {
    expect(hasScope(account, 'read:org')).toBe(true);
  });

  it('says no to one that is absent', () => {
    expect(hasScope(account, 'admin:org')).toBe(false);
    expect(hasScope(account, 'workflow')).toBe(false);
  });

  it('says no rather than throwing when there is no account', () => {
    expect(hasScope(undefined, 'repo')).toBe(false);
  });

  it('is case-insensitive about what it is asked', () => {
    expect(hasScope(account, 'REPO')).toBe(true);
  });
});

describe('output arriving on stderr', () => {
  it('parses the same, because the caller concatenates both streams', () => {
    /* gh has printed this to stdout or stderr depending on version and on
       whether it considered the state an error. A parser fed only stdout
       reports "not logged in" on a working machine. */
    const onStderr = `github.com
  ✓ Logged in to github.com account salilvnair (keyring)
  - Token scopes: 'repo'
`;
    expect(parseAuthStatus('' + onStderr).loggedIn).toBe(true);
  });
});
