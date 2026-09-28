/**
 * The dk8s settings your team shares, as they arrived with Git Sync.
 *
 * ── What travels ──
 *
 * A workspace somebody shares carries, beside its collections and
 * environments, a handful of dk8s prefs: the logger catalogue (and with it
 * every determinant) and the custom field readers. A teammate who imports that
 * workspace then opens a pod and already has the team's questions — which is
 * the whole reason to write a determinant down rather than keep it in your
 * head.
 *
 * ── Why they are not merged into your own ──
 *
 * They are read here, beside yours, and never written into your prefs. Your
 * prefs are yours to change; theirs change when THEY change them, on the next
 * sync. Merging would make a teammate's question one you have to delete — and
 * deleting it would do nothing, because the next sync would bring it back.
 * So a teammate's determinant is shown as theirs, answered like yours, and can
 * be switched off for you or copied into your own catalogue to change.
 *
 * The host keeps the last copy of each shared workspace's prefs; this store
 * asks for them when a page that uses them opens, and hears them again after
 * every sync.
 */
import { create } from 'zustand';
import { useEffect, useMemo } from 'react';
import { postMsg } from '../vscode';
import { useUiStateStore } from './ui-state-store';
import { parseCatalogue, type CataloguePattern } from './dk8s-logger-store';
import { determinantsIn } from '../components/k8s/determinants';

/** One teammate's shared workspace, and the dk8s prefs it carried. */
export interface TeamDk8sSource {
  /** The local id of your read-only copy of their workspace. */
  workspaceId: string;
  workspaceName: string;
  ownerId: string;
  ownerName: string;
  /** Pref key → the raw stored string, exactly as it is in their prefs. */
  prefs: Record<string, string>;
}

interface TeamState {
  sources: TeamDk8sSource[];
  /** False until the host has answered once, so "none" is not said too early. */
  loaded: boolean;
  apply: (sources: TeamDk8sSource[]) => void;
}

export const useDk8sTeamStore = create<TeamState>(set => ({
  sources: [],
  loaded: false,
  /* The same answer again changes nothing: a new empty array per reply would
     re-render every reader of it for no reason. */
  apply: (sources) => set(s => s.loaded && JSON.stringify(s.sources) === JSON.stringify(sources)
    ? s : { sources, loaded: true }),
}));

/** The message the host answers with — after a request, and after every sync. */
export const TEAM_PREFS_MESSAGE = 'dk8s:teamPrefs';

export function requestTeamPrefs(): void {
  postMsg({ type: 'gitSync:dk8sTeamPrefs' });
}

function isSource(s: unknown): s is TeamDk8sSource {
  const v = s as TeamDk8sSource;
  return !!v && typeof v.workspaceId === 'string' && typeof v.ownerName === 'string'
    && !!v.prefs && typeof v.prefs === 'object';
}

/*
  One listener and one request for the whole app, however many readers.

  It was a listener and a request per mount. That was fine for a page or two,
  and froze the app once every line of a Daakia AI search card read the field
  readers: 650 rows asked 650 times, and every answer reached 650 listeners,
  each re-rendering every row.
*/
let readers = 0;
let listening = false;
function onTeamPrefs(event: MessageEvent): void {
  const msg = event.data as { type?: string; sources?: unknown };
  if (msg?.type !== TEAM_PREFS_MESSAGE) return;
  useDk8sTeamStore.getState().apply(Array.isArray(msg.sources) ? msg.sources.filter(isSource) : []);
}

/**
 * The team's sources, fetched on first use and kept current.
 *
 * The answer lands in one store, and the host also sends it after every sync,
 * so the listener stays for the app's life once anything has read it. A new
 * request goes out only when the first reader arrives after none were left.
 */
export function useTeamDk8sSources(): TeamDk8sSource[] {
  const sources = useDk8sTeamStore(s => s.sources);
  useEffect(() => {
    if (!listening) {
      listening = true;
      window.addEventListener('message', onTeamPrefs);
    }
    if (readers++ === 0) requestTeamPrefs();
    return () => { readers--; };
  }, []);
  return sources;
}

/** Every value teammates share for one pref key, with whose it is. */
export function teamPrefValues(sources: TeamDk8sSource[], key: string): { source: TeamDk8sSource; value: string }[] {
  return sources.flatMap(source => (
    typeof source.prefs[key] === 'string' ? [{ source, value: source.prefs[key] }] : []
  ));
}

// ── Their determinants ──────────────────────────────────────────────────────

/** The catalogue's pref key — the same one `dk8s-logger-store` writes. */
const CATALOGUE_PREF = 'dk8s.loggers';

/** Teammates' determinants you have switched off, for you only. */
export const TEAM_OFF_PREF = 'dk8s.determinants.teamOff';

export interface TeamDeterminant {
  /** Their pattern, with an id that cannot collide with one of yours. */
  pattern: CataloguePattern;
  source: TeamDk8sSource;
}

/**
 * A teammate's determinants, ready to be listed and answered beside yours.
 *
 * The id is namespaced by the workspace it came from: ids are only unique per
 * install, and two teammates who both started from the same pasted call would
 * otherwise have one switch between them.
 */
export function teamDeterminants(sources: TeamDk8sSource[]): TeamDeterminant[] {
  return sources.flatMap(source => (
    determinantsIn(parseCatalogue(source.prefs[CATALOGUE_PREF]).patterns).map(pattern => ({
      pattern: { ...pattern, id: `team:${source.workspaceId}:${pattern.id}` },
      source,
    }))
  ));
}

/**
 * Which of theirs are off for you. Stored as a list of namespaced ids.
 *
 * Their own `off` still counts: a question its author switched off is not one
 * they meant anybody to be answered by.
 */
export function teamOffIds(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  try {
    const v = JSON.parse(raw);
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function isTeamOn(d: TeamDeterminant, off: Set<string>): boolean {
  return !d.pattern.summary?.off && !off.has(d.pattern.id);
}

export function setTeamOn(id: string, on: boolean): void {
  const { prefs, setPref } = useUiStateStore.getState();
  const off = teamOffIds(prefs[TEAM_OFF_PREF]);
  if (on) off.delete(id); else off.add(id);
  setPref(TEAM_OFF_PREF, JSON.stringify([...off]));
}

/** The team's determinants, and which are on for you. */
export function useTeamDeterminants(): { all: TeamDeterminant[]; off: Set<string> } {
  const sources = useTeamDk8sSources();
  const rawOff = useUiStateStore(s => s.prefs[TEAM_OFF_PREF]);
  const all = useMemo(() => teamDeterminants(sources), [sources]);
  const off = useMemo(() => teamOffIds(rawOff), [rawOff]);
  return { all, off };
}
