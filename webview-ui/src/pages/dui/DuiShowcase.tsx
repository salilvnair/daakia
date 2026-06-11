import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ToggleSwitchPanel, CheckboxPanel, ModalPanel, LoaderPanel, EmptyStatePanel,
  StatusIndicatorPanel, InfoPopupPanel, ResizablePanelPanel, SplitPanelPanel, DottedCardPanel,
  ColoredTextPanel, StatsCardPanel, DataTablePanel, CodeBlockPanel, AIButtonPanel,
  SideNavPanel, SettingsNavPanel, ThemeCardSelectorPanel, FeatureCategoryPanel,
  TagInputPanel, BottomPanelPanel, ToastPanel, PromptCardPanel, PromptLibraryPanel,
  SearchInputPanel, DurationInputPanel, PillTabsPanel, SplitButtonPanel,
  HighlightedInputPanel, KeyValueTablePanel, MergedInputViewPanel,
} from './panels/NewComponentPanels';
import { IconsGalleryPanel } from './panels/IconsGalleryPanel';
import { ThemeCustomizationPanel } from './panels/ThemeCustomizationPanel';
import { LivePlayground } from './panels/LivePlayground';
import {
  ChipView,
  ButtonView,
  IconButtonView,
  DropDownButtonView,
  TextInputView,
  SelectInputView,
  KeyValueItemView,
  HiddenKeyValueItemView,
  TabView,
  EditorView,
  ContextMenuView,
  TabBarView,
  StageCheck,
  StageSpin,
  StagePulse,
  CodeBlockView,
  SelectTextInputView,
  SideNavView,
  DuiProvider,
  PillTabsView,
  ToggleSwitchView,
} from '../../dui';
import type { TabItem, ContextMenuItem, TabBarTab, SelectTextOption, SideNavItem, LiveColorVar } from '../../dui';
import { applyMonacoTheme } from '../../monaco-setup';
import {
  TrashIcon, PlusIcon, SearchIcon, SettingsIcon, SparkleIcon,
  MoreHorizontalIcon, MoreVerticalIcon, CopyIcon, RefreshIcon, DownloadIcon,
  SaveIcon, ExportIcon, InfoCircleIcon, PlayIcon,
  WandIcon, CodeIcon, FilterIcon, GlobeIcon, RenameIcon,
  CheckIcon, LayersIcon, PanelRightIcon, SidebarLeftIcon, SidebarRightIcon, DotIcon, CheckCircleIcon,
  GaugeIcon, TerminalIcon, DocumentIcon, CodeBracketsIcon,
  ChevronDownIcon, ChevronRightIcon, FolderIcon, SpinnerIcon, SunIcon, KeyIcon,
  PlusSquareIcon,
} from '../../icons';

// ─── Types ────────────────────────────────────────────────────────────────────

type CategoryId =
  | 'chips' | 'textinput' | 'selectinput' | 'selecttextinput' | 'button'
  | 'iconbutton' | 'dropdownbutton' | 'contextmenu'
  | 'tabs' | 'tabbar' | 'keyvalue' | 'editor' | 'patterns'
  | 'toggle' | 'checkbox' | 'modal' | 'loader' | 'emptystate'
  | 'statusindicator' | 'infopopup' | 'resizablepanel' | 'splitpanel' | 'dottedcard'
  | 'coloredtext' | 'statscard' | 'datatable' | 'codeblock' | 'aibutton'
  | 'sidenav' | 'settingsnav' | 'themecardselector' | 'featurecategory'
  | 'taginput' | 'bottompanel' | 'toast' | 'promptcard' | 'promptlibrary' | 'iconsgallery' | 'themeconfig' | 'stageview'
  | 'searchinput' | 'durationinput' | 'pilltabs' | 'splitbutton' | 'highlightedinput' | 'keyvaluetable'
  | 'mergedinput' | 'duiprovider';

interface SidebarItem { id: CategoryId; label: string; icon: React.ReactNode }
interface SidebarGroup { title: string; items: SidebarItem[] }

const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    title: 'Inputs',
    items: [
      { id: 'textinput',         label: 'TextInputView',         icon: <KeyIcon size={13} /> },
      { id: 'selectinput',       label: 'SelectInputView',       icon: <FilterIcon size={13} /> },
      { id: 'selecttextinput',   label: 'SelectTextInputView',   icon: <GlobeIcon size={13} /> },
      { id: 'keyvalue',          label: 'KeyValueItemView',      icon: <LayersIcon size={13} /> },
      { id: 'taginput',          label: 'TagInputView',          icon: <PlusIcon size={13} /> },
      { id: 'checkbox',          label: 'CheckboxView',          icon: <CheckIcon size={13} /> },
      { id: 'toggle',            label: 'ToggleSwitchView',      icon: <RefreshIcon size={13} /> },
      { id: 'themecardselector', label: 'ThemeCardSelectorView', icon: <SunIcon size={13} /> },
      { id: 'editor',            label: 'EditorView',            icon: <CodeIcon size={13} /> },
      { id: 'searchinput',       label: 'SearchInputView',       icon: <SearchIcon size={13} /> },
      { id: 'durationinput',     label: 'DurationInputView',     icon: <TerminalIcon size={13} /> },
      { id: 'pilltabs',          label: 'PillTabsView',          icon: <LayersIcon size={13} /> },
      { id: 'highlightedinput',  label: 'HighlightedInputView',  icon: <GlobeIcon size={13} /> },
      { id: 'keyvaluetable',     label: 'KeyValueTableView',     icon: <FilterIcon size={13} /> },
      { id: 'mergedinput',       label: 'MergedInputView',       icon: <LayersIcon size={13} /> },
    ],
  },
  {
    title: 'Buttons',
    items: [
      { id: 'button',         label: 'ButtonView',         icon: <PlayIcon size={13} /> },
      { id: 'iconbutton',     label: 'IconButtonView',     icon: <SparkleIcon size={13} /> },
      { id: 'dropdownbutton', label: 'DropDownButtonView', icon: <ChevronDownIcon size={13} /> },
      { id: 'splitbutton',    label: 'SplitButtonView',    icon: <ChevronDownIcon size={13} /> },
      { id: 'aibutton',       label: 'AIButtonView',       icon: <WandIcon size={13} /> },
    ],
  },
  {
    title: 'Navigation',
    items: [
      { id: 'tabs',        label: 'TabView',         icon: <LayersIcon size={13} /> },
      { id: 'tabbar',      label: 'TabBarView',      icon: <LayersIcon size={13} /> },
      { id: 'contextmenu', label: 'ContextMenuView', icon: <MoreHorizontalIcon size={13} /> },
      { id: 'sidenav',     label: 'SideNavView',     icon: <PanelRightIcon size={13} /> },
      { id: 'settingsnav', label: 'SettingsNavView', icon: <SettingsIcon size={13} /> },
    ],
  },
  {
    title: 'Display',
    items: [
      { id: 'chips',           label: 'ChipView',             icon: <DotIcon size={13} /> },
      { id: 'statusindicator', label: 'StatusIndicatorView',  icon: <CheckCircleIcon size={13} /> },
      { id: 'loader',          label: 'LoaderView',           icon: <SpinnerIcon size={13} /> },
      { id: 'emptystate',      label: 'EmptyStateView',       icon: <FolderIcon size={13} /> },
      { id: 'coloredtext',     label: 'ColoredTextView',      icon: <CodeBracketsIcon size={13} /> },
      { id: 'statscard',       label: 'StatsCardView',        icon: <GaugeIcon size={13} /> },
      { id: 'dottedcard',      label: 'DottedCardView',       icon: <DocumentIcon size={13} /> },
      { id: 'datatable',       label: 'DataTableView',        icon: <LayersIcon size={13} /> },
      { id: 'codeblock',       label: 'CodeBlockView',        icon: <CodeBracketsIcon size={13} /> },
      { id: 'promptcard',      label: 'PromptCardView',       icon: <SparkleIcon size={13} /> },
      { id: 'promptlibrary',   label: 'PromptLibraryView',    icon: <SparkleIcon size={13} /> },
      { id: 'stageview',       label: 'StageCheck/Spin/Pulse', icon: <CheckCircleIcon size={13} /> },
    ],
  },
  {
    title: 'Overlays',
    items: [
      { id: 'modal',     label: 'ModalView',     icon: <PlusSquareIcon size={13} /> },
      { id: 'infopopup', label: 'InfoPopupView', icon: <InfoCircleIcon size={13} /> },
      { id: 'toast',     label: 'ToastView',     icon: <InfoCircleIcon size={13} /> },
    ],
  },
  {
    title: 'Layout',
    items: [
      { id: 'resizablepanel',  label: 'ResizablePanelView',  icon: <PanelRightIcon size={13} /> },
      { id: 'splitpanel',      label: 'SplitPanelView',      icon: <SidebarLeftIcon size={13} /> },
      { id: 'bottompanel',     label: 'BottomPanelView',     icon: <TerminalIcon size={13} /> },
      { id: 'featurecategory', label: 'FeatureCategoryView', icon: <FilterIcon size={13} /> },
    ],
  },
  {
    title: 'More',
    items: [
      { id: 'duiprovider',  label: 'DuiProvider (Size)',    icon: <LayersIcon size={13} /> },
      { id: 'patterns',     label: 'Patterns',              icon: <CodeBracketsIcon size={13} /> },
      { id: 'iconsgallery', label: 'Icons Gallery',         icon: <SearchIcon size={13} /> },
      { id: 'themeconfig',  label: 'Theme Customization',   icon: <WandIcon size={13} /> },
    ],
  },
];

// ─── SideNavView data — converted from SIDEBAR_GROUPS ────────────────────────

const NAV_ITEMS: SideNavItem[] = SIDEBAR_GROUPS.map(g => ({
  id: g.title,
  label: g.title,
  isGroup: true,
  count: g.items.length,
  children: g.items.map(i => ({ id: i.id, label: i.label, icon: i.icon })),
}));

const TOTAL_COMPONENT_COUNT = SIDEBAR_GROUPS.reduce((s, g) => s + g.items.length, 0);

// ─── Layout helpers ───────────────────────────────────────────────────────────

// Material-UI card pattern — label + demo
function Row({
  label, children, gap = 10, noPad = false, align = 'center', code,
}: {
  label: string; children: React.ReactNode; gap?: number;
  code?: string; noPad?: boolean; align?: 'center' | 'flex-start' | 'flex-end';
}) {
  const [showCode, setShowCode] = useState(false);
  return (
    <div style={{
      marginBottom: 16,
      border: '1px solid var(--color-surface-border)',
      borderRadius: 10,
      background: 'var(--color-surface)',
      overflow: 'hidden',
    }}>
      {/* Label */}
      <div style={{
        padding: '10px 16px 8px',
        fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
        borderBottom: '1px solid color-mix(in srgb, var(--color-surface-border) 60%, transparent)',
      }}>
        {label}
      </div>
      {/* Demo content */}
      <div style={{
        padding: noPad ? 0 : '16px',
        display: 'flex', alignItems: align, flexWrap: 'wrap', gap,
      }}>
        {children}
      </div>
      {/* Show Code toggle */}
      {code && (
        <div>
          <button
            type="button"
            onClick={() => setShowCode(v => !v)}
            style={{
              width: '100%', textAlign: 'left', padding: '6px 16px',
              fontSize: 10, fontWeight: 600, cursor: 'pointer',
              color: 'var(--color-text-muted)', background: 'transparent', border: 'none',
              borderTop: '1px solid color-mix(in srgb, var(--color-surface-border) 60%, transparent)',
              display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit',
            }}
          >
            <CodeIcon size={10} />
            {showCode ? 'Hide code' : 'Show code'}
          </button>
          {showCode && (
            <CodeBlockView
              language="tsx"
              code={code}
              showCopy
              style={{ borderRadius: 0, borderTop: '1px solid var(--color-surface-border)' }}
            />
          )}
        </div>
      )}
    </div>
  );
}

// Block — for standalone card usage outside Row. Kept for complex panel content.
function Block({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-surface-border)',
      borderRadius: '8px',
      padding: '16px',
      ...style,
    }}>
      {children}
    </div>
  );
}

function PropTag({ name, value }: { name: string; value: string }) {
  return (
    <span style={{
      fontSize: '10px', fontFamily: 'monospace',
      background: 'color-mix(in srgb, var(--color-primary) 10%, transparent)',
      color: 'var(--color-primary-light)',
      border: '1px solid color-mix(in srgb, var(--color-primary) 20%, transparent)',
      borderRadius: '4px', padding: '1px 6px',
    }}>
      {name}=<em style={{ color: 'var(--color-text-secondary)' }}>{value}</em>
    </span>
  );
}

// ─── Demo data ────────────────────────────────────────────────────────────────

const METHOD_OPTIONS = [
  { value: 'GET',    label: 'GET',    color: 'var(--color-method-get)' },
  { value: 'POST',   label: 'POST',   color: 'var(--color-method-post)' },
  { value: 'PUT',    label: 'PUT',    color: 'var(--color-method-put)' },
  { value: 'PATCH',  label: 'PATCH',  color: 'var(--color-method-patch)' },
  { value: 'DELETE', label: 'DELETE', color: 'var(--color-method-delete)' },
];

const PROTOCOL_OPTIONS = [
  { value: 'rest',  label: 'REST'      },
  { value: 'gql',   label: 'GraphQL'   },
  { value: 'ws',    label: 'WebSocket' },
  { value: 'grpc',  label: 'gRPC'      },
  { value: 'soap',  label: 'SOAP'      },
];

const PILL_TABS: TabItem[] = [
  { id: 'params',  label: 'Params',  badge: 2 },
  { id: 'headers', label: 'Headers', badge: 4 },
  { id: 'body',    label: 'Body' },
  { id: 'auth',    label: 'Auth', dot: true, dotColor: 'var(--color-success)' },
  { id: 'scripts', label: 'Scripts' },
];

const GQL_TABS_INIT: TabItem[] = [
  { id: 'q1', label: 'Query 1',      closeable: true },
  { id: 'q2', label: 'getUsers',     closeable: true },
  { id: 'q3', label: 'createOrder',  closeable: true },
  { id: 'q4', label: 'deleteProduct', closeable: true },
];

const CONTEXT_ITEMS: ContextMenuItem[] = [
  { id: 'rename',    label: 'Rename',    icon: <RenameIcon size={13} />, shortcut: '⌘R', onClick: () => alert('Rename') },
  { id: 'duplicate', label: 'Duplicate', icon: <CopyIcon size={13} />,   onClick: () => alert('Duplicate') },
  { id: 'sep1', label: '', separator: true },
  {
    id: 'export', label: 'Export as…', icon: <ExportIcon size={13} />,
    children: [
      { id: 'export-json', label: 'JSON', onClick: () => alert('Export JSON') },
      { id: 'export-curl', label: 'cURL', onClick: () => alert('Export cURL') },
      { id: 'export-har',  label: 'HAR',  onClick: () => alert('Export HAR') },
    ],
  },
  { id: 'sep2', label: '', separator: true },
  { id: 'delete', label: 'Delete', icon: <TrashIcon size={13} />, danger: true, shortcut: '⌫', onClick: () => alert('Delete!') },
];

const DROPDOWN_ITEMS: ContextMenuItem[] = [
  { id: 'save-as',   label: 'Save as…',   onClick: () => alert('Save as') },
  { id: 'save-copy', label: 'Save a copy', onClick: () => alert('Save copy') },
  { id: 'sep', label: '', separator: true },
  { id: 'export',    label: 'Export…',    onClick: () => alert('Export') },
];

const PROTOCOLS = [
  { label: 'REST',      color: 'var(--color-protocol-rest)',      badge: 'REST' },
  { label: 'GraphQL',   color: 'var(--color-protocol-graphql)',   badge: 'GQL' },
  { label: 'WebSocket', color: 'var(--color-protocol-websocket)', badge: 'WS'  },
  { label: 'gRPC',      color: 'var(--color-protocol-grpc)',      badge: 'gRPC' },
  { label: 'SOAP',      color: 'var(--color-protocol-soap)',      badge: 'SOAP' },
  { label: 'MQTT',      color: 'var(--color-protocol-mqtt)',      badge: 'MQTT' },
  { label: 'SSE',       color: 'var(--color-protocol-sse)',       badge: 'SSE'  },
  { label: 'MCP',       color: 'var(--color-protocol-mcp)',       badge: 'MCP'  },
  { label: 'AI',        color: 'var(--color-protocol-ai)',        badge: 'AI'   },
];

const SAMPLE_JSON = `{
  "id": 1,
  "name": "Alice",
  "email": "alice@example.com",
  "role": "admin"
}`;

// ─── Category panels ──────────────────────────────────────────────────────────

