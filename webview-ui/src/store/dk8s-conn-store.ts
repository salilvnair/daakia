/**
 * Connectivity tests from inside a pod — what was asked, what came back, and
 * the recent ones, kept so the next test is a click.
 *
 * The test itself runs on the host (`py:conn`), with the pod's own python;
 * see the host's pod-conn. This keeps the recent URLs and proxies in the UI
 * state the rest of Daakia's preferences live in, so they survive a reload.
 */
import { useMemo } from 'react';
import { postMsg } from '../vscode';
import { useUiStateStore } from './ui-state-store';
import { logUiEvent } from './ui-audit-store';

export type ConnKind = 'http' | 'tcp' | 'dns';
export const CONN_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

/** One test as asked. Only `url` is required: an old remembered test is a GET. */
export interface ConnTest {
  kind?: ConnKind;
  url: string;
  proxy?: string;
  method?: string;
  headers?: { key: string; value: string }[];
  body?: string;
  /** Skip the certificate check (https, or tcp with tls). */
  insecure?: boolean;
  /** tcp: shake hands over TLS once connected. */
  tls?: boolean;
}

export interface ConnStep { ok: boolean; ms?: number; error?: string }
export interface ConnResult {
  kind?: ConnKind;
  url: string;
  method?: string;
  proxy?: string;
  proxyFrom?: 'given' | 'env';
  dns: ConnStep & { host?: string; addresses?: string[]; canonical?: string };
  tcp: ConnStep & { to?: string };
  tls?: ConnStep & { version?: string; cipher?: string; subject?: string; issuer?: string; notAfter?: string; verified?: boolean };
  http: ConnStep & { status?: number; reason?: string; server?: string; contentType?: string; preview?: string; bytes?: number };
  ok: boolean;
}

export interface ConnTarget { context: string; namespace: string; pod: string; container?: string }

export const CONN_RECENT_PREF = 'dk8s.python.connTests';
const RECENT_MAX = 8;

/* Two tests are the same when they ask the same thing of the same place; the newer headers and body win. */
const same = (a: ConnTest, b: ConnTest) =>
  (a.kind ?? 'http') === (b.kind ?? 'http') && (a.method ?? 'GET') === (b.method ?? 'GET')
  && a.url === b.url && (a.proxy ?? '') === (b.proxy ?? '');

/** Only what was set, so a remembered GET stays as small as it always was. */
export function compactTest(t: ConnTest): ConnTest {
  const kind = t.kind ?? 'http';
  const out: ConnTest = { url: t.url };
  if (kind !== 'http') out.kind = kind;
  if (kind === 'http') {
    if (t.method && t.method !== 'GET') out.method = t.method;
    if (t.proxy) out.proxy = t.proxy;
    const headers = (t.headers ?? []).filter(h => h.key.trim());
    if (headers.length) out.headers = headers.map(h => ({ key: h.key.trim(), value: h.value }));
    if (t.body) out.body = t.body;
  }
  if (kind === 'tcp' && t.tls) out.tls = true;
  if (t.insecure && (kind === 'http' || out.tls)) out.insecure = true;
  return out;
}

export function parseRecent(raw: string | undefined): ConnTest[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v)
      ? v.filter((x): x is ConnTest => !!x && typeof x.url === 'string' && (x.proxy === undefined || typeof x.proxy === 'string'))
        .map(compactTest)
        .slice(0, RECENT_MAX)
      : [];
  } catch {
    return [];
  }
}

/** To the front of the recent list, once. */
export function rememberConn(t: ConnTest): void {
  const { prefs, setPref } = useUiStateStore.getState();
  const entry = compactTest(t);
  const list = [entry, ...parseRecent(prefs[CONN_RECENT_PREF]).filter(x => !same(x, entry))].slice(0, RECENT_MAX);
  setPref(CONN_RECENT_PREF, JSON.stringify(list));
}

export function forgetConn(t: ConnTest): void {
  const { prefs, setPref } = useUiStateStore.getState();
  setPref(CONN_RECENT_PREF, JSON.stringify(parseRecent(prefs[CONN_RECENT_PREF]).filter(x => !same(x, t))));
}

export function useRecentConn(): ConnTest[] {
  const raw = useUiStateStore(s => s.prefs[CONN_RECENT_PREF]);
  return useMemo(() => parseRecent(raw), [raw]);
}

let seq = 0;

/**
 * Run one test and hear back on its own id. The host always answers; the
 * timer is for a host that has gone away.
 */
export function testConn(target: ConnTarget, t: ConnTest, timeoutSeconds = 10): Promise<{ result?: ConnResult; error?: string }> {
  const reqId = `conn-${Date.now()}-${++seq}`;
  const test = compactTest(t);
  /* The kind and method, whether a proxy was used — never the URL, the proxy, a header or the body: any can carry a token. */
  logUiEvent('dk8s.python_conn_test', { kind: test.kind ?? 'http', method: test.method ?? 'GET', proxy: !!test.proxy });
  return new Promise(resolve => {
    const done = (r: { result?: ConnResult; error?: string }) => {
      window.removeEventListener('message', onMsg);
      clearTimeout(timer);
      resolve(r);
    };
    const onMsg = (e: MessageEvent) => {
      const m = e.data as { type?: string; reqId?: string; result?: ConnResult; error?: string };
      if (m?.type === 'py:conn' && m.reqId === reqId) done({ result: m.result, error: m.error });
    };
    const timer = setTimeout(() => done({ error: 'No answer from the pod.' }), (timeoutSeconds * 3 + 30) * 1000);
    window.addEventListener('message', onMsg);
    postMsg({ type: 'py:conn', reqId, ...target, ...test, timeoutSeconds });
  });
}
