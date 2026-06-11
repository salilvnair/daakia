import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ToggleSwitchPanel, CheckboxPanel, ModalPanel, LoaderPanel, EmptyStatePanel,
  StatusIndicatorPanel, InfoPopupPanel, ResizablePanelPanel, DottedCardPanel,
  ColoredTextPanel, StatsCardPanel, DataTablePanel, CodeBlockPanel, AIButtonPanel,
  SideNavPanel, SettingsNavPanel, ThemeCardSelectorPanel, FeatureCategoryPanel,
  TagInputPanel, BottomPanelPanel, ToastPanel, PromptCardPanel,
} from './panels/NewComponentPanels';
import { IconsGalleryPanel } from './panels/IconsGalleryPanel';
import { ThemeCustomizationPanel } from './panels/ThemeCustomizationPanel';
import {
  ChipView,
  ButtonView,
  IconButtonView,
  DropDownButtonView,
  TextInputView,
  SelectInputView,
  KeyValueItemView,
  TabView,
  EditorView,
  ContextMenuView,
  TabBarView,
} from '../../dui';
import type { TabItem, ContextMenuItem, TabBarTab } from '../../dui';
import { applyMonacoTheme } from '../../monaco-setup';
import {
  TrashIcon, PlusIcon, SearchIcon, SettingsIcon, SparkleIcon,
  MoreHorizontalIcon, CopyIcon, RefreshIcon, DownloadIcon,
  SaveIcon, ExportIcon, InfoCircleIcon, PlayIcon,
  WandIcon, CodeIcon, FilterIcon, GlobeIcon, RenameIcon,
  CheckIcon, LayersIcon, PanelRightIcon, SidebarLeftIcon, DotIcon, CheckCircleIcon,
  GaugeIcon, TerminalIcon, DocumentIcon, CodeBracketsIcon,
  ChevronDownIcon, FolderIcon, SpinnerIcon, SunIcon, KeyIcon,
  PlusSquareIcon,
} from '../../icons';

// ─── Types ────────────────────────────────────────────────────────────────────

type CategoryId =
  | 'chips' | 'textinput' | 'selectinput' | 'button'
  | 'iconbutton' | 'dropdownbutton' | 'contextmenu'
  | 'tabs' | 'tabbar' | 'keyvalue' | 'editor' | 'patterns'
  | 'toggle' | 'checkbox' | 'modal' | 'loader' | 'emptystate'
  | 'statusindicator' | 'infopopup' | 'resizablepanel' | 'dottedcard'
  | 'coloredtext' | 'statscard' | 'datatable' | 'codeblock' | 'aibutton'
  | 'sidenav' | 'settingsnav' | 'themecardselector' | 'featurecategory'
  | 'taginput' | 'bottompanel' | 'toast' | 'promptcard' | 'iconsgallery' | 'themeconfig';

interface SidebarItem { id: CategoryId; label: string; icon: React.ReactNode }
interface SidebarGroup { title: string; items: SidebarItem[] }

const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    title: 'Inputs',
    items: [
      { id: 'textinput',         label: 'TextInputView',         icon: <KeyIcon size={13} /> },
      { id: 'selectinput',       label: 'SelectInputView',       icon: <FilterIcon size={13} /> },
      { id: 'keyvalue',          label: 'KeyValueItemView',      icon: <LayersIcon size={13} /> },
      { id: 'taginput',          label: 'TagInputView',          icon: <PlusIcon size={13} /> },
      { id: 'checkbox',          label: 'CheckboxView',          icon: <CheckIcon size={13} /> },
      { id: 'toggle',            label: 'ToggleSwitchView',      icon: <RefreshIcon size={13} /> },
      { id: 'themecardselector', label: 'ThemeCardSelectorView', icon: <SunIcon size={13} /> },
      { id: 'editor',            label: 'EditorView',            icon: <CodeIcon size={13} /> },
    ],
  },
  {
    title: 'Buttons',
    items: [
      { id: 'button',         label: 'ButtonView',         icon: <PlayIcon size={13} /> },
      { id: 'iconbutton',     label: 'IconButtonView',     icon: <SparkleIcon size={13} /> },
      { id: 'dropdownbutton', label: 'DropDownButtonView', icon: <ChevronDownIcon size={13} /> },
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
      { id: 'bottompanel',     label: 'BottomPanelView',     icon: <TerminalIcon size={13} /> },
      { id: 'featurecategory', label: 'FeatureCategoryView', icon: <FilterIcon size={13} /> },
    ],
  },
  {
    title: 'More',
    items: [
      { id: 'patterns',     label: 'Patterns',              icon: <CodeBracketsIcon size={13} /> },
      { id: 'iconsgallery', label: 'Icons Gallery',         icon: <SearchIcon size={13} /> },
      { id: 'themeconfig',  label: 'Theme Customization',   icon: <WandIcon size={13} /> },
    ],
  },
];