function ChipsPanel() {
  return (
    <div>
      <Row label="Protocol chips" code={`{PROTOCOLS.map(p => (\n  <ChipView key={p.label} label={p.badge} color={p.color} size="sm" />\n))}`}>
        {PROTOCOLS.map(p => <ChipView key={p.label} label={p.badge} color={p.color} size="sm" />)}
      </Row>
      <Row label="HTTP method chips" code={`<ChipView label="GET"    color="var(--color-method-get)"    size="sm" />\n<ChipView label="POST"   color="var(--color-method-post)"   size="sm" />\n<ChipView label="DELETE" color="var(--color-method-delete)" size="sm" />`}>
        <ChipView label="GET"    color="var(--color-method-get)"    size="sm" />
        <ChipView label="POST"   color="var(--color-method-post)"   size="sm" />
        <ChipView label="PUT"    color="var(--color-method-put)"    size="sm" />
        <ChipView label="PATCH"  color="var(--color-method-patch)"  size="sm" />
        <ChipView label="DELETE" color="var(--color-method-delete)" size="sm" />
        <ChipView label="HEAD"   color="var(--color-method-head)"   size="sm" />
      </Row>
      <Row label="Status code chips" code={`<ChipView label="200 OK"          color="var(--color-success)" active />\n<ChipView label="404 Not Found"   color="var(--color-warning)" active />\n<ChipView label="500 Error"       color="var(--color-error)"   active />`}>
        <ChipView label="200 OK"           color="var(--color-success)" active />
        <ChipView label="201 Created"      color="var(--color-success)" />
        <ChipView label="400 Bad Request"  color="var(--color-warning)" />
        <ChipView label="404 Not Found"    color="var(--color-warning)" active />
        <ChipView label="500 Error"        color="var(--color-error)"   active />
      </Row>
      <Row label="Sizes  (xs / sm / md)" code={`<ChipView label="xs" size="xs" color="var(--color-primary)" />\n<ChipView label="sm" size="sm" color="var(--color-primary)" />\n<ChipView label="md" size="md" color="var(--color-primary)" />`}>
        <ChipView label="xs" size="xs" color="var(--color-primary)" />
        <ChipView label="sm" size="sm" color="var(--color-primary)" />
        <ChipView label="md" size="md" color="var(--color-primary)" />
      </Row>
      <Row label="Active (filled) vs outlined" code={`<ChipView label="Active"   color="var(--color-success)" active />\n<ChipView label="Outlined" color="var(--color-success)" />\n<ChipView label="Active"   color="var(--color-error)" active />\n<ChipView label="Outlined" color="var(--color-error)" />`}>
        <ChipView label="Active"   color="var(--color-protocol-graphql)" active />
        <ChipView label="Outlined" color="var(--color-protocol-graphql)" />
        <ChipView label="Active"   color="var(--color-success)" active />
        <ChipView label="Outlined" color="var(--color-success)" />
        <ChipView label="Active"   color="var(--color-error)" active />
        <ChipView label="Outlined" color="var(--color-error)" />
      </Row>
      <Row label="rounded=true vs rounded=false" code={`<ChipView label="rounded" rounded    color="var(--color-info)" />\n<ChipView label="pointy"  rounded={false} color="var(--color-info)" />`}>
        <ChipView label="rounded" rounded color="var(--color-info)" />
        <ChipView label="pointy" rounded={false} color="var(--color-info)" />
      </Row>
    </div>
  );
}

function TextInputPanel() {
  const [textVal, setTextVal] = useState('');
  return (
    <div>
      <Row label="Sizes  default · sm · md · lg · xl" code={`<TextInputView size="default" placeholder="default — 26px" />\n<TextInputView size="sm"      placeholder="sm — 22px" />\n<TextInputView size="md"      placeholder="md — 28px" />\n<TextInputView size="lg"      placeholder="lg — 32px" />\n<TextInputView size="xl"      placeholder="xl — 36px" />`}>
        <TextInputView size="default" placeholder="default — 26px" style={{ width: 170 }} />
        <TextInputView size="sm"      placeholder="sm — 22px"      style={{ width: 130 }} />
        <TextInputView size="md"      placeholder="md — 28px"      style={{ width: 130 }} />
        <TextInputView size="lg"      placeholder="lg — 32px"      style={{ width: 130 }} />
        <TextInputView size="xl"      placeholder="xl — 36px"      style={{ width: 130 }} />
      </Row>
      <Row label="With iconLeft / iconRight" code={`<TextInputView placeholder="Search…"      iconLeft={<SearchIcon size={11} />} />\n<TextInputView placeholder="API endpoint" iconLeft={<GlobeIcon size={11} />} iconRight={<InfoCircleIcon size={11} />} />\n<TextInputView placeholder="Settings key" iconLeft={<SettingsIcon size={11} />} />`}>
        <TextInputView placeholder="Search…"      iconLeft={<SearchIcon size={11} />} style={{ width: 200 }} />
        <TextInputView placeholder="API endpoint" iconLeft={<GlobeIcon size={11} />} iconRight={<InfoCircleIcon size={11} />} style={{ width: 240 }} />
        <TextInputView placeholder="Settings key" iconLeft={<SettingsIcon size={11} />} style={{ width: 180 }} />
      </Row>
      <Row label="error=true  (red focus ring)" code={`<TextInputView error placeholder="Required field" />\n<TextInputView error value="bad-value@" onChange={() => {}} />`}>
        <TextInputView error placeholder="Required field" style={{ width: 180 }} />
        <TextInputView error value="bad-value@" onChange={() => {}} style={{ width: 160 }} />
      </Row>
      <Row label="rounded=true vs rounded=false" code={`<TextInputView placeholder="rounded (default)" rounded />\n<TextInputView placeholder="pointy" rounded={false} />`}>
        <TextInputView placeholder="rounded (default)" rounded style={{ width: 170 }} />
        <TextInputView placeholder="pointy" rounded={false} style={{ width: 130 }} />
      </Row>
      <Row label="Custom accentColor" code={`<TextInputView accentColor="var(--color-protocol-graphql)"   placeholder="GraphQL purple" />\n<TextInputView accentColor="var(--color-protocol-websocket)" placeholder="WebSocket green" />\n<TextInputView accentColor="var(--color-protocol-grpc)"      placeholder="gRPC teal" />`}>
        <TextInputView accentColor="var(--color-protocol-graphql)" placeholder="GraphQL purple" value={textVal} onChange={e => setTextVal(e.target.value)} style={{ width: 200 }} />
        <TextInputView accentColor="var(--color-protocol-websocket)" placeholder="WebSocket green" style={{ width: 200 }} />
        <TextInputView accentColor="var(--color-protocol-grpc)" placeholder="gRPC teal" style={{ width: 180 }} />
      </Row>
    </div>
  );
}

function SelectInputPanel() {
  const [method, setMethod] = useState('GET');
  const [protocol, setProtocol] = useState('rest');
  const [method2, setMethod2] = useState('POST');
  return (
    <div>
      <Row label="Sizes  default · sm · md · lg · xl" code={`<SelectInputView options={options} value={val} onChange={setVal} size="default" />\n<SelectInputView options={options} value={val} onChange={setVal} size="sm" />\n<SelectInputView options={options} value={val} onChange={setVal} size="md" />\n<SelectInputView options={options} value={val} onChange={setVal} size="lg" />\n<SelectInputView options={options} value={val} onChange={setVal} size="xl" />`}>
        <SelectInputView options={METHOD_OPTIONS} value={method} onChange={setMethod} size="default" style={{ width: 105 }} />
        <SelectInputView options={METHOD_OPTIONS} value={method} onChange={setMethod} size="sm"      style={{ width: 95 }} />
        <SelectInputView options={METHOD_OPTIONS} value={method} onChange={setMethod} size="md"      style={{ width: 105 }} />
        <SelectInputView options={METHOD_OPTIONS} value={method} onChange={setMethod} size="lg"      style={{ width: 105 }} />
        <SelectInputView options={METHOD_OPTIONS} value={method} onChange={setMethod} size="xl"      style={{ width: 105 }} />
      </Row>
      <Row label="Colored options (HTTP methods)" code={`const options = [\n  { value: 'GET',    label: 'GET',    color: 'var(--color-method-get)' },\n  { value: 'POST',   label: 'POST',   color: 'var(--color-method-post)' },\n  { value: 'DELETE', label: 'DELETE', color: 'var(--color-method-delete)' },\n];\n<SelectInputView options={options} value={method} onChange={setMethod} />`}>
        <SelectInputView options={METHOD_OPTIONS} value={method2} onChange={setMethod2} style={{ width: 130 }} />
      </Row>
      <Row label="Group headers" code={`const options = [\n  { value: 'h', label: 'Request Protocols', isHeader: true },\n  { value: 'rest', label: 'REST' },\n  { value: 'gql',  label: 'GraphQL' },\n];\n<SelectInputView options={options} value={val} onChange={setVal} />`}>
        <SelectInputView
          options={[{ value: 'h', label: 'Request Protocols', isHeader: true }, ...PROTOCOL_OPTIONS]}
          value={protocol} onChange={setProtocol} style={{ width: 170 }}
        />
      </Row>
      <Row label="Custom accentColor" code={`<SelectInputView options={options} value={val} onChange={setVal} accentColor="var(--color-protocol-graphql)" />\n<SelectInputView options={options} value={val} onChange={setVal} accentColor="var(--color-protocol-soap)" />`}>
        <SelectInputView options={METHOD_OPTIONS} value={method} onChange={setMethod} accentColor="var(--color-protocol-graphql)" style={{ width: 130 }} />
        <SelectInputView options={METHOD_OPTIONS} value={method} onChange={setMethod} accentColor="var(--color-protocol-soap)" style={{ width: 130 }} />
      </Row>
      <Row label="rounded=false" code={`<SelectInputView options={options} value={val} onChange={setVal} rounded={false} />`}>
        <SelectInputView options={METHOD_OPTIONS} value={method} onChange={setMethod} rounded={false} style={{ width: 130 }} />
      </Row>
      <Row label="Aligned with TextInputView — same 26px height" code={`<SelectInputView options={HTTP_METHODS} value={method} onChange={setMethod} style={{ width: 90 }} />\n<TextInputView placeholder="https://api.example.com/users" style={{ flex: 1 }} />`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <SelectInputView options={METHOD_OPTIONS} value={method} onChange={setMethod} style={{ width: 90 }} />
          <TextInputView placeholder="https://api.example.com/users" style={{ flex: 1, width: 300 }} />
        </div>
      </Row>
    </div>
  );
}

// ─── HTTP method options for SelectTextInputView (color-coded) ────────────────
const ST_HTTP_METHODS: SelectTextOption[] = [
  { value: 'GET',    label: 'GET',    color: 'var(--color-method-get)' },
  { value: 'POST',   label: 'POST',   color: 'var(--color-method-post)' },
  { value: 'PUT',    label: 'PUT',    color: 'var(--color-method-put)' },
  { value: 'PATCH',  label: 'PATCH',  color: 'var(--color-method-patch)' },
  { value: 'DELETE', label: 'DELETE', color: 'var(--color-method-delete)' },
  { value: 'OPTIONS', label: 'OPTIONS', color: 'var(--color-text-muted)' },
  { value: 'HEAD',  label: 'HEAD',   color: 'var(--color-text-muted)' },
];
const ST_GRPC_METHODS: SelectTextOption[] = [
  { value: 'Unary',           label: 'Unary',           color: 'var(--color-protocol-grpc)' },
  { value: 'ClientStream',    label: 'Client Stream',   color: 'var(--color-protocol-grpc)' },
  { value: 'ServerStream',    label: 'Server Stream',   color: 'var(--color-protocol-grpc)' },
  { value: 'BidirStream',     label: 'Bidi Stream',     color: 'var(--color-protocol-grpc)' },
];
const ST_SOAP_METHODS: SelectTextOption[] = [
  { value: 'SOAP11', label: 'SOAP 1.1', color: 'var(--color-protocol-soap)' },
  { value: 'SOAP12', label: 'SOAP 1.2', color: 'var(--color-protocol-soap)' },
];
const ST_PROTOCOL_OPTIONS: SelectTextOption[] = [
  { value: 'REST',      label: 'REST',      color: 'var(--color-protocol-rest)' },
  { value: 'GraphQL',   label: 'GraphQL',   color: 'var(--color-protocol-graphql)' },
  { value: 'WebSocket', label: 'WebSocket', color: 'var(--color-protocol-ws)' },
  { value: 'gRPC',      label: 'gRPC',      color: 'var(--color-protocol-grpc)' },
  { value: 'SOAP',      label: 'SOAP',      color: 'var(--color-protocol-soap)' },
];

// SOAP URL bar layout: [version toggle] [WSDL button hint] [endpoint input]
// Daakia SoapUrlBar: version pill (1.1/1.2) + WSDL import + endpoint input + operation selector
function SoapUrlBarDemo({ accentColor }: { accentColor: string }) {
  const [version, setVersion] = useState<'1.1' | '1.2'>('1.1');
  const [endpoint, setEndpoint] = useState('https://service.example.com/endpoint');
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, width: '100%',
      padding: '8px', background: 'var(--color-panel)',
      border: '1px solid var(--color-surface-border)', borderRadius: 8,
    }}>
      {/* Version toggle pill — matches Daakia SoapUrlBar */}
      <button
        type="button"
        onClick={() => setVersion(v => v === '1.1' ? '1.2' : '1.1')}
        title="Click to toggle SOAP version"
        style={{
          height: 28, padding: '0 10px', borderRadius: 5, border: 'none', cursor: 'pointer',
          background: `color-mix(in srgb, ${accentColor} 15%, transparent)`,
          color: accentColor, fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', flexShrink: 0,
          transition: 'background 120ms',
        }}
        onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = `color-mix(in srgb, ${accentColor} 25%, transparent)`}
        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = `color-mix(in srgb, ${accentColor} 15%, transparent)`}
      >{version}</button>
      {/* WSDL button — matches Daakia */}
      <button
        type="button"
        style={{
          height: 28, padding: '0 10px', borderRadius: 5, border: `1px solid color-mix(in srgb, ${accentColor} 40%, transparent)`,
          background: `color-mix(in srgb, ${accentColor} 8%, transparent)`,
          color: accentColor, fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
        }}
      >WSDL</button>
      {/* Endpoint input */}
      <div style={{
        flex: 1, height: 28, background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)',
        borderRadius: 5, display: 'flex', alignItems: 'center', padding: '0 8px',
      }}>
        <input
          value={endpoint} onChange={e => setEndpoint(e.target.value)}
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 12, color: 'var(--color-text-primary)', fontFamily: 'inherit' }}
          placeholder="Service endpoint URL"
        />
      </div>
    </div>
  );
}

