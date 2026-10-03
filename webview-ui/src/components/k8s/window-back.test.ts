import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../vscode', () => ({
  postMsg: () => {},
  getVsCodeApi: () => ({ postMessage: () => {}, getState: () => undefined, setState: () => {} }),
}));
vi.mock('../../store/ui-audit-store', () => ({ logUiEvent: () => {} }));

import { backToSearch } from './WindowTab';
import { useTabsStore } from '../../store/tabs-store';
import { useResultTabStore } from '../../store/dk8s-result-tab-store';
import { useDk8sSearchStore } from '../../store/dk8s-search-store';

beforeEach(() => {
  useDk8sSearchStore.setState({ open: false });
});

describe("a window's link back to its search", () => {
  it('goes to the results page while it still shows that search', () => {
    useResultTabStore.setState({ query: 'LedgerClient', at: 100 });
    backToSearch('LedgerClient', 100);
    const active = useTabsStore.getState().tabs.find(t => t.id === useTabsStore.getState().activeTabId);
    expect(active?.type).toBe('dk8s-results');
    expect(useDk8sSearchStore.getState().open).toBe(false);
  });

  it('opens the search with its query when the page has moved on to another', () => {
    useResultTabStore.setState({ query: 'timeout', at: 200 });
    const before = useTabsStore.getState().tabs.find(t => t.type === 'dk8s-results')?.name;
    backToSearch('LedgerClient', 100);
    /* The page is neither shown nor renamed to a search it does not hold. */
    expect(useTabsStore.getState().tabs.find(t => t.type === 'dk8s-results')?.name).toBe(before);
    expect(useDk8sSearchStore.getState()).toMatchObject({ open: true, options: expect.objectContaining({ query: 'LedgerClient' }) });
  });
});