// ─── Layout helpers ───────────────────────────────────────────────────────────

function Row({ label, children, gap = 10 }: { label: string; children: React.ReactNode; gap?: number }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{
        fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px',
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <span>{label}</span>
        <div style={{ flex: 1, height: '1px', background: 'var(--color-surface-border)' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap }}>
        {children}
      </div>
    </div>
  );
}

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
      <Row label="Protocol chips">
        {PROTOCOLS.map(p => <ChipView key={p.label} label={p.badge} color={p.color} size="sm" />)}
      </Row>
      <Row label="HTTP method chips">
        <ChipView label="GET"    color="var(--color-method-get)"    size="sm" />
        <ChipView label="POST"   color="var(--color-method-post)"   size="sm" />
        <ChipView label="PUT"    color="var(--color-method-put)"    size="sm" />
        <ChipView label="PATCH"  color="var(--color-method-patch)"  size="sm" />
        <ChipView label="DELETE" color="var(--color-method-delete)" size="sm" />
        <ChipView label="HEAD"   color="var(--color-method-head)"   size="sm" />
      </Row>
      <Row label="Status code chips">
        <ChipView label="200 OK"           color="var(--color-success)" active />
        <ChipView label="201 Created"      color="var(--color-success)" />
        <ChipView label="400 Bad Request"  color="var(--color-warning)" />
        <ChipView label="404 Not Found"    color="var(--color-warning)" active />
        <ChipView label="500 Error"        color="var(--color-error)"   active />
      </Row>
      <Row label="Sizes  (xs / sm / md)">
        <ChipView label="xs" size="xs" color="var(--color-primary)" />
        <ChipView label="sm" size="sm" color="var(--color-primary)" />
        <ChipView label="md" size="md" color="var(--color-primary)" />
      </Row>
      <Row label="Active (filled) vs outlined">
        <ChipView label="Active"   color="var(--color-protocol-graphql)" active />
        <ChipView label="Outlined" color="var(--color-protocol-graphql)" />
        <ChipView label="Active"   color="var(--color-success)" active />
        <ChipView label="Outlined" color="var(--color-success)" />
        <ChipView label="Active"   color="var(--color-error)" active />
        <ChipView label="Outlined" color="var(--color-error)" />
      </Row>
      <Row label="rounded=true vs rounded=false">
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
      <Row label="Sizes  default · sm · md · lg · xl">
        <TextInputView size="default" placeholder="default — 26px" style={{ width: 170 }} />
        <TextInputView size="sm"      placeholder="sm — 22px"      style={{ width: 130 }} />
        <TextInputView size="md"      placeholder="md — 28px"      style={{ width: 130 }} />
        <TextInputView size="lg"      placeholder="lg — 32px"      style={{ width: 130 }} />
        <TextInputView size="xl"      placeholder="xl — 36px"      style={{ width: 130 }} />
      </Row>
      <Row label="With iconLeft / iconRight">
        <TextInputView placeholder="Search…"      iconLeft={<SearchIcon size={11} />} style={{ width: 200 }} />
        <TextInputView placeholder="API endpoint" iconLeft={<GlobeIcon size={11} />} iconRight={<InfoCircleIcon size={11} />} style={{ width: 240 }} />
        <TextInputView placeholder="Settings key" iconLeft={<SettingsIcon size={11} />} style={{ width: 180 }} />
      </Row>
      <Row label="error=true  (red focus ring)">
        <TextInputView error placeholder="Required field" style={{ width: 180 }} />
        <TextInputView error value="bad-value@" onChange={() => {}} style={{ width: 160 }} />
      </Row>
      <Row label="rounded=true vs rounded=false">
        <TextInputView placeholder="rounded (default)" rounded style={{ width: 170 }} />
        <TextInputView placeholder="pointy" rounded={false} style={{ width: 130 }} />
      </Row>
      <Row label="Custom accentColor">
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
      <Row label="Sizes  default · sm · md · lg · xl">
        <SelectInputView options={METHOD_OPTIONS} value={method} onChange={setMethod} size="default" style={{ width: 105 }} />
        <SelectInputView options={METHOD_OPTIONS} value={method} onChange={setMethod} size="sm"      style={{ width: 95 }} />
        <SelectInputView options={METHOD_OPTIONS} value={method} onChange={setMethod} size="md"      style={{ width: 105 }} />
        <SelectInputView options={METHOD_OPTIONS} value={method} onChange={setMethod} size="lg"      style={{ width: 105 }} />
        <SelectInputView options={METHOD_OPTIONS} value={method} onChange={setMethod} size="xl"      style={{ width: 105 }} />
      </Row>
      <Row label="Colored options (HTTP methods)">
        <SelectInputView options={METHOD_OPTIONS} value={method2} onChange={setMethod2} style={{ width: 130 }} />
      </Row>
      <Row label="Group headers">
        <SelectInputView
          options={[{ value: 'h', label: 'Request Protocols', isHeader: true }, ...PROTOCOL_OPTIONS]}
          value={protocol} onChange={setProtocol} style={{ width: 170 }}
        />
      </Row>
      <Row label="Custom accentColor">
        <SelectInputView options={METHOD_OPTIONS} value={method} onChange={setMethod} accentColor="var(--color-protocol-graphql)" style={{ width: 130 }} />
        <SelectInputView options={METHOD_OPTIONS} value={method} onChange={setMethod} accentColor="var(--color-protocol-soap)" style={{ width: 130 }} />
      </Row>
      <Row label="rounded=false">
        <SelectInputView options={METHOD_OPTIONS} value={method} onChange={setMethod} rounded={false} style={{ width: 130 }} />
      </Row>
      <Row label="Aligned with TextInputView — same 26px height">
        <Block style={{ padding: '8px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <SelectInputView options={METHOD_OPTIONS} value={method} onChange={setMethod} style={{ width: 90 }} />
            <TextInputView placeholder="https://api.example.com/users" style={{ flex: 1, width: 300 }} />
          </div>
        </Block>
      </Row>
    </div>
  );
}

