/** Smoke tests — tab lifecycle: add, update, close, duplicate, active switching. */
import { describe, it, expect, beforeEach } from 'vitest';
import { useTabsStore } from '../store/tabs-store';

describe('tabs-store', () => {
  beforeEach(() => {
    // reset to a clean slate
    const s = useTabsStore.getState();
    for (const t of [...s.tabs]) s.closeTab(t.id);
  });

  it('addTab creates a tab and makes it active', () => {
    useTabsStore.getState().addTab({ url: 'https://example.com' });
    const s = useTabsStore.getState();
    expect(s.tabs.length).toBeGreaterThan(0);
    const active = s.tabs.find(t => t.id === s.activeTabId);
    expect(active).toBeDefined();
    expect(active!.url).toBe('https://example.com');
  });

  it('updateTab patches only the target tab', () => {
    useTabsStore.getState().addTab({ url: 'https://a.com' });
    useTabsStore.getState().addTab({ url: 'https://b.com' });
    const s1 = useTabsStore.getState();
    const [tabA, tabB] = s1.tabs.slice(-2);
    s1.updateTab(tabA.id, { url: 'https://a-updated.com' });
    const s2 = useTabsStore.getState();
    expect(s2.tabs.find(t => t.id === tabA.id)!.url).toBe('https://a-updated.com');
    expect(s2.tabs.find(t => t.id === tabB.id)!.url).toBe('https://b.com');
  });

  it('closeTab removes the tab and moves activeTabId off it', () => {
    useTabsStore.getState().addTab({ url: 'https://one.com' });
    useTabsStore.getState().addTab({ url: 'https://two.com' });
    const s1 = useTabsStore.getState();
    const activeId = s1.activeTabId!;
    s1.closeTab(activeId);
    const s2 = useTabsStore.getState();
    expect(s2.tabs.find(t => t.id === activeId)).toBeUndefined();
    expect(s2.activeTabId).not.toBe(activeId);
  });

  it('duplicateTab copies the request config into a new tab', () => {
    useTabsStore.getState().addTab({ url: 'https://dup-me.com', method: 'POST' });
    const s1 = useTabsStore.getState();
    const orig = s1.tabs[s1.tabs.length - 1];
    const before = s1.tabs.length;
    s1.duplicateTab(orig.id);
    const s2 = useTabsStore.getState();
    expect(s2.tabs.length).toBe(before + 1);
    const dup = s2.tabs[s2.tabs.length - 1];
    expect(dup.id).not.toBe(orig.id);
    expect(dup.url).toBe('https://dup-me.com');
    expect(dup.method).toBe('POST');
  });
});
