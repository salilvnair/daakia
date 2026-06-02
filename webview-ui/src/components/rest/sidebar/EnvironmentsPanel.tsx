import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { postMsg } from '../../../vscode';
import { useEnvStore, GLOBAL_ENV_ID } from '../../../store/env-store';
import { useTabsStore } from '../../../store/tabs-store';
import { useToastStore } from '../../../store/toast-store';
import { ConfirmDialog, ContextMenu, type ContextMenuItem, ImportExportIcon } from '../../shared';
import { EnvironmentModal } from '../../shared';
import { InfoPopup } from '../../shared/display/InfoPopup';
import { TrashIcon, RenameIcon, CopyIcon, PlusIcon, MoreVerticalIcon, GlobeIcon, CheckCircleFilledIcon, LayersIcon, FolderImportIcon, FolderExportIcon } from '../../../icons';
import { getProtocolAccent } from '../../../colors';

export function EnvironmentsPanel() {
  const activeProtocol = useTabsStore(s => s.activeProtocol);
  const {
    environments,
    activeEnvId,
    addEnvironment,
    removeEnvironment,
    duplicateEnvironment,
    setActiveEnvironment,
    hydrateEnvironments,
    pendingEditEnvId,
    clearPendingEditEnv,
  } = useEnvStore();
  const { activeTabId, updateTab } = useTabsStore();
  const addToast = useToastStore(s => s.addToast);

  const activateEnv = (envId: string | null) => {
    setActiveEnvironment(envId);
    // Sync to the active tab's envId (Global is always merged, so tab gets null or a custom env)
    if (activeTabId) {
      const tabEnvId = envId === GLOBAL_ENV_ID ? null : envId;
      updateTab(activeTabId, { envId: tabEnvId });
    }
  };

  const [search, setSearch] = useState('');
  const [editingEnvId, setEditingEnvId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('Edit Environment');
  const [createdEnvId, setCreatedEnvId] = useState<string | null>(null);
  const [prevActiveEnvId, setPrevActiveEnvId] = useState<string | null>(null);
  const [showDeleteEnvConfirm, setShowDeleteEnvConfirm] = useState<string | null>(null);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ position: { x: number; y: number }; items: ContextMenuItem[]; targetId: string; kind: string } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // React to external request to edit an environment (e.g. from TabBar env icon)
  useEffect(() => {
    if (pendingEditEnvId) {
      setEditingEnvId(pendingEditEnvId);
      setEditingTitle(pendingEditEnvId === GLOBAL_ENV_ID ? 'Edit Global Variables' : 'Edit Environment');
      clearPendingEditEnv();
    }
  }, [pendingEditEnvId, clearPendingEditEnv]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'environmentsData') {
        hydrateEnvironments(msg.environments ?? [], msg.activeEnvId ?? null);
      }
      if (msg.type === 'environmentsImported') {
        if (msg.merge) {
          // Merge imported envs into existing
          const existing = useEnvStore.getState().environments;
          const merged = [...existing];
          for (const env of (msg.environments ?? [])) {
            if (!merged.find(e => e.id === env.id)) {
              merged.push(env);
            }
          }
          hydrateEnvironments(merged, msg.activeEnvId ?? useEnvStore.getState().activeEnvId);
        } else {
          hydrateEnvironments(msg.environments ?? [], msg.activeEnvId ?? null);
        }
        addToast({ type: 'success', message: 'Environments imported.' });
      }
      if (msg.type === 'environmentExported') {
        addToast({ type: 'success', message: msg.message || 'Environment exported.' });
      }
    };

    window.addEventListener('message', handler);
    postMsg({ type: 'getEnvironments' });
    return () => window.removeEventListener('message', handler);
  }, [addToast, hydrateEnvironments]);

  const filteredEnvironments = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return environments;
    }
    return environments.filter(env => env.name.toLowerCase().includes(query));
  }, [environments, search]);

  const globalEnv = filteredEnvironments.find(env => env.id === GLOBAL_ENV_ID);
  const customEnvs = filteredEnvironments.filter(env => env.id !== GLOBAL_ENV_ID && env.id !== createdEnvId);

  const openCreateModal = () => {
    setPrevActiveEnvId(activeEnvId);
    const newId = addEnvironment('New Environment');
    // Restore active env so the list doesn't deselect during editing
    setActiveEnvironment(activeEnvId);
    setCreatedEnvId(newId);
    setEditingEnvId(newId);
    setEditingTitle('New Environment');
  };

  const openEditModal = (envId: string) => {
    setCreatedEnvId(null);
    setEditingEnvId(envId);
    setEditingTitle(envId === GLOBAL_ENV_ID ? 'Edit Environment' : 'Edit Environment');
  };

  const closeModal = () => {
    if (createdEnvId) {
      removeEnvironment(createdEnvId);
      // Restore the previously active environment
      if (prevActiveEnvId) {
        setActiveEnvironment(prevActiveEnvId);
      }
    }
    setCreatedEnvId(null);
    setPrevActiveEnvId(null);
    setEditingEnvId(null);
  };

  const saveModal = () => {
    setCreatedEnvId(null);
    setPrevActiveEnvId(null);
    setEditingEnvId(null);
  };

  const duplicateEnv = (envId: string) => {
    const duplicateId = duplicateEnvironment(envId);
    if (duplicateId) {
      setEditingEnvId(duplicateId);
      setEditingTitle('Edit Environment');
      setCreatedEnvId(null);
    }
  };

  const exportAll = () => {
    postMsg({ type: 'exportEnvironmentsJson', environments, activeEnvId });
  };

  const exportOne = (envId: string) => {
    const env = environments.find(item => item.id === envId);
    if (!env) return;
    postMsg({ type: 'exportEnvironmentsJson', environments: [env], activeEnvId: env.id });
  };

  const handleDeleteEnv = (envId: string) => {
    setShowDeleteEnvConfirm(envId);
  };

  const confirmDeleteEnv = () => {
    if (showDeleteEnvConfirm) {
      removeEnvironment(showDeleteEnvConfirm);
      setShowDeleteEnvConfirm(null);
    }
  };

  const handleDeleteAll = () => {
    const custom = environments.filter(e => e.id !== GLOBAL_ENV_ID);
    custom.forEach(e => removeEnvironment(e.id));
    setShowDeleteAllConfirm(false);
  };

  // Open import/export context menu
  const openImportExportMenu = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const items: ContextMenuItem[] = [
      { id: 'import-postman', label: 'Import from Postman', shortcut: 'P', icon: <FolderImportIcon size={14} /> },
      { id: 'import-insomnia', label: 'Import from Insomnia', shortcut: 'I', icon: <FolderImportIcon size={14} /> },
      { id: 'import-json', label: 'Import JSON', shortcut: 'J', icon: <FolderImportIcon size={14} /> },
      { id: 'sep1', label: '', separator: true },
      { id: 'export-json', label: 'Export as JSON', shortcut: 'E', icon: <FolderExportIcon size={14} /> },
    ];
    setContextMenu({ position: { x: rect.right - 220, y: rect.bottom + 6 }, items, targetId: '', kind: 'importExport' });
  };

  // Open more options context menu
  const openMoreMenu = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const items: ContextMenuItem[] = [
      { id: 'delete-all', label: 'Delete all environments', danger: true, shortcut: 'D', icon: <TrashIcon size={14} /> },
    ];
    setContextMenu({ position: { x: rect.right - 220, y: rect.bottom + 6 }, items, targetId: '', kind: 'more' });
  };

  // Open row-level context menu (on 3-dot click)
  const openRowMenu = (e: React.MouseEvent, envId: string) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const isGlobal = envId === GLOBAL_ENV_ID;
    const items: ContextMenuItem[] = [
      { id: 'edit', label: 'Edit', shortcut: 'E', icon: <RenameIcon size={14} /> },
      ...(!isGlobal ? [{ id: 'duplicate', label: 'Duplicate', shortcut: 'D', icon: <CopyIcon size={14} /> }] : []),
      { id: 'export', label: 'Export as JSON', shortcut: 'X', icon: <FolderExportIcon size={14} /> },
      ...(!isGlobal ? [
        { id: 'sep1', label: '', separator: true },
        { id: 'delete', label: 'Delete', danger: true, shortcut: '⌫', icon: <TrashIcon size={14} /> },
      ] : []),
    ];
    setContextMenu({ position: { x: rect.right - 200, y: rect.bottom + 4 }, items, targetId: envId, kind: 'row' });
  };

  // Handle context menu selection
  const handleContextMenuSelect = useCallback((actionId: string) => {
    if (!contextMenu) return;
    const { targetId, kind } = contextMenu;

    if (kind === 'importExport') {
      switch (actionId) {
        case 'import-postman': postMsg({ type: 'importEnvironmentsPostman' }); break;
        case 'import-insomnia': postMsg({ type: 'importEnvironmentsInsomnia' }); break;
        case 'import-json': postMsg({ type: 'importEnvironmentsJson' }); break;
        case 'export-json': exportAll(); break;
      }
    } else if (kind === 'more') {
      if (actionId === 'delete-all') setShowDeleteAllConfirm(true);
    } else if (kind === 'row') {
      switch (actionId) {
        case 'edit': openEditModal(targetId); break;
        case 'duplicate': duplicateEnv(targetId); break;
        case 'export': exportOne(targetId); break;
        case 'delete': handleDeleteEnv(targetId); break;
      }
    }
    setContextMenu(null);
  }, [contextMenu]);

  return (
    <div className="flex flex-col h-full relative" ref={panelRef}>
      <div className="px-4 py-3 border-b border-[var(--color-surface-border)] text-[13px] text-[var(--color-text-secondary)] flex items-center gap-2">
        <span>Environments</span>
      </div>

      {globalEnv && (
        <div className="px-1 py-1 border-b border-[var(--color-surface-border)]">
          <EnvironmentRow
            env={globalEnv}
            active={false}
            onActivate={() => {}}
            onEdit={() => openEditModal(globalEnv.id)}
            onOpenMenu={(e) => openRowMenu(e, globalEnv.id)}
          />
        </div>
      )}

      <div className="px-3 py-2 border-b border-[var(--color-surface-border)]">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          className="w-full h-[32px] px-3 text-[12px] rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
        />
      </div>

      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-surface-border)]">
        <button
          type="button"
          onClick={openCreateModal}
          className="flex items-center gap-2 text-[13px] text-[var(--color-text-primary)] hover:text-white cursor-pointer"
        >
          <PlusIcon size={14} />
          <span>New</span>
        </button>

        <div className="flex items-center gap-1.5">
          <InfoPopup
            title="Environments"
            description="Global variables are always available in every request. Select an environment to override or add scoped variables."
            items={[
              { code: '{{variable}}', label: 'Use in any request field' },
              { code: '${variable}', label: 'Alternate syntax (same effect)' },
              { code: '$daakia_{x}_$', label: 'Escape: outputs literal {{x}}' },
              { code: '$daakia_$x$_$', label: 'Escape: outputs literal ${x}' },
              { code: 'Global', label: 'Always active, shared across all envs' },
              { code: 'Custom', label: 'Activate to override global values' },
            ]}
            footer="Tip: Variables resolve at send time. Use $daakia_ escape to send raw {{var}} text without resolving."
            wikiSlug="environments"
            accentColor={getProtocolAccent(activeProtocol as any)}
          />
          <button
            type="button"
            title="Import / Export"
            onClick={openImportExportMenu}
            className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-icon-hover-bg)] cursor-pointer transition-colors"
          >
            <ImportExportIcon size="1.1em" />
          </button>
          {customEnvs.length > 0 && (
          <button
            type="button"
            title="More Options"
            onClick={openMoreMenu}
            className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-icon-hover-bg)] cursor-pointer transition-colors"
          >
            <MoreVerticalIcon size={14} />
          </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-1 py-1 space-y-1">
        {customEnvs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center">
            <p className="text-[12px] text-[var(--color-text-muted)] mb-3">No custom environments yet</p>
            <button
              type="button"
              onClick={openCreateModal}
              className="h-[30px] px-3 rounded-md text-white hover:opacity-90 cursor-pointer text-[12px]"
              style={{ backgroundColor: getProtocolAccent(activeProtocol as any) }}
            >
              + New Environment
            </button>
          </div>
        ) : (
          customEnvs.map((env) => (
            <EnvironmentRow
              key={env.id}
              env={env}
              active={activeEnvId === env.id}
              onActivate={() => activateEnv(env.id)}
              onEdit={() => openEditModal(env.id)}
              onOpenMenu={(e) => openRowMenu(e, env.id)}
            />
          ))
        )}
      </div>

      <EnvironmentModal
        open={!!editingEnvId}
        envId={editingEnvId}
        title={editingTitle}
        onSave={saveModal}
        onCancel={closeModal}
        accentColor={getProtocolAccent(activeProtocol)}
      />

      {/* Shared context menu */}
      {contextMenu && (
        <ContextMenu
          items={contextMenu.items}
          position={contextMenu.position}
          onSelect={handleContextMenuSelect}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Delete single env confirm */}
      {showDeleteEnvConfirm && (
        <ConfirmDialog
          title="Delete Environment?"
          message={`This environment and all its variables will be permanently deleted.`}
          confirmLabel="Delete"
          danger
          onConfirm={confirmDeleteEnv}
          onCancel={() => setShowDeleteEnvConfirm(null)}
        />
      )}

      {/* Delete all envs confirm */}
      {showDeleteAllConfirm && (
        <ConfirmDialog
          title="Delete All Environments?"
          message="All custom environments (except Global) will be permanently deleted. This cannot be undone."
          confirmLabel="Delete All"
          danger
          onConfirm={handleDeleteAll}
          onCancel={() => setShowDeleteAllConfirm(false)}
        />
      )}
    </div>
  );
}

