import { useState } from 'react';
import {
  ToggleSwitchView, CheckboxView, ModalView, LoaderView, EmptyStateView, ButtonView,
  StatusIndicatorView, InfoPopupView, ResizablePanelView, SplitPanelView, DottedCardView,
  ColoredTextView, StatsCardView, DataTableView, CodeBlockView, AIButtonView,
  SideNavView, SettingsNavView, ThemeCardSelectorView, FeatureCategoryView,
  TagInputView, BottomPanelView, ToastView, PromptCardView,
  PromptLibraryListView, PromptLibraryEditorView, EditorView,
  SearchInputView, DurationInputView, PillTabsView, SplitButtonView,
  HighlightedInputView, KeyValueTableView,
  MergedInputView, MergeDivider,
} from '../../../dui';
import type { MergedInputSegment } from '../../../dui';
import type {
  ContextMenuItem, PromptLibrarySection, PromptLibraryEditorTab,
  KeyValueTableRow, SplitButtonViewItem, PillTabItem,
} from '../../../dui';
import {
  SearchIcon, SettingsIcon, ServerIcon, LayersIcon, RestApiIcon,
  GraphQLIcon, SparkleIcon, TerminalIcon, OutputIcon, NetworkIcon,
  ClockIcon, GlobeIcon, CodeIcon, FolderIcon, DocumentIcon, CloseIcon,
  PlayIcon, SaveIcon, DownloadIcon, TrashIcon, CopyIcon, CheckIcon,
  SystemIcon, UserPromptIcon, UploadIcon,
} from '../../../icons';

// ─── Layout helpers (local) ───────────────────────────────────────────────────

