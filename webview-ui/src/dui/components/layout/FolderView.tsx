/**
 * FolderView — DUI folder tree with expand/collapse, hover action buttons,
 * DUI ContextMenuView, DUI ModalView runner popup, and built-in HTML5
 * drag-and-drop for reordering/nesting nodes and items.
 */
import { useState, useRef, useCallback, type ReactNode, type CSSProperties } from 'react';
import { ChevronRightIcon, FolderIcon, FolderOpenIcon } from '../../../icons';
import { IconButtonView } from '../button/IconButtonView';
import { ContextMenuView, type ContextMenuItem } from '../modal/ContextMenuView';
import { ModalView } from '../modal/ModalView';
import { TabView, type TabItem } from '../input/TabView';
import { ButtonView } from '../button/ButtonView';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FolderNode<T = unknown> {
  id: string;
  label: string;
  children?: FolderNode<T>[];
  items?: T[];
  data?: unknown;
}

export interface FolderAction<T = unknown> {
  id: string;
  icon: ReactNode;
  tooltip?: string;
  disabled?: boolean | ((node: FolderNode<T>) => boolean);
  onClick: (node: FolderNode<T>, e: React.MouseEvent) => void;
}

export interface FolderRunnerTab {
  id: string; label: string; badge?: number; dot?: boolean; content: ReactNode;
}

export interface FolderRunnerConfig<T = unknown> {
  title?: string;
  subtitle?: string | ((node: FolderNode<T>) => string);
  tabs: FolderRunnerTab[];
  saveLabel?: string;
  onSave?: (tabId: string, node: FolderNode<T>) => void;
  accentColor?: string;
}

export type DropPosition = 'before' | 'inside' | 'after';

/** Summary entry shown in the folder-move confirm modal */
export interface MoveSummaryEntry {
  label: string;
  /** 'folder' shows a folder icon; 'item' shows the accent-color dot */
  type: 'folder' | 'item';
}

type DragKind  = 'node' | 'item';
type DragState  = { id: string; parentId: string | null; kind: DragKind };
type DropTarget = { id: string; position: DropPosition; kind: DragKind };
type MoveConfirm = { dragId: string; dragLabel: string; targetId: string; targetLabel: string; position: DropPosition; summary?: MoveSummaryEntry[] };

export interface FolderViewProps<T = unknown> {
  nodes: FolderNode<T>[];
  accentColor?: string;
  folderActions?: FolderAction<T>[];
  contextMenuItems?: (node: FolderNode<T>) => ContextMenuItem[];
  runner?: FolderRunnerConfig<T>;
  defaultExpandedIds?: Set<string>;
  expandedIds?: Set<string>;
  onToggle?: (id: string) => void;
  renderItem?: (item: T, node: FolderNode<T>, depth: number) => ReactNode;
  onRename?: (id: string, newName: string) => void;
  onFolderClick?: (node: FolderNode<T>) => void;
  emptyLabel?: string;
  className?: string;
  indentPx?: number;
  onContextMenu?: (e: React.MouseEvent, node: FolderNode<T>) => void;

  // ── Drag-and-drop ──────────────────────────────────────────────────────────
  /** Enable HTML5 drag-and-drop reordering/nesting of folder nodes */
  draggable?: boolean;
  /** Guard per-node draggability (e.g. pinned/protected folders) */
  isDraggableNode?: (node: FolderNode<T>) => boolean;
  /** Called when a folder node is dropped. position = where relative to targetId. */
  onMove?: (dragId: string, targetId: string, position: DropPosition) => void;
  /** Show a confirm modal before calling onMove */
  confirmFolderMove?: boolean;
  /** Return extra entries shown in the confirm modal body (sub-folders + items that will move) */
  getMoveSummary?: (dragId: string) => MoveSummaryEntry[];

