/**
 * FolderView — DUI folder tree with expand/collapse, hover action buttons,
 * DUI ContextMenuView on 3-dot, and DUI ModalView runner popup with tabs.
 *
 * Highly customizable via render props and configuration objects.
 */
import { useState, useRef, useCallback, type ReactNode, type CSSProperties } from 'react';
import { ChevronRightIcon, FolderIcon, FolderOpenIcon } from '../../../icons';
import { IconButtonView } from '../button/IconButtonView';
import { ContextMenuView, type ContextMenuItem } from '../modal/ContextMenuView';
import { ModalView } from '../modal/ModalView';
import { TabView, type TabItem } from '../input/TabView';
import { ButtonView } from '../button/ButtonView';

// ── Data model ────────────────────────────────────────────────────────────────

export interface FolderNode<T = unknown> {
  id: string;
  label: string;
  children?: FolderNode<T>[];
  items?: T[];
  /** Arbitrary metadata attached to this node */
  data?: unknown;
}

// ── Action config ─────────────────────────────────────────────────────────────

export interface FolderAction<T = unknown> {
  id: string;
  icon: ReactNode;
  tooltip?: string;
  disabled?: boolean | ((node: FolderNode<T>) => boolean);
  /** Called when the action button is clicked */
  onClick: (node: FolderNode<T>, e: React.MouseEvent) => void;
}

// ── Runner modal config ───────────────────────────────────────────────────────

export interface FolderRunnerTab {
  id: string;
  label: string;
  badge?: number;
  dot?: boolean;
  content: ReactNode;
}

export interface FolderRunnerConfig<T = unknown> {
  title?: string;
  subtitle?: string | ((node: FolderNode<T>) => string);
  tabs: FolderRunnerTab[];
  saveLabel?: string;
  onSave?: (tabId: string, node: FolderNode<T>) => void;
  accentColor?: string;
}

// ── Main props ────────────────────────────────────────────────────────────────

export interface FolderViewProps<T = unknown> {
  nodes: FolderNode<T>[];
  /** CSS color for accent (chevron hover, drop indicators) */
  accentColor?: string;
  /** Action buttons shown on folder row hover (right side) */
  folderActions?: FolderAction<T>[];
  /**
   * Context menu items for a given node.
   * Return an empty array to hide the context menu.
   * Use `danger: true` on an item to color it red automatically.
   */
  contextMenuItems?: (node: FolderNode<T>) => ContextMenuItem[];
  /** Runner popup shown when the action with id='run' is triggered */
  runner?: FolderRunnerConfig<T>;
  /** Initial expanded IDs (uncontrolled) */
  defaultExpandedIds?: Set<string>;
  /** Controlled expand state — pair with onToggle */
  expandedIds?: Set<string>;
  onToggle?: (id: string) => void;
  /** Render a leaf item inside a folder */
  renderItem?: (item: T, node: FolderNode<T>, depth: number) => ReactNode;
  /** Rename support — if provided, double-click on label triggers rename */
  onRename?: (id: string, newName: string) => void;
  /** Folder row click (outside action area) */
  onFolderClick?: (node: FolderNode<T>) => void;
  /** Shown when nodes array is empty */
  emptyLabel?: string;
  className?: string;
  /** Pixels to indent per depth level */
  indentPx?: number;
  /** Right-click on folder row */
  onContextMenu?: (e: React.MouseEvent, node: FolderNode<T>) => void;
}

// ── Internal state for context menu ──────────────────────────────────────────

interface ActiveCtxMenu<T> {
  node: FolderNode<T>;
  x: number;
  y: number;
}

interface ActiveRunner<T> {
  node: FolderNode<T>;
}

// ── Helper: resolve disabled ──────────────────────────────────────────────────

function isDisabled<T>(d: boolean | ((n: FolderNode<T>) => boolean) | undefined, node: FolderNode<T>): boolean {
  if (d === undefined) return false;
  if (typeof d === 'boolean') return d;
  return d(node);
}

// ── Recursive node renderer ───────────────────────────────────────────────────

interface NodeRowProps<T> {
  node: FolderNode<T>;
  depth: number;
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;
  folderActions?: FolderAction<T>[];
  onFolderClick?: (node: FolderNode<T>) => void;
  onContextMenu?: (e: React.MouseEvent, node: FolderNode<T>) => void;
  onOpenCtxMenu: (node: FolderNode<T>, x: number, y: number) => void;
  onOpenRunner: (node: FolderNode<T>) => void;
  renderItem?: (item: T, node: FolderNode<T>, depth: number) => ReactNode;
  onRename?: (id: string, newName: string) => void;
  accentColor: string;
  indentPx: number;
  contextMenuItems?: (node: FolderNode<T>) => ContextMenuItem[];
}

