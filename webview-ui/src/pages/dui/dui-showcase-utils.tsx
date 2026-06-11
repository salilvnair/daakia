// Shared helpers and demo data for DUI showcase panels

import type { TabItem } from '../../dui';

// ─── Layout helpers ────────────────────────────────────────────────────────────

export function Row({ label, children, gap = 10 }: { label: string; children: React.ReactNode; gap?: number }) {
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

export function Block({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
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

export function PropTag({ name, value }: { name: string; value: string }) {
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

// ─── Common demo data ──────────────────────────────────────────────────────────

export const METHOD_OPTIONS = [
  { value: 'GET',    label: 'GET',    color: 'var(--color-method-get)' },
  { value: 'POST',   label: 'POST',   color: 'var(--color-method-post)' },
  { value: 'PUT',    label: 'PUT',    color: 'var(--color-method-put)' },
  { value: 'PATCH',  label: 'PATCH',  color: 'var(--color-method-patch)' },
  { value: 'DELETE', label: 'DELETE', color: 'var(--color-method-delete)' },
];

export const PROTOCOL_OPTIONS = [
  { value: 'rest',  label: 'REST'      },
  { value: 'gql',   label: 'GraphQL'   },
  { value: 'ws',    label: 'WebSocket' },
  { value: 'grpc',  label: 'gRPC'      },
  { value: 'soap',  label: 'SOAP'      },
];

export const PILL_TABS: TabItem[] = [
  { id: 'params',  label: 'Params',  badge: 2 },
  { id: 'headers', label: 'Headers', badge: 4 },
  { id: 'body',    label: 'Body' },
  { id: 'auth',    label: 'Auth', dot: true, dotColor: 'var(--color-success)' },
  { id: 'scripts', label: 'Scripts' },
];

export const PROTOCOLS = [
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
