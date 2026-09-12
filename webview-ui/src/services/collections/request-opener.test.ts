/**
 * A saved request comes back with the response it was saved with.
 *
 * The Save dialog has stored a response alongside the request for a while, and
 * the database kept it — but the tree query never selected the columns and the
 * opener never read them, so reopening a collection request showed an empty
 * response panel. History looked like the only place a response survived.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { openCollectionRequest } from './request-opener';
import { useTabsStore } from '../../store/tabs-store';
import type { CollectionRequest } from './tree-helpers';

const BASE: CollectionRequest = {
  id: 'req-1',
  collection_id: 'coll-1',
  name: 'Get users',
  method: 'GET',
  url: 'https://api.example.com/users',
  data: JSON.stringify({ headers: [], params: [], bodyMode: 'none' }),
};

const RESPONSE_DATA = JSON.stringify({
  headers: { 'content-type': 'application/json', 'x-request-id': 'req_8f3a' },
  cookies: [{ name: 'session', value: 'abc' }],
  contentType: 'application/json',
  body: '{"users":[{"id":1}]}',
});

/** The tab the opener just created. */
function openedTab() {
  const { tabs, activeTabId } = useTabsStore.getState();
  return tabs.find(t => t.id === activeTabId) ?? tabs[tabs.length - 1];
}

beforeEach(() => {
  useTabsStore.setState({ tabs: [], activeTabId: '' });
  vi.restoreAllMocks();
});

describe('opening a saved request', () => {
  it('restores the response it was saved with', () => {
    openCollectionRequest({
      ...BASE,
      status: 200,
      status_text: 'OK',
      response_time: 142,
      response_size: 512,
      response_data: RESPONSE_DATA,
    });

    const tab = openedTab();
    expect(tab.response).toBeTruthy();
    expect(tab.response).toMatchObject({
      status: 200,
      statusText: 'OK',
      time: 142,
      size: 512,
      contentType: 'application/json',
      body: '{"users":[{"id":1}]}',
    });
  });

  /* "save collection should save response headers everything" — headers and
     cookies are the half that kept getting dropped. */
  it('brings the headers and cookies back, not just the body', () => {
    openCollectionRequest({ ...BASE, status: 200, response_data: RESPONSE_DATA });
    const tab = openedTab();
    expect(tab.response!.headers).toMatchObject({ 'content-type': 'application/json', 'x-request-id': 'req_8f3a' });
    expect(tab.response!.cookies).toHaveLength(1);
  });

  it('opens with no response when none was saved', () => {
    openCollectionRequest(BASE);
    expect(openedTab().response).toBeFalsy();
  });

  /* A response we cannot parse is one we do not show — better an empty panel
     than a tab that throws on open. */
  it('survives a response_data that is not JSON', () => {
    expect(() => openCollectionRequest({ ...BASE, status: 200, response_data: 'not json{' })).not.toThrow();
    expect(openedTab().response).toBeFalsy();
  });

  it('still opens the request itself', () => {
    openCollectionRequest({ ...BASE, status: 200, response_data: RESPONSE_DATA });
    expect(openedTab()).toMatchObject({ url: 'https://api.example.com/users', method: 'GET', name: 'Get users' });
  });
});