function NodeRow<T>({
  node, depth, expandedIds, toggleExpand,
  folderActions, onFolderClick, onContextMenu, onOpenCtxMenu, onOpenRunner,
  renderItem, onRename, accentColor, indentPx, contextMenuItems,
}: NodeRowProps<T>) {
  const isExpanded = expandedIds.has(node.id);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState(node.label);
  const renameRef = useRef<HTMLInputElement>(null);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    toggleExpand(node.id);
    onFolderClick?.(node);
  }, [toggleExpand, node, onFolderClick]);

  const handleDblClick = useCallback((e: React.MouseEvent) => {
    if (!onRename) return;
    e.stopPropagation();
    setRenameVal(node.label);
    setRenaming(true);
    setTimeout(() => renameRef.current?.select(), 0);
  }, [onRename, node.label]);

  const commitRename = useCallback(() => {
    setRenaming(false);
    if (renameVal.trim() && renameVal !== node.label) {
      onRename?.(node.id, renameVal.trim());
    }
  }, [renameVal, node.id, node.label, onRename]);

  const totalCount = (node.children?.length ?? 0) + (node.items?.length ?? 0);
  const hasCtxMenu = contextMenuItems ? contextMenuItems(node).length > 0 : false;

  const rowStyle: CSSProperties = {
    paddingLeft: `${8 + depth * indentPx}px`,
  };

  return (
    <div>
      {/* Folder row */}
      <div
        className="flex items-center gap-1.5 py-1.5 pr-2 rounded-md cursor-pointer group hover:bg-[var(--color-surface-hover)]"
        style={rowStyle}
        onClick={handleToggle}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu?.(e, node);
          if (hasCtxMenu) onOpenCtxMenu(node, e.clientX, e.clientY);
        }}
        onDoubleClick={handleDblClick}
      >
        {/* Chevron */}
        <span
          style={{
            display: 'inline-flex',
            flexShrink: 0,
            transition: 'transform 150ms',
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            color: 'var(--color-text-muted)',
          }}
        >
          <ChevronRightIcon size={12} />
        </span>

        {/* Folder icon */}
        <span style={{ color: accentColor, flexShrink: 0, display: 'inline-flex' }}>
          {isExpanded
            ? <FolderOpenIcon size={14} />
            : <FolderIcon size={14} />}
        </span>

        {/* Label or rename input */}
        {renaming ? (
          <input
            ref={renameRef}
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setRenaming(false);
            }}
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: 1, fontSize: 12,
              background: 'var(--color-input-bg)',
              border: `1px solid ${accentColor}`,
              borderRadius: 4, padding: '0 4px',
              color: 'var(--color-text-primary)',
              outline: 'none', minWidth: 0,
            }}
          />
        ) : (
          <span style={{ flex: 1, fontSize: 12, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.label}
          </span>
        )}

        {/* Item count */}
        {totalCount > 0 && !renaming && (
          <span style={{ fontSize: 10, color: 'var(--color-text-muted)', opacity: 0.6, flexShrink: 0 }}>
            {totalCount}
          </span>
        )}

        {/* Hover action buttons */}
        {folderActions && folderActions.length > 0 && (
          <div
            className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            {folderActions.map(action => {
              const disabled = isDisabled(action.disabled, node);
              const isRunAction = action.id === 'run';
              const isCtxAction = action.id === 'more' || action.id === 'context';
              return (
                <IconButtonView
                  key={action.id}
                  icon={action.icon}
                  size="sm"
                  tooltip={action.tooltip}
                  disabled={disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isRunAction) { onOpenRunner(node); return; }
                    if (isCtxAction && hasCtxMenu) {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      onOpenCtxMenu(node, rect.right, rect.bottom + 4);
                      return;
                    }
                    action.onClick(node, e);
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Children (sub-folders + items) */}
      {isExpanded && (
        <div style={{ marginLeft: depth > 0 ? 12 : 0, borderLeft: depth > 0 ? '1px solid var(--color-surface-border)' : 'none' }}>
          {node.children?.map(child => (
            <NodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              toggleExpand={toggleExpand}
              folderActions={folderActions}
              onFolderClick={onFolderClick}
              onContextMenu={onContextMenu}
              onOpenCtxMenu={onOpenCtxMenu}
              onOpenRunner={onOpenRunner}
              renderItem={renderItem}
              onRename={onRename}
              accentColor={accentColor}
              indentPx={indentPx}
              contextMenuItems={contextMenuItems}
            />
          ))}
          {node.items?.map((item, i) => (
            <div key={i}>
              {renderItem ? renderItem(item, node, depth + 1) : (
                <div style={{ paddingLeft: `${8 + (depth + 1) * indentPx}px`, fontSize: 12, color: 'var(--color-text-secondary)', padding: '4px 8px' }}>
                  {String(item)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Runner modal (DUI ModalView + TabView + ButtonView) ───────────────────────

interface RunnerModalProps<T> {
  node: FolderNode<T>;
  config: FolderRunnerConfig<T>;
  onClose: () => void;
}

function RunnerModal<T>({ node, config, onClose }: RunnerModalProps<T>) {
  const [activeTab, setActiveTab] = useState(config.tabs[0]?.id ?? '');
  const tabs: TabItem[] = config.tabs.map(t => ({ id: t.id, label: t.label, badge: t.badge, dot: t.dot }));
  const subtitle = typeof config.subtitle === 'function' ? config.subtitle(node) : config.subtitle;
  const accentColor = config.accentColor ?? 'var(--color-primary)';

  return (
    <ModalView
      open
      onClose={onClose}
      title={config.title ?? `Run — ${node.label}`}
      subtitle={subtitle}
      size="md"
      headerColor={accentColor}
      footerRight={
        <div style={{ display: 'flex', gap: 8 }}>
          {config.onSave && (
            <ButtonView
              variant="primary"
              size="md"
              onClick={() => { config.onSave?.(activeTab, node); onClose(); }}
            >
              {config.saveLabel ?? 'Save'}
            </ButtonView>
          )}
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {tabs.length > 1 && (
          <TabView
            tabs={tabs}
            activeTab={activeTab}
            onChange={setActiveTab}
            variant="chip"
            size="sm"
            accentColor={accentColor}
          />
        )}
        <div>
          {config.tabs.find(t => t.id === activeTab)?.content}
        </div>
      </div>
    </ModalView>
  );
}

// ── Main FolderView export ────────────────────────────────────────────────────

export function FolderView<T = unknown>({
  nodes,
  accentColor = 'var(--color-text-muted)',
  folderActions,
  contextMenuItems,
  runner,
  defaultExpandedIds,
  expandedIds: controlledExpandedIds,
  onToggle,
  renderItem,
  onRename,
  onFolderClick,
  onContextMenu,
  emptyLabel = 'No items',
  className = '',
  indentPx = 12,
}: FolderViewProps<T>) {
  const [internalExpandedIds, setInternalExpandedIds] = useState<Set<string>>(
    defaultExpandedIds ?? new Set()
  );
  const expandedIds = controlledExpandedIds ?? internalExpandedIds;

  const toggleExpand = useCallback((id: string) => {
    if (onToggle) {
      onToggle(id);
    } else {
      setInternalExpandedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    }
  }, [onToggle]);

  const [ctxMenu, setCtxMenu] = useState<ActiveCtxMenu<T> | null>(null);
  const [activeRunner, setActiveRunner] = useState<ActiveRunner<T> | null>(null);

  const openCtxMenu = useCallback((node: FolderNode<T>, x: number, y: number) => {
    setCtxMenu({ node, x, y });
  }, []);

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  const openRunner = useCallback((node: FolderNode<T>) => {
    setActiveRunner({ node });
  }, []);

  const closeRunner = useCallback(() => setActiveRunner(null), []);

  const ctxItems = ctxMenu && contextMenuItems ? contextMenuItems(ctxMenu.node) : [];

  if (nodes.length === 0) {
    return (
      <div style={{ padding: '24px 12px', textAlign: 'center', fontSize: 12, color: 'var(--color-text-muted)' }}>
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className={className}>
      {nodes.map(node => (
        <NodeRow
          key={node.id}
          node={node}
          depth={0}
          expandedIds={expandedIds}
          toggleExpand={toggleExpand}
          folderActions={folderActions}
          onFolderClick={onFolderClick}
          onContextMenu={onContextMenu}
          onOpenCtxMenu={openCtxMenu}
          onOpenRunner={openRunner}
          renderItem={renderItem}
          onRename={onRename}
          accentColor={accentColor}
          indentPx={indentPx}
          contextMenuItems={contextMenuItems}
        />
      ))}

      {/* Context menu portal */}
      <ContextMenuView
        open={!!ctxMenu}
        position={ctxMenu ? { x: ctxMenu.x, y: ctxMenu.y } : undefined}
        items={ctxItems}
        onClose={closeCtxMenu}
      />

      {/* Runner modal */}
      {activeRunner && runner && (
        <RunnerModal
          node={activeRunner.node}
          config={runner}
          onClose={closeRunner}
        />
      )}
    </div>
  );
}
