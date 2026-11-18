import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { TagChips } from '../../shared/tags/TagChips';
import { tagsFromData } from '../../shared/tags/request-tags';
import { postMsg } from '../../../vscode';
import { useScanStore } from '../../../store/scan-store';
import { useTabsStore } from '../../../store/tabs-store';
import type { Protocol, RequestTab } from '../../../store/tabs-store';
import { getDisplayMethod } from '../../../services/request/request-service';
import { useScrollRestore } from '../../../hooks/useScrollRestore';
import { useSidebarDataStore } from '../../../store/sidebar-data-store';
import { useToastStore } from '../../../store/toast-store';
import { useUiStateStore } from '../../../store/ui-state-store';
import { useAiPromptTemplatesStore } from '../../../store/prompt-template';
import { useAiFeaturesStore } from '../../../store/ai-features-store';
import { SwaggerImportWizard } from '../../workspace/SwaggerImportWizard';
import { ConfirmDialog, RunCollectionModal, CollectionPropertiesModal, ExportResponseOptionModal, ImportExportIcon, type CollectionProperties } from '../../shared';
import { findNodeById, findParentOfRequest, findRequestById, filterTree, collectAllIds, hasAnyRequests, openCollectionRequest, useStarredIds, toggleStar, starFirst, type CollectionTreeNode, type CollectionRequest } from '../../../services/collections';
import { METHOD_COLORS, getProtocolAccent } from '../../../colors';
import { PlusIcon, FolderIcon, FolderOpenIcon, PlayIcon, DocumentIcon, ServerIcon, RenameIcon, CopyIcon, SettingsIcon, TrashIcon, ExternalLinkIcon, PlusSquareIcon, ChevronRightIcon, MoreVerticalIcon, FilePlusIcon, FolderPlusIcon, FolderImportIcon, FolderExportIcon, ProtocolRestBadge, ProtocolGraphQLBadge, ProtocolRealtimeBadge, ProtocolGrpcBadge, ProtocolSoapBadge, ProtocolAiBadge, ProtocolMcpBadge, SparkleIcon, CloseCircleIcon, SearchIcon, HelpCircleIcon, SortIcon, CheckIcon, ExpandAllIcon, CollapseAllIcon, StarIcon, BracesIcon, FileTextIcon, BookOpenIcon } from '../../../icons';
import { SidebarSkeleton } from '../../shared/display/SidebarSkeleton';
import { AiEnvExtractModal } from '../../ai/AiEnvExtractModal';
import { AiCollectionOrganizerModal } from '../../ai/AiCollectionOrganizerModal';
import { AiApiFlowBuilderModal } from '../../ai/AiApiFlowBuilderModal';
import { AiChangelogModal } from '../../ai/AiChangelogModal';
import { AiAgentWorkflowModal } from '../../ai/AiAgentWorkflowModal';
import { AiApiDiscoveryModal } from '../../ai/AiApiDiscoveryModal';
import { AiReverseEngineerModal } from '../../ai/AiReverseEngineerModal';
import { AiApiDependencyGraph } from '../../ai/AiApiDependencyGraph';
import { AiConversationToCollectionModal } from '../../ai/AiConversationToCollectionModal';
import { AiSdkGeneratorModal } from '../../ai/AiSdkGeneratorModal';
import { AiComplianceCheckerModal } from '../../ai/AiComplianceCheckerModal';
import { AiScenarioGeneratorModal } from '../../ai/AiScenarioGeneratorModal';
import { AiApiRegressionDetector } from '../../ai/AiApiRegressionDetector';
import { AiMultiRequestOptimizer } from '../../ai/AiMultiRequestOptimizer';
import { AiRequestFromScreenshotModal } from '../../ai/AiRequestFromScreenshotModal';
import { AiRequestFromLogsModal } from '../../ai/AiRequestFromLogsModal';
import { AiDeepSecurityAuditModal } from '../../ai/AiDeepSecurityAuditModal';
import { AiSequenceComposerModal } from '../../ai/AiSequenceComposerModal';
import { AiCompatibilityScorerModal } from '../../ai/AiCompatibilityScorerModal';
import { AiDocGeneratorModal } from '../../ai/AiDocGeneratorModal';
import { AiSmartTestSuiteModal } from '../../ai/AiSmartTestSuiteModal';
import { InsomniaImportModal } from '../../power/InsomniaImportModal';
import { useWorkspaceEditable } from '../../../store/workspace-store';
import { lockEdits, COLLECTION_EDIT_IDS, READ_ONLY_REASON } from '../../../services/workspace/editable';
import { IconButtonView, ContextMenuView, TextInputView, InfoPopupView, ModalView, ButtonView, CheckboxView, UptimeMonitorIcon, type ContextMenuItem as DuiContextMenuItem } from '@salilvnair/dui';
import { logUiEvent } from '../../../store/ui-audit-store';
import { sendAiRequest } from '../../../services/ai/ai-client';
import './collections-tree.css';

// ────────────── Main Component ──────────────

