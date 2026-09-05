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
  type FileBrowserEntry, type FileBrowserAction, IconSize } from '@salilvnair/dui';
import { FileSearchIcon, SearchIcon, FolderOpenIcon, LockIcon, ExternalLinkIcon, DownloadIcon,
  ChevronRightIcon, ChevronDownIcon } from '../../icons';
import { postMsg } from '../../vscode';
import { useDk8sSearchStore } from '../../store/dk8s-search-store';

import { ACCENT, MATCH, MUTED } from './tone';

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
  /** The hit last opened — selected, and scrolled back to on return. */
  selected?: string;
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
  run(pods: FileSearchPod[], pattern: string, root: string, caseSensitive: boolean,
      maxDepth?: number): void;
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
    run(pods, pattern, root, caseSensitive, maxDepth) {
      const requestId = `fsm-${Date.now()}`;
      active.current = requestId;
      setFileSearch({
        running: true, ran: true, results: [], scanned: 0,
        total: pods.length, matched: 0, podsWithHits: 0,
      });
      postMsg({
        type: 'files:searchMany', requestId, pattern, root, caseSensitive, maxDepth,
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

export function FileSearchResults({ state, onOpenExplorer, onView, onDownload, match }: {
  state: FileSearchState;
  onOpenExplorer: (r: HitTarget) => void;
  onView: (r: HitTarget) => void;
  onDownload: (r: HitTarget) => void;
  /*
    The literal behind the pattern, so a hit says WHY it is a hit.

    The Explorer's two searches already did this and Quick Search did not —
    which is the search most in need of it, because its rows are full absolute
    paths across a dozen pods and the matched run is the only part that
    differs between them.
  */
  match?: string;
}) {
  const collapsedList = useDk8sSearchStore(s => s.fileSearch.collapsed);
  const setFileSearch = useDk8sSearchStore(s => s.setFileSearch);
  const collapsed = new Set(collapsedList);
  const setFS = useDk8sSearchStore(s => s.setFileSearch);
  /*
    Returning from a hit puts you back on it.

    `highlight` scrolls the row into view and fades; `selected` stays. Coming
    back to a list of two hundred and having to find your place again is the
    same failure the jump itself was fixing, only in the other direction — so
    the flash fires on the way back in, and never on a click.
  */
  const [returnFlash, setReturnFlash] = useState<string | undefined>(state.selected);
  /*
    A hit is a pod AND a path, never a path.

    `/var/lib/dpkg/info/libsemanage2:amd64.md5sums` exists in every Debian-based
    image in the namespace, so a selection remembered as the path alone marked
    the same row in nineteen pods at once — nineteen rows lit, none of them
    telling you which one you had actually opened. The row keeps the bare path
    as its id, because that is what gets handed back as the file to fetch; what
    gets remembered is namespace/pod plus the path, and each group unwraps that
    pair only for itself.
  */
  const hitKey = (pod: string, path: string) => `${pod}|${path}`;
  const hitFor = (pod: string, mark?: string) =>
    mark && mark.startsWith(`${pod}|`) ? mark.slice(pod.length + 1) : undefined;
  useEffect(() => {
    if (!returnFlash) return;
    const t = setTimeout(() => setReturnFlash(undefined), 2200);
    return () => clearTimeout(t);
    /*
      Mount only, deliberately.

      Keyed on `state.selected`, this flashed on every click — and a click is
      the one time the amber has nothing to say, because you are already
      looking at the row you just hit. The colour is for arriving: the pane
      unmounts when you leave for the Explorer, so remounting with a selection
      already in the store IS the return, and that is the only moment worth
      announcing.
    */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const toggle = (key: string) => {
    const next = new Set(collapsedList);
    if (next.has(key)) next.delete(key); else next.add(key);
    setFileSearch({ collapsed: [...next] });
  };

  if (!state.ran) {
    return (
      <div className="flex-1 min-h-0 grid place-items-center px-8">
        <EmptyStateView
          variant="medallion"
          icon={<SearchIcon size={IconSize.medallion} />}
          title="Find a file across these pods"
          message="Each pod walks its own filesystem — there is no filesystem API to query, so this is one exec per pod."
          accentColor={ACCENT}
          hints={[
            { key: <SearchIcon size={IconSize.action} />, text: 'a name or a glob — *invoice*, application.properties' },
            { key: <FolderOpenIcon size={IconSize.action} />, text: 'every hit opens that pod’s Explorer at the file' },
            { key: <LockIcon size={IconSize.action} />, text: 'a pod with no shell reports that, and the rest still search' },
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
            icon: <ExternalLinkIcon size={IconSize.action} />,
            show: e => e.badge !== 'binary',
          },
          { id: 'save', label: 'Save to disk', icon: <DownloadIcon size={IconSize.action} /> },
          {
            id: 'reveal', label: 'Show in this pod’s Explorer', tone: 'success',
            icon: <FolderOpenIcon size={IconSize.action} />,
          },
        ];

        const key = `${r.namespace}/${r.pod}`;
        const open = !collapsed.has(key);

        return (
          <div key={key} style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
            {/*
              The whole strip toggles, not just the chevron.

              A 12px target at the far left of a full-width row is a chore to
              hit repeatedly, and the row is doing nothing else. The pod NAME
              is the exception — it is the one thing here somebody wants to
              select and copy, and a click that collapses the section instead
              of placing a caret is the kind of small betrayal that makes
              people stop trying.
            */}
            <div className="flex items-center gap-2 px-2 py-1 flex-wrap sticky top-0 z-10"
                 onClick={() => toggle(key)}
                 style={{ background: 'var(--color-panel)', cursor: 'pointer' }}>
              {/*
                A pod is a section, and forty hits across twelve pods is a
                scroll nobody finishes. Collapsing one is how you put a pod
                aside without losing the count that made you look.
              */}
              <button
                type="button"
                onClick={e => { e.stopPropagation(); toggle(key); }}
                aria-label={open ? `Collapse ${r.pod}` : `Expand ${r.pod}`}
                aria-expanded={open}
                style={{
                  display: 'grid', placeItems: 'center', width: 16, height: 16,
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  color: 'var(--color-text-muted)', flexShrink: 0, padding: 0,
                }}
              >
                {open ? <ChevronDownIcon size={IconSize.inline} /> : <ChevronRightIcon size={IconSize.inline} />}
              </button>
              <span className="text-[10.5px] font-mono font-semibold"
                    onClick={e => e.stopPropagation()}
                    style={{ color: 'var(--color-text-primary)', cursor: 'text', userSelect: 'text' }}
              >{r.pod}</span>
              <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
                {r.namespace}
              </span>
              <span className="font-bold uppercase rounded"
                    style={{
                      fontSize: 7, letterSpacing: '.03em', padding: '0.5px 3.5px',
                      color: ACCENT,
                      background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${ACCENT} 26%, transparent)`,
                    }}>
                {r.hits.length}{r.capped ? '+' : ''} {r.hits.length === 1 ? 'file' : 'files'}
              </span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onOpenExplorer(r); }}
                title={`Browse ${r.pod} in the Explorer`}
                aria-label={`Browse ${r.pod} in the Explorer`}
                style={{
                  display: 'grid', placeItems: 'center', width: 18, height: 16,
                  borderRadius: 3, cursor: 'pointer', color: ACCENT,
                  background: 'transparent', border: 'none', opacity: 0.85,
                }}
              >
                <FolderOpenIcon size={IconSize.action} />
              </button>
            </div>

            {open && (
            <FileBrowserView
              style={{ ['--dui-file-badge' as string]: ACCENT } as React.CSSProperties}
              entries={entries}
              showHeader={false}
              showSize={false}
              showModified={false}
              dense
              size="sm"
              accentColor={ACCENT}
              actions={actions}
              match={match}
              selectedId={hitFor(key, state.selected)}
              highlightId={hitFor(key, returnFlash)}
              onSelect={e => setFS({ selected: hitKey(key, e.id) })}
              onOpen={e => { setFS({ selected: hitKey(key, e.id) }); onView({ ...r, path: e.id }); }}
              onAction={(id, e) => {
                const t = { ...r, path: e.id };
                // Acting on a row selects it, so the one you left is the one
                // you come back to.
                setFS({ selected: hitKey(key, e.id) });
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
              <LockIcon size={IconSize.inline} color="var(--color-warning)" />
              <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
                <span className="font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                  {r.pod}
                </span>{' — '}{r.error}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Nothing found gets the same weight as nothing searched yet.

          A line of grey text in the middle of an empty pane reads as a view
          that failed rather than as an answer, and this IS an answer — the
          search ran, every pod replied, and none of them had it. So it says
          which term found nothing, in the colour a hit would have been
          written in, and offers the two things that usually fix it. */}
      {!state.running && withHits.length === 0 && failed.length === 0 && (
        <div className="flex-1 min-h-0 grid place-items-center px-8 py-6">
          <EmptyStateView
            variant="medallion"
            icon={<FileSearchIcon size={IconSize.medallion} />}
            title="Nothing matched"
            message={match
              ? `No file named like this was found in any of these pods.`
              : 'No file matched that name in any of these pods.'}
            accentColor={MUTED}
            hints={[
              ...(match ? [{
                key: <SearchIcon size={IconSize.action} />,
                text: (
                  <span>
                    searched for{' '}
                    <span className="font-mono" style={{ color: MATCH, fontWeight: 600 }}>
                      {match}
                    </span>
                  </span>
                ) as unknown as string,
              }] : []),
              { key: <FolderOpenIcon size={IconSize.action} />,
                text: 'a deeper start path or a higher depth reaches further in' },
              { key: <LockIcon size={IconSize.action} />,
                text: 'wrap it in * to match anywhere in the name — *invoice*' },
            ]}
          />
        </div>
      )}
    </div>
  );
}
