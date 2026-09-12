/**
 * Bulk URL runner — checks a list of URLs and reports what each one did.
 *
 * ── What this replaces ──
 *
 * The panel posted a real `http:request` for each URL, threw the reply away,
 * waited `200 + Math.random() * 300`, and painted
 * `Math.random() > 0.15 ? 200 : 404` as the status. So it produced traffic and
 * then lied about the outcome — the worst of both. Everything reported here is
 * what the server actually returned.
 *
 * It also ran strictly one at a time, which makes checking two hundred URLs a
 * coffee break. Requests run with a configurable concurrency now.
 */
import * as https from 'https';
import * as http from 'http';
import { probe, parseUrlLine, type ProbeResult } from './http-probe';

type PostMessage = (msg: unknown) => void;

const LIMITS = { urls: 2000, concurrency: 64, timeoutMs: 120_000 };

interface BulkRow { index: number; method: string; url: string }

const running = new Map<number, { stop: boolean }>();

export function handleBulkStop(msg: Record<string, unknown>): void {
  const state = running.get(msg.runId as number);
  if (state) state.stop = true;
}

/** Header lines as pasted — "Name: value", one per line. */
function parseHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = { 'User-Agent': 'Daakia-BulkTester/1.0' };
  for (const line of String(raw ?? '').split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

export async function handleBulkRun(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const runId = Number(msg.runId ?? 0);
  const defaultMethod = String(msg.method ?? 'GET');
  const headers = parseHeaders(String(msg.headers ?? ''));
  const timeoutMs = Math.min(Math.max(Number(msg.timeoutMs) || 10_000, 500), LIMITS.timeoutMs);
  const concurrency = Math.min(Math.max(Number(msg.concurrency) || 6, 1), LIMITS.concurrency);
  const followRedirects = msg.followRedirects !== false;
  const insecureTls = msg.insecureTls === true;

  const rows: BulkRow[] = String(msg.urls ?? '')
    .split('\n')
    .map(line => parseUrlLine(line, defaultMethod))
    .filter((r): r is { method: string; url: string } => r !== null)
    .slice(0, LIMITS.urls)
    .map((r, index) => ({ index, ...r }));

  if (rows.length === 0) {
    postMessage({ type: 'bulk:done', runId, total: 0, stopped: false });
    return;
  }

  const state = { stop: false };
  running.set(runId, state);

  const agents = {
    http: new http.Agent({ keepAlive: true, maxSockets: concurrency }),
    https: new https.Agent({ keepAlive: true, maxSockets: concurrency }),
  };

  postMessage({ type: 'bulk:started', runId, total: rows.length, rows });

  let next = 0;
  let completed = 0;

  const worker = async () => {
    for (;;) {
      if (state.stop) return;
      const i = next++;
      if (i >= rows.length) return;
      const row = rows[i];

      postMessage({ type: 'bulk:running', runId, index: row.index });

      const result: ProbeResult = await probe({
        method: row.method,
        url: row.url,
        headers,
        timeoutMs,
        followRedirects,
        insecureTls,
        agents,
      });

      completed++;
      postMessage({
        type: 'bulk:result',
        runId,
        index: row.index,
        method: row.method,
        url: row.url,
        status: result.status,
        statusText: result.statusText,
        ms: result.ms,
        bytes: result.bytes,
        redirects: result.redirects,
        contentType: result.contentType,
        error: result.error,
        completed,
        total: rows.length,
      });
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, worker));
  } finally {
    running.delete(runId);
    agents.http.destroy();
    agents.https.destroy();
  }

  postMessage({ type: 'bulk:done', runId, total: rows.length, completed, stopped: state.stop });
}