function ButtonPanel() {
  return (
    <div>
      <Row label="Variants  primary · secondary · ghost · danger">
        <Block style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '16px 20px' }}>
          <ButtonView variant="primary">Primary</ButtonView>
          <ButtonView variant="secondary">Secondary</ButtonView>
          <ButtonView variant="ghost">Ghost</ButtonView>
          <ButtonView variant="danger">Danger</ButtonView>
        </Block>
      </Row>
      <Row label="Sizes  default(26px) · sm(22px) · md(28px) · lg(32px) · xl(36px)">
        <Block style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '16px 20px', flexWrap: 'wrap' }}>
          <ButtonView variant="primary" size="default">Default 26px</ButtonView>
          <ButtonView variant="primary" size="sm">SM 22px</ButtonView>
          <ButtonView variant="primary" size="md">MD 28px</ButtonView>
          <ButtonView variant="primary" size="lg">LG 32px</ButtonView>
          <ButtonView variant="primary" size="xl">XL 36px</ButtonView>
        </Block>
      </Row>
      <Row label="With iconLeft / iconRight">
        <Block style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '16px 20px', flexWrap: 'wrap' }}>
          <ButtonView variant="primary"   iconLeft={<PlayIcon size={11} />}>Send</ButtonView>
          <ButtonView variant="secondary" iconLeft={<SaveIcon size={11} />}>Save</ButtonView>
          <ButtonView variant="ghost"     iconLeft={<RefreshIcon size={11} />}>Refresh</ButtonView>
          <ButtonView variant="danger"    iconLeft={<TrashIcon size={11} />}>Delete</ButtonView>
          <ButtonView variant="secondary" iconRight={<DownloadIcon size={11} />}>Download</ButtonView>
        </Block>
      </Row>
      <Row label="loading=true">
        <Block style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '16px 20px' }}>
          <ButtonView variant="primary" loading>Sending…</ButtonView>
          <ButtonView variant="secondary" loading>Saving…</ButtonView>
          <ButtonView variant="ghost" loading>Loading…</ButtonView>
        </Block>
      </Row>
      <Row label="disabled=true">
        <Block style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '16px 20px' }}>
          <ButtonView variant="primary" disabled>Disabled</ButtonView>
          <ButtonView variant="secondary" disabled>Disabled</ButtonView>
          <ButtonView variant="ghost" disabled>Disabled</ButtonView>
          <ButtonView variant="danger" disabled>Disabled</ButtonView>
        </Block>
      </Row>
      <Row label="rounded=false (pointy corners)">
        <Block style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '16px 20px' }}>
          <ButtonView variant="primary" rounded={false}>Pointy Primary</ButtonView>
          <ButtonView variant="secondary" rounded={false}>Pointy Secondary</ButtonView>
          <ButtonView variant="ghost" rounded={false}>Pointy Ghost</ButtonView>
        </Block>
      </Row>
      <Row label="Custom accentColor per protocol">
        <Block style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '16px 20px', flexWrap: 'wrap' }}>
          <ButtonView variant="primary" accentColor="var(--color-protocol-rest)">Send REST</ButtonView>
          <ButtonView variant="primary" accentColor="var(--color-protocol-graphql)">Run GQL</ButtonView>
          <ButtonView variant="primary" accentColor="var(--color-protocol-websocket)">Connect WS</ButtonView>
          <ButtonView variant="primary" accentColor="var(--color-protocol-grpc)">Invoke gRPC</ButtonView>
          <ButtonView variant="primary" accentColor="var(--color-protocol-soap)">Call SOAP</ButtonView>
          <ButtonView variant="primary" accentColor="var(--color-protocol-mqtt)">Publish MQTT</ButtonView>
        </Block>
      </Row>
    </div>
  );
}

