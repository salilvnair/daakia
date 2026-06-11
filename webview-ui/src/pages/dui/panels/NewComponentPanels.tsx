import { useState } from 'react';
import {
  ToggleSwitchView, CheckboxView, ModalView, LoaderView, EmptyStateView,
  StatusIndicatorView, InfoPopupView, ResizablePanelView, DottedCardView,
  ColoredTextView, StatsCardView, DataTableView, CodeBlockView, AIButtonView,
  SideNavView, SettingsNavView, ThemeCardSelectorView, FeatureCategoryView,
  TagInputView, BottomPanelView, ToastView, PromptCardView,
} from '../../../dui';
import type { ContextMenuItem } from '../../../dui';
import {
  SearchIcon, SettingsIcon, ServerIcon, LayersIcon, RestApiIcon,
  GraphQLIcon, SparkleIcon, TerminalIcon, OutputIcon, NetworkIcon,
  ClockIcon, GlobeIcon, CodeIcon, FolderIcon, DocumentIcon,
} from '../../../icons';

// ─── Layout helpers (local) ───────────────────────────────────────────────────

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
      <Row label="States checked / unchecked / indeterminate / disabled">
        <CheckboxView checked={true}  onChange={() => {}} label="Checked" />
        <CheckboxView checked={false} onChange={() => {}} label="Unchecked" />
        <CheckboxView checked="indeterminate" onChange={() => {}} label="Indeterminate" />
        <CheckboxView checked={false} onChange={() => {}} disabled label="Disabled" />
        <CheckboxView checked={true}  onChange={() => {}} disabled label="Disabled checked" />
      </Row>
      <Row label="Sizes sm / md / lg">
        <CheckboxView checked={c1} onChange={setC1} size="sm" label="Small" />
        <CheckboxView checked={c1} onChange={setC1} size="md" label="Medium" />
        <CheckboxView checked={c1} onChange={setC1} size="lg" label="Large" />
      </Row>
      <Row label="Protocol accent colors">
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
        footer={{ right: [{ label: 'Cancel', onClick: () => setOpenSm(false) }, { label: 'Confirm', variant: 'primary', onClick: () => setOpenSm(false) }] }}
      >
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-secondary)' }}>This is a small modal (420px wide). Only the X button and footer buttons close it — backdrop click does nothing.</p>
      </ModalView>
      <ModalView
        open={openMd} onClose={() => setOpenMd(false)} size="md" title="Medium Modal"
        footer={{ right: [{ label: 'Cancel', onClick: () => setOpenMd(false) }, { label: 'Save changes', variant: 'primary', onClick: () => setOpenMd(false) }] }}
      >
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-secondary)' }}>Medium modal (560px). Press Escape or click X to close.</p>
      </ModalView>
      <ModalView
        open={openLg} onClose={() => setOpenLg(false)} size="lg" title="Large Modal — Request Details"
        footer={{
          left: [{ label: 'Delete', variant: 'danger', onClick: () => setOpenLg(false) }],
          right: [{ label: 'Close', onClick: () => setOpenLg(false) }, { label: 'Save', variant: 'primary', onClick: () => setOpenLg(false) }],
        }}
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
          <StatusIndicatorView state="idle"         label="Idle" />
          <StatusIndicatorView state="connecting"   label="Connecting…" />
          <StatusIndicatorView state="connected"    label="Connected" />
          <StatusIndicatorView state="disconnected" label="Disconnected" />
          <StatusIndicatorView state="error"        label="Error" />
        </Block>
      </Row>
      <Row label="With subtext">
        <Block style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', padding: '16px' }}>
          <StatusIndicatorView state="connected"  label="WebSocket" subtext="ws://localhost:8080" />
          <StatusIndicatorView state="error"      label="gRPC"      subtext="Connection refused" />
          <StatusIndicatorView state="connecting" label="MQTT"      subtext="mqtt://broker:1883" />
        </Block>
      </Row>
      <Row label="Protocol accent">
        <Block style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', padding: '16px' }}>
          <StatusIndicatorView state="connected" label="REST" accentColor="var(--color-protocol-rest)" />
          <StatusIndicatorView state="connected" label="GQL"  accentColor="var(--color-protocol-graphql)" />
          <StatusIndicatorView state="connected" label="WS"   accentColor="var(--color-protocol-websocket)" />
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

