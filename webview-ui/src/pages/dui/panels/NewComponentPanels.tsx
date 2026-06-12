import { useState } from 'react';
import {
  ToggleSwitchView, CheckboxView, ModalView, LoaderView, EmptyStateView, ButtonView,
  StatusIndicatorView, InfoPopupView, ResizablePanelView, SplitPanelView, DottedCardView,
  ColoredTextView, StatsCardView, DataTableView, CodeBlockView, AIButtonView,
  SideNavView, SettingsNavView, ThemeCardSelectorView, FeatureCategoryView,
  TagInputView, BottomPanelView, ToastView, PromptCardView,
  PromptLibraryListView, PromptLibraryEditorView, EditorView,
  SearchInputView, DurationInputView, TabView,
  HighlightedInputView, KeyValueTableView, HiddenKeyValueItemView,
  MergedInputView, MergeDivider,
  HudView,
  CollapsibleSectionView,
  JsonTreeView,
  ExpandableLogEntryView,
  CopyButtonView,
  MarkdownView,
  FormDataTableView,
  YamlKeyChip,
  LiveColorCustomizer,
  SpacerView,
} from '../../../dui';
import type { HudItem, FormDataRow, LiveColorVar } from '../../../dui';
import type { MergedInputSegment } from '../../../dui';
import type {
  ContextMenuItem, PromptLibrarySection, PromptLibraryEditorTab,
  KeyValueTableRow, PinnedKeyValueRow, TabItem,
} from '../../../dui';
import {
  SearchIcon, SettingsIcon, ServerIcon, LayersIcon, RestApiIcon,
  GraphQLIcon, SparkleIcon, TerminalIcon, OutputIcon, NetworkIcon,
  ClockIcon, GlobeIcon, CodeIcon, FolderIcon, DocumentIcon, CloseIcon,
  PlayIcon, SaveIcon, DownloadIcon, TrashIcon, CopyIcon, CheckIcon,
  SystemIcon, UserPromptIcon, UploadIcon, CodeBracketsIcon,
  StepOverIcon, StepIntoIcon, StepOutIcon, RestartIcon, StopSquareIcon, MuteBreakpointsIcon, RefreshIcon,
  ArrowUpRightIcon, ArrowDownLeftIcon, InfoCircleIcon, ChevronRightIcon,
} from '../../../icons';

// ─── Layout helpers (local) ───────────────────────────────────────────────────

function Row({ label, children, gap = 10, align, code }: { label: string; children: React.ReactNode; gap?: number; code?: string; align?: string }) {
  const [showCode, setShowCode] = useState(false);
  return (
    <div style={{
      marginBottom: 16,
      border: '1px solid var(--color-surface-border)',
      borderRadius: 10,
      background: 'var(--color-surface)',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 16px 8px',
        fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
        borderBottom: '1px solid color-mix(in srgb, var(--color-surface-border) 60%, transparent)',
      }}>
        {label}
      </div>
      <div style={{ padding: '16px', display: 'flex', alignItems: align ?? 'center', flexWrap: 'wrap', gap }}>
        {children}
      </div>
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
              showCopyButton
              style={{ borderRadius: 0, borderTop: '1px solid var(--color-surface-border)' }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Block({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)',
      borderRadius: '8px', padding: '16px', ...style,
    }}>
      {children}
    </div>
  );
}

// ─── D1.21 — ToggleSwitchView ────────────────────────────────────────────────

export function ToggleSwitchPanel() {
  const [v1, setV1] = useState(true);
  const [v2, setV2] = useState(false);
  const [v3, setV3] = useState(true);
  return (
    <div>
      <Row label="Sizes sm / md / lg" code={`<ToggleSwitchView checked={v} onChange={setV} size="sm" label="Small" />\n<ToggleSwitchView checked={v} onChange={setV} size="md" label="Medium" />\n<ToggleSwitchView checked={v} onChange={setV} size="lg" label="Large" />`}>
        <ToggleSwitchView checked={v1} onChange={setV1} size="sm" label="Small" />
        <ToggleSwitchView checked={v1} onChange={setV1} size="md" label="Medium" />
        <ToggleSwitchView checked={v1} onChange={setV1} size="lg" label="Large" />
      </Row>
      <Row label="On / Off state" code={`<ToggleSwitchView checked={true}  onChange={setV} label="Enabled" />\n<ToggleSwitchView checked={false} onChange={setV} label="Disabled" />`}>
        <ToggleSwitchView checked={true} onChange={() => {}} label="Enabled" />
        <ToggleSwitchView checked={false} onChange={() => {}} label="Disabled" />
      </Row>
      <Row label="Disabled (dashed border)" code={`<ToggleSwitchView checked={false} onChange={() => {}} disabled label="Disabled off" />\n<ToggleSwitchView checked={true}  onChange={() => {}} disabled label="Disabled on" />`}>
        <ToggleSwitchView checked={false} onChange={() => {}} disabled label="Disabled off" />
        <ToggleSwitchView checked={true} onChange={() => {}} disabled label="Disabled on" />
      </Row>
      <Row label="Protocol accent colors" code={`<ToggleSwitchView checked={v} onChange={setV} accentColor="var(--color-protocol-rest)" />\n<ToggleSwitchView checked={v} onChange={setV} accentColor="var(--color-protocol-graphql)" />\n<ToggleSwitchView checked={v} onChange={setV} accentColor="var(--color-success)" />`}>
        {(['var(--color-protocol-rest)', 'var(--color-protocol-graphql)', 'var(--color-protocol-websocket)', 'var(--color-success)'] as const).map(color => (
          <ToggleSwitchView key={color} checked={v1} onChange={setV1} accentColor={color} />
        ))}
      </Row>
      <Row label="Label positions left / right" code={`<ToggleSwitchView checked={v} onChange={setV} label="Left label"  labelPosition="left" />\n<ToggleSwitchView checked={v} onChange={setV} label="Right label" labelPosition="right" />`}>
        <ToggleSwitchView checked={v2} onChange={setV2} label="Left label" labelPosition="left" />
        <ToggleSwitchView checked={v3} onChange={setV3} label="Right label" labelPosition="right" />
      </Row>
    </div>
  );
}

// ─── D1.22 — CheckboxView ────────────────────────────────────────────────────

export function CheckboxPanel() {
  const [c1, setC1] = useState(true);
  const [c2, setC2] = useState(false);
  const [pkce, setPkce] = useState(false);
  return (
    <div>
      <Row label="States checked / unchecked / indeterminate / disabled" code={`<CheckboxView checked={true}  onChange={setChecked} label="Checked" />\n<CheckboxView checked={false} onChange={setChecked} label="Unchecked" />\n<CheckboxView checked={false} indeterminate onChange={setChecked} label="Indeterminate" />\n<CheckboxView checked={false} onChange={() => {}} disabled label="Disabled" />`}>
        <CheckboxView checked={true}  onChange={() => {}} label="Checked" />
        <CheckboxView checked={false} onChange={() => {}} label="Unchecked" />
        <CheckboxView checked={false} indeterminate onChange={() => {}} label="Indeterminate" />
        <CheckboxView checked={false} onChange={() => {}} disabled label="Disabled" />
        <CheckboxView checked={true}  onChange={() => {}} disabled label="Disabled checked" />
      </Row>
      <Row label="Sizes xxs / xs / sm / md / lg — label font steps down one size for compact look" code={`<CheckboxView checked={checked} onChange={setChecked} size="xs"  label="Extra small" />\n<CheckboxView checked={checked} onChange={setChecked} size="sm"  label="Small" />\n<CheckboxView checked={checked} onChange={setChecked} size="md"  label="Medium" />\n<CheckboxView checked={checked} onChange={setChecked} size="lg"  label="Large" />`}>
        <CheckboxView checked={c1} onChange={setC1} size="xxs" label="XXS" />
        <CheckboxView checked={c1} onChange={setC1} size="xs"  label="Extra small" />
        <CheckboxView checked={c1} onChange={setC1} size="sm"  label="Small" />
        <CheckboxView checked={c1} onChange={setC1} size="md"  label="Medium" />
        <CheckboxView checked={c1} onChange={setC1} size="lg"  label="Large" />
      </Row>
      <Row label="Form field usage — checkbox inline in a settings row (like Auth → Use PKCE)" code={`// Inline in a label-row pattern\n<div style={{ display:'flex', alignItems:'center', gap:8 }}>\n  <span style={{ fontSize:12, color:'var(--color-text-muted)', width:120 }}>Use PKCE</span>\n  <CheckboxView checked={pkce} onChange={setPkce} size="md" label="Enable PKCE (S256)" />\n</div>`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 4px' }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)', width: 120, flexShrink: 0 }}>Use PKCE</span>
          <CheckboxView checked={pkce} onChange={setPkce} size="md" label="Enable PKCE (S256)" />
        </div>
      </Row>
      <Row label="Protocol accent colors" code={`<CheckboxView checked={v} onChange={setV} accentColor="var(--color-protocol-rest)"    label="REST" />\n<CheckboxView checked={v} onChange={setV} accentColor="var(--color-protocol-graphql)" label="GQL" />\n<CheckboxView checked={v} onChange={setV} accentColor="var(--color-success)"          label="OK" />\n<CheckboxView checked={v} onChange={setV} accentColor="var(--color-warning)"          label="Warn" />`}>
        {(['var(--color-protocol-rest)', 'var(--color-protocol-graphql)', 'var(--color-success)', 'var(--color-warning)'] as const).map(color => (
          <CheckboxView key={color} checked={c2} onChange={setC2} accentColor={color} label="Check me" />
        ))}
      </Row>
    </div>
  );
}

// ─── D1.23 — ModalView ───────────────────────────────────────────────────────

export function ModalPanel() {
  const [openSm, setOpenSm] = useState(false);
  const [openMd, setOpenMd] = useState(false);
  const [openLg, setOpenLg] = useState(false);
  return (
    <div>
      <Row label="Sizes sm / md / lg — click X or Cancel to close (backdrop never closes)" code={`<ModalView\n  open={open}\n  onClose={() => setOpen(false)}\n  title="Confirm Delete"\n  size="sm"\n  footerRight={<ButtonView label="Confirm" variant="primary" onClick={confirm} />}\n>\n  Are you sure?\n</ModalView>`}>
        <Block style={{ display: 'flex', gap: '10px', padding: '16px' }}>
          <button type="button" onClick={() => setOpenSm(true)} style={{ padding: '6px 12px', borderRadius: 5, border: '1px solid var(--color-surface-border)', background: 'var(--color-surface)', cursor: 'pointer', color: 'var(--color-text-primary)', fontSize: '12px' }}>Open SM modal</button>
          <button type="button" onClick={() => setOpenMd(true)} style={{ padding: '6px 12px', borderRadius: 5, border: '1px solid var(--color-surface-border)', background: 'var(--color-surface)', cursor: 'pointer', color: 'var(--color-text-primary)', fontSize: '12px' }}>Open MD modal</button>
          <button type="button" onClick={() => setOpenLg(true)} style={{ padding: '6px 12px', borderRadius: 5, border: '1px solid var(--color-surface-border)', background: 'var(--color-surface)', cursor: 'pointer', color: 'var(--color-text-primary)', fontSize: '12px' }}>Open LG modal</button>
        </Block>
      </Row>
      <ModalView
        open={openSm} onClose={() => setOpenSm(false)} size="sm" title="Small Modal"
        footerRight={<><ButtonView label="Cancel" onClick={() => setOpenSm(false)} /><ButtonView label="Confirm" variant="primary" onClick={() => setOpenSm(false)} /></>}
      >
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-secondary)' }}>This is a small modal (420px wide). Only the X button and footer buttons close it — backdrop click does nothing.</p>
      </ModalView>
      <ModalView
        open={openMd} onClose={() => setOpenMd(false)} size="md" title="Medium Modal"
        footerRight={<><ButtonView label="Cancel" onClick={() => setOpenMd(false)} /><ButtonView label="Save changes" variant="primary" onClick={() => setOpenMd(false)} /></>}
      >
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-secondary)' }}>Medium modal (560px). Press Escape or click X to close.</p>
      </ModalView>
      <ModalView
        open={openLg} onClose={() => setOpenLg(false)} size="lg" title="Large Modal — Request Details"
        footerLeft={<ButtonView label="Delete" variant="danger" onClick={() => setOpenLg(false)} />}
        footerRight={<><ButtonView label="Close" onClick={() => setOpenLg(false)} /><ButtonView label="Save" variant="primary" onClick={() => setOpenLg(false)} /></>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-secondary)' }}>Large modal (720px) with left + right footer buttons. Useful for request detail editors, schema viewers, config dialogs.</p>
          <div style={{ height: 2, background: 'var(--color-surface-border)', borderRadius: 1 }} />
          <p style={{ margin: 0, fontSize: '11px', color: 'var(--color-text-muted)' }}>Body content scrolls independently if taller than the modal height.</p>
        </div>
      </ModalView>
    </div>
  );
}

// ─── D1.24 — LoaderView ──────────────────────────────────────────────────────

export function LoaderPanel() {
  const [progress, setProgress] = useState(45);
  return (
    <div>
      <Row label="Variants — spinner · dots · skeleton · pulse · progress-bar" code={`<LoaderView variant="spinner"  label="Loading…" />\n<LoaderView variant="dots" />\n<LoaderView variant="skeleton" width={200} height={14} />\n<LoaderView variant="pulse" />`}>
        <Block style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap', padding: '24px' }}>
          <LoaderView variant="spinner" label="Spinner" />
          <LoaderView variant="dots" label="Dots" />
          <LoaderView variant="skeleton" />
          <LoaderView variant="pulse" />
        </Block>
      </Row>
      <Row label="Progress bar (drag slider)" code={`<LoaderView variant="progress-bar" progress={progress} label={\`\${progress}%\`} />`}>
        <Block style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px', width: '100%' }}>
          <LoaderView variant="progress-bar" progress={progress} label={`${progress}%`} />
          <input type="range" min={0} max={100} value={progress} onChange={e => setProgress(+e.target.value)} style={{ width: '100%' }} />
        </Block>
      </Row>
      <Row label="Sizes sm / md / lg" code={`<LoaderView variant="spinner" size="sm" />\n<LoaderView variant="spinner" size="md" />\n<LoaderView variant="spinner" size="lg" />`}>
        <Block style={{ display: 'flex', gap: '20px', alignItems: 'center', padding: '20px' }}>
          <LoaderView variant="spinner" size="sm" />
          <LoaderView variant="spinner" size="md" />
          <LoaderView variant="spinner" size="lg" />
        </Block>
      </Row>
      <Row label="Protocol accent colors" code={`<LoaderView variant="spinner" accentColor="var(--color-protocol-rest)" />\n<LoaderView variant="spinner" accentColor="var(--color-protocol-graphql)" />`}>
        <Block style={{ display: 'flex', gap: '20px', alignItems: 'center', padding: '20px', flexWrap: 'wrap' }}>
          {['var(--color-protocol-rest)', 'var(--color-protocol-graphql)', 'var(--color-protocol-websocket)', 'var(--color-protocol-grpc)', 'var(--color-protocol-ai)'].map(c => (
            <LoaderView key={c} variant="spinner" accentColor={c} size="md" />
          ))}
        </Block>
      </Row>
    </div>
  );
}

// ─── D1.25 — EmptyStateView ──────────────────────────────────────────────────

export function EmptyStatePanel() {
  return (
    <div>
      <Row label="Standard empty state with action" code={`<EmptyStateView\n  icon={<FolderIcon size={32} />}\n  title="No collections yet"\n  message="Create your first collection to get started."\n  action={{ label: '+ New Collection', onClick: create }}\n/>`}>
        <Block style={{ width: '100%' }}>
          <EmptyStateView
            icon={<FolderIcon size={32} />}
            title="No collections yet"
            message="Create your first collection to organize your API requests."
            action={{ label: '+ New Collection', onClick: () => alert('New Collection') }}
          />
        </Block>
      </Row>
      <Row label="Compact (for panels/drawers)" code={`<EmptyStateView\n  icon={<DocumentIcon size={20} />}\n  title="No requests"\n  message="Hit Send to get a response"\n  compact\n/>`}>
        <Block style={{ width: '100%' }}>
          <EmptyStateView
            icon={<DocumentIcon size={20} />}
            title="No requests"
            message="Hit Send to get a response"
            compact
          />
        </Block>
      </Row>
      <Row label="Protocol color reference" code={`// Use these CSS variables for accentColor / color props throughout Daakia\n// var(--color-protocol-rest)\n// var(--color-protocol-graphql)\n// var(--color-protocol-websocket)\n// var(--color-protocol-grpc)\n// var(--color-protocol-soap)\n// var(--color-protocol-ai)\n// var(--color-protocol-mcp)`}>
        <Block style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', padding: '16px' }}>
          {[
            { label: 'REST',      cssVar: '--color-protocol-rest'      },
            { label: 'GraphQL',   cssVar: '--color-protocol-graphql'   },
            { label: 'WebSocket', cssVar: '--color-protocol-websocket'  },
            { label: 'SSE',       cssVar: '--color-protocol-sse'       },
            { label: 'Socket.IO', cssVar: '--color-protocol-socketio'  },
            { label: 'MQTT',      cssVar: '--color-protocol-mqtt'      },
            { label: 'gRPC',      cssVar: '--color-protocol-grpc'      },
            { label: 'SOAP',      cssVar: '--color-protocol-soap'      },
            { label: 'AI',        cssVar: '--color-protocol-ai'        },
            { label: 'MCP',       cssVar: '--color-protocol-mcp'       },
          ].map(({ label, cssVar }) => (
            <div key={cssVar} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', width: 72 }}>
              <div style={{
                width: 40, height: 40, borderRadius: '8px',
                background: `var(${cssVar})`,
                border: '1px solid color-mix(in srgb, var(--color-text-primary) 10%, transparent)',
                flexShrink: 0,
              }} />
              <span style={{ fontSize: '10px', color: 'var(--color-text-primary)', fontWeight: 600, textAlign: 'center' }}>{label}</span>
              <span style={{ fontSize: '9px', color: 'var(--color-text-muted)', fontFamily: 'monospace', textAlign: 'center', wordBreak: 'break-all' }}>{cssVar}</span>
            </div>
          ))}
        </Block>
      </Row>
    </div>
  );
}