function IconButtonPanel() {
  const [active, setActive] = useState(false);
  const [active2, setActive2] = useState(false);

  return (
    <div>
      <Row label="Common icon buttons (ghost, 26px default)">
        <Block style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', padding: '12px 16px', alignItems: 'center' }}>
          <IconButtonView icon={<MoreHorizontalIcon size={14} />} tooltip="More actions" />
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
        </Block>
      </Row>
      <Row label="Sizes  sm(22px) · default(26px) · md(28px) · lg(32px) · xl(36px)">
        <Block style={{ display: 'flex', gap: '8px', padding: '12px 16px', alignItems: 'center' }}>
          <IconButtonView icon={<PlusIcon size={10} />} size="sm"      tooltip="sm 22px" />
          <IconButtonView icon={<PlusIcon size={12} />} size="default" tooltip="default 26px" />
          <IconButtonView icon={<PlusIcon size={13} />} size="md"      tooltip="md 28px" />
          <IconButtonView icon={<PlusIcon size={14} />} size="lg"      tooltip="lg 32px" />
          <IconButtonView icon={<PlusIcon size={16} />} size="xl"      tooltip="xl 36px" />
        </Block>
      </Row>
      <Row label="active toggle — click to toggle">
        <Block style={{ display: 'flex', gap: '12px', padding: '12px 16px', alignItems: 'center' }}>
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
        </Block>
      </Row>
      <Row label='variant="filled"'>
        <Block style={{ display: 'flex', gap: '8px', padding: '12px 16px', alignItems: 'center' }}>
          <IconButtonView icon={<SparkleIcon size={13} />} variant="filled" accentColor="var(--color-protocol-ai)"        tooltip="AI Assist" />
          <IconButtonView icon={<PlayIcon size={13} />}    variant="filled" accentColor="var(--color-success)"             tooltip="Run" />
          <IconButtonView icon={<SettingsIcon size={13} />} variant="filled"                                               tooltip="Settings" />
          <IconButtonView icon={<FilterIcon size={13} />}  variant="filled" accentColor="var(--color-protocol-graphql)"   tooltip="GQL filter" />
        </Block>
      </Row>
      <Row label="Protocol accents">
        <Block style={{ display: 'flex', gap: '8px', padding: '12px 16px', alignItems: 'center' }}>
          {PROTOCOLS.map(p => (
            <IconButtonView key={p.label} icon={<SparkleIcon size={13} />} accentColor={p.color} tooltip={`${p.label} AI`} />
          ))}
        </Block>
      </Row>
    </div>
  );
}

function DropDownButtonPanel() {
  return (
    <div>
      <Row label="Variants">
        <Block style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', padding: '16px 20px' }}>
          <DropDownButtonView label="Save" variant="secondary" items={DROPDOWN_ITEMS} onPrimaryClick={() => alert('Save!')} />
          <DropDownButtonView label="Save" variant="primary"   items={DROPDOWN_ITEMS} onPrimaryClick={() => alert('Save!')} accentColor="var(--color-protocol-rest)" />
          <DropDownButtonView label="Export" variant="ghost"   items={DROPDOWN_ITEMS} />
          <DropDownButtonView label="Delete" variant="danger"  items={DROPDOWN_ITEMS} />
        </Block>
      </Row>
      <Row label="Sizes  sm · default · md · lg">
        <Block style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', padding: '16px 20px' }}>
          <DropDownButtonView label="Save" size="sm"      items={DROPDOWN_ITEMS} />
          <DropDownButtonView label="Save" size="default" items={DROPDOWN_ITEMS} />
          <DropDownButtonView label="Save" size="md"      items={DROPDOWN_ITEMS} />
          <DropDownButtonView label="Save" size="lg"      items={DROPDOWN_ITEMS} />
        </Block>
      </Row>
      <Row label="Protocol accent colors">
        <Block style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', padding: '16px 20px' }}>
          <DropDownButtonView label="Send"    variant="primary" items={DROPDOWN_ITEMS} accentColor="var(--color-protocol-rest)"      onPrimaryClick={() => alert('Send REST')} />
          <DropDownButtonView label="Run"     variant="primary" items={DROPDOWN_ITEMS} accentColor="var(--color-protocol-graphql)"   onPrimaryClick={() => alert('Run GQL')} />
          <DropDownButtonView label="Connect" variant="primary" items={DROPDOWN_ITEMS} accentColor="var(--color-protocol-websocket)" onPrimaryClick={() => alert('Connect WS')} />
        </Block>
      </Row>
      <Row label="rounded=false">
        <Block style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '16px 20px' }}>
          <DropDownButtonView label="Save" rounded={false} items={DROPDOWN_ITEMS} />
          <DropDownButtonView label="Save" rounded={false} variant="primary" items={DROPDOWN_ITEMS} />
        </Block>
      </Row>
    </div>
  );
}

