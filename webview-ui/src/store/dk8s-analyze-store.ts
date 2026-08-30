/**
 * The analyzer, opened over the artifact list.
 *
 * It used to be a third tab beside Pods and Artifacts, which put it in the
 * wrong category: Pods and Artifacts are lists you browse, and an analysis is
 * one artifact you opened. Clicking Analyze on a row and landing on a tab that
 * was already there — possibly still showing a different dump — reads as
 * navigation rather than as opening the thing you clicked.
 *
 * So it works like the pod detail instead: a full-panel view with a back
 * button, the artifact named in its own header, and an AI panel that toggles
 * beside it. Same shape, same gesture, same way out.
 */
import { create } from 'zustand';
import { useUiStateStore } from './ui-state-store';

export type AnalyzerId = 'heap' | 'threads' | 'logs';

/**
 * What the open analysis is, in words.
 *
 * Published by whichever analyzer has a file loaded, because only it knows —
 * "37 threads · 0 daemon" and "6 entries · 3 shapes · 2:1" are computed during
 * the parse. The shell renders it so the header reads the same whichever
 * analyzer is showing, and so there is one header rather than one per view.
 */
export interface AnalysisHeader {
  name: string;
  meta: string;
}

interface AnalyzeState {
  open: boolean;
  analyzer: AnalyzerId;
  /** Undefined until an analyzer has something loaded. */
  header?: AnalysisHeader;

  openAnalyzer: (which?: AnalyzerId) => void;
  close: () => void;
  setAnalyzer: (a: AnalyzerId) => void;
  setHeader: (h: AnalysisHeader | undefined) => void;
}

/**
 * Open the analyzer for one artifact.
 *
 * Here rather than beside the view: the artifact list needs it, and a store
 * reaching into a component for it made `dk8s-artifact-store` and
 * `ArtifactDetail` import each other. That cycle left two copies of the
 * artifact store alive — the tab badge counted ten files while the list
 * rendered "nothing collected yet" from the other one.
 *
 * The analyzer is chosen before the view mounts, so a thread dump does not
 * land on the heap analyzer's empty state, which looks exactly like the open
 * having failed.
 */
export function openArtifactIn(analyzer: AnalyzerId): void {
  useUiStateStore.getState().setPref('doctor.analyzer', analyzer);
  useDk8sAnalyzeStore.getState().openAnalyzer(analyzer);
}

export const useDk8sAnalyzeStore = create<AnalyzeState>((set) => ({
  open: false,
  analyzer: 'heap',

  openAnalyzer: (which) => set(s => ({ open: true, analyzer: which ?? s.analyzer })),

  // The header belongs to the file that was open, so it goes with it. Leaving
  // it would title the next analysis with the last one's name.
  close: () => set({ open: false, header: undefined }),

  setAnalyzer: (analyzer) => set({ analyzer, header: undefined }),
  setHeader: (header) => set({ header }),
}));
