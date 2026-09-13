/**
 * What a remembered search remembers.
 *
 * The history used to be a list of strings, which made "run that again" mean
 * "type that again and re-pick the pods" — and re-picking twenty-eight pods by
 * hand is most of the work of setting a search up. An entry now carries the
 * pods it ran over.
 *
 * Two things are worth pinning down here. The first is that the key already
 * holds the old shape on every machine this has ever run on, and dropping
 * those on sight would empty the history of everyone who had one. The second
 * is the identity a pod is stored under: NOT its uid, which dies with it, and
 * the usual reason to re-run a search is that something restarted.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const KEY = 'dk8s.search.history';

/** A fresh module each time — the history is read once, at import. */
async function load(stored?: string) {
  localStorage.clear();
  if (stored !== undefined) localStorage.setItem(KEY, stored);
  vi.resetModules();
  return (await import('./dk8s-search-store')).useDk8sSearchStore;
}

const pod = (name: string, namespace = 'checkout', context = 'kind-dk8s-prod') =>
  ({ name, namespace, context });

beforeEach(() => localStorage.clear());

describe('reading what is already stored', () => {
  it('reads the old string list as entries that do not remember their pods', async () => {
    const store = await load(JSON.stringify(['tesy', 'timeout']));
    expect(store.getState().history).toEqual([
      { query: 'tesy', pods: [], at: 0 },
      { query: 'timeout', pods: [], at: 0 },
    ]);
  });

  it('reads the new shape back whole', async () => {
    const entry = { query: 'oom', pods: [pod('checkout-api-1')], at: 1700000000000 };
    const store = await load(JSON.stringify([entry]));
    expect(store.getState().history).toEqual([entry]);
  });

  it('drops entries with no query rather than offering a blank row', async () => {
    const store = await load(JSON.stringify(['', '   ', { query: '' }, 'real']));
    expect(store.getState().history.map(h => h.query)).toEqual(['real']);
  });

  it('survives something else having written the key', async () => {
    expect((await load('not json at all')).getState().history).toEqual([]);
    expect((await load(JSON.stringify({ nope: 1 }))).getState().history).toEqual([]);
  });

  it('keeps an entry whose pods are malformed, without the pods', async () => {
    const store = await load(JSON.stringify([{ query: 'q', pods: [null, 7, { name: 'a' }] }]));
    expect(store.getState().history).toEqual([{ query: 'q', pods: [], at: 0 }]);
  });
});

describe('remembering', () => {
  it('stores the pods by identity, not by uid', async () => {
    const store = await load();
    /* A whole pod, the way the caller hands one over — uid and all. It is the
       uid NOT surviving that this test is about. */
    const live = { name: 'checkout-api-1', namespace: 'checkout', context: 'kind-dk8s-prod', uid: 'abc' };
    store.getState().remember('timeout', [live]);
    expect(store.getState().history[0].pods).toEqual([
      { name: 'checkout-api-1', namespace: 'checkout', context: 'kind-dk8s-prod' },
    ]);
  });

  it('is one entry, moved to the front, when the same search runs twice', async () => {
    const store = await load();
    store.getState().remember('a', [pod('p1')]);
    store.getState().remember('b', [pod('p2')]);
    store.getState().remember('a', [pod('p3')]);

    expect(store.getState().history.map(h => h.query)).toEqual(['a', 'b']);
    /* The pods come from the latest run: those are the ones re-running it
       would now mean. */
    expect(store.getState().history[0].pods.map(p => p.name)).toEqual(['p3']);
  });

  it('ignores a blank query, which is not a search anybody ran', async () => {
    const store = await load();
    store.getState().remember('   ', [pod('p1')]);
    expect(store.getState().history).toEqual([]);
  });

  it('trims, so the same search typed with a trailing space is the same entry', async () => {
    const store = await load();
    store.getState().remember('oom ', [pod('p1')]);
    store.getState().remember('oom', [pod('p1')]);
    expect(store.getState().history.map(h => h.query)).toEqual(['oom']);
  });

  it('keeps twelve, and forgets the thirteenth from the far end', async () => {
    const store = await load();
    for (let i = 1; i <= 15; i++) store.getState().remember(`q${i}`, []);
    const kept = store.getState().history.map(h => h.query);
    expect(kept).toHaveLength(12);
    expect(kept[0]).toBe('q15');
    expect(kept).not.toContain('q3');
  });

  it('survives a reload', async () => {
    const store = await load();
    store.getState().remember('oom', [pod('checkout-api-1')]);

    const reopened = await load(localStorage.getItem(KEY)!);
    expect(reopened.getState().history[0]).toMatchObject({
      query: 'oom',
      pods: [{ name: 'checkout-api-1', namespace: 'checkout', context: 'kind-dk8s-prod' }],
    });
  });
});

describe('forgetting', () => {
  it('drops the one named and leaves the rest', async () => {
    const store = await load();
    store.getState().remember('a', []);
    store.getState().remember('b', []);
    store.getState().forget('a');
    expect(store.getState().history.map(h => h.query)).toEqual(['b']);
  });

  it('reaches the stored copy too, not just the one on screen', async () => {
    const store = await load();
    store.getState().remember('a', []);
    store.getState().forget('a');
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([]);
  });

  it('clears the lot', async () => {
    const store = await load();
    store.getState().remember('a', []);
    store.getState().remember('b', []);
    store.getState().clearHistory();
    expect(store.getState().history).toEqual([]);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([]);
  });
});

describe('opening the dialog with a term is not running a search', () => {
  /*
    `searchEverywhere` pre-fills the box from a word highlighted in one pod's
    log and opens the dialog with nothing picked. Recording there put a search
    in the history that nobody had run yet — and, being unrun, one that named
    no pods to restore.
  */
  it('records nothing until the search actually runs', async () => {
    const store = await load();
    store.getState().searchEverywhere('NullPointerException');
    expect(store.getState().history).toEqual([]);
    expect(store.getState().options.query).toBe('NullPointerException');
  });
});
