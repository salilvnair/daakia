/**
 * WikiShared.tsx — Reusable building blocks for the Daakia Wiki panel
 */

// ─── Callout ─────────────────────────────────────────────────────────────────
interface CalloutProps {
  type: 'info' | 'warn' | 'ok' | 'tip';
  title?: string;
  children: React.ReactNode;
}
export function Callout({ type, title, children }: CalloutProps) {
  const emoji = type === 'info' ? 'ℹ️' : type === 'warn' ? '⚠️' : type === 'ok' ? '✅' : '💡';
  return (
    <div className={`dw-callout ${type}`}>
      <span className="dw-callout-icon">{emoji}</span>
      <div className="dw-callout-text">
        {title && <strong>{title}</strong>}
        {children}
      </div>
    </div>
  );
}

// ─── Step list ───────────────────────────────────────────────────────────────
export function Steps({ steps }: { steps: (string | React.ReactNode)[] }) {
  return (
    <div className="dw-steps">
      {steps.map((s, i) => (
        <div key={i} className="dw-step">
          <span className="dw-step-num">{i + 1}</span>
          <div className="dw-step-content">{typeof s === 'string' ? <span dangerouslySetInnerHTML={{ __html: s }} /> : s}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Feature card grid ────────────────────────────────────────────────────────
export function FeatureGrid({ items }: { items: { emoji: string; title: string; desc: string }[] }) {
  return (
    <div className="dw-feat-grid">
      {items.map((item) => (
        <div key={item.title} className="dw-feat-card">
          <div className="dw-feat-icon">{item.emoji}</div>
          <div className="dw-feat-title">{item.title}</div>
          <div className="dw-feat-desc">{item.desc}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Live REST Screen mockup ─────────────────────────────────────────────────
interface LiveRestProps {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  activeTab?: string;
  bodyContent?: string;
  statusCode?: number;
  statusText?: string;
  responseContent?: string;
  responseTime?: string;
  responseSize?: string;
  /** Rich tab panel content rendered below the tab strip */
  tabPanel?: React.ReactNode;
}
export function LiveRestScreen({ method, url, activeTab = 'Params', bodyContent, statusCode, statusText = 'OK', responseContent, responseTime = '245ms', responseSize = '1.2 KB', tabPanel }: LiveRestProps) {
  const methodClass = method.toLowerCase() === 'delete' ? 'del' : method.toLowerCase();
  const tabs = ['Params', 'Headers', 'Body', 'Auth', 'Scripts', 'Variables'];
  return (
    <div className="dw-live">
      <div className="dw-live-bar">
        <span className={`dw-live-method ${methodClass}`}>{method}</span>
        <span className="dw-live-url">{url}</span>
        <span className="dw-live-send">Send</span>
      </div>
      <div className="dw-live-tabs">
        {tabs.map(t => (
          <span key={t} className={`dw-live-tab${t === activeTab ? ' active' : ''}`}>{t}</span>
        ))}
      </div>
      {tabPanel ?? (bodyContent && <div className="dw-live-body">{bodyContent}</div>)}
      {statusCode && (
        <>
          <div className="dw-live-status">
            <span className={statusCode < 400 ? 'ok' : 'err'}>{statusCode} {statusText}</span>
            <span className="muted">{responseTime}</span>
            <span className="muted">{responseSize}</span>
          </div>
          {responseContent && <div className="dw-live-body">{responseContent}</div>}
        </>
      )}
    </div>
  );
}

// ─── Tab panel demo components (rich, realistic, no functionality) ─────────────

/** Params tab — key-value table with checkboxes */
export function ParamsTabPanel({ rows = [['page', '1'], ['limit', '20'], ['sort', 'created_at']] }: { rows?: [string, string][] }) {
  return (
    <div className="dw-live-panel">
      <div className="dw-kv-table">
        <div className="dw-kv-header">
          <span className="dw-kv-check-col" />
          <span className="dw-kv-key-col">Key</span>
          <span className="dw-kv-val-col">Value</span>
          <span className="dw-kv-act-col" />
        </div>
        {rows.map(([k, v], i) => (
          <div key={i} className="dw-kv-row">
            <span className="dw-kv-check-col"><span className="dw-kv-check active" /></span>
            <span className="dw-kv-cell dw-kv-key">{k}</span>
            <span className="dw-kv-cell dw-kv-val">{v}</span>
            <span className="dw-kv-act-col"><span className="dw-kv-del">×</span></span>
          </div>
        ))}
        <div className="dw-kv-row dw-kv-ghost">
          <span className="dw-kv-check-col"><span className="dw-kv-check" /></span>
          <span className="dw-kv-cell dw-kv-key dw-placeholder">Key</span>
          <span className="dw-kv-cell dw-kv-val dw-placeholder">Value</span>
          <span className="dw-kv-act-col" />
        </div>
      </div>
    </div>
  );
}

/** Headers tab — AI suggest button + key-value table */
export function HeadersTabPanel({ rows = [['Accept', 'application/json'], ['X-Request-ID', '{{$random.uuid}}']] }: { rows?: [string, string][] }) {
  return (
    <div className="dw-live-panel">
      <div className="dw-suggest-bar">
        <span className="dw-suggest-btn">✨ Suggest headers</span>
      </div>
      <div className="dw-kv-table">
        <div className="dw-kv-header">
          <span className="dw-kv-check-col" />
          <span className="dw-kv-key-col">Key</span>
          <span className="dw-kv-val-col">Value</span>
          <span className="dw-kv-act-col" />
        </div>
        {rows.map(([k, v], i) => (
          <div key={i} className="dw-kv-row">
            <span className="dw-kv-check-col"><span className="dw-kv-check active" /></span>
            <span className="dw-kv-cell dw-kv-key">{k}</span>
            <span className="dw-kv-cell dw-kv-val">{v}</span>
            <span className="dw-kv-act-col"><span className="dw-kv-del">×</span></span>
          </div>
        ))}
        <div className="dw-kv-row dw-kv-ghost">
          <span className="dw-kv-check-col"><span className="dw-kv-check" /></span>
          <span className="dw-kv-cell dw-kv-key dw-placeholder">Key</span>
          <span className="dw-kv-cell dw-kv-val dw-placeholder">Value</span>
          <span className="dw-kv-act-col" />
        </div>
      </div>
    </div>
  );
}

/** Body tab — Content-Type dropdown shown open */
export function BodyTabPanel() {
  return (
    <div className="dw-live-panel">
      <div className="dw-body-toolbar">
        <span className="dw-body-label">Content Type</span>
        <div className="dw-dd-wrap">
          <div className="dw-dd-trigger">JSON (application/json) <span className="dw-dd-caret">▾</span></div>
          <div className="dw-dd-menu open">
            <div className="dw-dd-item active">JSON (application/json)</div>
            <div className="dw-dd-item">XML (application/xml)</div>
            <div className="dw-dd-item">Text (text/plain)</div>
            <div className="dw-dd-sep" />
            <div className="dw-dd-item">Form Data (multipart/form-data)</div>
            <div className="dw-dd-item">URL Encoded</div>
            <div className="dw-dd-item">Binary</div>
          </div>
        </div>
      </div>
      <div className="dw-body-code">{'{\n  "name": "Alice",\n  "role": "admin"\n}'}</div>
    </div>
  );
}

/** Auth tab — Authorization Type dropdown with OAuth 2.0 shown open */
export function AuthTabPanel() {
  return (
    <div className="dw-live-panel">
      <div className="dw-body-toolbar">
        <span className="dw-body-label">Authorization Type</span>
        <div className="dw-dd-wrap">
          <div className="dw-dd-trigger">OAuth 2.0 <span className="dw-dd-caret">▾</span></div>
          <div className="dw-dd-menu open">
            <div className="dw-dd-item">No Auth</div>
            <div className="dw-dd-item">Bearer Token</div>
            <div className="dw-dd-item">Basic Auth</div>
            <div className="dw-dd-item">API Key</div>
            <div className="dw-dd-item active">OAuth 2.0</div>
          </div>
        </div>
      </div>
      <div className="dw-auth-fields">
        <div className="dw-auth-row">
          <span className="dw-auth-label">Grant Type</span>
          <span className="dw-auth-val">Client Credentials</span>
        </div>
        <div className="dw-auth-row">
          <span className="dw-auth-label">Client ID</span>
          <span className="dw-auth-val dw-placeholder">Enter client ID…</span>
        </div>
        <div className="dw-auth-row">
          <span className="dw-auth-label">Client Secret</span>
          <span className="dw-auth-val dw-placeholder">Enter client secret…</span>
        </div>
        <div className="dw-auth-row">
          <span className="dw-auth-label">Token URL</span>
          <span className="dw-auth-val dw-placeholder">https://auth.example.com/token</span>
        </div>
      </div>
    </div>
  );
}

// ─── Section title ────────────────────────────────────────────────────────────
export function SectionTitle({ emoji, children }: { emoji: string; children: React.ReactNode }) {
  return (
    <h2 className="dw-section-title">
      <span className="dw-section-emoji">{emoji}</span>
      {children}
    </h2>
  );
}

// ─── Subsection title ────────────────────────────────────────────────────────
export function SubTitle({ children }: { children: React.ReactNode }) {
  return <div className="dw-subsection-title">{children}</div>;
}

// ─── Keyboard shortcut grid ───────────────────────────────────────────────────
export function ShortcutGrid({ items }: { items: { label: string; keys: string[] }[] }) {
  return (
    <div className="dw-shortcut-grid">
      {items.map((item) => (
        <div key={item.label} className="dw-shortcut-row">
          <span className="dw-shortcut-label">{item.label}</span>
          <span className="dw-shortcut-keys">
            {item.keys.map((k, i) => (
              <span key={i} className="dw-kbd">{k}</span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Simple data table ────────────────────────────────────────────────────────
export function WikiTable({ headers, rows }: { headers: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <table className="dw-table">
      <thead>
        <tr>{headers.map(h => <th key={h}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
export function Badge({ variant, children }: { variant: 'rest' | 'graphql' | 'ws' | 'grpc' | 'soap' | 'mock' | 'ai' | 'ok' | 'warn'; children: React.ReactNode }) {
  return <span className={`dw-badge ${variant}`}>{children}</span>;
}

// ─── Code ─────────────────────────────────────────────────────────────────────
export function Code({ children }: { children: React.ReactNode }) {
  return <code className="dw-code">{children}</code>;
}

// ─── Slash command card ───────────────────────────────────────────────────────
export function CmdList({ items }: { items: { name: string; desc: string }[] }) {
  return (
    <div className="dw-cmd-list">
      {items.map(item => (
        <div key={item.name} className="dw-cmd-card">
          <span className="dw-cmd-name">{item.name}</span>
          <span className="dw-cmd-desc">{item.desc}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Collapsible section ──────────────────────────────────────────────────────
export function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="dw-details">
      <summary>{title}</summary>
      <div className="dw-details-body">{children}</div>
    </details>
  );
}

// ─── Card container ───────────────────────────────────────────────────────────
export function WikiCard({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
  return (
    <div className="dw-card">
      <div className="dw-card-header">
        {icon && <span>{icon}</span>}
        {title}
      </div>
      <div className="dw-card-body">{children}</div>
    </div>
  );
}

// ─── Divider ──────────────────────────────────────────────────────────────────
export function Divider() {
  return <div className="dw-divider" />;
}
