import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { EnvironmentEditor } from '../../rest/request/EnvironmentEditor';
import { GLOBAL_ENV_ID } from '../../../store/env-store';
import { useEnvStore } from '../../../store/env-store';
import { RenameIcon, CloseIcon } from '../../../icons/daakia-icons';

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

  useEffect(() => {
    if (!open) setEditingName(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open || !envId) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50">
      <div className="w-[min(96vw,980px)] h-[min(86vh,720px)] rounded-2xl bg-[var(--color-elevated)] border border-[var(--color-elevated-border)] shadow-2xl animate-[fadeSlideIn_150ms_ease-out] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--color-surface-border)]">
          <div className="flex items-center gap-2">
            {editingName && activeEnv && !nameReadOnly ? (
              <input
                type="text"
                value={activeEnv.name}
                onChange={(e) => renameEnvironment(activeEnv.id, e.target.value)}
                onBlur={() => setEditingName(false)}
                onKeyDown={(e) => e.key === 'Enter' && setEditingName(false)}
                autoFocus
                className="text-[18px] font-semibold bg-transparent border-b-2 text-[var(--color-text-primary)] focus:outline-none px-0 py-0.5"
                style={{ borderColor: accentColor || 'var(--color-primary)' }}
              />
            ) : (
              <h2
                className={`text-[18px] font-semibold text-[var(--color-text-primary)] ${!nameReadOnly ? 'cursor-pointer hover:text-[var(--color-primary)]' : ''}`}
                onDoubleClick={() => { if (!nameReadOnly) setEditingName(true); }}
                title={!nameReadOnly ? 'Double-click to rename' : undefined}
              >
                {activeEnv ? activeEnv.name : title}
              </h2>
            )}
            {!nameReadOnly && !editingName && (
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] cursor-pointer transition-colors rounded hover:bg-[var(--color-surface-hover)]"
                title="Rename environment"
              >
                <RenameIcon size={14} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-[#ef4444] hover:text-[#dc2626] hover:bg-[rgba(239,68,68,0.08)] cursor-pointer transition-colors"
          >
            <CloseIcon size={14} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-visible px-6 py-4 flex flex-col">
          <EnvironmentEditor environmentId={envId} showSelector={false} allowRename={envId !== GLOBAL_ENV_ID} showName={false} />
        </div>
        <div className="flex items-center gap-3 px-6 py-4 border-t border-[var(--color-surface-border)]">
          <button
            type="button"
            onClick={onSave}
            className="h-[36px] px-4 text-[12.5px] font-medium rounded-lg text-white hover:opacity-90 cursor-pointer transition-colors"
            style={{ backgroundColor: accentColor || 'var(--color-primary)' }}
          >
            Save
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-[36px] px-4 text-[12.5px] font-medium rounded-lg bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-icon-hover-bg)] cursor-pointer transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}