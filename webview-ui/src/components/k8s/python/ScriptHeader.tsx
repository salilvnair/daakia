/**
 * The open script's name, whether it is saved, and the verbs that change it.
 *
 * Two pieces of the Python toolbar rather than a row of their own: the name
 * on the left, and the file verbs behind a ⋯ on the right. A second row of
 * two text boxes and three buttons sat between the toolbar and the editor on
 * every script, for things done once per script — renaming, filing, saving
 * under another name.
 *
 * The name opens a small popover to edit it, because it is also the file's
 * name inside the pod — `check_db.py` is what a traceback will say — and the
 * folder it is filed under in the library sits beside it there.
 */
import { useRef, useState } from 'react';
import {
  ButtonView, IconButtonView, TextInputView, PopoverView, ContextMenuView, IconSize,
} from '@salilvnair/dui';
import {
  TrashIcon, PythonIcon, MoreHorizontalIcon, SaveIcon, SaveCheckIcon, CopyIcon,
} from '../../../icons';
import { ConfirmDialog } from '../../shared/modals/ConfirmDialog';
import { usePyStore } from '../../../store/dk8s-python-store';
import { WARN, MUTED } from '../tone';

const label: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: MUTED,
};

/** The name, its folder, and the unsaved dot — click to rename or refile. */
/**
 * The toolbar's control height. `md` where the row stands alone (a pod's
 * Python tab); `sm` on the Scripts screen, where it sits under the pods row
 * and matches its pickers and Run on pods.
 */
export type PyToolbarSize = 'sm' | 'md';
const CONTROL_H: Record<PyToolbarSize, number> = { sm: 24, md: 28 };

export function ScriptTitle({ scriptId, size = 'md' }: { scriptId: string; size?: PyToolbarSize }) {
  const script = usePyStore(s => s.scripts.find(x => x.id === scriptId));
  const draft = usePyStore(s => s.drafts[scriptId]);
  const dirty = usePyStore(s => s.isDirty(scriptId));
  const rename = usePyStore(s => s.rename);
  const setFolder = usePyStore(s => s.setFolder);
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);

  if (!script) return null;
  const name = draft?.name ?? script.name;
  const folder = draft?.folder ?? script.folder ?? '';

  return (
    <span ref={anchor} className="inline-flex min-w-0">
      <button type="button" onClick={() => setOpen(o => !o)}
              title="Rename, or file it in a folder"
              className="py-title inline-flex items-center gap-2 min-w-0 px-2 rounded-md cursor-pointer border-none bg-transparent"
              style={{ height: CONTROL_H[size] }}>
        <PythonIcon size={IconSize.action} color="var(--color-success)" />
        <span className="font-mono text-[12.5px] truncate" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
          {name}
        </span>
        {folder && <span className="text-[11px] truncate" style={{ color: MUTED }}>in {folder}</span>}
        {dirty && (
          <span title="Unsaved — Ctrl+S saves"
                style={{ width: 7, height: 7, borderRadius: 7, background: WARN, flexShrink: 0 }} />
        )}
      </button>
      <style>{'.py-title:hover { background: var(--color-surface-hover) !important; }'}</style>
      <PopoverView open={open} onClose={() => setOpen(false)} anchorEl={anchor.current} placement="bottom" borderRadius={10}>
        <div className="flex flex-col gap-2.5 p-3" style={{ width: 300 }}>
          <div className="flex flex-col gap-1">
            <span style={label}>name</span>
            <TextInputView autoFocus size="md" value={name} aria-label="Script name"
                           onChange={(e) => rename(scriptId, e.target.value)}
                           inputStyle={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)' }} />
            <span className="text-[10.5px]" style={{ color: MUTED }}>Also the file&rsquo;s name in the pod, so a traceback names it.</span>
          </div>
          <div className="flex flex-col gap-1">
            <span style={label}>folder</span>
            <TextInputView size="md" value={folder} placeholder="none — at the top of the library" aria-label="Library folder"
                           onChange={(e) => setFolder(scriptId, e.target.value)} />
          </div>
        </div>
      </PopoverView>
    </span>
  );
}

/**
 * Save, beside the name it saves — the one file verb used every few minutes.
 *
 * Coloured while there is something to save, and a green check once there is
 * not, so the state reads without a dot to interpret. Ctrl+S does the same.
 */