function ContextMenuPanel() {
  const [open1, setOpen1] = useState(false);
  const [el1, setEl1] = useState<HTMLElement | null>(null);
  const [open2, setOpen2] = useState(false);
  const [el2, setEl2] = useState<HTMLElement | null>(null);
  const [open3, setOpen3] = useState(false);
  const [el3, setEl3] = useState<HTMLElement | null>(null);

  const widthItems: ContextMenuItem[] = [
    { id: 'a', label: 'Rename',    icon: <RenameIcon size={13} />, onClick: () => alert('Rename') },
    { id: 'b', label: 'Duplicate', icon: <CopyIcon size={13} />,   onClick: () => alert('Duplicate') },
    { id: 'c', label: 'Delete',    icon: <TrashIcon size={13} />,  danger: true, onClick: () => alert('Delete') },
  ];

  return (
    <div>
      <Row label="Standard context menu (with submenu)">
        <Block style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '16px 20px' }}>
          <ButtonView variant="secondary" onClick={e => { setEl1(e.currentTarget); setOpen1(v => !v); }}>
            Open Context Menu ▾
          </ButtonView>
          <ContextMenuView items={CONTEXT_ITEMS} anchorEl={el1} open={open1} onClose={() => setOpen1(false)} />
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Hover "Export as…" to see submenu → JSON / cURL / HAR</span>
        </Block>
      </Row>
      <Row label='width sizes  "sm" / "md" / "lg"'>
        <Block style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '16px 20px', flexWrap: 'wrap' }}>
          <ButtonView variant="secondary" size="sm" onClick={e => { setEl2(e.currentTarget); setOpen2(v => !v); }}>sm menu</ButtonView>
          <ButtonView variant="secondary" size="sm" onClick={e => { setEl3(e.currentTarget); setOpen3(v => !v); }}>md menu</ButtonView>
          <ContextMenuView items={widthItems} anchorEl={el2} open={open2} onClose={() => setOpen2(false)} width="sm" />
          <ContextMenuView items={widthItems} anchorEl={el3} open={open3} onClose={() => setOpen3(false)} width="md" />
        </Block>
      </Row>
      <Row label="Features">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
          {[
            '✓ Portal-rendered — always on top',
            '✓ Recursive submenu support (hover "Export as…")',
            '✓ danger=true → red label (Delete item)',
            '✓ separator=true → horizontal rule divider',
            '✓ shortcut badge on the right',
            '✓ Escape key or outside click closes menu',
            '✓ matchAnchorWidth for Save As popups',
            '✓ rounded / pointy corner support',
          ].map(f => <div key={f}>{f}</div>)}
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
      <Row label='variant="pill"  (default) — sliding background indicator'>
        <Block>
          <div style={{ marginBottom: '8px' }}>
            <TabView tabs={PILL_TABS} active={pillTab} onChange={setPillTab} accentColor="var(--color-protocol-rest)" />
          </div>
          <div style={{ marginBottom: '8px' }}>
            <TabView tabs={PILL_TABS} active={pillTab} onChange={setPillTab} accentColor="var(--color-protocol-graphql)" />
          </div>
          <TabView tabs={PILL_TABS} active={pillTab} onChange={setPillTab} size="sm" accentColor="var(--color-protocol-grpc)" />
        </Block>
      </Row>
      <Row label='variant="underline" — sliding 2px bottom border'>
        <Block>
          <div style={{ marginBottom: '12px' }}>
            <TabView tabs={PILL_TABS} active={underlineTab} onChange={setUnderlineTab} variant="underline" accentColor="var(--color-protocol-rest)" />
          </div>
          <TabView tabs={PILL_TABS} active={underlineTab} onChange={setUnderlineTab} variant="underline" size="sm" accentColor="var(--color-protocol-graphql)" />
        </Block>
      </Row>
      <Row label='variant="gql" — closeable + scrollable + addable (click × to close, + to add)' gap={0}>
        <Block style={{ padding: 0, overflow: 'hidden' }}>
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
        </Block>
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
      <Row label="Ditto Headers tab — flat rows · transparent inputs · + Add row at bottom" gap={0}>
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
      <Row label="Insert-between hover pattern — hover between rows to see ＋ Row" gap={0}>
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
      <Row label="With description column">
        <Block>
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
        </Block>
      </Row>

      {/* Pattern 4: masked value */}
      <Row label="Masked value — click 👁 to reveal">
        <Block>
          <KeyValueItemView
            enabled
            keyValue="Authorization"
            onKeyChange={() => {}}
            value="Bearer supersecrettoken_xyz123"
            onValueChange={() => {}}
            masked
            accentColor="var(--color-protocol-rest)"
          />
        </Block>
      </Row>
    </div>
  );
}

