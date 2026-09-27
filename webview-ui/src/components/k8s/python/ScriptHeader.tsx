/**
 * The open script's name, whether it is saved, and the verbs that change it.
 *
 * The name is editable in place because it is also the file's name inside the
 * pod — `check_db.py` is what a traceback will say — and renaming should not
 * be a trip to a dialog.
 */
import { useRef, useState } from 'react';
import {
  ButtonView, IconButtonView, TextInputView, PopoverView, IconSize,
} from '@salilvnair/dui';
import { TrashIcon } from '../../../icons';
import { ConfirmDialog } from '../../shared/modals/ConfirmDialog';
import { usePyStore } from '../../../store/dk8s-python-store';
import { WARN } from '../tone';

export function ScriptHeader({ scriptId }: { scriptId: string }) {
  const script = usePyStore(s => s.scripts.find(x => x.id === scriptId));
  const draft = usePyStore(s => s.drafts[scriptId]);
  const dirty = usePyStore(s => s.isDirty(scriptId));
  const rename = usePyStore(s => s.rename);
  const setFolder = usePyStore(s => s.setFolder);
  const save = usePyStore(s => s.save);
  const saveAs = usePyStore(s => s.saveAs);
  const remove = usePyStore(s => s.remove);
  const [asOpen, setAsOpen] = useState(false);
  const [asName, setAsName] = useState('');
  const [confirm, setConfirm] = useState(false);
  const asRef = useRef<HTMLSpanElement>(null);

  if (!script) return null;
  const name = draft?.name ?? script.name;
  const folder = draft?.folder ?? script.folder ?? '';

  return (
    <div className="flex items-center gap-2 px-3 flex-shrink-0"
         style={{ height: 34, borderBottom: '1px solid var(--color-surface-border)' }}>
      <TextInputView
        size="xs" value={name} aria-label="Script name"
        onChange={(e) => rename(scriptId, e.target.value)}
        inputStyle={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}
        style={{ width: 200 }}
      />
      <TextInputView
        size="xs" value={folder} placeholder="folder" aria-label="Library folder"
        onChange={(e) => setFolder(scriptId, e.target.value)}
        style={{ width: 110 }}
      />
      {dirty && (
        <span title="Unsaved changes"
              style={{ width: 7, height: 7, borderRadius: 7, background: WARN, flexShrink: 0 }} />
      )}
      <span className="flex-1" />
      <ButtonView size="xs" variant="secondary" disabled={!dirty} onClick={() => save(scriptId)}
                  title="Save to this workspace (Ctrl+S)">
        Save
      </ButtonView>
      {/* The popover anchors on the wrapper: ButtonView does not forward a ref. */}
      <span ref={asRef} className="inline-flex">
        <ButtonView size="xs" variant="ghost"
                    onClick={() => { setAsName(name.replace(/\.py$/, '-copy.py')); setAsOpen(true); }}>
          Save as&hellip;
        </ButtonView>
      </span>
      <IconButtonView size="xs" icon={<TrashIcon size={IconSize.inline} />} tooltip="Delete this script"
                      aria-label="Delete script" onClick={() => setConfirm(true)} />

      <PopoverView open={asOpen} onClose={() => setAsOpen(false)} anchorEl={asRef.current} placement="bottom">
        <div className="flex items-center gap-2 p-2">
          <TextInputView
            autoFocus size="xs" value={asName} aria-label="New script name"
            onChange={(e) => setAsName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && asName.trim()) { saveAs(scriptId, asName); setAsOpen(false); }
            }}
            style={{ width: 200 }}
          />
          <ButtonView size="xs" variant="primary" disabled={!asName.trim()}
                      onClick={() => { saveAs(scriptId, asName); setAsOpen(false); }}>
            Save
          </ButtonView>
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
    </div>
  );
}
