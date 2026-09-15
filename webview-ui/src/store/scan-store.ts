/**
 * The state of one scan.
 *
 * A scan is a short-lived conversation with the host — pick a folder, look at
 * it, run, review, write — so this holds a stage rather than a pile of
 * booleans. Every screen in the modal is one value of `stage`, and a stage that
 * cannot be reached from the one before it cannot be rendered by accident.
 */
import { create } from 'zustand';
import { postMsg } from '../vscode';
import { useUiStateStore } from './ui-state-store';
import { scanPreferences } from '../services/scan/scan-settings';

/*
  The shapes a detector produces, shared rather than mirrored.

  These were declared again here, and drifted immediately: `Provenance` is a
  discriminated union on the host and was written as a flat interface here, so
  a value the webview considered valid could not be handed to the
  reconciliation the host defines.
*/
export type { Provenance } from '@daakia/api-detector';
import type { Provenance } from '@daakia/api-detector';

export type ProvenanceKind = Provenance['kind'];

export interface ScanStamp {
  detector: string;
  source: string;
  identity: string;
  written: string;
  at: string;
  provenance: Record<string, Provenance>;
}

export interface ScannedRequest {
  name: string;
  method: string;
  url: string;
  headers: { key: string; value: string; enabled: boolean }[];
  params: { key: string; value: string; enabled: boolean }[];
  bodyMode: 'raw' | 'none';
  bodyRaw: string;
  authType: string;
  folder: string;
  scan: ScanStamp;
}

export interface Unresolved {
  expression: string;
  why: string;
  source: { file: string; line: number; snippet?: string };
  detector: string;
}

export interface BaseUrlParts {
  url: string;
  parts: { scheme?: Provenance; port?: Provenance; contextPath?: Provenance };
}

export type ScanStage = 'source' | 'scanning' | 'review' | 'error';

interface ScanState {
  open: boolean;
  stage: ScanStage;

  dir: string;
  /** What the host could tell us about the folder before scanning it. */
  detected: { id: string; label: string }[];
  manifests: string[];
  profiles: string[];
  profile?: string;

  /** The file being read right now, and the running totals. */
  progress?: { file: string; filesWalked: number; found: number };

  requests: ScannedRequest[];
  unresolved: Unresolved[];
  baseUrl?: BaseUrlParts;
  variables: { key: string; value: string }[];
  filesWalked: number;
  capped: boolean;
  ms: number;

  /** Which findings will be written. Keyed by `scan.identity`. */
  chosen: Set<string>;
  collectionName: string;
  /** The request whose detail is showing. */
  focused?: string;

  error?: string;

  openScan: (dir?: string) => void;
  close: () => void;
  setDir: (dir: string) => void;
  setProfile: (p: string | undefined) => void;
  pickFolder: () => void;
  inspect: (dir: string) => void;
  run: () => void;
  toggle: (identity: string) => void;
  toggleAll: (on: boolean) => void;
  focus: (identity: string | undefined) => void;
  setCollectionName: (name: string) => void;
  apply: (msg: Record<string, unknown>) => void;
}

/** The last path segment, which is what a repository is called. */
export function nameFromDir(dir: string): string {
  const parts = dir.replace(/[\\/]+$/, '').split(/[\\/]/);
  return parts[parts.length - 1] || 'Scanned API';
}