// ─── D1.26 — StatusIndicatorView ─────────────────────────────────────────────

export function StatusIndicatorPanel() {
  return (
    <div>
      <Row label="All states" code={`<StatusIndicatorView status="idle"         label="Idle" />\n<StatusIndicatorView status="connecting"   label="Connecting…" />\n<StatusIndicatorView status="connected"    label="Connected" />\n<StatusIndicatorView status="disconnected" label="Disconnected" />\n<StatusIndicatorView status="error"        label="Error" />`}>
        <Block style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center', padding: '20px' }}>
          <StatusIndicatorView status="idle"         label="Idle" />
          <StatusIndicatorView status="connecting"   label="Connecting…" />
          <StatusIndicatorView status="connected"    label="Connected" />
          <StatusIndicatorView status="disconnected" label="Disconnected" />
          <StatusIndicatorView status="error"        label="Error" />
        </Block>
      </Row>
      <Row label="With subtext" code={`<StatusIndicatorView status="connected" label="WebSocket" subtext="ws://localhost:8080" />\n<StatusIndicatorView status="error"     label="gRPC"      subtext="Connection refused" />`}>
        <Block style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', padding: '16px' }}>
          <StatusIndicatorView status="connected"  label="WebSocket" subtext="ws://localhost:8080" />
          <StatusIndicatorView status="error"      label="gRPC"      subtext="Connection refused" />
          <StatusIndicatorView status="connecting" label="MQTT"      subtext="mqtt://broker:1883" />
        </Block>
      </Row>
      <Row label="Protocol accent" code={`<StatusIndicatorView status="connected" label="REST" accentColor="var(--color-protocol-rest)" />\n<StatusIndicatorView status="connected" label="GQL"  accentColor="var(--color-protocol-graphql)" />`}>
        <Block style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', padding: '16px' }}>
          <StatusIndicatorView status="connected" label="REST" accentColor="var(--color-protocol-rest)" />
          <StatusIndicatorView status="connected" label="GQL"  accentColor="var(--color-protocol-graphql)" />
          <StatusIndicatorView status="connected" label="WS"   accentColor="var(--color-protocol-websocket)" />
        </Block>
      </Row>
    </div>
  );
}

// ─── D1.27 — InfoPopupView ───────────────────────────────────────────────────

export function InfoPopupPanel() {
  const [open1, setOpen1] = useState(false);
  const [anchor1, setAnchor1] = useState<HTMLElement | null>(null);
  return (
    <div>
      <Row label="Click ? to open info popup" code={`<InfoPopupView\n  open={open}\n  onClose={() => setOpen(false)}\n  anchorEl={anchorEl}\n  title="Rate Limit"\n  description="Max requests per second."\n  items={[\n    { code: 'rateLimit',  description: 'Max requests/sec' },\n    { code: 'statusCode', description: 'HTTP status when limited (429)' },\n  ]}\n  footer="Applies per-client IP."\n  wikiHref="#"\n/>`}>
        <Block style={{ display: 'flex', gap: '12px', padding: '16px', alignItems: 'center' }}>
          <button
            type="button"
            ref={el => setAnchor1(el)}
            onClick={() => setOpen1(v => !v)}
            style={{ width: 20, height: 20, borderRadius: '50%', border: '1px solid var(--color-surface-border)', background: 'var(--color-surface)', cursor: 'pointer', fontSize: '11px', color: 'var(--color-text-muted)' }}
          >?</button>
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Hover for the Rate Limit info popup</span>
        </Block>
      </Row>
      <InfoPopupView
        open={open1}
        onClose={() => setOpen1(false)}
        anchorEl={anchor1}
        title="Rate Limit"
        description="Configure how many requests per second this mock endpoint should allow."
        items={[
          { code: 'rateLimit', description: 'Max requests per second' },
          { code: 'burstSize', description: 'Burst allowance above the limit' },
          { code: 'statusCode', description: 'HTTP status returned when limited (default 429)' },
        ]}
        footer="Rate limiting applies per-client IP address."
        wikiHref="#"
      />
    </div>
  );
}

// ─── D1.28 — SplitPanelView (formerly ResizablePanelView) ────────────────────

// ─── SplitPanelPanel helpers ──────────────────────────────────────────────────

function RequestPane() {
  const [activeTab, setActiveTab] = useState('params');
  const tabs = ['Params', 'Headers', 'Body', 'Auth', 'Scripts'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-panel)' }}>
      {/* URL bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px 8px',
        borderBottom: '1px solid var(--color-surface-border)',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: 28, padding: '0 10px', borderRadius: 5,
          background: 'color-mix(in srgb, var(--color-success) 15%, transparent)',
          color: 'var(--color-success)', fontSize: 11, fontWeight: 800, letterSpacing: '0.04em',
          flexShrink: 0,
        }}>GET</div>
        <div style={{
          flex: 1, height: 28, background: 'var(--color-input-bg)',
          border: '1px solid var(--color-input-border)', borderRadius: 5,
          display: 'flex', alignItems: 'center', padding: '0 10px',
          fontSize: 12, color: 'var(--color-text-muted)',
        }}>
          https://api.example.com/users
        </div>
        <div style={{
          height: 28, padding: '0 14px', borderRadius: 5, background: 'var(--color-primary)',
          color: 'white', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center',
          cursor: 'pointer', flexShrink: 0,
        }}>Send</div>
      </div>

      {/* Sub-tabs */}
      <div style={{
        display: 'flex', gap: 0, padding: '0 12px', flexShrink: 0,
        borderBottom: '1px solid var(--color-surface-border)',
      }}>
        {tabs.map(t => {
          const id = t.toLowerCase();
          const isActive = activeTab === id;
          return (
            <button key={t} type="button" onClick={() => setActiveTab(id)} style={{
              padding: '7px 10px', fontSize: 12, fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
              background: 'transparent', border: 'none', cursor: 'pointer',
              borderBottom: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
              marginBottom: -1, fontFamily: 'inherit',
            }}>{t}</button>
          );
        })}
      </div>

      {/* Params content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {activeTab === 'params' && (
          <div>
            {[
              { key: 'limit', value: '10', on: true },
              { key: 'offset', value: '0', on: true },
              { key: 'sort',  value: 'created_at', on: false },
            ].map((row, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4,
                padding: '5px 8px', borderRadius: 5,
                background: row.on ? 'transparent' : 'color-mix(in srgb, var(--color-text-muted) 4%, transparent)',
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: row.on ? 'var(--color-success)' : 'var(--color-surface-border)', flexShrink: 0 }} />
                <span style={{ width: 80, fontSize: 11, color: row.on ? 'var(--color-text-primary)' : 'var(--color-text-muted)', fontWeight: 500 }}>{row.key}</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>=</span>
                <span style={{ flex: 1, fontSize: 11, color: row.on ? 'var(--color-info)' : 'var(--color-text-muted)' }}>{row.value}</span>
              </div>
            ))}
          </div>
        )}
        {activeTab === 'headers' && (
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            {[
              { k: 'Content-Type', v: 'application/json' },
              { k: 'Authorization', v: 'Bearer {{token}}' },
              { k: 'Accept', v: '*/*' },
            ].map((h, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4, padding: '4px 8px' }}>
                <span style={{ width: 120, fontWeight: 600, color: 'var(--color-text-secondary)' }}>{h.k}</span>
                <span style={{ color: 'var(--color-text-muted)' }}>{h.v}</span>
              </div>
            ))}
          </div>
        )}
        {(activeTab !== 'params' && activeTab !== 'headers') && (
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', paddingTop: 8 }}>No content for {activeTab}</div>
        )}
      </div>
    </div>
  );
}

function ResponsePane() {
  const [activeTab, setActiveTab] = useState('body');
  const tabs = ['Body', 'Headers', 'Cookies', 'Timeline'];
  const json = `{
  "data": [
    { "id": 1, "name": "Alice Chen",  "role": "admin",  "active": true },
    { "id": 2, "name": "Bob Tanaka",  "role": "editor", "active": true },
    { "id": 3, "name": "Carol Davis", "role": "viewer", "active": false }
  ],
  "meta": { "total": 3, "limit": 10, "offset": 0 }
}`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-panel)' }}>
      {/* Status bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px 8px',
        borderBottom: '1px solid var(--color-surface-border)', flexShrink: 0,
      }}>
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: 22, padding: '0 8px', borderRadius: 5,
          background: 'color-mix(in srgb, var(--color-success) 15%, transparent)',
          color: 'var(--color-success)', fontSize: 11, fontWeight: 700,
        }}>200 OK</span>
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>142 ms</span>
        <div style={{ width: 1, height: 12, background: 'var(--color-surface-border)' }} />
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>1.2 KB</span>
      </div>

      {/* Sub-tabs */}
      <div style={{
        display: 'flex', gap: 0, padding: '0 12px', flexShrink: 0,
        borderBottom: '1px solid var(--color-surface-border)',
      }}>
        {tabs.map(t => {
          const id = t.toLowerCase();
          const isActive = activeTab === id;
          return (
            <button key={t} type="button" onClick={() => setActiveTab(id)} style={{
              padding: '7px 10px', fontSize: 12, fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--color-success)' : 'var(--color-text-muted)',
              background: 'transparent', border: 'none', cursor: 'pointer',
              borderBottom: isActive ? '2px solid var(--color-success)' : '2px solid transparent',
              marginBottom: -1, fontFamily: 'inherit',
            }}>{t}</button>
          );
        })}
      </div>

      {/* Response body */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {activeTab === 'body' && (
          <pre style={{
            margin: 0, fontSize: 11, lineHeight: 1.6,
            color: 'var(--color-text-secondary)',
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            whiteSpace: 'pre-wrap',
          }}>{json}</pre>
        )}
        {activeTab !== 'body' && (
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', paddingTop: 8 }}>No content for {activeTab}</div>
        )}
      </div>
    </div>
  );
}

export function SplitPanelPanel() {
  return (
    <div>
      <Row label="Horizontal split — request / response (drag pill, double-click to reset)" gap={0} code={`<SplitPanelView\n  direction="horizontal"\n  defaultSplit={45}      // % for first panel\n  minFirst={200}         // px minimum\n  minSecond={200}\n  accentColor="var(--color-protocol-rest)"\n  pillTooltip="Drag to resize\\nDouble-click to reset  Alt+/"\n  first={<RequestPanel />}\n  second={<ResponsePanel />}\n/>`}>
        <Block style={{ padding: 0, overflow: 'hidden', width: '100%' }}>
          <SplitPanelView
            direction="horizontal"
            defaultSplit={45}
            minFirst={200}
            minSecond={200}
            style={{ height: 320 }}
            accentColor="var(--color-protocol-rest)"
            pillTooltip="Drag to resize&#10;Double-click to reset  Alt+/"
            first={<RequestPane />}
            second={<ResponsePane />}
          />
        </Block>
      </Row>
      <Row label="Vertical split — editor top / console bottom" gap={0} code={`<SplitPanelView\n  direction="vertical"\n  defaultSplit={60}\n  minFirst={80}\n  minSecond={60}\n  pillTooltip="Drag to resize\\nDouble-click to reset"\n  first={<EditorPanel />}\n  second={<ConsolePanel />}\n/>`}>
        <Block style={{ padding: 0, overflow: 'hidden', width: '100%' }}>
          <SplitPanelView
            direction="vertical"
            defaultSplit={60}
            minFirst={80}
            minSecond={60}
            style={{ height: 260 }}
            pillTooltip="Drag to resize · Double-click to reset"
            first={
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--color-panel)' }}>
                <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-surface-border)', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', flexShrink: 0 }}>REQUEST BODY</div>
                <pre style={{ flex: 1, margin: 0, padding: '10px 12px', fontSize: 11, lineHeight: 1.6, color: 'var(--color-text-secondary)', fontFamily: 'Menlo, Monaco, "Courier New", monospace', overflow: 'auto' }}>{`{\n  "name": "Alice",\n  "email": "alice@example.com"\n}`}</pre>
              </div>
            }
            second={
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'color-mix(in srgb, var(--color-surface) 60%, var(--color-panel))' }}>
                <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-surface-border)', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', flexShrink: 0 }}>CONSOLE</div>
                <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
                  {[
                    { type: 'info',  text: 'Request started — POST /users' },
                    { type: 'ok',    text: 'Response 201 Created in 88ms' },
                    { type: 'warn',  text: 'Rate limit: 98/100 remaining' },
                  ].map((line, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4, fontSize: 11, fontFamily: 'Menlo, Monaco, monospace' }}>
                      <span style={{ color: line.type === 'ok' ? 'var(--color-success)' : line.type === 'warn' ? 'var(--color-warning)' : 'var(--color-info)', flexShrink: 0 }}>
                        {line.type === 'ok' ? '✓' : line.type === 'warn' ? '⚠' : 'i'}
                      </span>
                      <span style={{ color: 'var(--color-text-muted)' }}>{line.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            }
          />
        </Block>
      </Row>
    </div>
  );
}

// ─── D1.28b — ResizablePanelView (bottom-edge drag, single pane) ──────────────

export function ResizablePanelPanel() {
  return (
    <div>
      <Row label="Bottom-edge drag to resize height — ditto Daakia AuditLog response panel" gap={0} code={`<ResizablePanelView\n  defaultHeight={200}\n  minHeight={80}\n  maxHeight={500}\n>\n  {/* your content */}\n</ResizablePanelView>`}>
        <Block style={{ padding: '12px', width: '100%' }}>
          <ResizablePanelView defaultHeight={200} minHeight={80} maxHeight={500}>
            <div style={{
              height: '100%', display: 'flex', flexDirection: 'column',
              background: 'var(--color-panel)',
            }}>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-surface-border)', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>RESPONSE</span>
                <span style={{ marginLeft: 'auto', background: 'color-mix(in srgb, var(--color-success) 15%, transparent)', color: 'var(--color-success)', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4 }}>200 OK</span>
                <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>142ms</span>
              </div>
              <pre style={{ flex: 1, margin: 0, padding: '10px 12px', fontSize: 11, lineHeight: 1.6, color: 'var(--color-text-secondary)', fontFamily: 'Menlo, Monaco, "Courier New", monospace', overflow: 'auto' }}>{`{\n  "users": [\n    { "id": 1, "name": "Alice" },\n    { "id": 2, "name": "Bob" }\n  ],\n  "total": 2\n}`}</pre>
            </div>
          </ResizablePanelView>
          <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--color-text-muted)' }}>
            ↕ Drag the dashed grip at the bottom edge to resize
          </p>
        </Block>
      </Row>
      <Row label="Wrapping a SplitPanelView — drag outer edge to resize total height, pill to adjust split" gap={0} code={`<ResizablePanelView defaultHeight={240} minHeight={120} maxHeight={480}>\n  <SplitPanelView direction="horizontal" first={<Request />} second={<Response />} />\n</ResizablePanelView>`}>
        <Block style={{ padding: '12px', width: '100%' }}>
          <ResizablePanelView defaultHeight={240} minHeight={120} maxHeight={480}>
            <SplitPanelView
              direction="horizontal"
              defaultSplit={50}
              minFirst={120}
              minSecond={120}
              style={{ height: '100%' }}
              accentColor="var(--color-protocol-rest)"
              first={<RequestPane />}
              second={<ResponsePane />}
            />
          </ResizablePanelView>
          <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--color-text-muted)' }}>
            ↕ Drag bottom grip to resize overall height · ↔ Drag center pill to adjust split
          </p>
        </Block>
      </Row>
    </div>
  );
}

// ─── D1.29 — DottedCardView ──────────────────────────────────────────────────

export function DottedCardPanel() {
  return (
    <div>
      <Row label="Collapsed / expanded with title slot" gap={12} code={`<DottedCardView title="REST Headers" defaultExpanded>\n  <p>Content here</p>\n</DottedCardView>\n\n<DottedCardView\n  title="GraphQL Variables"\n  defaultExpanded\n  accentColor="var(--color-protocol-graphql)"\n>\n  <p>Variables JSON here</p>\n</DottedCardView>`}>
        <DottedCardView title="REST Headers" style={{ width: '100%' }}>
          <p style={{ margin: 0, fontSize: '11px', color: 'var(--color-text-muted)' }}>Header key-value pairs for this request would appear here.</p>
        </DottedCardView>
        <DottedCardView title="GraphQL Variables" defaultExpanded accentColor="var(--color-protocol-graphql)" style={{ width: '100%' }}>
          <p style={{ margin: 0, fontSize: '11px', color: 'var(--color-text-muted)' }}>Variables JSON would go here.</p>
        </DottedCardView>
      </Row>
      <Row label="Protocol accent colors" gap={8} code={`<DottedCardView accentColor="var(--color-protocol-rest)"      title="REST"   />\n<DottedCardView accentColor="var(--color-protocol-graphql)"   title="GQL"    />\n<DottedCardView accentColor="var(--color-protocol-websocket)" title="WS"     />`}>
        <DottedCardView accentColor="var(--color-protocol-rest)"      title="REST"   style={{ flex: 1 }}><div style={{ height: 24 }} /></DottedCardView>
        <DottedCardView accentColor="var(--color-protocol-graphql)"   title="GQL"    style={{ flex: 1 }}><div style={{ height: 24 }} /></DottedCardView>
        <DottedCardView accentColor="var(--color-protocol-websocket)" title="WS"     style={{ flex: 1 }}><div style={{ height: 24 }} /></DottedCardView>
        <DottedCardView accentColor="var(--color-protocol-grpc)"      title="gRPC"   style={{ flex: 1 }}><div style={{ height: 24 }} /></DottedCardView>
      </Row>
    </div>
  );
}

// ─── D1.30 — ColoredTextView ─────────────────────────────────────────────────