export function ScriptSave({ scriptId, size = 'md' }: { scriptId: string; size?: PyToolbarSize }) {
  const dirty = usePyStore(s => s.isDirty(scriptId));
  const save = usePyStore(s => s.save);
  const exists = usePyStore(s => s.scripts.some(x => x.id === scriptId));
  if (!exists) return null;
  return (
    <ButtonView size={size} variant="secondary"
                accentColor={dirty ? SAVE : SAVED}
                color={dirty ? SAVE : SAVED}
                disabled={!dirty}
                title={dirty ? 'Save to this workspace (Ctrl+S)' : 'Saved — Git Sync carries it'}
                iconLeft={dirty ? <SaveIcon size={IconSize.action} color={SAVE} /> : <SaveCheckIcon size={IconSize.action} color={SAVED} />}
                onClick={() => save(scriptId)}>
      {dirty ? 'Save' : 'Saved'}
    </ButtonView>
  );
}

const SAVE = 'var(--color-info)';
const SAVED = 'var(--color-success)';

/** Save, Save as, Delete — behind one ⋯, since each is done once in a while. */
export function ScriptMenu({ scriptId, size = 'md' }: { scriptId: string; size?: PyToolbarSize }) {
  const script = usePyStore(s => s.scripts.find(x => x.id === scriptId));
  const draft = usePyStore(s => s.drafts[scriptId]);
  const dirty = usePyStore(s => s.isDirty(scriptId));
  const save = usePyStore(s => s.save);
  const saveAs = usePyStore(s => s.saveAs);
  const remove = usePyStore(s => s.remove);
  const [open, setOpen] = useState(false);
  const [asName, setAsName] = useState<string | undefined>();
  const [confirm, setConfirm] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);

  if (!script) return null;
  const name = draft?.name ?? script.name;

  return (
    <span ref={anchor} className="inline-flex">
      <IconButtonView size={size} icon={<MoreHorizontalIcon size={IconSize.action} />}
                      tooltip="Save, save as, delete" aria-label="Script actions"
                      onClick={() => { setAsName(undefined); setOpen(o => !o); }} />
      {/* dui's own menu — the same one as every other ⋯ and right-click in
          Daakia — rather than a hand-made list in a popover. */}
      <ContextMenuView
        anchorEl={anchor.current}
        open={open && asName === undefined}
        onClose={() => setOpen(false)}
        align="right"
        width="md"
        items={[
          {
            id: 'save', label: 'Save', shortcut: 'Ctrl+S', disabled: !dirty,
            icon: <SaveIcon size={IconSize.action} />, iconColor: 'var(--color-info)',
            onClick: () => { save(scriptId); setOpen(false); },
          },
          {
            id: 'save-as', label: 'Save as…',
            icon: <CopyIcon size={IconSize.action} />, iconColor: 'var(--color-ctx-duplicate)',
            onClick: () => setAsName(name.replace(/\.py$/, '-copy.py')),
          },
          { id: 'sep', label: '', separator: true },
          {
            id: 'delete', label: 'Delete', danger: true,
            icon: <TrashIcon size={IconSize.action} />,
            onClick: () => { setOpen(false); setConfirm(true); },
          },
        ]}
      />
      {/* Save as needs a name, so it is a small form of its own. */}
      <PopoverView open={open && asName !== undefined} onClose={() => { setOpen(false); setAsName(undefined); }}
                   anchorEl={anchor.current} placement="bottom" borderRadius={10}>
        <div className="flex flex-col p-1.5" style={{ width: 260 }}>
          {asName !== undefined && (
            <div className="flex flex-col gap-2 p-1.5">
              <span style={label}>save a copy as</span>
              <TextInputView autoFocus size="md" value={asName} aria-label="New script name"
                             onChange={(e) => setAsName(e.target.value)}
                             onKeyDown={(e) => {
                               if (e.key === 'Enter' && asName.trim()) { saveAs(scriptId, asName); setOpen(false); }
                             }}
                             inputStyle={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)' }} />
              <div className="flex justify-end gap-1.5">
                <ButtonView size="sm" variant="secondary" onClick={() => setAsName(undefined)}>Back</ButtonView>
                <ButtonView size="sm" variant="secondary" accentColor="var(--color-success)" color="var(--color-success)"
                            disabled={!asName.trim()}
                            onClick={() => { saveAs(scriptId, asName); setOpen(false); }}>
                  Save copy
                </ButtonView>
              </div>
            </div>
          )}
        </div>
      </PopoverView>

      {confirm && (
        <ConfirmDialog
          title={`Delete ${script.name}?`}
          message="It is removed from this workspace's library — and, through Git Sync, from your other machines."
          confirmLabel="Delete" danger
          onConfirm={() => { remove(scriptId); setConfirm(false); }}
          onCancel={() => setConfirm(false)}
        />
      )}
    </span>
  );
}
