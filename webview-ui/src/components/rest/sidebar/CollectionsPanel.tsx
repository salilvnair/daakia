import { useState, useEffect, useRef, useCallback } from 'react';
import { postMsg } from '../../../vscode';
import { useTabsStore } from '../../../store/tabs-store';
import { useScrollRestore } from '../../../hooks/useScrollRestore';
import { useToastStore } from '../../../store/toast-store';
import { useSidebarDataStore } from '../../../store/sidebar-data-store';
import { NewItemModal, ConfirmDialog, RunCollectionModal, CollectionPropertiesModal, ContextMenu, ImportExportIcon, type CollectionProperties, type ContextMenuItem } from '../../shared';
import { findNodeById, findParentOfRequest, findRequestById, filterTree, collectAllIds, hasAnyRequests, openCollectionRequest, type CollectionTreeNode, type CollectionRequest } from '../../../services/collections';
import { METHOD_COLORS, getProtocolAccent } from '../../../colors';
import { PlusIcon, FolderIcon, FolderOpenIcon, PlayIcon, DocumentIcon, ServerIcon, RenameIcon, CopyIcon, SettingsIcon, TrashIcon, ExternalLinkIcon, PlusSquareIcon, ChevronRightIcon, MoreVerticalIcon, FilePlusIcon, FolderPlusIcon, FolderImportIcon, FolderExportIcon, ProtocolRestBadge, ProtocolGraphQLBadge, ProtocolRealtimeBadge, ProtocolGrpcBadge, ProtocolSoapBadge, ProtocolAiBadge, ProtocolMcpBadge } from '../../../icons';
import { InfoPopup } from '../../shared/display/InfoPopup';
import { SidebarSkeleton } from '../../shared/display/SidebarSkeleton';

// ────────────── Main Component ──────────────

function ProtocolHeaderIcon({ protocol }: { protocol: string }) {
  const size = 20;
  if (protocol === 'graphql') return <ProtocolGraphQLBadge size={size} />;
  if (protocol === 'grpc') return <ProtocolGrpcBadge size={size} />;
  if (protocol === 'soap') return <ProtocolSoapBadge size={size} />;
  if (protocol === 'ai') return <ProtocolAiBadge size={size} />;
  if (protocol === 'mcp') return <ProtocolMcpBadge size={size} />;
  if (protocol === 'websocket' || protocol === 'sse' || protocol === 'mqtt' || protocol === 'socketio') return <ProtocolRealtimeBadge size={size} />;
  return <ProtocolRestBadge size={size} />;
}

