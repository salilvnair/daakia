/** App chrome pieces extracted from App.tsx — protocol rail icon, placeholders, empty state. */
import type { ReactNode } from 'react';
import { ButtonView } from '@salilvnair/dui';
import { ProtocolRestBadge, ProtocolGraphQLBadge, ProtocolRealtimeBadge, ProtocolGrpcBadge, ProtocolSoapBadge, ProtocolAiBadge, ProtocolMcpBadge } from '../icons';

// ─── Protocol Icon ───

export function ProtocolIcon({ active, open, accentColor, onClick, title, children, className }: { active: boolean; open?: boolean; accentColor: string; onClick: () => void; title: string; children: ReactNode; className?: string }) {
  const highlighted = active || open;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`w-9 h-9 flex items-center justify-center rounded-lg cursor-pointer transition-colors ${
        highlighted
          ? 'text-[var(--protocol-accent)]'
          : 'text-[var(--color-text-muted)] hover:text-[var(--protocol-accent)]'
      } ${className || ''}`}
      style={{
        ['--protocol-accent' as string]: accentColor,
        backgroundColor: highlighted
          ? `color-mix(in srgb, ${accentColor} ${active ? '15%' : '10%'}, transparent)`
          : undefined,
      }}
    >
      {children}
    </button>
  );
}

// ─── Protocol Placeholder ───

export function ProtocolPlaceholder({ name, icon }: { name: string; icon: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-[var(--color-text-muted)]">
      {icon === 'graphql' ? (
        <ProtocolGraphQLBadge size={56} className="opacity-30" />
      ) : (
        <ProtocolRealtimeBadge size={56} className="opacity-30" />
      )}
      <div className="text-center">
        <h3 className="text-[16px] font-semibold text-[var(--color-text-primary)] mb-1">{name}</h3>
        <p className="text-[13px]">Coming soon in upcoming sprint</p>
      </div>
    </div>
  );
}

// ─── Empty State (no tabs open) ───

export function EmptyState({ onNewTab, protocol }: { onNewTab: () => void; protocol: 'rest' | 'graphql' | 'websocket' | 'grpc' | 'soap' | 'ai' | 'mcp' }) {
  const config = {
    rest: { icon: <ProtocolRestBadge size={48} className="opacity-80" />, label: '+ New Request', color: 'var(--color-primary)' },
    graphql: { icon: <ProtocolGraphQLBadge size={48} className="opacity-80" />, label: '+ New GQL Request', color: 'var(--color-protocol-graphql)' },
    websocket: { icon: <ProtocolRealtimeBadge size={48} className="opacity-80" />, label: '+ New Realtime', color: 'var(--color-protocol-websocket)' },
    grpc: { icon: <ProtocolGrpcBadge size={48} className="opacity-80" />, label: '+ New gRPC Request', color: 'var(--color-protocol-grpc)' },
    soap: { icon: <ProtocolSoapBadge size={48} className="opacity-80" />, label: '+ New SOAP Request', color: 'var(--color-protocol-soap)' },
    ai: { icon: <ProtocolAiBadge size={48} className="opacity-80" />, label: '+ New AI Request', color: 'var(--color-protocol-ai)' },
    mcp: { icon: <ProtocolMcpBadge size={48} className="opacity-80" />, label: '+ New MCP Request', color: 'var(--color-protocol-mcp)' },
  }[protocol];

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[var(--color-text-muted)]">
      {config.icon}
      <p className="text-[13px]">No open tabs</p>
      <ButtonView variant="primary" size="md" accentColor={config.color} onClick={onNewTab} style={{ marginTop: 4 }}>
        {config.label}
      </ButtonView>
    </div>
  );
}

