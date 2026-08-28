/**
 * Request/response bridge to the resident heap worker.
 *
 * The webview never holds the object graph — it asks for small, pre-aggregated
 * slices and the worker answers from the index it kept after parsing. Messages
 * are correlated by request id because several views can be in flight at once.
 */
import { postMsg } from '../../vscode';

export type HeapQuery =
  | { type: 'histogram'; sort?: 'shallow' | 'instances' | 'retained'; search?: string; offset?: number; limit?: number }
  | { type: 'treemap' }
  | { type: 'children'; row: number; limit?: number };

export interface ClassStat {
  classRow: number;
  className: string;
  instances: number;
  shallowBytes: number;
  retainedSumBytes: number;
}

export interface TreemapData {
  totalBytes: number;
  groups: { name: string; bytes: number; children: { name: string; bytes: number; instances: number }[] }[];
}

export interface DominatorChild {
  row: number;
  className: string;
  retainedBytes: number;
  shallowBytes: number;
  childCount: number;
}

let seq = 0;
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
let listening = false;

function ensureListener() {
  if (listening) return;
  listening = true;
  window.addEventListener('message', (e: MessageEvent) => {
    const msg = e.data;
    if (msg?.type === 'heap:queryResult') {
      pending.get(msg.requestId)?.resolve(msg.result);
      pending.delete(msg.requestId);
    } else if (msg?.type === 'heap:queryError') {
      pending.get(msg.requestId)?.reject(new Error(msg.message));
      pending.delete(msg.requestId);
    }
  });
}

/** Ask the worker for a slice. Rejects if no dump is loaded or the worker died. */
export function heapQuery<T>(query: HeapQuery, timeoutMs = 30_000): Promise<T> {
  ensureListener();
  const requestId = `hq${++seq}`;
  return new Promise<T>((resolve, reject) => {
    pending.set(requestId, { resolve: resolve as (v: unknown) => void, reject });
    postMsg({ type: 'heap:query', requestId, query });
    // A query that never comes back would leave a view spinning forever, which
    // reads as a hang rather than a failure.
    setTimeout(() => {
      if (pending.has(requestId)) {
        pending.delete(requestId);
        reject(new Error('The heap worker did not respond.'));
      }
    }, timeoutMs);
  });
}

/** Bytes at heap scale, three significant figures so columns align. */
export function bytes(n: number): string {
  if (n < 1024) return `${Math.round(n)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/** Stable colour per package/class so the same type keeps its hue across views. */
export function hueFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 55% 52%)`;
}
