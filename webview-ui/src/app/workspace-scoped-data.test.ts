import { describe, it, expect, vi, beforeEach } from 'vitest';

const posted: { type: string; protocol?: string }[] = [];
vi.mock('../vscode', () => ({
  getVsCodeApi: () => ({ postMessage: (m: { type: string; protocol?: string }) => posted.push(m) }),
  postMsg: (m: { type: string; protocol?: string }) => posted.push(m),
}));

import { loadWorkspaceScopedData } from './workspace-scoped-data';
import { PROTOCOLS } from '../components/workspace/ProtocolSections';

/*
  After a workspace switch, anything not asked for again keeps the previous
  workspace's rows on screen. AI history was left out, so the Workspace page
  showed the same AI requests in every workspace — including a teammate's
  read-only one — while the database had them correctly in just one.
*/

const asked = (type: string) => posted.filter(m => m.type === type).map(m => m.protocol);

describe('loadWorkspaceScopedData', () => {
  beforeEach(() => { posted.length = 0; });

  it('asks again for the history of every protocol the Workspace page shows', () => {
    loadWorkspaceScopedData();
    for (const p of PROTOCOLS) expect(asked('getHistory')).toContain(p.id);
  });

  it('asks again for the collections of every protocol the Workspace page shows', () => {
    loadWorkspaceScopedData();
    for (const p of PROTOCOLS) expect(asked('getCollections')).toContain(p.id);
  });

  it('includes the realtime protocols the sidebar keeps history for', () => {
    loadWorkspaceScopedData();
    expect(asked('getHistory')).toEqual(expect.arrayContaining(['ai', 'sse', 'socketio', 'mqtt']));
  });

  it('asks for environments too', () => {
    loadWorkspaceScopedData();
    expect(asked('getEnvironments')).toHaveLength(1);
  });
});
