/**
 * The downloaded-log tabs: one window of lines each, onto a file on the host.
 *
 * The host holds the whole log (services/k8s/log-capture.ts); a tab holds at
 * most WINDOW lines of it and asks for the next PAGE as the reader scrolls
 * toward either edge, dropping lines from the far end. Filters — the same box,
 * chips and field filters as the Logs tab — are sent to the host, which runs
 * them over the whole file, and the window then pages over the matches.
 *
 * Closing the tab deletes the file: this watches the tab list, so a close from
 * the tab bar, "Close others" or "Close all" all do it.
 */
import { create } from 'zustand';
import { postMsg } from '../vscode';
import { useTabsStore, type LogFileTarget } from './tabs-store';
import { useUiStateStore } from './ui-state-store';
import type { LogLine, LogLevel } from './k8s-store';
import type { FieldFilter } from '../components/k8s/log-view';
import { LOG_DOWNLOAD_MAX_KEY, downloadMaxMb } from '../components/k8s/log-settings';

export const PAGE = 2000;
export const WINDOW = 20_000;

export interface CaptureProgress {
  phase: 'live' | 'archive' | 'indexing';
  bytes: number;
  lines: number;
  capBytes: number;
  files?: number;
}

export interface CaptureInfo {
  lines: number;
  bytes: number;
  capBytes: number;
  capped: boolean;
  liveBytes: number;
  archive: { files: number; bytes: number; skipped: number };
  format?: { id: string; name: string };
  firstTs?: number;
  lastTs?: number;
}

export interface LogFileView {
  target: LogFileTarget;
  status: 'downloading' | 'ready' | 'error' | 'gone';
  progress?: CaptureProgress;
  info?: CaptureInfo;
  archiveRoots?: string[];
  error?: string;
  /** The window: `lines[0]` is at position `first` in the list being paged. */
  lines: LogLine[];
  first: number;
  total: number;
  partial: boolean;
  filtered: boolean;
  loading?: 'earlier' | 'later' | 'jump';
  filter: string;
  levels: LogLevel[];
  fields: FieldFilter[];
  context: number;
  wrap: boolean;
  filterRun?: { scanned: number; total: number; matched: number; done: boolean };
  /** From a filter change until its first matches (or its end) are on screen. */
  searching?: boolean;
  focusSeq?: number;
}

interface State {
  views: Record<string, LogFileView>;
  start: (id: string, target: LogFileTarget) => void;
  loadEarlier: (id: string) => void;
  loadLater: (id: string) => void;
  setFilter: (id: string, text: string) => void;
  toggleLevel: (id: string, level: LogLevel) => void;
  addField: (id: string, f: FieldFilter) => void;
  removeField: (id: string, field: string, value: string) => void;
  clearFields: (id: string) => void;
  setContext: (id: string, n: number) => void;
  setWrap: (id: string, on: boolean) => void;
  jumpTo: (id: string, at: { ts?: number; text?: string }) => void;
  close: (id: string) => void;
}

let reqSeq = 0;
/** The request each tab is waiting on — a page that is not the latest is dropped. */
const pending = new Map<string, { reqId: number; mode: 'replace' | 'prepend' | 'append'; focus?: number; search?: boolean }>();
const filterTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Tabs whose new filter has gone to the host: only its progress may end the search. */
const filterSent = new Set<string>();

function read(id: string, from: number, count: number, mode: 'replace' | 'prepend' | 'append', focus?: number, search?: boolean) {
  const reqId = ++reqSeq;
  pending.set(id, { reqId, mode, focus, search });
  postMsg({ type: 'dk8s:captureRead', id, from, count, reqId });
}

function sendFilter(id: string) {
  const v = useLogFiles.getState().views[id];
  if (!v || v.status !== 'ready') return;
  clearTimeout(filterTimers.get(id));
  /* Typing is debounced: every keystroke would restart a scan of a gigabyte. */
  filterTimers.set(id, setTimeout(() => {
    const cur = useLogFiles.getState().views[id];
    if (!cur) return;
    filterSent.add(id);
    postMsg({
      type: 'dk8s:captureFilter', id,
      spec: { query: cur.filter, levels: cur.levels, fields: cur.fields, contextLines: cur.context },
    });
  }, 300));
}

