import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TextInputView } from '@salilvnair/dui';
import { useTabsStore, type Protocol } from '../../../store/tabs-store';
import { useK8sStore } from '../../../store/k8s-store';
import { useDk8sSearchStore } from '../../../store/dk8s-search-store';
import { useUiStateStore } from '../../../store/ui-state-store';
import { useDevToolsStore } from '../../../store/devtools-store';
import { useEnvStore } from '../../../store/env-store';
import { postMsg } from '../../../vscode';
import type { SidebarSection } from '../../sidebar/AppSidebar';
import {
  SearchIcon, ChevronLeftIcon, ChevronRightIcon, PlusSquareIcon,
  FolderIcon, ClockIcon, LayersIcon, SettingsIcon, ServerIcon, SparkleIcon,
  SunIcon, CpuIcon, AgentIcon, CodeBracketsIcon, FolderImportIcon,
  ProtocolRestBadge, ProtocolGraphQLBadge, ProtocolRealtimeBadge, ProtocolGrpcBadge,
  ProtocolSoapBadge, ProtocolAiBadge, ProtocolMcpBadge, BookOpenIcon,
  Dk8sIcon, StethoscopeIcon, RefreshIcon, LayoutGridIcon, TableIcon,
  CheckCircleIcon, DownloadIcon,
} from '../../../icons';
import './CommandPaletteView.css';

interface PaletteItem {
  /**
   * Colour for the icon.
   *
   * The wrapper paints every icon `--color-text-muted`, which is why a list of
   * twenty commands read as twenty identical grey glyphs — the icon told you
   * nothing the label had not already said. A colour per command makes the
   * shape and the hue together enough to find a row without reading it.
   */
  iconColor?: string;
  id: string;
  icon: React.ReactNode;
  label: string;
  keywords?: string[];
  badge?: string;
  /** Opens a nested page instead of running an action. */
  to?: string;
  run?: () => void;
}

interface PaletteGroup {
  heading?: string;
  items: PaletteItem[];
}

interface PalettePage {
  title: string;
  placeholder: string;
  groups: PaletteGroup[];
}

interface CommandPaletteViewProps {
  open: boolean;
  onClose: () => void;
  onOpenSidebarSection: (section: SidebarSection) => void;
}

const PROTOCOL_REQUESTS: { protocol: Protocol; label: string; icon: React.ReactNode }[] = [
  { protocol: 'rest', label: 'New REST Request', icon: <ProtocolRestBadge size={16} /> },
  { protocol: 'graphql', label: 'New GraphQL Request', icon: <ProtocolGraphQLBadge size={16} /> },
  { protocol: 'websocket', label: 'New Realtime Connection', icon: <ProtocolRealtimeBadge size={16} /> },
  { protocol: 'grpc', label: 'New gRPC Request', icon: <ProtocolGrpcBadge size={16} /> },
  { protocol: 'soap', label: 'New SOAP Request', icon: <ProtocolSoapBadge size={16} /> },
  { protocol: 'mcp', label: 'New MCP Request', icon: <ProtocolMcpBadge size={16} /> },
  { protocol: 'ai', label: 'New AI Request', icon: <ProtocolAiBadge size={16} /> },
];

/** Mirrors SettingsPanel.tsx's SETTINGS_SECTION_META — every real Settings section, searchable directly. */
const SETTINGS_SECTIONS: { id: string; label: string; icon: React.ReactNode; keywords: string[] }[] = [
  { id: 'general', label: 'Settings: General', icon: <SettingsIcon size={15} />, keywords: ['redirects', 'timeout', 'history entries', 'database location'] },
  { id: 'theme', label: 'Settings: Theme', icon: <SunIcon size={15} />, keywords: ['dark', 'light', 'system', 'appearance'] },
  { id: 'mock-server', label: 'Settings: Mock Server', icon: <ServerIcon size={15} />, keywords: ['port range', 'glow'] },
  { id: 'llm', label: 'Settings: LLM Provider', icon: <CpuIcon size={15} />, keywords: ['api key', 'openai', 'anthropic', 'ollama', 'copilot', 'model'] },
  { id: 'ai-features', label: 'Settings: AI Features', icon: <SparkleIcon size={15} />, keywords: ['toggle', 'enable', 'disable'] },
  { id: 'prompt-library', label: 'Settings: Prompt Library', icon: <AgentIcon size={15} />, keywords: ['system prompt', 'agent prompts', 'ai actions'] },
  { id: 'ai-audit', label: 'Settings: AI Audit', icon: <SparkleIcon size={15} />, keywords: ['audit log', 'ai calls', 'request', 'response'] },
  { id: 'devtools', label: 'Settings: Developer Tools', icon: <CodeBracketsIcon size={15} />, keywords: ['memory footprint', 'audit log', 'db explorer', 'debug snapshot'] },
  { id: 'power-features', label: 'Settings: Power Features', icon: <CodeBracketsIcon size={15} />, keywords: ['cookie manager', 'proxy', 'client certificates', 'api monitor', 'interceptor', 'response diff', 'bulk url tester', 'load tester'] },
];

