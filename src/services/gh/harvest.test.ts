/**
 * Paging a whole repository.
 *
 * The things that matter here are the ones that only show up at scale: that a
 * pull request is not an issue even though the endpoint returns it as one,
 * that the walk stops when the page comes back short rather than asking for a
 * page that does not exist, and that it does not spend the last of somebody's
 * hourly budget. The last one is the reason this file exists — an export that
 * exhausts a rate limit breaks every other tool that account uses for the next
 * fifty minutes, and it does it silently.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const run = vi.fn();
vi.mock('./gh', () => ({ run: (...a: unknown[]) => run(...a) }));
vi.mock('./board', async () => {
  const real = await vi.importActual<Record<string, unknown>>('./board');
  return {
    ...real,
    fetchTemplates: async () => ({ dimensions: [], forms: [], errors: [], noTemplates: true }),
    fetchRateLimit: async () => rate,
  };
});

let rate: { remaining: number; limit: number; resetAt: number } | undefined;

const {
  countIssues, etaFrom, fromRest, harvest, isPullRequest, PER_PAGE, tooLow,
} = await import('./harvest');

/** A REST issue row. */
const row = (number: number, extra: Record<string, unknown> = {}) => ({
  number, title: `Issue ${number}`, body: '', state: 'open',
  html_url: `https://github.com/a/b/issues/${number}`,
  user: { login: 'salilvnair' }, assignees: [], labels: [],
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z',
  comments: 0, ...extra,
});

/** gh answers: a count, then a page per call. */
function serves(pages: unknown[][], total = pages.flat().length) {
  run.mockImplementation(async (argv: string[]) => {
    const arg = argv.join(' ');
    if (arg.includes('graphql')) {
      return { ok: true, stderr: '', stdout: JSON.stringify({
        data: { repository: { issues: { totalCount: total } } },
      }) };
    }
    const m = /[?&]page=(\d+)/.exec(arg);
    const page = m ? Number(m[1]) : 1;
    return { ok: true, stderr: '', stdout: JSON.stringify(pages[page - 1] ?? []) };
  });
}

beforeEach(() => {
  run.mockReset();
  rate = { remaining: 4190, limit: 5000, resetAt: 0 };
});

describe('fromRest', () => {
  it('translates REST s lower-case state into the spelling the board maps', () => {
    expect(fromRest({ state: 'closed' }).state).toBe('CLOSED');
    expect(fromRest({ state: 'open' }).state).toBe('OPEN');
  });

  it('takes the author from `user`, which is what REST calls it', () => {
    expect(fromRest({ user: { login: 'rmenon' } }).author?.login).toBe('rmenon');
  });

  it('turns REST s explicit null milestone into an absent one', () => {
    expect(fromRest({ milestone: null }).milestone).toBeUndefined();
  });
});

describe('isPullRequest', () => {
  it('is true only for a row carrying the key GitHub marks PRs with', () => {
    expect(isPullRequest({ pull_request: { url: 'x' } })).toBe(true);
    expect(isPullRequest({})).toBe(false);
    expect(isPullRequest({ pull_request: null })).toBe(false);
  });
});

describe('tooLow', () => {
  it('is true under a tenth of the budget', () => {
    expect(tooLow({ remaining: 400, limit: 5000, resetAt: 0 })).toBe(true);
  });

  it('is false at a tenth exactly — the reserve is the floor, not a margin', () => {
    expect(tooLow({ remaining: 500, limit: 5000, resetAt: 0 })).toBe(false);
  });

  it('does not pause on a rate it could not read', () => {
    expect(tooLow(undefined)).toBe(false);
    expect(tooLow({ remaining: 0, limit: 0, resetAt: 0 })).toBe(false);
  });
});

describe('etaFrom', () => {
  it('projects the remaining time from the pages already done', () => {
    /* 100 of 200 in ten seconds → ten more seconds. */
    expect(etaFrom(0, 100, 200, 10_000)).toBe(10);
  });

  it('says nothing before anything has been read', () => {
    expect(etaFrom(0, 0, 200, 10_000)).toBeUndefined();
  });

  it('says nothing once it is done, rather than "0 seconds left"', () => {
    expect(etaFrom(0, 200, 200, 10_000)).toBeUndefined();
  });
});

describe('countIssues', () => {
  it('asks GraphQL, because REST s count includes pull requests', async () => {
    serves([[]], 2140);
    expect(await countIssues('acme/app')).toBe(2140);
    expect(run.mock.calls[0][0]).toContain('graphql');
  });

  it('returns nothing rather than a wrong denominator when the call fails', async () => {
    run.mockResolvedValue({ ok: false, stdout: '', stderr: 'nope' });
    expect(await countIssues('acme/app')).toBeUndefined();
  });

  it('never calls gh for a repo that is not owner/name', async () => {
    expect(await countIssues('app')).toBeUndefined();
    expect(run).not.toHaveBeenCalled();
  });
});

