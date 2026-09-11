/**
 * Which repositories a search is allowed to return.
 *
 * Yours and your organisations', and nothing else. It used to also run
 * `gh search repos`, which searches the whole of GitHub — typing "ze" returned
 * `apache/zeppelin` and `zephyrproject-rtos/zephyr`, and because the sort is by
 * how recently something was pushed, those crowded out the account's own
 * `Sorting-Visualizer`. A picker that answers with somebody else's repository
 * is a picker you cannot trust with the one you meant.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const run = vi.fn();
vi.mock('./gh', () => ({ run: (...a: unknown[]) => run(...a) }));

const { searchRepos, myOrgs, clearOrgCache, clearRepoListCache } = await import('./repos');

const repo = (nameWithOwner: string, pushedAt = '2026-09-01T00:00:00Z') =>
  ({ nameWithOwner, isPrivate: false, isArchived: false, isFork: false, pushedAt });

/** gh answers: orgs, then a repo list per owner, then the per-row counts. */
function serves(byOwner: Record<string, unknown[]>, orgs: string[] = []) {
  run.mockImplementation(async (argv: string[]) => {
    const a = argv.join(' ');
    if (a.includes('user/orgs')) {
      return { ok: true, stderr: '', stdout: orgs.join('\n') };
    }
    if (a.startsWith('repo list')) {
      const owner = argv[2] === '--limit' ? '' : argv[2];
      return { ok: true, stderr: '', stdout: JSON.stringify(byOwner[owner] ?? []) };
    }
    /* openIssueCount and templateCount, which every shown row costs. */
    return { ok: true, stderr: '', stdout: '[]' };
  });
}

beforeEach(() => {
  run.mockReset();
  /* Both caches, or one test's repository list answers the next one's search. */
  clearOrgCache();
  clearRepoListCache();
});

describe('searchRepos', () => {
  it('never runs `gh search repos` — that is the whole of GitHub', async () => {
    serves({ '': [repo('salilvnair/Sorting-Visualizer')] });
    await searchRepos('ze');
    const ran = run.mock.calls.map(c => (c[0] as string[]).join(' '));
    expect(ran.some(c => c.startsWith('search repos'))).toBe(false);
  });

  it('lists the account s own repositories', async () => {
    serves({ '': [repo('salilvnair/Sorting-Visualizer'), repo('salilvnair/daakia')] });
    const out = await searchRepos('visual');
    expect(out.repos.map(r => r.nameWithOwner)).toEqual(['salilvnair/Sorting-Visualizer']);
  });

  it('lists every organisation the account belongs to', async () => {
    serves({
      '': [repo('me/nothing')],
      acme: [repo('acme/orders-web')],
      zeta: [repo('zeta/zebra')],
    }, ['acme', 'zeta']);
    const out = await searchRepos('ze');
    expect(out.repos.map(r => r.nameWithOwner)).toEqual(['zeta/zebra']);
  });

  it('finds a private org repository, which is the reason orgs are listed', async () => {
    serves({
      '': [],
      acme: [{ ...repo('acme/orders-web'), isPrivate: true }],
    }, ['acme']);
    const out = await searchRepos('orders');
    expect(out.repos[0]).toMatchObject({ nameWithOwner: 'acme/orders-web', isPrivate: true });
  });

  it('an owner-qualified query lists that owner alone, orgs included or not', async () => {
    serves({ other: [repo('other/thing')] }, ['acme']);
    const out = await searchRepos('other/thing');
    const ran = run.mock.calls.map(c => (c[0] as string[]).join(' '));
    expect(ran.some(c => c.includes('user/orgs'))).toBe(false);
    expect(out.repos.map(r => r.nameWithOwner)).toEqual(['other/thing']);
  });

  it('newest push first, because that is the one being worked on', async () => {
    serves({ '': [
      repo('me/old', '2020-01-01T00:00:00Z'),
      repo('me/new', '2026-09-10T00:00:00Z'),
    ] });
    const out = await searchRepos('me');
    expect(out.repos.map(r => r.nameWithOwner)).toEqual(['me/new', 'me/old']);
  });

  it('an empty query asks gh nothing at all', async () => {
    serves({});
    const out = await searchRepos('   ');
    expect(run).not.toHaveBeenCalled();
    expect(out.repos).toEqual([]);
  });
});

describe('myOrgs', () => {
  it('is an empty list when the call fails — a narrower search, not a broken one', async () => {
    run.mockResolvedValue({ ok: false, stdout: '', stderr: 'no scope' });
    expect(await myOrgs()).toEqual([]);
  });

  it('is cached, so typing does not spend a call per keystroke', async () => {
    run.mockResolvedValue({ ok: true, stdout: 'acme\nzeta', stderr: '' });
    expect(await myOrgs(1000)).toEqual(['acme', 'zeta']);
    expect(await myOrgs(2000)).toEqual(['acme', 'zeta']);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('asks again once the cache is old', async () => {
    run.mockResolvedValue({ ok: true, stdout: 'acme', stderr: '' });
    await myOrgs(0);
    await myOrgs(10 * 60_000);
    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe('the cost of typing', () => {
  it('runs the owners in parallel, not one after another', async () => {
    const order: string[] = [];
    run.mockImplementation(async (argv: string[]) => {
      const a = argv.join(' ');
      if (a.includes('user/orgs')) return { ok: true, stderr: '', stdout: 'a\nb\nc' };
      if (a.startsWith('repo list')) {
        order.push('start');
        await new Promise(r => setTimeout(r, 20));
        order.push('end');
        return { ok: true, stderr: '', stdout: '[]' };
      }
      return { ok: true, stderr: '', stdout: '[]' };
    });
    await searchRepos('x');
    /* In series the pattern is start,end,start,end… — in parallel every start
       lands before the first end. */
    expect(order.slice(0, 4)).toEqual(['start', 'start', 'start', 'start']);
  });

  it('the second search inside a minute asks gh for nothing', async () => {
    serves({ '': [repo('me/thing')] });
    await searchRepos('thi');
    const first = run.mock.calls.length;
    run.mockClear();
    await searchRepos('thin');
    const listed = run.mock.calls
      .map(c => (c[0] as string[]).join(' '))
      .filter(c => c.startsWith('repo list') || c.includes('user/orgs'));
    expect(first).toBeGreaterThan(0);
    expect(listed).toEqual([]);
  });

  it('a failure on one owner does not lose the others', async () => {
    run.mockImplementation(async (argv: string[]) => {
      const a = argv.join(' ');
      if (a.includes('user/orgs')) return { ok: true, stderr: '', stdout: 'broken' };
      if (a === 'repo list broken --limit 200 --json ' + REPO_FIELDS) {
        return { ok: false, stdout: '', stderr: 'that org is gone' };
      }
      if (a.startsWith('repo list')) {
        return { ok: true, stderr: '', stdout: JSON.stringify([repo('me/kept')]) };
      }
      return { ok: true, stderr: '', stdout: '[]' };
    });
    const out = await searchRepos('kept');
    expect(out.repos.map(r => r.nameWithOwner)).toEqual(['me/kept']);
  });
});

const REPO_FIELDS = [
  'nameWithOwner', 'description', 'isPrivate', 'isArchived', 'isFork',
  'parent', 'pushedAt', 'hasIssuesEnabled',
].join(',');