function SelectTextInputPanel() {
  const [method, setMethod]       = useState('GET');
  const [url, setUrl]             = useState('https://api.example.com/users');
  const [method2, setMethod2]     = useState('POST');
  const [url2, setUrl2]           = useState('');
  const [smMethod, setSmMethod]   = useState('GET');
  const [mdMethod, setMdMethod]   = useState('POST');
  const [lgMethod, setLgMethod]   = useState('PUT');
  const [proto, setProto]         = useState('REST');
  const [protoUrl, setProtoUrl]   = useState('');

  return (
    <div>
      <Row label="REST — HTTP method + URL (Postman-style)" gap={0} code={`<SelectTextInputView\n  selectValue={method}\n  selectOptions={HTTP_METHODS}  // colored GET/POST/PUT/PATCH/DELETE\n  onSelectChange={setMethod}\n  inputValue={url}\n  onInputChange={setUrl}\n  size="md"\n  placeholder="Enter URL or paste text"\n/>`}>
        <div style={{ width: '100%' }}>
          <SelectTextInputView
            selectValue={method} selectOptions={ST_HTTP_METHODS} onSelectChange={setMethod}
            inputValue={url} onInputChange={setUrl}
            size="md" placeholder="Enter URL or paste text"
          />
        </div>
      </Row>
      <Row label="Sizes — sm (26px) / md (34px) / lg (40px) — change method to see live update" align="flex-start" code={`// Each size is independent — change method in the dropdown to see live update\n<SelectTextInputView size="sm" selectValue={smMethod} onSelectChange={setSmMethod} ... />\n<SelectTextInputView size="md" selectValue={mdMethod} onSelectChange={setMdMethod} ... />\n<SelectTextInputView size="lg" selectValue={lgMethod} onSelectChange={setLgMethod} ... />`}>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SelectTextInputView
            selectValue={smMethod} selectOptions={ST_HTTP_METHODS} onSelectChange={setSmMethod}
            inputValue="" onInputChange={() => {}} size="sm" placeholder="Small (26px) — change method ↑"
          />
          <SelectTextInputView
            selectValue={mdMethod} selectOptions={ST_HTTP_METHODS} onSelectChange={setMdMethod}
            inputValue="" onInputChange={() => {}} size="md" placeholder="Medium (34px — default) — change method ↑"
          />
          <SelectTextInputView
            selectValue={lgMethod} selectOptions={ST_HTTP_METHODS} onSelectChange={setLgMethod}
            inputValue="" onInputChange={() => {}} size="lg" placeholder="Large (40px) — change method ↑"
          />
        </div>
      </Row>
      <Row label="POST — empty URL with placeholder" gap={0} code={`<SelectTextInputView\n  selectValue={method}\n  selectOptions={HTTP_METHODS}\n  onSelectChange={setMethod}\n  inputValue={url}\n  onInputChange={setUrl}\n  placeholder="Enter request URL…"\n/>`}>
        <div style={{ width: '100%' }}>
          <SelectTextInputView
            selectValue={method2} selectOptions={ST_HTTP_METHODS} onSelectChange={setMethod2}
            inputValue={url2} onInputChange={setUrl2}
            placeholder="Enter request URL…"
          />
        </div>
      </Row>
      <Row label="SOAP URL bar — version toggle (1.1/1.2) + WSDL button + endpoint (matches Daakia SoapUrlBar)" align="flex-start" code={`// In Daakia, SOAP version is a toggle pill (1.1 ↔ 1.2), not a dropdown\n// [1.1] [WSDL] [endpoint input] [Operation selector] [Invoke]\n// The SelectTextInputView is used for the SOAP version dropdown variant below\n<SelectTextInputView\n  selectValue={soapVersion}  // "SOAP 1.1" | "SOAP 1.2"\n  selectOptions={ST_SOAP_METHODS}\n  onSelectChange={setSoapVersion}\n  inputValue={wsdlUrl}\n  onInputChange={setWsdlUrl}\n  placeholder="WSDL URL"\n  accentColor="var(--color-protocol-soap)"\n/>`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
          <div style={{ fontSize: 10, color: 'var(--color-text-muted)', letterSpacing: '0.04em' }}>DAAKIA SOAP URL BAR (click version pill to toggle):</div>
          <SoapUrlBarDemo accentColor="var(--color-protocol-soap)" />
          <div style={{ fontSize: 10, color: 'var(--color-text-muted)', letterSpacing: '0.04em', marginTop: 4 }}>SELECTTEXTINPUTVIEW VARIANT (dropdown style):</div>
          <SelectTextInputView
            selectValue={ST_SOAP_METHODS[0].value} selectOptions={ST_SOAP_METHODS} onSelectChange={() => {}}
            inputValue="" onInputChange={() => {}}
            placeholder="WSDL URL"
            selectWidth={100}
            accentColor="var(--color-protocol-soap)"
          />
        </div>
      </Row>
      <Row label="Protocol switcher — generic" gap={0} code={`<SelectTextInputView\n  selectValue={proto}\n  selectOptions={[\n    { value: 'REST',      label: 'REST',      color: 'var(--color-protocol-rest)' },\n    { value: 'GraphQL',   label: 'GraphQL',   color: 'var(--color-protocol-graphql)' },\n    { value: 'WebSocket', label: 'WebSocket', color: 'var(--color-protocol-ws)' },\n  ]}\n  onSelectChange={setProto}\n  inputValue={url}\n  onInputChange={setUrl}\n  placeholder="Endpoint URL"\n  selectWidth={100}\n/>`}>
        <div style={{ width: '100%' }}>
          <SelectTextInputView
            selectValue={proto} selectOptions={ST_PROTOCOL_OPTIONS} onSelectChange={setProto}
            inputValue={protoUrl} onInputChange={setProtoUrl}
            placeholder="Endpoint URL"
            selectWidth={100}
          />
        </div>
      </Row>
    </div>
  );
}

function ButtonPanel() {
  return (
    <div>
      <Row label="Variants  primary · secondary · ghost · danger" code={`<ButtonView variant="primary">Primary</ButtonView>\n<ButtonView variant="secondary">Secondary</ButtonView>\n<ButtonView variant="ghost">Ghost</ButtonView>\n<ButtonView variant="danger">Danger</ButtonView>`}>
        <ButtonView variant="primary">Primary</ButtonView>
        <ButtonView variant="secondary">Secondary</ButtonView>
        <ButtonView variant="ghost">Ghost</ButtonView>
        <ButtonView variant="danger">Danger</ButtonView>
      </Row>
      <Row label="Sizes  default(26px) · sm(22px) · md(28px) · lg(32px) · xl(36px)" code={`<ButtonView variant="primary" size="default">Default 26px</ButtonView>\n<ButtonView variant="primary" size="sm">SM 22px</ButtonView>\n<ButtonView variant="primary" size="md">MD 28px</ButtonView>\n<ButtonView variant="primary" size="lg">LG 32px</ButtonView>\n<ButtonView variant="primary" size="xl">XL 36px</ButtonView>`}>
        <ButtonView variant="primary" size="default">Default 26px</ButtonView>
        <ButtonView variant="primary" size="sm">SM 22px</ButtonView>
        <ButtonView variant="primary" size="md">MD 28px</ButtonView>
        <ButtonView variant="primary" size="lg">LG 32px</ButtonView>
        <ButtonView variant="primary" size="xl">XL 36px</ButtonView>
      </Row>
      <Row label="With iconLeft / iconRight" code={`<ButtonView variant="primary"   iconLeft={<PlayIcon size={11} />}>Send</ButtonView>\n<ButtonView variant="secondary" iconLeft={<SaveIcon size={11} />}>Save</ButtonView>\n<ButtonView variant="ghost"     iconLeft={<RefreshIcon size={11} />}>Refresh</ButtonView>\n<ButtonView variant="danger"    iconLeft={<TrashIcon size={11} />}>Delete</ButtonView>\n<ButtonView variant="secondary" iconRight={<DownloadIcon size={11} />}>Download</ButtonView>`}>
        <ButtonView variant="primary"   iconLeft={<PlayIcon size={11} />}>Send</ButtonView>
        <ButtonView variant="secondary" iconLeft={<SaveIcon size={11} />}>Save</ButtonView>
        <ButtonView variant="ghost"     iconLeft={<RefreshIcon size={11} />}>Refresh</ButtonView>
        <ButtonView variant="danger"    iconLeft={<TrashIcon size={11} />}>Delete</ButtonView>
        <ButtonView variant="secondary" iconRight={<DownloadIcon size={11} />}>Download</ButtonView>
      </Row>
      <Row label="loading=true" code={`<ButtonView variant="primary"   loading>Sending…</ButtonView>\n<ButtonView variant="secondary" loading>Saving…</ButtonView>\n<ButtonView variant="ghost"     loading>Loading…</ButtonView>`}>
        <ButtonView variant="primary" loading>Sending…</ButtonView>
        <ButtonView variant="secondary" loading>Saving…</ButtonView>
        <ButtonView variant="ghost" loading>Loading…</ButtonView>
      </Row>
      <Row label="disabled=true" code={`<ButtonView variant="primary"   disabled>Disabled</ButtonView>\n<ButtonView variant="secondary" disabled>Disabled</ButtonView>\n<ButtonView variant="ghost"     disabled>Disabled</ButtonView>\n<ButtonView variant="danger"    disabled>Disabled</ButtonView>`}>
        <ButtonView variant="primary" disabled>Disabled</ButtonView>
        <ButtonView variant="secondary" disabled>Disabled</ButtonView>
        <ButtonView variant="ghost" disabled>Disabled</ButtonView>
        <ButtonView variant="danger" disabled>Disabled</ButtonView>
      </Row>
      <Row label="rounded=false (pointy corners)" code={`<ButtonView variant="primary"   rounded={false}>Pointy Primary</ButtonView>\n<ButtonView variant="secondary" rounded={false}>Pointy Secondary</ButtonView>\n<ButtonView variant="ghost"     rounded={false}>Pointy Ghost</ButtonView>`}>
        <ButtonView variant="primary" rounded={false}>Pointy Primary</ButtonView>
        <ButtonView variant="secondary" rounded={false}>Pointy Secondary</ButtonView>
        <ButtonView variant="ghost" rounded={false}>Pointy Ghost</ButtonView>
      </Row>
      <Row label="Custom accentColor per protocol" code={`<ButtonView variant="primary" accentColor="var(--color-protocol-rest)">Send REST</ButtonView>\n<ButtonView variant="primary" accentColor="var(--color-protocol-graphql)">Run GQL</ButtonView>\n<ButtonView variant="primary" accentColor="var(--color-protocol-websocket)">Connect WS</ButtonView>\n<ButtonView variant="primary" accentColor="var(--color-protocol-grpc)">Invoke gRPC</ButtonView>`}>
        <ButtonView variant="primary" accentColor="var(--color-protocol-rest)">Send REST</ButtonView>
        <ButtonView variant="primary" accentColor="var(--color-protocol-graphql)">Run GQL</ButtonView>
        <ButtonView variant="primary" accentColor="var(--color-protocol-websocket)">Connect WS</ButtonView>
        <ButtonView variant="primary" accentColor="var(--color-protocol-grpc)">Invoke gRPC</ButtonView>
        <ButtonView variant="primary" accentColor="var(--color-protocol-soap)">Call SOAP</ButtonView>
        <ButtonView variant="primary" accentColor="var(--color-protocol-mqtt)">Publish MQTT</ButtonView>
      </Row>
    </div>
  );
}

function IconButtonPanel() {
  const [active, setActive] = useState(false);
  const [active2, setActive2] = useState(false);

  return (
    <div>
      <Row label="Common icon buttons (ghost, 26px default)" gap={4} code={`<IconButtonView icon={<MoreHorizontalIcon size={14} />} tooltip="More actions" />\n<IconButtonView icon={<PlusIcon size={14} />} tooltip="Add" />\n<IconButtonView icon={<SparkleIcon size={14} />} tooltip="AI Assist" accentColor="var(--color-protocol-ai)" />\n<IconButtonView icon={<TrashIcon size={14} />} tooltip="Delete" />`}>
        <IconButtonView icon={<MoreHorizontalIcon size={14} />} tooltip="More actions" />
        <IconButtonView icon={<MoreVerticalIcon size={14} />} tooltip="More actions (vertical)" />
        <IconButtonView icon={<PlusIcon size={14} />} tooltip="Add" />
        <IconButtonView icon={<SparkleIcon size={14} />} tooltip="AI Assist" accentColor="var(--color-protocol-ai)" />
        <IconButtonView icon={<DownloadIcon size={14} />} tooltip="Import" />
        <IconButtonView icon={<ExportIcon size={14} />} tooltip="Export" />
        <IconButtonView icon={<InfoCircleIcon size={14} />} tooltip="Help" />
        <IconButtonView icon={<RefreshIcon size={14} />} tooltip="Refresh" />
        <IconButtonView icon={<TrashIcon size={14} />} tooltip="Delete" />
        <IconButtonView icon={<FilterIcon size={14} />} tooltip="Filter" />
        <IconButtonView icon={<CodeIcon size={14} />} tooltip="Code view" />
        <IconButtonView icon={<WandIcon size={14} />} tooltip="Generate" />
        <IconButtonView icon={<SettingsIcon size={14} />} tooltip="Settings" />
        <IconButtonView icon={<SearchIcon size={14} />} tooltip="Search" />
        <IconButtonView icon={<SaveIcon size={14} />} tooltip="Save" />
        <IconButtonView icon={<CopyIcon size={14} />} tooltip="Copy" />
      </Row>
      <Row label="Sizes  sm(22px) · default(26px) · md(28px) · lg(32px) · xl(36px)" gap={8} code={`<IconButtonView icon={<PlusIcon size={10} />} size="sm"      tooltip="sm 22px" />\n<IconButtonView icon={<PlusIcon size={12} />} size="default" tooltip="default 26px" />\n<IconButtonView icon={<PlusIcon size={13} />} size="md"      tooltip="md 28px" />\n<IconButtonView icon={<PlusIcon size={14} />} size="lg"      tooltip="lg 32px" />\n<IconButtonView icon={<PlusIcon size={16} />} size="xl"      tooltip="xl 36px" />`}>
        <IconButtonView icon={<PlusIcon size={10} />} size="sm"      tooltip="sm 22px" />
        <IconButtonView icon={<PlusIcon size={12} />} size="default" tooltip="default 26px" />
        <IconButtonView icon={<PlusIcon size={13} />} size="md"      tooltip="md 28px" />
        <IconButtonView icon={<PlusIcon size={14} />} size="lg"      tooltip="lg 32px" />
        <IconButtonView icon={<PlusIcon size={16} />} size="xl"      tooltip="xl 36px" />
      </Row>
      <Row label="active toggle — click to toggle" gap={12} code={`<IconButtonView\n  icon={<FilterIcon size={13} />}\n  active={active}\n  accentColor="var(--color-protocol-rest)"\n  tooltip={active ? 'Filters ON' : 'Filters OFF'}\n  onClick={() => setActive(v => !v)}\n/>`}>
        <IconButtonView
          icon={<FilterIcon size={13} />}
          active={active}
          accentColor="var(--color-protocol-rest)"
          tooltip={active ? 'Filters ON' : 'Filters OFF'}
          onClick={() => setActive(v => !v)}
        />
        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Filter: <strong style={{ color: active ? 'var(--color-protocol-rest)' : 'var(--color-text-primary)' }}>{active ? 'ON' : 'OFF'}</strong></span>

        <IconButtonView
          icon={<CheckIcon size={13} />}
          active={active2}
          accentColor="var(--color-success)"
          tooltip={active2 ? 'Verified' : 'Not verified'}
          onClick={() => setActive2(v => !v)}
        />
        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Verified: <strong style={{ color: active2 ? 'var(--color-success)' : 'var(--color-text-primary)' }}>{active2 ? 'YES' : 'NO'}</strong></span>
      </Row>
      <Row label='variant="filled"' gap={8} code={`<IconButtonView icon={<SparkleIcon size={13} />} variant="filled" accentColor="var(--color-protocol-ai)" tooltip="AI Assist" />\n<IconButtonView icon={<PlayIcon size={13} />}    variant="filled" accentColor="var(--color-success)" tooltip="Run" />\n<IconButtonView icon={<SettingsIcon size={13} />} variant="filled" tooltip="Settings" />`}>
        <IconButtonView icon={<SparkleIcon size={13} />} variant="filled" accentColor="var(--color-protocol-ai)"        tooltip="AI Assist" />
        <IconButtonView icon={<PlayIcon size={13} />}    variant="filled" accentColor="var(--color-success)"             tooltip="Run" />
        <IconButtonView icon={<SettingsIcon size={13} />} variant="filled"                                               tooltip="Settings" />
        <IconButtonView icon={<FilterIcon size={13} />}  variant="filled" accentColor="var(--color-protocol-graphql)"   tooltip="GQL filter" />
      </Row>
      <Row label="Protocol accents" gap={8} code={`{PROTOCOLS.map(p => (\n  <IconButtonView key={p.label} icon={<SparkleIcon size={13} />} accentColor={p.color} tooltip={p.label} />\n))}`}>
        {PROTOCOLS.map(p => (
          <IconButtonView key={p.label} icon={<SparkleIcon size={13} />} accentColor={p.color} tooltip={`${p.label} AI`} />
        ))}
      </Row>
    </div>
  );
}

function DropDownButtonPanel() {
  return (
    <div>
      <Row label="Variants" code={`<DropDownButtonView label="Save" variant="secondary" items={items} onPrimaryClick={save} />\n<DropDownButtonView label="Save" variant="primary" items={items} accentColor="var(--color-protocol-rest)" />\n<DropDownButtonView label="Export" variant="ghost" items={items} />\n<DropDownButtonView label="Delete" variant="danger" items={items} />`}>
        <DropDownButtonView label="Save" variant="secondary" items={DROPDOWN_ITEMS} onPrimaryClick={() => alert('Save!')} />
        <DropDownButtonView label="Save" variant="primary"   items={DROPDOWN_ITEMS} onPrimaryClick={() => alert('Save!')} accentColor="var(--color-protocol-rest)" />
        <DropDownButtonView label="Export" variant="ghost"   items={DROPDOWN_ITEMS} />
        <DropDownButtonView label="Delete" variant="danger"  items={DROPDOWN_ITEMS} />
      </Row>
      <Row label="Sizes  sm · default · md · lg" code={`<DropDownButtonView label="Save" size="sm"      items={items} />\n<DropDownButtonView label="Save" size="default" items={items} />\n<DropDownButtonView label="Save" size="md"      items={items} />\n<DropDownButtonView label="Save" size="lg"      items={items} />`}>
        <DropDownButtonView label="Save" size="sm"      items={DROPDOWN_ITEMS} />
        <DropDownButtonView label="Save" size="default" items={DROPDOWN_ITEMS} />
        <DropDownButtonView label="Save" size="md"      items={DROPDOWN_ITEMS} />
        <DropDownButtonView label="Save" size="lg"      items={DROPDOWN_ITEMS} />
      </Row>
      <Row label="Protocol accent colors" code={`<DropDownButtonView label="Send"    variant="primary" items={items} accentColor="var(--color-protocol-rest)" />\n<DropDownButtonView label="Run"     variant="primary" items={items} accentColor="var(--color-protocol-graphql)" />\n<DropDownButtonView label="Connect" variant="primary" items={items} accentColor="var(--color-protocol-websocket)" />`}>
        <DropDownButtonView label="Send"    variant="primary" items={DROPDOWN_ITEMS} accentColor="var(--color-protocol-rest)"      onPrimaryClick={() => alert('Send REST')} />
        <DropDownButtonView label="Run"     variant="primary" items={DROPDOWN_ITEMS} accentColor="var(--color-protocol-graphql)"   onPrimaryClick={() => alert('Run GQL')} />
        <DropDownButtonView label="Connect" variant="primary" items={DROPDOWN_ITEMS} accentColor="var(--color-protocol-websocket)" onPrimaryClick={() => alert('Connect WS')} />
      </Row>
      <Row label="rounded=false" code={`<DropDownButtonView label="Save" rounded={false} items={items} />\n<DropDownButtonView label="Save" rounded={false} variant="primary" items={items} />`}>
        <DropDownButtonView label="Save" rounded={false} items={DROPDOWN_ITEMS} />
        <DropDownButtonView label="Save" rounded={false} variant="primary" items={DROPDOWN_ITEMS} />
      </Row>
    </div>
  );
}

// 3-level collection tree menu (folder > export-as > format choice)
const COLLECTION_ITEMS: ContextMenuItem[] = [
  { id: 'new-req', label: 'New Request', icon: <PlusIcon size={13} />, onClick: () => alert('New Request') },
  {
    id: 'new-folder', label: 'New Folder', icon: <FolderIcon size={13} />,
    children: [
      { id: 'folder-rest', label: 'REST Collection', onClick: () => alert('REST') },
      {
        id: 'folder-gql', label: 'GraphQL Collection',
        children: [
          { id: 'gql-introspect', label: 'With Introspection', onClick: () => alert('GQL+Introspect') },
          { id: 'gql-manual',     label: 'Manual Schema',      onClick: () => alert('GQL Manual') },
        ],
      },
    ],
  },
  { id: 'sep1', label: '', separator: true },
  { id: 'rename',    label: 'Rename',    icon: <RenameIcon size={13} />, shortcut: '⌘R', onClick: () => alert('Rename') },
  { id: 'duplicate', label: 'Duplicate', icon: <CopyIcon size={13} />,                   onClick: () => alert('Duplicate') },
  { id: 'sep2', label: '', separator: true },
  {
    id: 'export', label: 'Export as…', icon: <ExportIcon size={13} />,
    children: [
      { id: 'export-json',     label: 'JSON',         onClick: () => alert('JSON') },
      { id: 'export-openapi',  label: 'OpenAPI 3.0',  onClick: () => alert('OpenAPI') },
      {
        id: 'export-more', label: 'More formats…',
        children: [
          { id: 'export-curl',    label: 'cURL',         onClick: () => alert('cURL') },
          { id: 'export-har',     label: 'HAR',          onClick: () => alert('HAR') },
          { id: 'export-postman', label: 'Postman v2.1', onClick: () => alert('Postman') },
        ],
      },
    ],
  },
  { id: 'delete', label: 'Delete', icon: <TrashIcon size={13} />, danger: true, shortcut: '⌫', onClick: () => alert('Delete!') },
];

function ContextMenuPanel() {
  const [open1, setOpen1] = useState(false);
  const [el1, setEl1] = useState<HTMLElement | null>(null);
  const [open2, setOpen2] = useState(false);
  const [el2, setEl2] = useState<HTMLElement | null>(null);
  const [open3, setOpen3] = useState(false);
  const [el3, setEl3] = useState<HTMLElement | null>(null);
  // Collection tree menu (3-level)
  const [openColl, setOpenColl] = useState(false);
  const [elColl, setElColl] = useState<HTMLElement | null>(null);
  // Position-aware: single menu instance, shared anchor
  const [openPos, setOpenPos] = useState(false);
  const [elPos, setElPos] = useState<HTMLElement | null>(null);

  const widthItems: ContextMenuItem[] = [
    { id: 'a', label: 'Rename',    icon: <RenameIcon size={13} />, onClick: () => alert('Rename') },
    { id: 'b', label: 'Duplicate', icon: <CopyIcon size={13} />,   onClick: () => alert('Duplicate') },
    { id: 'c', label: 'Delete',    icon: <TrashIcon size={13} />,  danger: true, onClick: () => alert('Delete') },
  ];

  // Simulated collection tree rows
  const treeItems = [
    { id: 'f1', name: 'User Service', method: 'GET',    color: 'var(--color-method-get)' },
    { id: 'f2', name: 'Create Order', method: 'POST',   color: 'var(--color-method-post)' },
    { id: 'f3', name: 'Update Cart',  method: 'PUT',    color: 'var(--color-method-put)' },
    { id: 'f4', name: 'Delete Item',  method: 'DELETE', color: 'var(--color-method-delete)' },
  ];

  return (
    <div>
      <Row label="Standard context menu (with submenu)" gap={12} code={`<ButtonView variant="secondary" onClick={e => { setAnchor(e.currentTarget); setOpen(true); }}>\n  Open Context Menu ▾\n</ButtonView>\n<ContextMenuView\n  items={CONTEXT_ITEMS}\n  anchorEl={anchor}\n  open={open}\n  onClose={() => setOpen(false)}\n/>`}>
        <ButtonView variant="secondary" onClick={e => { setEl1(e.currentTarget); setOpen1(v => !v); }}>
          Open Context Menu ▾
        </ButtonView>
        <ContextMenuView items={CONTEXT_ITEMS} anchorEl={el1} open={open1} onClose={() => setOpen1(false)} />
        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Hover "Export as…" for JSON / cURL / HAR submenu</span>
      </Row>

      <Row label="Collection tree — 3-level nested submenu (right-click a row)" noPad code={`// 3-level nesting: New Folder > GraphQL Collection > With Introspection\n// Export as… > More formats… > cURL / HAR / Postman\nconst COLLECTION_ITEMS: ContextMenuItem[] = [\n  { id: 'new-folder', label: 'New Folder', icon: <FolderIcon />,\n    children: [\n      { id: 'folder-gql', label: 'GraphQL Collection',\n        children: [\n          { id: 'gql-introspect', label: 'With Introspection', onClick: handleCreate },\n        ],\n      },\n    ],\n  },\n  { id: 'export', label: 'Export as…',\n    children: [\n      { id: 'more', label: 'More formats…',\n        children: [\n          { id: 'postman', label: 'Postman v2.1', onClick: exportPostman },\n        ],\n      },\n    ],\n  },\n];`}>
        <div style={{ width: '100%' }}>
          {treeItems.map(item => (
            <div
              key={item.id}
              onContextMenu={e => { e.preventDefault(); setElColl(e.currentTarget as HTMLElement); setOpenColl(true); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 16px', cursor: 'pointer',
                borderBottom: '1px solid color-mix(in srgb, var(--color-surface-border) 40%, transparent)',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              <ChipView label={item.method} color={item.color} size="xs" />
              <span style={{ flex: 1, fontSize: 12, color: 'var(--color-text-secondary)' }}>{item.name}</span>
              <button
                type="button"
                onMouseDown={e => { e.stopPropagation(); setElColl(e.currentTarget as HTMLElement); setOpenColl(v => !v); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '2px 4px', borderRadius: 4, display: 'flex', alignItems: 'center' }}
              >
                <MoreHorizontalIcon size={14} />
              </button>
            </div>
          ))}
          <div style={{ padding: '6px 16px', fontSize: 10, color: 'var(--color-text-muted)' }}>
            Right-click any row or click ⋯ — hover "New Folder" then "GraphQL Collection" to see 3-level depth
          </div>
          <ContextMenuView items={COLLECTION_ITEMS} anchorEl={elColl} open={openColl} onClose={() => setOpenColl(false)} />
        </div>
      </Row>

      <Row label='width sizes  "sm" / "md" / "lg"' gap={12} code={`<ContextMenuView items={items} anchorEl={el} open={open} onClose={close} width="sm" />\n<ContextMenuView items={items} anchorEl={el} open={open} onClose={close} width="md" />`}>
        <ButtonView variant="secondary" size="sm" onClick={e => { setEl2(e.currentTarget); setOpen2(v => !v); }}>sm menu</ButtonView>
        <ButtonView variant="secondary" size="sm" onClick={e => { setEl3(e.currentTarget); setOpen3(v => !v); }}>md menu</ButtonView>
        <ContextMenuView items={widthItems} anchorEl={el2} open={open2} onClose={() => setOpen2(false)} width="sm" />
        <ContextMenuView items={widthItems} anchorEl={el3} open={open3} onClose={() => setOpen3(false)} width="md" />
      </Row>
      <Row label="Features" code={`// Portal-rendered, recursive submenus, danger items, separators, shortcuts\n<ContextMenuView\n  items={[\n    { id: 'rename', label: 'Rename',    icon: <RenameIcon />, shortcut: '⌘R' },\n    { id: 'sep',    label: '',          separator: true },\n    { id: 'delete', label: 'Delete',    icon: <TrashIcon />,  danger: true },\n    { id: 'export', label: 'Export as…', children: [\n      { id: 'more',  label: 'More formats…', children: [\n        { id: 'curl', label: 'cURL' },\n      ]},\n    ]},\n  ]}\n/>`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
          {[
            '✓ Portal-rendered — always on top',
            '✓ Recursive submenu support — 3+ levels deep',
            '✓ Auto-repositions toward available viewport space',
            '✓ danger=true → red label (Delete item)',
            '✓ separator=true → horizontal rule divider',
            '✓ shortcut badge on the right',
            '✓ Escape key or outside click closes menu',
            '✓ onContextMenu / ⋯ button patterns both supported',
          ].map(f => <div key={f}>{f}</div>)}
        </div>
      </Row>

      <Row label="Position-aware — menu auto-opens toward available viewport space (scroll to bottom to test ↑)" align="flex-start" code={`// No extra props needed — ContextMenuView detects available space automatically\n// Menu near top-left  → opens DOWN-RIGHT\n// Menu near bottom-right → opens UP-LEFT\n<ContextMenuView items={items} anchorEl={anchor} open={open} onClose={close} />`}>
        <div style={{ width: '100%', height: 160, position: 'relative', background: 'color-mix(in srgb, var(--color-surface-border) 20%, transparent)', borderRadius: 8 }}>
          {([
            { label: 'Top-Left ▾',    style: { top: 8, left: 8 } as React.CSSProperties },
            { label: 'Top-Right ▾',   style: { top: 8, right: 8 } as React.CSSProperties },
            { label: 'Bottom-Left ▾', style: { bottom: 8, left: 8 } as React.CSSProperties },
            { label: 'Bottom-Right ▾',style: { bottom: 8, right: 8 } as React.CSSProperties },
          ]).map(({ label, style: s }) => (
            <button
              key={label}
              type="button"
              onClick={e => { setElPos(e.currentTarget); setOpenPos(v => !v); }}
              style={{
                position: 'absolute', ...s,
                padding: '4px 9px', borderRadius: 5, border: '1px solid var(--color-surface-border)',
                background: 'var(--color-surface)', cursor: 'pointer',
                color: 'var(--color-text-secondary)', fontSize: 11, fontFamily: 'inherit',
              }}
            >{label}</button>
          ))}
          <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 10, color: 'var(--color-text-muted)', textAlign: 'center', pointerEvents: 'none' }}>
            Click any corner button —<br />menu direction auto-adjusts
          </span>
          <ContextMenuView items={widthItems} anchorEl={elPos} open={openPos} onClose={() => setOpenPos(false)} />
        </div>
      </Row>
    </div>
  );
}

function TabsPanel() {
  const [pillTab, setPillTab] = useState('params');
  const [underlineTab, setUnderlineTab] = useState('params');
  const [gqlTabs, setGqlTabs] = useState(GQL_TABS_INIT);
  const [gqlActive, setGqlActive] = useState('q1');

  const addGqlTab = () => {
    const id = `q${Date.now()}`;
    setGqlTabs(t => [...t, { id, label: `Query ${t.length + 1}`, closeable: true }]);
    setGqlActive(id);
  };

  const closeGqlTab = (id: string) => {
    setGqlTabs(t => {
      const next = t.filter(x => x.id !== id);
      if (gqlActive === id && next.length > 0) setGqlActive(next[next.length - 1].id);
      return next;
    });
  };

  return (
    <div>
      <Row label='variant="pill"  (default) — sliding background indicator' align="flex-start" code={`<TabView\n  tabs={tabs}\n  active={activeTab}\n  onChange={setActiveTab}\n  variant="pill"\n  accentColor="var(--color-protocol-rest)"\n/>`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
          <TabView tabs={PILL_TABS} active={pillTab} onChange={setPillTab} accentColor="var(--color-protocol-rest)" />
          <TabView tabs={PILL_TABS} active={pillTab} onChange={setPillTab} accentColor="var(--color-protocol-graphql)" />
          <TabView tabs={PILL_TABS} active={pillTab} onChange={setPillTab} size="sm" accentColor="var(--color-protocol-grpc)" />
        </div>
      </Row>
      <Row label='variant="underline" — sliding 2px bottom border' align="flex-start" code={`<TabView\n  tabs={tabs}\n  active={activeTab}\n  onChange={setActiveTab}\n  variant="underline"\n  accentColor="var(--color-protocol-rest)"\n/>`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
          <TabView tabs={PILL_TABS} active={underlineTab} onChange={setUnderlineTab} variant="underline" accentColor="var(--color-protocol-rest)" />
          <TabView tabs={PILL_TABS} active={underlineTab} onChange={setUnderlineTab} variant="underline" size="sm" accentColor="var(--color-protocol-graphql)" />
        </div>
      </Row>
      <Row label='variant="gql" — closeable + scrollable + addable (click × to close, + to add)' noPad code={`<TabView\n  tabs={gqlTabs}\n  active={gqlActive}\n  onChange={setGqlActive}\n  onClose={closeTab}\n  onAdd={addTab}\n  variant="gql"\n  accentColor="var(--color-protocol-graphql)"\n/>`}>
        <div style={{ width: '100%' }}>
          <TabView
            tabs={gqlTabs}
            active={gqlActive}
            onChange={setGqlActive}
            onClose={closeGqlTab}
            onAdd={addGqlTab}
            variant="gql"
            accentColor="var(--color-protocol-graphql)"
          />
          <div style={{ padding: '12px 16px', fontSize: '11px', color: 'var(--color-text-muted)' }}>
            Active: <strong style={{ color: 'var(--color-text-primary)' }}>{gqlTabs.find(t => t.id === gqlActive)?.label}</strong>
            <span style={{ marginLeft: '12px', opacity: 0.6 }}>({gqlTabs.length} tab{gqlTabs.length !== 1 ? 's' : ''})</span>
          </div>
        </div>
      </Row>
    </div>
  );
}

// Hover-to-insert divider — matching KeyValueTable's InsertRowDivider
function KvInsertDivider({ onClick }: { onClick: () => void }) {
  const color = 'var(--color-protocol-rest)';
  return (
    <div
      className="group relative h-[14px] flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
      onClick={onClick}
    >
      <div
        className="absolute inset-x-4 top-1/2 h-px"
        style={{ background: `color-mix(in srgb, ${color} 25%, transparent)` }}
      />
      <button
        type="button"
        className="relative z-10 flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium pointer-events-none"
        style={{
          background: `color-mix(in srgb, ${color} 10%, transparent)`,
          color,
          border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
        }}
      >
        <PlusIcon size={10} /> Row
      </button>
    </div>
  );
}

// Column header row matching KeyValueTable layout
function KvColumnHeader({ showDesc }: { showDesc?: boolean }) {
  const cols = showDesc ? '32px 1fr 1fr 1fr 32px' : '32px 1fr 1fr 32px';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '8px', padding: '0 4px 4px' }}>
      <div />
      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', paddingLeft: '10px' }}>KEY</div>
      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', paddingLeft: '10px' }}>VALUE</div>
      {showDesc && <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', paddingLeft: '10px' }}>DESCRIPTION</div>}
      <div />
    </div>
  );
}

function KeyValuePanel() {
  const nextId = useRef(10);
  const [rows, setRows] = useState([
    { id: '1', key: 'Authorization', value: 'Bearer abc123', enabled: true },
    { id: '2', key: 'Content-Type',  value: 'application/json', enabled: true },
    { id: '3', key: 'X-Request-ID',  value: '', enabled: false },
    { id: '4', key: '',              value: '', enabled: true },
  ]);

  const addRow = (afterIdx?: number) => {
    const r = { id: String(nextId.current++), key: '', value: '', enabled: true };
    if (afterIdx !== undefined) {
      setRows(rs => { const n = [...rs]; n.splice(afterIdx + 1, 0, r); return n; });
    } else {
      setRows(rs => [...rs, r]);
    }
  };
  const removeRow  = (i: number) => setRows(rs => rs.length > 1 ? rs.filter((_, j) => j !== i) : rs);
  const toggleRow  = (i: number) => setRows(rs => rs.map((r, j) => j === i ? { ...r, enabled: !r.enabled } : r));
  const setRowKey  = (i: number, k: string) => setRows(rs => rs.map((r, j) => j === i ? { ...r, key: k } : r));
  const setRowVal  = (i: number, v: string) => setRows(rs => rs.map((r, j) => j === i ? { ...r, value: v } : r));

  return (
    <div>
      {/* Pattern 1: ditto Headers tab — flat rows, transparent inputs, + Add row at bottom */}
      <Row label="Ditto Headers tab — flat rows · transparent inputs · + Add row at bottom" gap={0} code={`{rows.map((row, i) => (\n  <KeyValueItemView\n    key={row.id}\n    enabled={row.enabled}\n    onToggleEnabled={() => toggle(i)}\n    keyValue={row.key}   onKeyChange={k => setKey(i, k)}\n    value={row.value}   onValueChange={v => setVal(i, v)}\n    onDelete={() => remove(i)}\n    accentColor="var(--color-protocol-rest)"\n    draggable\n  />\n))}`}>
        <div style={{ width: '100%' }}>
          <KvColumnHeader />
          {rows.map((row, i) => (
            <div key={row.id} style={{ padding: '4px' }}>
              <KeyValueItemView
                enabled={row.enabled}
                onToggleEnabled={() => toggleRow(i)}
                keyValue={row.key}
                onKeyChange={k => setRowKey(i, k)}
                value={row.value}
                onValueChange={v => setRowVal(i, v)}
                onDelete={() => removeRow(i)}
                masked={row.key.toLowerCase() === 'authorization'}
                accentColor="var(--color-protocol-rest)"
                draggable
              />
            </div>
          ))}
          <div style={{ paddingLeft: '36px', paddingTop: '6px' }}>
            <ButtonView variant="ghost" size="sm" iconLeft={<PlusIcon size={10} />} onClick={() => addRow()}>
              Add row
            </ButtonView>
          </div>
        </div>
      </Row>

      {/* Pattern 2: Insert-between hover divider (hover between rows to see + Row) */}
      <Row label="Insert-between hover pattern — hover between rows to see ＋ Row" gap={0} code={`{rows.map((row, i) => (\n  <div key={row.id}>\n    <KeyValueItemView {...rowProps} />\n    <KvInsertDivider onClick={() => addRow(i)} />\n  </div>\n))}`}>
        <div style={{ width: '100%' }}>
          <KvColumnHeader />
          {rows.map((row, i) => (
            <div key={row.id}>
              <div style={{ padding: '4px' }}>
                <KeyValueItemView
                  enabled={row.enabled}
                  onToggleEnabled={() => toggleRow(i)}
                  keyValue={row.key}
                  onKeyChange={k => setRowKey(i, k)}
                  value={row.value}
                  onValueChange={v => setRowVal(i, v)}
                  onDelete={() => removeRow(i)}
                  masked={row.key.toLowerCase() === 'authorization'}
                  accentColor="var(--color-protocol-rest)"
                  draggable
                />
              </div>
              <KvInsertDivider onClick={() => addRow(i)} />
            </div>
          ))}
        </div>
      </Row>

      {/* Pattern 3: with description column */}
      <Row label="With description column" code={`<KeyValueItemView\n  enabled\n  keyValue="X-Custom-Header"\n  value="my-value"\n  description="Required for auth flow"\n  onDescriptionChange={setDesc}\n  accentColor="var(--color-protocol-graphql)"\n/>`}>
        <KeyValueItemView
          enabled
          keyValue="X-Custom-Header"
          onKeyChange={() => {}}
          value="my-value"
          onValueChange={() => {}}
          description="Required for auth flow"
          onDescriptionChange={() => {}}
          accentColor="var(--color-protocol-graphql)"
        />
      </Row>

      {/* Pattern 4: masked value */}
      <Row label="Masked value — click 👁 to reveal" code={`<KeyValueItemView\n  enabled\n  keyValue="Authorization"\n  value="Bearer supersecrettoken_xyz123"\n  masked\n  accentColor="var(--color-protocol-rest)"\n/>`}>
        <KeyValueItemView
          enabled
          keyValue="Authorization"
          onKeyChange={() => {}}
          value="Bearer supersecrettoken_xyz123"
          onValueChange={() => {}}
          masked
          accentColor="var(--color-protocol-rest)"
        />
      </Row>

      {/* HiddenKeyValueItemView — system/auto-computed rows */}
      <Row label="HiddenKeyValueItemView — system-managed rows (lock icon · dashed border · read-only)" align="flex-start" code={`// "hidden" = Postman's terminology for auto-generated headers\n// Dashed border + lock icon = read-only, system-managed\n<HiddenKeyValueItemView\n  keyValue="Authorization"\n  value="Bearer eyJhbGciOiJIUzI1Ni..."\n  badge="auth"\n  badgeColor="var(--color-primary)"\n  masked  // shows dots + eye toggle\n  onDelete={() => clearAuth()}\n  deleteTitle="Clear auth"\n/>`}>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Column headers — match KeyValueTable style */}
          <div style={{
            display: 'grid', gridTemplateColumns: '32px 1fr 1fr 32px', gap: 8,
            padding: '0 0 6px 0', marginBottom: 2,
            borderBottom: '1px solid color-mix(in srgb, var(--color-text-primary) 8%, transparent)',
          }}>
            <div />
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', paddingLeft: 10 }}>Key</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', paddingLeft: 10 }}>Value</div>
            <div />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 4 }}>
            <HiddenKeyValueItemView
              keyValue="Authorization"
              value="Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NSJ9"
              badge="auth"
              badgeColor="var(--color-primary)"
              masked
              onDelete={() => {}}
              deleteTitle="Clear auth (sets auth type to None)"
            />
            <HiddenKeyValueItemView
              keyValue="Cookie"
              value="session_id=abc123xyz; csrf_token=def456"
              badge="cookie"
              badgeColor="var(--color-warning)"
              masked
            />
            <HiddenKeyValueItemView
              keyValue="Content-Type"
              value="application/json"
            />
          </div>
        </div>
      </Row>

      <Row label="HiddenKeyValueItemView — inline in Daakia Headers tab (matches ComputedHeaderList pattern)" align="flex-start" code={`// In Daakia's Headers tab, system headers appear above user-defined rows.\n// Section header shows "Headers  2 hidden" badge — Postman-style terminology.\n// Below that: HiddenKeyValueItemView rows, then separator, then KeyValueItemView rows.\n<ComputedHeaderList rows={computedRows} />\n{userRows.map(row => <KeyValueItemView key={row.id} {...row} />)}`}>
        <div style={{
          width: '100%', background: 'var(--color-panel)',
          border: '1px solid var(--color-surface-border)', borderRadius: 8, overflow: 'hidden',
        }}>
          {/* Simulated section header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
            borderBottom: '1px solid color-mix(in srgb, var(--color-text-primary) 8%, transparent)',
          }}>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 500 }}>Headers</span>
            <span style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 10, padding: '1px 7px', borderRadius: 99,
              background: 'color-mix(in srgb, var(--color-text-muted) 10%, transparent)',
              color: 'var(--color-text-muted)',
            }}>
              <span style={{ opacity: 0.6 }}>2</span>
              <span style={{ opacity: 0.45 }}>hidden</span>
            </span>
          </div>
          {/* Hidden rows */}
          <div style={{ padding: '6px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <HiddenKeyValueItemView
              keyValue="Authorization"
              value="Bearer eyJhbGciOiJIUzI1NiJ9..."
              badge="auth"
              badgeColor="var(--color-primary)"
              masked
              onDelete={() => {}}
              deleteTitle="Clear auth"
            />
            <HiddenKeyValueItemView
              keyValue="Content-Type"
              value="application/json"
            />
          </div>
          {/* Separator */}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '0 12px' }} />
          {/* User header rows below */}
          <div style={{ padding: '6px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <KeyValueItemView enabled keyValue="X-Api-Key" onKeyChange={() => {}} value="{{api_key}}" onValueChange={() => {}} accentColor="var(--color-protocol-rest)" />
          </div>
        </div>
      </Row>
    </div>
  );
}