export function ColoredTextPanel() {
  return (
    <div>
      <Row label="HTTP status line tokens" code={`<ColoredTextView tokens={[\n  { text: 'HTTP/1.1 ', color: 'var(--color-text-muted)', mono: true },\n  { text: '200',      color: 'var(--color-success)',    bold: true, mono: true },\n  { text: ' OK',      color: 'var(--color-success)',    mono: true },\n]} />`}>
        <Block>
          <ColoredTextView tokens={[
            { text: 'HTTP/1.1 ', color: 'var(--color-text-muted)', mono: true },
            { text: '200', color: 'var(--color-success)', bold: true, mono: true },
            { text: ' OK', color: 'var(--color-success)', mono: true },
          ]} />
        </Block>
      </Row>
      <Row label="Error response" code={`<ColoredTextView tokens={[\n  { text: 'HTTP/1.1 ', color: 'var(--color-text-muted)', mono: true },\n  { text: '404',       color: 'var(--color-error)',      bold: true, mono: true },\n  { text: ' Not Found', color: 'var(--color-error)',     mono: true },\n]} />`}>
        <Block>
          <ColoredTextView tokens={[
            { text: 'HTTP/1.1 ', color: 'var(--color-text-muted)', mono: true },
            { text: '404', color: 'var(--color-error)', bold: true, mono: true },
            { text: ' Not Found', color: 'var(--color-error)', mono: true },
          ]} />
        </Block>
      </Row>
      <Row label="Copyable token" code={`<ColoredTextView tokens={[\n  { text: 'Bearer ', color: 'var(--color-text-muted)', mono: true },\n  { text: 'eyJhbGci…', color: 'var(--color-protocol-rest)', mono: true, copyable: true },\n]} />`}>
        <Block>
          <ColoredTextView tokens={[
            { text: 'Bearer ', color: 'var(--color-text-muted)', mono: true },
            { text: 'eyJhbGciOi...', color: 'var(--color-protocol-rest)', mono: true, copyable: true },
          ]} />
        </Block>
      </Row>
      <Row label="gRPC status tokens" code={`<ColoredTextView tokens={[{ text: 'Status: ', mono: true, color: 'var(--color-text-muted)' }, { text: 'OK', mono: true, color: 'var(--color-success)', bold: true }]} />\n<ColoredTextView tokens={[{ text: 'Status: ', mono: true, color: 'var(--color-text-muted)' }, { text: 'UNAVAILABLE', mono: true, color: 'var(--color-error)', bold: true }]} />`}>
        <Block style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <ColoredTextView tokens={[{ text: 'Status: ', mono: true, color: 'var(--color-text-muted)' }, { text: 'OK', mono: true, color: 'var(--color-success)', bold: true }]} />
          <ColoredTextView tokens={[{ text: 'Status: ', mono: true, color: 'var(--color-text-muted)' }, { text: 'UNAVAILABLE', mono: true, color: 'var(--color-error)', bold: true }]} />
          <ColoredTextView tokens={[{ text: 'Status: ', mono: true, color: 'var(--color-text-muted)' }, { text: 'DEADLINE_EXCEEDED', mono: true, color: 'var(--color-warning)', bold: true }]} />
        </Block>
      </Row>
    </div>
  );
}

// ─── D1.31 — StatsCardView ───────────────────────────────────────────────────

export function StatsCardPanel() {
  return (
    <div>
      <Row label="Stats cards — requests/errors/latency metrics" code={`<StatsCardView\n  label="Response Time"\n  value="142"\n  unit="ms"\n  trend="down"\n  trendValue="8%"\n  accentColor="var(--color-success)"\n/>`}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <StatsCardView label="Total Requests" value="1,284" trend="up"      trendValue="12%" accentColor="var(--color-protocol-rest)"      style={{ width: 160 }} />
          <StatsCardView label="Avg Latency"    value="142"   unit="ms"  trend="down"    trendValue="8%"  accentColor="var(--color-success)"           style={{ width: 160 }} />
          <StatsCardView label="Error Rate"     value="2.4"   unit="%"   trend="up"      trendValue="0.3%" accentColor="var(--color-error)"            style={{ width: 160 }} />
          <StatsCardView label="Active Clients" value="37"               trend="neutral"              accentColor="var(--color-protocol-websocket)" style={{ width: 160 }} />
        </div>
      </Row>
      <Row label="With subValue" code={`<StatsCardView\n  label="Requests / sec"\n  value="48.2"\n  subValue="peak: 312/s"\n  accentColor="var(--color-protocol-grpc)"\n/>`}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <StatsCardView label="Requests / sec"    value="48.2" subValue="peak: 312/s"  accentColor="var(--color-protocol-grpc)"   style={{ width: 180 }} />
          <StatsCardView label="AI Tokens Used"    value="94.2k" subValue="$0.18 today"  accentColor="var(--color-protocol-ai)"    style={{ width: 180 }} />
        </div>
      </Row>
    </div>
  );
}

// ─── D1.32 — DataTableView ───────────────────────────────────────────────────

const TABLE_COLS = [
  { key: 'method', label: 'Method', width: '80px' },
  { key: 'path',   label: 'Path',   sortable: true },
  { key: 'status', label: 'Status', width: '80px', align: 'center' as const },
  { key: 'time',   label: 'Time',   width: '80px', align: 'right' as const, sortable: true },
];
const TABLE_ROWS = [
  { id: '1', method: 'GET',    path: '/api/users',       status: 200, time: '142ms' },
  { id: '2', method: 'POST',   path: '/api/auth/login',  status: 201, time: '89ms' },
  { id: '3', method: 'PUT',    path: '/api/users/42',    status: 200, time: '210ms' },
  { id: '4', method: 'DELETE', path: '/api/items/99',    status: 404, time: '54ms' },
  { id: '5', method: 'GET',    path: '/api/products',    status: 500, time: '1.2s' },
];

const REQ_1 = JSON.stringify({ headers: { Authorization: 'Bearer eyJhb...' }, params: { page: 1 } }, null, 2);
const RES_1 = JSON.stringify({ users: [{ id: 1, name: 'Alice', role: 'admin' }, { id: 2, name: 'Bob', role: 'viewer' }], total: 2 }, null, 2);
const REQ_2 = JSON.stringify({ email: 'alice@example.com', password: '••••••••' }, null, 2);
const RES_2 = JSON.stringify({ token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', expiresIn: 3600, userId: 1 }, null, 2);
const REQ_3 = JSON.stringify({ name: 'Alice Smith', email: 'alice.smith@example.com' }, null, 2);
const RES_3 = JSON.stringify({ id: 42, name: 'Alice Smith', updatedAt: '2026-06-10T12:00:00Z' }, null, 2);

const AUDIT_ROWS: Record<string, unknown>[] = [
  { id: '1', method: 'GET',    url: '/api/users',        status: 200, time: '142ms', request: null,  response: RES_1 },
  { id: '2', method: 'POST',   url: '/api/auth/login',   status: 201, time: '89ms',  request: REQ_2, response: RES_2 },
  { id: '3', method: 'PUT',    url: '/api/users/42',     status: 200, time: '210ms', request: REQ_3, response: RES_3 },
  { id: '4', method: 'DELETE', url: '/api/items/99',     status: 404, time: '54ms',  request: null,  response: JSON.stringify({ error: 'Not found', code: 'ITEM_NOT_FOUND' }, null, 2) },
  { id: '5', method: 'GET',    url: '/api/products',     status: 500, time: '1.2s',  request: null,  response: JSON.stringify({ error: 'Internal server error', traceId: 'abc-123' }, null, 2) },
];

function truncateJson(json: string | null, limit = 40) {
  if (!json) return '—';
  const flat = json.replace(/\s+/g, ' ').trim();
  return flat.length > limit ? `> {...} ${flat.length} chars` : flat;
}

function methodColor(m: string) {
  const map: Record<string, string> = {
    GET: 'var(--color-method-get)', POST: 'var(--color-method-post)',
    PUT: 'var(--color-method-put)', DELETE: 'var(--color-method-delete)',
    PATCH: 'var(--color-method-patch)',
  };
  return map[m] || 'var(--color-text-muted)';
}

function statusColor(s: number) {
  if (s < 300) return 'var(--color-success)';
  if (s < 400) return 'var(--color-info)';
  if (s < 500) return 'var(--color-warning)';
  return 'var(--color-error)';
}

const AUDIT_COLS = [
  { key: 'method', label: 'Method', width: '72px',
    renderCell: (r: Record<string, unknown>) => (
      <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color: methodColor(r.method as string) }}>{r.method as string}</span>
    ) },
  { key: 'url', label: 'URL', sortable: true },
  { key: 'status', label: 'Status', width: '72px', align: 'center' as const,
    renderCell: (r: Record<string, unknown>) => (
      <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 600, color: statusColor(r.status as number) }}>{r.status as number}</span>
    ) },
  { key: 'time', label: 'Time', width: '72px', align: 'right' as const },
  { key: 'request', label: 'Request', width: '140px',
    renderCell: (r: Record<string, unknown>) => (
      <span style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{truncateJson(r.request as string | null)}</span>
    ) },
  { key: 'response', label: 'Response', width: '140px',
    renderCell: (r: Record<string, unknown>) => (
      <span style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{truncateJson(r.response as string | null)}</span>
    ) },
];

const DB_SETTINGS: Record<string, unknown>[] = [
  { id: '1', key: 'theme', value: JSON.stringify({ mode: 'dark', primary: '#6366f1', fontSize: 14, fontFamily: 'JetBrains Mono' }, null, 2) },
  { id: '2', key: 'ai_config', value: JSON.stringify({ provider: 'anthropic', model: 'claude-opus-4-8', temperature: 0.7, maxTokens: 4096 }, null, 2) },
  { id: '3', key: 'proxy', value: JSON.stringify({ enabled: false, host: '', port: 8080, bypassList: ['localhost', '127.0.0.1'] }, null, 2) },
  { id: '4', key: 'collections_meta', value: JSON.stringify({ count: 12, lastSync: '2026-06-10T08:00:00Z', autoSync: true }, null, 2) },
];

export function DataTablePanel() {
  const [jsonModal, setJsonModal] = useState<{ key: string; json: string } | null>(null);

  const DB_COLS = [
    { key: 'key', label: 'Key', width: '160px',
      renderCell: (r: Record<string, unknown>) => (
        <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 600, color: 'var(--color-text-primary)' }}>{r.key as string}</span>
      ) },
    { key: 'value', label: 'Value',
      renderCell: (r: Record<string, unknown>) => {
        const json = r.value as string;
        const flat = json.replace(/\s+/g, ' ').trim();
        return (
          <button
            type="button"
            onClick={() => setJsonModal({ key: r.key as string, json })}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              fontSize: 10, fontFamily: 'monospace', textAlign: 'left',
              color: 'var(--color-primary)', textDecoration: 'underline', textDecorationStyle: 'dotted',
            }}
          >
            {`> {...} ${flat.length} chars`}
          </button>
        );
      } },
  ];

  return (
    <div>
      <Row label="Basic sortable table" gap={0} code={`<DataTableView\n  columns={[\n    { key: 'method', label: 'Method', width: '80px' },\n    { key: 'path',   label: 'Path', sortable: true },\n    { key: 'status', label: 'Status', width: '80px', align: 'center' },\n  ]}\n  rows={requests}\n  keyField="id"\n  onRowClick={r => openRequest(r)}\n/>`}>
        <Block style={{ padding: 0, overflow: 'hidden', width: '100%' }}>
          <DataTableView columns={TABLE_COLS} rows={TABLE_ROWS} keyField="id" maxHeight="220px" onRowClick={r => alert(`Clicked: ${r.method} ${r.path}`)} />
        </Block>
      </Row>
      <Row label="Empty state" gap={0} code={`<DataTableView\n  columns={columns}\n  rows={[]}\n  keyField="id"\n  emptyTitle="No requests yet"\n  emptyMessage="Send a request to see the log here."\n/>`}>
        <Block style={{ padding: 0, overflow: 'hidden', width: '100%' }}>
          <DataTableView columns={TABLE_COLS} rows={[]} keyField="id" emptyTitle="No requests yet" emptyMessage="Send a request to see the log here." />
        </Block>
      </Row>

      <Row label="Audit Log — expandable rows (click ▶), drag bottom grip to resize, pill to adjust split" gap={0} code={`<DataTableView\n  columns={auditCols}\n  rows={auditRows}\n  keyField="id"\n  renderExpanded={row => (\n    <SplitPanelView\n      direction="horizontal"\n      first={<EditorView value={row.request} readOnly />}\n      second={<EditorView value={row.response} readOnly />}\n    />\n  )}\n/>`}>
        <Block style={{ padding: 0, width: '100%' }}>
          <DataTableView
            columns={AUDIT_COLS}
            rows={AUDIT_ROWS}
            keyField="id"
            renderExpanded={row => (
              <ResizablePanelView defaultHeight={220} minHeight={100} maxHeight={480} borderRadius={0}>
                <SplitPanelView
                  direction="horizontal"
                  defaultSplit={50}
                  minFirst={120}
                  minSecond={120}
                  style={{ height: '100%' }}
                  accentColor="var(--color-protocol-rest)"
                  first={
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ padding: '5px 12px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-surface-border)', flexShrink: 0 }}>
                        Request
                      </div>
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <EditorView
                          value={(row.request as string | null) || '// No request body'}
                          language="json"
                          readOnly
                          height="100%"
                        />
                      </div>
                    </div>
                  }
                  second={
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ padding: '5px 12px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-surface-border)', flexShrink: 0 }}>
                        Response
                      </div>
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <EditorView
                          value={(row.response as string | null) || '// No response body'}
                          language="json"
                          readOnly
                          height="100%"
                        />
                      </div>
                    </div>
                  }
                />
              </ResizablePanelView>
            )}
          />
        </Block>
      </Row>

      <Row label="DB Explorer — cells show JSON char count, click to open JSON Viewer modal" gap={0} code={`// Custom renderCell for clickable JSON preview\nconst cols = [\n  { key: 'key',   label: 'Key' },\n  { key: 'value', label: 'Value',\n    renderCell: r => <button onClick={() => openModal(r.value)}>{r.value.slice(0,40)}…</button> },\n];\n<DataTableView columns={cols} rows={settings} keyField="id" />`}>
        <Block style={{ padding: 0, overflow: 'hidden', width: '100%' }}>
          <DataTableView
            columns={DB_COLS}
            rows={DB_SETTINGS}
            keyField="id"
            maxHeight="200px"
          />
        </Block>
      </Row>

      {/* JSON Viewer modal */}
      <ModalView
        open={!!jsonModal}
        onClose={() => setJsonModal(null)}
        title="JSON Viewer"
        headerRight={jsonModal ? (
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
            {jsonModal.json.length.toLocaleString()} chars
          </span>
        ) : undefined}
        size="lg"
        noPadding
        elevated
      >
        {jsonModal && (
          <div style={{ height: 420 }}>
            <EditorView value={jsonModal.json} language="json" readOnly height="100%" />
          </div>
        )}
      </ModalView>
    </div>
  );
}

// ─── D1.33 — CodeBlockView ───────────────────────────────────────────────────

export function CodeBlockPanel() {
  return (
    <div>
      <Row label="JSON code block with line numbers + copy" gap={0} code={`<CodeBlockView\n  language="json"\n  code={responseBody}\n  showLineNumbers\n  showCopy\n/>`}>
        <Block style={{ padding: 0, overflow: 'hidden', width: '100%' }}>
          <CodeBlockView
            code={`{\n  "id": 42,\n  "name": "Alice",\n  "role": "admin"\n}`}
            language="json"
            showLineNumbers
          />
        </Block>
      </Row>
      <Row label="cURL snippet (no line numbers)" gap={0} code={`<CodeBlockView\n  language="bash"\n  code={\`curl -X POST https://api.example.com/users \\\\\n  -H 'Content-Type: application/json' \\\\\n  -d '{"name":"Alice"}'\`}\n/>`}>
        <Block style={{ padding: 0, overflow: 'hidden', width: '100%' }}>
          <CodeBlockView
            code={`curl -X POST https://api.example.com/users \\\n  -H 'Content-Type: application/json' \\\n  -d '{"name":"Alice"}'`}
            language="bash"
          />
        </Block>
      </Row>
      <Row label="Protocol colors" code={`<CodeBlockView code={query} language="graphql"  accentColor="var(--color-protocol-graphql)" />\n<CodeBlockView code={proto} language="protobuf" accentColor="var(--color-protocol-grpc)" />`}>
        <Block style={{ display: 'flex', gap: '8px', padding: '8px', flexWrap: 'wrap' }}>
          <CodeBlockView code={`query { users { id name } }`}      language="graphql"  accentColor="var(--color-protocol-graphql)"   style={{ flex: 1 }} />
          <CodeBlockView code={`message UserRequest { string id = 1; }`} language="protobuf" accentColor="var(--color-protocol-grpc)" style={{ flex: 1 }} />
        </Block>
      </Row>
    </div>
  );
}

// ─── D1.34 — AIButtonView ────────────────────────────────────────────────────