  // ── Item drag-and-drop ─────────────────────────────────────────────────────
  /** Enable HTML5 drag-and-drop for items inside nodes */
  draggableItems?: boolean;
  /** Required when draggableItems=true — stable unique ID per item */
  getItemId?: (item: T) => string;
  /**
   * Called when an item is dropped.
   * targetKind='node'  → dropped onto a folder node (position is always 'inside')
   * targetKind='item'  → dropped onto a sibling item (position is 'before'|'after')
   */
  onItemMove?: (itemId: string, targetId: string, targetKind: 'node' | 'item', position: DropPosition) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isDisabled<T>(d: boolean | ((n: FolderNode<T>) => boolean) | undefined, node: FolderNode<T>): boolean {
  if (d === undefined) return false;
  return typeof d === 'boolean' ? d : d(node);
}

function findLabel<T>(nodes: FolderNode<T>[], id: string): string {
  for (const n of nodes) {
    if (n.id === id) return n.label;
    if (n.children) { const f = findLabel(n.children, id); if (f) return f; }
  }
  return id;
}

function DropLine({ show, color }: { show: boolean; color: string }) {
  if (!show) return null;
  return <div style={{ height: 2, background: color, borderRadius: 2, margin: '0 8px' }} />;
}

// ── ItemRow ───────────────────────────────────────────────────────────────────

interface ItemRowProps<T> {
  item: T; node: FolderNode<T>; depth: number; itemId: string;
  enableDrag: boolean; dragState: DragState | null; dropTarget: DropTarget | null;
  accentColor: string;
  renderItem?: (item: T, node: FolderNode<T>, depth: number) => ReactNode;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

function ItemRow<T>({ item, node, depth, itemId, enableDrag, dragState, dropTarget, accentColor, renderItem, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd }: ItemRowProps<T>) {
  const isDragging = dragState?.kind === 'item' && dragState.id === itemId;
  const dropPos    = dropTarget?.kind === 'item' && dropTarget.id === itemId ? dropTarget.position : null;

  const dndProps = enableDrag ? {
    draggable: true as const,
    onDragStart: (e: React.DragEvent) => onDragStart(e, itemId),
    onDragOver:  (e: React.DragEvent) => onDragOver(e, itemId),
    onDragLeave,
    onDrop,
    onDragEnd,
  } : {};

  return (
    <div style={{ opacity: isDragging ? 0.4 : 1 }}>
      <DropLine show={dropPos === 'before'} color={accentColor} />
      <div {...dndProps}>
        {renderItem ? renderItem(item, node, depth) : (
          <div style={{ paddingLeft: `${8 + depth * 12}px`, fontSize: 12, color: 'var(--color-text-secondary)', padding: '4px 8px' }}>
            {String(item)}
          </div>
        )}
      </div>
      <DropLine show={dropPos === 'after'} color={accentColor} />
    </div>
  );
}

// ── NodeRow ───────────────────────────────────────────────────────────────────

interface NodeRowProps<T> {
  node: FolderNode<T>; depth: number; parentId: string | null;
  expandedIds: Set<string>; toggleExpand: (id: string) => void;
  folderActions?: FolderAction<T>[];
  onFolderClick?: (node: FolderNode<T>) => void;
  onContextMenu?: (e: React.MouseEvent, node: FolderNode<T>) => void;
  onOpenCtxMenu: (node: FolderNode<T>, x: number, y: number) => void;
  onOpenRunner: (node: FolderNode<T>) => void;
  renderItem?: (item: T, node: FolderNode<T>, depth: number) => ReactNode;
  onRename?: (id: string, newName: string) => void;
  accentColor: string; indentPx: number;
  contextMenuItems?: (node: FolderNode<T>) => ContextMenuItem[];
  // node drag
  enableDrag: boolean;
  isDraggableNode?: (node: FolderNode<T>) => boolean;
  dragState: DragState | null; dropTarget: DropTarget | null;
  onDragStart: (e: React.DragEvent, id: string, parentId: string | null) => void;
  onDragOver: (e: React.DragEvent, targetId: string) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  // item drag
  enableItemDrag: boolean;
  getItemId?: (item: T) => string;
  onItemDragStart: (e: React.DragEvent, id: string) => void;
  onItemDragOver: (e: React.DragEvent, id: string) => void;
  onItemDrop: (e: React.DragEvent) => void;
}

function NodeRow<T>({
  node, depth, parentId, expandedIds, toggleExpand,
  folderActions, onFolderClick, onContextMenu, onOpenCtxMenu, onOpenRunner,
  renderItem, onRename, accentColor, indentPx, contextMenuItems,
  enableDrag, isDraggableNode, dragState, dropTarget,
  onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
  enableItemDrag, getItemId, onItemDragStart, onItemDragOver, onItemDrop,
}: NodeRowProps<T>) {
  const isExpanded = expandedIds.has(node.id);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState(node.label);
  const renameRef = useRef<HTMLInputElement>(null);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); toggleExpand(node.id); onFolderClick?.(node);
  }, [toggleExpand, node, onFolderClick]);

  const handleDblClick = useCallback((e: React.MouseEvent) => {
    if (!onRename) return;
    e.stopPropagation(); setRenameVal(node.label); setRenaming(true);
    setTimeout(() => renameRef.current?.select(), 0);
  }, [onRename, node.label]);

  const commitRename = useCallback(() => {
    setRenaming(false);
    if (renameVal.trim() && renameVal !== node.label) onRename?.(node.id, renameVal.trim());
  }, [renameVal, node.id, node.label, onRename]);

  const totalCount = (node.children?.length ?? 0) + (node.items?.length ?? 0);
  const hasCtxMenu = contextMenuItems ? contextMenuItems(node).length > 0 : false;

  const dropPos    = dropTarget?.kind === 'node' && dropTarget.id === node.id ? dropTarget.position : null;
  // When an *item* is being dragged and hovers this folder, highlight it
  const itemDragInside = dropTarget?.kind === 'node' && dropTarget.id === node.id;
  const isDragging     = dragState?.kind === 'node' && dragState.id === node.id;
  const canDrag        = enableDrag && (isDraggableNode ? isDraggableNode(node) : true);

  const rowStyle: CSSProperties = { paddingLeft: `${8 + depth * indentPx}px` };

  const nodeDndProps = canDrag ? {
    draggable: true as const,
    onDragStart: (e: React.DragEvent) => { e.stopPropagation(); onDragStart(e, node.id, parentId); },
    onDragEnd:   (e: React.DragEvent) => { e.stopPropagation(); onDragEnd(); },
  } : {};

  // Node row handles dragOver/Leave/Drop for both node-drags and item-drags landing on it
  const dropAreaProps = {
    onDragOver:  (e: React.DragEvent) => onDragOver(e, node.id),
    onDragLeave: onDragLeave,
    onDrop:      (e: React.DragEvent) => onDrop(e),
  };

  return (
    <div className="mb-0.5">
      <DropLine show={dropPos === 'before'} color={accentColor} />
      <div
        {...nodeDndProps}
        {...dropAreaProps}
        className={`flex items-center gap-1.5 py-1.5 pr-2 rounded-md cursor-pointer group hover:bg-[var(--color-surface-hover)] ${isDragging ? 'opacity-40' : ''}`}
        style={{
          ...rowStyle,
          ...((dropPos === 'inside' || itemDragInside) ? { boxShadow: `0 0 0 1px ${accentColor}`, background: 'var(--color-surface-hover)' } : {}),
        }}
        onClick={handleToggle}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu?.(e, node);
          if (hasCtxMenu) onOpenCtxMenu(node, e.clientX, e.clientY);
        }}
        onDoubleClick={handleDblClick}
      >
        <span style={{ display: 'inline-flex', flexShrink: 0, transition: 'transform 150ms', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', color: 'var(--color-text-muted)' }}>
          <ChevronRightIcon size={12} />
        </span>
        <span style={{ color: accentColor, flexShrink: 0, display: 'inline-flex' }}>
          {isExpanded ? <FolderOpenIcon size={14} /> : <FolderIcon size={14} />}
        </span>
        {renaming ? (
          <input
            ref={renameRef} value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(false); }}
            onClick={(e) => e.stopPropagation()}
            style={{ flex: 1, fontSize: 12, background: 'var(--color-input-bg)', border: `1px solid ${accentColor}`, borderRadius: 4, padding: '0 4px', color: 'var(--color-text-primary)', outline: 'none', minWidth: 0 }}
          />
        ) : (
          <span style={{ flex: 1, fontSize: 12, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.label}
          </span>
        )}
        {totalCount > 0 && !renaming && (
          <span style={{ fontSize: 10, color: 'var(--color-text-muted)', opacity: 0.6, flexShrink: 0 }}>{totalCount}</span>
        )}
        {folderActions && folderActions.length > 0 && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
            {folderActions.map(action => {
              const disabled = isDisabled(action.disabled, node);
              const isRunAction = action.id === 'run';
              const isCtxAction = action.id === 'more' || action.id === 'context';
              return (
                <IconButtonView key={action.id} icon={action.icon} size="sm" tooltip={action.tooltip} disabled={disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isRunAction) { onOpenRunner(node); return; }
                    if (isCtxAction && hasCtxMenu) {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      onOpenCtxMenu(node, rect.right, rect.bottom + 4); return;
                    }
                    action.onClick(node, e);
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
      <DropLine show={dropPos === 'after' && !isExpanded} color={accentColor} />
      {isExpanded && (
        <div style={{ marginLeft: depth > 0 ? 12 : 0, borderLeft: depth > 0 ? '1px solid var(--color-surface-border)' : 'none' }}>
          {node.children?.map(child => (
            <NodeRow key={child.id} node={child} depth={depth + 1} parentId={node.id}
              expandedIds={expandedIds} toggleExpand={toggleExpand}
              folderActions={folderActions} onFolderClick={onFolderClick}
              onContextMenu={onContextMenu} onOpenCtxMenu={onOpenCtxMenu} onOpenRunner={onOpenRunner}
              renderItem={renderItem} onRename={onRename}
              accentColor={accentColor} indentPx={indentPx} contextMenuItems={contextMenuItems}
              enableDrag={enableDrag} isDraggableNode={isDraggableNode}
              dragState={dragState} dropTarget={dropTarget}
              onDragStart={onDragStart} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} onDragEnd={onDragEnd}
              enableItemDrag={enableItemDrag} getItemId={getItemId}
              onItemDragStart={onItemDragStart} onItemDragOver={onItemDragOver} onItemDrop={onItemDrop}
            />
          ))}
          {node.items?.map((item, i) => {
            const itemId = getItemId ? getItemId(item) : String(i);
            return (
              <ItemRow key={itemId} item={item} node={node} depth={depth + 1} itemId={itemId}
                enableDrag={enableItemDrag} dragState={dragState} dropTarget={dropTarget}
                accentColor={accentColor} renderItem={renderItem}
                onDragStart={onItemDragStart} onDragOver={onItemDragOver}
                onDragLeave={onDragLeave} onDrop={onItemDrop} onDragEnd={onDragEnd}
              />
            );
          })}
        </div>
      )}
      <DropLine show={dropPos === 'after' && isExpanded} color={accentColor} />
    </div>
  );
}

// ── RunnerModal ───────────────────────────────────────────────────────────────

function RunnerModal<T>({ node, config, onClose }: { node: FolderNode<T>; config: FolderRunnerConfig<T>; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState(config.tabs[0]?.id ?? '');
  const tabs: TabItem[] = config.tabs.map(t => ({ id: t.id, label: t.label, badge: t.badge, dot: t.dot }));
  const subtitle = typeof config.subtitle === 'function' ? config.subtitle(node) : config.subtitle;
  const accentColor = config.accentColor ?? 'var(--color-primary)';
  return (
    <ModalView open onClose={onClose} title={config.title ?? `Run — ${node.label}`} subtitle={subtitle} size="md" headerColor={accentColor}
      footerRight={config.onSave ? (
        <ButtonView variant="primary" size="md" onClick={() => { config.onSave?.(activeTab, node); onClose(); }}>
          {config.saveLabel ?? 'Save'}
        </ButtonView>
      ) : undefined}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {tabs.length > 1 && <TabView tabs={tabs} activeTab={activeTab} onChange={setActiveTab} variant="chip" size="sm" accentColor={accentColor} />}
        <div>{config.tabs.find(t => t.id === activeTab)?.content}</div>
      </div>
    </ModalView>
  );
}

// ── FolderView ────────────────────────────────────────────────────────────────

export function FolderView<T = unknown>({
  nodes, accentColor = 'var(--color-text-muted)',
  folderActions, contextMenuItems, runner,
  defaultExpandedIds, expandedIds: controlled, onToggle,
  renderItem, onRename, onFolderClick, onContextMenu,
  emptyLabel = 'No items', className = '', indentPx = 12,
  draggable = false, isDraggableNode, onMove, confirmFolderMove = false, getMoveSummary,
  draggableItems = false, getItemId, onItemMove,
}: FolderViewProps<T>) {
  const [internal, setInternal] = useState<Set<string>>(defaultExpandedIds ?? new Set());
  const expandedIds = controlled ?? internal;

  const toggleExpand = useCallback((id: string) => {
    if (onToggle) { onToggle(id); return; }
    setInternal(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, [onToggle]);

  const [ctxMenu,      setCtxMenu]      = useState<{ node: FolderNode<T>; x: number; y: number } | null>(null);
  const [activeRunner, setActiveRunner] = useState<FolderNode<T> | null>(null);
  const [dragState,    setDragState]    = useState<DragState | null>(null);
  const [dropTarget,   setDropTarget]   = useState<DropTarget | null>(null);
  const [moveConfirm,  setMoveConfirm]  = useState<MoveConfirm | null>(null);

  const openCtxMenu = useCallback((node: FolderNode<T>, x: number, y: number) => setCtxMenu({ node, x, y }), []);
  const openRunner  = useCallback((node: FolderNode<T>) => setActiveRunner(node), []);

  // ── Node drag handlers ─────────────────────────────────────────────────────

  const handleDragStart = useCallback((e: React.DragEvent, id: string, parentId: string | null) => {
    setDragState({ id, parentId, kind: 'node' });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault(); e.stopPropagation();
    if (!dragState || dragState.id === targetId) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top; const h = rect.height;

    if (dragState.kind === 'item') {
      // Item dragged over a folder node → always 'inside'
      setDropTarget({ id: targetId, position: 'inside', kind: 'node' });
    } else {
      const position: DropPosition = y < h * 0.25 ? 'before' : y > h * 0.75 ? 'after' : 'inside';
      setDropTarget({ id: targetId, position, kind: 'node' });
    }
    e.dataTransfer.dropEffect = 'move';
  }, [dragState]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDropTarget(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!dragState || !dropTarget) { setDragState(null); setDropTarget(null); return; }
    const { id: dragId, kind } = dragState;
    const { id: targetId, position } = dropTarget;
    setDragState(null); setDropTarget(null);

    if (kind === 'item') {
      // Item dropped onto a folder node
      onItemMove?.(dragId, targetId, 'node', 'inside');
      return;
    }

    if (confirmFolderMove) {
      const summary = getMoveSummary?.(dragId);
      setMoveConfirm({ dragId, dragLabel: findLabel(nodes, dragId), targetId, targetLabel: findLabel(nodes, targetId), position, summary });
    } else {
      onMove?.(dragId, targetId, position);
    }
  }, [dragState, dropTarget, confirmFolderMove, nodes, onMove, onItemMove, getMoveSummary]);

  const handleDragEnd = useCallback(() => { setDragState(null); setDropTarget(null); }, []);

  // ── Item drag handlers ─────────────────────────────────────────────────────

  const handleItemDragStart = useCallback((e: React.DragEvent, id: string) => {
    e.stopPropagation();
    setDragState({ id, parentId: null, kind: 'item' });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }, []);

  const handleItemDragOver = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault(); e.stopPropagation();
    if (!dragState || dragState.id === targetId) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const position: DropPosition = e.clientY - rect.top < rect.height * 0.5 ? 'before' : 'after';
    setDropTarget({ id: targetId, position, kind: 'item' });
    e.dataTransfer.dropEffect = 'move';
  }, [dragState]);

  const handleItemDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!dragState || !dropTarget || dragState.kind !== 'item') { setDragState(null); setDropTarget(null); return; }
    const { id: dragId } = dragState;
    const { id: targetId, position, kind } = dropTarget;
    setDragState(null); setDropTarget(null);
    onItemMove?.(dragId, targetId, kind, position);
  }, [dragState, dropTarget, onItemMove]);

  // ── Move confirm ───────────────────────────────────────────────────────────

  const executeMoveConfirm = useCallback(() => {
    if (!moveConfirm) return;
    onMove?.(moveConfirm.dragId, moveConfirm.targetId, moveConfirm.position);
    setMoveConfirm(null);
  }, [moveConfirm, onMove]);

  const ctxItems = ctxMenu && contextMenuItems ? contextMenuItems(ctxMenu.node) : [];

  if (nodes.length === 0) {
    return <div style={{ padding: '24px 12px', textAlign: 'center', fontSize: 12, color: 'var(--color-text-muted)' }}>{emptyLabel}</div>;
  }

  const sharedNodeProps = {
    expandedIds, toggleExpand, folderActions, onFolderClick, onContextMenu,
    onOpenCtxMenu: openCtxMenu, onOpenRunner: openRunner,
    renderItem, onRename, accentColor, indentPx, contextMenuItems,
    enableDrag: draggable, isDraggableNode, dragState, dropTarget,
    onDragStart: handleDragStart, onDragOver: handleDragOver,
    onDragLeave: handleDragLeave, onDrop: handleDrop, onDragEnd: handleDragEnd,
    enableItemDrag: draggableItems, getItemId,
    onItemDragStart: handleItemDragStart, onItemDragOver: handleItemDragOver, onItemDrop: handleItemDrop,
  };

  return (
    <div className={className}>
      {nodes.map(node => (
        <NodeRow key={node.id} node={node} depth={0} parentId={null} {...sharedNodeProps} />
      ))}

      <ContextMenuView open={!!ctxMenu} anchorEl={null} position={ctxMenu ? { x: ctxMenu.x, y: ctxMenu.y } : undefined} items={ctxItems} onClose={() => setCtxMenu(null)} />

      {activeRunner && runner && <RunnerModal node={activeRunner} config={runner} onClose={() => setActiveRunner(null)} />}

      <ModalView open={!!moveConfirm} onClose={() => setMoveConfirm(null)} title="Move folder" size="sm" headerColor={accentColor}
        footerRight={
          <div style={{ display: 'flex', gap: 8 }}>
            <ButtonView variant="secondary" size="sm" onClick={() => setMoveConfirm(null)}>Cancel</ButtonView>
            <ButtonView variant="primary" size="sm" accentColor={accentColor} onClick={executeMoveConfirm}>Move</ButtonView>
          </div>
        }
      >
        {moveConfirm && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 13, color: 'var(--color-text-primary)', margin: 0 }}>
              {moveConfirm.position === 'inside'
                ? <>Move <strong>"{moveConfirm.dragLabel}"</strong> into <strong>"{moveConfirm.targetLabel}"</strong>?</>
                : <>Reorder <strong>"{moveConfirm.dragLabel}"</strong> to a new position?</>}
            </p>
            {moveConfirm.summary && moveConfirm.summary.length > 0 ? (
              <>
                <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: 0 }}>The following will move with it:</p>
                <ul style={{ margin: 0, padding: '0 0 0 14px', listStyle: 'disc' }}>
                  {moveConfirm.summary.map((entry, i) => (
                    <li key={i} style={{ fontSize: 12, color: entry.type === 'folder' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', lineHeight: 1.8 }}>
                      {entry.type === 'folder'
                        ? <><FolderIcon size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle', opacity: 0.7 }} />{entry.label}</>
                        : <><span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: accentColor, marginRight: 5, verticalAlign: 'middle', opacity: 0.8 }} />{entry.label}</>
                      }
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: 0 }}>
                All sub-folders and items inside will move with it.
              </p>
            )}
          </div>
        )}
      </ModalView>
    </div>
  );
}