function EditorPanel() {
  const [json, setJson] = useState(SAMPLE_JSON);
  return (
    <div>
      <Row label="JSON editor (editable)" noPad code={`<EditorView\n  value={body}\n  onChange={setBody}\n  language="json"\n  height="200px"\n/>`}>
        <EditorView value={json} onChange={setJson} language="json" height="200px" />
      </Row>
      <Row label="GraphQL (placeholder shown when empty)" noPad code={`<EditorView\n  value=""\n  language="graphql"\n  height="120px"\n  placeholder="query { ... }"\n/>`}>
        <EditorView value="" language="graphql" height="120px" placeholder="query { ... }" />
      </Row>
      <Row label="readOnly=true" noPad code={`<EditorView\n  value='{ "status": "read-only" }'\n  language="json"\n  height="80px"\n  readOnly\n/>`}>
        <EditorView value='{ "status": "read-only" }' language="json" height="80px" readOnly />
      </Row>
    </div>
  );
}

function PatternsPanel() {
  const [method, setMethod] = useState('GET');
  const [pillTab, setPillTab] = useState('params');

  return (
    <div>
      <Row label="REST URL bar assembly" code={`<SelectInputView options={HTTP_METHODS} value={method} onChange={setMethod} style={{ width: 90 }} />\n<TextInputView placeholder="https://api.example.com/users" style={{ flex: 1 }} />\n<IconButtonView icon={<SparkleIcon size={13} />} accentColor="var(--color-protocol-ai)" />\n<DropDownButtonView label="Save" items={items} />\n<ButtonView variant="primary" accentColor="var(--color-protocol-rest)">Send</ButtonView>`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
          <SelectInputView options={METHOD_OPTIONS} value={method} onChange={setMethod} style={{ width: 90 }} accentColor="var(--color-protocol-rest)" />
          <TextInputView placeholder="https://api.example.com/users" style={{ flex: 1 }} accentColor="var(--color-protocol-rest)" />
          <IconButtonView icon={<SparkleIcon size={13} />} accentColor="var(--color-protocol-ai)" tooltip="AI Assist" />
          <DropDownButtonView label="Save" items={DROPDOWN_ITEMS} />
          <ButtonView variant="primary" accentColor="var(--color-protocol-rest)" iconLeft={<PlayIcon size={11} />}>Send</ButtonView>
        </div>
      </Row>

      <Row label="Request config tab bar + toolbar (underline tabs + icon buttons at same height)" noPad code={`<div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid ...' }}>\n  <TabView variant="underline" size="sm" accentColor="..." className="flex-1" />\n  <IconButtonView icon={<FilterIcon size={12} />} size="sm" />\n  <IconButtonView icon={<RefreshIcon size={12} />} size="sm" />\n</div>`}>
        <div style={{ width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '8px', borderBottom: '1px solid var(--color-surface-border)' }}>
            <TabView tabs={PILL_TABS} active={pillTab} onChange={setPillTab} variant="underline" size="sm" accentColor="var(--color-protocol-rest)" className="flex-1" />
            <div style={{ display: 'flex', gap: '2px', paddingRight: '6px' }}>
              <IconButtonView icon={<FilterIcon size={12} />} size="sm" tooltip="Filter" />
              <IconButtonView icon={<RefreshIcon size={12} />} size="sm" tooltip="Clear" />
              <IconButtonView icon={<MoreHorizontalIcon size={12} />} size="sm" tooltip="More" />
            </div>
          </div>
          <div style={{ padding: '12px 16px', fontSize: '11px', color: 'var(--color-text-muted)' }}>
            Active tab: <strong style={{ color: 'var(--color-text-primary)' }}>{pillTab}</strong>
          </div>
        </div>
      </Row>

      <Row label="Protocol chip + method badge in collection tree row" noPad code={`<div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px' }}>\n  <ChipView label="GET" color="var(--color-method-get)" size="xs" />\n  <span style={{ flex: 1 }}>/api/users</span>\n  <IconButtonView icon={<MoreHorizontalIcon size={12} />} size="sm" />\n</div>`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', padding: '4px', width: '100%' }}>
          {[
            { method: 'GET',    color: 'var(--color-method-get)',    path: '/api/users' },
            { method: 'POST',   color: 'var(--color-method-post)',   path: '/api/users' },
            { method: 'PUT',    color: 'var(--color-method-put)',    path: '/api/users/{id}' },
            { method: 'DELETE', color: 'var(--color-method-delete)', path: '/api/users/{id}' },
          ].map(r => (
            <div key={r.path + r.method} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px', borderRadius: '4px', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              <ChipView label={r.method} color={r.color} size="xs" />
              <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', flex: 1 }}>{r.path}</span>
              <IconButtonView icon={<MoreHorizontalIcon size={12} />} size="sm" tooltip="Actions" />
            </div>
          ))}
        </div>
      </Row>

      <Row label="Protocol sidebar nav (chip + label)" gap={4} code={`{PROTOCOLS.map(p => (\n  <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--color-panel)', border: '...', borderRadius: 5, padding: '4px 10px' }}>\n    <ChipView label={p.badge} color={p.color} size="xs" />\n    <span>{p.label}</span>\n  </div>\n))}`}>
        {PROTOCOLS.map(p => (
          <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--color-panel)', border: '1px solid var(--color-surface-border)', borderRadius: '5px', padding: '4px 10px', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-panel)'}
          >
            <ChipView label={p.badge} color={p.color} size="xs" />
            <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{p.label}</span>
          </div>
        ))}
      </Row>

      <Row label="Toolbar button group (icon + text mix)" gap={4} code={`<ButtonView variant="primary" iconLeft={<PlayIcon size={11} />}>Run</ButtonView>\n<ButtonView variant="secondary" iconLeft={<RefreshIcon size={11} />}>Reset</ButtonView>\n<IconButtonView icon={<DownloadIcon size={13} />} />\n<DropDownButtonView label="Save" items={items} />`}>
        <ButtonView variant="primary" iconLeft={<PlayIcon size={11} />} accentColor="var(--color-success)">Run</ButtonView>
        <ButtonView variant="secondary" iconLeft={<RefreshIcon size={11} />}>Reset</ButtonView>
        <div style={{ width: '1px', height: '20px', background: 'var(--color-surface-border)', margin: '0 4px' }} />
        <IconButtonView icon={<DownloadIcon size={13} />} tooltip="Import" />
        <IconButtonView icon={<ExportIcon size={13} />} tooltip="Export" />
        <IconButtonView icon={<CopyIcon size={13} />} tooltip="Copy" />
        <div style={{ width: '1px', height: '20px', background: 'var(--color-surface-border)', margin: '0 4px' }} />
        <DropDownButtonView label="Save" items={DROPDOWN_ITEMS} />
      </Row>
    </div>
  );
}

