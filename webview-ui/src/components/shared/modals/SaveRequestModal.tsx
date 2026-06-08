import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { postMsg } from '../../../vscode';
import { useTabsStore, type RequestTab } from '../../../store/tabs-store';
import { getDisplayMethod } from '../../../services/request/request-service';
import { useAiPromptTemplatesStore } from '../../../store/prompt-template';
import { CloseIcon, SparkleIcon, FolderIcon, FolderOpenIcon, FolderPlusIcon, TrashIcon, MoreVerticalIcon, RenameIcon, CopyIcon, ChevronRightIcon, CheckCircleFilledIcon } from '../../../icons';
import { ContextMenu, ConfirmDialog, type ContextMenuItem } from '../index';

const PROTOCOL_ACCENT: Record<string, string> = {
  rest: 'var(--color-primary)',
  graphql: 'var(--color-protocol-graphql)',
  websocket: 'var(--color-protocol-websocket)',
  grpc: 'var(--color-protocol-grpc)',
  soap: 'var(--color-protocol-soap)',
  ai: 'var(--color-protocol-ai)',
  mcp: 'var(--color-protocol-mcp)',
};

interface CollectionTreeNode {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  children: CollectionTreeNode[];
  requests: { id: string; collection_id: string; name: string; method: string; url: string; data?: string }[];
}

interface SaveRequestModalProps {
  open: boolean;
  tab: RequestTab | null;
  onClose: () => void;
}