export function CollectionsPanel({ protocol = 'rest' }: { protocol?: string }) {
  const cachedTree = useSidebarDataStore(s => s.getCollections(protocol));
  const isLoaded = useSidebarDataStore(s => s.isCollectionsLoaded(protocol));
  const setStoreCollections = useSidebarDataStore(s => s.setCollections);
  const [tree, setTree] = useState<CollectionTreeNode[]>(cachedTree);
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalParentId, setModalParentId] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<'collection' | 'folder' | 'request'>('collection');

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingType, setRenamingType] = useState<'collection' | 'request'>('collection');
  const [renameValue, setRenameValue] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; type: 'collection' | 'request'; name: string } | null>(null);

  // Drag and drop state
  const [dragItem, setDragItem] = useState<{ id: string; type: 'collection' | 'request'; parentId: string | null } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'before' | 'inside' | 'after' } | null>(null);

  // Runner modal state
  const [runnerCollectionId, setRunnerCollectionId] = useState<string | null>(null);
  const [runnerCollectionName, setRunnerCollectionName] = useState('');

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ position: { x: number; y: number }; items: ContextMenuItem[]; targetId: string; targetType: 'collection' | 'request'; targetName: string } | null>(null);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const addToast = useToastStore((s) => s.addToast);

  // Properties modal state
  const [propertiesTarget, setPropertiesTarget] = useState<{ id: string; name: string; properties: CollectionProperties } | null>(null);
  const propertiesRequestedRef = useRef(false);
  const [headerMenu, setHeaderMenu] = useState<{ kind: 'importExport' | 'more'; x: number; y: number } | null>(null);

  // Scroll position persistence
  const scrollRef = useScrollRestore(`collections.${protocol}`);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'collectionsData') {
        // Only process responses matching this panel's protocol
        if (msg.protocol && msg.protocol !== protocol) return;
        const data = msg.collections ?? [];
        setTree(data);
        setStoreCollections(protocol, data);
      }
      if (msg.type === 'collectionPropertiesData') {
        // Only open modal if user explicitly requested properties via context menu
        if (!propertiesRequestedRef.current) return;
        propertiesRequestedRef.current = false;
        const props = msg.properties ?? {};
        setPropertiesTarget({
          id: msg.id,
          name: propertiesTarget?.name || '',
          properties: {
            headers: props.headers ?? [],
            authType: props.authType ?? 'none',
            authData: props.authData ?? {},
            variables: props.variables ?? [],
            preRequestScript: props.preRequestScript ?? '',
            postResponseScript: props.postResponseScript ?? (props.testScript as string) ?? '',
          },
        });
      }
    };
    window.addEventListener('message', handler);
    // Only fetch from DB if never loaded before
    if (!isLoaded) {
      postMsg({ type: 'getCollections', protocol });
    }
    return () => window.removeEventListener('message', handler);
  }, [protocol]);

  useEffect(() => {
    if (renamingId && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renamingId]);

  // Sync local tree state from store cache (handles updates from other panels)
  useEffect(() => {
    setTree(cachedTree);
  }, [cachedTree]);

  // headerMenu close is handled by ContextMenu's onClose

  // Helper to include protocol in all collection messages
  const postCollMsg = (msg: Record<string, unknown>) => postMsg({ ...msg, protocol });

  // ── Actions ──

  const openNewCollection = () => {
    setModalMode('collection');
    setModalTitle('New Collection');
    setModalParentId(null);
    setModalOpen(true);
  };

  const handleDeleteAllCollections = () => {
    postCollMsg({ type: 'clearCollections' });
    setShowDeleteAllConfirm(false);
  };

  const openNewFolder = (parentId: string) => {
    setModalMode('folder');
    setModalTitle('New Folder');
    setModalParentId(parentId);
    setModalOpen(true);
  };

  const openNewRequest = (parentId: string) => {
    setModalMode('request');
    setModalTitle('New Request');
    setModalParentId(parentId);
    setModalOpen(true);
  };

  const handleModalSave = (name: string) => {
    const id = crypto.randomUUID();
    if (modalMode === 'request') {
      postCollMsg({
        type: 'saveRequestToCollection',
        collectionId: modalParentId,
        request: {
          id,
          name,
          method: 'GET',
          url: '',
          data: JSON.stringify({
            headers: [],
            params: [],
            bodyMode: 'none',
            bodyRaw: '',
            bodyFormData: [],
            bodyUrlEncoded: [],
            authType: 'none',
            authData: {},
          }),
        },
      });
      // Also open in a tab
      const { addTab } = useTabsStore.getState();
      addTab({ name, method: 'GET', url: '', collectionId: modalParentId ?? undefined, requestId: id });
    } else {
      postCollMsg({ type: 'createCollection', id, name, parentId: modalParentId });
      setExpandedIds(prev => new Set([...prev, id]));
    }
    setModalOpen(false);
  };

  const handleRename = (id: string) => {
    if (renameValue.trim()) {
      if (renamingType === 'request') {
        postCollMsg({ type: 'renameRequest', id, name: renameValue.trim() });
      } else {
        postCollMsg({ type: 'renameCollection', id, name: renameValue.trim() });
      }
    }
    setRenamingId(null);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'collection') {
      postCollMsg({ type: 'deleteCollection', id: deleteTarget.id });
    } else {
      postCollMsg({ type: 'deleteRequestFromCollection', requestId: deleteTarget.id });
    }
    setDeleteTarget(null);
  };

  const handleOpenRequest = (req: CollectionRequest, forceNewTab = false) => {
    openCollectionRequest(req, forceNewTab, protocol);
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startRename = (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(id);
    setRenameValue(name);
  };

  // ── Drag and Drop Handlers ──

  const handleDragStart = (e: React.DragEvent, id: string, type: 'collection' | 'request', parentId: string | null) => {
    setDragItem({ id, type, parentId });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string, targetType: 'collection' | 'request') => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragItem || dragItem.id === targetId) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

    let position: 'before' | 'inside' | 'after';
    if (targetType === 'collection') {
      // Collections can accept items inside them
      if (y < height * 0.25) position = 'before';
      else if (y > height * 0.75) position = 'after';
      else position = 'inside';
    } else {
      // Requests can only be reordered (before/after)
      position = y < height * 0.5 ? 'before' : 'after';
    }

    setDropTarget({ id: targetId, position });
  };

  const handleDragLeave = () => {
    setDropTarget(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragItem || !dropTarget) { setDragItem(null); setDropTarget(null); return; }

    const { id: dragId, type: dragType, parentId: dragParentId } = dragItem;
    const { id: targetId, position } = dropTarget;

    if (dragType === 'collection') {
      if (position === 'inside') {
        // Move collection into target collection
        postCollMsg({ type: 'moveCollection', id: dragId, parentId: targetId });
      } else {
        // Reorder: find siblings of target, insert dragId before/after targetId
        const targetNode = findNodeById(tree, targetId);
        const targetParentId = targetNode?.parent_id ?? null;

        // Move to same parent first if different
        if (dragParentId !== targetParentId) {
          postCollMsg({ type: 'moveCollection', id: dragId, parentId: targetParentId });
        }

        // Get siblings at target level
        const siblings = targetParentId
          ? findNodeById(tree, targetParentId)?.children ?? []
          : tree;
        const siblingIds = siblings.map(s => s.id).filter(id => id !== dragId);
        const targetIdx = siblingIds.indexOf(targetId);
        const insertIdx = position === 'after' ? targetIdx + 1 : targetIdx;
        siblingIds.splice(insertIdx, 0, dragId);
        postCollMsg({ type: 'reorderCollections', ids: siblingIds });
      }
    } else {
      // Dragging a request
      const targetNode = findNodeById(tree, targetId);
      if (targetNode) {
        // Dropped on a collection — move request into it
        if (position === 'inside') {
          postCollMsg({ type: 'moveRequest', requestId: dragId, collectionId: targetId });
        } else {
          // Move request to target's parent collection
          postCollMsg({ type: 'moveRequest', requestId: dragId, collectionId: targetNode.id });
        }
      } else {
        // Dropped on another request — reorder within same collection
        const parentNode = findParentOfRequest(tree, targetId);
        if (parentNode) {
          const reqIds = parentNode.requests.map(r => r.id).filter(id => id !== dragId);
          const targetIdx = reqIds.indexOf(targetId);
          const insertIdx = position === 'after' ? targetIdx + 1 : targetIdx;
          reqIds.splice(insertIdx, 0, dragId);
          // Move to the same collection if needed
          if (dragParentId !== parentNode.id) {
            postCollMsg({ type: 'moveRequest', requestId: dragId, collectionId: parentNode.id });
          }
          postCollMsg({ type: 'reorderRequests', ids: reqIds });
        }
      }
    }

    setDragItem(null);
    setDropTarget(null);
  };

  const handleDragEnd = () => {
    setDragItem(null);
    setDropTarget(null);
  };

  // ── Context Menu Handlers ──

  const openCollectionContextMenu = (e: React.MouseEvent, node: CollectionTreeNode) => {
    e.preventDefault();
    e.stopPropagation();
    const items: ContextMenuItem[] = [
      { id: 'new-request', label: 'New Request', shortcut: 'Q', icon: <PlusIcon />, iconColor: 'var(--color-success)' },
      { id: 'new-folder', label: 'New Folder', shortcut: 'F', icon: <FolderIcon />, iconColor: 'var(--color-warning)' },
      { id: 'sep1', label: '', separator: true },
      { id: 'run', label: 'Run Collection', shortcut: 'R', icon: <PlayIcon />, iconColor: 'var(--color-success)', disabled: !hasAnyRequests(node) },
      { id: 'sep2', label: '', separator: true },
      { id: 'documentation', label: 'Documentation', disabled: true, icon: <DocumentIcon />, iconColor: 'var(--color-info)' },
      { id: 'mock-server', label: 'Configure Mock Server', disabled: true, icon: <ServerIcon />, iconColor: 'var(--color-mock-server)' },
      { id: 'sep3', label: '', separator: true },
      { id: 'rename', label: 'Rename', shortcut: 'N', icon: <RenameIcon />, iconColor: 'var(--color-ctx-rename)' },
      { id: 'duplicate', label: 'Duplicate', shortcut: 'D', icon: <CopyIcon />, iconColor: 'var(--color-ctx-duplicate)' },
      { id: 'export', label: 'Export', disabled: true, shortcut: 'X', icon: <FolderExportIcon />, iconColor: 'var(--color-warning)' },
      { id: 'properties', label: 'Properties', shortcut: 'P', icon: <SettingsIcon />, iconColor: 'var(--color-text-muted)' },
      { id: 'sep4', label: '', separator: true },
      { id: 'delete', label: 'Delete', danger: true, shortcut: '⌫', icon: <TrashIcon /> },
    ];
    setContextMenu({ position: { x: e.clientX, y: e.clientY }, items, targetId: node.id, targetType: 'collection', targetName: node.name });
  };

  const openRequestContextMenu = (e: React.MouseEvent, req: CollectionRequest) => {
    e.preventDefault();
    e.stopPropagation();
    const items: ContextMenuItem[] = [
      { id: 'open', label: 'Open', shortcut: 'O', icon: <ExternalLinkIcon />, iconColor: 'var(--color-info)' },
      { id: 'open-new-tab', label: 'Open in New Tab', shortcut: 'T', icon: <PlusSquareIcon />, iconColor: 'var(--color-success)' },
      { id: 'rename', label: 'Rename', shortcut: 'N', icon: <RenameIcon />, iconColor: 'var(--color-ctx-rename)' },
      { id: 'duplicate', label: 'Duplicate', shortcut: 'D', icon: <CopyIcon />, iconColor: 'var(--color-ctx-duplicate)' },
      { id: 'sep1', label: '', separator: true },
      { id: 'documentation', label: 'Documentation', disabled: true, icon: <DocumentIcon />, iconColor: 'var(--color-info)' },
      { id: 'sep2', label: '', separator: true },
      { id: 'delete', label: 'Delete', danger: true, shortcut: '⌫', icon: <TrashIcon /> },
    ];
    setContextMenu({ position: { x: e.clientX, y: e.clientY }, items, targetId: req.id, targetType: 'request', targetName: req.name });
  };

  const handleContextMenuSelect = useCallback((actionId: string) => {
    if (!contextMenu) return;
    const { targetId, targetType, targetName } = contextMenu;
    switch (actionId) {
      case 'new-request':
        openNewRequest(targetId);
        break;
      case 'new-folder':
        openNewFolder(targetId);
        break;
      case 'run':
        setRunnerCollectionId(targetId);
        setRunnerCollectionName(targetName);
        break;
      case 'rename':
        setRenamingId(targetId);
        setRenameValue(targetName);
        setRenamingType(targetType === 'request' ? 'request' : 'collection');
        break;
      case 'properties':
        propertiesRequestedRef.current = true;
        setPropertiesTarget({
          id: targetId,
          name: targetName,
          properties: { headers: [], authType: 'none', authData: {}, variables: [], preRequestScript: '', postResponseScript: '' },
        });
        postMsg({ type: 'getCollectionProperties', id: targetId });
        break;
      case 'delete':
        if (targetType === 'collection') {
          setDeleteTarget({ id: targetId, type: 'collection', name: targetName });
        } else {
          setDeleteTarget({ id: targetId, type: 'request', name: targetName });
        }
        break;
      case 'duplicate':
        if (targetType === 'collection') {
          postCollMsg({ type: 'duplicateCollection', id: targetId });
        } else {
          postCollMsg({ type: 'duplicateRequest', id: targetId });
        }
        break;
      case 'open':
        // For requests, find and open
        const req = findRequestById(tree, targetId);
        if (req) handleOpenRequest(req);
        break;
      case 'open-new-tab':
        const req2 = findRequestById(tree, targetId);
        if (req2) handleOpenRequest(req2, true);
        break;
    }
    setContextMenu(null);
  }, [contextMenu, tree]);

  const filteredTree = filterTree(tree, search);

  // Auto-expand when searching
  useEffect(() => {
    if (search) {
      setExpandedIds(collectAllIds(filteredTree));
    }
  }, [search]);

  return (
    <div className="flex flex-col h-full">
      {/* Header label */}
      <div className="px-4 py-3 border-b border-[var(--color-surface-border)] text-[13px] text-[var(--color-text-secondary)] flex items-center gap-2">
        <span className="flex-shrink-0" style={{ color: getProtocolAccent(protocol as any) }}>
          <ProtocolHeaderIcon protocol={protocol} />
        </span>
        <span>Collections</span>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-[var(--color-surface-border)]">
        <input
          type="text"
          placeholder="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-[32px] px-3 text-[12px] rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
        />
      </div>

      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-surface-border)]">
        <button
          type="button"
          onClick={openNewCollection}
          className="flex items-center gap-2 text-[13px] text-[var(--color-text-primary)] hover:text-white cursor-pointer"
        >
          <PlusIcon size={14} />
          <span>New</span>
        </button>

        <div className="flex items-center gap-1.5 relative">
          <InfoPopup
            title="Collections"
            description="Organize your API requests into folders and collections. Right-click for context menu options."
            items={[
              { code: '+ New', label: 'Create requests or folders' },
              { code: 'Drag & Drop', label: 'Reorder items freely' },
              { code: 'Right-click', label: 'Rename, duplicate, delete' },
              { code: 'Run', label: 'Execute all requests in order' },
            ]}
            footer="Tip: Group related endpoints into folders for easy navigation."
            wikiSlug="collections"
            accentColor={getProtocolAccent(protocol as any)}
          />
          <button
            type="button"
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setHeaderMenu(headerMenu?.kind === 'importExport' ? null : { kind: 'importExport', x: rect.right, y: rect.bottom + 4 });
            }}
            className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-icon-hover-bg)] cursor-pointer transition-colors"
            title="Import / Export"
          >
            <ImportExportIcon size="1.1em" />
          </button>

          {tree.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setHeaderMenu(headerMenu?.kind === 'more' ? null : { kind: 'more', x: rect.right, y: rect.bottom + 4 });
            }}
            className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-icon-hover-bg)] cursor-pointer transition-colors"
            title="More Options"
          >
            <MoreVerticalIcon size={14} />
          </button>
          )}
          {headerMenu?.kind === 'importExport' && (
            <ContextMenu
              position={{ x: headerMenu.x, y: headerMenu.y }}
              items={[
                { id: 'import-postman', label: 'Import from Postman', shortcut: 'P', icon: <FolderImportIcon size={14} />, iconColor: '#f97316' },
                { id: 'import-openapi', label: 'Import from OpenAPI', shortcut: 'O', icon: <FolderImportIcon size={14} />, iconColor: '#22c55e' },
                { id: 'import-bruno', label: 'Import from Bruno', shortcut: 'B', icon: <FolderImportIcon size={14} />, iconColor: '#eab308' },
                { id: 'import-insomnia', label: 'Import from Insomnia', shortcut: 'I', icon: <FolderImportIcon size={14} />, iconColor: '#a78bfa' },
                { id: 'import-har', label: 'Import from HAR', shortcut: 'H', icon: <FolderImportIcon size={14} />, iconColor: '#06b6d4' },
                { id: 'sep1', label: '', separator: true },
                { id: 'export-json', label: 'Export as JSON', shortcut: 'E', icon: <FolderExportIcon size={14} />, iconColor: '#3b82f6' },
              ]}
              onSelect={(id) => {
                if (id === 'import-postman' || id === 'import-openapi' || id === 'import-har') postMsg({ type: 'importCollectionRequest' });
                else if (id === 'import-bruno') postMsg({ type: 'importBrunoRequest' });
                else if (id === 'import-insomnia') addToast({ type: 'info', message: 'Collection import from Insomnia is not implemented yet.' });
                else if (id === 'export-json') addToast({ type: 'info', message: 'Collection export as JSON is not implemented yet.' });
                setHeaderMenu(null);
              }}
              onClose={() => setHeaderMenu(null)}
            />
          )}
          {headerMenu?.kind === 'more' && (
            <ContextMenu
              position={{ x: headerMenu.x, y: headerMenu.y }}
              items={[
                { id: 'delete-all', label: 'Delete all collections', danger: true, shortcut: 'D', icon: <TrashIcon size={14} /> },
              ]}
              onSelect={() => { setShowDeleteAllConfirm(true); setHeaderMenu(null); }}
              onClose={() => setHeaderMenu(null)}
            />
          )}
        </div>
      </div>

      {/* Tree */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-1" data-context-menu="collection-tree" onContextMenu={(e) => e.preventDefault()}>
        {!isLoaded ? (
          <SidebarSkeleton rows={7} />
        ) : filteredTree.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center">
            <FolderIcon size={40} strokeWidth={1} className="text-[var(--color-text-muted)] opacity-40 mb-3" />
            <p className="text-[12px] text-[var(--color-text-muted)] mb-3">No collections yet</p>
            <button
              type="button"
              onClick={openNewCollection}
              className="h-[30px] px-3 text-[12px] rounded-md text-white hover:opacity-90 cursor-pointer"
              style={{ backgroundColor: getProtocolAccent(protocol as any) }}
            >
              + New Collection
            </button>
          </div>
        ) : (
          filteredTree.map(node => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              expandedIds={expandedIds}
              toggleExpand={toggleExpand}
              renamingId={renamingId}
              renameValue={renameValue}
              setRenameValue={setRenameValue}
              renameRef={renameRef}
              handleRename={handleRename}
              startRename={startRename}
              setRenamingId={setRenamingId}
              onDelete={(id, name) => setDeleteTarget({ id, type: 'collection', name })}
              onDeleteRequest={(id, name) => setDeleteTarget({ id, type: 'request', name })}
              onNewFolder={openNewFolder}
              onNewRequest={openNewRequest}
              onOpenRequest={handleOpenRequest}
              onRunCollection={(id, name) => { setRunnerCollectionId(id); setRunnerCollectionName(name); }}
              onCollectionContextMenu={openCollectionContextMenu}
              onRequestContextMenu={openRequestContextMenu}
              dragItem={dragItem}
              dropTarget={dropTarget}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            />
          ))
        )}
      </div>

      {/* New item modal */}
      <NewItemModal
        open={modalOpen}
        title={modalTitle}
        placeholder={modalMode === 'request' ? 'Request name' : modalMode === 'folder' ? 'Folder name' : 'Collection name'}
        onSave={handleModalSave}
        onCancel={() => setModalOpen(false)}
        accentColor={getProtocolAccent(protocol as any)}
      />

      {/* Delete confirmation */}
      {deleteTarget && (
        <ConfirmDialog
          title={`Delete ${deleteTarget.type === 'collection' ? 'Collection' : 'Request'}`}
          message={`Are you sure you want to delete "${deleteTarget.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Collection runner */}
      <RunCollectionModal
        open={!!runnerCollectionId}
        collectionId={runnerCollectionId}
        collectionName={runnerCollectionName}
        onClose={() => setRunnerCollectionId(null)}
      />

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          items={contextMenu.items}
          position={contextMenu.position}
          onSelect={handleContextMenuSelect}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Collection properties modal */}
      {propertiesTarget && (
        <CollectionPropertiesModal
          open={true}
          collectionName={propertiesTarget.name}
          properties={propertiesTarget.properties}
          onSave={(props) => {
            postMsg({ type: 'updateCollectionProperties', id: propertiesTarget.id, properties: props });
            setPropertiesTarget(null);
          }}
          onClose={() => setPropertiesTarget(null)}
        />
      )}

      {showDeleteAllConfirm && (
        <ConfirmDialog
          title="Delete All Collections?"
          message="This will permanently delete all collections and requests. This cannot be undone."
          confirmLabel="Delete All"
          danger
          onConfirm={handleDeleteAllCollections}
          onCancel={() => setShowDeleteAllConfirm(false)}
        />
      )}
    </div>
  );
}

// ────────────── Recursive Tree Node ──────────────

interface TreeNodeProps {
  node: CollectionTreeNode;
  depth: number;
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;
  renamingId: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  renameRef: React.RefObject<HTMLInputElement | null>;
  handleRename: (id: string) => void;
  startRename: (id: string, name: string, e: React.MouseEvent) => void;
  setRenamingId: (id: string | null) => void;
  onDelete: (id: string, name: string) => void;
  onDeleteRequest: (id: string, name: string) => void;
  onNewFolder: (parentId: string) => void;
  onNewRequest: (parentId: string) => void;
  onOpenRequest: (req: CollectionRequest) => void;
  onRunCollection: (id: string, name: string) => void;
  onCollectionContextMenu: (e: React.MouseEvent, node: CollectionTreeNode) => void;
  onRequestContextMenu: (e: React.MouseEvent, req: CollectionRequest) => void;
  // DnD props
  dragItem: { id: string; type: 'collection' | 'request'; parentId: string | null } | null;
  dropTarget: { id: string; position: 'before' | 'inside' | 'after' } | null;
  onDragStart: (e: React.DragEvent, id: string, type: 'collection' | 'request', parentId: string | null) => void;
  onDragOver: (e: React.DragEvent, targetId: string, targetType: 'collection' | 'request') => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

function TreeNode({
  node, depth, expandedIds, toggleExpand,
  renamingId, renameValue, setRenameValue, renameRef, handleRename, startRename, setRenamingId,
  onDelete, onDeleteRequest, onNewFolder, onNewRequest, onOpenRequest, onRunCollection,
  onCollectionContextMenu, onRequestContextMenu,
  dragItem, dropTarget, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
}: TreeNodeProps) {
  const isExpanded = expandedIds.has(node.id);
  const totalItems = node.children.length + node.requests.length;
  const isDragOver = dropTarget?.id === node.id;
  const dropPosition = isDragOver ? dropTarget.position : null;

  return (
    <div className="mb-0.5">
      {/* Drop indicator - before */}
      {dropPosition === 'before' && (
        <div className="h-0.5 bg-[var(--color-primary)] rounded mx-2" />
      )}
      {/* Folder row */}
      <div
        draggable
        onDragStart={(e) => onDragStart(e, node.id, 'collection', node.parent_id)}
        onDragOver={(e) => onDragOver(e, node.id, 'collection')}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        onClick={() => toggleExpand(node.id)}
        onContextMenu={(e) => onCollectionContextMenu(e, node)}
        data-context-menu="collection"
        className={`px-2 py-1.5 rounded-md hover:bg-[var(--color-item-hover-bg)] cursor-pointer group flex items-center gap-1.5 ${
          dropPosition === 'inside' ? 'ring-1 ring-[var(--color-primary)] bg-[var(--color-item-hover-bg)]' : ''
        } ${dragItem?.id === node.id ? 'opacity-40' : ''}`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {/* Chevron */}
        <ChevronRightIcon
          size={12}
          className={`text-[var(--color-text-muted)] shrink-0 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
        />
        {/* Folder icon */}
        {isExpanded ? (
          <FolderOpenIcon size={14} className="text-[var(--color-text-muted)] shrink-0" />
        ) : (
          <FolderIcon size={14} className="text-[var(--color-text-muted)] shrink-0" />
        )}
        {/* Name or rename input */}
        {renamingId === node.id ? (
          <input
            ref={renameRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => handleRename(node.id)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRename(node.id); if (e.key === 'Escape') setRenamingId(null); }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 text-[12px] bg-[var(--color-input-bg)] border border-[var(--color-primary)] rounded px-1 py-0 text-[var(--color-text-primary)] focus:outline-none"
          />
        ) : (
          <span className="text-[12px] text-[var(--color-text-primary)] truncate flex-1">{node.name}</span>
        )}
        {/* Item count */}
        {totalItems > 0 && (
          <span className="text-[10px] text-[var(--color-text-muted)] opacity-60">{totalItems}</span>
        )}
        {/* Hover actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <ActionBtn title="Add Request" onClick={(e) => { e.stopPropagation(); onNewRequest(node.id); }}>
            <FilePlusIcon size={13} />
          </ActionBtn>
          <ActionBtn title="New Folder" onClick={(e) => { e.stopPropagation(); onNewFolder(node.id); }}>
            <FolderPlusIcon size={13} />
          </ActionBtn>
          <ActionBtn title="Run Collection" onClick={(e) => { e.stopPropagation(); onRunCollection(node.id, node.name); }} disabled={!hasAnyRequests(node)}>
            <PlayIcon size={13} />
          </ActionBtn>
          <ActionBtn title="More Options" onClick={(e) => onCollectionContextMenu(e, node)}>
            <MoreVerticalIcon size={13} />
          </ActionBtn>
        </div>
      </div>

      {/* Drop indicator - after */}
      {dropPosition === 'after' && !isExpanded && (
        <div className="h-0.5 bg-[var(--color-primary)] rounded mx-2" />
      )}

      {/* Children */}
      <div className={`collapse-wrapper ${isExpanded ? 'expanded' : ''}`}>
        <div className="collapse-inner">
        <div className={depth > 0 ? 'ml-3 border-l border-[var(--color-surface-border)]' : ''}>
          {/* Sub-folders */}
          {node.children.map(child => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              toggleExpand={toggleExpand}
              renamingId={renamingId}
              renameValue={renameValue}
              setRenameValue={setRenameValue}
              renameRef={renameRef}
              handleRename={handleRename}
              startRename={startRename}
              setRenamingId={setRenamingId}
              onDelete={onDelete}
              onDeleteRequest={onDeleteRequest}
              onNewFolder={onNewFolder}
              onNewRequest={onNewRequest}
              onOpenRequest={onOpenRequest}
              onRunCollection={onRunCollection}
              onCollectionContextMenu={onCollectionContextMenu}
              onRequestContextMenu={onRequestContextMenu}
              dragItem={dragItem}
              dropTarget={dropTarget}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
            />
          ))}
          {/* Requests */}
          {node.requests.map(req => {
            const isReqDragOver = dropTarget?.id === req.id;
            const reqDropPos = isReqDragOver ? dropTarget.position : null;
            return (
              <div key={req.id}>
                {reqDropPos === 'before' && <div className="h-0.5 bg-[var(--color-primary)] rounded mx-2" />}
                <div
                  draggable
                  onDragStart={(e) => onDragStart(e, req.id, 'request', node.id)}
                  onDragOver={(e) => onDragOver(e, req.id, 'request')}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  onDragEnd={onDragEnd}
                  onClick={() => onOpenRequest(req)}
                  onContextMenu={(e) => onRequestContextMenu(e, req)}
                  data-context-menu="request"
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--color-item-hover-bg)] cursor-pointer group/req ${
                    dragItem?.id === req.id ? 'opacity-40' : ''
                  }`}
                  style={{ paddingLeft: `${20 + (depth + 1) * 12}px` }}
                >
                  <span
                    className="text-[9px] font-bold shrink-0 w-[30px] text-left uppercase tracking-wide"
                    style={{ color: METHOD_COLORS[req.method] || 'var(--color-muted-fallback)' }}
                  >
                    {req.method}
                  </span>
                  {renamingId === req.id ? (
                    <input
                      ref={renameRef}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => handleRename(req.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRename(req.id); if (e.key === 'Escape') setRenamingId(null); }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 text-[12px] bg-[var(--color-input-bg)] border border-[var(--color-primary)] rounded px-1 py-0 text-[var(--color-text-primary)] focus:outline-none min-w-0"
                    />
                  ) : (
                    <span className="text-[11.5px] text-[var(--color-text-primary)] truncate min-w-0">
                      {req.name || req.url || 'Untitled'}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onRequestContextMenu(e, req); }}
                    className="opacity-0 group-hover/req:opacity-100 flex items-center justify-center w-5 h-5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-icon-hover-bg)] cursor-pointer"
                    title="More Options"
                  >
                    <MoreVerticalIcon size={11} />
                  </button>
                </div>
                {reqDropPos === 'after' && <div className="h-0.5 bg-[var(--color-primary)] rounded mx-2" />}
              </div>
            );
          })}
        </div>
        </div>
      </div>

      {/* Drop indicator - after (when expanded, at end) */}
      {dropPosition === 'after' && isExpanded && (
        <div className="h-0.5 bg-[var(--color-primary)] rounded mx-2" />
      )}
    </div>
  );
}

// ────────────── Action Button helper ──────────────

function ActionBtn({ title, onClick, danger, disabled, children }: { title: string; onClick: (e: React.MouseEvent) => void; danger?: boolean; disabled?: boolean; children: React.ReactNode }) {
  if (disabled) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center w-6 h-6 rounded-md cursor-pointer transition-colors ${
        danger
          ? 'text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:bg-[var(--color-icon-hover-bg)]'
          : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-icon-hover-bg)]'
      }`}
      title={title}
    >
      {children}
    </button>
  );
}
