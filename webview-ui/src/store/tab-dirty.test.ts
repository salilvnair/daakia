/**
 * When a tab is dirty.
 *
 * The unsaved dot is the only thing standing between a user and closing a tab
 * they had edited, so it has to be right in both directions — and it is easy to
 * break in either. A dot that appears on an untouched tab trains people to
 * ignore it; one that fails to appear loses work.
 *
 * The case that put this here: a panel writing its own default back on mount
 * marked a brand-new tab dirty before anything had been typed.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useTabsStore } from './tabs-store';

function freshTab(): string {
  useTabsStore.setState({ tabs: [], activeTabId: '' });
  useTabsStore.getState().addTab({ protocol: 'rest' });
  return useTabsStore.getState().activeTabId;
}

const tab = (id: string) => useTabsStore.getState().tabs.find(t => t.id === id)!;

describe('a tab opens clean', () => {
  beforeEach(() => { useTabsStore.setState({ tabs: [], activeTabId: '' }); });

  it('has no unsaved dot before anything is typed', () => {
    expect(tab(freshTab()).dirty).toBe(false);
  });
});

describe('writing the same value is not a change', () => {
  it('stays clean when a panel writes back the URL it already had', () => {
    const id = freshTab();
    useTabsStore.getState().updateTab(id, { url: '' });
    expect(tab(id).dirty).toBe(false);
  });

  it('stays clean when a panel writes back an equal — but new — array', () => {
    /* The mount-time default that started all this: a fresh `[]` every render
       is a different object and the same value. */
    const id = freshTab();
    useTabsStore.getState().updateTab(id, { headers: [] });
    expect(tab(id).dirty).toBe(false);
  });

  it('stays clean when a panel writes back an equal object', () => {
    const id = freshTab();
    useTabsStore.getState().updateTab(id, { authData: {} });
    expect(tab(id).dirty).toBe(false);
  });
});

describe('changing something is a change', () => {
  it('goes dirty when the URL is typed into', () => {
    const id = freshTab();
    useTabsStore.getState().updateTab(id, { url: 'https://api.example.com' });
    expect(tab(id).dirty).toBe(true);
  });

  it('goes dirty when a header is added', () => {
    const id = freshTab();
    useTabsStore.getState().updateTab(id, {
      headers: [{ id: 'h1', key: 'Accept', value: 'application/json', enabled: true }] as never,
    });
    expect(tab(id).dirty).toBe(true);
  });

  it('goes dirty when the body changes', () => {
    const id = freshTab();
    useTabsStore.getState().updateTab(id, { bodyRaw: '{"a":1}' });
    expect(tab(id).dirty).toBe(true);
  });

  it('stays dirty once dirty, even if a later write changes nothing', () => {
    const id = freshTab();
    useTabsStore.getState().updateTab(id, { url: 'https://api.example.com' });
    useTabsStore.getState().updateTab(id, { url: 'https://api.example.com' });
    expect(tab(id).dirty).toBe(true);
  });
});

describe('the fields that never count', () => {
  it('does not go dirty when a response arrives', () => {
    const id = freshTab();
    useTabsStore.getState().updateTab(id, {
      response: { status: 200, statusText: 'OK', body: '{}', headers: {}, time: 12, size: 2 } as never,
    });
    expect(tab(id).dirty).toBe(false);
  });

  it('does not go dirty while a request is in flight', () => {
    const id = freshTab();
    useTabsStore.getState().updateTab(id, { loading: true });
    expect(tab(id).dirty).toBe(false);
  });

  it('does not go dirty when the environment is switched', () => {
    const id = freshTab();
    useTabsStore.getState().updateTab(id, { envId: 'env-1' });
    expect(tab(id).dirty).toBe(false);
  });
});

describe('an explicit flag still wins', () => {
  it('honours dirty:true even when nothing else changed', () => {
    /* A caller that says so knows something the comparison cannot see — an
       editor holding its text outside the tab, for instance. */
    const id = freshTab();
    useTabsStore.getState().updateTab(id, { dirty: true });
    expect(tab(id).dirty).toBe(true);
  });

  it('honours dirty:false after a save', () => {
    const id = freshTab();
    useTabsStore.getState().updateTab(id, { url: 'https://api.example.com' });
    useTabsStore.getState().updateTab(id, { dirty: false });
    expect(tab(id).dirty).toBe(false);
  });
});
