/**
 * The artifact folder, as state.
 *
 * Separate from the doctor store because its lifetime is different: that one
 * tracks a collection in flight against one pod, this one is the durable list
 * of everything on disk and survives closing every pod.
 */
import { create } from 'zustand';
import { postMsg } from '../vscode';
import { useUiStateStore } from './ui-state-store';
import { openArtifactIn } from './dk8s-analyze-store';

export interface StoredArtifact {
  file: string;
  name: string;
  kind: string;
  pod?: string;
  collectedAt?: number;
  bytes: number;
  analyzer: 'heap' | 'threads' | 'logs';
}

interface ArtifactState {
  artifacts: StoredArtifact[];
  dir?: string;
  error?: string;

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
  importFile: () => postMsg({ type: 'dk8s:importArtifact' }),
  remove: (file) => postMsg({ type: 'dk8s:deleteArtifact', file }),
  reveal: () => postMsg({ type: 'dk8s:revealArtifacts' }),

  open: (a) => {
    // Over the list rather than off to a tab: this is the same gesture as
    // opening a pod, and the analyzer is chosen before the view mounts so a
    // thread dump does not land on the heap analyzer's empty state.
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