function EditorPanel() {
  const [json, setJson] = useState(SAMPLE_JSON);
  return (
    <div>
      <Row label="JSON editor (editable)" gap={0}>
        <Block style={{ padding: 0, overflow: 'hidden' }}>
          <EditorView value={json} onChange={setJson} language="json" height="200px" />
        </Block>
      </Row>
      <Row label="GraphQL (placeholder shown when empty)" gap={0}>
        <Block style={{ padding: 0, overflow: 'hidden' }}>
          <EditorView value="" language="graphql" height="120px" placeholder="query { ... }" />
        </Block>
      </Row>
      <Row label="readOnly=true" gap={0}>
        <Block style={{ padding: 0, overflow: 'hidden' }}>
          <EditorView value='{ "status": "read-only" }' language="json" height="80px" readOnly />
        </Block>
      </Row>
    </div>
  );
}

function PatternsPanel() {
  const [method, setMethod] = useState('GET');
  const [pillTab, setPillTab] = useState('params');

  return (
    <div>
      <Row label="REST URL bar assembly" gap={0}>
        <Block>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <SelectInputView options={METHOD_OPTIONS} value={method} onChange={setMethod} style={{ width: 90 }} accentColor="var(--color-protocol-rest)" />
            <TextInputView placeholder="https://api.example.com/users" style={{ flex: 1 }} accentColor="var(--color-protocol-rest)" />
            <IconButtonView icon={<SparkleIcon size={13} />} accentColor="var(--color-protocol-ai)" tooltip="AI Assist" />
            <DropDownButtonView label="Save" items={DROPDOWN_ITEMS} />
            <ButtonView variant="primary" accentColor="var(--color-protocol-rest)" iconLeft={<PlayIcon size={11} />}>Send</ButtonView>
          </div>
        </Block>
      </Row>

      <Row label="Request config tab bar + toolbar (underline tabs + icon buttons at same height)" gap={0}>
        <Block style={{ padding: 0, overflow: 'hidden' }}>
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
        </Block>
      </Row>

      <Row label="Protocol chip + method badge in collection tree row">
        <Block style={{ display: 'flex', flexDirection: 'column', gap: '1px', padding: '4px' }}>
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
        </Block>
      </Row>

      <Row label="Protocol sidebar nav (chip + label)">
        <Block style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '10px' }}>
          {PROTOCOLS.map(p => (
            <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--color-panel)', border: '1px solid var(--color-surface-border)', borderRadius: '5px', padding: '4px 10px', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-panel)'}
            >
              <ChipView label={p.badge} color={p.color} size="xs" />
              <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{p.label}</span>
            </div>
          ))}
        </Block>
      </Row>

      <Row label="Toolbar button group (icon + text mix)">
        <Block style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 12px', flexWrap: 'wrap' }}>
          <ButtonView variant="primary" iconLeft={<PlayIcon size={11} />} accentColor="var(--color-success)">Run</ButtonView>
          <ButtonView variant="secondary" iconLeft={<RefreshIcon size={11} />}>Reset</ButtonView>
          <div style={{ width: '1px', height: '20px', background: 'var(--color-surface-border)', margin: '0 4px' }} />
          <IconButtonView icon={<DownloadIcon size={13} />} tooltip="Import" />
          <IconButtonView icon={<ExportIcon size={13} />} tooltip="Export" />
          <IconButtonView icon={<CopyIcon size={13} />} tooltip="Copy" />
          <div style={{ width: '1px', height: '20px', background: 'var(--color-surface-border)', margin: '0 4px' }} />
          <DropDownButtonView label="Save" items={DROPDOWN_ITEMS} />
        </Block>
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
      <Row label="Full tab bar — protocol badges · dirty dot · close on hover · add tab">
        <Block style={{ padding: 0, overflow: 'hidden' }}>
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
        </Block>
      </Row>

      <Row label="Protocol-colored accents">
        <Block style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px' }}>
          {([
            { tabs: [{ id: 'g1', label: 'getUsers query',   type: 'request', protocol: 'graphql' }], accent: 'var(--color-protocol-graphql)' },
            { tabs: [{ id: 'w1', label: 'SSE /events',      type: 'request', protocol: 'websocket', rtProtocol: 'sse' }], accent: 'var(--color-protocol-sse)' },
            { tabs: [{ id: 'r1', label: 'Realtime.Chat',    type: 'request', protocol: 'grpc' }], accent: 'var(--color-protocol-grpc)' },
          ] as { tabs: TabBarTab[]; accent: string }[]).map(({ tabs: t, accent }) => (
            <TabBarView key={t[0].id} tabs={t} activeTabId={t[0].id} onTabClick={() => {}} accentColor={accent} height={32} />
          ))}
        </Block>
      </Row>

      <Row label="Features">
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

// ─── Panel map ────────────────────────────────────────────────────────────────

