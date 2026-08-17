import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { postMsg } from '../../../vscode';
import { useTabsStore, type RequestTab } from '../../../store/tabs-store';
import { getDisplayMethod } from '../../../services/request/request-service';
import { useAiPromptTemplatesStore } from '../../../store/prompt-template';
import { SparkleIcon, FolderIcon, FolderOpenIcon, FolderPlusIcon, TrashIcon, MoreVerticalIcon, RenameIcon, CopyIcon, ChevronRightIcon, CheckCircleFilledIcon } from '../../../icons';
import { ConfirmDialog } from '../index';
import { ModalView, ButtonView, IconButtonView, TextInputView, ContextMenuView, type ContextMenuItem as DuiContextMenuItem } from '@salilvnair/dui';

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

/** Minimal shape needed from a history row to bulk-save it — matches HistoryPanel's HistoryItem. */
interface BulkSaveItem {
  id: number;
  method: string;
  url: string;
  request_data?: string;
  status?: number;
  status_text?: string;
  response_time?: number;
  response_size?: number;
  response_data?: string;
}

interface SaveRequestModalProps {
  open: boolean;
  tab: RequestTab | null;
  onClose: () => void;
  /** Bulk mode: save several history rows to one chosen destination in one go — `tab` is ignored when set. */
  bulkItems?: BulkSaveItem[];
  bulkProtocol?: string;
}

/** Normalizes a history row's stored `request_data` JSON into the same shape SaveRequestModal's
 * single-tab save path sends — field names differ slightly per protocol handler (e.g. SOAP stores
 * `envelope`/`wsSecurity`/`assertions`, the save payload expects `soapEnvelope`/`soapWsSecurity`/`soapAssertions`). */
function buildSaveDataFromHistoryItem(item: BulkSaveItem, protocol: string): Record<string, unknown> {
  let parsed: Record<string, unknown> = {};
  try { parsed = item.request_data ? JSON.parse(item.request_data) : {}; } catch { /* ignore */ }
  const base: Record<string, unknown> = {
    headers: parsed.headers ?? [],
    params: parsed.params ?? [],
    bodyMode: parsed.bodyMode ?? 'none',
    bodyRaw: parsed.bodyRaw ?? parsed.body ?? '',
    bodyContentType: parsed.bodyContentType ?? '',
    bodyFormData: parsed.bodyFormData ?? [],
    bodyUrlEncoded: parsed.bodyUrlEncoded ?? [],
    authType: parsed.authType ?? 'none',
    authData: parsed.authData ?? {},
    variables: parsed.variables ?? {},
    preRequestScript: parsed.preRequestScript ?? '',
    postResponseScript: parsed.postResponseScript ?? '',
  };
  if (protocol === 'graphql') {
    return { ...base, gql_variables: parsed.gql_variables };
  }
  if (protocol === 'soap') {
    return { ...base, soapVersion: parsed.soapVersion, soapAction: parsed.soapAction, soapOperation: parsed.soapOperation, soapService: parsed.soapService, soapEnvelope: parsed.envelope, soapWsSecurity: parsed.wsSecurity, soapAssertions: parsed.assertions, soapAttachments: parsed.attachments };
  }
  if (protocol === 'grpc') {
    return { ...base, grpcMethod: parsed.grpcMethod, grpcMessage: parsed.grpcMessage, grpcMetadata: parsed.grpcMetadata, grpcTls: parsed.grpcTls, grpcProtoFile: parsed.grpcProtoFile };
  }
  if (protocol === 'mcp') {
    return { ...base, mcpTransport: parsed.mcpTransport, mcpCommand: parsed.mcpCommand, mcpArgs: parsed.mcpArgs, mcpEnvVars: parsed.mcpEnvVars, mcpSettings: parsed.mcpSettings };
  }
  if (protocol === 'ai') {
    return { ...base, aiProvider: parsed.provider, aiModel: parsed.model };
  }
  return base;
}

/** Short "METHOD path" label derived from a URL — same heuristic as the single-save AI-name button. */
function nameFromUrl(method: string, url: string): string {
  try {
    const clean = url.replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '');
    const parts = clean.split('/').filter(Boolean);
    const label = parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || url;
    return `${method} ${label}`.slice(0, 60);
  } catch {
    return `${method} request`;
  }
}

