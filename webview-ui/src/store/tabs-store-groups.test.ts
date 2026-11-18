/**
 * The tab store keeps the group rules whatever changed the tabs — and still
 * records what closed. An early return in its subscriber once did one and
 * skipped the other: closing a group's last tab left the group behind.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useTabsStore } from './tabs-store';

const st = () => useTabsStore.getState();

describe('tab store: groups and closed tabs together', () => {
  /* Two writes: emptying the tabs counts as closing the last test's tabs, which
     the store rightly records — the second write clears that record. */
  beforeEach(() => {
    useTabsStore.setState({ tabs: [], tabGroups: [], activeTabId: '' });
    useTabsStore.setState({ closedTabs: [], recentTabIds: [] });
  });

  it('drops a group when its last tab closes, and keeps the tab for Reopen', () => {
    st().addTab({ protocol: 'rest', name: 'Cart' });
    const id = st().activeTabId;
    st().addTab({ protocol: 'rest', name: 'Other' });
    st().createTabGroup([id], 'Checkout');
    expect(st().tabGroups).toHaveLength(1);
    st().closeTab(id);
    expect(st().tabGroups).toEqual([]);
    expect(st().closedTabs.map(t => t.name)).toEqual(['Cart']);
  });

  it('opens a folded group when a tab inside it comes to the front, and remembers the order used', () => {
    st().addTab({ protocol: 'rest', name: 'A' });
    const a = st().activeTabId;
    st().addTab({ protocol: 'rest', name: 'B' });
    const b = st().activeTabId;
    const g = st().createTabGroup([a]);
    st().toggleTabGroup(g, true);
    expect(st().tabGroups[0].collapsed).toBe(true);
    st().setActiveTab(a);
    expect(st().tabGroups[0].collapsed).toBe(false);
    expect(st().recentTabIds.slice(0, 2)).toEqual([a, b]);
  });

  it('reopens a closed tab into the group it left', () => {
    st().addTab({ protocol: 'rest', name: 'A' });
    const a = st().activeTabId;
    st().addTab({ protocol: 'rest', name: 'B' });
    const b = st().activeTabId;
    const g = st().createTabGroup([a, b]);
    st().closeTab(a);
    st().reopenClosedTab();
    expect(st().tabs.find(t => t.id === a)?.groupId).toBe(g);
    expect(st().closedTabs).toEqual([]);
  });
});