function Row({ label, children, gap = 10, code, align }: { label: string; children: React.ReactNode; gap?: number; code?: string; align?: string }) {
  const [showCode, setShowCode] = useState(false);
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
      <div style={{ display: 'flex', alignItems: align ?? 'center', flexWrap: 'wrap', gap }}>
        {children}
      </div>
      {code && (
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            onClick={() => setShowCode(v => !v)}
            style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--color-surface-border)',
              background: showCode ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'transparent',
              color: showCode ? 'var(--color-primary)' : 'var(--color-text-muted)',
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'background 100ms, color 100ms',
            }}
          >{showCode ? 'Hide Code' : 'Show Code'}</button>
          {showCode && (
            <div style={{ marginTop: 6 }}>
              <CodeBlockView code={code} language="tsx" />
            </div>
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
      <Row label="Sizes sm / md / lg">
        <ToggleSwitchView checked={v1} onChange={setV1} size="sm" label="Small" />
        <ToggleSwitchView checked={v1} onChange={setV1} size="md" label="Medium" />
        <ToggleSwitchView checked={v1} onChange={setV1} size="lg" label="Large" />
      </Row>
      <Row label="On / Off state">
        <ToggleSwitchView checked={true} onChange={() => {}} label="Enabled" />
        <ToggleSwitchView checked={false} onChange={() => {}} label="Disabled" />
      </Row>
      <Row label="Disabled (dashed border)">
        <ToggleSwitchView checked={false} onChange={() => {}} disabled label="Disabled off" />
        <ToggleSwitchView checked={true} onChange={() => {}} disabled label="Disabled on" />
      </Row>
      <Row label="Protocol accent colors">
        {(['var(--color-protocol-rest)', 'var(--color-protocol-graphql)', 'var(--color-protocol-websocket)', 'var(--color-success)'] as const).map(color => (
          <ToggleSwitchView key={color} checked={v1} onChange={setV1} accentColor={color} />
        ))}
      </Row>
      <Row label="Label positions left / right">
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
  return (
    <div>
      <Row label="States checked / unchecked / indeterminate / disabled" code={`<CheckboxView checked={true}  onChange={setChecked} label="Checked" />\n<CheckboxView checked={false} onChange={setChecked} label="Unchecked" />\n<CheckboxView checked="indeterminate" onChange={setChecked} label="Indeterminate" />\n<CheckboxView checked={false} onChange={() => {}} disabled label="Disabled" />`}>
        <CheckboxView checked={true}  onChange={() => {}} label="Checked" />
        <CheckboxView checked={false} onChange={() => {}} label="Unchecked" />
        <CheckboxView checked={false} indeterminate onChange={() => {}} label="Indeterminate" />
        <CheckboxView checked={false} onChange={() => {}} disabled label="Disabled" />
        <CheckboxView checked={true}  onChange={() => {}} disabled label="Disabled checked" />
      </Row>
      <Row label="Sizes sm / md / lg" code={`<CheckboxView checked={checked} onChange={setChecked} size="sm" label="Small" />\n<CheckboxView checked={checked} onChange={setChecked} size="md" label="Medium" />\n<CheckboxView checked={checked} onChange={setChecked} size="lg" label="Large" />`}>
        <CheckboxView checked={c1} onChange={setC1} size="sm" label="Small" />
        <CheckboxView checked={c1} onChange={setC1} size="md" label="Medium" />
        <CheckboxView checked={c1} onChange={setC1} size="lg" label="Large" />
      </Row>
      <Row label="Protocol accent colors" code={`// Pass any CSS variable or hex to accentColor\n<CheckboxView checked={v} onChange={setV} accentColor="var(--color-protocol-rest)"  label="REST" />\n<CheckboxView checked={v} onChange={setV} accentColor="var(--color-protocol-graphql)" label="GQL" />\n<CheckboxView checked={v} onChange={setV} accentColor="var(--color-success)"  label="OK" />\n<CheckboxView checked={v} onChange={setV} accentColor="var(--color-warning)"  label="Warn" />`}>
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
      <Row label="Sizes sm / md / lg — click X or Cancel to close (backdrop never closes)">
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
      <Row label="Variants — spinner · dots · skeleton · pulse · progress-bar">
        <Block style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap', padding: '24px' }}>
          <LoaderView variant="spinner" label="Spinner" />
          <LoaderView variant="dots" label="Dots" />
          <LoaderView variant="skeleton" />
          <LoaderView variant="pulse" />
        </Block>
      </Row>
      <Row label="Progress bar (drag slider)">
        <Block style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px', width: '100%' }}>
          <LoaderView variant="progress-bar" progress={progress} label={`${progress}%`} />
          <input type="range" min={0} max={100} value={progress} onChange={e => setProgress(+e.target.value)} style={{ width: '100%' }} />
        </Block>
      </Row>
      <Row label="Sizes sm / md / lg">
        <Block style={{ display: 'flex', gap: '20px', alignItems: 'center', padding: '20px' }}>
          <LoaderView variant="spinner" size="sm" />
          <LoaderView variant="spinner" size="md" />
          <LoaderView variant="spinner" size="lg" />
        </Block>
      </Row>
      <Row label="Protocol accent colors">
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
      <Row label="Standard empty state with action">
        <Block style={{ width: '100%' }}>
          <EmptyStateView
            icon={<FolderIcon size={32} />}
            title="No collections yet"
            message="Create your first collection to organize your API requests."
            action={{ label: '+ New Collection', onClick: () => alert('New Collection') }}
          />
        </Block>
      </Row>
      <Row label="Compact (for panels/drawers)">
        <Block style={{ width: '100%' }}>
          <EmptyStateView
            icon={<DocumentIcon size={20} />}
            title="No requests"
            message="Hit Send to get a response"
            compact
          />
        </Block>
      </Row>
      <Row label="Protocol accent colors">
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
      <Row label="All states">
        <Block style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center', padding: '20px' }}>
          <StatusIndicatorView status="idle"         label="Idle" />
          <StatusIndicatorView status="connecting"   label="Connecting…" />
          <StatusIndicatorView status="connected"    label="Connected" />
          <StatusIndicatorView status="disconnected" label="Disconnected" />
          <StatusIndicatorView status="error"        label="Error" />
        </Block>
      </Row>
      <Row label="With subtext">
        <Block style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', padding: '16px' }}>
          <StatusIndicatorView status="connected"  label="WebSocket" subtext="ws://localhost:8080" />
          <StatusIndicatorView status="error"      label="gRPC"      subtext="Connection refused" />
          <StatusIndicatorView status="connecting" label="MQTT"      subtext="mqtt://broker:1883" />
        </Block>
      </Row>
      <Row label="Protocol accent">
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
      <Row label="Click ? to open info popup">
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
      <Row label="Collapsed / expanded with title slot" gap={12}>
        <DottedCardView title="REST Headers" style={{ width: '100%' }}>
          <p style={{ margin: 0, fontSize: '11px', color: 'var(--color-text-muted)' }}>Header key-value pairs for this request would appear here.</p>
        </DottedCardView>
        <DottedCardView title="GraphQL Variables" defaultExpanded accentColor="var(--color-protocol-graphql)" style={{ width: '100%' }}>
          <p style={{ margin: 0, fontSize: '11px', color: 'var(--color-text-muted)' }}>Variables JSON would go here.</p>
        </DottedCardView>
      </Row>
      <Row label="Protocol accent colors" gap={8}>
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
      <Row label="HTTP status line tokens">
        <Block>
          <ColoredTextView tokens={[
            { text: 'HTTP/1.1 ', color: 'var(--color-text-muted)', mono: true },
            { text: '200', color: 'var(--color-success)', bold: true, mono: true },
            { text: ' OK', color: 'var(--color-success)', mono: true },
          ]} />
        </Block>
      </Row>
      <Row label="Error response">
        <Block>
          <ColoredTextView tokens={[
            { text: 'HTTP/1.1 ', color: 'var(--color-text-muted)', mono: true },
            { text: '404', color: 'var(--color-error)', bold: true, mono: true },
            { text: ' Not Found', color: 'var(--color-error)', mono: true },
          ]} />
        </Block>
      </Row>
      <Row label="Copyable token">
        <Block>
          <ColoredTextView tokens={[
            { text: 'Bearer ', color: 'var(--color-text-muted)', mono: true },
            { text: 'eyJhbGciOi...', color: 'var(--color-protocol-rest)', mono: true, copyable: true },
          ]} />
        </Block>
      </Row>
      <Row label="gRPC status tokens">
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
      <Row label="Stats cards — requests/errors/latency metrics">
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <StatsCardView label="Total Requests" value="1,284" trend="up"      trendValue="12%" accentColor="var(--color-protocol-rest)"      style={{ width: 160 }} />
          <StatsCardView label="Avg Latency"    value="142"   unit="ms"  trend="down"    trendValue="8%"  accentColor="var(--color-success)"           style={{ width: 160 }} />
          <StatsCardView label="Error Rate"     value="2.4"   unit="%"   trend="up"      trendValue="0.3%" accentColor="var(--color-error)"            style={{ width: 160 }} />
          <StatsCardView label="Active Clients" value="37"               trend="neutral"              accentColor="var(--color-protocol-websocket)" style={{ width: 160 }} />
        </div>
      </Row>
      <Row label="With subValue">
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
      <Row label="Basic sortable table" gap={0}>
        <Block style={{ padding: 0, overflow: 'hidden', width: '100%' }}>
          <DataTableView columns={TABLE_COLS} rows={TABLE_ROWS} keyField="id" maxHeight="220px" onRowClick={r => alert(`Clicked: ${r.method} ${r.path}`)} />
        </Block>
      </Row>
      <Row label="Empty state" gap={0}>
        <Block style={{ padding: 0, overflow: 'hidden', width: '100%' }}>
          <DataTableView columns={TABLE_COLS} rows={[]} keyField="id" emptyTitle="No requests yet" emptyMessage="Send a request to see the log here." />
        </Block>
      </Row>

      <Row label="Audit Log — expandable rows (click ▶), drag bottom grip to resize, pill to adjust split" gap={0}>
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

      <Row label="DB Explorer — cells show JSON char count, click to open JSON Viewer modal" gap={0}>
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
      <Row label="JSON code block with line numbers + copy" gap={0}>
        <Block style={{ padding: 0, overflow: 'hidden', width: '100%' }}>
          <CodeBlockView
            code={`{\n  "id": 42,\n  "name": "Alice",\n  "role": "admin"\n}`}
            language="json"
            showLineNumbers
          />
        </Block>
      </Row>
      <Row label="cURL snippet (no line numbers)" gap={0}>
        <Block style={{ padding: 0, overflow: 'hidden', width: '100%' }}>
          <CodeBlockView
            code={`curl -X POST https://api.example.com/users \\\n  -H 'Content-Type: application/json' \\\n  -d '{"name":"Alice"}'`}
            language="bash"
          />
        </Block>
      </Row>
      <Row label="Protocol colors">
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
      <Row label="Action variants">
        <Block style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', padding: '16px', alignItems: 'center' }}>
          <AIButtonView action="generate" />
          <AIButtonView action="fuzz" />
          <AIButtonView action="explain" />
          <AIButtonView action="fix" />
          <AIButtonView action="ask" />
          <AIButtonView action="suggest" />
        </Block>
      </Row>
      <Row label="Loading state (click to simulate)">
        <Block style={{ display: 'flex', gap: '8px', padding: '16px', alignItems: 'center' }}>
          <AIButtonView action="generate" loading={loading} onClick={simulate} />
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Click the button to see "Thinking…" for 1.5s</span>
        </Block>
      </Row>
      <Row label="Compact mode (22px height) vs normal (26px)">
        <Block style={{ display: 'flex', gap: '8px', padding: '16px', alignItems: 'center' }}>
          <AIButtonView action="generate" compact />
          <AIButtonView action="explain" compact />
          <AIButtonView action="suggest" compact />
        </Block>
      </Row>
      <Row label="Protocol accent colors">
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
      <Row label="Collapsible sidebar — click toggle at bottom to collapse to icon-only" gap={0}>
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
      <Row label="Grouped settings navigation" gap={0}>
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
      <Row label="Theme card picker">
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
  const [features, setFeatures] = useState([
    { id: 'autoSave',     label: 'Auto-save',            description: 'Automatically save requests on change',    enabled: true },
    { id: 'aiSuggest',    label: 'AI Suggestions',       description: 'Show AI completions in the URL bar',        enabled: false },
    { id: 'responseFmt',  label: 'Response Formatting',  description: 'Auto-format JSON / XML responses',           enabled: true },
    { id: 'history',      label: 'Request History',      description: 'Track all sent requests',                    enabled: true },
  ]);

  const toggle = (id: string) => setFeatures(fs => fs.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f));

  return (
    <div>
      <Row label="Feature category — expandable with toggle list" gap={12}>
        <FeatureCategoryView
          categoryLabel="REST Features"
          categoryColor="var(--color-protocol-rest)"
          defaultExpanded
          style={{ width: '100%' }}
          features={features.map(f => ({ ...f, onToggle: () => toggle(f.id) }))}
        />
        <FeatureCategoryView
          categoryLabel="AI Features"
          categoryColor="var(--color-protocol-ai)"
          style={{ width: '100%' }}
          features={[
            { id: 'explain', label: 'Explain Response', description: 'Let AI explain API responses', enabled: true, onToggle: () => {} },
            { id: 'fuzz',    label: 'Fuzz Testing',     description: 'AI-generated edge case tests',  enabled: false, onToggle: () => {} },
          ]}
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
      <Row label="DevTools-style bottom panel — drag to resize, click tab to collapse" gap={0}>
        <Block style={{ padding: 0, overflow: 'hidden', height: 280, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, padding: '12px', fontSize: '11px', color: 'var(--color-text-muted)' }}>
            ↑ Main content area (response viewer, etc.)
          </div>
          <BottomPanelView
            defaultHeight={120}
            tabs={[
              { id: 'console', label: 'Console',   icon: <TerminalIcon size={11} />, content: <pre style={{ margin: 0, fontSize: '11px', color: 'var(--color-success)', fontFamily: 'monospace' }}>{'[GET] /api/users → 200 OK (142ms)\n[POST] /api/auth → 201 Created (89ms)'}</pre> },
              { id: 'network', label: 'Network',   icon: <NetworkIcon size={11} />,  content: <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Network requests will appear here.</div> },
              { id: 'output',  label: 'Output',    icon: <OutputIcon size={11} />,   content: <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Extension output stream.</div> },
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
      <Row label="Toast notifications — click to trigger each type">
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
      <Row label="With prefix icon + clear suffix">
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
      <Row label="No prefix / suffix">
        <SearchInputView value={q2} onChange={setQ2} placeholder="Filter by name…" style={{ maxWidth: 240 }} />
      </Row>
      <Row label="Custom heights — 24px / 28px (default) / 32px">
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
      <Row label="Default (starts at 0 ms)" align="flex-start">
        <DurationInputView value={v1} onChange={setV1} />
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', alignSelf: 'center' }}>= {v1} ms</span>
      </Row>
      <Row label="Pre-set to 5 s — click unit dropdown to switch" align="flex-start">
        <DurationInputView value={v2} onChange={setV2} />
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', alignSelf: 'center' }}>= {v2} ms</span>
      </Row>
      <Row label="Pre-set to 2 m" align="flex-start">
        <DurationInputView value={v3} onChange={setV3} />
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', alignSelf: 'center' }}>= {v3} ms</span>
      </Row>
    </div>
  );
}

// ─── E6.176 — PillTabsView ────────────────────────────────────────────────────

const PILL_TABS: PillTabItem[] = [
  { id: 'params',  label: 'Params',  badge: 3 },
  { id: 'headers', label: 'Headers', badge: 5 },
  { id: 'body',    label: 'Body',    dot: true, dotColor: 'var(--color-warning)' },
  { id: 'auth',    label: 'Auth' },
];

export function PillTabsPanel() {
  const [a1, setA1] = useState('params');
  const [a2, setA2] = useState('params');
  const [a3, setA3] = useState('params');
  const [a4, setA4] = useState('params');
  return (
    <div>
      <Row label='variant="pill" (default) — sliding background indicator'>
        <PillTabsView tabs={PILL_TABS} activeTab={a1} onChange={setA1} />
      </Row>
      <Row label='variant="underline" — sliding underline indicator'>
        <PillTabsView tabs={PILL_TABS} activeTab={a2} onChange={setA2} variant="underline" />
      </Row>
      <Row label="Protocol accent colors — pill variant">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <PillTabsView tabs={[{ id: 'a', label: 'Request' }, { id: 'b', label: 'Response' }, { id: 'c', label: 'Scripts' }]} activeTab={a3} onChange={setA3} accentColor="var(--color-protocol-rest)" />
          <PillTabsView tabs={[{ id: 'a', label: 'Query' }, { id: 'b', label: 'Variables' }, { id: 'c', label: 'Schema' }]} activeTab={a4} onChange={setA4} accentColor="var(--color-protocol-graphql)" />
        </div>
      </Row>
      <Row label="Size sm vs md">
        <PillTabsView tabs={PILL_TABS} activeTab={a1} onChange={setA1} size="sm" />
        <PillTabsView tabs={PILL_TABS} activeTab={a1} onChange={setA1} size="md" />
      </Row>
    </div>
  );
}

// ─── E6.176 — SplitButtonView ─────────────────────────────────────────────────

const SPLIT_ITEMS: SplitButtonViewItem[] = [
  { id: 'save-send', label: 'Save & Send', onClick: () => alert('Save & Send') },
  { id: 'dry-run',   label: 'Dry Run',     onClick: () => alert('Dry Run') },
  { id: 'schedule',  label: 'Schedule…',   dividerBefore: true, onClick: () => alert('Schedule') },
];

export function SplitButtonPanel() {
  return (
    <div>
      <Row label="Variants — primary / secondary / danger">
        <SplitButtonView label="Send"   variant="primary"   items={SPLIT_ITEMS} onClick={() => alert('Send!')} />
        <SplitButtonView label="Save"   variant="secondary" items={SPLIT_ITEMS} onClick={() => alert('Save!')} />
        <SplitButtonView label="Delete" variant="danger"    items={SPLIT_ITEMS} onClick={() => alert('Delete!')} />
      </Row>
      <Row label="Sizes — sm / md">
        <SplitButtonView label="Send" size="sm" items={SPLIT_ITEMS} onClick={() => alert('sm')} />
        <SplitButtonView label="Send" size="md" items={SPLIT_ITEMS} onClick={() => alert('md')} />
      </Row>
      <Row label="Protocol accent color">
        <SplitButtonView label="Send"    variant="primary" accentColor="var(--color-protocol-rest)"      items={SPLIT_ITEMS} onClick={() => alert('REST')} />
        <SplitButtonView label="Run"     variant="primary" accentColor="var(--color-protocol-graphql)"   items={SPLIT_ITEMS} onClick={() => alert('GQL')} />
        <SplitButtonView label="Connect" variant="primary" accentColor="var(--color-protocol-websocket)" items={SPLIT_ITEMS} onClick={() => alert('WS')} />
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
  return (
    <div>
      <Row label="URL input with {{variable}} highlighting">
        <div style={{ width: '100%' }}>
          <HighlightedInputView
            value={url1}
            onChange={setUrl1}
            placeholder="Enter URL…"
            suggestions={URL_SUGGESTIONS}
          />
          <div style={{ marginTop: 6, fontSize: 10, color: 'var(--color-text-muted)' }}>
            Variables like <code style={{ background: 'color-mix(in srgb, var(--color-primary) 10%, transparent)', padding: '1px 4px', borderRadius: 3, color: 'var(--color-primary)' }}>{'{{env}}'}</code> are highlighted in the URL
          </div>
        </div>
      </Row>
      <Row label="With autocomplete — start typing a URL to see suggestions">
        <div style={{ width: '100%' }}>
          <HighlightedInputView
            value={url2}
            onChange={setUrl2}
            placeholder="https://…"
            suggestions={URL_SUGGESTIONS}
          />
        </div>
      </Row>
    </div>
  );
}

// ─── E6.176 — KeyValueTableView ──────────────────────────────────────────────

function newKvRow(): KeyValueTableRow { return { id: crypto.randomUUID(), key: '', value: '', description: '', enabled: true }; }

export function KeyValueTablePanel() {
  const [headers, setHeaders] = useState<KeyValueTableRow[]>([
    { id: '1', key: 'Content-Type',  value: 'application/json',  enabled: true },
    { id: '2', key: 'Authorization', value: 'Bearer {{token}}',  enabled: true },
    { id: '3', key: 'X-Request-ID',  value: '{{requestId}}',     enabled: false },
    newKvRow(),
  ]);
  const [params, setParams] = useState<KeyValueTableRow[]>([
    { id: 'p1', key: 'page',  value: '1',    enabled: true },
    { id: 'p2', key: 'limit', value: '20',   enabled: true },
    { id: 'p3', key: 'sort',  value: 'name', enabled: false },
    newKvRow(),
  ]);
  return (
    <div>
      <Row label="Request Headers table — add / enable / delete rows" gap={0} align="flex-start">
        <KeyValueTableView
          rows={headers}
          onChange={setHeaders}
          label="Request Headers"
          accentColor="var(--color-protocol-rest)"
          placeholder={{ key: 'Header name', value: 'Header value' }}
        />
      </Row>
      <Row label="Query Parameters table" gap={0} align="flex-start">
        <KeyValueTableView
          rows={params}
          onChange={setParams}
          label="Query Parameters"
          accentColor="var(--color-protocol-graphql)"
          placeholder={{ key: 'Parameter', value: 'Value' }}
        />
      </Row>
      <Row label="With description column" gap={0} align="flex-start">
        <KeyValueTableView
          rows={headers}
          onChange={setHeaders}
          showDescription
          label="Headers (with description)"
          placeholder={{ key: 'Name', value: 'Value' }}
        />
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

      <Row label="Small size (sm)" align="flex-start">
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

      <Row label="Large size (lg)" align="flex-start">
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

      <Row label="MergeDivider standalone (as visual separator reference)">
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