export function SaveRequestModal({ open, tab, onClose, bulkItems, bulkProtocol }: SaveRequestModalProps) {
  const updateTab = useTabsStore(s => s.updateTab);
  const isBulk = !!bulkItems && bulkItems.length > 0;
  const protocol = isBulk ? (bulkProtocol || 'rest') : (tab?.protocol ?? 'rest');
  const accent = PROTOCOL_ACCENT[protocol] || PROTOCOL_ACCENT.rest;
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
  const [contextMenu, setContextMenu] = useState<{ position: { x: number; y: number }; items: DuiContextMenuItem[] } | null>(null);

  const [aiNaming, setAiNaming] = useState(false);
  const aiNameReqIdRef = useRef('');
  const aiNameAccRef = useRef('');
  const resolve = useAiPromptTemplatesStore(s => s.resolve);

  const inputRef = useRef<HTMLInputElement>(null);
  const inlineRef = useRef<HTMLInputElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(isBulk ? '' : (tab?.name || 'Untitled Request'));
    setSelectedId(isBulk ? null : (tab?.collectionId || null));
    setExpandedIds(new Set());
    setSearchQuery('');
    setInlineCreateMode(false);
    setRenamingId(null);
    setDeleteTarget(null);
    setContextMenu(null);
    postMsg({ type: 'getCollections', protocol });

    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'collectionsData') {
        // Only process responses matching this protocol — fail closed on a missing tag too.
        if (msg.protocol !== protocol) return;
        setTree(msg.collections ?? []);
      }
    };

    window.addEventListener('message', handler);
    const timer = setTimeout(() => inputRef.current?.focus(), 30);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('message', handler);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab, isBulk, protocol]);

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
    const close = () => setContextMenu(null);
    const items: DuiContextMenuItem[] = [
      {
        id: 'new-folder', label: 'New Folder', shortcut: 'F',
        icon: <FolderIcon size={13} style={{ color: 'var(--color-warning)' }} />,
        onClick: () => {
          setInlineCreateMode(true); setInlineCreateName(''); setInlineCreateParentId(nodeId);
          setExpandedIds(prev => { const next = new Set(prev); next.add(nodeId); return next; });
          close();
        },
      },
      { id: 'sep1', label: '', separator: true },
      {
        id: 'rename', label: 'Rename', shortcut: 'N',
        icon: <RenameIcon size={13} style={{ color: 'var(--color-ctx-rename)' }} />,
        onClick: () => { setRenamingId(nodeId); setRenameValue(nodeName); close(); },
      },
      {
        id: 'duplicate', label: 'Duplicate', shortcut: 'D',
        icon: <CopyIcon size={13} style={{ color: 'var(--color-ctx-duplicate)' }} />,
        onClick: () => {
          postMsg({ type: 'duplicateCollection', id: nodeId, protocol });
          setTimeout(() => postMsg({ type: 'getCollections', protocol }), 100);
          close();
        },
      },
      { id: 'sep2', label: '', separator: true },
      {
        id: 'delete', label: 'Delete', danger: true, shortcut: '⌫',
        icon: <TrashIcon size={13} style={{ color: 'var(--color-error)' }} />,
        onClick: () => {
          const node = findNode(tree, nodeId);
          const hasContents = node ? countContents(node) > 0 : false;
          setDeleteTarget({ id: nodeId, name: nodeName, hasContents });
          close();
        },
      },
    ];
    setContextMenu({ position: { x: e.clientX, y: e.clientY }, items });
  }, [tree, tab]);

  const handleRename = () => {
    if (!renamingId || !renameValue.trim()) { setRenamingId(null); return; }
    postMsg({ type: 'renameCollection', id: renamingId, name: renameValue.trim(), protocol });
    setRenamingId(null);
    setTimeout(() => postMsg({ type: 'getCollections', protocol }), 100);
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    postMsg({ type: 'deleteCollection', id: deleteTarget.id, protocol });
    if (selectedId === deleteTarget.id) setSelectedId(null);
    setDeleteTarget(null);
    setTimeout(() => postMsg({ type: 'getCollections', protocol }), 100);
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
      protocol,
    });
    // Auto-expand parent so the new subfolder is visible
    if (inlineCreateParentId) {
      setExpandedIds(prev => { const next = new Set(prev); next.add(inlineCreateParentId!); return next; });
    }
    setInlineCreateMode(false);
    setInlineCreateName('');
    setSelectedId(newId);
    // Re-fetch collections to show the new folder
    postMsg({ type: 'getCollections', protocol });
  };

  const handleSave = () => {
    if (!selectedId) return;

    if (isBulk) {
      for (const item of bulkItems!) {
        postMsg({
          type: 'saveRequestToCollection',
          collectionId: selectedId,
          protocol,
          request: {
            id: crypto.randomUUID(),
            name: nameFromUrl(item.method, item.url),
            method: item.method,
            url: item.url,
            data: JSON.stringify(buildSaveDataFromHistoryItem(item, protocol)),
            // History already captured a response for this request — carry it over
            // instead of silently dropping it, matching what History itself shows.
            status: item.status,
            statusText: item.status_text,
            responseTime: item.response_time,
            responseSize: item.response_size,
            responseData: item.response_data,
          },
        });
      }
      onClose();
      return;
    }

    if (!tab || !name.trim()) return;

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
        // Carry over the tab's last response, same as History already does.
        status: tab.response?.status,
        statusText: tab.response?.statusText,
        responseTime: tab.response?.time,
        responseSize: tab.response?.size,
        responseData: tab.response
          ? JSON.stringify({ headers: tab.response.headers, body: tab.response.body.slice(0, 50000), contentType: tab.response.contentType })
          : undefined,
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

  if (!tab && !isBulk) return null;

  return (
    <>
    <ModalView
      open={open}
      onClose={onClose}
      title={isBulk ? `Save ${bulkItems!.length} requests` : 'Save as'}
      size="sm"
      elevated
      headerColor={accent}
      footerRight={
        <ButtonView
          size="md"
          accentColor={accent}
          onClick={handleSave}
          disabled={isBulk ? !selectedId : (!name.trim() || !selectedId)}
        >
          Save
        </ButtonView>
      }
    >
      <div className="space-y-3" style={{ '--modal-accent': accent } as React.CSSProperties}>
          {isBulk ? (
            <p className="text-[12px] text-[var(--color-text-secondary)]">
              Saving <strong>{bulkItems!.length}</strong> request{bulkItems!.length === 1 ? '' : 's'} — each keeps its own name, pick one destination folder below.
            </p>
          ) : (
          /* Request name + AI generate */
          <div className="space-y-1.5">
            <label className="block text-[12px] font-medium text-[var(--color-text-secondary)]">Request name</label>
            <div className="flex items-center gap-2">
              <TextInputView
                ref={inputRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                size="md"
                accentColor={accent}
                style={{ flex: 1 }}
              />
              <IconButtonView
                icon={<SparkleIcon size={15} className={aiNaming ? 'animate-pulse' : ''} />}
                size="md"
                tooltip={aiNaming ? 'Generating name…' : 'AI: Suggest a name for this request'}
                disabled={aiNaming}
                accentColor={accent}
                active={aiNaming}
                onClick={() => {
                  const url = tab?.url || '';
                  const parts = url.replace(/https?:\/\//, '').split('/').filter(Boolean);
                  const endpoint = parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || 'request';
                  const heuristic = `${getDisplayMethod(tab!)} ${endpoint}`.slice(0, 60);
                  setName(heuristic);

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
              />
            </div>
          </div>
          )}

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
    </ModalView>

    {/* Folder context menu */}
    {contextMenu && (
      <ContextMenuView
        open={true}
        anchorEl={null}
        position={contextMenu.position}
        onClose={() => setContextMenu(null)}
        items={contextMenu.items}
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
  renameRef: React.RefObject<HTMLInputElement | null>;
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
            <IconButtonView
              icon={<FolderPlusIcon size={12} style={{ color: 'var(--color-text-muted)' }} />}
              size="sm"
              tooltip="New subfolder"
              onClick={(e) => { e.stopPropagation(); onAddSubfolder(node.id); }}
            />
            <IconButtonView
              icon={<MoreVerticalIcon size={12} style={{ color: 'var(--color-text-muted)' }} />}
              size="sm"
              tooltip="More options"
              onClick={(e) => { e.stopPropagation(); onOpenContextMenu(e, node.id, node.name); }}
            />
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