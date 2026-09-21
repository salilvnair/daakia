import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const posted: { type: string }[] = [];
vi.mock('../vscode', () => ({ postMsg: (m: { type: string }) => posted.push(m) }));

import { wireWorkspaceMessages } from './workspace-store';

/*
  The tab badges (collections, environments, history) come from the host's
  workspace snapshot. It used to arrive only on a switch, so deleting the last
  history row left "History 1" over an empty list. Any change to the counted
  data now asks for the snapshot again — once for a burst.
*/

const send = (type: string) => window.dispatchEvent(new MessageEvent('message', { data: { type } }));

describe('workspace counts follow the data', () => {
  let unwire: () => void;
  beforeEach(() => { vi.useFakeTimers(); posted.length = 0; unwire = wireWorkspaceMessages(() => undefined); });
  afterEach(() => { unwire(); vi.useRealTimers(); });

  it('asks for fresh counts after history, collections or environments change', () => {
    for (const type of ['historyData', 'collectionsData', 'environmentsData']) {
      posted.length = 0;
      send(type);
      vi.advanceTimersByTime(450);
      expect(posted.filter(m => m.type === 'getWorkspaces')).toHaveLength(1);
    }
  });

  it('asks once for a burst', () => {
    for (let i = 0; i < 7; i++) send('historyData');
    send('collectionsData');
    vi.advanceTimersByTime(450);
    expect(posted.filter(m => m.type === 'getWorkspaces')).toHaveLength(1);
  });

  it('does not answer its own reply', () => {
    send('workspacesData');
    vi.advanceTimersByTime(450);
    expect(posted).toEqual([]);
  });
});
