import { useState, useRef } from 'react';
import { useEnvStore, type EnvVariable, GLOBAL_ENV_ID } from '../../../store/env-store';
import { PillTabs, StyledDropdown, ConfirmDialog, InsertRowDivider } from '../../shared';
import { TrashIcon, RenameIcon, BulkEditIcon, EyeIcon, EyeOffIcon } from '../../../icons';

interface EnvironmentEditorProps {
  environmentId?: string | null;
  showSelector?: boolean;
  allowRename?: boolean;
  showName?: boolean;
}

export function EnvironmentEditor({ environmentId, showSelector = true, allowRename = true, showName = true }: EnvironmentEditorProps) {
  const {
    environments,
    activeEnvId,
    addEnvironment,
    removeEnvironment,
    renameEnvironment,
    setActiveEnvironment,
    updateVariables,
    addVariable,
    removeVariable,
    updateVariable,
  } = useEnvStore();

  const [activeView, setActiveView] = useState<'variables' | 'secrets'>('variables');
  const [editingName, setEditingName] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showClearVarsConfirm, setShowClearVarsConfirm] = useState(false);
  const [bulkEdit, setBulkEdit] = useState(false);
  const bulkTextRef = useRef('');

  const resolvedEnvId = environmentId ?? activeEnvId;
  const activeEnv = environments.find(e => e.id === resolvedEnvId);
  const nameReadOnly = !allowRename || activeEnv?.id === GLOBAL_ENV_ID;

  // Filter variables by type
  const variables = activeEnv?.variables.filter(v => !v.isSecret) ?? [];
  const secrets = activeEnv?.variables.filter(v => v.isSecret) ?? [];
  const displayedVars = activeView === 'variables' ? variables : secrets;

  const envOptions = environments.map(e => ({ value: e.id, label: e.name }));

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4 py-1">
      {/* Environment selector bar */}
      {showSelector && (
        <div className="flex items-center gap-3">
          <StyledDropdown
            options={envOptions.length ? envOptions : [{ value: '', label: 'No environments' }]}
            value={resolvedEnvId || ''}
            onChange={(v) => setActiveEnvironment(v || null)}
            size="sm"
          />
          <button
            type="button"
            onClick={() => addEnvironment()}
            className="h-[30px] px-3 text-[12px] bg-[var(--color-primary)] text-white rounded-md hover:opacity-90 cursor-pointer font-medium whitespace-nowrap"
          >
            + New
          </button>
          {activeEnv && activeEnv.id !== GLOBAL_ENV_ID && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-error)] cursor-pointer"
              title="Delete environment"
            >
              <TrashIcon size={14} />
            </button>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && activeEnv && (
        <ConfirmDialog
          title="Delete Environment?"
          message={`"${activeEnv.name}" and all its variables will be permanently deleted.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => { removeEnvironment(activeEnv.id); setShowDeleteConfirm(false); }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {!activeEnv ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[12px] text-[var(--color-text-muted)]">
            Create an environment to manage variables and secrets.
          </p>
        </div>
      ) : (
        <>
          {/* Environment name (editable) with pencil icon */}
          {showName && (
          <div className="flex items-center gap-2 px-1">
            {editingName && !nameReadOnly ? (
              <input
                type="text"
                value={activeEnv.name}
                onChange={(e) => renameEnvironment(activeEnv.id, e.target.value)}
                onBlur={() => setEditingName(false)}
                onKeyDown={(e) => e.key === 'Enter' && setEditingName(false)}
                autoFocus
                className="text-[14px] font-semibold bg-transparent border-b-2 border-[var(--color-primary)] text-[var(--color-text-primary)] focus:outline-none px-0 py-0.5"
              />
            ) : (
              <button
                type="button"
                onClick={() => { if (!nameReadOnly) setEditingName(true); }}
                className={`flex items-center gap-2 text-[14px] font-semibold ${nameReadOnly ? 'text-[var(--color-text-primary)] cursor-default' : 'text-[var(--color-primary)] hover:opacity-80 cursor-pointer'}`}
              >
                {activeEnv.name}
                {!nameReadOnly && (
                  <RenameIcon size={13} />
                )}
              </button>
            )}
          </div>
          )}

          {/* Variables / Secrets tabs + Add button */}
          <div className="flex items-center justify-between border-b border-[var(--color-surface-border)]">
            <PillTabs
              tabs={[
                { id: 'variables', label: 'Variables', badge: variables.length },
                { id: 'secrets', label: 'Secrets', badge: secrets.length },
              ]}
              activeTab={activeView}
              onChange={(v) => setActiveView(v as 'variables' | 'secrets')}
              size="sm"
              variant="underline"
            />
            <div className="flex items-center gap-2">
              {displayedVars.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowClearVarsConfirm(true)}
                  className="w-7 h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.08)] cursor-pointer transition-colors"
                  title="Clear all"
                >
                  <TrashIcon size={14} />
                </button>
              )}
              <button
                type="button"
                onClick={() => addVariable(activeEnv.id, activeView === 'secrets')}
                className="text-[11px] px-2.5 py-1 rounded-md bg-[var(--color-primary)] text-white hover:opacity-90 cursor-pointer transition-opacity font-medium"
              >
                + Add
              </button>
            </div>
          </div>

          {/* Clear variables confirm */}
          {showClearVarsConfirm && (
            <ConfirmDialog
              title={`Clear all ${activeView}?`}
              message={`All ${activeView} in this environment will be permanently deleted.`}
              confirmLabel="Clear All"
              danger
              onConfirm={() => {
                const keep = activeEnv.variables.filter(v => activeView === 'variables' ? v.isSecret : !v.isSecret);
                updateVariables(activeEnv.id, keep);
                setShowClearVarsConfirm(false);
              }}
              onCancel={() => setShowClearVarsConfirm(false)}
            />
          )}

          {/* Variables table */}
          <div className="flex-1 overflow-y-auto min-h-0 [scrollbar-gutter:stable]">
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-[12px] text-[var(--color-primary)] font-medium">
                {activeView === 'variables' ? 'Environment Variables' : 'Environment Secrets'}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (!bulkEdit) {
                    // Entering bulk mode: serialize vars to text
                    bulkTextRef.current = displayedVars
                      .map(v => `${v.key}: ${v.initialValue}${v.currentValue && v.currentValue !== v.initialValue ? ' | ' + v.currentValue : ''}`)
                      .join('\n');
                  } else {
                    // Leaving bulk mode: parse text back to vars
                    const lines = bulkTextRef.current.split('\n').filter(l => l.trim());
                    const newVars: EnvVariable[] = lines.map(line => {
                      const [keyPart, ...rest] = line.split(':');
                      const valuePart = rest.join(':').trim();
                      const [initialValue, currentValue] = valuePart.split('|').map(s => s.trim());
                      return {
                        id: crypto.randomUUID(),
                        key: (keyPart || '').trim(),
                        initialValue: initialValue || '',
                        currentValue: currentValue || initialValue || '',
                        isSecret: activeView === 'secrets',
                      };
                    });
                    const keep = activeEnv.variables.filter(v => activeView === 'variables' ? v.isSecret : !v.isSecret);
                    updateVariables(activeEnv.id, [...keep, ...newVars]);
                  }
                  setBulkEdit(!bulkEdit);
                }}
                className={`w-7 h-7 flex items-center justify-center rounded cursor-pointer transition-colors ${
                  bulkEdit
                    ? 'text-[var(--color-primary)] bg-[rgba(99,102,241,0.12)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.06)]'
                }`}
                title="Bulk edit"
              >
                <BulkEditIcon size={14} />
              </button>
            </div>

            {bulkEdit ? (
              <EnvBulkEditArea defaultValue={bulkTextRef.current} textRef={bulkTextRef} />
            ) : (
              <>
                {/* Header */}
                <div className="grid grid-cols-[1fr_1fr_1fr_32px] gap-2 px-1 mb-1.5">
                  <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide font-medium">Variable</div>
                  <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide font-medium">Initial Value</div>
                  <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide font-medium">Current Value</div>
                  <div />
                </div>

                {displayedVars.length === 0 && (
                  <div className="py-6 text-center text-[12px] text-[var(--color-text-muted)]">
                    No {activeView} yet. Click "+ Add" to create one.
                  </div>
                )}

                <div className="flex flex-col gap-0">
                  {displayedVars.map((variable, idx) => (
                    <div key={variable.id}>
                      <div className="py-1">
                        <EnvVariableRow
                          variable={variable}
                          envId={activeEnv.id}
                          onUpdate={updateVariable}
                          onRemove={removeVariable}
                        />
                      </div>
                      <InsertRowDivider onInsert={() => {
                        // Insert a new variable after this position
                        const isSecret = activeView === 'secrets';
                        const newVar: EnvVariable = {
                          id: crypto.randomUUID(),
                          key: '',
                          initialValue: '',
                          currentValue: '',
                          isSecret,
                        };
                        // Get all vars of this type, splice in, and update
                        const allOfType = activeEnv.variables.filter(v => v.isSecret === isSecret);
                        const others = activeEnv.variables.filter(v => v.isSecret !== isSecret);
                        const updated = [...allOfType];
                        updated.splice(idx + 1, 0, newVar);
                        updateVariables(activeEnv.id, [...others, ...updated]);
                      }} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Variable Row ───

function EnvVariableRow({
  variable,
  envId,
  onUpdate,
  onRemove,
}: {
  variable: EnvVariable;
  envId: string;
  onUpdate: (envId: string, varId: string, patch: Partial<EnvVariable>) => void;
  onRemove: (envId: string, varId: string) => void;
}) {
  const [showInitial, setShowInitial] = useState(!variable.isSecret);
  const [showCurrent, setShowCurrent] = useState(!variable.isSecret);

  return (
    <div className="grid grid-cols-[1fr_1fr_1fr_32px] gap-2 px-1 group">
      <div>
        <input
          type="text"
          value={variable.key}
          onChange={(e) => onUpdate(envId, variable.id, { key: e.target.value })}
          placeholder="Variable name"
          className="w-full px-3 py-1.5 rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[12px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] h-[32px]"
        />
      </div>
      <div className="relative">
        <input
          type={variable.isSecret && !showInitial ? 'password' : 'text'}
          value={variable.initialValue}
          onChange={(e) => onUpdate(envId, variable.id, { initialValue: e.target.value })}
          placeholder="Initial value"
          className={`w-full px-3 py-1.5 ${variable.isSecret ? 'pr-7' : ''} rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[12px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] h-[32px]`}
        />
        {variable.isSecret && (
          <button type="button" onClick={() => setShowInitial(!showInitial)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer">
            <LocalEyeIcon open={showInitial} />
          </button>
        )}
      </div>
      <div className="relative">
        <input
          type={variable.isSecret && !showCurrent ? 'password' : 'text'}
          value={variable.currentValue}
          onChange={(e) => onUpdate(envId, variable.id, { currentValue: e.target.value })}
          placeholder="Current value"
          className={`w-full px-3 py-1.5 ${variable.isSecret ? 'pr-7' : ''} rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[12px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] h-[32px]`}
        />
        {variable.isSecret && (
          <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer">
            <LocalEyeIcon open={showCurrent} />
          </button>
        )}
      </div>
      <div className="flex items-center justify-center">
        <button
          type="button"
          onClick={() => onRemove(envId, variable.id)}
          className="opacity-0 group-hover:opacity-100 p-1 text-[var(--color-text-muted)] hover:text-[var(--color-error)] cursor-pointer transition-all"
          title="Remove"
        >
          <TrashIcon size={13} />
        </button>
      </div>
    </div>
  );
}

function LocalEyeIcon({ open }: { open: boolean }) {
  return open ? <EyeIcon size={12} /> : <EyeOffIcon size={12} />;
}

// ─── Bulk Edit Textarea ───

function EnvBulkEditArea({ defaultValue, textRef }: { defaultValue: string; textRef: React.MutableRefObject<string> }) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="text-[11px] text-[var(--color-text-muted)] mb-1.5 px-1">
        Format: <code className="text-[10px] bg-[rgba(255,255,255,0.06)] px-1 py-0.5 rounded">key: initialValue | currentValue</code>
      </div>
      <textarea
        defaultValue={defaultValue}
        onChange={(e) => { textRef.current = e.target.value; }}
        className="flex-1 min-h-[120px] w-full px-3 py-2 rounded-md bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[13px] font-mono text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] resize-none"
        placeholder={`baseUrl: https://api.example.com\napiKey: secret123 | prod-key-456`}
        spellCheck={false}
      />
    </div>
  );
}
