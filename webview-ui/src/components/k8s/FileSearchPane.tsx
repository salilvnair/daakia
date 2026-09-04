/**
 * The Files half of Quick Search — one name, every selected pod.
 *
 * Log search reads streams on this machine. This asks each pod to walk its own
 * filesystem, because there is no filesystem API to query, and that difference
 * shapes the results: a pod that cannot answer is a RESULT, not a failure. A
 * distroless sidecar among twelve pods reports "no shell" beside the eleven
 * that worked rather than taking the search down with it.
 *
 * Every hit carries a way into that pod's Explorer, because finding the file
 * is only ever half of what someone came to do.
 */
import { useEffect, useRef, useState } from 'react';
import {
  EmptyStateView, FileBrowserView,
  type FileBrowserEntry, type FileBrowserAction,
} from '@salilvnair/dui';
import { SearchIcon, FolderOpenIcon, LockIcon, EyeIcon, DownloadIcon,
  ChevronRightIcon, ChevronDownIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useDk8sSearchStore } from '../../store/dk8s-search-store';

const ACCENT = 'var(--color-dk8s)';

export interface FileSearchPod {
  uid: string;
  name: string;
  namespace: string;
  context: string;
}

interface PodResult {
  pod: string;
  namespace: string;
  context: string;
  hits: { path: string; name: string }[];
  capped: boolean;
  command: string;
  error?: string;
}

export interface FileSearchState {
  running: boolean;
  results: PodResult[];
  scanned: number;
  total: number;
  matched: number;
  podsWithHits: number;
  ran: boolean;
}

export const EMPTY_FILE_SEARCH: FileSearchState = {
  running: false, results: [], scanned: 0, total: 0,
  matched: 0, podsWithHits: 0, ran: false,
};

/**
 * Drive one multi-pod search and keep its running tally.
 *
 * Results arrive per pod rather than in one lump so the list fills as it goes
 * — with twelve pods and a large volume the whole thing takes a while, and a
 * panel that shows nothing until the last one finishes reads as hung.
 */
export function useFileSearch(): FileSearchState & {
  run(pods: FileSearchPod[], pattern: string, root: string, caseSensitive: boolean): void;
  reset(): void;
} {
  /*
    State lives in the store, not here.

    It started as component state, which meant opening a hit — the entire
    point of the results — unmounted the dialog and destroyed them, so "back
    to search" arrived at an empty panel. Anything you can navigate away from
    and come back to has to outlive the component that drew it.
  */
  const state = useDk8sSearchStore(s => s.fileSearch);
  const setFileSearch = useDk8sSearchStore(s => s.setFileSearch);
  const addPod = useDk8sSearchStore(s => s.addFileSearchPod);
  const active = useRef<string | null>(null);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const m = e.data;
      if (!m?.requestId || m.requestId !== active.current) return;

      if (m.type === 'files:searchMany:start') {
        setFileSearch({ running: true, total: m.total ?? 0, ran: true });
      } else if (m.type === 'files:searchMany:pod') {
        addPod({
          pod: m.pod, namespace: m.namespace, context: m.context,
          hits: m.hits ?? [], capped: !!m.capped,
          command: m.command ?? '', error: m.error,
        });
      } else if (m.type === 'files:searchMany:done') {
        setFileSearch({
          running: false,
          matched: m.matched ?? 0,
          podsWithHits: m.podsWithHits ?? 0,
        });
        active.current = null;
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [setFileSearch, addPod]);

  return {
    ...state,
    run(pods, pattern, root, caseSensitive) {
      const requestId = `fsm-${Date.now()}`;
      active.current = requestId;
      setFileSearch({
        running: true, ran: true, results: [], scanned: 0,
        total: pods.length, matched: 0, podsWithHits: 0,
      });
      postMsg({
        type: 'files:searchMany', requestId, pattern, root, caseSensitive,
        pods: pods.map(p => ({ context: p.context, namespace: p.namespace, pod: p.name })),
      });
    },
    reset() {
      active.current = null;
      setFileSearch({ ...EMPTY_FILE_SEARCH, collapsed: [] });
    },
  };
}

export interface HitTarget {
  pod: string; namespace: string; context: string; path?: string;
}

/** The badge a hit wears, matching the Explorer's vocabulary exactly. */
function badgeFor(name: string): { badge: string; tone: FileBrowserEntry['badgeTone'] } {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  const TEXTY = /^(properties|conf|cfg|ini|env|yaml|yml|json|xml|csv|tsv|sh|bash|sql|md|log|txt|toml|out|err)$/;
  if (TEXTY.test(ext)) return { badge: ext, tone: 'info' };
  if (!ext) return { badge: 'file', tone: 'neutral' };
  if (/^(jar|db|sqlite|bin|so|gz|zip|tar|png|jpg|pdf|class|war)$/.test(ext)) {
    return { badge: 'binary', tone: 'neutral' };
  }
  return { badge: ext, tone: 'info' };
}

