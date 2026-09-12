import { useEffect, useState } from 'react';
import { EnvironmentEditor } from '../../rest/request/EnvironmentEditor';
import { GLOBAL_ENV_ID } from '../../../store/env-store';
import { useEnvStore } from '../../../store/env-store';
import { RenameIcon } from '../../../icons/daakia-icons';
import { ModalView, ButtonView, IconButtonView, TextInputView } from '@salilvnair/dui';

interface EnvironmentModalProps {
  open: boolean;
  envId: string | null;
  title: string;
  onSave: () => void;
  onCancel: () => void;
  accentColor?: string;
}

export function EnvironmentModal({ open, envId, title, onSave, onCancel, accentColor }: EnvironmentModalProps) {
  const { environments, renameEnvironment } = useEnvStore();
  const [editingName, setEditingName] = useState(false);
  const activeEnv = environments.find(e => e.id === envId);
  const nameReadOnly = !envId || envId === GLOBAL_ENV_ID;
  const hasVariables = (activeEnv?.variables.length ?? 0) > 0;

  useEffect(() => {
    if (!open) setEditingName(false);
  }, [open]);

  /*
    The name field is dui's input, not a bare one.

    It was a raw `<input>` with `px-0`, so the name started at the pixel where
    its border ended — text jammed against the box. The shared control brings
    the padding, the height and the focus ring every other field has; only the
    title's own type size is set at the call site.
  */
  const headerTitle = (
    <div className="flex items-center gap-2">
      {editingName && activeEnv && !nameReadOnly ? (
        <TextInputView
          value={activeEnv.name}
          onChange={(e) => renameEnvironment(activeEnv.id, e.target.value)}
          onBlur={() => setEditingName(false)}
          onKeyDown={(e) => e.key === 'Enter' && setEditingName(false)}
          autoFocus
          size="lg"
          accentColor={accentColor}
          style={{ minWidth: 300 }}
          // The title keeps its own size while it is being edited; `style` is
          // the box, `inputStyle` is the text inside it.
          inputStyle={{ fontSize: 18, fontWeight: 600 }}
        />
      ) : (
        <span
          className={`text-[18px] font-semibold text-[var(--color-text-primary)] ${!nameReadOnly ? 'cursor-pointer hover:text-[var(--color-primary)]' : ''}`}
          onDoubleClick={() => { if (!nameReadOnly) setEditingName(true); }}
          title={!nameReadOnly ? 'Double-click to rename' : undefined}
        >
          {activeEnv ? activeEnv.name : title}
        </span>
      )}
      {!nameReadOnly && !editingName && (
        <IconButtonView
          icon={<RenameIcon size={14} />}
          size="sm"
          tooltip="Rename environment"
          onClick={() => setEditingName(true)}
        />
      )}
    </div>
  );

  return (
    <ModalView
      open={open && !!envId}
      onClose={onCancel}
      title=""
      headerIcon={headerTitle}
      size="xl"
      elevated
      noPadding
      footerRight={
        <ButtonView
          variant="primary"
          size="md"
          accentColor={accentColor}
          disabled={!hasVariables}
          onClick={onSave}
        >
          Save
        </ButtonView>
      }
    >
      <div className="px-6 py-4 flex flex-col" style={{ height: '65vh', minHeight: 480 }}>
        <EnvironmentEditor environmentId={envId} showSelector={false} allowRename={envId !== GLOBAL_ENV_ID} showName={false} />
      </div>
    </ModalView>
  );
}