/** REST's real Request Config sub-tabs — rest.subtab.<tabId> pref, verified in RequestPanel.tsx. */
const REST_SUBTABS: { id: string; label: string }[] = [
  { id: 'params', label: 'Params' }, { id: 'headers', label: 'Headers' }, { id: 'body', label: 'Body' },
  { id: 'auth', label: 'Authorization' }, { id: 'scripts', label: 'Scripts' }, { id: 'variables', label: 'Variables' },
];

/** GraphQL's real editor sub-tabs — gql.subtab.<tabId> pref, verified in GraphQLEditor.tsx. */
const GQL_SUBTABS: { id: string; label: string }[] = [
  { id: 'query', label: 'Query' }, { id: 'variables', label: 'Variables' }, { id: 'headers', label: 'Headers' },
  { id: 'authorization', label: 'Authorization' }, { id: 'scripts', label: 'Scripts' },
];

/** SOAP's real request config sub-tabs — soap.subtab.<tabId> pref, verified in SoapRequestConfig.tsx. */
const SOAP_SUBTABS: { id: string; label: string }[] = [
  { id: 'envelope', label: 'Envelope' }, { id: 'form', label: 'Form' }, { id: 'headers', label: 'Headers' },
  { id: 'wssecurity', label: 'WS-Security' }, { id: 'auth', label: 'Authorization' },
  { id: 'assertions', label: 'Assertions' }, { id: 'attachments', label: 'Attachments' }, { id: 'scripts', label: 'Scripts' },
];

/** The 80+ inline AI features documented in the wiki's AI Assistant page — searchable here too. Not
 * individually invokable (each lives deep inside a specific protocol's toolbar/menu), so selecting one
 * opens the Daakia AI chat panel, the one place every one of them can actually be reached from. */
const AI_ACTIONS: string[] = [
  'Suggest Headers', 'Generate Body', 'Generate Data Schema', 'Postman to Daakia Translator',
  'Smart Retry Advisor', 'Response Diff', 'Schema Validator', 'GraphQL Schema Explainer',
  'GraphQL Query Builder', 'gRPC Proto Explainer', 'SOAP WSDL Explainer', 'Env Var Extractor',
  'API Changelog', 'Agent Workflow', 'API Flow Builder', 'Collection Organizer', 'Traffic Analyzer',
  'API Dependency Graph', 'API Discovery', 'API Regression Detector', 'Chaos Engineering',
  'Compatibility Scorer', 'Compliance Checker', 'Contract Negotiator', 'Contract Test Generator',
  'Conversation to Collection', 'Cross-Protocol Orchestrator', 'Deep Security Audit', 'Doc Generator',
  'GraphQL Federation', 'Learning Mode', 'Live Traffic Mirror', 'MCP Prompt Builder', 'MCP Schema Viewer',
  'Mock Intelligence', 'MQTT Topic Suggester', 'Multi-Request Optimizer', 'Natural-Language Request Builder',
  'OpenAPI Enrichment', 'OpenAPI Generator', 'Performance Anomaly Detection', 'Performance Insights',
  'Request Clustering', 'Request from Logs', 'Request from Screenshot', 'Request Fuzzer',
  'Request Replay Variations', 'Response Pattern Learning', 'Response to TypeScript', 'Response Transformer',
  'Reverse Engineer', 'Scenario Generator', 'Schema Drift Detector', 'SDK Generator', 'Security Audit',
  'Semantic Diff', 'Semantic Validator', 'Sequence Composer', 'Session Export', 'Smart Test Suite',
  'Smart Variable Suggest', 'SOAP to REST Converter', 'SSE Event Suggester', 'Webhook Debugger',
  'Adaptive Load Tester', 'Adaptive Mock Learning', 'Voice to Request',
];