describe('harvest', () => {
  it('walks every page and stops on the short one', async () => {
    const full = Array.from({ length: PER_PAGE }, (_, i) => row(i + 1));
    serves([full, [row(101), row(102)]], 102);
    const out = await harvest('acme/app');
    expect(out.issues).toHaveLength(102);
    expect(out.error).toBeUndefined();
    const pageCalls = run.mock.calls.filter(c => (c[0] as string[]).join(' ').includes('page='));
    expect(pageCalls).toHaveLength(2);
  });

  it('asks for pages of a hundred, state=all', async () => {
    serves([[row(1)]], 1);
    await harvest('acme/app');
    const argv = run.mock.calls.find(c => (c[0] as string[]).join(' ').includes('page='))![0];
    expect((argv as string[])[1])
      .toBe('/repos/acme/app/issues?state=all&per_page=100&page=1');
  });

  it('drops pull requests, which that endpoint returns as issues', async () => {
    serves([[row(1), row(2, { pull_request: { url: 'x' } }), row(3)]], 3);
    const out = await harvest('acme/app');
    expect(out.issues.map(i => i.number)).toEqual([1, 3]);
  });

  it('counts the bodies it could not parse, which is 15D s amber line', async () => {
    serves([[row(1), row(2)]], 2);
    const out = await harvest('acme/app');
    /* No templates in this repo, so nothing has dimensions. */
    expect(out.progress.unparsed).toBe(2);
    expect(out.progress.parsed).toBe(0);
  });

  it('reports progress after every page, not only at the end', async () => {
    const full = Array.from({ length: PER_PAGE }, (_, i) => row(i + 1));
    serves([full, [row(101)]], 101);
    const seen: number[] = [];
    await harvest('acme/app', { onProgress: p => seen.push(p.done) });
    expect(seen).toEqual([100, 101]);
  });

  it('waits for the reset rather than spending the last of the budget', async () => {
    rate = { remaining: 100, limit: 5000, resetAt: 60_000 };
    serves([[row(1)]], 1);
    const waited: number[] = [];
    await harvest('acme/app', {
      now: () => 0,
      wait: async ms => { waited.push(ms); },
    });
    expect(waited).toEqual([60_000]);
  });

  it('says it is paused before it waits, so the dialog can explain the stall', async () => {
    rate = { remaining: 100, limit: 5000, resetAt: 60_000 };
    serves([[row(1)]], 1);
    const paused: (number | undefined)[] = [];
    await harvest('acme/app', {
      now: () => 0, wait: async () => {},
      onProgress: p => paused.push(p.pausedUntil),
    });
    expect(paused).toContain(60_000);
  });

  it('keeps what it read when a page fails, and says why', async () => {
    const full = Array.from({ length: PER_PAGE }, (_, i) => row(i + 1));
    run.mockImplementation(async (argv: string[]) => {
      const arg = argv.join(' ');
      if (arg.includes('graphql')) {
        return { ok: true, stderr: '', stdout: JSON.stringify({
          data: { repository: { issues: { totalCount: 200 } } },
        }) };
      }
      if (arg.includes('page=2')) return { ok: false, stdout: '', stderr: 'API rate limit' };
      return { ok: true, stderr: '', stdout: JSON.stringify(full) };
    });
    const out = await harvest('acme/app');
    expect(out.issues).toHaveLength(100);
    expect(out.error).toBe('API rate limit');
  });

  it('stops between pages when asked, and says it was cancelled', async () => {
    const full = Array.from({ length: PER_PAGE }, (_, i) => row(i + 1));
    serves([full, full], 200);
    let pages = 0;
    const out = await harvest('acme/app', {
      onProgress: () => { pages++; },
      cancelled: () => pages >= 1,
    });
    expect(out.cancelled).toBe(true);
    expect(out.issues).toHaveLength(100);
  });

  it('says so rather than throwing when a page is not JSON', async () => {
    run.mockImplementation(async (argv: string[]) => (
      argv.join(' ').includes('graphql')
        ? { ok: true, stderr: '', stdout: '{"data":{"repository":{"issues":{"totalCount":1}}}}' }
        : { ok: true, stderr: '', stdout: '<html>' }
    ));
    const out = await harvest('acme/app');
    expect(out.error).toBe('gh returned something that is not JSON.');
  });

  it('an empty repository is one page and no error', async () => {
    serves([[]], 0);
    const out = await harvest('acme/app');
    expect(out.issues).toEqual([]);
    expect(out.error).toBeUndefined();
  });
});