export function FileSearchResults({ state, onOpenExplorer, onView, onDownload }: {
  state: FileSearchState;
  onOpenExplorer: (r: HitTarget) => void;
  onView: (r: HitTarget) => void;
  onDownload: (r: HitTarget) => void;
}) {
  const collapsedList = useDk8sSearchStore(s => s.fileSearch.collapsed);
  const setFileSearch = useDk8sSearchStore(s => s.setFileSearch);
  const collapsed = new Set(collapsedList);
  const setCollapsed = (fn: (prev: Set<string>) => Set<string>) =>
    setFileSearch({ collapsed: [...fn(new Set(collapsedList))] });

  if (!state.ran) {
    return (
      <div className="flex-1 min-h-0 grid place-items-center px-8">
        <EmptyStateView
          variant="medallion"
          icon={<SearchIcon size={22} />}
          title="Find a file across these pods"
          message="Each pod walks its own filesystem — there is no filesystem API to query, so this is one exec per pod."
          accentColor={ACCENT}
          hints={[
            { key: <SearchIcon size={12} />, text: 'a name or a glob — *invoice*, application.properties' },
            { key: <FolderOpenIcon size={12} />, text: 'every hit opens that pod’s Explorer at the file' },
            { key: <LockIcon size={12} />, text: 'a pod with no shell reports that, and the rest still search' },
          ]}
        />
      </div>
    );
  }

  const withHits = state.results.filter(r => r.hits.length > 0);
  const failed = state.results.filter(r => r.error);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {withHits.map(r => {
        /*
          The same rows the Explorer draws, from the same component.

          A hit and a listing entry are the same object seen from two places,
          and giving them different shapes would make the reader learn the
          table twice. Reusing `FileBrowserView` also means the actions match:
          the eye and the arrow do here exactly what they do there.
        */
        const entries: FileBrowserEntry[] = r.hits.slice(0, 60).map(h => {
          const b = badgeFor(h.name);
          return {
            id: h.path,
            // The directory dimmed and the name lit: on forty paths sharing a
            // prefix, the name is the only part that differs.
            name: h.path,
            kind: 'file' as const,
            badge: b.badge,
            badgeTone: b.tone,
          };
        });

        const actions: FileBrowserAction[] = [
          {
            id: 'open', label: 'Open in the viewer', tone: 'accent',
            icon: <EyeIcon size={12} />,
            show: e => e.badge !== 'binary',
          },
          { id: 'save', label: 'Save to disk', icon: <DownloadIcon size={12} /> },
          {
            id: 'reveal', label: 'Show in this pod’s Explorer', tone: 'success',
            icon: <FolderOpenIcon size={12} />,
          },
        ];

        const key = `${r.namespace}/${r.pod}`;
        const open = !collapsed.has(key);

        return (
          <div key={key} style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
            <div className="flex items-center gap-2 px-2 py-1 flex-wrap sticky top-0 z-10"
                 style={{ background: 'var(--color-panel)' }}>
              {/*
                A pod is a section, and forty hits across twelve pods is a
                scroll nobody finishes. Collapsing one is how you put a pod
                aside without losing the count that made you look.
              */}
              <button
                type="button"
                onClick={() => setCollapsed(prev => {
                  const next = new Set(prev);
                  if (next.has(key)) next.delete(key); else next.add(key);
                  return next;
                })}
                aria-label={open ? `Collapse ${r.pod}` : `Expand ${r.pod}`}
                aria-expanded={open}
                style={{
                  display: 'grid', placeItems: 'center', width: 16, height: 16,
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  color: 'var(--color-text-muted)', flexShrink: 0, padding: 0,
                }}
              >
                {open ? <ChevronDownIcon size={11} /> : <ChevronRightIcon size={11} />}
              </button>
              <span className="text-[10.5px] font-mono font-semibold"
                    style={{ color: 'var(--color-text-primary)' }}>{r.pod}</span>
              <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
                {r.namespace}
              </span>
              <span className="text-[8.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                    style={{
                      color: ACCENT,
                      background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${ACCENT} 28%, transparent)`,
                    }}>
                {r.hits.length}{r.capped ? '+' : ''} {r.hits.length === 1 ? 'file' : 'files'}
              </span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => onOpenExplorer(r)}
                title={`Browse ${r.pod} in the Explorer`}
                aria-label={`Browse ${r.pod} in the Explorer`}
                style={{
                  display: 'grid', placeItems: 'center', width: 25, height: 20,
                  borderRadius: 5, cursor: 'pointer', color: ACCENT,
                  background: `color-mix(in srgb, ${ACCENT} 13%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${ACCENT} 34%, transparent)`,
                }}
              >
                <FolderOpenIcon size={12} />
              </button>
            </div>

            {open && (
            <FileBrowserView
              entries={entries}
              showHeader={false}
              showSize={false}
              showModified={false}
              dense
              size="sm"
              accentColor={ACCENT}
              actions={actions}
              onOpen={e => onView({ ...r, path: e.id })}
              onAction={(id, e) => {
                const t = { ...r, path: e.id };
                if (id === 'open') onView(t);
                else if (id === 'save') onDownload(t);
                else onOpenExplorer(t);
              }}
            />
            )}

            {open && r.capped && (
              <div className="px-3 py-1.5 text-[10px]" style={{ color: 'var(--color-warning)' }}>
                capped — narrow the name or the start path to see the rest
              </div>
            )}
          </div>
        );
      })}

      {failed.length > 0 && (
        <div className="px-3 py-2.5" style={{ borderTop: '1px solid var(--color-surface-border)' }}>
          <div className="text-[10px] uppercase tracking-wider mb-1.5"
               style={{ color: 'var(--color-text-muted)' }}>
            {failed.length} could not be searched
          </div>
          {failed.map(r => (
            <div key={`${r.namespace}/${r.pod}`} className="flex items-start gap-2 py-1">
              <LockIcon size={11} color="var(--color-warning)" />
              <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
                <span className="font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                  {r.pod}
                </span>{' — '}{r.error}
              </span>
            </div>
          ))}
        </div>
      )}

      {!state.running && withHits.length === 0 && failed.length === 0 && (
        <div className="px-4 py-8 text-center text-[11.5px]"
             style={{ color: 'var(--color-text-muted)' }}>
          No file matched that name in any of these pods.
        </div>
      )}
    </div>
  );
}
