import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { postMsg } from '../../../vscode';
import { useEnvStore, GLOBAL_ENV_ID } from '../../../store/env-store';
import { useTabsStore } from '../../../store/tabs-store';
import { useToastStore } from '../../../store/toast-store';
import { ConfirmDialog, ImportExportIcon } from '../../shared';
import { EnvironmentModal } from '../../shared';
import { TrashIcon, RenameIcon, CopyIcon, PlusIcon, MoreVerticalIcon, GlobeIcon, CheckCircleFilledIcon, FolderImportIcon, FolderExportIcon, SearchIcon, HelpCircleIcon } from '../../../icons';
import { getProtocolAccent } from '../../../colors';
import { IconButtonView, TextInputView, ContextMenuView, InfoPopupView, ButtonView, type ContextMenuItem as DuiContextMenuItem } from '../../../dui';

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
  const [infoOpen, setInfoOpen] = useState(false);
  const infoAnchorRef = useRef<HTMLDivElement>(null);
  const [headerMenu, setHeaderMenu] = useState<{ kind: 'importExport' | 'more'; x: number; y: number } | null>(null);
  const [rowMenu, setRowMenu] = useState<{ position: { x: number; y: number }; envId: string } | null>(null);

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

  const duplicateEnv = useCallback((envId: string) => {
    const duplicateId = duplicateEnvironment(envId);
    if (duplicateId) {
      setEditingEnvId(duplicateId);
      setEditingTitle('Edit Environment');
      setCreatedEnvId(null);
    }
  }, [duplicateEnvironment]);

  const exportAll = useCallback(() => {
    postMsg({ type: 'exportEnvironmentsJson', environments, activeEnvId });
  }, [environments, activeEnvId]);

  const exportOne = useCallback((envId: string) => {
    const env = environments.find(item => item.id === envId);
    if (!env) return;
    postMsg({ type: 'exportEnvironmentsJson', environments: [env], activeEnvId: env.id });
  }, [environments]);

  const handleDeleteEnv = (envId: string) => setShowDeleteEnvConfirm(envId);

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

  const openRowMenu = (e: React.MouseEvent, envId: string) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setRowMenu({ position: { x: rect.right - 200, y: rect.bottom + 4 }, envId });
  };

  const buildRowMenuItems = useCallback((envId: string): DuiContextMenuItem[] => {
    const isGlobal = envId === GLOBAL_ENV_ID;

    if (isGlobal) {
      return [
        { id: 'edit', label: 'Edit', shortcut: 'E', icon: <RenameIcon size={14} style={{ color: 'var(--color-ctx-rename)' }} />, onClick: () => { openEditModal(envId); setRowMenu(null); } },
        { id: 'sep-import', label: '', separator: true },
        { id: 'import-postman',  label: 'Import from Postman',  shortcut: 'P', icon: <FolderImportIcon size={14} style={{ color: 'var(--color-info)' }} />, onClick: () => { postMsg({ type: 'importEnvironmentsPostman' }); setRowMenu(null); } },
        { id: 'import-insomnia', label: 'Import from Insomnia', shortcut: 'I', icon: <FolderImportIcon size={14} style={{ color: 'var(--color-info)' }} />, onClick: () => { postMsg({ type: 'importEnvironmentsInsomnia' }); setRowMenu(null); } },
        { id: 'import-json',     label: 'Import Daakia JSON',   shortcut: 'J', icon: <FolderImportIcon size={14} style={{ color: 'var(--color-info)' }} />, onClick: () => { postMsg({ type: 'importEnvironmentsJson' }); setRowMenu(null); } },
        { id: 'import-dotenv',   label: 'Import .env file',     shortcut: '.', icon: <FolderImportIcon size={14} style={{ color: 'var(--color-info)' }} />, onClick: () => { postMsg({ type: 'importEnvironmentsDotEnv' }); setRowMenu(null); } },
        { id: 'sep-export', label: '', separator: true },
        { id: 'export', label: 'Export as JSON', shortcut: 'X', icon: <FolderExportIcon size={14} style={{ color: 'var(--color-warning)' }} />, onClick: () => { exportOne(envId); setRowMenu(null); } },
      ] as DuiContextMenuItem[];
    }

    return [
      { id: 'edit',      label: 'Edit',           shortcut: 'E', icon: <RenameIcon size={14} style={{ color: 'var(--color-ctx-rename)' }} />,     onClick: () => { openEditModal(envId); setRowMenu(null); } },
      { id: 'duplicate', label: 'Duplicate',       shortcut: 'D', icon: <CopyIcon size={14} style={{ color: 'var(--color-ctx-duplicate)' }} />,  onClick: () => { duplicateEnv(envId); setRowMenu(null); } },
      { id: 'export',    label: 'Export as JSON',  shortcut: 'X', icon: <FolderExportIcon size={14} style={{ color: 'var(--color-warning)' }} />, onClick: () => { exportOne(envId); setRowMenu(null); } },
      { id: 'sep1', label: '', separator: true },
      { id: 'delete', label: 'Delete', danger: true, shortcut: '⌫', icon: <TrashIcon size={14} />, onClick: () => { handleDeleteEnv(envId); setRowMenu(null); } },
    ] as DuiContextMenuItem[];
  }, [duplicateEnv, exportOne]);

  return (
    <div className="flex flex-col h-full relative">
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
        <TextInputView
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          size="sm"
          width="fw"
          iconLeft={<SearchIcon size={13} style={{ color: 'var(--color-text-muted)' }} />}
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

        <div className="flex items-center gap-1">
          <div ref={infoAnchorRef} style={{ display: 'inline-flex' }}>
            <IconButtonView
              icon={<HelpCircleIcon size={14} />}
              size="sm"
              tooltip="About Environments"
              active={infoOpen}
              style={{ borderRadius: '50%' }}
              onClick={() => setInfoOpen(o => !o)}
            />
          </div>
          <InfoPopupView
            open={infoOpen}
            onClose={() => setInfoOpen(false)}
            anchorEl={infoAnchorRef.current}
            title="Environments"
            description="Global variables are always available in every request. Select an environment to override or add scoped variables."
            items={[
              { code: '{{variable}}', description: 'Use in any request field' },
              { code: '${variable}', description: 'Alternate syntax (same effect)' },
              { code: '$daakia_{x}_$', description: 'Escape: outputs literal {{x}}' },
              { code: 'Global', description: 'Always active, shared across all envs' },
              { code: 'Custom', description: 'Activate to override global values' },
            ]}
            footer="Tip: Variables resolve at send time. Use $daakia_ escape to send raw {{var}} text without resolving."
            width={320}
          />

          <IconButtonView
            icon={<ImportExportIcon size="1.1em" />}
            size="sm"
            tooltip="Import / Export"
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setHeaderMenu(headerMenu?.kind === 'importExport' ? null : { kind: 'importExport', x: rect.right, y: rect.bottom + 4 });
            }}
          />

          {customEnvs.length > 0 && (
            <IconButtonView
              icon={<MoreVerticalIcon size={14} />}
              size="sm"
              tooltip="More Options"
              onClick={(e) => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setHeaderMenu(headerMenu?.kind === 'more' ? null : { kind: 'more', x: rect.right, y: rect.bottom + 4 });
              }}
            />
          )}
        </div>
      </div>

      {/* Import/Export context menu */}
      <ContextMenuView
        open={headerMenu?.kind === 'importExport'}
        anchorEl={null}
        position={headerMenu?.kind === 'importExport' ? { x: headerMenu.x - 220, y: headerMenu.y } : undefined}
        onClose={() => setHeaderMenu(null)}
        items={[
          { id: 'import-postman',  label: 'Import from Postman',      shortcut: 'P', icon: <FolderImportIcon size={14} style={{ color: 'var(--color-info)' }} />, onClick: () => { postMsg({ type: 'importEnvironmentsPostman' }); setHeaderMenu(null); } },
          { id: 'import-insomnia', label: 'Import from Insomnia',     shortcut: 'I', icon: <FolderImportIcon size={14} style={{ color: 'var(--color-info)' }} />, onClick: () => { postMsg({ type: 'importEnvironmentsInsomnia' }); setHeaderMenu(null); } },
          { id: 'import-json',     label: 'Import Daakia JSON',       shortcut: 'J', icon: <FolderImportIcon size={14} style={{ color: 'var(--color-info)' }} />, onClick: () => { postMsg({ type: 'importEnvironmentsJson' }); setHeaderMenu(null); } },
          { id: 'import-dotenv',   label: 'Import .env file',         shortcut: '.', icon: <FolderImportIcon size={14} style={{ color: 'var(--color-info)' }} />, onClick: () => { postMsg({ type: 'importEnvironmentsDotEnv' }); setHeaderMenu(null); } },
          { id: 'sep1', label: '', separator: true },
          { id: 'export-json',     label: 'Export as Daakia JSON',    shortcut: 'E', icon: <FolderExportIcon size={14} style={{ color: 'var(--color-warning)' }} />, onClick: () => { exportAll(); setHeaderMenu(null); } },
          { id: 'export-postman',  label: 'Export as Postman',        shortcut: 'M', icon: <FolderExportIcon size={14} style={{ color: 'var(--color-warning)' }} />, onClick: () => { postMsg({ type: 'exportEnvironmentsPostman', environments, activeEnvId }); setHeaderMenu(null); } },
          { id: 'export-bruno',    label: 'Export as Bruno .env',     shortcut: 'B', icon: <FolderExportIcon size={14} style={{ color: 'var(--color-warning)' }} />, onClick: () => { postMsg({ type: 'exportEnvironmentsBruno', environments, activeEnvId }); setHeaderMenu(null); } },
          { id: 'export-insomnia', label: 'Export as Insomnia',       shortcut: 'N', icon: <FolderExportIcon size={14} style={{ color: 'var(--color-warning)' }} />, onClick: () => { postMsg({ type: 'exportEnvironmentsInsomnia', environments, activeEnvId }); setHeaderMenu(null); } },
          { id: 'export-httpie',   label: 'Export as HTTPie session',  shortcut: 'H', icon: <FolderExportIcon size={14} style={{ color: 'var(--color-warning)' }} />, onClick: () => { postMsg({ type: 'exportEnvironmentsHttpie', environments, activeEnvId }); setHeaderMenu(null); } },
        ] as DuiContextMenuItem[]}
      />

      {/* More options context menu */}
      <ContextMenuView
        open={headerMenu?.kind === 'more'}
        anchorEl={null}
        position={headerMenu?.kind === 'more' ? { x: headerMenu.x - 220, y: headerMenu.y } : undefined}
        onClose={() => setHeaderMenu(null)}
        items={[
          { id: 'delete-all', label: 'Delete all environments', danger: true, shortcut: 'D', icon: <TrashIcon size={14} style={{ color: 'var(--color-error)' }} />, onClick: () => { setShowDeleteAllConfirm(true); setHeaderMenu(null); } },
        ] as DuiContextMenuItem[]}
      />

      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-1 py-1 space-y-1">
        {customEnvs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center">
            <p className="text-[12px] text-[var(--color-text-muted)] mb-3">No custom environments yet</p>
            <ButtonView
              size="md"
              accentColor={getProtocolAccent(activeProtocol as any)}
              onClick={openCreateModal}
            >
              + New Environment
            </ButtonView>
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

      {/* Row-level context menu */}
      {rowMenu && (
        <ContextMenuView
          open={true}
          anchorEl={null}
          position={rowMenu.position}
          onClose={() => setRowMenu(null)}
          items={buildRowMenuItems(rowMenu.envId)}
        />
      )}

      <EnvironmentModal
        open={!!editingEnvId}
        envId={editingEnvId}
        title={editingTitle}
        onSave={saveModal}
        onCancel={closeModal}
        accentColor={getProtocolAccent(activeProtocol)}
      />

      {showDeleteEnvConfirm && (
        <ConfirmDialog
          title="Delete Environment?"
          message="This environment and all its variables will be permanently deleted."
          confirmLabel="Delete"
          danger
          onConfirm={confirmDeleteEnv}
          onCancel={() => setShowDeleteEnvConfirm(null)}
        />
      )}

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
          <IconButtonView
            icon={<RenameIcon size={12} />}
            size="sm"
            tooltip="Edit"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
          />
          <IconButtonView
            icon={<MoreVerticalIcon size={12} />}
            size="sm"
            tooltip="More"
            onClick={(e) => { e.stopPropagation(); onOpenMenu(e); }}
          />
        </div>
      </div>
    </div>
  );
}

