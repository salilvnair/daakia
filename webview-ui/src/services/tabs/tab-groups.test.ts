import { describe, it, expect } from 'vitest';
import {
  normalize, createGroup, moveToGroup, groupByProtocol, groupBy, autoGroupFor, ungroup, ungroupAll, moveGroup,
  stripPieces, protocolKey, hostKey, type GroupableTab, type TabGroup,
} from './tab-groups';

const t = (id: string, protocol = 'rest', extra: Partial<GroupableTab> = {}): GroupableTab =>
  ({ id, type: 'request', protocol, ...extra });
const ids = (tabs: GroupableTab[]) => tabs.map(x => x.id).join(' ');

describe('tab groups', () => {
  it('gathers a new group where its first tab stood', () => {
    const tabs = [t('a'), t('b'), t('c'), t('d')];
    const r = createGroup(tabs, [], ['b', 'd'], { name: 'Mine' });
    expect(ids(r.tabs)).toBe('a b d c');
    expect(r.tabs.filter(x => x.groupId === r.groupId).map(x => x.id)).toEqual(['b', 'd']);
    expect(r.groups[0]).toMatchObject({ name: 'Mine', collapsed: false });
  });

  it('keeps pinned tabs out of groups and at the start', () => {
    const tabs = [t('a'), t('p', 'rest', { pinned: true }), t('b')];
    const r = createGroup(tabs, [], ['p', 'b']);
    expect(ids(r.tabs)).toBe('p a b');
    expect(r.tabs.find(x => x.id === 'p')!.groupId).toBeUndefined();
  });

  it('drops a group once its last tab has gone', () => {
    const groups: TabGroup[] = [{ id: 'g', name: 'G', color: 'x', collapsed: false }];
    expect(normalize([t('a')], groups).groups).toEqual([]);
  });

  it('moves a tab to the end of a group, and out of it to just after the group', () => {
    let r = createGroup([t('a'), t('b'), t('c'), t('d')], [], ['a', 'b'], { id: 'g' });
    r = { ...moveToGroup(r.tabs, r.groups, 'd', 'g'), groupId: 'g' };
    expect(ids(r.tabs)).toBe('a b d c');
    const out = moveToGroup(r.tabs, r.groups, 'a', null);
    expect(ids(out.tabs)).toBe('b d a c');
    expect(out.tabs.find(x => x.id === 'a')!.groupId).toBeUndefined();
  });

  it('groups by protocol, telling the realtime transports apart, and leaves hand-made groups alone', () => {
    const tabs = [
      t('r1'), t('s1', 'soap'), t('r2'),
      t('sse', 'websocket', { authData: { rt_protocol: 'sse' } }),
      t('ws', 'websocket'),
      { id: 'pad', type: 'scratchpad', protocol: 'rest' },
      { id: 'set', type: 'settings', protocol: 'rest' },
      t('mine', 'rest', { groupId: 'h' }),
    ];
    const r = groupByProtocol(tabs, [{ id: 'h', name: 'Mine', color: 'x', collapsed: false }]);
    const names = Object.fromEntries(r.groups.map(g => [g.id, g.name]));
    const of = (id: string) => names[r.tabs.find(x => x.id === id)!.groupId!];
    expect(of('r1')).toBe('REST');
    expect(of('r2')).toBe('REST');
    expect(of('s1')).toBe('SOAP');
    expect(of('sse')).toBe('SSE');
    expect(of('ws')).toBe('WebSocket');
    expect(of('pad')).toBe('Scratchpads');
    expect(r.tabs.find(x => x.id === 'set')!.groupId).toBeUndefined();
    expect(of('mine')).toBe('Mine');
    expect(ids(r.tabs)).toBe('r1 r2 s1 sse ws pad set mine');
  });

  it('finds the group a new tab joins, and never a hand-made one', () => {
    const groups: TabGroup[] = [
      { id: 'h', name: 'Mine', color: 'x', collapsed: false },
      { id: 'p', name: 'SOAP', color: 'y', collapsed: false, auto: { by: 'protocol', key: 'soap' } },
      { id: 'o', name: 'api.shop.test', color: 'z', collapsed: false, auto: { by: 'host', key: 'api.shop.test' } },
    ];
    expect(autoGroupFor(t('n', 'soap'), groups)).toBe('p');
    expect(autoGroupFor(t('n', 'rest'), groups)).toBeUndefined();
    expect(autoGroupFor(t('n', 'rest', { url: 'https://API.shop.test/v1/cart' }), groups)).toBe('o');
    expect(protocolKey(t('n', 'websocket', { authData: { rt_protocol: 'mqtt' } }))).toBe('mqtt');
  });

  it('ungroups one group or all of them', () => {
    const r = groupByProtocol([t('a'), t('b', 'soap')], []);
    const soap = r.groups.find(g => g.auto?.key === 'soap')!.id;
    expect(ungroup(r.tabs, r.groups, soap).groups.map(g => g.name)).toEqual(['REST']);
    const all = ungroupAll(r.tabs);
    expect(all.groups).toEqual([]);
    expect(all.tabs.every(x => !x.groupId)).toBe(true);
  });

  it('moves a whole group, and before a tab of another group means before that group', () => {
    const r = groupByProtocol([t('r1'), t('r2'), t('s1', 'soap'), t('g1', 'graphql')], []);
    const rest = r.groups.find(g => g.auto?.key === 'rest')!.id;
    expect(ids(moveGroup(r.tabs, r.groups, rest, null).tabs)).toBe('s1 g1 r1 r2');
    const gql = r.groups.find(g => g.auto?.key === 'graphql')!.id;
    expect(ids(moveGroup(r.tabs, r.groups, gql, 'r2').tabs)).toBe('g1 r1 r2 s1');
  });

  it('groups by host as written, a variable included, and by collection under its name', () => {
    expect(hostKey(t('a', 'rest', { url: '{{baseUrl}}/users' }))).toBe('{{baseurl}}');
    expect(hostKey(t('a', 'rest', { url: 'localhost:8080/health' }))).toBe('localhost:8080');
    expect(hostKey(t('a', 'rest', { url: '' }))).toBeNull();
    const tabs = [
      t('a', 'rest', { url: 'https://api.shop.test/a', collectionId: 'c1' }),
      t('b', 'graphql', { url: 'https://api.shop.test/graphql' }),
      t('c', 'rest', { url: 'https://auth.shop.test/token', collectionId: 'c1' }),
    ];
    const byHost = groupBy(tabs, [], 'host');
    expect(byHost.groups.map(g => g.name)).toEqual(['api.shop.test', 'auth.shop.test']);
    expect(ids(byHost.tabs)).toBe('a b c');
    const byColl = groupBy(tabs, [], 'collection', k => (k === 'c1' ? 'Orders API' : k));
    expect(byColl.groups.map(g => g.name)).toEqual(['Orders API']);
    expect(ids(byColl.tabs)).toBe('a c b');
  });

  it('draws the strip as loose tabs and groups', () => {
    const r = createGroup([t('a'), t('b'), t('c')], [], ['b', 'c'], { id: 'g', name: 'G' });
    expect(stripPieces(r.tabs, r.groups).map(p => (p.kind === 'tab' ? p.tab.id : `[${p.tabs.map(x => x.id).join(',')}]`))).toEqual(['a', '[b,c]']);
  });
});
