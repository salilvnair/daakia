import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { postMsg } from '../../../vscode';
import { useTabsStore, type RequestTab } from '../../../store/tabs-store';
import { getDisplayMethod } from '../../../services/request/request-service';
import { CloseIcon, SparkleIcon, PlusIcon, FolderIcon, ChevronRightIcon, CheckCircleFilledIcon } from '../../../icons';

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
  const inputRef = useRef<HTMLInputElement>(null);
  const inlineRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(tab?.name || 'Untitled Request');
    setSelectedId(tab?.collectionId || null);
    setExpandedIds(new Set());
    setSearchQuery('');
    setInlineCreateMode(false);
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
      parentId: inlineCreateParentId,
      protocol: tab?.protocol || 'rest',
    });
    setInlineCreateMode(false);
    setInlineCreateName('');
    setSelectedId(newId);
  };

  const handleSave = () => {
    if (!tab || !name.trim() || !selectedId) return;

    const requestId = crypto.randomUUID();
    postMsg({
      type: 'saveRequestToCollection',
      collectionId: selectedId,
      protocol: tab.protocol || 'rest',
      request: {
        id: requestId,
        name: name.trim(),
        method: getDisplayMethod(tab),
        url: tab.url,
        data: JSON.stringify({
          headers: tab.headers,
          params: tab.params,
          bodyMode: tab.bodyMode,
          bodyRaw: tab.bodyRaw,
          bodyFormData: tab.bodyFormData,
          bodyUrlEncoded: tab.bodyUrlEncoded,
          authType: tab.authType,
          authData: tab.authData,
        }),
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

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50"

    >
      <div className="w-full max-w-[560px] rounded-xl bg-[var(--color-elevated)] border border-[var(--color-elevated-border)] shadow-2xl animate-[fadeSlideIn_150ms_ease-out] flex flex-col max-h-[80vh]" style={{ '--modal-accent': accent } as React.CSSProperties}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[var(--color-surface-border)]">
          <h2 className="text-[20px] font-semibold text-[var(--color-text-primary)]">Save as</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-[#ef4444] hover:text-[#dc2626] hover:bg-[rgba(239,68,68,0.08)] cursor-pointer transition-colors"
          >
            <CloseIcon size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-4 flex-1 min-h-0 overflow-y-auto">
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
                className="flex-1 h-[40px] px-3 rounded-lg bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[13px] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--modal-accent)]"
              />
              <button
                type="button"
                title="Generate name from request"
                onClick={() => {
                  const url = tab.url || '';
                  const parts = url.replace(/https?:\/\//, '').split('/').filter(Boolean);
                  const endpoint = parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || 'request';
                  setName(`${getDisplayMethod(tab)} ${endpoint}`.slice(0, 60));
                }}
                className="flex items-center justify-center w-[40px] h-[40px] rounded-lg border border-[var(--color-input-border)] text-[var(--color-text-muted)] hover:text-[var(--modal-accent)] hover:border-[var(--modal-accent)] cursor-pointer transition-colors"
              >
                <SparkleIcon size={16} />
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
                  onClick={() => { setInlineCreateMode(true); setInlineCreateName(''); setInlineCreateParentId(selectedId); }}
                  className="flex items-center gap-1.5 text-[12px] text-[var(--modal-accent)] hover:opacity-80 cursor-pointer"
                >
                  <PlusIcon size={12} />
                  <span>New Folder</span>
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
                    placeholder="Folder name"
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
                      onSelect={setSelectedId}
                      onToggleExpand={toggleExpand}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-[var(--color-surface-border)]">
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
}

// ────────── Tree node for Save modal ──────────

function SaveTreeNode({
  node, depth, selectedId, expandedIds, onSelect, onToggleExpand,
}: {
  node: CollectionTreeNode;
  depth: number;
  selectedId: string | null;
  expandedIds: Set<string>;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
}) {
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;
  const hasChildren = node.children.length > 0;

  return (
    <div className="mb-2.5 pt-[2px]">
      <div
        onClick={() => onSelect(node.id)}
        className={`flex items-center gap-1.5 px-2 py-2 cursor-pointer transition-colors rounded-md mx-1 ${
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

        {/* Selection indicator */}
        {isSelected ? (
          <CheckCircleFilledIcon size={16} checked className="shrink-0 text-[var(--color-success)]" />
        ) : (
          <FolderIcon size={14} className="text-[var(--color-text-muted)] shrink-0" />
        )}

        {/* Name */}
        <span className={`flex-1 text-[12px] truncate ${isSelected ? 'text-[var(--color-success)] font-medium' : 'text-[var(--color-text-primary)]'}`}>
          {node.name}
        </span>
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
              onSelect={onSelect}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}