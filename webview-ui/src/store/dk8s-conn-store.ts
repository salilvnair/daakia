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

export interface ConnTest { url: string; proxy?: string }

export interface ConnStep { ok: boolean; ms?: number; error?: string }
export interface ConnResult {
  url: string;
  proxy?: string;
  proxyFrom?: 'given' | 'env';
  dns: ConnStep & { host?: string; addresses?: string[] };
  tcp: ConnStep & { to?: string };
  http: ConnStep & { status?: number; reason?: string; server?: string; contentType?: string };
  ok: boolean;
}

export interface ConnTarget { context: string; namespace: string; pod: string; container?: string }

export const CONN_RECENT_PREF = 'dk8s.python.connTests';
const RECENT_MAX = 8;

const same = (a: ConnTest, b: ConnTest) => a.url === b.url && (a.proxy ?? '') === (b.proxy ?? '');

export function parseRecent(raw: string | undefined): ConnTest[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v)
      ? v.filter((x): x is ConnTest => !!x && typeof x.url === 'string' && (x.proxy === undefined || typeof x.proxy === 'string'))
        .slice(0, RECENT_MAX)
      : [];
  } catch {
    return [];
  }
}

/** To the front of the recent list, once. */
export function rememberConn(t: ConnTest): void {
  const { prefs, setPref } = useUiStateStore.getState();
  const entry: ConnTest = t.proxy ? { url: t.url, proxy: t.proxy } : { url: t.url };
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
  /* Whether a proxy was used, never the URL or the proxy: either can carry a token or a password. */
  logUiEvent('dk8s.python_conn_test', { proxy: !!t.proxy });
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
    postMsg({ type: 'py:conn', reqId, ...target, url: t.url, ...(t.proxy ? { proxy: t.proxy } : {}), timeoutSeconds });
  });
}