export function AIButtonPanel() {
  const [loading, setLoading] = useState(false);
  const simulate = () => { setLoading(true); setTimeout(() => setLoading(false), 1500); };
  return (
    <div>
      <Row label="Action variants" code={`<AIButtonView action="generate" />\n<AIButtonView action="fuzz" />\n<AIButtonView action="explain" />\n<AIButtonView action="fix" />\n<AIButtonView action="ask" />\n<AIButtonView action="suggest" />`}>
        <Block style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', padding: '16px', alignItems: 'center' }}>
          <AIButtonView action="generate" />
          <AIButtonView action="fuzz" />
          <AIButtonView action="explain" />
          <AIButtonView action="fix" />
          <AIButtonView action="ask" />
          <AIButtonView action="suggest" />
        </Block>
      </Row>
      <Row label="Loading state (click to simulate)" code={`<AIButtonView action="generate" loading={isGenerating} onClick={handleGenerate} />`}>
        <Block style={{ display: 'flex', gap: '8px', padding: '16px', alignItems: 'center' }}>
          <AIButtonView action="generate" loading={loading} onClick={simulate} />
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Click the button to see "Thinking…" for 1.5s</span>
        </Block>
      </Row>
      <Row label="Size scale — sm (24px) / xs (20px) / xxs (16px)" code={`<AIButtonView action="generate" size="sm" />\n<AIButtonView action="explain" size="xs" />\n<AIButtonView action="suggest" size="xxs" />`}>
        <Block style={{ display: 'flex', gap: '8px', padding: '16px', alignItems: 'center' }}>
          <AIButtonView action="generate" size="sm" />
          <AIButtonView action="explain" size="xs" />
          <AIButtonView action="suggest" size="xxs" />
        </Block>
      </Row>
      <Row label="compact prop → xs (20px)" code={`<AIButtonView action="generate" compact />\n<AIButtonView action="explain" compact />`}>
        <Block style={{ display: 'flex', gap: '8px', padding: '16px', alignItems: 'center' }}>
          <AIButtonView action="generate" compact />
          <AIButtonView action="explain" compact />
          <AIButtonView action="suggest" compact />
        </Block>
      </Row>
      <Row label="Protocol accent colors" code={`<AIButtonView action="generate" accentColor="var(--color-protocol-rest)" />\n<AIButtonView action="generate" accentColor="var(--color-protocol-graphql)" />\n<AIButtonView action="generate" accentColor="var(--color-protocol-grpc)" />`}>
        <Block style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', padding: '16px', alignItems: 'center' }}>
          {['var(--color-protocol-rest)', 'var(--color-protocol-graphql)', 'var(--color-protocol-grpc)', 'var(--color-protocol-soap)'].map(c => (
            <AIButtonView key={c} action="generate" accentColor={c} />
          ))}
        </Block>
      </Row>
    </div>
  );
}

// ─── D1.35 — SideNavView ─────────────────────────────────────────────────────

export function SideNavPanel() {
  const [active, setActive] = useState('collections');
  return (
    <div>
      <Row label="Collapsible sidebar — click toggle at bottom to collapse to icon-only" gap={0} code={`<SideNavView\n  items={[\n    { id: 'collections', label: 'Collections', icon: <FolderIcon size={14} /> },\n    { id: 'environments', label: 'Environments', icon: <GlobeIcon size={14} /> },\n    {\n      id: 'settings', label: 'Settings', icon: <SettingsIcon size={14} />,\n      children: [\n        { id: 'general', label: 'General' },\n        { id: 'themes',  label: 'Themes' },\n      ],\n    },\n  ]}\n  activeId={activeId}\n  onSelect={setActiveId}\n  defaultOpenIds={['settings']}\n/>`}>
        <Block style={{ padding: 0, overflow: 'hidden', height: 360, display: 'flex' }}>
          <SideNavView
            items={[
              { id: 'collections', label: 'Collections', icon: <FolderIcon size={14} /> },
              { id: 'environments', label: 'Environments', icon: <GlobeIcon size={14} /> },
              { id: 'history', label: 'History', icon: <ClockIcon size={14} /> },
              { id: 'search', label: 'Search', icon: <SearchIcon size={14} /> },
              {
                id: 'settings', label: 'Settings', icon: <SettingsIcon size={14} />,
                children: [
                  { id: 'general',   label: 'General',   icon: <SettingsIcon size={12} /> },
                  { id: 'themes',    label: 'Themes',    icon: <GlobeIcon size={12} /> },
                  { id: 'ai',        label: 'AI Config', icon: <SparkleIcon size={12} /> },
                ],
              },
            ]}
            activeId={active}
            onSelect={setActive}
            defaultOpenIds={['settings']}
          />
          <div style={{ flex: 1, padding: '16px', fontSize: '11px', color: 'var(--color-text-muted)', borderLeft: '1px solid var(--color-surface-border)' }}>
            Active: <strong style={{ color: 'var(--color-text-primary)' }}>{active}</strong>
          </div>
        </Block>
      </Row>
    </div>
  );
}

// ─── D1.36 — SettingsNavView ─────────────────────────────────────────────────

export function SettingsNavPanel() {
  const [active, setActive] = useState('general');
  return (
    <div>
      <Row label="Grouped settings navigation" gap={0} code={`<SettingsNavView\n  activeId={activeId}\n  onSelect={setActiveId}\n  groups={[\n    {\n      title: 'General',\n      items: [\n        { id: 'general',   label: 'General',   description: 'App preferences', icon: <SettingsIcon size={12} /> },\n        { id: 'shortcuts', label: 'Shortcuts',  badge: 'NEW' },\n      ],\n    },\n    {\n      title: 'AI & Copilot',\n      items: [\n        { id: 'ai-models', label: 'AI Models', icon: <SparkleIcon size={12} /> },\n      ],\n    },\n  ]}\n/>`}>
        <Block style={{ display: 'flex', gap: '0', padding: 0, overflow: 'hidden' }}>
          <div style={{ width: 220, borderRight: '1px solid var(--color-surface-border)', padding: '12px' }}>
            <SettingsNavView
              activeId={active}
              onSelect={setActive}
              groups={[
                {
                  title: 'General',
                  items: [
                    { id: 'general',    label: 'General',     description: 'App preferences',       icon: <SettingsIcon size={12} /> },
                    { id: 'themes',     label: 'Themes',      description: 'Colors & fonts',         icon: <GlobeIcon size={12} /> },
                    { id: 'shortcuts',  label: 'Shortcuts',   description: 'Keyboard bindings',      icon: <CodeIcon size={12} /> },
                  ],
                },
                {
                  title: 'AI & Copilot',
                  items: [
                    { id: 'ai-models',  label: 'AI Models',   description: 'Providers & API keys',   icon: <SparkleIcon size={12} />, badge: 'NEW' },
                    { id: 'ai-agents',  label: 'AI Agents',   description: 'Agent configurations',   icon: <ServerIcon size={12} /> },
                  ],
                },
                {
                  title: 'Advanced',
                  items: [
                    { id: 'proxy',      label: 'Proxy',       description: 'HTTP proxy settings',    icon: <NetworkIcon size={12} /> },
                    { id: 'mock',       label: 'Mock Server',                                         icon: <LayersIcon size={12} /> },
                  ],
                },
              ]}
            />
          </div>
          <div style={{ flex: 1, padding: '16px', fontSize: '11px', color: 'var(--color-text-muted)' }}>
            Active: <strong style={{ color: 'var(--color-text-primary)' }}>{active}</strong>
          </div>
        </Block>
      </Row>
    </div>
  );
}

// ─── D1.37 — ThemeCardSelectorView ───────────────────────────────────────────

export function ThemeCardSelectorPanel() {
  const [theme, setTheme] = useState('dark');
  return (
    <div>
      <Row label="Theme card picker" code={`<ThemeCardSelectorView\n  value={selectedTheme}\n  onChange={setTheme}\n  options={[\n    { value: 'dark',    label: 'Dark',    preview: { bg: '#1e1e1e', panel: '#252526', accent: '#0078d4', text: '#d4d4d4' } },\n    { value: 'light',   label: 'Light',   preview: { bg: '#f3f3f3', panel: '#ffffff', accent: '#0078d4', text: '#333333' } },\n    { value: 'monokai', label: 'Monokai', preview: { bg: '#272822', panel: '#3e3d32', accent: '#a6e22e', text: '#f8f8f2' } },\n  ]}\n/>`}>
        <ThemeCardSelectorView
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'dark',  label: 'Dark',  description: 'VS Code dark theme', preview: { bg: '#1e1e1e', panel: '#252526', accent: '#0078d4', text: '#d4d4d4' } },
            { value: 'light', label: 'Light', description: 'VS Code light theme', preview: { bg: '#f3f3f3', panel: '#ffffff', accent: '#0078d4', text: '#333333' } },
            { value: 'monokai', label: 'Monokai', preview: { bg: '#272822', panel: '#3e3d32', accent: '#a6e22e', text: '#f8f8f2' } },
            { value: 'nord', label: 'Nord', preview: { bg: '#2e3440', panel: '#3b4252', accent: '#88c0d0', text: '#eceff4' } },
          ]}
        />
      </Row>
      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Selected: <strong>{theme}</strong></div>
    </div>
  );
}

// ─── D1.38 — FeatureCategoryView ─────────────────────────────────────────────

export function FeatureCategoryPanel() {
  const [restFeatures, setRestFeatures] = useState([
    { id: 'autoSave',    label: 'Auto-save',           description: 'Automatically save requests on change', enabled: true  },
    { id: 'aiSuggest',   label: 'AI Suggestions',      description: 'Show AI completions in the URL bar',     enabled: false },
    { id: 'responseFmt', label: 'Response Formatting', description: 'Auto-format JSON / XML responses',        enabled: true  },
    { id: 'history',     label: 'Request History',     description: 'Track all sent requests',                 enabled: true  },
  ]);
  const [aiFeatures, setAiFeatures] = useState([
    { id: 'explain', label: 'Explain Response', description: 'Let AI explain API responses',        enabled: true  },
    { id: 'fuzz',    label: 'Fuzz Testing',     description: 'AI-generated edge case tests',        enabled: false },
    { id: 'suggest', label: 'Smart Suggest',    description: 'Autocomplete headers and params',     enabled: true  },
    { id: 'audit',   label: 'Audit Logging',    description: 'Log all AI interactions to console',  enabled: false },
  ]);

  const toggleRest = (id: string) => setRestFeatures(fs => fs.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f));
  const toggleAi   = (id: string) => setAiFeatures(fs => fs.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f));

  const allAiEnabled = aiFeatures.every(f => f.enabled);
  const toggleAllAi  = (on: boolean) => setAiFeatures(fs => fs.map(f => ({ ...f, enabled: on })));

  return (
    <div>
      <Row label="With category toggle (right end) — turns ALL children on / off" gap={12} code={`<FeatureCategoryView\n  categoryLabel="AI Features"\n  categoryColor="var(--color-protocol-ai)"\n  categoryEnabled={allEnabled}\n  onCategoryToggle={enabled => toggleAll(enabled)}\n  features={features.map(f => ({ ...f, onToggle: () => toggle(f.id) }))}\n/>`}>
        <FeatureCategoryView
          categoryLabel="AI Features"
          categoryColor="var(--color-protocol-ai)"
          defaultExpanded
          categoryEnabled={allAiEnabled}
          onCategoryToggle={toggleAllAi}
          style={{ width: '100%' }}
          features={aiFeatures.map(f => ({ ...f, onToggle: () => toggleAi(f.id) }))}
        />
      </Row>
      <Row label="Without category toggle — individual row toggles only" gap={12} code={`<FeatureCategoryView\n  categoryLabel="REST Features"\n  categoryColor="var(--color-protocol-rest)"\n  features={features.map(f => ({ ...f, onToggle: () => toggle(f.id) }))}\n/>`}>
        <FeatureCategoryView
          categoryLabel="REST Features"
          categoryColor="var(--color-protocol-rest)"
          defaultExpanded
          style={{ width: '100%' }}
          features={restFeatures.map(f => ({ ...f, onToggle: () => toggleRest(f.id) }))}
        />
      </Row>
    </div>
  );
}

// ─── D1.39 — TagInputView ────────────────────────────────────────────────────

export function TagInputPanel() {
  const [tags1, setTags1] = useState(['rest', 'auth', 'v2']);
  const [tags2, setTags2] = useState<string[]>([]);
  return (
    <div>
      <Row label="Tag input — type and press Enter or comma to add" gap={0} code={`const [tags, setTags] = useState(['rest', 'auth', 'v2']);\n\n<TagInputView\n  tags={tags}\n  onChange={setTags}\n  accentColor="var(--color-protocol-rest)"\n/>`}>
        <Block style={{ width: '100%', maxWidth: 400 }}>
          <TagInputView tags={tags1} onChange={setTags1} accentColor="var(--color-protocol-rest)" />
        </Block>
      </Row>
      <Row label="Empty state (placeholder)" code={`<TagInputView\n  tags={[]}  onChange={setTags}\n  placeholder="Add environment tags…"\n  accentColor="var(--color-protocol-graphql)"\n/>`}>
        <Block style={{ width: '100%', maxWidth: 400 }}>
          <TagInputView tags={tags2} onChange={setTags2} placeholder="Add environment tags…" accentColor="var(--color-protocol-graphql)" />
        </Block>
      </Row>
      <Row label="With max tags (3)" code={`// maxTags prevents adding beyond the limit\n<TagInputView\n  tags={['tag1', 'tag2', 'tag3']}\n  onChange={setTags}\n  maxTags={3}\n  accentColor="var(--color-warning)"\n/>`}>
        <Block style={{ width: '100%', maxWidth: 400 }}>
          <TagInputView tags={['tag1', 'tag2', 'tag3']} onChange={() => {}} maxTags={3} accentColor="var(--color-warning)" />
        </Block>
      </Row>
      <Row label="Disabled" code={`<TagInputView\n  tags={['read-only', 'disabled']}\n  onChange={() => {}}\n  disabled\n/>`}>
        <Block style={{ width: '100%', maxWidth: 400 }}>
          <TagInputView tags={['read-only', 'disabled']} onChange={() => {}} disabled />
        </Block>
      </Row>
    </div>
  );
}

// ─── D1.40 — BottomPanelView ─────────────────────────────────────────────────

export function BottomPanelPanel() {
  return (
    <div>
      <Row label="DevTools-style bottom panel — drag to resize, click tab to collapse" gap={0} code={`<BottomPanelView\n  defaultHeight={120}\n  tabs={[\n    { id: 'console', label: 'Console', icon: <TerminalIcon size={11} />, content: <ConsoleOutput /> },\n    { id: 'network', label: 'Network', icon: <NetworkIcon size={11} />,  content: <NetworkLog /> },\n    { id: 'output',  label: 'Output',  icon: <OutputIcon size={11} />,   content: <OutputLog /> },\n  ]}\n/>`}>
        <Block style={{ padding: 0, overflow: 'hidden', height: 280, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, padding: '12px 14px', fontSize: '11px', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ opacity: 0.4 }}>▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓</span>
            <span>Request / Response area</span>
          </div>
          <BottomPanelView
            defaultHeight={120}
            tabs={[
              { id: 'console', label: 'Console', icon: <TerminalIcon size={11} />, content: <pre style={{ margin: 0, padding: '8px 12px', fontSize: '11px', color: 'var(--color-success)', fontFamily: 'monospace', lineHeight: 1.6 }}>{'[GET] /api/users → 200 OK (142ms)\n[POST] /api/auth → 201 Created (89ms)\n[DELETE] /api/session → 204 No Content (34ms)'}</pre> },
              { id: 'network', label: 'Network',  icon: <NetworkIcon size={11} />, content: <div style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--color-text-muted)' }}>No network activity recorded.</div> },
              { id: 'output',  label: 'Output',   icon: <OutputIcon size={11} />,  content: <div style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--color-text-muted)' }}>Extension output stream is empty.</div> },
            ]}
          />
        </Block>
      </Row>

      <Row label="Collapsed by default — click any tab label to expand" gap={0} code={`<BottomPanelView\n  defaultCollapsed={true}\n  defaultHeight={160}\n  tabs={[\n    { id: 'logs', label: 'Logs', content: <LogOutput /> },\n    { id: 'ai',   label: 'AI',   content: <AIOutput /> },\n  ]}\n/>`}>
        <Block style={{ padding: 0, overflow: 'hidden', height: 200, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, padding: '12px 14px', fontSize: '11px', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ opacity: 0.4 }}>▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓</span>
            <span>Main content area</span>
          </div>
          <BottomPanelView
            defaultCollapsed={true}
            defaultHeight={160}
            tabs={[
              { id: 'logs', label: 'Logs', icon: <DocumentIcon size={11} />, content: <pre style={{ margin: 0, padding: '8px 12px', fontSize: '11px', color: 'var(--color-text-secondary)', fontFamily: 'monospace', lineHeight: 1.6 }}>{'[INFO] Mock server started on :7070\n[WARN] No matching rule for GET /api/foo\n[INFO] Rule matched → 200 {"status":"ok"}'}</pre> },
              { id: 'ai',   label: 'AI',   icon: <SparkleIcon size={11} />,  content: <div style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--color-text-muted)' }}>AI output will appear here after a request is sent.</div> },
            ]}
          />
        </Block>
      </Row>

      <Row label="Accent color — tab indicator inherits protocol color" gap={0} code={`<BottomPanelView\n  accentColor="var(--color-protocol-rest)"\n  defaultHeight={100}\n  tabs={[\n    { id: 'response', label: 'Response', content: <ResponseBody /> },\n    { id: 'headers',  label: 'Headers',  content: <ResponseHeaders /> },\n  ]}\n/>`}>
        <Block style={{ padding: 0, overflow: 'hidden', height: 220, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, padding: '12px 14px', fontSize: '11px', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ opacity: 0.4 }}>▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓</span>
            <span>Request editor</span>
          </div>
          <BottomPanelView
            accentColor="var(--color-protocol-rest)"
            defaultHeight={100}
            tabs={[
              { id: 'response', label: 'Response', icon: <CodeBracketsIcon size={11} />, content: <pre style={{ margin: 0, padding: '8px 12px', fontSize: '11px', color: 'var(--color-text-primary)', fontFamily: 'monospace', lineHeight: 1.6 }}>{'{\n  "id": 42,\n  "name": "Alice",\n  "role": "admin"\n}'}</pre> },
              { id: 'headers',  label: 'Headers',  icon: <LayersIcon size={11} />,       content: <pre style={{ margin: 0, padding: '8px 12px', fontSize: '11px', color: 'var(--color-text-secondary)', fontFamily: 'monospace', lineHeight: 1.6 }}>{'content-type: application/json\nx-request-id: a1b2c3d4'}</pre> },
            ]}
          />
        </Block>
      </Row>
    </div>
  );
}

// ─── D1.41 — ToastView ───────────────────────────────────────────────────────