const PANELS: Record<CategoryId, { title: string; desc: string; content: React.ReactNode }> = {
  chips:             { title: 'ChipView',              desc: 'Colored badge chips for methods, protocols, status codes, filter tags.',            content: <ChipsPanel /> },
  textinput:         { title: 'TextInputView',          desc: 'Standard text input — sizes match ButtonView and SelectInputView exactly.',         content: <TextInputPanel /> },
  selectinput:       { title: 'SelectInputView',        desc: 'Portal dropdown with keyboard nav — replaces all StyledDropdown usages.',           content: <SelectInputPanel /> },
  button:            { title: 'ButtonView',             desc: 'Standard button — primary / secondary / ghost / danger — all sizes.',              content: <ButtonPanel /> },
  iconbutton:        { title: 'IconButtonView',         desc: 'Square icon-only buttons — ghost / filled — toggle support — all sizes.',          content: <IconButtonPanel /> },
  dropdownbutton:    { title: 'DropDownButtonView',     desc: 'Split button — primary action + chevron dropdown — Save as, Export as, etc.',      content: <DropDownButtonPanel /> },
  contextmenu:       { title: 'ContextMenuView',        desc: 'Recursive context menu with submenus — portal rendered — collection tree style.',   content: <ContextMenuPanel /> },
  tabs:              { title: 'TabView',                desc: 'pill · underline · gql (closeable+scrollable+addable) — all with accentColor.',     content: <TabsPanel /> },
  tabbar:            { title: 'TabBarView',             desc: 'VS Code-style protocol tab bar — store-free, drag-free, scroll arrows, dirty dot.', content: <TabBarPanel /> },
  keyvalue:          { title: 'KeyValueItemView',       desc: 'Single KV row — circle toggle · masked values · drag handle · delete on hover.',   content: <KeyValuePanel /> },
  editor:            { title: 'EditorView',             desc: 'Monaco editor wrapper — simplified props — JSON / GQL / XML / YAML etc.',           content: <EditorPanel /> },
  patterns:          { title: 'Real-world Patterns',    desc: 'How DUI components assemble into actual Daakia UI — URL bar · tabs · tree.',        content: <PatternsPanel /> },
  toggle:            { title: 'ToggleSwitchView',       desc: 'On/off toggle with sm/md/lg sizes, accent color, label positions, disabled state.', content: <ToggleSwitchPanel /> },
  checkbox:          { title: 'CheckboxView',           desc: 'Checkbox — checked / unchecked / indeterminate / disabled — with accent colors.',   content: <CheckboxPanel /> },
  modal:             { title: 'ModalView',              desc: 'Configurable modal — sm/md/lg/xl — never closes on backdrop click.',                content: <ModalPanel /> },
  loader:            { title: 'LoaderView',             desc: 'Loading states — spinner · dots · skeleton · pulse · progress-bar.',               content: <LoaderPanel /> },
  emptystate:        { title: 'EmptyStateView',         desc: 'Empty state placeholder with icon, title, message, and optional CTA button.',       content: <EmptyStatePanel /> },
  statusindicator:   { title: 'StatusIndicatorView',    desc: 'Connection status dot — idle · connecting · connected · disconnected · error.',     content: <StatusIndicatorPanel /> },
  infopopup:         { title: 'InfoPopupView',          desc: 'Help popup anchored near a ? icon — title · items · footer · wiki link.',          content: <InfoPopupPanel /> },
  resizablepanel:    { title: 'ResizablePanelView',     desc: 'Resizable split panel — horizontal or vertical — double-click to reset.',           content: <ResizablePanelPanel /> },
  dottedcard:        { title: 'DottedCardView',         desc: 'Dotted-border expandable card — useful for optional config sections.',              content: <DottedCardPanel /> },
  coloredtext:       { title: 'ColoredTextView',        desc: 'Token-colored text — HTTP status lines, gRPC codes, SOAP faults.',                  content: <ColoredTextPanel /> },
  statscard:         { title: 'StatsCardView',          desc: 'Colorful metric card — value, unit, trend (up/down/neutral), subValue.',            content: <StatsCardPanel /> },
  datatable:         { title: 'DataTableView',          desc: 'Generic sortable table — columns, striped rows, empty state, row click.',           content: <DataTablePanel /> },
  codeblock:         { title: 'CodeBlockView',          desc: 'Read-only code block — language label, copy button, optional line numbers.',        content: <CodeBlockPanel /> },
  aibutton:          { title: 'AIButtonView',           desc: 'AI action button — generate · fuzz · explain · fix · ask · suggest — loading state.', content: <AIButtonPanel /> },
  sidenav:           { title: 'SideNavView',            desc: 'Collapsible left sidebar nav with nested items and icon-only collapse mode.',        content: <SideNavPanel /> },
  settingsnav:       { title: 'SettingsNavView',        desc: 'Settings-style grouped nav with badges, descriptions, active state.',               content: <SettingsNavPanel /> },
  themecardselector: { title: 'ThemeCardSelectorView',  desc: 'Card-based theme picker with color swatch previews and checkmark selection.',        content: <ThemeCardSelectorPanel /> },
  featurecategory:   { title: 'FeatureCategoryView',    desc: 'Expandable feature category with toggle switches and enabled count badge.',          content: <FeatureCategoryPanel /> },
  taginput:          { title: 'TagInputView',           desc: 'Multi-value tag input — Enter or comma to add, Backspace to remove.',               content: <TagInputPanel /> },
  bottompanel:       { title: 'BottomPanelView',        desc: 'DevTools-style resizable bottom panel with tab bar and collapse toggle.',            content: <BottomPanelPanel /> },
  toast:             { title: 'ToastView',              desc: 'Toast notification stack — success · error · warning · info — auto-dismiss.',        content: <ToastPanel /> },
  promptcard:        { title: 'PromptCardView',         desc: 'Prompt library card — title, preview, tags, protocol badge, Use/Copy/Edit/Delete.',  content: <PromptCardPanel /> },
  iconsgallery:      { title: 'Icons Gallery',          desc: 'All Daakia icons — searchable by name — click to copy icon name.',                   content: <IconsGalleryPanel /> },
  themeconfig:       { title: 'Theme Customization',    desc: 'Export / upload YAML theme files — all 63 CSS color vars, live hot-swap, no rebuild.', content: <ThemeCustomizationPanel /> },
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
  const [search, setSearch] = useState('');
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

  const q = search.toLowerCase();
  const filteredGroups = SIDEBAR_GROUPS
    .map(g => ({ ...g, items: g.items.filter(i => i.label.toLowerCase().includes(q)) }))
    .filter(g => g.items.length > 0);

  const SIDEBAR_W = sidebarOpen ? 232 : 52;

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
          <ChipView label="35 components" color="var(--color-primary)" size="xs" />
        </div>
      </div>

      {/* ── Body: sidebar + content ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Sidebar ── */}
        <div style={{
          width: SIDEBAR_W, flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          background: 'var(--color-surface)',
          borderRight: '1px solid var(--color-surface-border)',
          overflow: 'hidden',
          transition: 'width 200ms ease',
        }}>

          {/* Search (only when expanded) */}
          {sidebarOpen && (
            <div style={{ padding: '10px 10px 8px', flexShrink: 0 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                height: 28, padding: '0 8px',
                borderRadius: 6,
                border: '1px solid color-mix(in srgb, var(--color-text-primary) 12%, transparent)',
                background: 'color-mix(in srgb, var(--color-text-primary) 4%, transparent)',
              }}>
                <SearchIcon size={11} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search components…"
                  style={{
                    flex: 1, border: 'none', outline: 'none', background: 'transparent',
                    fontSize: 11, color: 'var(--color-text-primary)', fontFamily: 'inherit',
                  }}
                />
                {search && (
                  <button type="button" onClick={() => setSearch('')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 0, display: 'flex' }}>
                    <span style={{ fontSize: 10 }}>✕</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Nav groups */}
          <div style={{ flex: 1, overflowY: 'auto', padding: sidebarOpen ? '4px 6px 16px' : '4px 4px 16px' }}>
            {filteredGroups.map(group => (
              <div key={group.title} style={{ marginBottom: sidebarOpen ? 4 : 12 }}>
                {sidebarOpen && (
                  <div style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                    textTransform: 'uppercase', color: 'var(--color-text-muted)',
                    padding: '10px 8px 4px',
                  }}>
                    {group.title}
                  </div>
                )}
                {group.items.map(item => {
                  const isActive = item.id === activeCategory;
                  return (
                    <div
                      key={item.id}
                      title={!sidebarOpen ? item.label : undefined}
                      onClick={() => setActiveCategory(item.id)}
                      style={{
                        display: 'flex', alignItems: 'center',
                        gap: sidebarOpen ? 8 : 0,
                        justifyContent: sidebarOpen ? 'flex-start' : 'center',
                        height: 32, borderRadius: 6,
                        padding: sidebarOpen ? '0 8px' : '0',
                        cursor: 'pointer',
                        background: isActive
                          ? 'color-mix(in srgb, var(--color-primary) 15%, var(--color-item-hover-bg))'
                          : 'transparent',
                        transition: 'background 100ms',
                      }}
                      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)'; }}
                      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      <span style={{ color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)', flexShrink: 0, display: 'flex' }}>
                        {item.icon}
                      </span>
                      {sidebarOpen && (
                        <span style={{
                          fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          fontWeight: isActive ? 600 : 400,
                          color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                        }}>
                          {item.label}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            {filteredGroups.length === 0 && (
              <div style={{ padding: '20px 8px', fontSize: 11, color: 'var(--color-text-muted)', textAlign: 'center' }}>
                No matches for "{search}"
              </div>
            )}
          </div>
        </div>

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

            {/* Section heading */}
            <div style={{ marginBottom: 32, paddingBottom: 20, borderBottom: '1px solid var(--color-surface-border)' }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>
                {panel.title}
              </h1>
              <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.6, maxWidth: 640 }}>
                {panel.desc}
              </p>
            </div>

            {/* Component demos */}
            {panel.content}
          </div>
        </div>
      </div>
    </div>
  );
}
