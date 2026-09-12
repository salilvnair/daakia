/**
 * What the audit log records about how a request was routed.
 *
 * The proxy chain has four links — the settings page writes it, the resolver
 * folds global over collection over request, the executor reports what it
 * actually did, and the audit stores that. Every link was correct by reading
 * and none of them was pinned, which is the state a chain quietly breaks in:
 * a proxy that stops being applied still produces a successful request, and
 * an audit row saying "direct" looks exactly like a user who configured
 * nothing.
 *
 * These assert the last two links against the shape the executor really emits.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const rows: Record<string, unknown>[] = [];

vi.mock('../storage/db', () => ({
  insertUiAudit: (e: Record<string, unknown>) => { rows.push(e); },
  getSetting: () => ({}),
}));

const { noteProtocolSend, auditProtocolResponse, _resetProtocolAudit } =
  await import('./protocol-audit');

/** The routing block the devtools panel and the audit detail both render. */
function routingOf(row: Record<string, unknown>) {
  return JSON.parse(String(row.metadata)).routing as
    { proxied: boolean; route: string; warning?: string };
}

beforeEach(() => {
  rows.length = 0;
  _resetProtocolAudit();
});

/** A REST send, as the webview posts it. */
const send = (over: Record<string, unknown> = {}) => ({
  type: 'executeRequest',
  tabId: 't1',
  method: 'GET',
  url: 'https://api.internal.corp/orders',
  ...over,
});

/** The response, as the executor posts it back. */
const reply = (over: Record<string, unknown> = {}) => ({
  type: 'responseData',
  tabId: 't1',
  requestUrl: 'https://api.internal.corp/orders',
  response: { status: 200, statusText: 'OK', headers: {}, time: 12 },
  ...over,
});

describe('the REST send audit', () => {
  it('records a row for a send that got a response', () => {
    noteProtocolSend(send());
    auditProtocolResponse(reply());
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe('click');
    expect(String(rows[0]!.module)).toMatch(/rest/i);
  });

  /*
    The question this file exists for: a request that went through a proxy has
    to say so, and say which one. "It worked" is not evidence that the proxy
    was used — a direct request to a reachable host works too.
  */
  it('records the proxy the executor reports using', () => {
    noteProtocolSend(send());
    auditProtocolResponse(reply({
      proxy: { used: true, description: 'http://corp-proxy:3128' },
    }));
    const routing = routingOf(rows[0]!);
    expect(routing.proxied).toBe(true);
    expect(routing.route).toBe('http://corp-proxy:3128');
  });

  it('records a direct route when no proxy applied', () => {
    noteProtocolSend(send());
    auditProtocolResponse(reply({
      proxy: { used: false, description: 'direct (no proxy configured)' },
    }));
    expect(routingOf(rows[0]!).proxied).toBe(false);
  });

  /*
    A bypassed host is the case most likely to be mistaken for a bug: the
    proxy IS configured, and this request deliberately did not use it. The
    reason has to survive into the record, or the answer to "why did this one
    go direct" is not in the log.
  */
  it('keeps the reason a configured proxy was bypassed', () => {
    noteProtocolSend(send({ url: 'http://localhost:8080/health' }));
    auditProtocolResponse(reply({
      requestUrl: 'http://localhost:8080/health',
      proxy: {
        used: false,
        description: 'direct (bypassed)',
        warning: 'localhost matches the proxy bypass list',
      },
    }));
    const routing = routingOf(rows[0]!);
    expect(routing.proxied).toBe(false);
    expect(routing.warning).toMatch(/bypass/i);
  });

  /*
    Protocols that cannot use the HTTP proxy at all say why, rather than
    reporting "direct" — which is true, and reads as "your proxy was ignored
    for no reason" to someone who has one configured.
  */
  it('explains a protocol that cannot be proxied', () => {
    noteProtocolSend({ type: 'grpc:invoke', tabId: 't1', url: 'grpc://svc:50051' });
    auditProtocolResponse({
      type: 'grpc:response', tabId: 't1',
      response: { status: 0, statusText: 'OK', headers: {} },
    });
    expect(rows).toHaveLength(1);
    const routing = routingOf(rows[0]!);
    expect(routing.proxied).toBe(false);
    expect(routing.warning).toMatch(/HTTP\/2|does not use the HTTP proxy/i);
  });

  it('writes nothing when auditing is switched off for the event', () => {
    noteProtocolSend(send({ auditEnabled: false }));
    auditProtocolResponse(reply());
    expect(rows).toHaveLength(0);
  });

  /*
    A response with no matching send is a stream frame or a stale tab. Pairing
    it with whatever was pending last would attribute one request's routing to
    another request's row.
  */
  it('writes nothing for a response that pairs with no send', () => {
    auditProtocolResponse(reply());
    expect(rows).toHaveLength(0);
  });

  it('pairs each response with its own tab', () => {
    noteProtocolSend(send({ tabId: 'a', url: 'https://a.example/x' }));
    noteProtocolSend(send({ tabId: 'b', url: 'https://b.example/y' }));
    auditProtocolResponse(reply({
      tabId: 'b', requestUrl: 'https://b.example/y',
      proxy: { used: true, description: 'http://b-proxy:8080' },
    }));
    expect(rows).toHaveLength(1);
    expect(routingOf(rows[0]!).route).toBe('http://b-proxy:8080');
  });
});