export function ToastPanel() {
  const [toasts, setToasts] = useState<Array<{ id: string; variant: 'success' | 'error' | 'warning' | 'info'; title: string; message?: string; duration?: number }>>([]);
  const dismiss = (id: string) => setToasts(ts => ts.filter(t => t.id !== id));
  const add = (variant: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => {
    const id = `${Date.now()}`;
    setToasts(ts => [...ts, { id, variant, title, message, duration: 5000 }]);
  };
  return (
    <div>
      <Row label="Toast notifications — click to trigger each type" code={`const { toast } = useToast();\n\n// Success\ntoast({ message: 'Request saved', variant: 'success' });\n// Error\ntoast({ message: 'Connection failed', variant: 'error', duration: 5000 });\n// Warning\ntoast({ message: 'Rate limit exceeded', variant: 'warning' });\n// Info\ntoast({ message: 'Token refreshed', variant: 'info' });`}>
        <Block style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', padding: '16px' }}>
          <button type="button" onClick={() => add('success', 'Request saved', 'GET /api/users saved to collection.')} style={{ padding: '6px 12px', borderRadius: 5, border: '1px solid var(--color-success)', background: 'color-mix(in srgb, var(--color-success) 12%, transparent)', cursor: 'pointer', color: 'var(--color-success)', fontSize: '12px' }}>✓ Success</button>
          <button type="button" onClick={() => add('error', 'Request failed', 'Connection refused on port 8080.')} style={{ padding: '6px 12px', borderRadius: 5, border: '1px solid var(--color-error)', background: 'color-mix(in srgb, var(--color-error) 12%, transparent)', cursor: 'pointer', color: 'var(--color-error)', fontSize: '12px' }}>✕ Error</button>
          <button type="button" onClick={() => add('warning', 'Rate limit exceeded', 'Slow down — 429 Too Many Requests.')} style={{ padding: '6px 12px', borderRadius: 5, border: '1px solid var(--color-warning)', background: 'color-mix(in srgb, var(--color-warning) 12%, transparent)', cursor: 'pointer', color: 'var(--color-warning)', fontSize: '12px' }}>⚠ Warning</button>
          <button type="button" onClick={() => add('info', 'Auth token refreshed', 'Bearer token valid for 60 minutes.')} style={{ padding: '6px 12px', borderRadius: 5, border: '1px solid var(--color-primary)', background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)', cursor: 'pointer', color: 'var(--color-primary)', fontSize: '12px' }}>ℹ Info</button>
        </Block>
      </Row>
      <ToastView toasts={toasts} onDismiss={dismiss} position="bottom-right" />
    </div>
  );
}

// ─── D1.42 — PromptCardView (single row card) ────────────────────────────────

export function PromptCardPanel() {
  const [selected, setSelected] = useState<string | null>('p1');
  return (
    <div>
      <Row label="PromptCardView — single row card with avatar, badges, hover actions" code={`<PromptCardView\n  id="p1"\n  title="REST API Agent"\n  description="Builds structured HTTP requests from natural language"\n  content={description}\n  protocol="REST"\n  protocolColor="var(--color-protocol-rest)"\n  selected={activeId === 'p1'}\n  onUse={id => setActive(id)}\n  onCopy={id => copyPrompt(id)}\n  onEdit={id => openEditor(id)}\n  onDelete={id => deletePrompt(id)}\n/>`}>
        <div style={{ width: '100%', border: '1px solid var(--color-surface-border)', borderRadius: 8, overflow: 'hidden', background: 'var(--color-panel)' }}>
          {[
            { id: 'p1', title: 'REST API Agent',          description: 'Builds structured HTTP requests from natural language',   protocol: 'REST', protocolColor: 'var(--color-protocol-rest)',    hasAll: true  },
            { id: 'p2', title: 'Explain GraphQL response', description: 'Explains each field and identifies potential issues',     protocol: 'GQL',  protocolColor: 'var(--color-protocol-graphql)', hasAll: false },
            { id: 'p3', title: 'Mock server rule',         description: 'Generates Daakia mock rule with fault injection',         protocol: 'MOCK', protocolColor: 'var(--color-protocol-ai)',      hasAll: false },
            { id: 'p4', title: 'Generate test assertions', description: 'Creates dk.test() assertions from response body',        protocol: 'REST', protocolColor: 'var(--color-protocol-rest)',    hasAll: true, isCustom: true },
            { id: 'p5', title: 'cURL Agent',               description: 'Converts cURL commands to structured Daakia requests',   protocol: 'REST', protocolColor: 'var(--color-protocol-rest)',    hasAll: false },
          ].map(item => (
            <PromptCardView
              key={item.id}
              id={item.id}
              title={item.title}
              description={item.description}
              content={item.description}
              protocol={item.protocol}
              protocolColor={item.protocolColor}
              isCustom={(item as any).isCustom}
              selected={selected === item.id}
              onUse={id => setSelected(id)}
              onEdit={item.hasAll ? id => alert(`Edit ${id}`) : undefined}
              onCopy={id => alert(`Copy ${id}`)}
              onDelete={item.hasAll ? id => alert(`Delete ${id}`) : undefined}
            />
          ))}
        </div>
      </Row>
    </div>
  );
}

// ─── D1.43 — PromptLibraryListView + PromptLibraryEditorView ─────────────────

const DEMO_SECTIONS: PromptLibrarySection[] = [
  {
    id: 'agents',
    title: 'Agent Prompts',
    categories: [
      {
        id: 'request-building',
        title: 'Request Building',
        items: [
          { id: 'rest-agent',    title: 'REST API Agent',    description: 'Builds structured HTTP requests from natural language',    avatarColor: '#6366f1', protocol: 'REST', protocolColor: 'var(--color-protocol-rest)' },
          { id: 'curl-agent',    title: 'cURL Agent',        description: 'Converts cURL commands to structured Daakia requests',    avatarColor: '#f59e0b', protocol: 'REST', protocolColor: 'var(--color-protocol-rest)' },
        ],
      },
      {
        id: 'mock-testing',
        title: 'Mock & Testing',
        items: [
          { id: 'mock-agent',    title: 'Mock Server Agent', description: 'Designs mock API endpoints with realistic data',          avatarColor: '#8b5cf6', protocol: 'MOCK', protocolColor: 'var(--color-protocol-ai)' },
          { id: 'test-agent',    title: 'Test Script Agent', description: 'Generates dk.* test assertions for API responses',        avatarColor: '#10b981', protocol: 'TEST', protocolColor: 'var(--color-protocol-websocket)' },
        ],
      },
      {
        id: 'knowledge',
        title: 'Knowledge & Chat',
        items: [
          { id: 'knowledge-agent', title: 'Knowledge Agent', description: 'Explains HTTP status codes, headers, and API patterns',   avatarColor: '#06b6d4', protocol: 'REST', protocolColor: 'var(--color-protocol-rest)' },
          { id: 'general-agent',   title: 'General Assistant', description: 'Fallback conversational assistant for API workflows',   avatarColor: '#ec4899', protocol: 'AI',   protocolColor: 'var(--color-protocol-ai)' },
        ],
      },
    ],
  },
  {
    id: 'ai-actions',
    title: 'AI Actions',
    categories: [
      {
        id: 'response-diagnostics',
        title: 'Response & Diagnostics',
        items: [
          { id: 'ask-ai-why',    title: 'Ask AI Why (Error Diagnosis)', description: 'Prompt used when "Ask AI why" is clicked on a failed response', avatarColor: '#ef4444', isCustom: false },
          { id: 'explain-ai',    title: 'Explain with AI',              description: 'Prompt used when "Explain" is clicked on response body',         avatarColor: '#3b82f6', isCustom: false },
          { id: 'followup-ai',   title: 'Follow-up with AI',            description: 'Prompt used when "Follow-up Requests" is triggered',             avatarColor: '#06b6d4', isCustom: false },
          { id: 'generate-test', title: 'Generate test assertions',     description: 'Creates dk.test() assertions from response body',                avatarColor: '#6366f1', isCustom: true },
        ],
      },
      {
        id: 'rest-toolkit',
        title: 'REST Toolkit',
        items: [
          { id: 'suggest-headers', title: 'Suggest Headers', description: 'User prompt sent when "Suggest headers" is clicked in REST request', avatarColor: '#8b5cf6' },
          { id: 'generate-body',   title: 'Generate Body',   description: 'Generates request body from schema or description',                   avatarColor: '#f59e0b', isCustom: true },
        ],
      },
    ],
  },
];

const TABS: PromptLibraryEditorTab[] = [
  { id: 'system', label: 'System', icon: <SystemIcon size={12} /> },
  { id: 'user',   label: 'User',   icon: <UserPromptIcon size={12} /> },
];

const DEMO_EDITOR_CONTENT: Record<string, { title: string; description: string; triggerLabel: string; avatarColor: string; isCustom?: boolean; variables: string[]; system: string; user: string }> = {
  'rest-agent': {
    title: 'REST API Agent',
    description: 'Builds structured HTTP requests from natural language',
    triggerLabel: 'Daakia AI chat → "Build Request" intent · triggered when asking AI to create or modify an HTTP request',
    avatarColor: '#6366f1',
    variables: ['{{userIntent}}', '{{currentUrl}}', '{{currentMethod}}', '{{envVars}}', '{{headers}}', '{{baseUrl}}'],
    system: `You are a REST API request builder for the Daakia API client.\n\nThe user wants: {{userIntent}}\nActive URL: {{currentUrl}}\nHTTP Method: {{currentMethod}}\nEnvironment variables: {{envVars}}\nCurrent headers: {{headers}}\n\nYour task:\n1. Determine the correct HTTP method, URL, headers, and body\n2. Return a structured JSON response with the request configuration\n3. Use environment variable references like {{baseUrl}} where appropriate\n4. Include Content-Type headers when a body is present\n5. Provide a brief explanation of what the request does\n\nReturn valid JSON with keys: method, url, headers, body, explanation`,
    user: `{{userIntent}}`,
  },
  'curl-agent': {
    title: 'cURL Agent',
    description: 'Converts cURL commands to structured Daakia requests',
    triggerLabel: 'Daakia AI chat → "Convert cURL" intent · triggered when pasting a cURL command into the AI chat',
    avatarColor: '#f59e0b',
    variables: ['{{curlCommand}}', '{{envVars}}'],
    system: `You are a cURL command converter for the Daakia API client.\n\ncURL command: {{curlCommand}}\nEnvironment variables: {{envVars}}\n\nConvert this cURL command to a structured Daakia request:\n1. Extract the HTTP method (from -X flag or infer from -d)\n2. Parse all headers (-H flags)\n3. Extract the request body (-d, --data, --data-raw)\n4. Identify the URL\n5. Replace hardcoded values with environment variable references where sensible\n\nReturn JSON with: method, url, headers (key-value pairs), body, and notes about assumptions.`,
    user: `Convert this cURL command:\n{{curlCommand}}\n\nAvailable environment variables:\n{{envVars}}`,
  },
  'mock-agent': {
    title: 'Mock Server Agent',
    description: 'Designs mock API endpoints with realistic data',
    triggerLabel: 'Daakia AI chat → "Create mock" intent · triggered when setting up mock server routes',
    avatarColor: '#8b5cf6',
    variables: ['{{routePath}}', '{{httpMethod}}', '{{schemaHint}}', '{{delay}}'],
    system: `You are a mock server designer for the Daakia API client.\n\nRoute: {{httpMethod}} {{routePath}}\nSchema hint: {{schemaHint}}\nResponse delay: {{delay}}ms\n\nDesign a realistic mock response:\n1. Match the expected data structure from the schema hint\n2. Use realistic fake data (names, emails, IDs)\n3. Include appropriate HTTP status codes and headers\n4. Add variability for list endpoints (3-7 items)\n\nReturn JSON with: statusCode, headers, body (as JSON object), delay.`,
    user: `Create a mock response for {{httpMethod}} {{routePath}}.\n\nSchema: {{schemaHint}}`,
  },
  'test-agent': {
    title: 'Test Script Agent',
    description: 'Generates dk.* test assertions for API responses',
    triggerLabel: 'Daakia AI chat → "Generate tests" context menu on response panel',
    avatarColor: '#10b981',
    variables: ['{{responseBody}}', '{{statusCode}}', '{{responseTime}}', '{{headers}}'],
    system: `You are a test script generator for the Daakia API client.\n\nResponse received:\n- Status: {{statusCode}}\n- Time: {{responseTime}}ms\n- Headers: {{headers}}\n- Body: {{responseBody}}\n\nGenerate dk.test() assertions using Daakia's test DSL.\nCover: status code, response time, body structure, data types, and business logic.`,
    user: `Generate test assertions for this response:\nStatus: {{statusCode}}\nBody: {{responseBody}}`,
  },
  'knowledge-agent': {
    title: 'Knowledge Agent',
    description: 'Explains HTTP status codes, headers, and API patterns',
    triggerLabel: 'Daakia AI chat → conversational mode · triggered on general API questions',
    avatarColor: '#06b6d4',
    variables: ['{{userQuestion}}', '{{context}}'],
    system: `You are a helpful API knowledge assistant embedded in Daakia.\n\nUser question: {{userQuestion}}\nContext: {{context}}\n\nProvide concise, accurate answers about:\n- HTTP status codes and their meanings\n- Common request/response headers\n- REST API design patterns\n- Authentication methods (Bearer, API Key, OAuth)\n- JSON schema concepts\n\nKeep answers focused and practical. Include code examples where helpful.`,
    user: `{{userQuestion}}`,
  },
  'general-agent': {
    title: 'General Assistant',
    description: 'Fallback conversational assistant for API workflows',
    triggerLabel: 'Daakia AI chat → fallback mode · triggered when no specific intent is matched',
    avatarColor: '#ec4899',
    variables: ['{{userMessage}}', '{{activeProtocol}}', '{{activeUrl}}'],
    system: `You are a general-purpose assistant for the Daakia API client.\n\nActive protocol: {{activeProtocol}}\nActive endpoint: {{activeUrl}}\n\nHelp the user with any API-related task. You have access to the current request context.\nIf the user's intent maps to a specific action (build request, convert cURL, generate tests), suggest it.`,
    user: `{{userMessage}}`,
  },
  'ask-ai-why': {
    title: 'Ask AI Why (Error Diagnosis)',
    description: 'Prompt used when "Ask AI why" is clicked on a failed response',
    triggerLabel: 'Response panel → "Ask AI why" button · triggered on 4xx/5xx status codes',
    avatarColor: '#ef4444',
    variables: ['{{statusCode}}', '{{responseBody}}', '{{requestUrl}}', '{{requestMethod}}', '{{requestHeaders}}', '{{requestBody}}'],
    system: `You are an API error diagnostic assistant.\n\nFailed request:\n- Method: {{requestMethod}} {{requestUrl}}\n- Request headers: {{requestHeaders}}\n- Request body: {{requestBody}}\n- Response status: {{statusCode}}\n- Response body: {{responseBody}}\n\nDiagnose the error:\n1. Explain what the {{statusCode}} status code means in this context\n2. Identify the likely root cause from the response body\n3. Suggest 2-3 concrete fixes the user can try\n4. Show corrected request if applicable`,
    user: `Why did I get a {{statusCode}} error?\n\nURL: {{requestUrl}}\nResponse: {{responseBody}}`,
  },
  'explain-ai': {
    title: 'Explain with AI',
    description: 'Prompt used when "Explain" is clicked on response body',
    triggerLabel: 'Response panel → "Explain" context menu · triggered on any response body',
    avatarColor: '#3b82f6',
    variables: ['{{responseBody}}', '{{requestUrl}}', '{{statusCode}}'],
    system: `You are an API response explainer.\n\nEndpoint: {{requestUrl}}\nStatus: {{statusCode}}\nResponse body: {{responseBody}}\n\nExplain this response in plain English:\n1. What each top-level field means\n2. Any notable patterns or conventions (pagination, error format, etc.)\n3. How this data might be used by a client application\n\nKeep the explanation concise and developer-friendly.`,
    user: `Explain this API response from {{requestUrl}}:\n{{responseBody}}`,
  },
  'followup-ai': {
    title: 'Follow-up with AI',
    description: 'Prompt used when "Follow-up Requests" is triggered',
    triggerLabel: 'Response panel → "Follow-up" action · triggered after reviewing a response',
    avatarColor: '#06b6d4',
    variables: ['{{responseBody}}', '{{requestUrl}}', '{{requestMethod}}', '{{userIntent}}'],
    system: `You are a follow-up request builder for the Daakia API client.\n\nPrevious request: {{requestMethod}} {{requestUrl}}\nResponse received: {{responseBody}}\nUser wants to: {{userIntent}}\n\nBuild the next logical API request based on the previous response.\nExtract relevant IDs or tokens from {{responseBody}} for use in the follow-up URL or body.`,
    user: `Based on the previous response, I want to {{userIntent}}.\n\nPrevious response: {{responseBody}}`,
  },
  'generate-test': {
    title: 'Generate test assertions',
    description: 'Creates dk.test() assertions from response body',
    triggerLabel: 'Daakia AI chat → "Generate tests" context menu on response panel',
    avatarColor: '#6366f1',
    isCustom: true,
    variables: ['{{responseBody}}', '{{statusCode}}', '{{headers}}'],
    system: `You are a test assertion generator for the Daakia API client.\nGenerate dk.test() assertions from the API response.`,
    user: `Response status: {{statusCode}}\nResponse headers: {{headers}}\nResponse body:\n{{responseBody}}\n\nGenerate comprehensive dk.test() assertions covering:\n- Status code validation\n- Key field presence\n- Data type checks\n- Business logic assertions`,
  },
  'suggest-headers': {
    title: 'Suggest Headers',
    description: 'Suggests appropriate headers for the current request',
    triggerLabel: 'REST request panel → "Suggest headers" button',
    avatarColor: '#8b5cf6',
    variables: ['{{currentUrl}}', '{{currentMethod}}', '{{currentBody}}', '{{envVars}}'],
    system: `You are a request header advisor for the Daakia API client.\n\nRequest: {{currentMethod}} {{currentUrl}}\nBody: {{currentBody}}\nEnvironment: {{envVars}}\n\nSuggest appropriate HTTP headers:\n1. Always include Content-Type when there is a body\n2. Include Accept headers based on expected response format\n3. Suggest Authorization header format if the URL suggests authentication\n4. Include Cache-Control for GET requests where caching makes sense\n\nReturn JSON array of { name, value, reason } objects.`,
    user: `What headers should I add to this {{currentMethod}} request to {{currentUrl}}?`,
  },
  'generate-body': {
    title: 'Generate Body',
    description: 'Generates request body from schema or description',
    triggerLabel: 'REST request panel → "Generate body" AI action',
    avatarColor: '#f59e0b',
    isCustom: true,
    variables: ['{{userIntent}}', '{{currentUrl}}', '{{currentMethod}}', '{{schemaOrHint}}'],
    system: `You are a request body generator for the Daakia API client.\n\nEndpoint: {{currentMethod}} {{currentUrl}}\nUser wants: {{userIntent}}\nSchema/hint: {{schemaOrHint}}\n\nGenerate a realistic, valid request body:\n1. Match the expected schema from {{schemaOrHint}}\n2. Use sensible realistic values (not foo/bar/test)\n3. Include all required fields\n4. Format as valid JSON\n\nReturn only the JSON body, no explanation.`,
    user: `Generate a request body for {{currentMethod}} {{currentUrl}}.\n\nIntent: {{userIntent}}\nSchema: {{schemaOrHint}}`,
  },
};

export function PromptLibraryPanel() {
  const [activeId, setActiveId] = useState<string>('curl-agent');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('system');
  const [viewMode, setViewMode] = useState<'preview' | 'edit'>('preview');
  const [contents, setContents] = useState<Record<string, { system: string; user: string }>>({});

  const editorData = DEMO_EDITOR_CONTENT[activeId];
  const contentKey = activeTab === 'system' ? 'system' : 'user';
  const rawContent = editorData
    ? (contents[activeId]?.[contentKey] ?? editorData[contentKey])
    : '';
  const [isDirty, setIsDirty] = useState(false);

  const handleSelect = (id: string) => {
    if (id === activeId) return;
    setActiveId(id);
    setActiveTab('system');
    setViewMode('preview');
    setIsDirty(false);
  };

  const handleContentChange = (val: string) => {
    setContents(prev => ({
      ...prev,
      [activeId]: { ...(prev[activeId] ?? { system: editorData?.system ?? '', user: editorData?.user ?? '' }), [contentKey]: val },
    }));
    setIsDirty(true);
  };

  const handleSave = () => setIsDirty(false);

  return (
    <div>
      <Row label="PromptLibraryListView + PromptLibraryEditorView — full split view ditto Daakia" gap={0} code={`// Left panel\n<PromptLibraryListView\n  sections={sections}        // PromptLibrarySection[]\n  activeId={activeId}\n  onSelect={setActiveId}\n  search={search}\n  onSearchChange={setSearch}\n/>\n\n// Right panel\n<PromptLibraryEditorView\n  title={item.title}\n  description={item.description}\n  triggerLabel={item.triggerLabel}\n  avatarColor={item.avatarColor}\n  variables={[{ pill: '{{curlCommand}}', insert: '{{curlCommand}}' }]}\n  tabs={[{ id: 'system', label: 'System' }, { id: 'user', label: 'User' }]}\n  activeTabId={activeTab}\n  onTabChange={setActiveTab}\n  content={content}\n  onContentChange={setContent}\n  viewMode={viewMode}\n  onViewModeChange={setViewMode}\n  isDirty={dirty}\n  onSave={handleSave}\n/>`}>
        <Block style={{ padding: 0, overflow: 'hidden', width: '100%', height: 520, display: 'flex' }}>
          {/* Left: list panel */}
          <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid var(--color-surface-border)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <PromptLibraryListView
              sections={DEMO_SECTIONS}
              activeId={activeId}
              onSelect={handleSelect}
              search={search}
              onSearchChange={setSearch}
            />
          </div>
          {/* Right: editor panel */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {editorData ? (
              <PromptLibraryEditorView
                key={activeId}
                title={editorData.title}
                description={editorData.description}
                triggerLabel={editorData.triggerLabel}
                avatarColor={editorData.avatarColor}
                isCustom={editorData.isCustom}
                isDirty={isDirty}
                variables={editorData.variables.map(v => ({ pill: v, insert: v, title: `Variable: ${v}` }))}
                tabs={TABS}
                activeTabId={activeTab}
                onTabChange={id => { setActiveTab(id); setViewMode('preview'); }}
                content={rawContent}
                onContentChange={handleContentChange}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                onSave={handleSave}
              />
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: 12 }}>
                Select a prompt to edit
              </div>
            )}
          </div>
        </Block>
      </Row>
    </div>
  );
}

// ─── E6.176 — SearchInputView ─────────────────────────────────────────────────

export function SearchInputPanel() {
  const [q1, setQ1] = useState('');
  const [q2, setQ2] = useState('');
  return (
    <div>
      <Row label="With prefix icon + clear suffix" code={`<SearchInputView\n  value={q}\n  onChange={setQ}\n  placeholder="Search collections…"\n  prefix={<SearchIcon size={11} />}\n  suffix={q ? <button onClick={() => setQ('')}><XIcon size={10} /></button> : null}\n/>`}>
        <SearchInputView
          value={q1}
          onChange={setQ1}
          placeholder="Search collections…"
          prefix={<SearchIcon size={11} />}
          suffix={q1 ? (
            <button type="button" onClick={() => setQ1('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', color: 'var(--color-text-muted)' }}>
              <CloseIcon size={10} />
            </button>
          ) : null}
          style={{ maxWidth: 280 }}
        />
        <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>Type to see clear button</span>
      </Row>
      <Row label="No prefix / suffix" code={`<SearchInputView value={q} onChange={setQ} placeholder="Filter by name…" />`}>
        <SearchInputView value={q2} onChange={setQ2} placeholder="Filter by name…" style={{ maxWidth: 240 }} />
      </Row>
      <Row label="Custom heights — 24px / 28px (default) / 32px" code={`<SearchInputView value="" onChange={() => {}} placeholder="24px" height={24} />\n<SearchInputView value="" onChange={() => {}} placeholder="28px (default)" />\n<SearchInputView value="" onChange={() => {}} placeholder="32px" height={32} />`}>
        <SearchInputView value="" onChange={() => {}} placeholder="24px" height={24} prefix={<SearchIcon size={10} />} style={{ maxWidth: 180 }} />
        <SearchInputView value="" onChange={() => {}} placeholder="28px (default)" height={28} prefix={<SearchIcon size={11} />} style={{ maxWidth: 200 }} />
        <SearchInputView value="" onChange={() => {}} placeholder="32px" height={32} prefix={<SearchIcon size={12} />} style={{ maxWidth: 220 }} />
      </Row>
    </div>
  );
}

// ─── E6.176 — DurationInputView ───────────────────────────────────────────────

export function DurationInputPanel() {
  const [v1, setV1] = useState(0);
  const [v2, setV2] = useState(5000);
  const [v3, setV3] = useState(120000);
  return (
    <div>
      <Row label="Default (starts at 0 ms)" align="flex-start" code={`<DurationInputView value={timeout} onChange={setTimeout} />\n// value is always in milliseconds\n// unit dropdown: ms → s → m → hr`}>
        <DurationInputView value={v1} onChange={setV1} />
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', alignSelf: 'center' }}>= {v1} ms</span>
      </Row>
      <Row label="Pre-set to 5 s — click unit dropdown to switch" align="flex-start" code={`// 5 seconds = 5000 ms\n<DurationInputView value={5000} onChange={v => console.log(v + 'ms')} />`}>
        <DurationInputView value={v2} onChange={setV2} />
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', alignSelf: 'center' }}>= {v2} ms</span>
      </Row>
      <Row label="Pre-set to 2 m" align="flex-start" code={`// 2 minutes = 120000 ms\n<DurationInputView value={120000} onChange={setTimeout} />`}>
        <DurationInputView value={v3} onChange={setV3} />
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', alignSelf: 'center' }}>= {v3} ms</span>
      </Row>
    </div>
  );
}

// ─── E6.176 — TabView ─────────────────────────────────────────────────────────

const PILL_TABS: TabItem[] = [
  { id: 'params',  label: 'Params',  badge: 3 },
  { id: 'headers', label: 'Headers', badge: 5 },
  { id: 'body',    label: 'Body',    dot: true, dotColor: 'var(--color-warning)' },
  { id: 'auth',    label: 'Auth' },
];

export function TabsPanel() {
  const [a1, setA1] = useState('params');
  const [a2, setA2] = useState('params');
  const [a3, setA3] = useState('params');
  const [a4, setA4] = useState('params');
  return (
    <div>
      <Row label='variant="pill" (default) — sliding background indicator' code={`<TabView\n  tabs={[\n    { id: 'params',  label: 'Params',  badge: 3 },\n    { id: 'headers', label: 'Headers', badge: 5 },\n    { id: 'body',    label: 'Body',    dot: true, dotColor: 'var(--color-warning)' },\n    { id: 'auth',    label: 'Auth' },\n  ]}\n  activeTab={active}\n  onChange={setActive}\n  variant="pill"\n/>`}>
        <TabView tabs={PILL_TABS} activeTab={a1} onChange={setA1} />
      </Row>
      <Row label='variant="underline" — sliding underline indicator' code={`<TabView tabs={tabs} activeTab={active} onChange={setActive} variant="underline" />`}>
        <TabView tabs={PILL_TABS} activeTab={a2} onChange={setA2} variant="underline" />
      </Row>
      <Row label="Protocol accent colors — pill variant" code={`<TabView tabs={restTabs} activeTab={active} onChange={setActive} accentColor="var(--color-protocol-rest)" />\n<TabView tabs={gqlTabs}  activeTab={active} onChange={setActive} accentColor="var(--color-protocol-graphql)" />`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TabView tabs={[{ id: 'a', label: 'Request' }, { id: 'b', label: 'Response' }, { id: 'c', label: 'Scripts' }]} activeTab={a3} onChange={setA3} accentColor="var(--color-protocol-rest)" />
          <TabView tabs={[{ id: 'a', label: 'Query' }, { id: 'b', label: 'Variables' }, { id: 'c', label: 'Schema' }]} activeTab={a4} onChange={setA4} accentColor="var(--color-protocol-graphql)" />
        </div>
      </Row>
      <Row label="Size sm vs md" code={`<TabView tabs={tabs} activeTab={active} onChange={setActive} size="sm" />\n<TabView tabs={tabs} activeTab={active} onChange={setActive} size="md" />`}>
        <TabView tabs={PILL_TABS} activeTab={a1} onChange={setA1} size="sm" />
        <TabView tabs={PILL_TABS} activeTab={a1} onChange={setA1} size="md" />
      </Row>
    </div>
  );
}

// ─── E6.176 — HighlightedInputView ───────────────────────────────────────────

const URL_SUGGESTIONS = [
  'https://api.example.com/users',
  'https://api.example.com/products',
  'https://jsonplaceholder.typicode.com/posts',
  'https://httpbin.org/get',
  'https://httpbin.org/post',
];

export function HighlightedInputPanel() {
  const [url1, setUrl1] = useState('https://api.example.com/{{env}}/users/{{userId}}');
  const [url2, setUrl2] = useState('');
  const [url3, setUrl3] = useState('https://{{baseUrl}}/v{{version}}/items');
  return (
    <div>
      <Row label="URL bar style (height=36, borderRadius=0) — {{variable}} tokens highlighted" code={`<HighlightedInputView\n  value={url}\n  onChange={setUrl}\n  placeholder="https://api.example.com/{{env}}/users"\n  suggestions={urlHistory}\n/>`}>
        <div style={{ width: '100%', display: 'flex' }}>
          <HighlightedInputView
            value={url1}
            onChange={setUrl1}
            placeholder="Enter URL…"
            suggestions={URL_SUGGESTIONS}
            style={{ flex: 1 }}
          />
        </div>
      </Row>
      <Row label="Rounded variant (height=32, borderRadius=6) — for standalone use" code={`<HighlightedInputView\n  value={url}\n  onChange={setUrl}\n  height={32}\n  borderRadius={6}\n  placeholder="/{{version}}/users/{{id}}"\n/>`}>
        <div style={{ width: '100%', display: 'flex' }}>
          <HighlightedInputView
            value={url3}
            onChange={setUrl3}
            placeholder="https://{{baseUrl}}/…"
            height={32}
            borderRadius={6}
            suggestions={URL_SUGGESTIONS}
            style={{ flex: 1 }}
          />
        </div>
      </Row>
      <Row label="With autocomplete — start typing a URL to see suggestions" code={`<HighlightedInputView\n  value={url}\n  onChange={setUrl}\n  placeholder="https://…"\n  suggestions={urlHistory}  // string[]\n/>`}>
        <div style={{ width: '100%', display: 'flex' }}>
          <HighlightedInputView
            value={url2}
            onChange={setUrl2}
            placeholder="https://…"
            suggestions={URL_SUGGESTIONS}
            style={{ flex: 1 }}
          />
        </div>
      </Row>
    </div>
  );
}

// ─── E6.176 — KeyValueTableView ──────────────────────────────────────────────

function newKvRow(): KeyValueTableRow { return { id: crypto.randomUUID(), key: '', value: '', description: '', enabled: true }; }

const PINNED_ROWS: PinnedKeyValueRow[] = [
  { id: 'auth', key: 'Authorization', value: 'Bearer eyJhbGciOiJIUzI1NiJ9...', description: 'Set via Auth tab', masked: true, deletable: true },
  { id: 'ct',   key: 'Content-Type',  value: 'application/json',               description: 'Set by body type' },
];

export function KeyValueTablePanel() {
  const [headers, setHeaders] = useState<KeyValueTableRow[]>([
    { id: '1', key: 'Content-Type',  value: 'application/json', description: 'Sets the content type of the request body', enabled: true },
    { id: '2', key: 'Authorization', value: 'Bearer {{token}}', description: 'JWT auth token for protected endpoints',    enabled: true },
    { id: '3', key: 'X-Request-ID',  value: '{{requestId}}',    description: 'Unique request correlation ID',             enabled: false },
    newKvRow(),
  ]);
  const [params, setParams] = useState<KeyValueTableRow[]>([
    { id: 'p1', key: 'page',  value: '1',    enabled: true },
    { id: 'p2', key: 'limit', value: '20',   enabled: true },
    { id: 'p3', key: 'sort',  value: 'name', enabled: false },
    newKvRow(),
  ]);
  const [pinnedRows] = useState<PinnedKeyValueRow[]>(PINNED_ROWS);
  const [userRows, setUserRows] = useState<KeyValueTableRow[]>([
    { id: 'h1', key: 'X-Api-Key', value: '{{api_key}}', enabled: true },
    newKvRow(),
  ]);

  return (
    <div>
      {/* Request Headers — maskSensitive + autocompleteKeys + accentColor */}
      <Row label="Request Headers — maskSensitive · autocompleteKeys · InsertRowDivider on hover" gap={0} align="flex-start" code={`<KeyValueTableView\n  rows={headers}\n  onChange={setHeaders}\n  label="Request Headers"\n  maskSensitive\n  autocompleteKeys\n  accentColor="var(--color-protocol-rest)"\n  placeholder={{ key: 'Header', value: 'Value' }}\n/>`}>
        <KeyValueTableView
          rows={headers}
          onChange={setHeaders}
          label="Request Headers"
          maskSensitive
          autocompleteKeys
          accentColor="var(--color-protocol-rest)"
          placeholder={{ key: 'Header', value: 'Value' }}
        />
      </Row>

      {/* Query Parameters — different accent color */}
      <Row label="Query Parameters" gap={0} align="flex-start" code={`<KeyValueTableView\n  rows={params}\n  onChange={setParams}\n  label="Query Parameters"\n  accentColor="var(--color-protocol-graphql)"\n  placeholder={{ key: 'Parameter', value: 'Value' }}\n/>`}>
        <KeyValueTableView
          rows={params}
          onChange={setParams}
          label="Query Parameters"
          accentColor="var(--color-protocol-graphql)"
          placeholder={{ key: 'Parameter', value: 'Value' }}
        />
      </Row>

      {/* showDescription — 3-column Key / Value / Description layout */}
      <Row label="showDescription — 3-column layout · Key · Value · Description (stored in DB, not sent in request)" gap={0} align="flex-start" code={`<KeyValueTableView\n  rows={headers}\n  onChange={setHeaders}\n  showDescription\n  maskSensitive\n  label="Headers"\n  placeholder={{ key: 'Header', value: 'Value' }}\n/>`}>
        <KeyValueTableView
          rows={headers}
          onChange={setHeaders}
          showDescription
          maskSensitive
          label="Headers"
          placeholder={{ key: 'Header', value: 'Value' }}
        />
      </Row>

      {/* pinnedTopRows — computed system headers above editable list */}
      <Row label="pinnedTopRows — auto-computed rows · eye toggle · lock icon · dashed border · optional deletable" gap={0} align="flex-start" code={`const pinnedRows: PinnedKeyValueRow[] = [\n  { id: 'auth', key: 'Authorization', value: 'Bearer ...', masked: true, deletable: true },\n  { id: 'ct',   key: 'Content-Type',  value: 'application/json' },\n];\n<KeyValueTableView\n  rows={userRows}\n  onChange={setUserRows}\n  maskSensitive\n  pinnedTopRows={pinnedRows}\n  onPinnedRemove={id => removePinned(id)}\n  label="Headers"\n/>`}>
        <KeyValueTableView
          rows={userRows}
          onChange={setUserRows}
          maskSensitive
          pinnedTopRows={pinnedRows}
          onPinnedRemove={() => {}}
          label="Headers"
          accentColor="var(--color-protocol-rest)"
        />
      </Row>

      {/* HiddenKeyValueItemView — standalone read-only system rows */}
      <Row label="HiddenKeyValueItemView — lock icon · dashed border · masked · badge · delete action" align="flex-start" code={`<HiddenKeyValueItemView\n  keyValue="Authorization"\n  value="Bearer eyJhbGci..."\n  badge="auth"\n  badgeColor="var(--color-primary)"\n  masked\n  onDelete={() => clearAuth()}\n  deleteTitle="Clear auth"\n/>`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
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
      </Row>
    </div>
  );
}

// ─── MergedInputViewPanel ─────────────────────────────────────────────────────

const SOAP_VERSIONS = [
  { value: '1.1', label: 'SOAP 1.1', color: 'var(--color-protocol-soap, var(--color-error))' },
  { value: '1.2', label: 'SOAP 1.2', color: 'var(--color-protocol-soap, var(--color-error))' },
];

const GRPC_METHODS = [
  { value: 'UNARY',   label: 'Unary',    color: 'var(--color-protocol-grpc)' },
  { value: 'SERVER',  label: 'Server',   color: 'var(--color-protocol-grpc)' },
  { value: 'CLIENT',  label: 'Client',   color: 'var(--color-protocol-grpc)' },
  { value: 'BIDI',    label: 'BiDi',     color: 'var(--color-protocol-grpc)' },
];

export function MergedInputViewPanel() {
  const [soapVersion, setSoapVersion] = useState('1.1');
  const [soapUrl, setSoapUrl] = useState('');
  const [grpcMethod, setGrpcMethod] = useState('UNARY');
  const [grpcService, setGrpcService] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [customPrefix, setCustomPrefix] = useState('v1');
  const [showWsdlModal, setShowWsdlModal] = useState(false);

  const SOAP_SEGS: MergedInputSegment[] = [
    { type: 'select', value: soapVersion, options: SOAP_VERSIONS, onChange: setSoapVersion, width: 96 },
    { type: 'divider' },
    {
      type: 'button',
      label: 'WSDL',
      icon: <UploadIcon size={10} />,
      onClick: () => setShowWsdlModal(true),
      accentColor: 'var(--color-protocol-soap, var(--color-error))',
    },
    { type: 'divider' },
    { type: 'text', value: soapUrl, onChange: setSoapUrl, placeholder: 'https://service.example.com/endpoint' },
  ];

  const GRPC_SEGS: MergedInputSegment[] = [
    { type: 'select', value: grpcMethod, options: GRPC_METHODS, onChange: setGrpcMethod, width: 80 },
    { type: 'divider' },
    { type: 'text', value: grpcService, onChange: setGrpcService, placeholder: 'package.ServiceName/Method' },
  ];

  const CUSTOM_SEGS: MergedInputSegment[] = [
    {
      type: 'custom',
      width: 48,
      content: (
        <div
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--color-primary)',
            cursor: 'pointer',
            userSelect: 'none',
          }}
          onClick={() => setCustomPrefix(p => p === 'v1' ? 'v2' : 'v1')}
        >
          {customPrefix}
        </div>
      ),
    },
    { type: 'divider' },
    { type: 'text', value: customUrl, onChange: setCustomUrl, placeholder: '/users/{{userId}}/profile' },
  ];

  return (
    <div>
      <Row
        label="SOAP URL bar — version selector + WSDL upload button + endpoint"
        align="flex-start"
        code={`<MergedInputView\n  segments={[\n    { type: 'select', value: version, options: SOAP_VERSIONS, onChange: setVersion, width: 96 },\n    { type: 'divider' },\n    { type: 'button', label: 'WSDL', icon: <UploadIcon size={10} />, onClick: openWsdl,\n      accentColor: 'var(--color-protocol-soap)' },\n    { type: 'divider' },\n    { type: 'text', value: url, onChange: setUrl, placeholder: 'https://service.example.com/endpoint' },\n  ]}\n  accentColor="var(--color-protocol-soap)"\n/>`}
      >
        <div style={{ width: '100%', maxWidth: 600 }}>
          <MergedInputView
            segments={SOAP_SEGS}
            accentColor="var(--color-protocol-soap, var(--color-error))"
          />
        </div>
      </Row>

      <Row
        label="gRPC bar — method selector + service path input"
        align="flex-start"
        code={`<MergedInputView\n  segments={[\n    { type: 'select', value: method, options: GRPC_METHODS, onChange: setMethod, width: 80 },\n    { type: 'divider' },\n    { type: 'text', value: service, onChange: setService, placeholder: 'package.ServiceName/Method' },\n  ]}\n  accentColor="var(--color-protocol-grpc)"\n/>`}
      >
        <div style={{ width: '100%', maxWidth: 600 }}>
          <MergedInputView
            segments={GRPC_SEGS}
            accentColor="var(--color-protocol-grpc)"
          />
        </div>
      </Row>

      <Row
        label="Custom content slot — clickable version badge + URL input"
        align="flex-start"
        code={`<MergedInputView\n  segments={[\n    { type: 'custom', width: 48, content: <VersionBadge /> },\n    { type: 'divider' },\n    { type: 'text', value: url, onChange: setUrl, placeholder: '/users/{{userId}}/profile' },\n  ]}\n/>`}
      >
        <div style={{ width: '100%', maxWidth: 600 }}>
          <MergedInputView segments={CUSTOM_SEGS} />
        </div>
      </Row>

      <Row
        label="Small size (sm)"
        align="flex-start"
        code={`<MergedInputView\n  segments={[\n    { type: 'select', value: version, options: SOAP_VERSIONS, onChange: setVersion, width: 80 },\n    { type: 'divider' },\n    { type: 'text', value: url, onChange: setUrl, placeholder: 'Endpoint URL' },\n  ]}\n  size="sm"\n  accentColor="var(--color-protocol-soap)"\n/>`}
      >
        <div style={{ width: '100%', maxWidth: 400 }}>
          <MergedInputView
            segments={[
              { type: 'select', value: soapVersion, options: SOAP_VERSIONS, onChange: setSoapVersion, width: 80 },
              { type: 'divider' },
              { type: 'text', value: soapUrl, onChange: setSoapUrl, placeholder: 'Endpoint URL' },
            ]}
            size="sm"
            accentColor="var(--color-protocol-soap, var(--color-error))"
          />
        </div>
      </Row>

      <Row
        label="Large size (lg)"
        align="flex-start"
        code={`<MergedInputView\n  segments={[\n    { type: 'select', value: method, options: GRPC_METHODS, onChange: setMethod, width: 90 },\n    { type: 'divider' },\n    { type: 'button', label: 'Proto', icon: <UploadIcon size={11} />,\n      onClick: openProto, accentColor: 'var(--color-protocol-grpc)' },\n    { type: 'divider' },\n    { type: 'text', value: service, onChange: setService, placeholder: 'localhost:50051' },\n  ]}\n  size="lg"\n  accentColor="var(--color-protocol-grpc)"\n/>`}
      >
        <div style={{ width: '100%', maxWidth: 700 }}>
          <MergedInputView
            segments={[
              { type: 'select', value: grpcMethod, options: GRPC_METHODS, onChange: setGrpcMethod, width: 90 },
              { type: 'divider' },
              { type: 'button', label: 'Proto', icon: <UploadIcon size={11} />, onClick: () => {}, accentColor: 'var(--color-protocol-grpc)' },
              { type: 'divider' },
              { type: 'text', value: grpcService, onChange: setGrpcService, placeholder: 'localhost:50051' },
            ]}
            size="lg"
            accentColor="var(--color-protocol-grpc)"
          />
        </div>
      </Row>

      <Row
        label="MergeDivider standalone (as visual separator reference)"
        code={`// MergeDivider is the thin vertical separator used between segments\nimport { MergeDivider } from './MergedInputView';\n\n<div style={{ display: 'flex', alignItems: 'center', gap: 8,\n  border: '1px solid var(--color-input-border)', borderRadius: 6,\n  background: 'var(--color-input-bg)', padding: '0 8px', height: 34 }}>\n  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-protocol-rest)' }}>GET</span>\n  <MergeDivider />\n  <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>https://api.example.com/users</span>\n</div>`}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--color-input-border)', borderRadius: 6, background: 'var(--color-input-bg)', padding: '0 8px', height: 34 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-protocol-rest)' }}>GET</span>
          <MergeDivider />
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>https://api.example.com/users</span>
        </div>
      </Row>

      {showWsdlModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-surface-border)',
              borderRadius: 10,
              padding: '24px 28px',
              minWidth: 320,
              maxWidth: 440,
              boxShadow: '0 16px 48px rgba(0,0,0,0.35)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>Upload WSDL File</span>
              <button
                type="button"
                onClick={() => setShowWsdlModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 }}
              >
                <CloseIcon size={16} />
              </button>
            </div>
            <div
              style={{
                border: '2px dashed var(--color-input-border)',
                borderRadius: 8,
                padding: '32px 16px',
                textAlign: 'center',
                color: 'var(--color-text-muted)',
                fontSize: 12,
              }}
            >
              <UploadIcon size={24} style={{ marginBottom: 8, opacity: 0.5 }} />
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Drop your WSDL file here</div>
              <div style={{ fontSize: 11 }}>or click to browse — .wsdl / .xml</div>
            </div>
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowWsdlModal(false)}
                style={{
                  fontSize: 11, padding: '5px 14px', borderRadius: 4,
                  border: '1px solid var(--color-btn-secondary-border)',
                  background: 'var(--color-btn-secondary-bg)',
                  color: 'var(--color-text-primary)', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── HudView ─────────────────────────────────────────────────────────────────

const DEBUG_HUD_ITEMS: HudItem[] = [
  { id: 'continue', icon: <PlayIcon size={13} />, title: 'Continue (F5)' },
  { id: 'step-over', icon: <StepOverIcon size={13} />, title: 'Step Over (F10)', separator: true },
  { id: 'step-into', icon: <StepIntoIcon size={13} />, title: 'Step Into (F11)' },
  { id: 'step-out', icon: <StepOutIcon size={13} />, title: 'Step Out (Shift+F11)' },
  { id: 'restart', icon: <RestartIcon size={13} />, title: 'Restart (Ctrl+Shift+F5)', separator: true },
  { id: 'stop', icon: <StopSquareIcon size={13} />, title: 'Stop (Shift+F5)' },
];

const TOOLBAR_HUD_ITEMS: HudItem[] = [
  { id: 'save', icon: <SaveIcon size={13} />, title: 'Save' },
  { id: 'copy', icon: <CopyIcon size={13} />, title: 'Copy' },
  { id: 'refresh', icon: <RefreshIcon size={13} />, title: 'Refresh', separator: true },
  { id: 'download', icon: <DownloadIcon size={13} />, title: 'Download' },
  { id: 'trash', icon: <TrashIcon size={13} />, title: 'Delete', separator: true },
];

export function HudViewPanel() {
  const [muteActive, setMuteActive] = useState(false);

  const itemsWithMute: HudItem[] = [
    ...DEBUG_HUD_ITEMS,
    {
      id: 'mute',
      icon: <MuteBreakpointsIcon size={13} />,
      title: muteActive ? 'Unmute Breakpoints' : 'Mute Breakpoints',
      active: muteActive,
      separator: true,
      onClick: () => setMuteActive(v => !v),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Shared stage — all 3 HUDs visible at once, left / center / right */}
      <div style={{
        border: '1px dashed var(--color-surface-border)',
        borderRadius: 8,
        background: 'color-mix(in srgb, var(--color-text-primary) 2%, transparent)',
        padding: '28px 20px 16px',
        position: 'relative',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: 16,
      }}>
        <span style={{
          position: 'absolute', top: 8, left: 12,
          fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'var(--color-text-muted)',
        }}>
          In real use these float fixed to the viewport and are draggable
        </span>

        {/* ① Debug HUD — left */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
          <HudView items={itemsWithMute} status={muteActive ? 'Breakpoints muted' : 'Paused — Line 42'} contained />
          <span style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>① Debug — click bug icon to toggle mute</span>
        </div>

        {/* ② Toolbar HUD — center */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <HudView items={TOOLBAR_HUD_ITEMS} status="3 files selected" contained />
          <span style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>② Toolbar — default accentColor</span>
        </div>

        {/* ③ Custom accent — right */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <HudView
            accentColor="var(--color-success)"
            items={[
              { id: 'play', icon: <PlayIcon size={13} />, title: 'Run' },
              { id: 'stop', icon: <StopSquareIcon size={13} />, title: 'Stop', disabled: true },
              { id: 'restart', icon: <RestartIcon size={13} />, title: 'Restart', separator: true },
            ]}
            status="Ready"
            contained
          />
          <span style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>③ Custom accentColor</span>
        </div>
      </div>

      {/* ① code */}
      <Row
        label="① Debug HUD — store-free counterpart of DebugHud, draggable in real use"
        code={`const items: HudItem[] = [\n  { id: 'continue', icon: <PlayIcon size={13} />, title: 'Continue (F5)' },\n  { id: 'step-over', icon: <StepOverIcon size={13} />, title: 'Step Over (F10)', separator: true },\n  { id: 'step-into', icon: <StepIntoIcon size={13} />, title: 'Step Into (F11)' },\n  { id: 'restart', icon: <RestartIcon size={13} />, title: 'Restart', separator: true },\n  { id: 'stop', icon: <StopSquareIcon size={13} />, title: 'Stop (Shift+F5)' },\n  { id: 'mute', icon: <MuteBreakpointsIcon size={13} />, title: 'Mute BP', active: muted, onClick: () => setMuted(v => !v), separator: true },\n];\n\n// Drop anywhere — floats fixed to the viewport, drag the grip to reposition\n<HudView items={items} status="Paused — Line 42" />`}
      >
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>See ① in the stage above</span>
      </Row>

      {/* ② code */}
      <Row
        label="② Generic toolbar — any icon + action set, uses --color-primary border"
        code={`<HudView\n  items={[\n    { id: 'save',     icon: <SaveIcon size={13} />,     title: 'Save' },\n    { id: 'copy',     icon: <CopyIcon size={13} />,     title: 'Copy' },\n    { id: 'refresh',  icon: <RefreshIcon size={13} />,  title: 'Refresh', separator: true },\n    { id: 'download', icon: <DownloadIcon size={13} />, title: 'Download' },\n    { id: 'trash',    icon: <TrashIcon size={13} />,    title: 'Delete', separator: true },\n  ]}\n  status="3 files selected"\n/>`}
      >
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>See ② in the stage above</span>
      </Row>

      {/* ③ code */}
      <Row
        label="③ Custom accentColor — border + glow + active tint all inherit the color"
        code={`<HudView\n  accentColor="var(--color-success)"\n  items={[\n    { id: 'play',    icon: <PlayIcon size={13} />,        title: 'Run' },\n    { id: 'stop',    icon: <StopSquareIcon size={13} />,  title: 'Stop', disabled: true },\n    { id: 'restart', icon: <RestartIcon size={13} />,     title: 'Restart', separator: true },\n  ]}\n  status="Ready"\n/>`}
      >
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>See ③ in the stage above</span>
      </Row>

    </div>
  );
}

// ─── CollapsibleSectionView ───────────────────────────────────────────────────

export function CollapsibleSectionPanel() {
  const [varExpanded, setVarExpanded] = useState(true);
  const [watchExpanded, setWatchExpanded] = useState(true);
  const [bpExpanded, setBpExpanded] = useState(true);
  const [plainExpanded, setPlainExpanded] = useState(true);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Row
        label="Colored chip title with badge — debugger-style sections"
        code={`<CollapsibleSectionView\n  title="Variables"\n  expanded={true}\n  onToggle={() => {}}\n  accentColor="var(--color-debug-key)"\n  badge={3}\n>\n  {/* content */}\n</CollapsibleSectionView>`}
      >
        <div style={{ border: '1px solid var(--color-surface-border)', borderRadius: 6, overflow: 'hidden' }}>
          <CollapsibleSectionView title="Variables" expanded={varExpanded} onToggle={() => setVarExpanded(v => !v)} accentColor="var(--color-debug-key)" badge={3}>
            <div style={{ padding: '8px 16px', fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Local variables appear here during debug</div>
          </CollapsibleSectionView>
          <CollapsibleSectionView title="Watch" expanded={watchExpanded} onToggle={() => setWatchExpanded(v => !v)} accentColor="var(--color-warning)" badge={2}
            headerRight={
              <button type="button" style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--color-warning)', cursor: 'pointer', fontSize: 16, fontWeight: 700 }} title="Add expression">+</button>
            }
          >
            <div style={{ padding: '6px 16px', fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No expressions added</div>
          </CollapsibleSectionView>
          <CollapsibleSectionView title="Breakpoints" expanded={bpExpanded} onToggle={() => setBpExpanded(v => !v)} accentColor="var(--color-error)" badge={1}>
            <div style={{ padding: '6px 16px', fontSize: 11, color: 'var(--color-text-muted)' }}>Line 12 — pre-request.js</div>
          </CollapsibleSectionView>
        </div>
      </Row>

      <Row
        label="No accentColor — plain chevron section"
        code={`<CollapsibleSectionView\n  title="Settings"\n  expanded={true}\n  onToggle={() => {}}\n>\n  {/* content */}\n</CollapsibleSectionView>`}
      >
        <div style={{ border: '1px solid var(--color-surface-border)', borderRadius: 6, overflow: 'hidden' }}>
          <CollapsibleSectionView title="Settings" expanded={plainExpanded} onToggle={() => setPlainExpanded(v => !v)}>
            <div style={{ padding: '8px 16px', fontSize: 11, color: 'var(--color-text-muted)' }}>Any content goes here</div>
          </CollapsibleSectionView>
        </div>
      </Row>
    </div>
  );
}

// ─── JsonTreeView ─────────────────────────────────────────────────────────────

const SAMPLE_JSON = {
  user: {
    id: 42,
    name: 'Alice',
    roles: ['admin', 'editor'],
    address: { city: 'Austin', zip: '78701' },
    active: true,
    notes: null,
  },
  meta: { version: '2.1.0', timestamp: 1718000000000 },
};

export function JsonTreeViewPanel() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Row
        label="Object tree — defaultExpandDepth=2 (nested up to depth 2 open by default)"
        code={`<JsonTreeView\n  data={{\n    user: { id: 42, name: 'Alice', roles: ['admin', 'editor'], active: true, notes: null },\n    meta: { version: '2.1.0', timestamp: 1718000000000 },\n  }}\n  defaultExpandDepth={2}\n/>`}
      >
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', borderRadius: 6, padding: '8px 4px' }}>
          <JsonTreeView data={SAMPLE_JSON} defaultExpandDepth={2} />
        </div>
      </Row>

      <Row
        label="Named root — single value with label"
        code={`<JsonTreeView name="response" data={{ status: 200, body: { ok: true } }} defaultExpandDepth={1} />`}
      >
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', borderRadius: 6, padding: '8px 4px' }}>
          <JsonTreeView name="response" data={{ status: 200, body: { ok: true, items: [1, 2, 3] } }} defaultExpandDepth={1} />
        </div>
      </Row>

      <Row
        label="Primitive values — type color mapping"
        code={`<JsonTreeView data={{\n  str: 'hello world',\n  num: 3.14,\n  bool: false,\n  nil: null,\n  fn: '<Function: handler>',\n}} defaultExpandDepth={1} />`}
      >
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', borderRadius: 6, padding: '8px 4px' }}>
          <JsonTreeView
            data={{ str: 'hello world', num: 3.14, bool: false, nil: null, fn: '<Function: handler>' }}
            defaultExpandDepth={1}
          />
        </div>
      </Row>
    </div>
  );
}

// ─── ExpandableLogEntryView ───────────────────────────────────────────────────

const NOW = Date.now();

export function ExpandableLogEntryPanel() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Row
        label="Network request log — Request Sent / Response Received / Summary"
        code={`<ExpandableLogEntryView\n  icon={<ArrowUpRightIcon size={13} />}\n  title="Request Sent"\n  badge="POST"\n  badgeColor="var(--color-method-post)"\n  timestamp={Date.now()}\n>\n  {/* detail content */}\n</ExpandableLogEntryView>`}
      >
        <div style={{ border: '1px solid var(--color-surface-border)', borderRadius: 6, overflow: 'hidden' }}>
          <ExpandableLogEntryView
            icon={<ArrowUpRightIcon size={13} style={{ color: 'var(--color-protocol-websocket)' }} />}
            title="Request Sent"
            badge="POST"
            badgeColor="var(--color-method-post)"
            timestamp={NOW - 1200}
            defaultExpanded
          >
            <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--color-text-primary)' }}>
              POST https://api.example.com/v2/users
            </div>
          </ExpandableLogEntryView>
          <ExpandableLogEntryView
            icon={<ArrowDownLeftIcon size={13} style={{ color: 'var(--color-protocol-graphql)' }} />}
            title="Response Received"
            badge="201 Created"
            badgeColor="var(--color-success)"
            timestamp={NOW - 400}
          >
            <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>
              Content-Type: application/json · 342B
            </div>
          </ExpandableLogEntryView>
          <ExpandableLogEntryView
            icon={<InfoCircleIcon size={13} style={{ color: 'var(--color-success)' }} />}
            title="Completed"
            badge="812ms"
            badgeColor="var(--color-success)"
            timestamp={NOW}
          >
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Duration: 812ms · Size: 342B</div>
          </ExpandableLogEntryView>
        </div>
      </Row>

      <Row
        label="Error state — expanded by default (bad status)"
        code={`<ExpandableLogEntryView\n  icon={<InfoCircleIcon size={13} style={{ color: 'var(--color-error)' }} />}\n  title="Failed"\n  badge="ECONNREFUSED"\n  badgeColor="var(--color-error)"\n  timestamp={Date.now()}\n  defaultExpanded\n>\n  {/* error detail */}\n</ExpandableLogEntryView>`}
      >
        <div style={{ border: '1px solid var(--color-surface-border)', borderRadius: 6, overflow: 'hidden' }}>
          <ExpandableLogEntryView
            icon={<InfoCircleIcon size={13} style={{ color: 'var(--color-error)' }} />}
            title="Failed"
            badge="ECONNREFUSED"
            badgeColor="var(--color-error)"
            timestamp={NOW}
            defaultExpanded
          >
            <pre style={{ fontSize: 10, color: 'var(--color-error)', fontFamily: 'monospace', margin: 0, padding: '6px 8px', background: 'color-mix(in srgb, var(--color-error) 6%, transparent)', borderRadius: 4 }}>
              AggregateError [ECONNREFUSED]: All promises were rejected
            </pre>
          </ExpandableLogEntryView>
        </div>
      </Row>

      <Row
        label="No timestamp — minimal usage"
        code={`<ExpandableLogEntryView\n  icon={<ChevronRightIcon size={13} />}\n  title="Step completed"\n  badge="42ms"\n  badgeColor="var(--color-primary)"\n>\n  {/* detail */}\n</ExpandableLogEntryView>`}
      >
        <div style={{ border: '1px solid var(--color-surface-border)', borderRadius: 6, overflow: 'hidden' }}>
          <ExpandableLogEntryView
            icon={<ChevronRightIcon size={13} style={{ color: 'var(--color-primary)' }} />}
            title="Step completed"
            badge="42ms"
            badgeColor="var(--color-primary)"
          >
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Pre-request script ran successfully</div>
          </ExpandableLogEntryView>
        </div>
      </Row>
    </div>
  );
}

// ─── CopyButtonView panel ─────────────────────────────────────────────────────

export function CopyButtonPanel() {
  return (
    <div>
      <Row label="Default — copies text on click (check to clipboard)">
        <CopyButtonView text="Hello, world!" />
        <CopyButtonView text="import { CopyButtonView } from 'dui';" />
        <CopyButtonView text="Bearer eyJhbGci..." title="Copy token" size={15} />
      </Row>
      <Row label="Accent colors">
        <CopyButtonView text="primary" accentColor="var(--color-primary)" title="Copy (primary)" />
        <CopyButtonView text="error" accentColor="var(--color-error)" title="Copy (error)" />
        <CopyButtonView text="warning" accentColor="var(--color-warning)" title="Copy (warning)" />
        <CopyButtonView text="success" accentColor="var(--color-success)" title="Copy (success)" />
      </Row>
      <Row label="Custom size">
        <CopyButtonView text="small (10)" size={10} />
        <CopyButtonView text="default (14)" size={14} />
        <CopyButtonView text="large (18)" size={18} />
        <CopyButtonView text="xl (22)" size={22} />
      </Row>
      <Row label="Inline usage — alongside a code snippet">
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', borderRadius: 6, padding: '4px 8px' }}>
          <code style={{ fontSize: 11, color: 'var(--color-text-primary)', flex: 1 }}>npm install daakia</code>
          <CopyButtonView text="npm install daakia" size={13} />
        </div>
      </Row>
    </div>
  );
}

// ─── MarkdownView panel ───────────────────────────────────────────────────────

const MD_SAMPLE = `## MarkdownView Demo

This is a **bold** statement and _italic_ emphasis.

### Code block (syntax highlighted)

\`\`\`typescript
interface DuiComponent {
  style?: React.CSSProperties;
  className?: string;
  children?: React.ReactNode;
}
\`\`\`

### Inline code

Use \`var(--color-primary)\` for accent colors.

### Table

| Prop | Type | Default |
|---|---|---|
| content | string | — |
| className | string | '' |
| style | CSSProperties | — |

### Task list

- [x] No hardcoded colors
- [x] No inline SVGs
- [ ] Deploy to production

> **Tip**: MarkdownView renders GFM (GitHub Flavored Markdown) with syntax highlighting via highlight.js.
`;

export function MarkdownViewPanel() {
  const [content, setContent] = useState(MD_SAMPLE);
  return (
    <div>
      <Row label="Rendered output — GFM + syntax highlighting + copy buttons" align="flex-start">
        <MarkdownView content={content} style={{ flex: 1, minWidth: 0 }} />
      </Row>
      <Row label="Live edit — modify the markdown" align="flex-start">
        <div style={{ display: 'flex', gap: 16, width: '100%', minWidth: 0 }}>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            style={{
              flex: 1, minWidth: 0, minHeight: 300, fontFamily: 'monospace', fontSize: 11,
              background: 'var(--color-surface)', color: 'var(--color-text-primary)',
              border: '1px solid var(--color-surface-border)', borderRadius: 6,
              padding: 12, resize: 'vertical', outline: 'none',
            }}
          />
          <MarkdownView content={content} style={{ flex: 1, minWidth: 0 }} />
        </div>
      </Row>
    </div>
  );
}

// ─── FormDataTableView panel ──────────────────────────────────────────────────

const INIT_ROWS: FormDataRow[] = [
  { id: '1', key: 'username', value: 'john_doe', type: 'text', enabled: true },
  { id: '2', key: 'token', value: 'abc123', type: 'text', enabled: true },
  { id: '3', key: 'avatar', value: '', type: 'file', enabled: true },
];

export function FormDataTablePanel() {
  const [rows, setRows] = useState<FormDataRow[]>(INIT_ROWS);
  const [disabledRows, setDisabledRows] = useState<FormDataRow[]>([
    { id: 'd1', key: 'field_a', value: 'value_a', type: 'text', enabled: false },
    { id: 'd2', key: 'upload', value: '', type: 'file', enabled: true },
  ]);

  return (
    <div>
      <Row label="Default — text + file rows with toolbar" align="flex-start">
        <div style={{ width: '100%' }}>
          <FormDataTableView rows={rows} onChange={setRows} label="Form Data" />
        </div>
      </Row>
      <Row label="Disabled rows — toggle enabled state" align="flex-start">
        <div style={{ width: '100%' }}>
          <FormDataTableView rows={disabledRows} onChange={setDisabledRows} label="With disabled row" />
        </div>
      </Row>
      <Row label="No toolbar (hideToolbar)" align="flex-start">
        <div style={{ width: '100%' }}>
          <FormDataTableView
            rows={[{ id: 'x1', key: 'api_key', value: 'sk-...', type: 'text', enabled: true }]}
            onChange={() => {}}
            hideToolbar
          />
        </div>
      </Row>
      <Row label="Custom accent color" align="flex-start">
        <div style={{ width: '100%' }}>
          <FormDataTableView
            rows={[
              { id: 'g1', key: 'file', value: '', type: 'file', enabled: true },
              { id: 'g2', key: 'name', value: '', type: 'text', enabled: true },
            ]}
            onChange={() => {}}
            accentColor="var(--color-graphql)"
            label="GraphQL Upload"
          />
        </div>
      </Row>
    </div>
  );
}

// ─── YamlKeyChip panel ────────────────────────────────────────────────────────

export function YamlKeyChipPanel() {
  return (
    <div>
      <Row label="Default — monospace theme-key badges">
        <YamlKeyChip yamlKey="brand.primary" />
        <YamlKeyChip yamlKey="component.button.bg" />
        <YamlKeyChip yamlKey="surface.elevated" />
        <YamlKeyChip yamlKey="text.muted" />
      </Row>
      <Row label="Custom accent colors">
        <YamlKeyChip yamlKey="rest.accent" color="var(--color-rest)" />
        <YamlKeyChip yamlKey="graphql.accent" color="var(--color-graphql)" />
        <YamlKeyChip yamlKey="success.token" color="var(--color-success)" />
        <YamlKeyChip yamlKey="error.token" color="var(--color-error)" />
        <YamlKeyChip yamlKey="warning.token" color="var(--color-warning)" />
      </Row>
      <Row label="Clickable — used inside LiveColorCustomizer">
        <YamlKeyChip yamlKey="brand.primary" color="var(--color-primary)" onClick={() => {}} />
        <YamlKeyChip yamlKey="surface.panel" color="var(--color-text-muted)" onClick={() => {}} />
      </Row>
      <Row label="Inline usage — alongside color swatches">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { key: 'brand.primary', color: 'var(--color-primary)', hex: '#6366f1' },
            { key: 'status.success', color: 'var(--color-success)', hex: '#22c55e' },
            { key: 'status.error', color: 'var(--color-error)', hex: '#ef4444' },
          ].map(({ key, color, hex }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 16, height: 16, borderRadius: 4, background: color, border: '1px solid var(--color-surface-border)', flexShrink: 0 }} />
              <YamlKeyChip yamlKey={key} color={color} />
              <span style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{hex}</span>
            </div>
          ))}
        </div>
      </Row>
    </div>
  );
}

