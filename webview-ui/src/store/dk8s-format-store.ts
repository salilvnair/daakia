/**
 * Log format state.
 *
 * The formats themselves live on the host — it is what parses lines — so this
 * store is a mirror plus the editor's working copy. Nothing here parses
 * anything: the preview is computed on the host too, against the same compiled
 * format the stream will use, so what the editor shows is what the log view
 * will do rather than a second implementation that can disagree with it.
 */
import { create } from 'zustand';
import { postMsg } from '../vscode';
import { useUiStateStore } from './ui-state-store';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'other';
export type FormatKind = 'json' | 'logfmt' | 'pattern';

export interface LogFormat {
  id: string;
  name: string;
  kind: FormatKind;
  pattern?: string;
  fields?: { timestamp?: string; level?: string; logger?: string; message?: string };
  levelMap?: Record<string, LogLevel>;
  match?: { image?: string; namespace?: string; label?: string; pod?: string };
  builtin?: boolean;
  enabled?: boolean;
}

export interface PreviewRow {
  line: string;
  matched: boolean;
  level?: LogLevel;
  logger?: string;
  message?: string;
  ts?: number;
}

interface FormatState {
  formats: LogFormat[];
  builtins: LogFormat[];
  disabled: string[];

  /** The one being edited, if any. A copy — nothing is saved until asked. */
  draft?: LogFormat;
  /** Lines the preview runs against. */
  sample: string[];
  preview: PreviewRow[];
  previewError?: string;
  saveError?: string;

  detecting: boolean;
  detected?: { raw: string; error?: string };

  load: () => void;
  newDraft: () => void;
  editDraft: (f: LogFormat) => void;
  patchDraft: (patch: Partial<LogFormat>) => void;
  closeDraft: () => void;
  save: () => void;
  remove: (id: string) => void;
  toggleBuiltin: (id: string, enabled: boolean) => void;

  setSample: (lines: string[]) => void;
  sampleFromPod: (context: string, namespace: string, pod: string) => void;
  test: () => void;
  detect: () => void;
  applyDetected: () => void;
  apply: (msg: Record<string, unknown>) => void;
}

const blank = (): LogFormat => ({
  id: `fmt-${Date.now().toString(36)}`,
  name: '',
  kind: 'pattern',
  pattern: '%{TIMESTAMP} %{LEVEL} %{MESSAGE}',
  enabled: true,
});

/**
 * Pull a format object out of whatever the model replied with.
 *
 * Models wrap JSON in prose or a fence often enough that failing on it would
 * make the button unreliable for no good reason.
 */
export function extractFormatJson(raw: string): Partial<LogFormat> & { note?: string; confidence?: number } | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