export const useScanStore = create<ScanState>((set, get) => ({
  open: false,
  stage: 'source',
  dir: '',
  detected: [],
  manifests: [],
  profiles: [],
  requests: [],
  unresolved: [],
  variables: [],
  filesWalked: 0,
  capped: false,
  ms: 0,
  chosen: new Set(),
  collectionName: '',

  openScan: (dir) => {
    set({
      open: true, stage: 'source', error: undefined,
      dir: dir ?? get().dir,
      requests: [], unresolved: [], chosen: new Set(), focused: undefined,
      progress: undefined,
      /* The name is derived from the folder, so last scan's repository must
         not survive into this one — the `||` in `scan:result` is there to keep
         a name somebody typed during *this* scan, not the previous one's. */
      collectionName: '',
    });
    if (dir) get().inspect(dir);
  },

  close: () => set({ open: false }),

  setDir: (dir) => set({ dir, detected: [], manifests: [], profiles: [], profile: undefined }),
  setProfile: (profile) => set({ profile }),

  pickFolder: () => postMsg({ type: 'scan:pickFolder' }),
  inspect: (dir) => { if (dir.trim()) postMsg({ type: 'scan:inspect', dir: dir.trim() }); },

  run: () => {
    const { dir, profile } = get();
    if (!dir.trim()) return;
    /* Settings → Code Scan decides the walk. Read at the moment of running so
       a change takes effect on the next scan rather than the next reload. */
    const { maxFiles, ignore, only } = scanPreferences(useUiStateStore.getState().prefs);
    set({ stage: 'scanning', progress: undefined, error: undefined });
    postMsg({ type: 'scan:run', dir: dir.trim(), profile, maxFiles, ignore, only });
  },

  toggle: (identity) => set(s => {
    const next = new Set(s.chosen);
    if (next.has(identity)) next.delete(identity); else next.add(identity);
    return { chosen: next };
  }),

  toggleAll: (on) => set(s => ({
    chosen: on ? new Set(s.requests.map(r => r.scan.identity)) : new Set(),
  })),

  focus: (focused) => set({ focused }),
  setCollectionName: (collectionName) => set({ collectionName }),

  apply: (msg) => {
    switch (msg.type) {
      case 'scan:folderPicked':
        set({ dir: String(msg.dir), detected: [], profiles: [], profile: undefined });
        get().inspect(String(msg.dir));
        break;

      case 'scan:inspected':
        /* A reply for a folder somebody has already navigated away from is not
           news — the box may have changed twice while the host was reading. */
        if (String(msg.dir) !== get().dir.trim()) break;
        set({
          detected: (msg.detected as { id: string; label: string }[]) ?? [],
          manifests: (msg.manifests as string[]) ?? [],
          profiles: (msg.profiles as string[]) ?? [],
        });
        break;

      case 'scan:progress':
        set({
          progress: {
            file: String(msg.file),
            filesWalked: Number(msg.filesWalked) || 0,
            found: Number(msg.found) || 0,
          },
        });
        break;

      case 'scan:result': {
        const requests = (msg.requests as ScannedRequest[]) ?? [];
        const { selectInternal } = scanPreferences(useUiStateStore.getState().prefs);
        set({
          stage: 'review',
          requests,
          unresolved: (msg.unresolved as Unresolved[]) ?? [],
          baseUrl: msg.baseUrl as BaseUrlParts | undefined,
          variables: (msg.variables as { key: string; value: string }[]) ?? [],
          filesWalked: Number(msg.filesWalked) || 0,
          capped: !!msg.capped,
          ms: Number(msg.ms) || 0,
          detected: (msg.detected as { id: string; label: string }[]) ?? get().detected,
          /*
            Everything is ticked except what somebody plainly did not come for.
            Internal and actuator endpoints are real and findable — they just
            should not arrive selected in a collection somebody is about to
            run, unless Settings says they are what you are looking for.
          */
          chosen: new Set(
            requests
              .filter(r => selectInternal || !isInternal(r))
              .map(r => r.scan.identity),
          ),
          focused: requests[0]?.scan.identity,
          collectionName: get().collectionName || nameFromDir(String(msg.dir ?? get().dir)),
        });
        break;
      }

      case 'scan:error':
        set({ stage: 'error', error: String(msg.message ?? 'The scan failed.') });
        break;

      default:
        break;
    }
  },
}));

/** Paths nobody scans a repository to find. Listed, never hidden — just unticked. */
export function isInternal(r: ScannedRequest): boolean {
  return /\/(internal|actuator|admin)(\/|$)/.test(r.url);
}

/** Group requests by the file they came from — the folders they will land in. */
export function byFolder(requests: ScannedRequest[]): { folder: string; requests: ScannedRequest[] }[] {
  const map = new Map<string, ScannedRequest[]>();
  for (const r of requests) {
    const list = map.get(r.folder) ?? [];
    list.push(r);
    map.set(r.folder, list);
  }
  return [...map.entries()].map(([folder, rs]) => ({ folder, requests: rs }));
}

/** The one-line summary the review screen leads with. */
export function summarise(requests: ScannedRequest[]): Record<ProvenanceKind, number> {
  const out: Record<ProvenanceKind, number> = {
    read: 0, resolved: 0, example: 0, generated: 0, unknown: 0,
  };
  for (const r of requests) {
    for (const p of Object.values(r.scan.provenance)) {
      if (p?.kind) out[p.kind]++;
    }
  }
  return out;
}