// ─── SpacerView panel ─────────────────────────────────────────────────────────

export function SpacerViewPanel() {
  return (
    <div>
      <Row
        label="Horizontal — divides groups in a vertical icon rail"
        code={`<SpacerView />\n// or explicitly:\n<SpacerView orientation="horizontal" spacing="md" />`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '6px 8px', background: 'var(--color-surface)', borderRadius: 8, border: '1px solid var(--color-surface-border)' }}>
          {['var(--color-protocol-rest)', 'var(--color-protocol-graphql)', 'var(--color-protocol-websocket)'].map((c, i) => (
            <div key={i} style={{ width: 36, height: 36, borderRadius: 8, background: `color-mix(in srgb, ${c} 20%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 30%, transparent)`, flexShrink: 0 }} />
          ))}
          <SpacerView orientation="horizontal" spacing="md" />
          {['var(--color-protocol-ai)', 'var(--color-protocol-mcp)'].map((c, i) => (
            <div key={i} style={{ width: 36, height: 36, borderRadius: 8, background: `color-mix(in srgb, ${c} 20%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 30%, transparent)`, flexShrink: 0 }} />
          ))}
        </div>
      </Row>

      <Row
        label="Vertical — divides groups in a horizontal toolbar"
        code={`<SpacerView orientation="vertical" spacing="md" />`}
      >
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 4, padding: '6px 8px', background: 'var(--color-surface)', borderRadius: 8, border: '1px solid var(--color-surface-border)' }}>
          {['var(--color-method-get)', 'var(--color-method-post)', 'var(--color-method-put)'].map((c, i) => (
            <div key={i} style={{ width: 36, height: 28, borderRadius: 6, background: `color-mix(in srgb, ${c} 20%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 30%, transparent)`, flexShrink: 0 }} />
          ))}
          <SpacerView orientation="vertical" spacing="md" />
          {['var(--color-method-delete)', 'var(--color-method-patch)'].map((c, i) => (
            <div key={i} style={{ width: 36, height: 28, borderRadius: 6, background: `color-mix(in srgb, ${c} 20%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 30%, transparent)`, flexShrink: 0 }} />
          ))}
        </div>
      </Row>

      <Row
        label="Spacing sizes — sm / md / lg"
        code={`<SpacerView orientation="horizontal" spacing="sm" />\n<SpacerView orientation="horizontal" spacing="md" />\n<SpacerView orientation="horizontal" spacing="lg" />`}
      >
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-end', gap: 24 }}>
          {(['sm', 'md', 'lg'] as const).map(s => (
            <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--color-surface-border)', flexShrink: 0 }} />
              <SpacerView orientation="horizontal" spacing={s} />
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--color-surface-border)', flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 4 }}>{s}</span>
            </div>
          ))}
        </div>
      </Row>

      <Row
        label="Real-world: sidebar icon rail with two groups"
        code={`// Icon rail — two groups separated by a spacer\n<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>\n  <IconButtonView icon={<RestApiIcon size={14} />} title="REST" />\n  <IconButtonView icon={<GraphQLIcon size={14} />} title="GraphQL" />\n  <SpacerView />\n  <IconButtonView icon={<SettingsIcon size={14} />} title="Settings" />\n</div>`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 6px', background: 'var(--color-panel)', borderRadius: 8, border: '1px solid var(--color-surface-border)', width: 48 }}>
          <div title="REST" style={{ width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--color-protocol-rest) 15%, transparent)', color: 'var(--color-protocol-rest)', fontSize: 11, fontWeight: 700 }}>R</div>
          <div title="GQL" style={{ width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--color-protocol-graphql) 12%, transparent)', color: 'var(--color-protocol-graphql)', fontSize: 11, fontWeight: 700 }}>G</div>
          <div title="WS" style={{ width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--color-protocol-websocket) 12%, transparent)', color: 'var(--color-protocol-websocket)', fontSize: 11, fontWeight: 700 }}>W</div>
          <SpacerView orientation="horizontal" spacing="md" />
          <div title="Settings" style={{ width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--color-text-muted) 10%, transparent)', color: 'var(--color-text-muted)', fontSize: 11, fontWeight: 700 }}>⚙</div>
          <div title="DevTools" style={{ width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--color-text-muted) 10%, transparent)', color: 'var(--color-text-muted)', fontSize: 11, fontWeight: 700 }}>{'</>'}</div>
        </div>
      </Row>
    </div>
  );
}

// ─── LiveColorCustomizer panel ────────────────────────────────────────────────

const DEMO_VARS: LiveColorVar[] = [
  { cssVar: '--color-primary',      yamlKey: 'brand.primary',      label: 'Primary' },
  { cssVar: '--color-success',      yamlKey: 'status.success',     label: 'Success' },
  { cssVar: '--color-error',        yamlKey: 'status.error',       label: 'Error' },
  { cssVar: '--color-warning',      yamlKey: 'status.warning',     label: 'Warning' },
  { cssVar: '--color-text-primary', yamlKey: 'text.primary',       label: 'Text Primary' },
  { cssVar: '--color-text-muted',   yamlKey: 'text.muted',         label: 'Text Muted' },
  { cssVar: '--color-surface',      yamlKey: 'surface.default',    label: 'Surface' },
  { cssVar: '--color-panel',        yamlKey: 'surface.panel',      label: 'Panel' },
];

export function LiveColorCustomizerPanel() {
  return (
    <div>
      <Row label="Live color editor — changes apply immediately to the document" align="flex-start">
        <LiveColorCustomizer vars={DEMO_VARS} />
      </Row>
    </div>
  );
}