/** View-only alphabetical sort (Postman "Folders first, A to Z") — folders already render before requests structurally, this just reorders each level by name. Does not touch stored sort_order. */
function sortTreeAlpha(nodes: CollectionTreeNode[]): CollectionTreeNode[] {
  return [...nodes]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(n => ({
      ...n,
      children: sortTreeAlpha(n.children),
      requests: [...n.requests].sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

/** A collection, folder or request being named in the tree, not yet created. */
interface Draft {
  kind: 'collection' | 'folder' | 'request';
  parentId: string | null;
  value: string;
  /** Sent, and waiting for the tree to come back with this id in it. */
  pendingId?: string;
  /** Bumped when a create comes back unanswered, so the row is a fresh one. */
  attempt?: number;
}

/** How long a create may go unanswered before the row is handed back. */
const CREATE_ANSWER_MS = 5000;

/** The drop target id of the strip that takes a folder out to the top level. */
const TOP_LEVEL = '__top__';

/** "New Folder", or "New Folder 2" when there is one already beside it. */
function freeName(base: string, taken: string[]): string {
  const names = new Set(taken.map(n => n.trim().toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  let n = 2;
  while (names.has(`${base} ${n}`.toLowerCase())) n++;
  return `${base} ${n}`;
}

/**
 * The row a new thing is named in, where it will appear.
 *
 * Enter or clicking away creates it; Escape, or an empty name, does not. The
 * guard is for the blur that follows Enter: a second create would make two.
 *
 * After Enter the row stays, read-only, until the tree comes back with the new
 * item in it. It used to vanish on the keypress, so a create the host never
 * answered looked exactly like one that worked and then disappeared.
 */
function DraftRow({ draft, depth, accent, onChange, onCommit, onCancel }: {
  draft: Draft;
  depth: number;
  accent: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const done = useRef(false);
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => { rowRef.current?.scrollIntoView({ block: 'nearest' }); }, []);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (commit) onCommit(); else onCancel();
  };
  const isRequest = draft.kind === 'request';
  const pending = !!draft.pendingId;
  return (
    <div
      ref={rowRef}
      className={`coll-draft${pending ? ' is-pending' : ''}`}
      aria-busy={pending || undefined}
      style={{ paddingLeft: isRequest ? 20 + depth * 12 : 8 + depth * 12, '--coll-accent': accent } as React.CSSProperties}
    >
      {isRequest
        ? <FilePlusIcon size={13} className="shrink-0" style={{ color: accent }} />
        : <FolderPlusIcon size={14} className="shrink-0" style={{ color: accent }} />}
      <input
        autoFocus
        className="coll-draft__input"
        value={draft.value}
        readOnly={pending}
        aria-label={isRequest ? 'New request name' : draft.kind === 'folder' ? 'New folder name' : 'New collection name'}
        onFocus={e => e.currentTarget.select()}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          e.stopPropagation();
          if (e.key === 'Enter') finish(true);
          if (e.key === 'Escape') finish(false);
        }}
        onBlur={() => finish(true)}
        onClick={e => e.stopPropagation()}
      />
      <span className="coll-draft__hint">{pending ? 'Creating' : 'Enter'}</span>
    </div>
  );
}

/** Realtime transports, which get a tree each but share one Protocol. */
const RT_TRANSPORTS = ['websocket', 'sse', 'socketio', 'mqtt'];

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

/** Asks already answered, so a remount does not start another. */
const answeredCreates = new Set<string>();

export function CollectionsPanel({ protocol = 'rest', createSignal = 0, startCreate }: {
  protocol?: string;
  /**
   * Bump this to open the create dialog from outside.
   *
   * A counter rather than a window message: more than one of these panels is
   * mounted at a time — the sidebar's and the workspace tab's — so a broadcast
   * is heard by both and opens two dialogs. A prop can only reach the instance
   * it was handed to.
   */
  createSignal?: number;
  /**
   * A one-off ask to start a new collection, by id. Honoured once whether this
   * panel was already on screen or is being mounted by the ask — the workspace
   * page opens a protocol's row and asks in the same breath, and a counter
   * takes its value at mount as the baseline and so never fires there.
   */
  startCreate?: string;
}) {
  const cachedTree = useSidebarDataStore(s => s.getCollections(protocol));
  const isLoaded = useSidebarDataStore(s => s.isCollectionsLoaded(protocol));
  const setStoreCollections = useSidebarDataStore(s => s.setCollections);
  const [tree, setTree] = useState<CollectionTreeNode[]>(cachedTree);
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // AI feature flags — used to gate collection AI context menu items
  const aiEnabled = useAiFeaturesStore(s => s.isEnabled);

  // AI NL Search state
  const [aiSearchActive, setAiSearchActive] = useState(false);
  const [aiSearching, setAiSearching] = useState(false);
  const [aiSearchResultIds, setAiSearchResultIds] = useState<string[]>([]);
  const aiSearchReqIdRef = useRef('');
  const aiSearchAccRef = useRef('');
  const resolveTemplate = useAiPromptTemplatesStore(s => s.resolve);

  // Collections info popup
  const [infoOpen, setInfoOpen] = useState(false);
  const infoAnchorRef = useRef<HTMLDivElement>(null);

  /*
    Something being created, drawn as a row in the tree with its name selected
    — the scratchpad's way, not a dialog. A dialog took the new thing out of the
    place it was going to live, and asked for a name before showing where.
    Nothing is written until the name is confirmed; Escape leaves no trace.
  */
  const [draft, setDraft] = useState<Draft | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  /* Select and delete, from the More menu: the ids ticked. A ticked folder
     carries everything inside it, the way deleting it does. */
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);

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

  /* False in a teammate's shared workspace: every edit below is disabled
     through this one flag, never hidden. */
  const canEdit = useWorkspaceEditable('collections');

  // Context menu state (collection folders — DUI ContextMenuView)
  const [contextMenu, setContextMenu] = useState<{ position: { x: number; y: number }; items: DuiContextMenuItem[] } | null>(null);
  // Request row context menu — DUI ContextMenuView
  const [reqContextMenu, setReqContextMenu] = useState<{ position: { x: number; y: number }; req: CollectionRequest } | null>(null);
  /** Per-person, persisted with the other UI prefs — never exported, never synced. */
  const starredIds = useStarredIds();
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);

  // Sidebar-view-only sort mode (Postman-style "Folders first, Default / A to Z") —
  // doesn't touch sort_order in storage, just how this tree renders.
  const sortPrefKey = `collections.sortMode.${protocol}`;
  const [sortMode, setSortModeState] = useState<'default' | 'alpha'>(() => (useUiStateStore.getState().getPref(sortPrefKey, 'default') as 'default' | 'alpha') || 'default');
  const setSortMode = (mode: 'default' | 'alpha') => { setSortModeState(mode); useUiStateStore.getState().setPref(sortPrefKey, mode); };

  // Properties modal state
  const [propertiesTarget, setPropertiesTarget] = useState<{ id: string; name: string; properties: CollectionProperties } | null>(null);
  const propertiesRequestedRef = useRef(false);
  const [headerMenu, setHeaderMenu] = useState<{ kind: 'importExport' | 'more'; x: number; y: number } | null>(null);

  // AI Environment Extractor modal state
  const [envExtractNode, setEnvExtractNode] = useState<CollectionTreeNode | null>(null);
  const [organizeNode, setOrganizeNode] = useState<CollectionTreeNode | null>(null);
  const [showFlowBuilder, setShowFlowBuilder] = useState(false);
  const [changelogNode, setChangelogNode] = useState<CollectionTreeNode | null>(null);
  const [agentWorkflowNode, setAgentWorkflowNode] = useState<CollectionTreeNode | null>(null);
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [showReverseEngineer, setShowReverseEngineer] = useState(false);
  // New AI/Power modal states
  const [dependencyGraphNode, setDependencyGraphNode] = useState<CollectionTreeNode | null>(null);
  const [showConversationToCollection, setShowConversationToCollection] = useState(false);
  const [sdkGeneratorNode, setSdkGeneratorNode] = useState<CollectionTreeNode | null>(null);
  const [complianceNode, setComplianceNode] = useState<CollectionTreeNode | null>(null);
  const [showScenarioGenerator, setShowScenarioGenerator] = useState(false);
  const [regressionNode, setRegressionNode] = useState<CollectionTreeNode | null>(null);
  const [optimizerNode, setOptimizerNode] = useState<CollectionTreeNode | null>(null);
  const [showScreenshotImport, setShowScreenshotImport] = useState(false);
  const [showLogsImport, setShowLogsImport] = useState(false);
  const [showInsomniaImport, setShowInsomniaImport] = useState(false);
  const [pendingExport, setPendingExport] = useState<{ type: string; collectionId?: string; formatLabel: string } | null>(null);
  const [showSwaggerImport, setShowSwaggerImport] = useState(false);

  /** Import → With AI. Each entry only when its AI feature is on. */
  const importAiItems: DuiContextMenuItem[] = [
    ...(aiEnabled('importFromScreenshot') ? [{ id: 'import-screenshot', label: 'Screenshot', shortcut: 'S', icon: <SparkleIcon size={14} style={{ color: 'var(--color-protocol-ai)' }} />, onClick: () => { setShowScreenshotImport(true); setHeaderMenu(null); } }] : []),
    ...(aiEnabled('importFromLogs') ? [{ id: 'import-logs', label: 'Server logs', shortcut: 'L', icon: <SparkleIcon size={14} style={{ color: 'var(--color-protocol-ai)' }} />, onClick: () => { setShowLogsImport(true); setHeaderMenu(null); } }] : []),
    ...(aiEnabled('describeWorkflow') ? [{ id: 'ai-conversation', label: 'Describe a workflow', shortcut: 'W', icon: <SparkleIcon size={14} style={{ color: 'var(--color-protocol-ai)' }} />, onClick: () => { setShowConversationToCollection(true); setHeaderMenu(null); } }] : []),
    ...(aiEnabled('generateScenario') ? [{ id: 'ai-scenario', label: 'Generate a scenario', shortcut: 'G', icon: <SparkleIcon size={14} style={{ color: 'var(--color-success)' }} />, onClick: () => { setShowScenarioGenerator(true); setHeaderMenu(null); } }] : []),
    ...(aiEnabled('reverseEngineer') ? [{ id: 'ai-reverse-engineer', label: 'Reverse engineer', shortcut: 'R', icon: <SparkleIcon size={14} style={{ color: 'var(--color-protocol-ai)' }} />, onClick: () => { setShowReverseEngineer(true); setHeaderMenu(null); } }] : []),
  ];

  /**
   * Export, grouped by what you hand over: a collection for another client,
   * a spec, or docs for people. One list for the header menu (every
   * collection) and a collection's own menu (`collectionId`).
   */
  const exportItems = (collectionId: string | undefined, close: () => void, size: number): DuiContextMenuItem[] => {
    const scope = collectionId ? { collectionId } : {};
    const icon = (color: string) => <FolderExportIcon size={size} style={{ color }} />;
    return [
      {
        id: 'export-collection', label: 'Collection', shortcut: 'C', icon: <FolderIcon size={size} style={{ color: 'var(--color-text-muted)' }} />,
        children: [
          { id: 'export-daakia', label: 'Daakia JSON', shortcut: 'J', icon: icon('var(--color-warning)'), onClick: () => { setPendingExport({ type: 'exportCollectionDaakia', ...scope, formatLabel: 'Daakia JSON' }); close(); } },
          { id: 'export-postman', label: 'Postman', shortcut: 'M', icon: icon('var(--color-warning)'), onClick: () => { setPendingExport({ type: 'exportCollectionPostman', ...scope, formatLabel: 'Postman' }); close(); } },
          { id: 'export-insomnia', label: 'Insomnia', shortcut: 'I', icon: icon('var(--color-info)'), onClick: () => { postMsg({ type: 'exportCollectionInsomnia', ...scope }); close(); } },
          { id: 'export-bruno', label: 'Bruno (.bru)', shortcut: 'B', icon: icon('var(--color-warning)'), onClick: () => { postMsg({ type: 'exportCollectionBruno', ...scope }); close(); } },
          { id: 'export-httpie', label: 'HTTPie', shortcut: 'H', icon: icon('var(--color-success)'), onClick: () => { postMsg({ type: 'exportCollectionHttpie', ...scope }); close(); } },
        ],
      },
      { id: 'export-openapi', label: 'OpenAPI 3.1', shortcut: 'O', icon: <BracesIcon size={size} style={{ color: 'var(--color-success)' }} />, onClick: () => { postMsg({ type: 'exportCollectionOpenApi', ...scope }); close(); } },
      {
        id: 'export-docs-group', label: 'API docs', shortcut: 'D', icon: <BookOpenIcon size={size} style={{ color: 'var(--color-info)' }} />,
        children: [
          { id: 'export-docs', label: 'Markdown', shortcut: 'M', icon: icon('var(--color-info)'), onClick: () => { postMsg({ type: 'exportCollectionDocs', ...scope }); close(); } },
          { id: 'export-docs-html', label: 'HTML page', shortcut: 'H', icon: icon('var(--color-info)'), onClick: () => { postMsg({ type: 'exportCollectionDocsHtml', ...scope }); close(); } },
        ],
      },
    ];
  };
  // Sprint 11 state
  const [showSequenceComposer, setShowSequenceComposer] = useState(false);
  const [knowledgeGraphNode, setKnowledgeGraphNode] = useState<CollectionTreeNode | null>(null);
  const [regressionGuardNode, setRegressionGuardNode] = useState<CollectionTreeNode | null>(null);
  const [collectionOptimizerNode, setCollectionOptimizerNode] = useState<CollectionTreeNode | null>(null);
  // Sprint 12 state
  const [compatibilityScorerNode, setCompatibilityScorerNode] = useState<CollectionTreeNode | null>(null);
  const [securityAuditNode, setSecurityAuditNode] = useState<CollectionTreeNode | null>(null);
  const [docGeneratorNode, setDocGeneratorNode] = useState<CollectionTreeNode | null>(null);
  const [smartTestSuiteNode, setSmartTestSuiteNode] = useState<CollectionTreeNode | null>(null);

  // Scroll position persistence
  const scrollRef = useScrollRestore(`collections.${protocol}`);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'collectionsData') {
        // Only process responses matching this panel's protocol. Fail closed on a
        // missing tag too — an untagged broadcast is never safe to apply to whichever
        // panel happens to be mounted right now (was the root cause of imports randomly
        // showing up under the wrong protocol tab).
        if (msg.protocol !== protocol) return;
        const data = msg.collections ?? [];
        setTree(data);
        setStoreCollections(protocol, data);
      }
      if (msg.type === 'collectionPropertiesData') {
        // Only open modal if user explicitly requested properties via context menu
        if (!propertiesRequestedRef.current) return;
        propertiesRequestedRef.current = false;
        const props = msg.properties ?? {};
        /*
          Functional, so the name survives.

          `propertiesTarget` here came from the closure this listener was
          registered in — null on first open — so the name the context menu
          had just put there was overwritten with an empty string every time,
          and the dialog said "Untitled collection" for a collection that
          plainly had one.
        */
        setPropertiesTarget(prev => ({
          id: msg.id,
          name: prev?.name || '',
          properties: {
            headers: props.headers ?? [],
            authType: props.authType ?? 'none',
            authData: props.authData ?? {},
            variables: props.variables ?? [],
            preRequestScript: props.preRequestScript ?? '',
            postResponseScript: props.postResponseScript ?? (props.testScript as string) ?? '',
            // Absent on every collection saved before execution overrides
            // existed, which is the common case.
            settings: props.settings ?? {},
          },
        }));
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

  // ── AI NL Search ──────────────────────────────────────────────────────────

  /** Flatten all requests from the entire tree for the AI context */
  const getAllRequests = useCallback((nodes: CollectionTreeNode[]): { id: string; method: string; name: string; url: string }[] => {
    const result: { id: string; method: string; name: string; url: string }[] = [];
    const walk = (n: CollectionTreeNode) => {
      n.requests.forEach(r => result.push({ id: r.id, method: r.method || 'GET', name: r.name || '', url: r.url || '' }));
      n.children.forEach(walk);
    };
    nodes.forEach(walk);
    return result;
  }, []);

  // Listen for AI search stream
  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (!msg || msg.tabId !== aiSearchReqIdRef.current) return;

      if (msg.type === 'ai:chunk') {
        const delta = (msg.delta as string) || (msg.text as string) || '';
        aiSearchAccRef.current += delta;
      }
      if (msg.type === 'ai:complete') {
        const msgPayload = msg.message as Record<string, unknown> | undefined;
        const content = aiSearchAccRef.current || (msgPayload?.content as string) || '';
        const stripped = content.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/im, '').trim();
        try {
          const ids = JSON.parse(stripped) as string[];
          setAiSearchResultIds(Array.isArray(ids) ? ids : []);
        } catch {
          setAiSearchResultIds([]);
        }
        setAiSearching(false);
        aiSearchAccRef.current = '';
      }
      if (msg.type === 'ai:error') {
        setAiSearching(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleAiSearch = useCallback(() => {
    const query = search.trim();
    if (!query) return;

    const allRequests = getAllRequests(tree);
    if (allRequests.length === 0) return;

    setAiSearching(true);
    setAiSearchActive(true);
    setAiSearchResultIds([]);
    aiSearchAccRef.current = '';

    const pid = `ai-nl-search-${Date.now()}`;
    aiSearchReqIdRef.current = pid;

    const requestsText = allRequests
      .map(r => `${r.id} | ${r.method} | ${r.name} | ${r.url}`)
      .join('\n');

    const systemPrompt = resolveTemplate('rest.collection.search.system');
    const userPrompt = resolveTemplate('rest.collection.search', { query, requests: requestsText });

    sendAiRequest({
      tabId: pid,
      provider: '', model: '', baseUrl: '',
      stage: 'rest.collection.search',
      screen: 'Collections',
      systemPrompts: [systemPrompt],
      userPrompt,
      conversation: [],
      tools: [],
      settings: {
        temperature: 0.1,
        maxTokens: 256,
        stream: true,
        topP: 1,
        stopSequences: [],
        responseFormat: 'text',
        frequencyPenalty: 0,
        presencePenalty: 0,
        seed: null,
      },
      mcpServerConfigs: [],
    });
  }, [search, tree, getAllRequests, resolveTemplate]);

  const clearAiSearch = useCallback(() => {
    setAiSearchActive(false);
    setAiSearching(false);
    setAiSearchResultIds([]);
    aiSearchAccRef.current = '';
  }, []);

  // ── Actions ──

  const openNewCollection = () => {
    if (!canEdit) return;
    setSearch('');
    setDraft({ kind: 'collection', parentId: null, value: freeName('New Collection', tree.map(n => n.name)) });
  };

  /* The caller asks for this panel's own New dialog rather than reimplementing
     the create flow, so there is one of them.

     Only a *change* counts. `> 0` fires on mount as well, and the value is
     already above zero once the button has been used, so a tab switch reopened
     the dialog with nobody having asked. */
  const openNewRef = useRef(openNewCollection);
  openNewRef.current = openNewCollection;
  useEffect(() => {
    if (!startCreate || answeredCreates.has(startCreate)) return;
    answeredCreates.add(startCreate);
    openNewRef.current();
  }, [startCreate]);
  const seenCreate = useRef(createSignal);
  useEffect(() => {
    if (createSignal === seenCreate.current) return;
    seenCreate.current = createSignal;
    openNewCollection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createSignal]);

  /* The workspace tab asks for this panel's own New dialog rather than
     reimplementing the create flow, so there is one of them. */
  useEffect(() => {
    const onAsk = (e: MessageEvent) => {
      if ((e.data as { type?: string })?.type !== 'collections:new') return;
      /* Only the panel on screen. Hidden copies stay mounted — the workspace
         page's, another protocol's — and an autofocused row in one of those
         would take the caret from the one being looked at. */
      if (!rootRef.current || rootRef.current.offsetParent === null) return;
      openNewRef.current();
    };
    window.addEventListener('message', onAsk);
    return () => window.removeEventListener('message', onAsk);
  }, []);

  const handleDeleteAllCollections = () => {
    postCollMsg({ type: 'clearCollections' });
    setShowDeleteAllConfirm(false);
  };

  /* A folder or request is drafted inside its parent, so the parent opens. */
  const openNewFolder = (parentId: string) => {
    if (!canEdit) return;
    const parent = findNodeById(tree, parentId);
    setExpandedIds(prev => new Set([...prev, parentId]));
    setDraft({ kind: 'folder', parentId, value: freeName('New Folder', parent?.children.map(c => c.name) ?? []) });
  };

  const openNewRequest = (parentId: string) => {
    if (!canEdit) return;
    const parent = findNodeById(tree, parentId);
    setExpandedIds(prev => new Set([...prev, parentId]));
    setDraft({ kind: 'request', parentId, value: freeName('New Request', parent?.requests.map(r => r.name) ?? []) });
  };

  const renderDraft = (depth: number) => draft && (
    <DraftRow
      key={`draft:${draft.kind}:${draft.parentId ?? ''}:${draft.attempt ?? 0}`}
      draft={draft}
      depth={depth}
      accent={getProtocolAccent(protocol as any)}
      onChange={value => setDraft(d => (d ? { ...d, value } : d))}
      onCommit={() => commitDraft(draft)}
      onCancel={() => setDraft(null)}
    />
  );

  /* An empty name is a change of mind, not a request for "Untitled". */
  const commitDraft = (d: Draft) => {
    const name = d.value.trim();
    if (!name) { setDraft(null); return; }
    const id = createNamed(d.kind, d.parentId, name);
    setDraft({ ...d, value: name, pendingId: id });
  };

  /* The row goes when the tree has the new item in it — not before. */
  useEffect(() => {
    if (!draft?.pendingId) return;
    const id = draft.pendingId;
    const arrived = draft.kind === 'request' ? !!findRequestById(tree, id) : !!findNodeById(tree, id);
    if (arrived) setDraft(null);
  }, [tree, draft]);

  /* Nothing came back: the host is not answering, or refused without a word.
     Hand the row back with the name still in it, rather than lose it. */
  useEffect(() => {
    if (!draft?.pendingId) return;
    const id = draft.pendingId;
    const timer = setTimeout(() => {
      setDraft(d => (d?.pendingId === id ? { ...d, pendingId: undefined, attempt: (d.attempt ?? 0) + 1 } : d));
      const what = draft.kind === 'request' ? 'request' : draft.kind === 'folder' ? 'folder' : 'collection';
      useToastStore.getState().addToast({
        type: 'error',
        message: `The ${what} "${draft.value}" was not created. Daakia's backend did not answer. Press Enter to try again.`,
      });
    }, CREATE_ANSWER_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.pendingId]);

  const createNamed = (kind: Draft['kind'], parentId: string | null, name: string): string => {
    const id = crypto.randomUUID();
    const modalParentId = parentId;
    if (kind === 'request') {
      /*
        The label this protocol's requests carry — GQL, GRPC, SOAP, AI, MCP,
        WS/SSE/SIO/MQTT, or the HTTP verb for REST. Derived by the same
        function Save Request uses, so a request created from the tree and one
        saved from a tab cannot disagree about what they are.

        The realtime family needs the extra step: its trees are keyed per
        transport, and 'sse' is not a Protocol — the tab is a websocket tab
        that carries the transport in authData, which is where getDisplayMethod
        reads it from.
      */
      const rt = RT_TRANSPORTS.includes(protocol) ? protocol : undefined;
      const tabProtocol = (rt ? 'websocket' : protocol) as Protocol;
      const authData: Record<string, string> = rt ? { rt_protocol: rt } : {};
      const method = getDisplayMethod({ protocol: tabProtocol, method: 'GET', authData } as RequestTab);
      logUiEvent('collection.open', { name, collectionId: modalParentId });
      postCollMsg({
        type: 'saveRequestToCollection',
        collectionId: modalParentId,
        request: {
          id,
          name,
          method,
          url: '',
          data: JSON.stringify({
            headers: [],
            params: [],
            bodyMode: 'json',
            bodyRaw: '',
            bodyContentType: 'application/json',
            bodyFormData: [],
            bodyUrlEncoded: [],
            authType: 'none',
            authData: {},
          }),
        },
      });
      // Also open in a tab
      const { addTab } = useTabsStore.getState();
      /* Told, not inherited: addTab falls back to activeProtocol, which is
         the protocol of whichever tab is in front rather than of the tree the
         request was created in. */
      addTab({ name, protocol: tabProtocol, authData, method: 'GET', url: '',
               collectionId: modalParentId ?? undefined, requestId: id });
    } else {
      logUiEvent('collection.create', { name, parentId: modalParentId });
      postCollMsg({ type: 'createCollection', id, name, parentId: modalParentId });
      setExpandedIds(prev => new Set([...prev, id]));
    }
    return id;
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
      logUiEvent('collection.delete', { id: deleteTarget.id });
      postCollMsg({ type: 'deleteCollection', id: deleteTarget.id });
    } else {
      logUiEvent('collection.delete', { id: deleteTarget.id, type: 'request' });
      postCollMsg({ type: 'deleteRequestFromCollection', requestId: deleteTarget.id });
    }
    setDeleteTarget(null);
  };

  const stopSelecting = () => { setSelecting(false); setPicked(new Set()); setConfirmBulk(false); };
  const togglePick = (id: string) => setPicked(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  /* What a delete of the ticked rows sends: each ticked folder that is not
     already inside a ticked one, and each ticked request outside them. The
     rest is counted, so the confirmation can say what goes along. */
  const bulkPlan = useMemo(() => {
    const folders: CollectionTreeNode[] = [];
    const requests: CollectionRequest[] = [];
    let innerFolders = 0;
    let innerRequests = 0;
    const walk = (nodes: CollectionTreeNode[], covered: boolean) => {
      for (const n of nodes) {
        const takes = !covered && picked.has(n.id);
        if (takes) folders.push(n); else if (covered) innerFolders++;
        const inside = covered || takes;
        for (const r of n.requests) {
          if (inside) innerRequests++;
          else if (picked.has(r.id)) requests.push(r);
        }
        walk(n.children, inside);
      }
    };
    walk(tree, false);
    return { folders, requests, innerFolders, innerRequests };
  }, [tree, picked]);
  const pickedCount = bulkPlan.folders.length + bulkPlan.requests.length;
  const allPicked = tree.length > 0 && tree.every(n => picked.has(n.id));

  const deleteSelected = () => {
    for (const f of bulkPlan.folders) {
      logUiEvent('collection.delete', { id: f.id });
      postCollMsg({ type: 'deleteCollection', id: f.id });
    }
    for (const r of bulkPlan.requests) {
      logUiEvent('collection.delete', { id: r.id, type: 'request' });
      postCollMsg({ type: 'deleteRequestFromCollection', requestId: r.id });
    }
    stopSelecting();
  };

  /* Escape leaves select mode, unless the confirmation is up and takes it. */
  useEffect(() => {
    if (!selecting || confirmBulk) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') stopSelecting(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selecting, confirmBulk]);

  const selection = selecting ? { picked, toggle: togglePick, accent: getProtocolAccent(protocol as any) } : null;

  const handleOpenRequest =(req: CollectionRequest, forceNewTab = false) => {
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
    /* Reordering is an edit too. */
    if (!canEdit) { e.preventDefault(); return; }
    setDragItem({ id, type, parentId });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string, targetType: 'collection' | 'request') => {
    e.stopPropagation();
    if (!dragItem || dragItem.id === targetId) return;
    /* A folder cannot go inside itself, or inside anything inside it: the
       host would write a parent loop and the folder would vanish from the tree. */
    if (dragItem.type === 'collection') {
      const dragged = findNodeById(tree, dragItem.id);
      if (dragged && collectAllIds([dragged]).has(targetId)) { if (dropTarget) setDropTarget(null); return; }
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

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

  /*
    Folders move on the drop, the way scratchpads do. A "Move folder?" dialog
    after every drag asked about the one thing the drag had already said.
  */
  const executeFolderMove = (dragId: string, dragParentId: string | null, targetId: string, position: 'before' | 'inside' | 'after') => {
    if (position === 'inside') {
      postCollMsg({ type: 'moveCollection', id: dragId, newParentId: targetId });
    } else {
      const targetNode = findNodeById(tree, targetId);
      const targetParentId = targetNode?.parent_id ?? null;
      if (dragParentId !== targetParentId) {
        postCollMsg({ type: 'moveCollection', id: dragId, newParentId: targetParentId });
      }
      const siblings = targetParentId
        ? findNodeById(tree, targetParentId)?.children ?? []
        : tree;
      const siblingIds = siblings.map(s => s.id).filter(id => id !== dragId);
      const targetIdx = siblingIds.indexOf(targetId);
      const insertIdx = position === 'after' ? targetIdx + 1 : targetIdx;
      siblingIds.splice(insertIdx, 0, dragId);
      postCollMsg({ type: 'reorderCollections', ids: siblingIds });
    }
    if (position === 'inside') setExpandedIds(prev => new Set([...prev, targetId]));
  };

  /* Out of every folder: a folder dropped here becomes a collection of its own. */
  const dropToTop = (e: React.DragEvent) => {
    e.preventDefault();
    const d = dragItem;
    setDragItem(null);
    setDropTarget(null);
    if (d?.type === 'collection' && d.parentId) postCollMsg({ type: 'moveCollection', id: d.id, newParentId: null });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragItem || !dropTarget) { setDragItem(null); setDropTarget(null); return; }

    const { id: dragId, type: dragType, parentId: dragParentId } = dragItem;
    const { id: targetId, position } = dropTarget;

    setDragItem(null);
    setDropTarget(null);

    if (dragType === 'collection') {
      /* A folder dropped on a request goes into that request's folder. */
      if (findNodeById(tree, targetId)) executeFolderMove(dragId, dragParentId, targetId, position);
      else {
        const owner = findParentOfRequest(tree, targetId);
        if (owner && owner.id !== dragId) executeFolderMove(dragId, dragParentId, owner.id, 'inside');
      }
      return;
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
  };

  const handleDragEnd = () => {
    setDragItem(null);
    setDropTarget(null);
  };

  // ── Context Menu Handlers ──

  const openCollectionContextMenu = (e: React.MouseEvent, node: CollectionTreeNode) => {
    e.preventDefault();
    e.stopPropagation();
    const hasReqs = hasAnyRequests(node);
    const targetId = node.id;
    const targetName = node.name;
    const close = () => setContextMenu(null);

    const catWorkflow: DuiContextMenuItem[] = [
      ...(aiEnabled('extractVariables')    ? [{ id: 'ai-extract-env',          label: 'Extract Variables',      shortcut: 'V', disabled: !hasReqs, icon: <SparkleIcon size={13} style={{ color: 'var(--color-success)' }} />,      onClick: () => { const n = findNodeById(tree, targetId); if (n) setEnvExtractNode(n); close(); } }] : []),
      ...(aiEnabled('organizeWithAi')      ? [{ id: 'ai-organize',              label: 'Organize with AI',       shortcut: 'O', disabled: !hasReqs, icon: <SparkleIcon size={13} style={{ color: 'var(--color-warning)' }} />,      onClick: () => { const n = findNodeById(tree, targetId); if (n) setOrganizeNode(n); close(); } }] : []),
      ...(aiEnabled('buildApiFlow')        ? [{ id: 'ai-flow-builder',          label: 'Build API Flow',         shortcut: 'F',                     icon: <SparkleIcon size={13} style={{ color: 'var(--color-primary)' }} />,      onClick: () => { setShowFlowBuilder(true); close(); } }] : []),
      ...(aiEnabled('testWithAiAgent')     ? [{ id: 'ai-agent-workflow',        label: 'Test with AI Agent',     shortcut: 'T', disabled: !hasReqs, icon: <SparkleIcon size={13} style={{ color: 'var(--color-success)' }} />,      onClick: () => { const n = findNodeById(tree, targetId); if (n) setAgentWorkflowNode(n); close(); } }] : []),
      ...(aiEnabled('collectionOptimizer') ? [{ id: 'ai-collection-optimizer',  label: 'AI Optimize',          shortcut: 'A', disabled: !hasReqs, icon: <SparkleIcon size={13} style={{ color: 'var(--color-protocol-ai)' }} />,  onClick: () => { const n = findNodeById(tree, targetId); if (n) setCollectionOptimizerNode(n); close(); } }] : []),
      ...(aiEnabled('sequenceComposer')    ? [{ id: 'ai-sequence-composer',     label: 'Sequence Composer',    shortcut: 'Q', disabled: !hasReqs, icon: <SparkleIcon size={13} style={{ color: 'var(--color-primary)' }} />,      onClick: () => { setShowSequenceComposer(true); close(); } }] : []),
    ];
    const catAnalysis: DuiContextMenuItem[] = [
      ...(aiEnabled('generateChangelog')   ? [{ id: 'ai-changelog',         label: 'Generate Changelog',    shortcut: 'C', disabled: !hasReqs, icon: <SparkleIcon size={13} style={{ color: 'var(--color-warning)' }} />, onClick: () => { const n = findNodeById(tree, targetId); if (n) setChangelogNode(n); close(); } }] : []),
      ...(aiEnabled('dependencyGraph')     ? [{ id: 'ai-dependency-graph',  label: 'Dependency Graph',      shortcut: 'G', disabled: !hasReqs, icon: <SparkleIcon size={13} style={{ color: 'var(--color-info)' }} />,    onClick: () => { const n = findNodeById(tree, targetId); if (n) setDependencyGraphNode(n); close(); } }] : []),
      ...(aiEnabled('checkCompliance')     ? [{ id: 'ai-compliance',        label: 'Check Compliance',      shortcut: 'L', disabled: !hasReqs, icon: <SparkleIcon size={13} style={{ color: 'var(--color-error)' }} />,   onClick: () => { const n = findNodeById(tree, targetId); if (n) setComplianceNode(n); close(); } }] : []),
      ...(aiEnabled('generateSdk')         ? [{ id: 'ai-sdk-generator',     label: 'Generate SDK',          shortcut: 'K', disabled: !hasReqs, icon: <SparkleIcon size={13} style={{ color: 'var(--color-success)' }} />, onClick: () => { const n = findNodeById(tree, targetId); if (n) setSdkGeneratorNode(n); close(); } }] : []),
      ...(aiEnabled('docAutoGenerator')    ? [{ id: 'ai-doc-generator',     label: 'Generate Docs',       shortcut: 'D', disabled: !hasReqs, icon: <SparkleIcon size={13} style={{ color: 'var(--color-success)' }} />, onClick: () => { const n = findNodeById(tree, targetId); if (n) setDocGeneratorNode(n); close(); } }] : []),
      ...(aiEnabled('apiChangelogMonitor') ? [{ id: 'ai-changelog-monitor', label: 'Changelog Monitor',   shortcut: 'M', disabled: !hasReqs, icon: <SparkleIcon size={13} style={{ color: 'var(--color-warning)' }} />, onClick: () => { const n = findNodeById(tree, targetId); if (n) setChangelogNode(n); close(); } }] : []),
    ];
    const catSecurity: DuiContextMenuItem[] = [
      ...(aiEnabled('deepSecurityAudit')   ? [{ id: 'ai-security-audit',  label: 'Security Audit',     shortcut: 'U', disabled: !hasReqs, icon: <SparkleIcon size={13} style={{ color: 'var(--color-error)' }} />,   onClick: () => { const n = findNodeById(tree, targetId); if (n) setSecurityAuditNode(n); close(); } }] : []),
      ...(aiEnabled('compatibilityScorer') ? [{ id: 'ai-compatibility',   label: 'Compare Versions',   shortcut: 'Y', disabled: !hasReqs, icon: <SparkleIcon size={13} style={{ color: 'var(--color-info)' }} />,    onClick: () => { const n = findNodeById(tree, targetId); if (n) setCompatibilityScorerNode(n); close(); } }] : []),
      ...(aiEnabled('optimizeRequests')    ? [{ id: 'ai-optimizer',       label: 'Optimize Requests',    shortcut: 'Z', disabled: !hasReqs, icon: <SparkleIcon size={13} style={{ color: 'var(--color-warning)' }} />, onClick: () => { const n = findNodeById(tree, targetId); if (n) setOptimizerNode(n); close(); } }] : []),
      ...(aiEnabled('regressionDetector')  ? [{ id: 'ai-regression',      label: 'Regression Detector',  shortcut: 'E', disabled: !hasReqs, icon: <SparkleIcon size={13} style={{ color: 'var(--color-error)' }} />,   onClick: () => { const n = findNodeById(tree, targetId); if (n) setRegressionNode(n); close(); } }] : []),
      ...(aiEnabled('regressionGuardian')  ? [{ id: 'ai-regression-guard',label: 'Regression Guard',   shortcut: 'R', disabled: !hasReqs, icon: <SparkleIcon size={13} style={{ color: 'var(--color-error)' }} />,   onClick: () => { const n = findNodeById(tree, targetId); if (n) setRegressionGuardNode(n); close(); } }] : []),
    ];
    const catTesting: DuiContextMenuItem[] = [
      ...(aiEnabled('smartTestSuiteGen') ? [{ id: 'ai-smart-test-suite', label: 'Smart Test Suite',    shortcut: 'X', disabled: !hasReqs, icon: <SparkleIcon size={13} style={{ color: 'var(--color-success)' }} />, onClick: () => { const n = findNodeById(tree, targetId); if (n) setSmartTestSuiteNode(n); close(); } }] : []),
      ...(aiEnabled('apiKnowledgeGraph') ? [{ id: 'ai-knowledge-graph',  label: 'API Knowledge Graph', shortcut: 'H', disabled: !hasReqs, icon: <SparkleIcon size={13} style={{ color: 'var(--color-info)' }} />,    onClick: () => { const n = findNodeById(tree, targetId); if (n) setKnowledgeGraphNode(n); close(); } }] : []),
    ];

    const aiSub: DuiContextMenuItem[] = [];
    if (catWorkflow.length) aiSub.push({ id: 'ai-cat-workflow', label: 'Workflow & Organization', icon: <SparkleIcon size={13} style={{ color: 'var(--color-primary)' }} />, children: catWorkflow });
    if (catAnalysis.length) aiSub.push({ id: 'ai-cat-analysis', label: 'Analysis & Docs',         icon: <SparkleIcon size={13} style={{ color: 'var(--color-warning)' }} />, children: catAnalysis });
    if (catSecurity.length) aiSub.push({ id: 'ai-cat-security', label: 'Security & Quality',      icon: <SparkleIcon size={13} style={{ color: 'var(--color-error)' }} />,   children: catSecurity });
    if (catTesting.length)  aiSub.push({ id: 'ai-cat-testing',  label: 'Testing & Intelligence',  icon: <SparkleIcon size={13} style={{ color: 'var(--color-success)' }} />,  children: catTesting });

    const items: DuiContextMenuItem[] = [
      { id: 'new-request', label: 'New Request',    shortcut: 'Q', icon: <PlusIcon size={13} style={{ color: 'var(--color-success)' }} />,        onClick: () => { openNewRequest(targetId); close(); } },
      { id: 'new-folder',  label: 'New Folder',     shortcut: 'F', icon: <FolderIcon size={13} style={{ color: 'var(--color-warning)' }} />,       onClick: () => { openNewFolder(targetId); close(); } },
      { id: 'sep1', label: '', separator: true },
      { id: 'run', label: 'Run Collection', shortcut: 'R', disabled: !hasReqs, icon: <PlayIcon size={13} style={{ color: 'var(--color-success)' }} />, onClick: () => { setRunnerCollectionId(targetId); setRunnerCollectionName(targetName); close(); } },
      { id: 'sep2', label: '', separator: true },
      { id: 'rename',    label: 'Rename',    shortcut: 'N', icon: <RenameIcon size={13} style={{ color: 'var(--color-ctx-rename)' }} />,     onClick: () => { setRenamingId(targetId); setRenameValue(targetName); setRenamingType('collection'); close(); } },
      { id: 'duplicate', label: 'Duplicate', shortcut: 'D', icon: <CopyIcon size={13} style={{ color: 'var(--color-ctx-duplicate)' }} />,   onClick: () => { postCollMsg({ type: 'duplicateCollection', id: targetId }); close(); } },
      { id: 'sep3', label: '', separator: true },
      ...(aiSub.length ? [{ id: 'ai-actions', label: 'AI Actions', icon: <SparkleIcon size={14} style={{ color: 'var(--color-protocol-ai)' }} />, children: aiSub }] : []),
      {
        id: 'export', label: 'Export', icon: <FolderExportIcon size={13} style={{ color: 'var(--color-warning)' }} />,
        children: exportItems(targetId, close, 13),
      },
      {
        id: 'mock-collection', label: 'Mock', icon: <ServerIcon size={13} style={{ color: 'var(--color-warning)' }} />, disabled: !hasReqs,
        onClick: () => {
          const collectAll = (n: CollectionTreeNode): CollectionRequest[] => [...n.requests, ...n.children.flatMap(collectAll)];
          const reqs = collectAll(node).map(r => ({ name: r.name, method: r.method, url: r.url }));
          useTabsStore.getState().openMockServerTab();
          setTimeout(() => window.postMessage({ type: 'mockRequestFromSidebar', protocol, name: targetName, requests: reqs }, '*'), 250);
          close();
        },
      },
      {
        id: 'sort', label: 'Sort', icon: <SortIcon size={13} />,
        children: [
          { id: 'sort-default', label: 'Folders first, Default', icon: sortMode === 'default' ? <CheckIcon size={13} style={{ color: 'var(--color-success)' }} /> : <span style={{ width: 13, display: 'inline-block' }} />, onClick: () => { setSortMode('default'); close(); } },
          { id: 'sort-alpha', label: 'Folders first, A to Z', icon: sortMode === 'alpha' ? <CheckIcon size={13} style={{ color: 'var(--color-success)' }} /> : <span style={{ width: 13, display: 'inline-block' }} />, onClick: () => { setSortMode('alpha'); close(); } },
        ],
      },
      { id: 'sep4', label: '', separator: true },
      { id: 'properties', label: 'Properties', shortcut: 'P', icon: <SettingsIcon size={13} style={{ color: 'var(--color-text-muted)' }} />, onClick: () => { propertiesRequestedRef.current = true; setPropertiesTarget({ id: targetId, name: targetName, properties: { headers: [], authType: 'none', authData: {}, variables: [], preRequestScript: '', postResponseScript: '' } }); postMsg({ type: 'getCollectionProperties', id: targetId }); close(); } },
      { id: 'sep5', label: '', separator: true },
      { id: 'delete', label: 'Delete', danger: true, shortcut: '⌫', icon: <TrashIcon size={13} style={{ color: 'var(--color-error)' }} />, onClick: () => { setDeleteTarget({ id: targetId, type: 'collection', name: targetName }); close(); } },
    ];
    setContextMenu({ position: { x: e.clientX, y: e.clientY }, items });
  };

  const openRequestContextMenu = (e: React.MouseEvent, req: CollectionRequest) => {
    e.preventDefault();
    e.stopPropagation();
    setReqContextMenu({ position: { x: e.clientX, y: e.clientY }, req });
  };

  // When AI search is active, filter tree to show only matched request IDs
  /*
    What a collection holds, by method, counted down the whole subtree.

    Folders nest, and a count that stopped at the top level would report a
    number nobody recognises for any collection organised into folders — which
    is most of them.
  */
  const countMethods = useCallback((collectionId: string): Record<string, number> => {
    const node = findNodeById(tree, collectionId);
    const out: Record<string, number> = {};
    const walk = (n: CollectionTreeNode) => {
      for (const r of n.requests ?? []) {
        const m = (r.method ?? 'GET').toUpperCase();
        out[m] = (out[m] ?? 0) + 1;
      }
      for (const child of n.children ?? []) walk(child);
    };
    if (node) walk(node);
    return out;
  }, [tree]);

  const filteredTree = aiSearchActive && aiSearchResultIds.length > 0
    ? (() => {
        const matchSet = new Set(aiSearchResultIds);
        const filterToIds = (nodes: CollectionTreeNode[]): CollectionTreeNode[] =>
          nodes.reduce<CollectionTreeNode[]>((acc, node) => {
            const matchedRequests = node.requests.filter(r => matchSet.has(r.id));
            const filteredChildren = filterToIds(node.children);
            if (matchedRequests.length > 0 || filteredChildren.length > 0) {
              acc.push({ ...node, requests: matchedRequests, children: filteredChildren });
            }
            return acc;
          }, []);
        return filterToIds(tree);
      })()
    : filterTree(tree, search);

  /*
    Starred requests ride at the top of their own folder, after whichever
    sort is in force — so "Folders first, A to Z" still holds within the
    starred and within the rest.
  */
  const sortedTree = starFirst(
    sortMode === 'alpha' ? sortTreeAlpha(filteredTree) : filteredTree,
    starredIds,
  );

  /*
    Expand and collapse, whole or by subtree.

    A collection of any size is unreadable fully expanded and useless fully
    collapsed, and reaching either state meant clicking every folder. History
    had these; collections, which nest deeper, did not.

    Expansion is stored as the set of open ids, so "expand" is a union and
    "collapse" is a difference — a subtree can be opened without disturbing
    anything outside it, which is what makes the per-row buttons worth having
    rather than only the two at the top.
  */
  const expandAll = useCallback(() => {
    setExpandedIds(collectAllIds(sortedTree));
  }, [sortedTree]);

  const collapseAll = useCallback(() => setExpandedIds(new Set()), []);

  const expandSubtree = useCallback((node: CollectionTreeNode) => {
    const ids = collectAllIds([node]);
    setExpandedIds(prev => new Set([...prev, ...ids]));
  }, []);

  const collapseSubtree = useCallback((node: CollectionTreeNode) => {
    const ids = collectAllIds([node]);
    setExpandedIds(prev => {
      const next = new Set(prev);
      // The node itself included: collapsing a folder's contents while
      // leaving the folder open shows an empty folder, not a closed one.
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  // Auto-expand when searching
  useEffect(() => {
    if (search) {
      setExpandedIds(collectAllIds(filteredTree));
    }
  }, [search]);

  // Auto-expand when AI search returns results
  useEffect(() => {
    if (aiSearchActive && aiSearchResultIds.length > 0) {
      setExpandedIds(collectAllIds(filteredTree));
    }
  }, [aiSearchResultIds, aiSearchActive]);

  return (
    <div ref={rootRef} className="flex flex-col h-full" style={{ '--coll-accent': getProtocolAccent(protocol as any) } as React.CSSProperties}>
      {/* Header label */}
      <div className="px-4 py-3 border-b border-[var(--color-surface-border)] text-[13px] text-[var(--color-text-secondary)] flex items-center gap-2">
        <span className="flex-shrink-0" style={{ color: getProtocolAccent(protocol as any) }}>
          <ProtocolHeaderIcon protocol={protocol} />
        </span>
        <span>Collections</span>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-[var(--color-surface-border)] flex items-center gap-1.5">
        <div style={{ flex: 1, minWidth: 0 }}>
          <TextInputView
            placeholder={aiSearchActive ? 'AI search results' : 'Search…'}
            value={search}
            onChange={(e) => { setSearch(e.target.value); if (aiSearchActive) clearAiSearch(); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && search.trim()) handleAiSearch(); }}
            size="md"
            width="fw"
            iconLeft={<SearchIcon size={11} />}
            iconRight={aiSearchActive ? (
              <button
                type="button"
                onClick={clearAiSearch}
                title="Clear AI search"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', opacity: 0.7, padding: 0 }}
                onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.opacity = '1')}
                onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.opacity = '0.7')}
              >
                <CloseCircleIcon size={13} />
              </button>
            ) : undefined}
            style={aiSearchActive ? { borderColor: 'color-mix(in srgb, var(--color-primary) 50%, var(--color-input-border))' } : undefined}
          />
        </div>
        <IconButtonView
          icon={<SparkleIcon size={13} className={aiSearching ? 'animate-pulse' : ''} />}
          size="md"
          tooltip={aiSearching ? 'Searching…' : 'Search with AI (natural language)'}
          accentColor={aiSearchActive ? 'var(--color-primary)' : undefined}
          active={aiSearchActive}
          disabled={aiSearching || !search.trim()}
          onClick={() => { if (search.trim()) handleAiSearch(); }}
        />
      </div>
      {/* AI search status hint */}
      {aiSearchActive && (
        <div className="px-3 py-1 text-[10px] flex items-center gap-1" style={{ color: 'var(--color-primary)', backgroundColor: 'color-mix(in srgb, var(--color-primary) 5%, transparent)' }}>
          <SparkleIcon size={10} />
          {aiSearching
            ? 'Searching across all requests…'
            : `${aiSearchResultIds.length} result${aiSearchResultIds.length !== 1 ? 's' : ''} for "${search}"`}
        </div>
      )}

      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-surface-border)]">
        <div className="flex items-center gap-1.5">
          <ButtonView
            variant="ghost"
            size="sm"
            iconLeft={<PlusIcon size={14} />}
            onClick={openNewCollection}
            disabled={!canEdit}
            title={canEdit ? undefined : READ_ONLY_REASON}
            accentColor={getProtocolAccent(protocol as any)}
          >
            New
          </ButtonView>
          {aiEnabled('autoDiscovery') && (
            <IconButtonView
              icon={<SparkleIcon size={12} />}
              size="sm"
              tooltip={canEdit ? 'AI Auto-Discovery Agent — probe a base URL to discover endpoints' : READ_ONLY_REASON}
              accentColor="var(--color-protocol-ai)"
              disabled={!canEdit}
              onClick={() => setShowDiscovery(true)}
            />
          )}
        </div>

        <div className="flex items-center gap-1.5 relative">
          {/* Before the help and import controls: these act on what is on
              screen, and those are about the panel itself. */}
          <IconButtonView
            icon={<ExpandAllIcon size={13} className="text-[var(--color-info)]" />}
            size="sm"
            tooltip="Expand all"
            onClick={expandAll}
          />
          <IconButtonView
            icon={<CollapseAllIcon size={13} className="text-[var(--color-warning)]" />}
            size="sm"
            tooltip="Collapse all"
            onClick={collapseAll}
          />
          <div ref={infoAnchorRef} style={{ display: 'inline-flex' }}>
            <IconButtonView
              icon={<HelpCircleIcon size={14} />}
              size="sm"
              tooltip="Collections help"
              active={infoOpen}
              style={{ borderRadius: '50%' }}
              onClick={() => setInfoOpen(o => !o)}
            />
          </div>
          <InfoPopupView
            open={infoOpen}
            onClose={() => setInfoOpen(false)}
            anchorEl={infoAnchorRef.current}
            title="Collections"
            description="Organize your API requests into folders and collections. Right-click for context menu options."
            items={[
              { code: '+ New', description: 'Create requests or folders' },
              { code: 'Drag & Drop', description: 'Reorder items freely' },
              { code: 'Right-click', description: 'Rename, duplicate, delete' },
              { code: 'Run', description: 'Execute all requests in order' },
            ]}
            footer="Tip: Group related endpoints into folders for easy navigation."
            onWikiOpen={() => useTabsStore.getState().openDaakiaWikiTab('collections-env')}
          />
          <IconButtonView
            icon={<ImportExportIcon size="1.1em" />}
            size="default"
            tooltip="Import / Export"
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setHeaderMenu(headerMenu?.kind === 'importExport' ? null : { kind: 'importExport', x: rect.right, y: rect.bottom + 4 });
            }}
          />

          {/* Always rendered. This was gated on `tree.length > 0`, which hid the
              only way in to "Scan code for requests…" precisely when somebody had
              no collections — the moment scanning a repository is most useful. The
              destructive entry below is what depends on there being something. */}
          <IconButtonView
            icon={<MoreVerticalIcon size={14} />}
            size="default"
            tooltip="More Options"
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setHeaderMenu(headerMenu?.kind === 'more' ? null : { kind: 'more', x: rect.right, y: rect.bottom + 4 });
            }}
          />
          <ContextMenuView
            open={headerMenu?.kind === 'importExport'}
            anchorEl={null}
            position={headerMenu?.kind === 'importExport' ? { x: headerMenu.x, y: headerMenu.y } : undefined}
            onClose={() => setHeaderMenu(null)}
            items={lockEdits([
              /*
                Grouped by where the thing comes from or goes, so each menu opens
                three rows tall instead of eleven. The URL import sits on top on
                its own: it is the one that reads a running service.
              */
              {
                id: 'import', label: 'Import', icon: <FolderImportIcon size={14} style={{ color: 'var(--color-accent)' }} />,
                children: [
                  { id: 'import-swagger-url', label: 'Swagger / OpenAPI URL', shortcut: 'U', icon: <BracesIcon size={14} style={{ color: 'var(--color-success)' }} />, onClick: () => { setShowSwaggerImport(true); setHeaderMenu(null); } },
                  { id: 'import-sep', label: '', separator: true },
                  {
                    id: 'import-file', label: 'From a file', shortcut: 'F', icon: <FileTextIcon size={14} style={{ color: 'var(--color-text-muted)' }} />,
                    children: [
                      { id: 'import-daakia', label: 'Daakia JSON', shortcut: 'D', icon: <FolderImportIcon size={14} style={{ color: 'var(--color-accent)' }} />, onClick: () => { postMsg({ type: 'importCollectionDaakia' }); setHeaderMenu(null); } },
                      { id: 'import-postman', label: 'Postman', shortcut: 'P', icon: <FolderImportIcon size={14} style={{ color: 'var(--color-method-post)' }} />, onClick: () => { postMsg({ type: 'importCollectionRequest' }); setHeaderMenu(null); } },
                      { id: 'import-openapi', label: 'OpenAPI file', shortcut: 'O', icon: <FolderImportIcon size={14} style={{ color: 'var(--color-success)' }} />, onClick: () => { postMsg({ type: 'importCollectionRequest' }); setHeaderMenu(null); } },
                      { id: 'import-bruno', label: 'Bruno', shortcut: 'B', icon: <FolderImportIcon size={14} style={{ color: 'var(--color-warning)' }} />, onClick: () => { postMsg({ type: 'importBrunoRequest' }); setHeaderMenu(null); } },
                      { id: 'import-insomnia', label: 'Insomnia', shortcut: 'I', icon: <FolderImportIcon size={14} style={{ color: 'var(--color-protocol-ai)' }} />, onClick: () => { setShowInsomniaImport(true); setHeaderMenu(null); } },
                      { id: 'import-har', label: 'HAR', shortcut: 'H', icon: <FolderImportIcon size={14} style={{ color: 'var(--color-primary)' }} />, onClick: () => { postMsg({ type: 'importCollectionRequest' }); setHeaderMenu(null); } },
                    ],
                  },
                  ...(importAiItems.length ? [{
                    id: 'import-ai', label: 'With AI', shortcut: 'A', icon: <SparkleIcon size={14} style={{ color: 'var(--color-protocol-ai)' }} />,
                    children: importAiItems,
                  } as DuiContextMenuItem] : []),
                ],
              },
              {
                id: 'export', label: 'Export', icon: <FolderExportIcon size={14} style={{ color: 'var(--color-warning)' }} />,
                // No collectionId — these export every collection, the same set "Export as JSON"
                // always did (not just the protocol this panel is showing).
                children: exportItems(undefined, () => setHeaderMenu(null), 14),
              },
            ] as DuiContextMenuItem[], canEdit, COLLECTION_EDIT_IDS)}
          />
          <ContextMenuView
            open={headerMenu?.kind === 'more'}
            anchorEl={null}
            position={headerMenu?.kind === 'more' ? { x: headerMenu.x, y: headerMenu.y } : undefined}
            onClose={() => setHeaderMenu(null)}
            items={lockEdits([
              /*
                Not under Import, deliberately. Import takes a file somebody
                exported — Postman, OpenAPI, HAR — and this reads a codebase.
                Filing it with the importers would send people looking for a
                file to choose.
              */
              {
                id: 'scan-code',
                label: 'Scan code for requests…',
                description: 'Read routes out of a repository and build a collection',
                icon: <SearchIcon size={14} />,
                onClick: () => { useScanStore.getState().openScan(); setHeaderMenu(null); },
              },
              ...(tree.length > 0 ? [
                { id: 'scan-sep', label: '', separator: true },
                {
                  id: 'select-delete', label: 'Select and delete', shortcut: 'S', danger: true,
                  description: 'Tick folders and requests, then delete them together',
                  icon: <CheckIcon size={14} style={{ color: 'var(--color-error)' }} />,
                  onClick: () => { setDraft(null); setPicked(new Set()); setSelecting(true); setHeaderMenu(null); },
                },
                { id: 'delete-all', label: 'Delete all collections', danger: true, shortcut: 'D', icon: <TrashIcon size={14} style={{ color: 'var(--color-error)' }} />, onClick: () => { setShowDeleteAllConfirm(true); setHeaderMenu(null); } },
              ] as DuiContextMenuItem[] : []),
            ] as DuiContextMenuItem[], canEdit, COLLECTION_EDIT_IDS)}
          />
        </div>
      </div>

      {/* Select and delete: the tick for everything, the count, and the two ways out. */}
      {selecting && (
        <div className="coll-select-bar" role="toolbar" aria-label="Select and delete">
          <CheckboxView
            checked={allPicked}
            indeterminate={picked.size > 0 && !allPicked}
            size="sm"
            accentColor={getProtocolAccent(protocol as any)}
            label={pickedCount ? `${pickedCount} selected` : 'Select all'}
            onChange={() => setPicked(allPicked ? new Set() : new Set(tree.map(n => n.id)))}
          />
          <span className="flex-1" />
          <ButtonView size="sm" variant="ghost" onClick={stopSelecting}>Cancel</ButtonView>
          {/* Plain, like "+ New": an icon and a word in the colour, no fill. */}
          <ButtonView
            size="sm"
            variant="ghost"
            accentColor="var(--color-error)"
            iconLeft={<TrashIcon size={14} />}
            disabled={!pickedCount}
            onClick={() => setConfirmBulk(true)}
          >
            Delete
          </ButtonView>
        </div>
      )}

      {/* Tree */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-1" data-context-menu="collection-tree" onContextMenu={(e) => e.preventDefault()}>
        {!isLoaded ? (
          <SidebarSkeleton rows={7} />
        ) : filteredTree.length === 0 && !draft ? (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center">
            <FolderIcon size={40} strokeWidth={1} className="text-[var(--color-text-muted)] opacity-40 mb-3" />
            <p className="text-[12px] text-[var(--color-text-muted)] mb-3">No collections yet</p>
            {/* `text-white` was hardcoded here, which is wrong on a light
                theme; ButtonView reads the token that follows the theme. */}
            <ButtonView
              variant="primary"
              size="sm"
              iconLeft={<PlusIcon size={13} />}
              onClick={openNewCollection}
              accentColor={getProtocolAccent(protocol as any)}
            >
              New Collection
            </ButtonView>
          </div>
        ) : (<>
          {sortedTree.map(node => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              draft={draft}
              renderDraft={renderDraft}
              selection={selection}
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
              onExpandSubtree={expandSubtree}
              onCollapseSubtree={collapseSubtree}
              onCollectionContextMenu={openCollectionContextMenu}
              onRequestContextMenu={openRequestContextMenu}
              starredIds={starredIds}
              dragItem={dragItem}
              dropTarget={dropTarget}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            />
          ))}
          {draft?.parentId === null && renderDraft(0)}
          {/* Only while a folder is on the move and has somewhere to come out of. */}
          {dragItem?.type === 'collection' && dragItem.parentId && (
            <div
              className={`coll-droptop${dropTarget?.id === TOP_LEVEL ? ' is-over' : ''}`}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; if (dropTarget?.id !== TOP_LEVEL) setDropTarget({ id: TOP_LEVEL, position: 'inside' }); }}
              onDragLeave={handleDragLeave}
              onDrop={dropToTop}
            >
              Drop here to make it a collection of its own
            </div>
          )}
        </>)}
      </div>

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

      {/* Collection folder context menu — DUI */}
      {contextMenu && (
        <ContextMenuView
          open={true}
          anchorEl={null}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          items={lockEdits(contextMenu.items, canEdit, COLLECTION_EDIT_IDS)}
        />
      )}

      {/* Request context menu — DUI ContextMenuView */}
      {reqContextMenu && (
        <ContextMenuView
          open={true}
          anchorEl={null}
          position={reqContextMenu.position}
          onClose={() => setReqContextMenu(null)}
          items={lockEdits([
            {
              id: 'star',
              label: starredIds.has(reqContextMenu.req.id) ? 'Unstar' : 'Star',
              shortcut: 'S',
              icon: <StarIcon size={13} filled={starredIds.has(reqContextMenu.req.id)} style={{ color: 'var(--color-warning)' }} />,
              onClick: () => { toggleStar(reqContextMenu.req.id); setReqContextMenu(null); },
            },
            { id: 'sep-star', label: '', separator: true },
            { id: 'open', label: 'Open', shortcut: 'O', icon: <ExternalLinkIcon size={13} style={{ color: 'var(--color-info)' }} />, onClick: () => { handleOpenRequest(reqContextMenu.req); setReqContextMenu(null); } },
            { id: 'open-new-tab', label: 'Open in New Tab', shortcut: 'T', icon: <PlusSquareIcon size={13} style={{ color: 'var(--color-info)' }} />, onClick: () => { handleOpenRequest(reqContextMenu.req, true); setReqContextMenu(null); } },
            { id: 'rename', label: 'Rename', shortcut: 'N', icon: <RenameIcon size={13} style={{ color: 'var(--color-ctx-rename)' }} />, onClick: () => { setRenamingId(reqContextMenu.req.id); setRenameValue(reqContextMenu.req.name); setRenamingType('request'); setReqContextMenu(null); } },
            { id: 'duplicate', label: 'Duplicate', shortcut: 'D', icon: <CopyIcon size={13} style={{ color: 'var(--color-ctx-duplicate)' }} />, onClick: () => { postCollMsg({ type: 'duplicateRequest', id: reqContextMenu.req.id }); setReqContextMenu(null); } },
            { id: 'sep1', label: '', separator: true },
            { id: 'document-request', label: 'Document Request', shortcut: 'M', icon: <DocumentIcon size={13} style={{ color: 'var(--color-info)' }} />, onClick: () => {
              const req = reqContextMenu.req;
              setDocGeneratorNode({ id: req.id, name: req.name, parent_id: null, sort_order: 0, children: [], requests: [req] });
              setReqContextMenu(null);
            } },
            { id: 'monitor-request', label: 'Monitor Request', shortcut: 'O', icon: <UptimeMonitorIcon size={13} style={{ color: 'var(--color-success)' }} />, onClick: () => {
              const req = reqContextMenu.req;
              window.postMessage({ type: 'openMonitorFor', name: req.name, method: req.method, url: req.url }, '*');
              setReqContextMenu(null);
            } },
            { id: 'mock-request', label: 'Mock Request', shortcut: 'K', icon: <ServerIcon size={13} style={{ color: 'var(--color-warning)' }} />, onClick: () => {
              const req = reqContextMenu.req;
              useTabsStore.getState().openMockServerTab();
              setTimeout(() => window.postMessage({ type: 'mockRequestFromSidebar', protocol, name: req.name, method: req.method, url: req.url }, '*'), 250);
              setReqContextMenu(null);
            } },
            { id: 'sep2', label: '', separator: true },
            { id: 'delete', label: 'Delete', danger: true, shortcut: '⌫', icon: <TrashIcon size={13} style={{ color: 'var(--color-error)' }} />, onClick: () => { setDeleteTarget({ id: reqContextMenu.req.id, type: 'request', name: reqContextMenu.req.name }); setReqContextMenu(null); } },
          ] as DuiContextMenuItem[], canEdit, COLLECTION_EDIT_IDS)}
        />
      )}

      {/* Collection properties modal */}
      {propertiesTarget && (
        <CollectionPropertiesModal
          open={true}
          collectionId={propertiesTarget.id}
          collectionName={propertiesTarget.name}
          methodCounts={countMethods(propertiesTarget.id)}
          properties={propertiesTarget.properties}
          onSave={(props) => {
            postMsg({ type: 'updateCollectionProperties', id: propertiesTarget.id, properties: props });
            setPropertiesTarget(null);
          }}
          onClose={() => setPropertiesTarget(null)}
        />
      )}

      {confirmBulk && (() => {
        const { folders, requests, innerFolders, innerRequests } = bulkPlan;
        const n = (k: number, word: string) => `${k} ${word}${k === 1 ? '' : 's'}`;
        const what = [folders.length ? n(folders.length, 'folder') : '', requests.length ? n(requests.length, 'request') : ''].filter(Boolean).join(' and ');
        const along = [innerFolders ? n(innerFolders, 'subfolder') : '', innerRequests ? n(innerRequests, 'request') : ''].filter(Boolean).join(' and ');
        return (
          <ConfirmDialog
            title={`Delete ${what}?`}
            message={`${along ? `Everything inside ${folders.length === 1 ? 'it goes too' : 'them goes too'}: ${along}. ` : ''}${folders.length + requests.length === 1 ? 'It goes' : 'They go'} to the Bin, where ${folders.length + requests.length === 1 ? 'it' : 'they'} can be restored.`}
            confirmLabel="Delete"
            danger
            onConfirm={deleteSelected}
            onCancel={() => setConfirmBulk(false)}
          />
        );
      })()}

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

      {pendingExport && (
        <ExportResponseOptionModal
          open
          formatLabel={pendingExport.formatLabel}
          accentColor="var(--color-warning)"
          onConfirm={(includeResponse) => {
            postMsg({ type: pendingExport.type, collectionId: pendingExport.collectionId, includeResponse });
            setPendingExport(null);
          }}
          onCancel={() => setPendingExport(null)}
        />
      )}

      {envExtractNode && (
        <AiEnvExtractModal
          collectionNode={envExtractNode}
          onClose={() => setEnvExtractNode(null)}
        />
      )}

      {organizeNode && (
        <AiCollectionOrganizerModal
          collectionNode={organizeNode}
          protocol={protocol}
          onClose={() => setOrganizeNode(null)}
          onApplied={() => setOrganizeNode(null)}
        />
      )}

      {showFlowBuilder && (
        <AiApiFlowBuilderModal
          protocol={protocol}
          onClose={() => setShowFlowBuilder(false)}
        />
      )}

      {changelogNode && (
        <AiChangelogModal
          collectionNode={changelogNode}
          onClose={() => setChangelogNode(null)}
        />
      )}

      {agentWorkflowNode && (
        <AiAgentWorkflowModal
          collectionId={agentWorkflowNode.id}
          collectionName={agentWorkflowNode.name}
          protocol={protocol}
          onClose={() => setAgentWorkflowNode(null)}
        />
      )}

      {showDiscovery && (
        <AiApiDiscoveryModal
          onClose={() => setShowDiscovery(false)}
        />
      )}

      {showReverseEngineer && (
        <AiReverseEngineerModal
          onClose={() => setShowReverseEngineer(false)}
        />
      )}

      {dependencyGraphNode && (
        <AiApiDependencyGraph
          onClose={() => setDependencyGraphNode(null)}
        />
      )}

      {showConversationToCollection && (
        <AiConversationToCollectionModal
          onClose={() => setShowConversationToCollection(false)}
        />
      )}

      {sdkGeneratorNode && (
        <AiSdkGeneratorModal
          onClose={() => setSdkGeneratorNode(null)}
        />
      )}

      {complianceNode && (
        <AiComplianceCheckerModal
          onClose={() => setComplianceNode(null)}
        />
      )}

      {showScenarioGenerator && (
        <AiScenarioGeneratorModal
          contextProtocol={protocol}
          onClose={() => setShowScenarioGenerator(false)}
        />
      )}

      {regressionNode && (
        <AiApiRegressionDetector
          onClose={() => setRegressionNode(null)}
        />
      )}

      {optimizerNode && (
        <AiMultiRequestOptimizer
          onClose={() => setOptimizerNode(null)}
        />
      )}

      {showScreenshotImport && (
        <AiRequestFromScreenshotModal
          onClose={() => setShowScreenshotImport(false)}
        />
      )}

      {showLogsImport && (
        <AiRequestFromLogsModal
          contextProtocol={protocol}
          onClose={() => setShowLogsImport(false)}
        />
      )}

      {showSwaggerImport && <SwaggerImportWizard onClose={() => setShowSwaggerImport(false)} />}
      {showInsomniaImport && (
        <InsomniaImportModal
          onClose={() => setShowInsomniaImport(false)}
        />
      )}

      {/*
        The scan's own modal. It owns its whole conversation with the host —
        pick, inspect, run, review — so it takes no props and closes itself;
        the panel's only part in it is the menu item that opens it.
      */}

      {/* Sprint 11 modals */}
      {collectionOptimizerNode && (
        <AiCollectionOrganizerModal
          collectionNode={collectionOptimizerNode}
          protocol={protocol}
          onClose={() => setCollectionOptimizerNode(null)}
          onApplied={() => setCollectionOptimizerNode(null)}
        />
      )}
      {knowledgeGraphNode && (
        <AiApiDependencyGraph
          onClose={() => setKnowledgeGraphNode(null)}
        />
      )}
      {regressionGuardNode && (
        <AiApiRegressionDetector
          onClose={() => setRegressionGuardNode(null)}
        />
      )}
      {showSequenceComposer && (
        <AiSequenceComposerModal
          protocol={protocol}
          onClose={() => setShowSequenceComposer(false)}
        />
      )}

      {/* Sprint 12 modals */}
      {securityAuditNode && (
        <AiDeepSecurityAuditModal
          collectionNode={securityAuditNode}
          onClose={() => setSecurityAuditNode(null)}
        />
      )}
      {compatibilityScorerNode && (
        <AiCompatibilityScorerModal
          collectionNode={compatibilityScorerNode}
          onClose={() => setCompatibilityScorerNode(null)}
        />
      )}
      {docGeneratorNode && (
        <AiDocGeneratorModal
          collectionNode={docGeneratorNode}
          onClose={() => setDocGeneratorNode(null)}
        />
      )}
      {smartTestSuiteNode && (
        <AiSmartTestSuiteModal
          collectionNode={smartTestSuiteNode}
          onClose={() => setSmartTestSuiteNode(null)}
        />
      )}
    </div>
  );
}