export function SaveRequestModal({ open, tab, onClose }: SaveRequestModalProps) {
  const updateTab = useTabsStore(s => s.updateTab);
  const accent = PROTOCOL_ACCENT[tab?.protocol ?? 'rest'] || PROTOCOL_ACCENT.rest;
  const [tree, setTree] = useState<CollectionTreeNode[]>([]);
  const [name, setName] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [inlineCreateMode, setInlineCreateMode] = useState(false);
  const [inlineCreateName, setInlineCreateName] = useState('');
  const [inlineCreateParentId, setInlineCreateParentId] = useState<string | null>(null);
  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; hasContents: boolean } | null>(null);
  // Context menu
  const [contextMenu, setContextMenu] = useState<{ position: { x: number; y: number }; items: ContextMenuItem[]; targetId: string; targetName: string } | null>(null);

  const [aiNaming, setAiNaming] = useState(false);
  const aiNameReqIdRef = useRef('');
  const aiNameAccRef = useRef('');
  const resolve = useAiPromptTemplatesStore(s => s.resolve);

  const inputRef = useRef<HTMLInputElement>(null);
  const inlineRef = useRef<HTMLInputElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(tab?.name || 'Untitled Request');
    setSelectedId(tab?.collectionId || null);
    setExpandedIds(new Set());
    setSearchQuery('');
    setInlineCreateMode(false);
    setRenamingId(null);
    setDeleteTarget(null);
    setContextMenu(null);
    postMsg({ type: 'getCollections', protocol: tab?.protocol || 'rest' });

    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'collectionsData') {
        // Only process responses matching this tab's protocol
        const expectedProtocol = tab?.protocol || 'rest';
        if (msg.protocol && msg.protocol !== expectedProtocol) return;
        setTree(msg.collections ?? []);
      }
    };

    window.addEventListener('message', handler);
    const timer = setTimeout(() => inputRef.current?.focus(), 30);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('message', handler);
    };
  }, [open, tab]);

  useEffect(() => {
    if (inlineCreateMode) {
      setTimeout(() => inlineRef.current?.focus(), 30);
    }
  }, [inlineCreateMode]);

  useEffect(() => {
    if (renamingId) {
      setTimeout(() => { renameRef.current?.focus(); renameRef.current?.select(); }, 30);
    }
  }, [renamingId]);

  // AI name streaming handler
  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || msg.tabId !== aiNameReqIdRef.current) return;
      if (msg.type === 'ai:chunk') {
        const delta = (msg.delta as string) || (msg.text as string) || '';
        aiNameAccRef.current += delta;
        setName(aiNameAccRef.current.replace(/^["']|["']$/g, '').trim());
      }
      if (msg.type === 'ai:complete') {
        const clean = aiNameAccRef.current.replace(/^["']|["']$/g, '').trim().slice(0, 60);
        setName(clean || name);
        setAiNaming(false);
      }
      if (msg.type === 'ai:error') {
        setAiNaming(false);
        // Silently fall back — name stays as is (heuristic already set)
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Count total requests (including nested) inside a folder
  const countContents = (node: CollectionTreeNode): number => {
    let count = node.requests.length;
    for (const child of node.children) count += countContents(child);
    return count;
  };

  const findNode = (nodes: CollectionTreeNode[], id: string): CollectionTreeNode | null => {
    for (const n of nodes) {
      if (n.id === id) return n;
      const found = findNode(n.children, id);
      if (found) return found;
    }
    return null;
  };

  const openFolderContextMenu = useCallback((e: React.MouseEvent, nodeId: string, nodeName: string) => {
    e.preventDefault();
    e.stopPropagation();
    const items: ContextMenuItem[] = [
      { id: 'new-folder', label: 'New Folder', shortcut: 'F', icon: <FolderIcon size={13} />, iconColor: 'var(--color-warning)' },
      { id: 'sep1', label: '', separator: true },
      { id: 'rename', label: 'Rename', shortcut: 'N', icon: <RenameIcon size={13} />, iconColor: 'var(--color-ctx-rename)' },
      { id: 'duplicate', label: 'Duplicate', shortcut: 'D', icon: <CopyIcon size={13} />, iconColor: 'var(--color-ctx-duplicate)' },
      { id: 'sep2', label: '', separator: true },
      { id: 'delete', label: 'Delete', danger: true, shortcut: '⌫', icon: <TrashIcon size={13} /> },
    ];
    setContextMenu({ position: { x: e.clientX, y: e.clientY }, items, targetId: nodeId, targetName: nodeName });
  }, []);

  const handleContextMenuSelect = useCallback((actionId: string) => {
    if (!contextMenu) return;
    const { targetId, targetName } = contextMenu;
    switch (actionId) {
      case 'new-folder':
        setInlineCreateMode(true);
        setInlineCreateName('');
        setInlineCreateParentId(targetId);
        setExpandedIds(prev => { const next = new Set(prev); next.add(targetId); return next; });
        break;
      case 'rename':
        setRenamingId(targetId);
        setRenameValue(targetName);
        break;
      case 'duplicate':
        postMsg({ type: 'duplicateCollection', id: targetId, protocol: tab?.protocol || 'rest' });
        setTimeout(() => postMsg({ type: 'getCollections', protocol: tab?.protocol || 'rest' }), 100);
        break;
      case 'delete': {
        const node = findNode(tree, targetId);
        const hasContents = node ? countContents(node) > 0 : false;
        setDeleteTarget({ id: targetId, name: targetName, hasContents });
        break;
      }
    }
    setContextMenu(null);
  }, [contextMenu, tree, tab]);

  const handleRename = () => {
    if (!renamingId || !renameValue.trim()) { setRenamingId(null); return; }
    postMsg({ type: 'renameCollection', id: renamingId, name: renameValue.trim(), protocol: tab?.protocol || 'rest' });
    setRenamingId(null);
    setTimeout(() => postMsg({ type: 'getCollections', protocol: tab?.protocol || 'rest' }), 100);
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    postMsg({ type: 'deleteCollection', id: deleteTarget.id, protocol: tab?.protocol || 'rest' });
    if (selectedId === deleteTarget.id) setSelectedId(null);
    setDeleteTarget(null);
    setTimeout(() => postMsg({ type: 'getCollections', protocol: tab?.protocol || 'rest' }), 100);
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Filter tree for search
  const filterTree = (nodes: CollectionTreeNode[], q: string): CollectionTreeNode[] => {
    if (!q) return nodes;
    const lower = q.toLowerCase();
    return nodes.reduce<CollectionTreeNode[]>((acc, node) => {
      const nameMatch = node.name.toLowerCase().includes(lower);
      const filteredChildren = filterTree(node.children, q);
      if (nameMatch || filteredChildren.length > 0) {
        acc.push({ ...node, children: filteredChildren });
      }
      return acc;
    }, []);
  };

  const filteredTree = useMemo(() => filterTree(tree, searchQuery), [tree, searchQuery]);

  // Auto-expand when searching
  useEffect(() => {
    if (searchQuery) {
      const allIds = new Set<string>();
      const collectIds = (nodes: CollectionTreeNode[]) => {
        for (const n of nodes) { allIds.add(n.id); collectIds(n.children); }
      };
      collectIds(filteredTree);
      setExpandedIds(allIds);
    }
  }, [searchQuery]);

  const handleInlineCreate = () => {
    if (!inlineCreateName.trim()) return;
    const newId = crypto.randomUUID();
    postMsg({
      type: 'createFolder',
      id: newId,
      name: inlineCreateName.trim(),
      parentId: inlineCreateParentId, // null = root level
      protocol: tab?.protocol || 'rest',
    });
    // Auto-expand parent so the new subfolder is visible
    if (inlineCreateParentId) {
      setExpandedIds(prev => { const next = new Set(prev); next.add(inlineCreateParentId!); return next; });
    }
    setInlineCreateMode(false);
    setInlineCreateName('');
    setSelectedId(newId);
    // Re-fetch collections to show the new folder
    postMsg({ type: 'getCollections', protocol: tab?.protocol || 'rest' });
  };

  const handleSave = () => {
    if (!tab || !name.trim() || !selectedId) return;

    const requestId = crypto.randomUUID();

    // Build protocol-specific data payload
    let data: Record<string, unknown> = {
      headers: tab.headers,
      params: tab.params,
      bodyMode: tab.bodyMode,
      bodyRaw: tab.bodyRaw,
      bodyContentType: tab.bodyContentType,
      bodyFormData: tab.bodyFormData,
      bodyUrlEncoded: tab.bodyUrlEncoded,
      authType: tab.authType,
      authData: tab.authData,
      variables: tab.variables,
      preRequestScript: tab.preRequestScript,
      postResponseScript: tab.postResponseScript,
    };

    if (tab.protocol === 'ai') {
      data = { ...data, aiProvider: tab.aiProvider, aiModel: tab.aiModel, aiSystemPrompts: tab.aiSystemPrompts, aiUserPrompt: tab.aiUserPrompt, aiTools: tab.aiTools, aiSettings: tab.aiSettings, mcpServerConfigs: (tab as any).mcpServerConfigs };
    } else if (tab.protocol === 'mcp') {
      data = { ...data, mcpTransport: tab.mcpTransport, mcpCommand: tab.mcpCommand, mcpArgs: (tab as any).mcpArgs, mcpEnvVars: tab.mcpEnvVars, mcpSettings: tab.mcpSettings };
    } else if (tab.protocol === 'graphql') {
      data = { ...data, bodyRaw: tab.bodyRaw, gql_variables: tab.authData?.['gql_variables'] };
    } else if (tab.protocol === 'grpc') {
      data = { ...data, grpcMethod: tab.grpcMethod, grpcMessage: tab.grpcMessage, grpcMetadata: tab.grpcMetadata, grpcTls: tab.grpcTls, grpcProtoFile: tab.grpcProtoFile, preRequestScript: tab.preRequestScript, postResponseScript: tab.postResponseScript };
    } else if (tab.protocol === 'soap') {
      data = { ...data, soapVersion: tab.soapVersion, soapAction: tab.soapAction, soapOperation: tab.soapOperation, soapService: tab.soapService, soapEnvelope: tab.soapEnvelope, soapWsSecurity: tab.soapWsSecurity, soapAssertions: tab.soapAssertions, soapAttachments: tab.soapAttachments };
    }

    postMsg({
      type: 'saveRequestToCollection',
      collectionId: selectedId,
      protocol: tab.protocol || 'rest',
      request: {
        id: requestId,
        name: name.trim(),
        method: getDisplayMethod(tab),
        url: tab.url,
        data: JSON.stringify(data),
      },
    });

    updateTab(tab.id, {
      name: name.trim(),
      collectionId: selectedId,
      requestId,
      dirty: false,
    });
    onClose();
  };

  if (!open || !tab) return null;

  const modal = createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50"

    >
      <div className="w-full max-w-[480px] rounded-xl bg-[var(--color-elevated)] border border-[var(--color-elevated-border)] shadow-2xl animate-[fadeSlideIn_150ms_ease-out] flex flex-col max-h-[80vh]" style={{ '--modal-accent': accent } as React.CSSProperties}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2.5 border-b border-[var(--color-surface-border)]">
          <h2 className="text-[15px] font-semibold text-[var(--color-text-primary)]">Save as</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--color-error)] hover:opacity-80 hover:bg-[color-mix(in_srgb,var(--color-error)_8%,transparent)] cursor-pointer transition-colors"
          >
            <CloseIcon size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 py-3 space-y-3 flex-1 min-h-0 overflow-y-auto">
          {/* Request name + AI generate */}
          <div className="space-y-1.5">
            <label className="block text-[12px] font-medium text-[var(--color-text-secondary)]">Request name</label>
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                className="flex-1 h-[32px] px-3 rounded-lg bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[12.5px] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--modal-accent)]"
              />
              <button
                type="button"
                title={aiNaming ? 'Generating name…' : 'AI: Suggest a name for this request'}
                disabled={aiNaming}
                onClick={() => {
                  // Heuristic fallback (immediate while AI loads)
                  const url = tab?.url || '';
                  const parts = url.replace(/https?:\/\//, '').split('/').filter(Boolean);
                  const endpoint = parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || 'request';
                  const heuristic = `${getDisplayMethod(tab!)} ${endpoint}`.slice(0, 60);
                  setName(heuristic);

                  // AI-powered suggestion
                  const pid = `ai-name-${Date.now()}`;
                  aiNameReqIdRef.current = pid;
                  aiNameAccRef.current = '';
                  setAiNaming(true);

                  const bodyPreview = tab?.bodyRaw?.slice(0, 120) || '';
                  const userPrompt = resolve('rest.request.name', {
                    method: getDisplayMethod(tab!),
                    url: tab?.url || '(no URL)',
                    bodyPreview: bodyPreview || '(empty)',
                  });

                  postMsg({
                    type: 'ai:send',
                    tabId: pid,
                    provider: '', model: '', baseUrl: '',
                    stage: 'rest.request.name',
                    systemPrompts: ['You are a concise HTTP request naming assistant. Return only the name — nothing else.'],
                    userPrompt,
                    conversation: [],
                    tools: [],
                    settings: { temperature: 0.3, maxTokens: 32, stream: true, topP: 1, stopSequences: ['\n'], responseFormat: 'text', frequencyPenalty: 0, presencePenalty: 0, seed: null },
                    mcpServerConfigs: [],
                  });
                }}
                className="flex items-center justify-center w-[32px] h-[32px] rounded-lg border border-[var(--color-input-border)] cursor-pointer transition-all disabled:opacity-50"
                style={{
                  color: aiNaming ? accent : 'var(--color-text-muted)',
                  borderColor: aiNaming ? accent : 'var(--color-input-border)',
                }}
                onMouseEnter={e => { if (!aiNaming) (e.currentTarget as HTMLElement).style.color = accent; }}
                onMouseLeave={e => { if (!aiNaming) (e.currentTarget as HTMLElement).style.color = 'var(--color-text-muted)'; }}
              >
                <SparkleIcon size={16} className={aiNaming ? 'animate-pulse' : ''} />
              </button>
            </div>
          </div>

          {/* Location picker - tree view */}
          <div className="space-y-2">
            <label className="block text-[12px] font-medium text-[var(--color-text-secondary)]">Select location</label>
            <div className="rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] overflow-hidden">
              {/* Search */}
              <div className="px-3 py-1.5 border-b border-[var(--color-surface-border)]">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search collections..."
                  className="w-full h-[28px] px-2 text-[12px] rounded bg-transparent border-none text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
                />
              </div>

              {/* + New */}
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-surface-border)]">
                <button
                  type="button"
                  onClick={() => { setInlineCreateMode(true); setInlineCreateName(''); setInlineCreateParentId(null); }}
                  className="flex items-center gap-1.5 text-[12px] text-[var(--modal-accent)] hover:opacity-80 cursor-pointer"
                >
                  <span>+ New</span>
                </button>
              </div>

              {/* Inline create */}
              {inlineCreateMode && (
                <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-surface-border)] bg-[var(--color-item-hover-bg)]">
                  <FolderIcon size={14} className="text-[var(--color-text-muted)] shrink-0" />
                  <input
                    ref={inlineRef}
                    type="text"
                    value={inlineCreateName}
                    onChange={(e) => setInlineCreateName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleInlineCreate(); if (e.key === 'Escape') setInlineCreateMode(false); }}
                    onBlur={() => { if (!inlineCreateName.trim()) setInlineCreateMode(false); }}
                    placeholder={inlineCreateParentId ? 'Subfolder name…' : 'Folder name…'}
                    className="flex-1 h-[26px] px-2 text-[12px] rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--modal-accent)]"
                  />
                  <button type="button" onClick={handleInlineCreate} disabled={!inlineCreateName.trim()} className="h-[26px] px-2 text-[11px] rounded text-white cursor-pointer disabled:opacity-40" style={{ backgroundColor: accent }}>Create</button>
                </div>
              )}

              {/* Tree items */}
              <div className="max-h-[240px] overflow-y-auto py-1 space-y-1.5">
                {filteredTree.length === 0 && !inlineCreateMode ? (
                  <div className="px-4 py-6 text-center">
                    <p className="text-[12px] text-[var(--color-text-muted)] mb-2">{tree.length === 0 ? 'Collections are empty' : 'No matches'}</p>
                    {tree.length === 0 && (
                      <button type="button" onClick={() => { setInlineCreateMode(true); setInlineCreateName(''); setInlineCreateParentId(null); }} className="text-[12px] text-[var(--modal-accent)] cursor-pointer hover:underline">+ Add new collection</button>
                    )}
                  </div>
                ) : (
                  filteredTree.map(node => (
                    <SaveTreeNode
                      key={node.id}
                      node={node}
                      depth={0}
                      selectedId={selectedId}
                      expandedIds={expandedIds}
                      renamingId={renamingId}
                      renameValue={renameValue}
                      renameRef={renameRef}
                      onSelect={setSelectedId}
                      onToggleExpand={toggleExpand}
                      onAddSubfolder={(parentId) => { setInlineCreateMode(true); setInlineCreateName(''); setInlineCreateParentId(parentId); }}
                      onOpenContextMenu={openFolderContextMenu}
                      onRenameChange={setRenameValue}
                      onRenameCommit={handleRename}
                      onRenameCancel={() => setRenamingId(null)}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-t border-[var(--color-surface-border)]">
          <button
            type="button"
            onClick={handleSave}
            disabled={!name.trim() || !selectedId}
            className="h-[36px] px-4 text-[12.5px] font-medium rounded-lg text-white hover:opacity-90 cursor-pointer transition-colors disabled:opacity-40 disabled:pointer-events-none"
            style={{ backgroundColor: accent }}
          >
            Save
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-[36px] px-4 text-[12.5px] font-medium rounded-lg bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.25)] text-[#f87171] hover:bg-[rgba(239,68,68,0.15)] cursor-pointer transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );

  return (
    <>
      {modal}
      {/* Folder context menu */}
      {contextMenu && (
        <ContextMenu
          items={contextMenu.items}
          position={contextMenu.position}
          onSelect={handleContextMenuSelect}
          onClose={() => setContextMenu(null)}
        />
      )}
      {/* Delete confirm */}
      {deleteTarget && (
        <ConfirmDialog
          title={`Delete "${deleteTarget.name}"?`}
          message={deleteTarget.hasContents
            ? `This folder contains requests. Deleting it will also delete all requests inside. This cannot be undone.`
            : `Delete this folder? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}

// ────────── Tree node for Save modal ──────────

function SaveTreeNode({
  node, depth, selectedId, expandedIds, renamingId, renameValue, renameRef,
  onSelect, onToggleExpand, onAddSubfolder, onOpenContextMenu, onRenameChange, onRenameCommit, onRenameCancel,
}: {
  node: CollectionTreeNode;
  depth: number;
  selectedId: string | null;
  expandedIds: Set<string>;
  renamingId: string | null;
  renameValue: string;
  renameRef: React.RefObject<HTMLInputElement>;
  onSelect: (id: string | null) => void;
  onToggleExpand: (id: string) => void;
  onAddSubfolder: (parentId: string) => void;
  onOpenContextMenu: (e: React.MouseEvent, nodeId: string, nodeName: string) => void;
  onRenameChange: (v: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
}) {
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;
  const hasChildren = node.children.length > 0;
  const isRenaming = renamingId === node.id;

  return (
    <div className="mb-0.5 pt-[2px]">
      <div
        onClick={() => !isRenaming && onSelect(selectedId === node.id ? null : node.id)}
        className={`group flex items-center gap-1.5 px-2 py-1.5 cursor-pointer transition-colors rounded-md mx-1 ${
          isSelected ? 'bg-[var(--color-item-hover-bg)]' : 'hover:bg-[var(--color-item-hover-bg)]'
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {/* Expand chevron */}
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleExpand(node.id); }}
            className="w-4 h-4 flex items-center justify-center shrink-0 text-[var(--color-text-muted)] cursor-pointer"
          >
            <ChevronRightIcon
              size={10}
              className={`transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
            />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {/* Selection indicator / folder icon */}
        {isSelected ? (
          <CheckCircleFilledIcon size={16} checked className="shrink-0 text-[var(--color-success)]" />
        ) : isExpanded ? (
          <FolderOpenIcon size={14} className="text-[var(--color-text-muted)] shrink-0" />
        ) : (
          <FolderIcon size={14} className="text-[var(--color-text-muted)] shrink-0" />
        )}

        {/* Name or rename input */}
        {isRenaming ? (
          <input
            ref={renameRef}
            type="text"
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onRenameCommit(); } if (e.key === 'Escape') { e.stopPropagation(); onRenameCancel(); } }}
            onBlur={onRenameCommit}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 h-[22px] px-1.5 text-[12px] rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--modal-accent)]"
          />
        ) : (
          <span className={`flex-1 text-[12px] truncate ${isSelected ? 'text-[var(--color-success)] font-medium' : 'text-[var(--color-text-primary)]'}`}>
            {node.name}
          </span>
        )}

        {/* Hover action buttons */}
        {!isRenaming && (
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity shrink-0">
            {/* + Subfolder */}
            <button
              type="button"
              title="New subfolder"
              onClick={(e) => { e.stopPropagation(); onAddSubfolder(node.id); }}
              className="flex items-center justify-center w-5 h-5 rounded text-[var(--color-text-muted)] hover:text-[var(--modal-accent)] hover:bg-[color-mix(in_srgb,var(--modal-accent)_12%,transparent)] cursor-pointer"
            >
              <FolderPlusIcon size={12} />
            </button>
            {/* ··· context menu */}
            <button
              type="button"
              title="More options"
              onClick={(e) => { e.stopPropagation(); onOpenContextMenu(e, node.id, node.name); }}
              className="flex items-center justify-center w-5 h-5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-item-hover-bg)] cursor-pointer"
            >
              <MoreVerticalIcon size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div>
          {node.children.map(child => (
            <SaveTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expandedIds={expandedIds}
              renamingId={renamingId}
              renameValue={renameValue}
              renameRef={renameRef}
              onSelect={onSelect}
              onToggleExpand={onToggleExpand}
              onAddSubfolder={onAddSubfolder}
              onOpenContextMenu={onOpenContextMenu}
              onRenameChange={onRenameChange}
              onRenameCommit={onRenameCommit}
              onRenameCancel={onRenameCancel}
            />
          ))}
        </div>
      )}
    </div>
  );
}