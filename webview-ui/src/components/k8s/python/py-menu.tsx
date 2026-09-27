/**
 * The Python screens' right-click menu — what you can do with the thing under
 * the pointer, never the browser's Copy / Select All.
 *
 *   - a script in the library: Open, Save, Save a copy, Copy name, Delete;
 *   - the editor: the clipboard, Toggle comment, a breakpoint on this line,
 *     Run and Debug, and the selection to Ask AI or to Watch;
 *   - the panes: a variable's value or name, Add to Watch; a watch removed; a
 *     breakpoint switched off or removed; a frame's location;
 *   - the output: all of it copied, or cleared.
 *
 * What was clicked is read from `data-py-*` attributes the rows carry, so this
 * needs no hold on the rows themselves. Anything else falls back to the
 * surface menu's own entries — a text box's editing, a selection's Copy.
 */
import { useCallback, useState } from 'react';
import { useSurfaceMenu, copyItem, SEP, type ContextMenuItem } from '../surface-menu';
import {
  PlayIcon, BugIcon, SparkleIcon, SaveIcon, CopyIcon, TrashIcon, FileTextIcon, EyeIcon, CutIcon,
  PasteIcon, SelectAllIcon, CodeIcon, CloseIcon, SearchIcon, KeyboardIcon,
} from '../../../icons';
import { ConfirmDialog } from '../../shared/modals/ConfirmDialog';
import { usePyStore } from '../../../store/dk8s-python-store';
import { getMonacoEditorInstance } from '../../../services/editor/monaco-instance';
import { copyText } from '../../../utils/clipboard';
import { askPyAi } from './AskPyAi';
import { usePyGhost, ghostAllowed, openGhostSettings } from './ghost-toggle';
import { AI as AI_ACCENT } from '../tone';

const RUN = 'var(--color-success)';
const WARN = 'var(--color-warning)';
const BAD = 'var(--color-error)';