// ────────────── Recursive Tree Node ──────────────

interface TreeSelection { picked: ReadonlySet<string>; toggle: (id: string) => void; accent: string }

/** A row's tick. Its own click, so ticking a folder does not also fold it. */
function PickBox({ selection, id, covered }: { selection: TreeSelection; id: string; covered?: boolean }) {
  return (
    <span className="coll-pick" onClick={e => e.stopPropagation()}>
      <CheckboxView
        checked={!!covered || selection.picked.has(id)}
        disabled={covered}
        size="xs"
        accentColor={selection.accent}
        onChange={() => selection.toggle(id)}
      />
    </span>
  );
}

interface TreeNodeProps {
  node: CollectionTreeNode;
  depth: number;
  /** A folder or request being named, drawn inside the folder it goes in. */
  draft: Draft | null;
  renderDraft: (depth: number) => React.ReactNode;
  /** Select mode: the ticked ids, and the tree's accent for the boxes. */
  selection: TreeSelection | null;
  /** Inside a ticked folder: ticked by it, and not to be unticked alone. */
  covered?: boolean;
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
  onExpandSubtree: (node: CollectionTreeNode) => void;
  onCollapseSubtree: (node: CollectionTreeNode) => void;
  onCollectionContextMenu: (e: React.MouseEvent, node: CollectionTreeNode) => void;
  onRequestContextMenu: (e: React.MouseEvent, req: CollectionRequest) => void;
  /** Starred request ids — the rows already float, this is what marks them. */
  starredIds: Set<string>;
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
  node, depth, draft, renderDraft, selection, covered, expandedIds, toggleExpand,
  renamingId, renameValue, setRenameValue, renameRef, handleRename, startRename, setRenamingId,
  onDelete, onDeleteRequest, onNewFolder, onNewRequest, onOpenRequest, onRunCollection,
  onExpandSubtree, onCollapseSubtree,
  onCollectionContextMenu, onRequestContextMenu, starredIds,
  dragItem, dropTarget, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
}: TreeNodeProps) {
  const isExpanded = expandedIds.has(node.id);
  const totalItems = node.children.length + node.requests.length;
  const isDragOver = dropTarget?.id === node.id;
  const dropPosition = isDragOver ? dropTarget.position : null;
  const picked = !!selection && (covered || selection.picked.has(node.id));
  /* Everything below a ticked folder is ticked by it. */
  const childCovered = !!covered || (!!selection && selection.picked.has(node.id));

  return (
    <div className="mb-0.5">
      {/* Drop indicator - before */}
      {dropPosition === 'before' && (
        <div className="h-0.5 bg-[var(--coll-accent,var(--color-primary))] rounded mx-2" />
      )}
      {/* Folder row */}
      <div
        draggable={!selection}
        onDragStart={(e) => onDragStart(e, node.id, 'collection', node.parent_id)}
        onDragOver={(e) => onDragOver(e, node.id, 'collection')}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        onClick={() => toggleExpand(node.id)}
        onContextMenu={(e) => onCollectionContextMenu(e, node)}
        data-context-menu="collection"
        className={`px-2 py-1.5 rounded-md hover:bg-[var(--color-item-hover-bg)] cursor-pointer group flex items-center gap-1.5 ${
          dropPosition === 'inside' ? 'coll-row--drop' : ''
        } ${dragItem?.id === node.id ? 'opacity-40' : ''} ${picked ? 'coll-row--picked' : ''}`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {selection && <PickBox selection={selection} id={node.id} covered={covered} />}
        {/* Chevron */}
        <ChevronRightIcon
          size={12}
          className={`text-[var(--color-text-muted)] shrink-0 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
        />
        {/* Folder icon, in the tree's own accent, as the scratchpad's folders are */}
        {isExpanded ? (
          <FolderOpenIcon size={14} className="text-[var(--coll-accent,var(--color-primary))] shrink-0" />
        ) : (
          <FolderIcon size={14} className="text-[var(--coll-accent,var(--color-primary))] shrink-0" />
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
        {/* Hover actions.
            Before the count, not after it. They are hidden with `opacity-0`
            rather than `display: none` — so that the count does not jump
            sideways when the row is hovered — which means they hold their
            width all the time. With the count to their left it floated a
            hundred pixels short of the row's edge, against a blank strip. */}
        {!selection && <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <ActionBtn title="Add Request" onClick={(e) => { e.stopPropagation(); onNewRequest(node.id); }}>
            <FilePlusIcon size={13} />
          </ActionBtn>
          <ActionBtn title="New Folder" onClick={(e) => { e.stopPropagation(); onNewFolder(node.id); }}>
            <FolderPlusIcon size={13} />
          </ActionBtn>
          <ActionBtn title="Run Collection" onClick={(e) => { e.stopPropagation(); onRunCollection(node.id, node.name); }} disabled={!hasAnyRequests(node)}>
            <PlayIcon size={13} />
          </ActionBtn>
          {/* Only on a folder that contains folders. A leaf folder's chevron
              already does the whole job, and a second control that does the
              same thing reads as a different one. */}
          {node.children.length > 0 && (
            isExpanded ? (
              <ActionBtn title="Collapse this folder and everything in it"
                         onClick={(e) => { e.stopPropagation(); onCollapseSubtree(node); }}>
                <CollapseAllIcon size={13} />
              </ActionBtn>
            ) : (
              <ActionBtn title="Expand this folder and everything in it"
                         onClick={(e) => { e.stopPropagation(); onExpandSubtree(node); }}>
                <ExpandAllIcon size={13} />
              </ActionBtn>
            )
          )}
          <ActionBtn title="More Options" onClick={(e) => onCollectionContextMenu(e, node)}>
            <MoreVerticalIcon size={13} />
          </ActionBtn>
        </div>}

        {/* Item count, at the row's edge. */}
        {totalItems > 0 && (
          <span className="text-[10px] text-[var(--color-text-muted)] opacity-60 tabular-nums">
            {totalItems}
          </span>
        )}
      </div>

      {/* Drop indicator - after */}
      {dropPosition === 'after' && !isExpanded && (
        <div className="h-0.5 bg-[var(--coll-accent,var(--color-primary))] rounded mx-2" />
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
              draft={draft}
              renderDraft={renderDraft}
              selection={selection}
              covered={childCovered}
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
              onExpandSubtree={onExpandSubtree}
              onCollapseSubtree={onCollapseSubtree}
              onCollectionContextMenu={onCollectionContextMenu}
              onRequestContextMenu={onRequestContextMenu}
              starredIds={starredIds}
              dragItem={dragItem}
              dropTarget={dropTarget}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
            />
          ))}
          {draft?.kind === 'folder' && draft.parentId === node.id && renderDraft(depth + 1)}
          {/* Requests */}
          {node.requests.map(req => {
            const isReqDragOver = dropTarget?.id === req.id;
            const reqDropPos = isReqDragOver ? dropTarget.position : null;
            return (
              <div key={req.id}>
                {reqDropPos === 'before' && <div className="h-0.5 bg-[var(--coll-accent,var(--color-primary))] rounded mx-2" />}
                <div
                  draggable={!selection}
                  onDragStart={(e) => onDragStart(e, req.id, 'request', node.id)}
                  onDragOver={(e) => onDragOver(e, req.id, 'request')}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  onDragEnd={onDragEnd}
                  /* In select mode a click ticks the row rather than opening it. */
                  onClick={() => (selection ? (!childCovered && selection.toggle(req.id)) : onOpenRequest(req))}
                  onContextMenu={(e) => onRequestContextMenu(e, req)}
                  data-context-menu="request"
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--color-item-hover-bg)] cursor-pointer group/req ${
                    dragItem?.id === req.id ? 'opacity-40' : ''
                  } ${selection && (childCovered || selection.picked.has(req.id)) ? 'coll-row--picked' : ''}`}
                  style={{ paddingLeft: `${(selection ? 8 : 20) + (depth + 1) * 12}px` }}
                >
                  {selection && <PickBox selection={selection} id={req.id} covered={childCovered} />}
                  <span
                    className="text-[9px] font-bold shrink-0 w-[30px] text-left uppercase tracking-wide"
                    style={{ color: METHOD_COLORS[req.method] || 'var(--color-muted-fallback)' }}
                  >
                    {req.method}
                  </span>
                  {/* Why this row is first in its folder, said on the row —
                      an order with no visible cause reads as a bug. */}
                  {starredIds.has(req.id) && (
                    <StarIcon size={10} filled className="shrink-0" style={{ color: 'var(--color-warning)' }} />
                  )}
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
                    <span className="flex-1 text-[11.5px] text-[var(--color-text-primary)] truncate min-w-0">
                      {req.name || req.url || 'Untitled'}
                    </span>
                  )}
                  {/* Two at most: a row is one line, and a wrapping strip of
                      chips pushes every request under it down the list. */}
                  <RequestTags data={req.data} />
                  {!selection && <span className="opacity-0 group-hover/req:opacity-100">
                    <IconButtonView
                      icon={<MoreVerticalIcon size={11} />}
                      size="sm"
                      tooltip="More Options"
                      onClick={(e) => { e.stopPropagation(); onRequestContextMenu(e, req); }}
                    />
                  </span>}
                </div>
                {reqDropPos === 'after' && <div className="h-0.5 bg-[var(--coll-accent,var(--color-primary))] rounded mx-2" />}
              </div>
            );
          })}
          {draft?.kind === 'request' && draft.parentId === node.id && renderDraft(depth + 1)}
        </div>
        </div>
      </div>

      {/* Drop indicator - after (when expanded, at end) */}
      {dropPosition === 'after' && isExpanded && (
        <div className="h-0.5 bg-[var(--coll-accent,var(--color-primary))] rounded mx-2" />
      )}
    </div>
  );
}

// ────────────── Action Button helper ──────────────

function ActionBtn({ title, onClick, disabled, children }: { title: string; onClick: (e: React.MouseEvent) => void; danger?: boolean; disabled?: boolean; children: React.ReactNode }) {
  if (disabled) return null;
  return (
    <IconButtonView
      icon={children}
      size="sm"
      tooltip={title}
      onClick={onClick}
    />
  );
}

/**
 * The tags on a saved request, read out of its data blob.
 *
 * Parsed here rather than at load: the blob is already in memory and a tag is
 * only ever wanted when a row is drawn, so widening the tree's shape to carry
 * a parsed copy would cost every consumer for one row's benefit.
 */
function RequestTags({ data }: { data?: string }) {
  const tags = useMemo(() => {
    if (!data) return [];
    try { return tagsFromData(JSON.parse(data)); } catch { return []; }
  }, [data]);
  if (!tags.length) return null;
  return <TagChips tags={tags} max={2} size="xs" />;
}