export const useDk8sFormatStore = create<FormatState>((set, get) => ({
  formats: [],
  builtins: [],
  disabled: [],
  sample: [],
  preview: [],
  detecting: false,

  load: () => postMsg({ type: 'dk8s:getFormats' }),

  newDraft: () => set({ draft: blank(), preview: [], previewError: undefined, saveError: undefined }),
  editDraft: (f) => (
    // Remembered so the same row is open when you come back. Only the id: the
    // draft's contents are unsaved edits, and silently restoring those days
    // later would put changes in front of you that you never chose to keep.
    useUiStateStore.getState().setPref('dk8s.format.open', f.id),
    set({
    // A built-in keeps its id while being viewed, so the row it opened under
    // can find it — the copy is made on save, in `save`.
    draft: { ...f },
    preview: [], previewError: undefined, saveError: undefined,
  })),

  patchDraft: (patch) => {
    const draft = get().draft;
    if (!draft) return;
    set({ draft: { ...draft, ...patch }, saveError: undefined });
    // Preview follows every keystroke, so a pattern is never written blind.
    // The host does the parsing, so this stays honest about what the stream
    // will actually do.
    if (get().sample.length) get().test();
  },

  closeDraft: () => (
    useUiStateStore.getState().setPref('dk8s.format.open', ''),
    set({ draft: undefined, preview: [], detected: undefined })
  ),

  save: () => {
    const draft = get().draft;
    if (!draft?.name.trim()) { set({ saveError: 'Give it a name first.' }); return; }

    // Saving an edited built-in creates a copy rather than overwriting it.
    // Built-ins are shipped defaults; the list would otherwise show the same
    // id twice, and there would be no way back to the original.
    const format = draft.builtin
      ? {
          ...draft,
          id: `fmt-${Date.now().toString(36)}`,
          name: draft.name === get().builtins.find(b => b.id === draft.id)?.name
            ? `${draft.name} (copy)`
            : draft.name,
          builtin: false,
        }
      : draft;

    postMsg({ type: 'dk8s:saveFormat', format });
  },

  remove: (id) => postMsg({ type: 'dk8s:deleteFormat', id }),
  toggleBuiltin: (id, enabled) => postMsg({ type: 'dk8s:deleteFormat', id, enabled }),

  setSample: (lines) => { set({ sample: lines }); if (get().draft) get().test(); },

  sampleFromPod: (context, namespace, pod) =>
    postMsg({ type: 'dk8s:sampleLines', context, namespace, pod }),

  test: () => {
    const { draft, sample } = get();
    if (!draft || !sample.length) return;
    postMsg({ type: 'dk8s:testFormat', format: draft, lines: sample });
  },

  detect: () => {
    const sample = get().sample;
    if (!sample.length) {
      set({ detected: { raw: '', error: 'Paste or fetch some sample lines first.' } });
      return;
    }
    set({ detecting: true, detected: undefined });
    postMsg({ type: 'dk8s:detectFormat', lines: sample });
  },

  applyDetected: () => {
    const raw = get().detected?.raw;
    if (!raw) return;
    const parsed = extractFormatJson(raw);
    if (!parsed) {
      set({ detected: { raw, error: 'That reply was not a format description.' } });
      return;
    }
    const draft = get().draft ?? blank();
    set({
      draft: {
        ...draft,
        name: parsed.name || draft.name,
        kind: (parsed.kind as FormatKind) || draft.kind,
        pattern: parsed.pattern ?? draft.pattern,
        fields: parsed.fields ?? draft.fields,
        levelMap: parsed.levelMap ?? draft.levelMap,
      },
      detected: undefined,
    });
    get().test();
  },

  apply: (msg) => {
    switch (msg.type) {
      case 'dk8s:formats':
        set({
          formats: (msg.formats as LogFormat[]) ?? [],
          builtins: (msg.builtins as LogFormat[]) ?? [],
          disabled: (msg.disabled as string[]) ?? [],
          // A successful save closes the editor; the list is the confirmation.
          draft: undefined,
          saveError: undefined,
        });
        break;

      case 'dk8s:formatError':
        set({ saveError: msg.error as string });
        break;

      case 'dk8s:formatTested':
        set({
          preview: (msg.results as PreviewRow[]) ?? [],
          previewError: msg.error as string | undefined,
        });
        break;

      case 'dk8s:sampleLines':
        set({ sample: (msg.lines as string[]) ?? [] });
        if (get().draft) get().test();
        break;

      case 'dk8s:formatDetected':
        set({ detecting: false, detected: { raw: '', error: msg.error as string } });
        break;

      // The detector streams on its own tab id, so the pod AI panel never
      // sees it and this never sees the pod panel's answers.
      case 'ai:chunk':
        if (msg.tabId !== 'dk8s-format-detect') break;
        set(s => ({ detected: { raw: (s.detected?.raw ?? '') + String(msg.delta ?? '') } }));
        break;

      case 'ai:complete':
        if (msg.tabId !== 'dk8s-format-detect') break;
        set(s => ({
          detecting: false,
          detected: {
            raw: s.detected?.raw
              || String((msg.message as { content?: string } | undefined)?.content ?? ''),
          },
        }));
        break;

      case 'ai:error':
        if (msg.tabId !== 'dk8s-format-detect') break;
        set({ detecting: false, detected: { raw: '', error: String(msg.message ?? 'Detection failed.') } });
        break;
    }
  },
}));