function TabBarPanel() {
  const REST_TABS: TabBarTab[] = [
    { id: 't1', label: 'GET /api/users',        type: 'request', protocol: 'rest', method: 'GET' },
    { id: 't2', label: 'POST /api/auth/login',  type: 'request', protocol: 'rest', method: 'POST', dirty: true },
    { id: 't3', label: 'getUsers',              type: 'request', protocol: 'graphql' },
    { id: 't4', label: 'Echo server',           type: 'request', protocol: 'websocket', rtProtocol: 'websocket' },
    { id: 't5', label: 'MQTT broker',           type: 'request', protocol: 'websocket', rtProtocol: 'mqtt' },
    { id: 't6', label: 'UserService.GetUser',   type: 'request', protocol: 'grpc' },
    { id: 't7', label: 'Invoice.wsdl',          type: 'request', protocol: 'soap' },
    { id: 't8', label: 'Settings',    type: 'settings' },
    { id: 't9', label: 'Mock Server', type: 'mock-server' },
  ] as TabBarTab[];

  const [activeTab, setActiveTab] = useState('t1');
  const [tabs, setTabs] = useState(REST_TABS);
  let nextId = useRef(10);

  return (
    <div>
      <Row label="Full tab bar — protocol badges · dirty dot · close on hover · add tab" noPad code={`// Each tab has a 'protocol' field — that's what drives the colored prefix badge\nconst tabs = [\n  { id: '1', label: 'GET /users',       type: 'request', protocol: 'rest',      method: 'GET'  },\n  { id: '2', label: 'POST /auth/login', type: 'request', protocol: 'rest',      method: 'POST', dirty: true },\n  { id: '3', label: 'getUsers',         type: 'request', protocol: 'graphql'                    },  // → shows "GQL"\n  { id: '4', label: 'Echo server',      type: 'request', protocol: 'websocket', rtProtocol: 'websocket' },\n  { id: '5', label: 'MQTT broker',      type: 'request', protocol: 'websocket', rtProtocol: 'mqtt' },\n  { id: '6', label: 'UserService.Get',  type: 'request', protocol: 'grpc'                       },  // → shows "gRPC"\n  { id: '7', label: 'Invoice.wsdl',     type: 'request', protocol: 'soap'                       },  // → shows "SOAP"\n  { id: '8', label: 'Settings',  type: 'settings'    },\n  { id: '9', label: 'Mock Server', type: 'mock-server' },\n];\n\n<TabBarView\n  tabs={tabs}\n  activeTabId={activeId}\n  onTabClick={setActiveId}\n  onTabClose={closeTab}\n  onAddTab={addTab}\n  accentColor="var(--color-protocol-rest)"\n/>`}>
        <div style={{ width: '100%' }}>
          <TabBarView
            tabs={tabs}
            activeTabId={activeTab}
            onTabClick={setActiveTab}
            onTabClose={id => {
              const next = tabs.filter(t => t.id !== id);
              setTabs(next);
              if (activeTab === id && next.length > 0) setActiveTab(next[0].id);
            }}
            onAddTab={() => {
              const id = `new-${nextId.current++}`;
              setTabs(t => [...t, { id, label: `Untitled ${nextId.current - 1}`, type: 'request', protocol: 'rest', method: 'GET', dirty: true }]);
              setActiveTab(id);
            }}
            accentColor="var(--color-protocol-rest)"
          />
          <div style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--color-text-muted)' }}>
            Active: <strong style={{ color: 'var(--color-text-primary)' }}>{tabs.find(t => t.id === activeTab)?.label}</strong>
            <span style={{ marginLeft: '10px', opacity: 0.6 }}>({tabs.length} tabs)</span>
          </div>
        </div>
      </Row>

      <Row label="Protocol-colored accents — 'protocol' field controls badge label and color" align="flex-start" code={`// protocol field → badge label + color:\n//   'graphql'   → "GQL"  in var(--color-protocol-graphql)\n//   'grpc'      → "gRPC" in var(--color-protocol-grpc)\n//   'soap'      → "SOAP" in var(--color-protocol-soap)\n//   'ai'        → "AI"   in var(--color-protocol-ai)\n//   'mcp'       → "MCP"  in var(--color-protocol-mcp)\n//   'websocket' → "WS" or rtProtocol badge (SSE, SIO, MQTT)\n\nconst gqlTabs  = [{ id: 'g1', label: 'getUsers query', type: 'request', protocol: 'graphql' }];\nconst sseTabs  = [{ id: 'w1', label: 'SSE /events',    type: 'request', protocol: 'websocket', rtProtocol: 'sse' }];\nconst grpcTabs = [{ id: 'r1', label: 'Realtime.Chat',  type: 'request', protocol: 'grpc' }];\n\n// accentColor drives the active-tab top-border and the + button color\n<TabBarView tabs={gqlTabs}  activeTabId="g1" accentColor="var(--color-protocol-graphql)" height={32} />\n<TabBarView tabs={sseTabs}  activeTabId="w1" accentColor="var(--color-protocol-sse)"     height={32} />\n<TabBarView tabs={grpcTabs} activeTabId="r1" accentColor="var(--color-protocol-grpc)"    height={32} />`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
          {([
            { tabs: [{ id: 'g1', label: 'getUsers query',   type: 'request', protocol: 'graphql' }], accent: 'var(--color-protocol-graphql)' },
            { tabs: [{ id: 'w1', label: 'SSE /events',      type: 'request', protocol: 'websocket', rtProtocol: 'sse' }], accent: 'var(--color-protocol-sse)' },
            { tabs: [{ id: 'r1', label: 'Realtime.Chat',    type: 'request', protocol: 'grpc' }], accent: 'var(--color-protocol-grpc)' },
          ] as { tabs: TabBarTab[]; accent: string }[]).map(({ tabs: t, accent }) => (
            <TabBarView key={t[0].id} tabs={t} activeTabId={t[0].id} onTabClick={() => {}} accentColor={accent} height={32} />
          ))}
        </div>
      </Row>

      <Row label="Features" code={`<TabBarView\n  tabs={tabs}           // TabBarTab[] — plain props, no store\n  activeTabId={id}\n  onTabClick={select}\n  onTabClose={close}    // shows × on hover\n  onAddTab={add}        // + button at right edge\n  accentColor="var(--color-protocol-rest)"\n/>`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
          {[
            '✓ Active tab — 2px colored top border + subtle tinted background',
            '✓ Protocol badge — method color (GET/POST/…), GQL, WS, SSE, SIO, MQTT, gRPC, SOAP, AI, MCP',
            '✓ Dirty dot — amber dot when tab has unsaved changes',
            '✓ Pinned tab — 📌 icon replaces close button',
            '✓ Close on hover — × appears on tab hover; always visible for Settings/Mock Server',
            '✓ Add tab (+) — rightmost button with accent color',
            '✓ Scroll arrows — appear when tabs overflow horizontally',
            '✓ Decoupled from store — TabBarView takes plain props; no Zustand dependency',
          ].map(f => <div key={f}>{f}</div>)}
        </div>
      </Row>
    </div>
  );
}

function StageViewPanel() {
  return (
    <div>
      <Row label="StageCheck — completed step" align="flex-start" code={`<StageCheck label="Request validated" sublabel="Headers, body, auth all passed" color="var(--color-success)" size={20} />\n<StageCheck label="Token refreshed" color="var(--color-success)" size={20} />\n<StageCheck label="Connection established" color="var(--color-info)" size={20} />`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
          <StageCheck label="Request validated" sublabel="Headers, body, auth all passed" color="var(--color-success)" size={20} />
          <StageCheck label="Token refreshed" color="var(--color-success)" size={20} />
          <StageCheck label="Connection established" color="var(--color-info)" size={20} />
        </div>
      </Row>
      <Row label="StageSpin — in-progress step" align="flex-start" code={`<StageSpin label="Sending request…" sublabel="Awaiting server response" color="var(--color-primary)" size={20} />\n<StageSpin label="Refreshing schema" color="var(--color-protocol-graphql)" size={20} />\n<StageSpin label="Connecting to broker" color="var(--color-protocol-mqtt)" size={20} />`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
          <StageSpin label="Sending request…" sublabel="Awaiting server response" color="var(--color-primary)" size={20} />
          <StageSpin label="Refreshing schema" color="var(--color-protocol-graphql)" size={20} />
          <StageSpin label="Connecting to broker" color="var(--color-protocol-mqtt)" size={20} />
        </div>
      </Row>
      <Row label="StagePulse — pending / waiting step" align="flex-start" code={`<StagePulse label="Awaiting queue" sublabel="Will start after previous step completes" size={20} />\n<StagePulse label="Rate limit window" color="var(--color-warning)" size={20} />\n<StagePulse label="Idle" size={20} />`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
          <StagePulse label="Awaiting queue" sublabel="Will start after previous step completes" size={20} />
          <StagePulse label="Rate limit window" color="var(--color-warning)" size={20} />
          <StagePulse label="Idle" size={20} />
        </div>
      </Row>
      <Row label="Multi-step pipeline example" align="flex-start" code={`<StageCheck label="Auth pre-flight check" color="var(--color-success)" size={18} />\n<StageCheck label="Request serialized"   color="var(--color-success)" size={18} />\n<StageSpin  label="HTTP round-trip"       sublabel="250ms elapsed" color="var(--color-primary)" size={18} />\n<StagePulse label="Response validation"  size={18} />\n<StagePulse label="Store & notify"       size={18} />`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
          <StageCheck label="Auth pre-flight check" color="var(--color-success)" size={18} />
          <StageCheck label="Request serialized" color="var(--color-success)" size={18} />
          <StageSpin label="HTTP round-trip" sublabel="250ms elapsed" color="var(--color-primary)" size={18} />
          <StagePulse label="Response validation" size={18} />
          <StagePulse label="Store & notify" size={18} />
        </div>
      </Row>
      <Row label="Sizes" gap={20} code={`<StageCheck color="var(--color-success)" size={14} />\n<StageCheck color="var(--color-success)" size={20} />\n<StageSpin  color="var(--color-primary)" size={14} />\n<StageSpin  color="var(--color-primary)" size={20} />\n<StagePulse size={14} />\n<StagePulse size={20} />`}>
        <StageCheck color="var(--color-success)" size={14} />
        <StageCheck color="var(--color-success)" size={18} />
        <StageCheck color="var(--color-success)" size={20} />
        <StageCheck color="var(--color-success)" size={24} />
        <StageSpin color="var(--color-primary)" size={14} />
        <StageSpin color="var(--color-primary)" size={18} />
        <StageSpin color="var(--color-primary)" size={20} />
        <StageSpin color="var(--color-primary)" size={24} />
        <StagePulse size={14} />
        <StagePulse size={18} />
        <StagePulse size={20} />
        <StagePulse size={24} />
      </Row>
    </div>
  );
}

// ─── DuiProvider showcase ─────────────────────────────────────────────────────

const SIZES_DEMO = ['sm', 'md', 'lg', 'xl'] as const;
const PILL_TABS_DEMO = [
  { id: 'body',    label: 'Body' },
  { id: 'headers', label: 'Headers', badge: 3 },
  { id: 'auth',    label: 'Auth' },
];

function DuiSizeBlock({ size }: { size: 'sm' | 'md' | 'lg' | 'xl' }) {
  const [toggled, setToggled] = useState(false);
  const [activeTab, setActiveTab] = useState('body');
  const [inputVal, setInputVal] = useState('');
  const accent = 'var(--color-primary)';
  return (
    <DuiProvider size={size}>
      <div style={{
        padding: '14px 16px', borderRadius: 8, border: '1px solid var(--color-surface-border)',
        background: 'var(--color-panel)', display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: accent, marginBottom: 2 }}>
          size="{size}"
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <ButtonView variant="primary" label="Send" accentColor={accent} />
          <ButtonView variant="secondary" label="Cancel" />
          <ButtonView variant="ghost" label="Reset" />
        </div>
        <TextInputView placeholder="Endpoint URL…" value={inputVal} onChange={e => setInputVal(e.target.value)} style={{ width: '100%' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <ToggleSwitchView checked={toggled} onChange={setToggled} label="Enable" />
          <PillTabsView tabs={PILL_TABS_DEMO} activeTab={activeTab} onChange={setActiveTab} accentColor={accent} />
        </div>
      </div>
    </DuiProvider>
  );
}

function DuiProviderPanel() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Row label="All four sizes — one provider wraps all components" code={`<DuiProvider size="sm">\n  <ButtonView label="Send" />\n  <TextInputView placeholder="URL…" />\n  <ToggleSwitchView checked label="Enable" />\n  <PillTabsView tabs={tabs} activeTab={tab} onChange={setTab} />\n</DuiProvider>`}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {SIZES_DEMO.map(s => <DuiSizeBlock key={s} size={s} />)}
        </div>
      </Row>
    </div>
  );
}

// ─── LiveColorCustomizer var presets ─────────────────────────────────────────

const VARS_ACCENT   = [{ cssVar: '--color-primary',              yamlKey: 'brand.primary',                          label: 'Accent' }];
const VARS_INPUT    = [{ cssVar: '--color-input-bg',             yamlKey: 'component_input.bg',                     label: 'Input bg' },
                       { cssVar: '--color-input-border',         yamlKey: 'component_input.border',                 label: 'Border' },
                       { cssVar: '--color-primary',              yamlKey: 'brand.primary',                          label: 'Accent' }];
const VARS_BTN      = [{ cssVar: '--color-btn-primary-bg',       yamlKey: 'component_button.primary_bg',            label: 'Primary bg' },
                       { cssVar: '--color-btn-primary-hover',    yamlKey: 'component_button.primary_hover',         label: 'Primary hover' },
                       { cssVar: '--color-btn-secondary-bg',     yamlKey: 'component_button.secondary_bg',          label: 'Secondary bg' },
                       { cssVar: '--color-btn-secondary-border', yamlKey: 'component_button.secondary_border',      label: 'Secondary border' },
                       { cssVar: '--color-btn-danger-bg',        yamlKey: 'component_button.danger_bg',             label: 'Danger bg' }];
const VARS_ICONBTN  = [{ cssVar: '--color-iconbtn-bg-hover',     yamlKey: 'component_icon_button.bg_hover',         label: 'Hover bg' },
                       { cssVar: '--color-iconbtn-bg-active',    yamlKey: 'component_icon_button.bg_active',        label: 'Active bg' },
                       { cssVar: '--color-iconbtn-border',       yamlKey: 'component_icon_button.border',           label: 'Border' }];
const VARS_CHIP     = [{ cssVar: '--color-primary',              yamlKey: 'brand.primary',                          label: 'Accent' },
                       { cssVar: '--color-chip-active-text',     yamlKey: 'component_chip.active_text',             label: 'Active text' }];
const VARS_TOGGLE   = [{ cssVar: '--color-toggle-on',            yamlKey: 'component_toggle.on',                    label: 'Track on' },
                       { cssVar: '--color-toggle-thumb',         yamlKey: 'component_toggle.thumb',                 label: 'Thumb' }];
const VARS_TAG      = [{ cssVar: '--color-tag-bg',               yamlKey: 'component_tag_input.bg',                 label: 'Tag bg' },
                       { cssVar: '--color-tag-text',             yamlKey: 'component_tag_input.text',               label: 'Tag text' },
                       { cssVar: '--color-tag-border',           yamlKey: 'component_tag_input.border',             label: 'Border' },
                       { cssVar: '--color-tag-remove-hover',     yamlKey: 'component_tag_input.remove_hover',       label: 'Remove hover' }];
const VARS_PILLTAB  = [{ cssVar: '--color-pilltab-track-bg',     yamlKey: 'component_pill_tabs.track_bg',           label: 'Track bg' },
                       { cssVar: '--color-pilltab-indicator-bg', yamlKey: 'component_pill_tabs.indicator_bg',       label: 'Indicator bg' },
                       { cssVar: '--color-pilltab-text-active',  yamlKey: 'component_pill_tabs.text_active',        label: 'Active text' }];
const VARS_DUR      = [{ cssVar: '--color-dur-segment-bg',       yamlKey: 'component_duration.segment_bg',          label: 'Segment bg' },
                       { cssVar: '--color-dur-segment-hover',    yamlKey: 'component_duration.segment_hover',       label: 'Hover' },
                       { cssVar: '--color-dur-segment-selected', yamlKey: 'component_duration.segment_selected',    label: 'Selected' }];
const VARS_TABLE    = [{ cssVar: '--color-table-stripe',         yamlKey: 'component_table.stripe',                 label: 'Row stripe' },
                       { cssVar: '--color-table-header-bg',      yamlKey: 'component_table.header_bg',              label: 'Header bg' },
                       { cssVar: '--color-table-border',         yamlKey: 'component_table.border',                 label: 'Border' }];
const VARS_CODE     = [{ cssVar: '--color-codeblock-bg',         yamlKey: 'component_code_block.bg',                label: 'Block bg' },
                       { cssVar: '--color-codeblock-border',     yamlKey: 'component_code_block.border',            label: 'Border' }];
const VARS_SIDENAV  = [{ cssVar: '--color-sidenav-active-bg',    yamlKey: 'component_sidenav.active_bg',            label: 'Active bg' },
                       { cssVar: '--color-sidenav-active-text',  yamlKey: 'component_sidenav.active_text',          label: 'Active text' },
                       { cssVar: '--color-sidenav-hover-bg',     yamlKey: 'component_sidenav.hover_bg',             label: 'Hover bg' }];
const VARS_RESIZE   = [{ cssVar: '--color-resizable-grip',       yamlKey: 'component_resizable.grip',               label: 'Grip' },
                       { cssVar: '--color-resizable-grip-hover', yamlKey: 'component_resizable.grip_hover',         label: 'Grip hover' }];
const VARS_STAGE    = [{ cssVar: '--color-stage-check',          yamlKey: 'component_stage.check',                  label: 'Check' },
                       { cssVar: '--color-stage-spin',           yamlKey: 'component_stage.spin',                   label: 'Spin' },
                       { cssVar: '--color-stage-pulse',          yamlKey: 'component_stage.pulse',                  label: 'Pulse' }];
const VARS_LOADER   = [{ cssVar: '--color-loader-accent',        yamlKey: 'component_loader.accent',                label: 'Accent' },
                       { cssVar: '--color-loader-track',         yamlKey: 'component_loader.track',                 label: 'Track' }];
const VARS_MODAL    = [{ cssVar: '--color-modal-backdrop',       yamlKey: 'component_modal.backdrop',               label: 'Backdrop' },
                       { cssVar: '--color-modal-header-tint',    yamlKey: 'component_modal.header_tint',            label: 'Header tint' }];
const VARS_AIBTN    = [{ cssVar: '--color-aibtn-bg',             yamlKey: 'component_ai_button.bg',                 label: 'AI btn bg' },
                       { cssVar: '--color-aibtn-border',         yamlKey: 'component_ai_button.border',             label: 'Border' },
                       { cssVar: '--color-aibtn-text',           yamlKey: 'component_ai_button.text',               label: 'Text' }];
const VARS_STATSCARD= [{ cssVar: '--color-statscard-bg',         yamlKey: 'component_stats_card.bg',                label: 'Card bg' },
                       { cssVar: '--color-statscard-border',     yamlKey: 'component_stats_card.border',            label: 'Border' },
                       { cssVar: '--color-statscard-trend-up',   yamlKey: 'component_stats_card.trend_up',          label: 'Trend up' },
                       { cssVar: '--color-statscard-trend-down', yamlKey: 'component_stats_card.trend_down',        label: 'Trend down' }];
const VARS_EMPTY    = [{ cssVar: '--color-emptystate-icon',      yamlKey: 'component_empty_state.icon',             label: 'Icon' },
                       { cssVar: '--color-emptystate-title',     yamlKey: 'component_empty_state.title',            label: 'Title' },
                       { cssVar: '--color-emptystate-desc',      yamlKey: 'component_empty_state.desc',             label: 'Desc' }];
const VARS_STATUS   = [{ cssVar: '--color-success',              yamlKey: 'semantic.success',                       label: 'Success' },
                       { cssVar: '--color-error',                yamlKey: 'semantic.error',                         label: 'Error' },
                       { cssVar: '--color-warning',              yamlKey: 'semantic.warning',                       label: 'Warning' },
                       { cssVar: '--color-info',                 yamlKey: 'semantic.info',                          label: 'Info' }];

// ─── Panel map ────────────────────────────────────────────────────────────────

const PANELS: Record<CategoryId, { title: string; desc: string; content: React.ReactNode; vars?: LiveColorVar[]; code?: string; noExamplesHeader?: boolean }> = {
  chips:             { title: 'ChipView',              desc: 'Colored badge chips for methods, protocols, status codes, filter tags.',            vars: VARS_CHIP,       content: <ChipsPanel />,             code: `<ChipView label="GET"  color="var(--color-success)" />\n<ChipView label="POST" color="var(--color-primary)" />\n<ChipView label="404"  color="var(--color-error)"   size="sm" />\n<ChipView label="beta" color="var(--color-warning)"  size="xs" />` },
  textinput:         { title: 'TextInputView',          desc: 'Standard text input — sizes match ButtonView and SelectInputView exactly.',         vars: VARS_INPUT,      content: <TextInputPanel />,         code: `function Preview() {\n  const [val, setVal] = useState('');\n  return (\n    <TextInputView\n      placeholder="Enter URL…"\n      value={val}\n      onChange={e => setVal(e.target.value)}\n      size="md"\n      iconLeft={<GlobeIcon size={13} />}\n      style={{ width: 260 }}\n    />\n  );\n}` },
  selecttextinput:   { title: 'SelectTextInputView',    desc: 'Combined method selector + URL input in one bordered pill — Postman URL bar pattern.',  vars: VARS_INPUT,  content: <SelectTextInputPanel />,   code: `function Preview() {\n  const [method, setMethod] = useState('GET');\n  const [url, setUrl] = useState('https://api.example.com/users');\n  const opts = [\n    { value: 'GET',    label: 'GET',    color: 'var(--color-method-get)' },\n    { value: 'POST',   label: 'POST',   color: 'var(--color-method-post)' },\n    { value: 'PUT',    label: 'PUT',    color: 'var(--color-method-put)' },\n    { value: 'DELETE', label: 'DELETE', color: 'var(--color-method-delete)' },\n  ];\n  return (\n    <SelectTextInputView\n      selectValue={method}\n      selectOptions={opts}\n      onSelectChange={setMethod}\n      inputValue={url}\n      onInputChange={setUrl}\n      placeholder="Enter URL or paste text"\n    />\n  );\n}` },
  selectinput:       { title: 'SelectInputView',        desc: 'Portal dropdown with keyboard nav — replaces all StyledDropdown usages.',           vars: VARS_INPUT,      content: <SelectInputPanel />,       code: `function Preview() {\n  const [method, setMethod] = useState('GET');\n  const options = [\n    { value: 'GET',    label: 'GET',    color: 'var(--color-method-get)' },\n    { value: 'POST',   label: 'POST',   color: 'var(--color-method-post)' },\n    { value: 'PUT',    label: 'PUT',    color: 'var(--color-method-put)' },\n    { value: 'DELETE', label: 'DELETE', color: 'var(--color-method-delete)' },\n  ];\n  return (\n    <SelectInputView\n      value={method}\n      options={options}\n      onChange={setMethod}\n      size="md"\n      style={{ width: 130 }}\n    />\n  );\n}` },
  button:            { title: 'ButtonView',             desc: 'Standard button — primary / secondary / ghost / danger — all sizes.',              vars: VARS_BTN,        content: <ButtonPanel />,            code: `<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>\n  <ButtonView label="Send Request" variant="primary" size="md" onClick={send} />\n  <ButtonView label="Cancel"       variant="ghost"   size="md" onClick={cancel} />\n  <ButtonView label="Delete"       variant="danger"  size="sm" onClick={del} />\n</div>` },
  iconbutton:        { title: 'IconButtonView',         desc: 'Square icon-only buttons — ghost / filled — toggle support — all sizes.',          vars: VARS_ICONBTN,    content: <IconButtonPanel />,        code: `<IconButtonView\n  icon={<CopyIcon size={14} />}\n  variant="ghost"\n  size="sm"\n  title="Copy"\n  onClick={handleCopy}\n/>` },
  dropdownbutton:    { title: 'DropDownButtonView',     desc: 'Split button — primary action + chevron dropdown — Save as, Export as, etc.',      vars: VARS_BTN,        content: <DropDownButtonPanel />,    code: `<DropDownButtonView\n  label="Save"\n  onClick={save}\n  items={[\n    { label: 'Save as JSON', onClick: saveJson },\n    { label: 'Save as YAML', onClick: saveYaml },\n  ]}\n/>` },
  contextmenu:       { title: 'ContextMenuView',        desc: 'Recursive context menu with submenus — portal rendered — collection tree style.',   vars: VARS_ACCENT,     content: <ContextMenuPanel />,       code: `function Preview() {\n  const [anchor, setAnchor] = useState(null);\n  const [open, setOpen] = useState(false);\n  return (\n    <div>\n      <ButtonView\n        variant="secondary"\n        onClick={e => { setAnchor(e.currentTarget); setOpen(true); }}\n      >\n        Open context menu\n      </ButtonView>\n      <ContextMenuView\n        anchorEl={anchor}\n        open={open}\n        onClose={() => setOpen(false)}\n        items={[\n          { id: 'new',    label: 'New Request', icon: <PlusIcon size={13} />,   onClick: () => setOpen(false) },\n          { id: 'rename', label: 'Rename',      icon: <RenameIcon size={13} />, onClick: () => setOpen(false) },\n          { id: 'sep', label: '', separator: true },\n          { id: 'del',    label: 'Delete',      icon: <TrashIcon size={13} />, danger: true, onClick: () => setOpen(false) },\n        ]}\n      />\n    </div>\n  );\n}` },
  tabs:              { title: 'TabView',                desc: 'pill · underline · gql (closeable+scrollable+addable) — all with accentColor.',     vars: VARS_ACCENT,     content: <TabsPanel />,              code: `function Preview() {\n  const [active, setActive] = useState('params');\n  return (\n    <TabView\n      variant="pill"\n      tabs={[\n        { id: 'params',  label: 'Params',  badge: 2 },\n        { id: 'headers', label: 'Headers', badge: 4 },\n        { id: 'body',    label: 'Body' },\n        { id: 'auth',    label: 'Auth', dot: true, dotColor: 'var(--color-success)' },\n      ]}\n      active={active}\n      onChange={setActive}\n    />\n  );\n}` },
  tabbar:            { title: 'TabBarView',             desc: 'VS Code-style protocol tab bar — store-free, drag-free, scroll arrows, dirty dot.', vars: VARS_ACCENT,     content: <TabBarPanel />,            code: `function Preview() {\n  const [tabs, setTabs] = useState([\n    { id: '1', label: 'GET /users', type: 'request', protocol: 'rest',    method: 'GET' },\n    { id: '2', label: 'getUsers',   type: 'request', protocol: 'graphql' },\n    { id: '3', label: 'Chat.Send',  type: 'request', protocol: 'grpc'    },\n  ]);\n  const [activeId, setActiveId] = useState('1');\n  return (\n    <TabBarView\n      tabs={tabs}\n      activeTabId={activeId}\n      onTabClick={setActiveId}\n      onTabClose={id => {\n        const remaining = tabs.filter(t => t.id !== id);\n        setTabs(remaining);\n        if (activeId === id) setActiveId(remaining[0]?.id ?? '');\n      }}\n      onAddTab={() => {\n        const id = String(Date.now());\n        setTabs(t => [...t, { id, label: 'New Request', type: 'request', protocol: 'rest', method: 'GET' }]);\n        setActiveId(id);\n      }}\n      accentColor="var(--color-protocol-rest)"\n    />\n  );\n}` },
  keyvalue:          { title: 'KeyValueItemView',       desc: 'Single KV row — circle toggle · masked values · drag handle · delete on hover.',   vars: VARS_INPUT,      content: <KeyValuePanel />,          code: `function Preview() {\n  const [enabled, setEnabled] = useState(true);\n  const [k, setK] = useState('Authorization');\n  const [v, setV] = useState('Bearer {{token}}');\n  return (\n    <KeyValueItemView\n      keyValue={k}\n      onKeyChange={setK}\n      value={v}\n      onValueChange={setV}\n      enabled={enabled}\n      onToggleEnabled={() => setEnabled(x => !x)}\n      onDelete={() => {}}\n    />\n  );\n}` },
  editor:            { title: 'EditorView',             desc: 'Monaco editor wrapper — simplified props — JSON / GQL / XML / YAML etc.',           vars: VARS_ACCENT,     content: <EditorPanel />,            code: `function Preview() {\n  const [body, setBody] = useState('{ "name": "Alice", "role": "admin" }');\n  return (\n    <EditorView\n      value={body}\n      onChange={setBody}\n      language="json"\n      height={300}\n      readOnly={false}\n    />\n  );\n}` },
  patterns:          { title: 'Real-world Patterns',    desc: 'How DUI components assemble into actual Daakia UI — URL bar · tabs · tree.',        content: <PatternsPanel />, noExamplesHeader: true },
  toggle:            { title: 'ToggleSwitchView',       desc: 'On/off toggle with sm/md/lg sizes, accent color, label positions, disabled state.', vars: VARS_TOGGLE,     content: <ToggleSwitchPanel />,      code: `function Preview() {\n  const [enabled, setEnabled] = useState(true);\n  return (\n    <ToggleSwitchView\n      checked={enabled}\n      onChange={setEnabled}\n      label="Enable SSL"\n      size="md"\n    />\n  );\n}` },
  checkbox:          { title: 'CheckboxView',           desc: 'Checkbox — checked / unchecked / indeterminate / disabled — with accent colors.',   vars: VARS_ACCENT,     content: <CheckboxPanel />,          code: `function Preview() {\n  const [checked, setChecked] = useState(false);\n  return (\n    <CheckboxView\n      checked={checked}\n      onChange={setChecked}\n      label="Include auth headers"\n    />\n  );\n}` },
  modal:             { title: 'ModalView',              desc: 'Configurable modal — sm/md/lg/xl — never closes on backdrop click.',                vars: VARS_MODAL,      content: <ModalPanel />,             code: `function Preview() {\n  const [isOpen, setIsOpen] = useState(false);\n  return (\n    <div>\n      <ButtonView variant="danger" size="sm" onClick={() => setIsOpen(true)}>\n        Delete Collection\n      </ButtonView>\n      <ModalView\n        open={isOpen}\n        onClose={() => setIsOpen(false)}\n        title="Confirm Delete"\n        size="sm"\n      >\n        <p style={{ margin: '0 0 16px', fontSize: 13 }}>Are you sure?</p>\n        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>\n          <ButtonView label="Cancel" variant="ghost" onClick={() => setIsOpen(false)} />\n          <ButtonView label="Delete" variant="danger" onClick={() => setIsOpen(false)} />\n        </div>\n      </ModalView>\n    </div>\n  );\n}` },
  loader:            { title: 'LoaderView',             desc: 'Loading states — spinner · dots · skeleton · pulse · progress-bar.',               vars: VARS_LOADER,     content: <LoaderPanel />,            code: `<LoaderView variant="spinner" size="md" />\n<LoaderView variant="dots"    size="sm" />\n<LoaderView variant="skeleton" width={240} height={16} />` },
  emptystate:        { title: 'EmptyStateView',         desc: 'Empty state placeholder with icon, title, message, and optional CTA button.',       vars: VARS_EMPTY,      content: <EmptyStatePanel />,        code: `<EmptyStateView\n  icon={<FolderIcon size={32} />}\n  title="No collections yet"\n  message="Create your first collection to get started."\n  action={{ label: 'New Collection', onClick: create }}\n/>` },
  statusindicator:   { title: 'StatusIndicatorView',    desc: 'Connection status dot — idle · connecting · connected · disconnected · error.',     vars: VARS_STATUS,     content: <StatusIndicatorPanel />,   code: `<StatusIndicatorView state="connected"    label="Connected" />\n<StatusIndicatorView state="connecting"  label="Connecting…" />\n<StatusIndicatorView state="error"       label="Connection failed" />` },
  infopopup:         { title: 'InfoPopupView',          desc: 'Help popup anchored near a ? icon — title · items · footer · wiki link.',          vars: VARS_ACCENT,     content: <InfoPopupPanel />,         code: `function Preview() {\n  const [anchor, setAnchor] = useState(null);\n  const [isOpen, setIsOpen] = useState(false);\n  return (\n    <div>\n      <ButtonView\n        variant="ghost"\n        size="sm"\n        onClick={e => { setAnchor(e.currentTarget); setIsOpen(true); }}\n      >\n        ? Help\n      </ButtonView>\n      <InfoPopupView\n        open={isOpen}\n        onClose={() => setIsOpen(false)}\n        anchorEl={anchor}\n        title="Bearer Token"\n        description="Sent as the Authorization header on every request."\n        items={[\n          { code: 'Authorization: Bearer <token>', description: 'Standard bearer format' },\n        ]}\n        footer="Token expires after the configured TTL."\n      />\n    </div>\n  );\n}` },
  resizablepanel:    { title: 'ResizablePanelView',     desc: 'Single-pane panel with bottom-edge drag handle to resize height — no store dependency.', vars: VARS_RESIZE, content: <ResizablePanelPanel />, code: `<ResizablePanelView\n  defaultHeight={200}\n  minHeight={80}\n  maxHeight={500}\n>\n  {/* your content */}\n</ResizablePanelView>` },
  splitpanel:        { title: 'SplitPanelView',         desc: 'Split-pane container — horizontal or vertical — drag pill, double-click to reset.',  vars: VARS_RESIZE,    content: <SplitPanelPanel />,        code: `function Preview() {\n  return (\n    <div style={{ height: 220 }}>\n      <SplitPanelView\n        direction="horizontal"\n        defaultSplit={50}\n        first={\n          <div style={{ padding: 16, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: 12 }}>\n            Request panel\n          </div>\n        }\n        second={\n          <div style={{ padding: 16, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: 12 }}>\n            Response panel\n          </div>\n        }\n      />\n    </div>\n  );\n}` },
  dottedcard:        { title: 'DottedCardView',         desc: 'Dotted-border expandable card — useful for optional config sections.',              vars: VARS_ACCENT,     content: <DottedCardPanel />,        code: `<DottedCardView\n  title="Advanced Options"\n  defaultExpanded={false}\n>\n  <TextInputView placeholder="Proxy URL" />\n  <ToggleSwitchView label="Follow redirects" />\n</DottedCardView>` },
  coloredtext:       { title: 'ColoredTextView',        desc: 'Token-colored text — HTTP status lines, gRPC codes, SOAP faults.',                  vars: VARS_STATUS,     content: <ColoredTextPanel />,       code: `<ColoredTextView\n  tokens={[\n    { text: '200', color: 'success' },\n    { text: ' OK', color: 'muted' },\n  ]}\n/>` },
  statscard:         { title: 'StatsCardView',          desc: 'Colorful metric card — value, unit, trend (up/down/neutral), subValue.',            vars: VARS_STATSCARD,  content: <StatsCardPanel />,         code: `<StatsCardView\n  label="Response Time"\n  value="142"\n  unit="ms"\n  trend="down"\n  subValue="avg: 180ms"\n  color="var(--color-success)"\n/>` },
  datatable:         { title: 'DataTableView',          desc: 'Generic sortable table — columns, striped rows, empty state, row click.',           vars: VARS_TABLE,      content: <DataTablePanel />,         code: `<DataTableView\n  columns={[\n    { key: 'name',   header: 'Name' },\n    { key: 'method', header: 'Method' },\n    { key: 'status', header: 'Status' },\n  ]}\n  rows={requests}\n  onRowClick={openRequest}\n/>` },
  codeblock:         { title: 'CodeBlockView',          desc: 'Read-only code block — language label, copy button, optional line numbers.',        vars: VARS_CODE,       content: <CodeBlockPanel />,         code: `<CodeBlockView\n  language="json"\n  code={responseBody}\n  showLineNumbers\n  showCopy\n/>` },
  aibutton:          { title: 'AIButtonView',           desc: 'AI action button — generate · fuzz · explain · fix · ask · suggest — loading state.', vars: VARS_AIBTN,   content: <AIButtonPanel />,          code: `<AIButtonView\n  action="generate"\n  onClick={generateRequest}\n  loading={isGenerating}\n/>` },
  sidenav:           { title: 'SideNavView',            desc: 'Collapsible left sidebar nav with nested items and icon-only collapse mode.',        vars: VARS_SIDENAV,    content: <SideNavPanel />,           code: `function Preview() {\n  const [activeId, setActiveId] = useState('col-1');\n  return (\n    <SideNavView\n      items={[\n        {\n          id: 'collections',\n          label: 'Collections',\n          icon: <FolderIcon size={14} />,\n          children: [\n            { id: 'col-1', label: 'User API',   icon: <DocumentIcon size={13} /> },\n            { id: 'col-2', label: 'Auth Tests', icon: <DocumentIcon size={13} /> },\n          ],\n        },\n        { id: 'envs',    label: 'Environments', icon: <GlobeIcon size={14} /> },\n        { id: 'history', label: 'History',      icon: <LayersIcon size={14} /> },\n      ]}\n      activeId={activeId}\n      onSelect={setActiveId}\n    />\n  );\n}` },
  settingsnav:       { title: 'SettingsNavView',        desc: 'Settings-style grouped nav with badges, descriptions, active state.',               vars: VARS_SIDENAV,    content: <SettingsNavPanel />,       code: `function Preview() {\n  const [activeId, setActiveId] = useState('appearance');\n  return (\n    <SettingsNavView\n      groups={[\n        {\n          title: 'General',\n          items: [\n            { id: 'appearance', label: 'Appearance', desc: 'Theme and layout' },\n            { id: 'shortcuts',  label: 'Shortcuts',  badge: '12' },\n          ],\n        },\n        {\n          title: 'Advanced',\n          items: [\n            { id: 'proxy',  label: 'Proxy',  desc: 'Network proxy settings' },\n            { id: 'certs',  label: 'Certs',  badge: '2' },\n          ],\n        },\n      ]}\n      activeId={activeId}\n      onSelect={setActiveId}\n    />\n  );\n}` },
  themecardselector: { title: 'ThemeCardSelectorView',  desc: 'Card-based theme picker with color swatch previews and checkmark selection.',        vars: VARS_ACCENT,     content: <ThemeCardSelectorPanel />, code: `function Preview() {\n  const [selectedTheme, setSelectedTheme] = useState('dark');\n  return (\n    <ThemeCardSelectorView\n      options={themes}\n      value={selectedTheme}\n      onChange={setSelectedTheme}\n    />\n  );\n}` },
  featurecategory:   { title: 'FeatureCategoryView',    desc: 'Expandable feature category with toggle switches and enabled count badge.',          vars: VARS_TOGGLE,     content: <FeatureCategoryPanel />,   code: `function Preview() {\n  const [features, setFeatures] = useState([\n    { id: 'suggest', label: 'Smart Suggestions', enabled: true },\n    { id: 'explain', label: 'Explain Response',   enabled: false },\n    { id: 'stream',  label: 'Streaming Output',   enabled: true },\n  ]);\n  const toggle = (id, val) =>\n    setFeatures(fs => fs.map(f => f.id === id ? { ...f, enabled: val } : f));\n  return (\n    <FeatureCategoryView\n      categoryLabel="AI Features"\n      features={features.map(f => ({\n        ...f,\n        onToggle: val => toggle(f.id, val),\n      }))}\n    />\n  );\n}` },
  taginput:          { title: 'TagInputView',           desc: 'Multi-value tag input — Enter or comma to add, Backspace to remove.',               vars: VARS_TAG,        content: <TagInputPanel />,          code: `function Preview() {\n  const [tags, setTags] = useState(['admin', 'beta', 'v2']);\n  return (\n    <TagInputView\n      tags={tags}\n      onChange={setTags}\n      placeholder="Add tag…"\n    />\n  );\n}` },
  bottompanel:       { title: 'BottomPanelView',        desc: 'DevTools-style resizable bottom panel with tab bar and collapse toggle.',            vars: VARS_ACCENT,     content: <BottomPanelPanel />,       code: `<BottomPanelView\n  tabs={[\n    {\n      id: 'console',\n      label: 'Console',\n      content: (\n        <div style={{ padding: 8, fontSize: 11, fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>\n          &gt; Request sent — 200 OK in 142ms\n        </div>\n      ),\n    },\n    {\n      id: 'logs',\n      label: 'Logs',\n      content: (\n        <div style={{ padding: 8, fontSize: 11, fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>\n          [INFO] Connected to mock server\n        </div>\n      ),\n    },\n  ]}\n  minHeight={120}\n/>` },
  toast:             { title: 'ToastView',              desc: 'Toast notification stack — success · error · warning · info — auto-dismiss.',        vars: VARS_STATUS,     content: <ToastPanel />,             code: `<div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360 }}>\n  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',\n    background: 'color-mix(in srgb, var(--color-success) 10%, transparent)',\n    border: '1px solid color-mix(in srgb, var(--color-success) 25%, transparent)',\n    borderRadius: 8, fontSize: 12 }}>\n    <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>✓</span>\n    <span>Request saved successfully</span>\n  </div>\n  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',\n    background: 'color-mix(in srgb, var(--color-error) 10%, transparent)',\n    border: '1px solid color-mix(in srgb, var(--color-error) 25%, transparent)',\n    borderRadius: 8, fontSize: 12 }}>\n    <span style={{ color: 'var(--color-error)', fontWeight: 700 }}>✗</span>\n    <span>Connection failed — check endpoint</span>\n  </div>\n  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',\n    background: 'color-mix(in srgb, var(--color-warning) 10%, transparent)',\n    border: '1px solid color-mix(in srgb, var(--color-warning) 25%, transparent)',\n    borderRadius: 8, fontSize: 12 }}>\n    <span style={{ color: 'var(--color-warning)', fontWeight: 700 }}>!</span>\n    <span>Request timed out after 30s</span>\n  </div>\n</div>` },
  promptcard:        { title: 'PromptCardView',         desc: 'Single prompt library row card — colored avatar initials, title, description, protocol badge, CUSTOM badge, hover actions (Use/Copy/Edit/Delete).',  vars: VARS_ACCENT, content: <PromptCardPanel />,        code: `function Preview() {\n  const [selectedId, setSelectedId] = useState('p1');\n  return (\n    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>\n      <PromptCardView\n        id="p1"\n        title="REST API Agent"\n        description="Builds structured HTTP requests from natural language"\n        content="You are a REST API expert. Help the user build structured HTTP requests."\n        protocol="REST"\n        protocolColor="var(--color-protocol-rest)"\n        isCustom={false}\n        selected={selectedId === 'p1'}\n        onUse={id => setSelectedId(id)}\n        onCopy={() => {}}\n        onEdit={() => {}}\n        onDelete={() => {}}\n      />\n      <PromptCardView\n        id="p2"\n        title="cURL Converter"\n        description="Converts cURL commands to Daakia requests"\n        content="Convert the following cURL command into a structured request."\n        protocol="REST"\n        protocolColor="var(--color-method-post)"\n        isCustom={true}\n        selected={selectedId === 'p2'}\n        onUse={id => setSelectedId(id)}\n        onCopy={() => {}}\n        onEdit={() => {}}\n        onDelete={() => {}}\n      />\n    </div>\n  );\n}` },
  promptlibrary:     { title: 'PromptLibraryView',      desc: 'Full Prompt Library panel — PromptLibraryListView (left: search + sections + categories + PromptCardView rows) + PromptLibraryEditorView (right: avatar header + variable chips + System/User tabs + Preview/Edit toggle + Save).',  content: <PromptLibraryPanel />,     code: `function Preview() {\n  const [search, setSearch] = useState('');\n  const [activeId, setActiveId] = useState('p1');\n  const [activeTab, setActiveTab] = useState('system');\n  const [promptText, setPromptText] = useState('You are a REST API expert. Help the user build structured HTTP requests.');\n  const [viewMode, setViewMode] = useState('edit');\n  const [dirty, setDirty] = useState(false);\n  const sectionData = [\n    {\n      id: 'general', title: 'General',\n      items: [\n        { id: 'p1', title: 'REST API Agent', description: 'HTTP request builder', protocol: 'REST', protocolColor: 'var(--color-protocol-rest)', isCustom: false, content: 'You are a REST API expert.' },\n        { id: 'p2', title: 'cURL Converter', description: 'Converts cURL commands', protocol: 'REST', protocolColor: 'var(--color-method-post)', isCustom: true, content: 'Convert this cURL command.' },\n      ],\n    },\n  ];\n  return (\n    <div style={{ display: 'flex', height: 420, border: '1px solid var(--color-surface-border)', borderRadius: 8, overflow: 'hidden' }}>\n      <PromptLibraryListView\n        sections={sectionData}\n        activeId={activeId}\n        onSelect={setActiveId}\n        search={search}\n        onSearchChange={setSearch}\n      />\n      <PromptLibraryEditorView\n        title="REST API Agent"\n        description="Builds structured HTTP requests from natural language"\n        triggerLabel="Daakia AI chat → REST intent"\n        avatarColor="var(--color-protocol-rest)"\n        variables={[{ pill: '{{endpoint}}', insert: '{{endpoint}}' }]}\n        tabs={[{ id: 'system', label: 'System' }, { id: 'user', label: 'User' }]}\n        activeTabId={activeTab}\n        onTabChange={setActiveTab}\n        content={promptText}\n        onContentChange={val => { setPromptText(val); setDirty(true); }}\n        viewMode={viewMode}\n        onViewModeChange={setViewMode}\n        isDirty={dirty}\n        onSave={() => setDirty(false)}\n      />\n    </div>\n  );\n}` },
  stageview:         { title: 'StageCheck / StageSpin / StagePulse', desc: 'Step-level status indicators — completed (check), active (spin), pending (pulse) — for multi-step pipelines and request flows.', vars: VARS_STAGE, content: <StageViewPanel />, code: `<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>\n  <StageCheck label="Auth verified"   sublabel="Token valid" />\n  <StageSpin  label="Sending request" sublabel="Waiting for response…" />\n  <StagePulse label="Parse response"  sublabel="Queued" />\n</div>` },
  iconsgallery:      { title: 'Icons Gallery',          desc: 'All Daakia icons — searchable by name — click to copy icon name.',                   content: <IconsGalleryPanel />, noExamplesHeader: true },
  themeconfig:       { title: 'Theme Customization',    desc: 'Export / upload YAML theme files — all 63 CSS color vars, live hot-swap, no rebuild.', content: <ThemeCustomizationPanel />, noExamplesHeader: true },
  searchinput:       { title: 'SearchInputView',        desc: 'URL-bar style search input with optional prefix icon and suffix clear button.',        vars: VARS_INPUT,      content: <SearchInputPanel />,       code: `function Preview() {\n  const [q, setQ] = useState('');\n  return (\n    <SearchInputView\n      value={q}\n      onChange={setQ}\n      placeholder="Search collections…"\n      prefix={<SearchIcon size={11} />}\n      suffix={q ? <button onClick={() => setQ('')}><CloseIcon size={10} /></button> : null}\n    />\n  );\n}` },
  durationinput:     { title: 'DurationInputView',      desc: 'Number input with ms / s / m / hr unit selector dropdown.',                           vars: VARS_DUR,        content: <DurationInputPanel />,     code: `function Preview() {\n  const [timeout, setTimeout] = useState(5000);\n  return (\n    <DurationInputView\n      value={timeout}\n      onChange={setTimeout}\n    />\n  );\n}` },
  pilltabs:          { title: 'PillTabsView',           desc: 'Sliding-indicator tabs — pill (background) and underline variants — with badges and dots.',  vars: VARS_PILLTAB, content: <PillTabsPanel />, code: `function Preview() {\n  const [active, setActive] = useState('body');\n  return (\n    <PillTabsView\n      tabs={[\n        { id: 'body',    label: 'Body' },\n        { id: 'headers', label: 'Headers', badge: 3 },\n        { id: 'auth',    label: 'Auth', dot: true },\n      ]}\n      activeTab={active}\n      onChange={setActive}\n      variant="pill"\n    />\n  );\n}` },
  splitbutton:       { title: 'SplitButtonView',        desc: 'Primary action + chevron dropdown — separate click zones, keyboard nav, portal menu.',  vars: VARS_BTN,    content: <SplitButtonPanel />,       code: `function Preview() {\n  const [lastAction, setLastAction] = useState('—');\n  return (\n    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>\n      <SplitButtonView\n        label="Send"\n        variant="primary"\n        onClick={() => setLastAction('Send clicked')}\n        items={[\n          { id: 'save', label: 'Save & Send', onClick: () => setLastAction('Save & Send') },\n          { id: 'dry',  label: 'Dry Run',     onClick: () => setLastAction('Dry Run') },\n        ]}\n      />\n      <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Last: {lastAction}</span>\n    </div>\n  );\n}` },
  highlightedinput:  { title: 'HighlightedInputView',   desc: '{{variable}} highlighted URL input with autocomplete dropdown — the Daakia URL bar.',   vars: VARS_INPUT,  content: <HighlightedInputPanel />,  code: `function Preview() {\n  const [url, setUrl] = useState('https://api.example.com/{{env}}/users/{{userId}}');\n  return (\n    <HighlightedInputView\n      value={url}\n      onChange={setUrl}\n      placeholder="https://api.example.com/{{env}}/users"\n      suggestions={urlHistory}\n    />\n  );\n}` },
  keyvaluetable:     { title: 'KeyValueTableView',      desc: 'Full KV table with toolbar, row add/delete, bulk clear, enabled toggles — wraps KeyValueItemView rows.',  vars: VARS_TABLE, content: <KeyValueTablePanel />, code: `function Preview() {\n  const [rows, setRows] = useState([\n    { id: '1', key: 'Authorization', value: 'Bearer {{token}}', enabled: true },\n    { id: '2', key: 'Content-Type',  value: 'application/json', enabled: true },\n    { id: '3', key: 'X-Request-Id',  value: '{{requestId}}',    enabled: false },\n  ]);\n  return (\n    <KeyValueTableView\n      rows={rows}\n      onChange={setRows}\n      label="Request Headers"\n      accentColor="var(--color-protocol-rest)"\n      placeholder={{ key: 'Header name', value: 'Header value' }}\n    />\n  );\n}` },
  mergedinput:       { title: 'MergedInputView',         desc: 'Unified single-border input bar — merge select dropdowns, text inputs, inline buttons, and dividers into one pill.',  vars: VARS_INPUT, content: <MergedInputViewPanel />, code: `function Preview() {\n  const [version, setVersion] = useState('1.1');\n  const [url, setUrl] = useState('https://service.example.com/endpoint');\n  const soapVersions = [\n    { label: 'SOAP 1.1', value: '1.1' },\n    { label: 'SOAP 1.2', value: '1.2' },\n  ];\n  return (\n    <MergedInputView\n      segments={[\n        { type: 'select', value: version, options: soapVersions, onChange: setVersion, width: 96 },\n        { type: 'divider' },\n        { type: 'button', label: 'WSDL', onClick: openWsdl,\n          accentColor: 'var(--color-protocol-soap)' },\n        { type: 'divider' },\n        { type: 'text', value: url, onChange: setUrl, placeholder: 'https://service.example.com/endpoint' },\n      ]}\n      accentColor="var(--color-protocol-soap)"\n    />\n  );\n}` },
  duiprovider:       { title: 'DuiProvider — Size System', desc: 'Wrap any subtree with <DuiProvider size="sm|md|lg|xl"> and ALL nested DUI components inherit that size — buttons, inputs, toggles, tabs, nav items. No prop drilling.', vars: VARS_ACCENT, content: <DuiProviderPanel />, noExamplesHeader: true },
};

// ─── Main showcase ────────────────────────────────────────────────────────────

type DuiThemeMode = 'light' | 'dark' | 'system';

function applyTheme(mode: DuiThemeMode) {
  if (mode === 'system') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    applyMonacoTheme(isDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', mode);
    applyMonacoTheme(mode);
  }
}

const THEME_OPTIONS: { id: DuiThemeMode; label: string; icon: string }[] = [
  { id: 'light',  label: 'Light',  icon: '☀️' },
  { id: 'dark',   label: 'Dark',   icon: '🌙' },
  { id: 'system', label: 'System', icon: '💻' },
];

export function DuiShowcase() {
  const [activeCategory, setActiveCategory] = useState<CategoryId>('textinput');
  const [themeMode, setThemeMode] = useState<DuiThemeMode>('dark');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const panel = PANELS[activeCategory];

  const handleTheme = useCallback((mode: DuiThemeMode) => {
    setThemeMode(mode);
    applyTheme(mode);
  }, []);

  useEffect(() => {
    if (themeMode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => applyTheme('system');
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, [themeMode]);

  useEffect(() => { applyTheme(themeMode); }, []);


  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      background: 'var(--color-panel)', color: 'var(--color-text-primary)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    }}>

      {/* ── Header ── */}
      <div style={{
        height: 44, flexShrink: 0, display: 'flex', alignItems: 'center',
        gap: 10, padding: '0 16px 0 12px',
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-surface-border)',
        zIndex: 200,
      }}>
        {/* Sidebar toggle */}
        <button
          type="button"
          title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          onClick={() => setSidebarOpen(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, border: 'none', background: 'transparent',
            borderRadius: 6, cursor: 'pointer',
            color: sidebarOpen ? 'var(--color-primary)' : 'var(--color-text-muted)',
            transition: 'color 120ms',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
        >
          <SidebarLeftIcon size={14} />
        </button>

        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.02em' }}>DUI</span>
          <ChipView label="v1.0" color="var(--color-primary)" size="xs" />
        </div>
        <div style={{ width: 1, height: 16, background: 'var(--color-surface-border)' }} />
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Daakia UI Component Library</span>

        <div style={{ flex: 1 }} />

        {/* Theme switcher */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2,
          background: 'var(--color-panel)',
          border: '1px solid var(--color-surface-border)',
          borderRadius: 8, padding: 2,
        }}>
          {THEME_OPTIONS.map(opt => {
            const isActive = themeMode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleTheme(opt.id)}
                title={`${opt.label} theme`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  padding: '3px 8px', borderRadius: 6,
                  fontSize: 11, fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer', border: 'none',
                  background: isActive ? 'var(--color-surface)' : 'transparent',
                  color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                  transition: 'all 140ms',
                }}
              >
                <span>{opt.icon}</span>
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Info chips */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
          <ChipView label="React 19"      color="var(--color-info)"    size="xs" />
          <ChipView label="Tailwind v4"   color="var(--color-success)" size="xs" />
          <ChipView label={`${TOTAL_COMPONENT_COUNT} components`} color="var(--color-primary)" size="xs" />
        </div>
      </div>

      {/* ── Body: sidebar + content ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Sidebar ── */}
        <SideNavView
          items={NAV_ITEMS}
          activeId={activeCategory}
          onSelect={id => setActiveCategory(id as CategoryId)}
          collapsed={!sidebarOpen}
          onCollapsedChange={v => setSidebarOpen(!v)}
          collapsible={false}
          searchable
          searchPlaceholder="Search components…"
          emptyText="No matches"
          width={232}
          collapsedWidth={52}
          style={{
            background: 'var(--color-surface)',
            borderRight: '1px solid var(--color-surface-border)',
          }}
        />

        {/* ── Content ── */}
        <div style={{ flex: 1, overflow: 'auto', padding: '36px 48px 64px' }}>
          <div style={{ maxWidth: 880, margin: '0 auto' }}>

            {/* Breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20 }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>DUI</span>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>›</span>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                {SIDEBAR_GROUPS.find(g => g.items.some(i => i.id === activeCategory))?.title}
              </span>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>›</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-primary)' }}>{panel.title}</span>
            </div>

            {/* Section heading — clean, no code toggle here */}
            <div style={{ marginBottom: 32, paddingBottom: 20, borderBottom: '1px solid var(--color-surface-border)' }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>
                {panel.title}
              </h1>
              <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.6, maxWidth: 640 }}>
                {panel.desc}
              </p>
            </div>

            {/* Live playground toolbar — always at top; editor + color picker expand below */}
            {/* Live playground — always at top when code exists */}
            {panel.code && (
              <LivePlayground
                key={`pg-${activeCategory}`}
                code={panel.code}
                content={panel.content}
                themeMode={themeMode}
                vars={panel.vars}
              />
            )}

            {/* Examples section — showcase rows with Show Code toggles */}
            {panel.content && (
              panel.noExamplesHeader
                ? <div style={{ marginTop: 20 }}>{panel.content}</div>
                : <>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      margin: '28px 0 16px',
                    }}>
                      <div style={{ flex: 1, height: 1, background: 'var(--color-surface-border)' }} />
                      <span style={{
                        fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                        textTransform: 'uppercase', color: 'var(--color-text-muted)',
                        whiteSpace: 'nowrap',
                      }}>
                        Examples
                      </span>
                      <div style={{ flex: 1, height: 1, background: 'var(--color-surface-border)' }} />
                    </div>
                    {panel.content}
                  </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