// ─── D1.28 — ResizablePanelView ──────────────────────────────────────────────

export function ResizablePanelPanel() {
  return (
    <div>
      <Row label="Horizontal split — drag the divider, double-click to reset" gap={0}>
        <Block style={{ padding: 0, overflow: 'hidden', width: '100%' }}>
          <ResizablePanelView
            direction="horizontal"
            defaultSplit={50}
            minFirst={120}
            minSecond={120}
            style={{ height: 160 }}
            first={<div style={{ padding: '12px', fontSize: '11px', color: 'var(--color-text-muted)' }}>Left panel — drag divider →</div>}
            second={<div style={{ padding: '12px', fontSize: '11px', color: 'var(--color-text-muted)' }}>← Right panel</div>}
          />
        </Block>
      </Row>
      <Row label="Vertical split" gap={0}>
        <Block style={{ padding: 0, overflow: 'hidden', width: '100%' }}>
          <ResizablePanelView
            direction="vertical"
            defaultSplit={50}
            minFirst={60}
            minSecond={60}
            style={{ height: 200 }}
            first={<div style={{ padding: '12px', fontSize: '11px', color: 'var(--color-text-muted)' }}>Top panel — drag divider ↓</div>}
            second={<div style={{ padding: '12px', fontSize: '11px', color: 'var(--color-text-muted)' }}>↑ Bottom panel</div>}
          />
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

export function DataTablePanel() {
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
      <Row label="Tag input — type and press Enter or comma to add" gap={0}>
        <Block style={{ width: '100%', maxWidth: 400 }}>
          <TagInputView tags={tags1} onChange={setTags1} accentColor="var(--color-protocol-rest)" />
        </Block>
      </Row>
      <Row label="Empty state (placeholder)">
        <Block style={{ width: '100%', maxWidth: 400 }}>
          <TagInputView tags={tags2} onChange={setTags2} placeholder="Add environment tags…" accentColor="var(--color-protocol-graphql)" />
        </Block>
      </Row>
      <Row label="With max tags (3)">
        <Block style={{ width: '100%', maxWidth: 400 }}>
          <TagInputView tags={['tag1', 'tag2', 'tag3']} onChange={() => {}} maxTags={3} accentColor="var(--color-warning)" />
        </Block>
      </Row>
      <Row label="Disabled">
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

// ─── D1.42 — PromptCardView ──────────────────────────────────────────────────

export function PromptCardPanel() {
  return (
    <div>
      <Row label="Prompt library cards — hover to reveal actions" gap={12}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px', width: '100%' }}>
          <PromptCardView
            id="p1"
            title="Generate REST test cases"
            description="Creates happy path + edge cases"
            content="Given this REST endpoint definition, generate a comprehensive set of test cases covering: happy path, validation errors, auth failures, and edge cases."
            tags={['testing', 'rest', 'ai']}
            protocol="REST"
            protocolColor="var(--color-protocol-rest)"
            onUse={id => alert(`Use prompt ${id}`)}
            onEdit={id => alert(`Edit ${id}`)}
            onCopy={id => alert(`Copy ${id}`)}
            onDelete={id => alert(`Delete ${id}`)}
          />
          <PromptCardView
            id="p2"
            title="Explain GraphQL response"
            content="Here is a GraphQL response: {{response}}. Please explain what each field means in plain English and identify any potential issues."
            tags={['graphql', 'explain']}
            protocol="GQL"
            protocolColor="var(--color-protocol-graphql)"
            onUse={id => alert(`Use prompt ${id}`)}
            onCopy={id => alert(`Copy ${id}`)}
          />
          <PromptCardView
            id="p3"
            title="Mock server rule from response"
            content="Based on this API response, generate a Daakia mock server rule with realistic scenarios, fault injection, and rate limiting configuration."
            tags={['mock', 'ai']}
            accentColor="var(--color-protocol-ai)"
            onUse={id => alert(`Use prompt ${id}`)}
          />
        </div>
      </Row>
    </div>
  );
}