function EnvironmentRow({
  env,
  active,
  onActivate,
  onEdit,
  onOpenMenu,
}: {
  env: { id: string; name: string; variables: { id: string }[] };
  active: boolean;
  onActivate: () => void;
  onEdit: () => void;
  onOpenMenu: (e: React.MouseEvent) => void;
}) {
  const isGlobal = env.id === GLOBAL_ENV_ID;

  return (
    <div
      className={`relative group px-2 py-2 rounded-md transition-colors ${active && !isGlobal ? 'bg-[var(--color-item-hover-bg)]' : 'hover:bg-[var(--color-item-hover-bg)]'}`}
      data-context-menu="env"
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onOpenMenu(e); }}
    >
      <div className={`flex items-center gap-3 px-1 ${isGlobal ? '' : 'cursor-pointer'}`} onClick={isGlobal ? undefined : onActivate}>
        <div className="w-5 flex items-center justify-center">
          {isGlobal ? (
            <GlobeIcon size={16} style={{ color: 'var(--color-success)' }} />
          ) : active ? (
            <CheckCircleFilledIcon checked={true} size={14} className="text-[var(--color-success)]" />
          ) : (
            <CheckCircleFilledIcon checked={false} size={14} />
          )}
        </div>
        <span className={`truncate flex-1 text-[13px] ${isGlobal ? 'text-[var(--color-text-primary)] font-medium' : active ? 'text-[var(--color-success)] font-medium' : 'text-[var(--color-text-secondary)]'}`}>
          {env.name}
        </span>
        <div className={`items-center gap-1 ${isGlobal || active ? 'flex' : 'invisible group-hover:visible flex'}`}>
          <MiniIconButton title="Edit" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
            <RenameIcon size={12} />
          </MiniIconButton>
          <MiniIconButton title="More" onClick={(e) => { e.stopPropagation(); onOpenMenu(e); }}>
            <MoreVerticalIcon size={12} />
          </MiniIconButton>
        </div>
      </div>
    </div>
  );
}

function MiniIconButton({ title, onClick, children }: { title: string; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-icon-hover-bg)] cursor-pointer transition-colors"
    >
      {children}
    </button>
  );
}