/** Mirrors the per-protocol sidebar section keys used across App.tsx / AppSidebar.tsx. */
function sectionForProtocol(protocol: Protocol, base: 'collections' | 'history'): SidebarSection {
  const prefix: Partial<Record<Protocol, string>> = {
    graphql: 'gql', websocket: 'ws', grpc: 'grpc', soap: 'soap', ai: 'ai', mcp: 'mcp',
  };
  const p = prefix[protocol];
  return (p ? `${p}-${base}` : base) as SidebarSection;
}

// Multi-term, case-insensitive substring match — every typed word must appear
// literally somewhere in the item's label/keywords. Predictable, not fuzzy.
function matchesSearch(item: PaletteItem, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  const haystack = `${item.label} ${item.keywords?.join(' ') ?? ''}`.toLowerCase();
  return needle.split(/\s+/).every(term => haystack.includes(term));
}

export function CommandPaletteView({ open, onClose, onOpenSidebarSection }: CommandPaletteViewProps) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const activeProtocol = useTabsStore(s => s.activeProtocol);
  const tabs = useTabsStore(s => s.tabs);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setPage(null);
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => { setActiveIndex(0); }, [search, page]);

  const go = (protocol: Protocol) => () => {
    useTabsStore.getState().switchProtocol(protocol);
    useTabsStore.getState().addTab({ protocol });
  };

  const openSection = (base: 'collections' | 'history') => () => {
    onOpenSidebarSection(sectionForProtocol(activeProtocol, base));
  };

  const openSettingsSection = (sectionId: string) => () => {
    // Writing the pref BEFORE openSettingsTab() means a freshly-mounted
    // SettingsPanel reads the right section on its very first render; the
    // reactive useEffect added in SettingsPanel.tsx additionally handles the
    // case where a Settings tab is already open and mounted.
    useUiStateStore.getState().setPref('settings.section', sectionId);
    useTabsStore.getState().openSettingsTab();
  };

  // Opens a new tab of the given protocol and lands it on a specific
  // request-config sub-tab (Params, Headers, Body, etc). addTab's set() call
  // is synchronous, so activeTabId already reflects the new tab by the time
  // the subtab pref is written — the panel's first render sees it directly.
  const openSubtab = (protocol: Protocol, prefPrefix: string, subtabId: string) => () => {
    useTabsStore.getState().switchProtocol(protocol);
    useTabsStore.getState().addTab({ protocol });
    const id = useTabsStore.getState().activeTabId;
    if (id) useUiStateStore.getState().setPref(`${prefPrefix}.subtab.${id}`, subtabId);
  };

  const openDevToolsTab = (tab: 'console' | 'network') => () => {
    useDevToolsStore.getState().open();
    useDevToolsStore.getState().setActiveTab(tab);
  };

  /*
    Every dk8s command needs the tab, and none of them mean anything without
    it — so opening it is part of the command rather than a step you are left
    to remember.
  */
  const dk8s = () => useTabsStore.getState().openDk8sTab();
  const DK8S = 'var(--color-dk8s)';

  const baseGroups = useMemo<PaletteGroup[]>(() => [
    {
      heading: 'New Request',
      items: PROTOCOL_REQUESTS.map(p => ({
        id: `new-${p.protocol}`,
        icon: p.icon,
        label: p.label,
        keywords: [p.protocol, 'create', 'new tab'],
        run: go(p.protocol),
      })),
    },
    {
      heading: 'Navigate',
      items: [
        { id: 'nav-collections', iconColor: 'var(--color-warning)', icon: <FolderIcon size={15} />, label: 'Collections', keywords: ['tree', 'requests'], run: openSection('collections') },
        { id: 'nav-history', iconColor: 'var(--color-info)', icon: <ClockIcon size={15} />, label: 'History', keywords: ['past requests', 'log'], run: openSection('history') },
        { id: 'nav-environments', iconColor: 'var(--color-success)', icon: <LayersIcon size={15} />, label: 'Environments', keywords: ['env', 'variables'], run: openSection('collections') },
        { id: 'nav-mock-server', iconColor: 'var(--color-mock-server)', icon: <ServerIcon size={15} />, label: 'Mock Server', keywords: ['mock', 'routes'], run: () => useTabsStore.getState().openMockServerTab() },
        { id: 'nav-daakia-ai', iconColor: 'var(--color-protocol-ai)', icon: <SparkleIcon size={15} />, label: 'Daakia AI Assistant', keywords: ['ai', 'chat', 'tools'], run: () => useTabsStore.getState().openDaakiaAiTab() },
        { id: 'nav-settings', iconColor: 'var(--color-settings)', icon: <SettingsIcon size={15} />, label: 'Settings', keywords: ['preferences', 'theme', 'llm'], run: () => useTabsStore.getState().openSettingsTab() },
        { id: 'nav-wiki', iconColor: 'var(--color-wiki)', icon: <BookOpenIcon size={15} />, label: 'Daakia Wiki', keywords: ['docs', 'documentation', 'help', 'guide'], run: () => useTabsStore.getState().openDaakiaWikiTab() },
        { id: 'nav-ai-actions', iconColor: 'var(--color-protocol-ai)', icon: <SparkleIcon size={15} />, label: 'AI Actions…', keywords: ['inline', 'features', 'sparkle', 'ai tools'], to: 'ai-actions' },
      ],
    },
    {
      /*
        dk8s, from wherever you are.

        Every one of these took a tab switch and then a click inside it, which
        is what the palette exists to remove — and diagnosing a cluster is when
        you are least inclined to go hunting for a control. Each opens the tab
        first, since none of them mean anything without it.

        Only actions that work from anywhere are here. Anything needing a pod
        already open — a heap dump, a thread dump — belongs on that pod, not in
        a list that cannot know which one you meant.
      */
      heading: 'dk8s — Kubernetes',
      items: [
        {
          id: 'dk8s-open', icon: <Dk8sIcon size={15} />, iconColor: DK8S,
          label: 'Open dk8s',
          keywords: ['kubernetes', 'k8s', 'cluster', 'pods'],
          run: () => dk8s(),
        },
        {
          id: 'dk8s-pods', icon: <LayersIcon size={15} />, iconColor: 'var(--color-info)',
          label: 'dk8s: Pods',
          keywords: ['kubernetes', 'k8s', 'workloads', 'containers', 'crashloop'],
          run: () => { dk8s(); useK8sStore.getState().setPanel('pods'); },
        },
        {
          id: 'dk8s-search', icon: <SearchIcon size={15} />, iconColor: 'var(--color-warning)',
          label: 'dk8s: Quick Search — logs and files',
          keywords: ['kubernetes', 'k8s', 'grep', 'logs', 'across pods', 'find', 'archive'],
          run: () => {
            dk8s();
            useK8sStore.getState().setPanel('pods');
            useDk8sSearchStore.getState().openSearch();
          },
        },
        {
          id: 'dk8s-artifacts', icon: <StethoscopeIcon size={15} />, iconColor: 'var(--color-protocol-ai)',
          label: 'dk8s: Artifacts',
          keywords: ['heap dump', 'thread dump', 'hprof', 'jfr', 'collected', 'analyzer'],
          run: () => { dk8s(); useK8sStore.getState().setPanel('artifacts'); },
        },
        {
          id: 'dk8s-refresh', icon: <RefreshIcon size={15} />, iconColor: 'var(--color-success)',
          label: 'dk8s: Refresh pods',
          keywords: ['kubernetes', 'k8s', 'reload', 'rewatch', 'stale', 'watch'],
          run: () => { dk8s(); useK8sStore.getState().startWatch(); },
        },
        {
          id: 'dk8s-cards', icon: <LayoutGridIcon size={15} />, iconColor: 'var(--color-info)',
          label: 'dk8s: Card view',
          keywords: ['kubernetes', 'k8s', 'tiles', 'grid', 'pods'],
          run: () => { dk8s(); useK8sStore.getState().setPanel('pods'); useK8sStore.getState().setView('cards'); },
        },
        {
          id: 'dk8s-table', icon: <TableIcon size={15} />, iconColor: 'var(--color-info)',
          label: 'dk8s: Table view',
          keywords: ['kubernetes', 'k8s', 'rows', 'list', 'dense', 'pods'],
          run: () => { dk8s(); useK8sStore.getState().setPanel('pods'); useK8sStore.getState().setView('table'); },
        },
        {
          id: 'dk8s-select', icon: <CheckCircleIcon size={15} />, iconColor: DK8S,
          label: 'dk8s: Pick pods',
          keywords: ['kubernetes', 'k8s', 'select', 'multi', 'choose', 'favourite', 'export'],
          run: () => {
            dk8s();
            useK8sStore.getState().setPanel('pods');
            const st = useK8sStore.getState();
            if (!st.selectMode) st.toggleSelectMode();
          },
        },
        {
          id: 'dk8s-export', icon: <DownloadIcon size={15} />, iconColor: 'var(--color-success)',
          label: 'dk8s: Export logs',
          keywords: ['kubernetes', 'k8s', 'download', 'save', 'logs', 'file'],
          run: () => { dk8s(); useK8sStore.getState().setPanel('pods'); useK8sStore.getState().openExport(); },
        },
        {
          id: 'dk8s-back', icon: <ChevronLeftIcon size={15} />, iconColor: 'var(--color-text-muted)',
          label: 'dk8s: Back to the pod list',
          keywords: ['kubernetes', 'k8s', 'close', 'detail', 'leave pod'],
          run: () => { dk8s(); useK8sStore.getState().closeDetail(); },
        },
        {
          id: 'dk8s-settings', icon: <SettingsIcon size={15} />, iconColor: 'var(--color-settings)',
          label: 'dk8s: Settings',
          keywords: ['kubernetes', 'k8s', 'kubectl path', 'log formats', 'archived logs', 'pv', 'volume'],
          run: openSettingsSection('dk8s'),
        },
      ],
    },
    {
      heading: 'Settings',
      items: SETTINGS_SECTIONS.map(s => ({
        id: `settings-${s.id}`,
        icon: s.icon,
        iconColor: 'var(--color-settings)',
        label: s.label,
        keywords: s.keywords,
        run: openSettingsSection(s.id),
      })),
    },
    {
      heading: 'REST — Go to Tab',
      items: REST_SUBTABS.map(t => ({
        id: `rest-subtab-${t.id}`,
        icon: <ProtocolRestBadge size={15} />,
        label: `REST: ${t.label}`,
        keywords: ['rest', t.id],
        run: openSubtab('rest', 'rest', t.id),
      })),
    },
    {
      heading: 'GraphQL — Go to Tab',
      items: GQL_SUBTABS.map(t => ({
        id: `gql-subtab-${t.id}`,
        icon: <ProtocolGraphQLBadge size={15} />,
        label: `GraphQL: ${t.label}`,
        keywords: ['graphql', 'gql', t.id],
        run: openSubtab('graphql', 'gql', t.id),
      })),
    },
    {
      heading: 'SOAP — Go to Tab',
      items: SOAP_SUBTABS.map(t => ({
        id: `soap-subtab-${t.id}`,
        icon: <ProtocolSoapBadge size={15} />,
        label: `SOAP: ${t.label}`,
        keywords: ['soap', t.id],
        run: openSubtab('soap', 'soap', t.id),
      })),
    },
    {
      heading: 'Developer Tools',
      items: [
        { id: 'devtools-console', icon: <CodeBracketsIcon size={15} />, label: 'DevTools: Console', keywords: ['logs', 'script'], run: openDevToolsTab('console') },
        { id: 'devtools-network', icon: <CodeBracketsIcon size={15} />, label: 'DevTools: Network', keywords: ['requests', 'traffic'], run: openDevToolsTab('network') },
      ],
    },
    {
      heading: 'Collections & Environments',
      items: [
        { id: 'action-import-collection', icon: <FolderImportIcon size={15} />, label: 'Import Collection', keywords: ['postman', 'openapi', 'har', 'bruno'], run: () => postMsg({ type: 'importCollectionRequest' }) },
        { id: 'action-new-environment', icon: <LayersIcon size={15} />, label: 'New Environment', keywords: ['env', 'variables', 'create'], run: () => { openSection('collections')(); useEnvStore.getState().addEnvironment(); } },
      ],
    },
  ], [activeProtocol]);

  const searchGroups = useMemo<PaletteGroup[]>(() => {
    if (!search.trim() || tabs.length === 0) return [];
    return [{
      heading: 'Open Tabs',
      items: tabs.map(t => ({
        id: `tab-${t.id}`,
        icon: <PlusSquareIcon size={15} />,
        label: t.name || t.url || 'Untitled',
        keywords: [t.protocol, t.method, t.url],
        badge: t.protocol,
        run: () => useTabsStore.getState().setActiveTab(t.id),
      })),
    }];
  }, [search, tabs]);

  const rootGroups = useMemo(() => [...baseGroups, ...searchGroups], [baseGroups, searchGroups]);

  const subPages = useMemo<Record<string, PalettePage>>(() => ({
    'ai-actions': {
      title: 'AI Actions',
      placeholder: 'Search 80+ inline AI features…',
      groups: [{
        heading: 'Opens Daakia AI — each feature also has its own ✨ trigger where it\'s used',
        items: AI_ACTIONS.map((name, i) => ({
          id: `ai-action-${i}`,
          icon: <SparkleIcon size={15} />,
          label: name,
          run: () => useTabsStore.getState().openDaakiaAiTab(),
        })),
      }],
    },
  }), []);

  const activePage = page ? subPages[page] : null;
  const visibleGroups: PaletteGroup[] = (activePage ? activePage.groups : rootGroups)
    .map(g => ({ ...g, items: g.items.filter(it => matchesSearch(it, search)) }))
    .filter(g => g.items.length > 0);

  const flatItems = useMemo(() => visibleGroups.flatMap(g => g.items), [visibleGroups]);

  const goBack = () => { setSearch(''); setPage(null); };

  const handleSelect = (item: PaletteItem) => {
    if (item.to) { setPage(item.to); setSearch(''); return; }
    item.run?.();
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = flatItems[activeIndex];
      if (item) handleSelect(item);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (activePage) goBack(); else onClose();
    } else if (e.key === 'Backspace' && search === '' && activePage) {
      goBack();
    }
  };

  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) return null;

  let runningIndex = -1;

  return createPortal(
    <div className="dk_cmdk__overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dk_cmdk__panel" onKeyDown={handleKeyDown}>
        {activePage && (
          <button type="button" className="dk_cmdk__back" onClick={goBack}>
            <ChevronLeftIcon size={12} />
            <span>Back</span>
            <span style={{ opacity: 0.5 }}>/</span>
            <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{activePage.title}</span>
          </button>
        )}
        <div className="dk_cmdk__input-row">
          <TextInputView
            naked
            autoFocus
            size="md"
            width="fw"
            value={search}
            onChange={e => setSearch(e.target.value)}
            iconLeft={<SearchIcon size={14} />}
            placeholder={activePage ? activePage.placeholder : 'Search commands, requests, tabs…'}
          />
        </div>
        <div className="dk_cmdk__list" ref={listRef}>
          {flatItems.length === 0 && (
            <div className="dk_cmdk__empty">No results</div>
          )}
          {visibleGroups.map((group, gi) => (
            <div key={group.heading ?? `group-${gi}`}>
              {group.heading && <div className="dk_cmdk__group-heading">{group.heading}</div>}
              {group.items.map(item => {
                runningIndex++;
                const isActive = runningIndex === activeIndex;
                return (
                  <div
                    key={item.id}
                    className="dk_cmdk__item"
                    data-active={isActive}
                    onMouseEnter={() => setActiveIndex(runningIndex)}
                    onClick={() => handleSelect(item)}
                  >
                    <span className="dk_cmdk__item-icon"
                          style={item.iconColor ? { color: item.iconColor } : undefined}>
                      {item.icon}
                    </span>
                    <span className="dk_cmdk__item-label">{item.label}</span>
                    {item.badge && <span className="dk_cmdk__item-badge">{item.badge}</span>}
                    {item.to && <ChevronRightIcon size={13} />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="dk_cmdk__footer">
          <span className="dk_cmdk__hint"><span className="dk_cmdk__kbd">&uarr;</span><span className="dk_cmdk__kbd">&darr;</span> navigate</span>
          <span className="dk_cmdk__hint"><span className="dk_cmdk__kbd">&crarr;</span> select</span>
          <span className="dk_cmdk__hint"><span className="dk_cmdk__kbd">esc</span> close</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
