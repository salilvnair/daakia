/**
 * The artifact folder, as state.
 *
 * Separate from the doctor store because its lifetime is different: that one
 * tracks a collection in flight against one pod, this one is the durable list
 * of everything on disk and survives closing every pod.
 */
import { create } from 'zustand';
import { postMsg } from '../vscode';
import { logUiEvent } from './ui-audit-store';
import { useUiStateStore } from './ui-state-store';
import { openArtifactIn } from './dk8s-analyze-store';

export interface StoredArtifact {
  file: string;
  name: string;
  kind: string;
  /** Set when nothing here can read it, carrying the reason to show. */
  unsupported?: string;
  pod?: string;
  collectedAt?: number;
  bytes: number;
  analyzer: 'heap' | 'threads' | 'logs' | 'cpu';
}

interface ArtifactState {
  artifacts: StoredArtifact[];
  dir?: string;
  error?: string;
  /** The one someone opened that nothing here can read. */
  unsupported?: StoredArtifact;
  dismissUnsupported: () => void;

  load: () => void;
  importFile: () => void;
  remove: (file: string) => void;
  reveal: () => void;
  open: (a: StoredArtifact) => void;
  apply: (msg: Record<string, unknown>) => void;
}

export const useDk8sArtifactStore = create<ArtifactState>((set) => ({
  artifacts: [],

  load: () => postMsg({ type: 'dk8s:listArtifacts' }),
  importFile: () => {
    logUiEvent('dk8s.artifact_import', {});
    postMsg({ type: 'dk8s:importArtifact' });
  },
  remove: (file) => {
    // Deleting is the one artifact action that cannot be undone, so the record
    // carries the whole file path rather than just its display name.
    logUiEvent('dk8s.artifact_delete', { file });
    postMsg({ type: 'dk8s:deleteArtifact', file });
  },
  dismissUnsupported: () => set({ unsupported: undefined }),

  reveal: () => {
    logUiEvent('dk8s.artifact_reveal', {});
    postMsg({ type: 'dk8s:revealArtifacts' });
  },

  open: (a) => {
    /*
      A file no analyzer understands opens a card, not an analyzer.

      Routing it to the log view — which is what happened, because that is the
      fallback — produced an empty list that reads as "this file has nothing in
      it" rather than "this is a PNG".
    */
    if (a.unsupported) {
      logUiEvent('dk8s.artifact_unsupported', { name: a.name, kind: a.kind, file: a.file });
      set({ unsupported: a });
      return;
    }
    // Over the list rather than off to a tab: this is the same gesture as
    // opening a pod, and the analyzer is chosen before the view mounts so a
    // thread dump does not land on the heap analyzer's empty state.
    logUiEvent('dk8s.artifact_analyze', {
      name: a.name, kind: a.kind, analyzer: a.analyzer,
      pod: a.pod, bytes: a.bytes, file: a.file,
    });
    openArtifactIn(a.analyzer);
    postMsg({ type: 'dk8s:openArtifact', file: a.file });
  },

  apply: (msg) => {
    switch (msg.type) {
      case 'dk8s:artifacts':
        set({
          artifacts: (msg.artifacts as StoredArtifact[]) ?? [],
          dir: msg.dir as string,
          error: undefined,
        });
        break;
      case 'dk8s:artifactError':
        set({ error: msg.error as string });
        break;
    }
  },
}));