export const useLogFiles = create<State>((set, get) => {
  const patch = (id: string, p: Partial<LogFileView>) => set(s => (
    s.views[id] ? { views: { ...s.views, [id]: { ...s.views[id], ...p } } } : s
  ));
  const refilter = (id: string, p: Partial<LogFileView>) => {
    /* A page still on its way belongs to the old filter. */
    pending.delete(id);
    filterSent.delete(id);
    patch(id, { ...p, searching: get().views[id]?.status === 'ready', loading: undefined });
    sendFilter(id);
  };

  return {
    views: {},

    start: (id, target) => {
      set(s => ({
        views: {
          ...s.views,
          [id]: {
            target, status: 'downloading', lines: [], first: 0, total: 0, partial: true, filtered: false,
            filter: '', levels: [], fields: [], context: 0, wrap: true,
          },
        },
      }));
      postMsg({
        type: 'dk8s:captureStart', id,
        context: target.context, namespace: target.namespace, pod: target.pod,
        container: target.container, workload: target.workload,
        capMb: downloadMaxMb(useUiStateStore.getState().prefs[LOG_DOWNLOAD_MAX_KEY]),
      });
    },

    loadEarlier: (id) => {
      const v = get().views[id];
      if (!v || v.loading || v.searching || v.first <= 0) return;
      patch(id, { loading: 'earlier' });
      const from = Math.max(0, v.first - PAGE);
      read(id, from, v.first - from, 'prepend');
    },

    loadLater: (id) => {
      const v = get().views[id];
      if (!v || v.loading || v.searching || v.first + v.lines.length >= v.total) return;
      patch(id, { loading: 'later' });
      read(id, v.first + v.lines.length, PAGE, 'append');
    },

    setFilter: (id, filter) => refilter(id, { filter }),
    toggleLevel: (id, level) => {
      const v = get().views[id];
      if (!v) return;
      refilter(id, { levels: v.levels.includes(level) ? v.levels.filter(l => l !== level) : [...v.levels, level] });
    },
    addField: (id, f) => {
      const v = get().views[id];
      if (!v) return;
      const same = v.fields.find(x => x.field === f.field && x.value === f.value);
      const fields = same
        ? v.fields.map(x => (x === same ? { ...x, mode: x.mode === 'include' ? 'exclude' : 'include' } as FieldFilter : x))
        : [...v.fields, f];
      refilter(id, { fields });
    },
    removeField: (id, field, value) => {
      const v = get().views[id];
      if (!v) return;
      refilter(id, { fields: v.fields.filter(x => !(x.field === field && x.value === value)) });
    },
    clearFields: (id) => refilter(id, { fields: [] }),
    setContext: (id, context) => {
      const v = get().views[id];
      if (!v || v.context === context) return;
      refilter(id, { context });
    },
    setWrap: (id, wrap) => patch(id, { wrap }),

    jumpTo: (id, at) => {
      patch(id, { loading: 'jump' });
      const reqId = ++reqSeq;
      pending.set(id, { reqId, mode: 'replace' });
      postMsg({ type: 'dk8s:captureLocate', id, reqId, ts: at.ts, text: at.text });
    },

    close: (id) => {
      postMsg({ type: 'dk8s:captureClose', id });
      pending.delete(id);
      filterSent.delete(id);
      clearTimeout(filterTimers.get(id));
      set(s => {
        const { [id]: _gone, ...rest } = s.views;
        return { views: rest };
      });
    },
  };
});

/* ── The host's answers ── */
if (typeof window !== 'undefined') {
  window.addEventListener('message', (evt: MessageEvent) => {
    const msg = evt.data as Record<string, unknown> | undefined;
    if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('dk8s:capture')) return;
    const id = String(msg.id ?? '');
    const store = useLogFiles.getState();
    const v = store.views[id];
    if (!v) return;
    const set = (p: Partial<LogFileView>) => useLogFiles.setState(s => (
      s.views[id] ? { views: { ...s.views, [id]: { ...s.views[id], ...p } } } : s
    ));

    switch (msg.type) {
      case 'dk8s:captureProgress':
        set({ progress: msg as unknown as CaptureProgress });
        break;
      case 'dk8s:captureReady': {
        const info = msg.info as CaptureInfo;
        set({ status: 'ready', info, archiveRoots: msg.archiveRoots as string[] | undefined, total: info.lines, partial: false });
        const focus = v.target.focus;
        if (focus && (focus.ts !== undefined || focus.text)) store.jumpTo(id, focus);
        else read(id, Math.max(0, info.lines - PAGE), PAGE, 'replace');
        break;
      }
      case 'dk8s:captureError':
        set({ status: 'error', error: String(msg.error ?? 'The download failed.') });
        break;
      case 'dk8s:captureGone':
        set({ status: 'gone' });
        break;
      case 'dk8s:captureFilterProgress': {
        const run = { scanned: Number(msg.scanned), total: Number(msg.total), matched: Number(msg.matched), done: !!msg.done };
        set({ filterRun: run });
        /* The first matches arrive while the scan runs: show them straight away, and again when it ends. */
        const cur = useLogFiles.getState().views[id];
        if (!cur) break;
        /* Progress from before this filter was sent is the old scan winding down. */
        const mine = filterSent.has(id);
        if (cur.searching && !mine) break;
        if (cur.searching ? run.done || (run.matched > 0 && pending.get(id)?.search !== true)
          : run.done || cur.lines.length === 0 || cur.first + cur.lines.length >= cur.total) {
          read(id, 0, PAGE, 'replace', undefined, cur.searching);
        }
        break;
      }
      case 'dk8s:captureLocated': {
        const p = pending.get(id);
        if (!p || p.reqId !== msg.reqId) break;
        const index = typeof msg.index === 'number' ? msg.index : 0;
        read(id, Math.max(0, index - PAGE / 2), PAGE, 'replace', index);
        break;
      }
      case 'dk8s:capturePage': {
        const p = pending.get(id);
        if (!p || p.reqId !== msg.reqId) break;
        pending.delete(id);
        const lines = msg.lines as LogLine[];
        const from = Number(msg.from);
        const base = {
          total: Number(msg.total), partial: !!msg.partial, filtered: !!msg.filtered, loading: undefined,
        };
        if (p.mode === 'replace') {
          const focusLine = p.focus !== undefined ? lines[p.focus - from] : undefined;
          set({ ...base, lines, first: from, focusSeq: focusLine?.seq, ...(p.search ? { searching: false } : {}) });
        } else if (p.mode === 'prepend') {
          const merged = [...lines, ...v.lines];
          set({ ...base, lines: merged.slice(0, WINDOW), first: from });
        } else {
          const merged = [...v.lines, ...lines];
          const drop = Math.max(0, merged.length - WINDOW);
          set({ ...base, lines: merged.slice(drop), first: v.first + drop });
        }
        break;
      }
    }
  });

  /* A tab that leaves the tab bar takes its download with it. */
  let known = new Set<string>();
  useTabsStore.subscribe(s => {
    const now = new Set(s.tabs.filter(t => t.type === 'dk8s-logfile').map(t => t.id));
    for (const id of known) if (!now.has(id)) useLogFiles.getState().close(id);
    known = now;
  });
}