export function usePythonMenu({ scriptId, onRun, onDebug, canRun, canDebug, output, onClearOutput }: {
  scriptId?: string;
  onRun?: () => void;
  onDebug?: () => void;
  canRun?: boolean;
  canDebug?: boolean;
  /** The shown run's output, for Copy output. */
  output?: () => string;
  onClearOutput?: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | undefined>();

  const build = useCallback((target: HTMLElement, selection: string): ContextMenuItem[] => {
    const st = usePyStore.getState();

    /* A script in the library. */
    const row = target.closest('[data-py-script]') as HTMLElement | null;
    if (row) {
      const id = row.dataset.pyScript!;
      const script = st.scripts.find(s => s.id === id);
      if (!script) return [];
      const name = st.drafts[id]?.name ?? script.name;
      return [
        { id: 'open', label: 'Open', icon: <FileTextIcon size={14} />, iconColor: 'var(--color-info)', onClick: () => st.select(id) },
        { id: 'save', label: 'Save', shortcut: 'Ctrl+S', disabled: !st.isDirty(id), icon: <SaveIcon size={14} />, iconColor: 'var(--color-info)', onClick: () => st.save(id) },
        { id: 'save-copy', label: 'Save a copy', icon: <CopyIcon size={14} />, iconColor: 'var(--color-ctx-duplicate)', onClick: () => st.saveAs(id, name.replace(/\.py$/, '-copy.py')) },
        copyItem('copy-name', 'Copy name', name),
        SEP('lib-sep'),
        { id: 'delete', label: 'Delete', danger: true, icon: <TrashIcon size={14} />, onClick: () => setConfirmDelete({ id, name }) },
      ];
    }

    /* The Run and Debug panes. */
    const v = target.closest('[data-py-var]') as HTMLElement | null;
    if (v) {
      const name = v.dataset.pyVar!;
      const value = v.dataset.pyValue ?? '';
      return [
        copyItem('copy-value', 'Copy value', value),
        copyItem('copy-var-name', 'Copy name', name),
        SEP('var-sep'),
        { id: 'watch', label: `Add ${name} to Watch`, icon: <EyeIcon size={14} />, iconColor: WARN, onClick: () => st.addWatch(name) },
      ];
    }
    const w = target.closest('[data-py-watch]') as HTMLElement | null;
    if (w) {
      const expr = w.dataset.pyWatch!;
      return [
        ...(w.dataset.pyValue ? [copyItem('copy-watch-value', 'Copy value', w.dataset.pyValue)] : []),
        copyItem('copy-expr', 'Copy expression', expr),
        SEP('watch-sep'),
        { id: 'unwatch', label: 'Remove from Watch', icon: <CloseIcon size={14} />, iconColor: BAD, onClick: () => st.removeWatch(expr) },
      ];
    }
    const bp = target.closest('[data-py-bp]') as HTMLElement | null;
    if (bp && scriptId) {
      const line = Number(bp.dataset.pyBp);
      const off = (st.disabledBreakpoints[scriptId] ?? []).includes(line);
      const all = st.breakpoints[scriptId] ?? [];
      return [
        { id: 'bp-toggle', label: off ? 'Enable breakpoint' : 'Disable breakpoint', onClick: () => st.toggleBreakpointEnabled(scriptId, line) },
        { id: 'bp-remove', label: 'Remove breakpoint', icon: <CloseIcon size={14} />, iconColor: BAD, onClick: () => st.removeBreakpoint(scriptId, line) },
        ...(all.length > 1 ? [{ id: 'bp-remove-all', label: `Remove all ${all.length} breakpoints`, danger: true, onClick: () => all.forEach(l => st.removeBreakpoint(scriptId, l)) }] : []),
      ];
    }
    const frame = target.closest('[data-py-frame]') as HTMLElement | null;
    if (frame) return [copyItem('copy-frame', 'Copy location', frame.dataset.pyFrame!)];

    /* The output. */
    if (target.closest('[data-py-output]')) {
      const all = output?.() ?? '';
      return [
        ...(selection.trim() ? [copyItem('copy-sel', 'Copy', selection)] : []),
        ...(all ? [copyItem('copy-output', 'Copy all output', all)] : []),
        ...(onClearOutput ? [SEP('out-sep'), { id: 'clear', label: 'Clear output', icon: <TrashIcon size={14} />, onClick: onClearOutput }] : []),
      ];
    }

    /* The editor. */
    const editor = target.closest('.monaco-editor') ? getMonacoEditorInstance(target) : null;
    if (editor) {
      const model = editor.getModel();
      const sel = editor.getSelection();
      const text = sel && model && !sel.isEmpty() ? model.getValueInRange(sel) : '';
      const line = editor.getPosition()?.lineNumber as number | undefined;
      const act = (id: string) => () => { editor.focus(); editor.trigger('menu', id, null); };
      const oneLine = text && !text.includes('\n') && text.length <= 80;
      return [
        { id: 'cut', label: 'Cut', shortcut: 'Ctrl+X', disabled: !text, icon: <CutIcon size={14} />, iconColor: 'var(--color-ctx-close)', onClick: act('editor.action.clipboardCutAction') },
        { id: 'copy', label: 'Copy', shortcut: 'Ctrl+C', disabled: !text, icon: <CopyIcon size={14} />, iconColor: 'var(--color-ctx-duplicate)', onClick: () => { void copyText(text); } },
        {
          id: 'paste', label: 'Paste', shortcut: 'Ctrl+V', icon: <PasteIcon size={14} />, iconColor: 'var(--color-ctx-pin)',
          onClick: () => {
            void navigator.clipboard?.readText?.().then(t => {
              if (!t) return;
              editor.focus();
              editor.executeEdits('menu', [{ range: editor.getSelection(), text: t, forceMoveMarkers: true }]);
            });
          },
        },
        { id: 'select-all', label: 'Select All', shortcut: 'Ctrl+A', icon: <SelectAllIcon size={14} />, iconColor: 'var(--color-ctx-close-batch)', onClick: act('editor.action.selectAll') },
        SEP('ed-sep-find'),
        { id: 'find', label: 'Find', shortcut: 'Ctrl+F', icon: <SearchIcon size={14} />, iconColor: 'var(--color-info)', onClick: act('actions.find') },
        { id: 'replace', label: 'Find and Replace', shortcut: 'Ctrl+H', icon: <SearchIcon size={14} />, iconColor: 'var(--color-info)', onClick: act('editor.action.startFindReplaceAction') },
        { id: 'rename-all', label: 'Change All Occurrences', shortcut: 'Ctrl+F2', icon: <CodeIcon size={14} />, iconColor: 'var(--color-ctx-rename)', onClick: act('editor.action.changeAll') },
        { id: 'palette', label: 'Command Palette', shortcut: 'F1', icon: <KeyboardIcon size={14} />, onClick: act('editor.action.quickCommand') },
        SEP('ed-sep-1'),
        { id: 'comment', label: 'Toggle comment', shortcut: 'Ctrl+/', icon: <CodeIcon size={14} />, onClick: act('editor.action.commentLine') },
        ...(scriptId && line ? [{
          id: 'bp', label: (st.breakpoints[scriptId] ?? []).includes(line) ? `Remove breakpoint on line ${line}` : `Breakpoint on line ${line}`,
          icon: <span style={{ width: 9, height: 9, borderRadius: 9, background: BAD, display: 'inline-block' }} />,
          onClick: () => st.toggleBreakpoint(scriptId, line),
        }] : []),
        SEP('ed-sep-2'),
        ...(onRun ? [{ id: 'run', label: 'Run', disabled: !canRun, icon: <PlayIcon size={14} />, iconColor: RUN, onClick: onRun }] : []),
        ...(onDebug ? [{ id: 'debug', label: 'Debug', disabled: !canDebug, icon: <BugIcon size={14} />, iconColor: WARN, onClick: onDebug }] : []),
        SEP('ed-sep-3'),
        {
          id: 'explain', label: text ? 'Explain the selection' : `Explain line ${line ?? ''}`.trim(),
          icon: <SparkleIcon size={14} />, iconColor: AI_ACCENT,
          onClick: () => askPyAi(text ? `Explain these lines:\n${text}` : `Explain line ${line}: ${model?.getLineContent(line ?? 1).trim() ?? ''}`, true),
        },
        {
          id: 'ask', label: text ? 'Ask AI about the selection…' : 'Ask AI…',
          icon: <SparkleIcon size={14} />, iconColor: AI_ACCENT,
          onClick: () => askPyAi(text ? `About these lines:\n${text}\n\n` : ''),
        },
        ...(oneLine ? [{ id: 'watch-sel', label: `Add ${text.trim()} to Watch`, icon: <EyeIcon size={14} />, iconColor: WARN, onClick: () => st.addWatch(text.trim()) }] : []),
        SEP('ed-sep-4'),
        (() => {
          if (!ghostAllowed()) {
            return {
              id: 'ghost', label: 'AI suggestions are off in Settings…', icon: <SparkleIcon size={14} />,
              iconColor: 'var(--color-text-muted)', onClick: openGhostSettings,
            };
          }
          const on = usePyGhost.getState().on;
          return {
            id: 'ghost', label: on ? 'Turn AI suggestions off' : 'Turn AI suggestions on',
            description: on ? 'Grey code as you type; Tab accepts' : undefined,
            icon: <SparkleIcon size={14} />, iconColor: on ? 'var(--color-text-muted)' : AI_ACCENT,
            onClick: () => usePyGhost.getState().toggle(),
          };
        })(),
      ];
    }

    return [];
  }, [scriptId, onRun, onDebug, canRun, canDebug, output, onClearOutput]);

  const menu = useSurfaceMenu(build);

  const element = (
    <>
      {menu.element}
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${confirmDelete.name}?`}
          message="It is removed from this workspace's library — and, through Git Sync, from your other machines."
          confirmLabel="Delete" danger
          onConfirm={() => { usePyStore.getState().remove(confirmDelete.id); setConfirmDelete(undefined); }}
          onCancel={() => setConfirmDelete(undefined)}
        />
      )}
    </>
  );

  return { onContextMenu: menu.onContextMenu, element };
}
