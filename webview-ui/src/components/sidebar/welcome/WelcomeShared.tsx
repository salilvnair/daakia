import React, { type CSSProperties } from 'react';

// ─── Token colours (hardcoded so the sidebar webview needs no extra CSS vars) ──
export const PROTOCOL_COLORS: Record<string, string> = {
  rest:      '#6366f1',
  graphql:   '#E535AB',
  websocket: '#4caf50',
  grpc:      '#00b8b5',
  soap:      '#f97171',
  ai:        '#7EACB5',
  mcp:       '#60a5fa',
  mock:      '#eab308',
};

const BASE: CSSProperties = {
  fontFamily: 'inherit',
  fontSize: 'inherit',
  lineHeight: 'inherit',
};

// ─── SectionHeader ────────────────────────────────────────────────────────────

interface SectionHeaderProps {
  icon: string;
  label: string;
  accent?: string;
}

export function SectionHeader({ icon, label, accent }: SectionHeaderProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.07em',
      textTransform: 'uppercase',
      color: accent ?? 'var(--vscode-descriptionForeground)',
      marginBottom: 6,
      paddingBottom: 5,
      borderBottom: `1px solid var(--vscode-widget-border, rgba(128,128,128,0.18))`,
    }}>
      <span>{icon}</span>
      <span>{label}</span>
    </div>
  );
}

// ─── FeatureRow ───────────────────────────────────────────────────────────────

interface FeatureRowProps {
  icon: string;
  title: string;
  desc: string;
  chips?: string[];
  chipColor?: string;
}

export function FeatureRow({ icon, title, desc, chips, chipColor }: FeatureRowProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, padding: '3.5px 0' }}>
      <span style={{ fontSize: 12, flexShrink: 0, width: 16, lineHeight: '18px' }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--vscode-foreground)' }}>{title}</div>
        <div style={{ fontSize: 10, color: 'var(--vscode-descriptionForeground)', lineHeight: 1.35, marginTop: 1 }}>{desc}</div>
        {chips && chips.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
            {chips.map(c => (
              <Chip key={c} label={c} color={chipColor ?? '#6366f1'} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Chip ─────────────────────────────────────────────────────────────────────

interface ChipProps {
  label: string;
  color: string;
}

export function Chip({ label, color }: ChipProps) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '1px 6px',
      borderRadius: 3,
      fontSize: 9,
      fontWeight: 600,
      color,
      background: `color-mix(in srgb, ${color} 12%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
    }}>
      {label}
    </span>
  );
}

// ─── ProtocolBadge ────────────────────────────────────────────────────────────

interface ProtocolBadgeProps {
  label: string;
  color: string;
}

export function ProtocolBadge({ label, color }: ProtocolBadgeProps) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '3px 8px',
      borderRadius: 5,
      fontSize: 10,
      fontWeight: 700,
      color,
      background: `color-mix(in srgb, ${color} 10%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      letterSpacing: '0.01em',
    }}>
      {label}
    </span>
  );
}

// ─── ShortcutRow ─────────────────────────────────────────────────────────────

interface ShortcutRowProps {
  label: string;
  keys: string[];
}

export function ShortcutRow({ label, keys }: ShortcutRowProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2.5px 0' }}>
      <span style={{ fontSize: 11, color: 'var(--vscode-foreground)' }}>{label}</span>
      <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        {keys.map((k, i) => (
          <React.Fragment key={k}>
            {i > 0 && <span style={{ fontSize: 9, color: 'var(--vscode-descriptionForeground)', padding: '0 1px' }}>+</span>}
            <kbd style={{
              ...BASE,
              display: 'inline-flex',
              alignItems: 'center',
              padding: '1px 5px',
              borderRadius: 3,
              fontSize: 10,
              fontFamily: 'monospace',
              background: 'var(--vscode-keybindingLabel-background, rgba(128,128,128,0.1))',
              border: '1px solid var(--vscode-keybindingLabel-border, rgba(128,128,128,0.22))',
              color: 'var(--vscode-keybindingLabel-foreground, var(--vscode-foreground))',
            }}>
              {k}
            </kbd>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ─── TipBox ───────────────────────────────────────────────────────────────────

interface TipBoxProps {
  title: string;
  children: React.ReactNode;
  accent?: string;
}

export function TipBox({ title, children, accent = '#6366f1' }: TipBoxProps) {
  return (
    <div style={{
      padding: '8px 10px',
      borderRadius: 6,
      background: `color-mix(in srgb, ${accent} 8%, transparent)`,
      border: `1px solid color-mix(in srgb, ${accent} 22%, transparent)`,
      marginBottom: 7,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: accent, marginBottom: 3 }}>{title}</div>
      <div style={{ fontSize: 10, color: 'var(--vscode-foreground)', lineHeight: 1.45, opacity: 0.85 }}>{children}</div>
    </div>
  );
}

// ─── SectionCard ─────────────────────────────────────────────────────────────

interface SectionCardProps {
  children: React.ReactNode;
  style?: CSSProperties;
}

export function SectionCard({ children, style }: SectionCardProps) {
  return (
    <div style={{
      marginBottom: 14,
      ...style,
    }}>
      {children}
    </div>
  );
}

// ─── SubHeader ────────────────────────────────────────────────────────────────

export function SubHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 9.5,
      fontWeight: 600,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      color: 'var(--vscode-descriptionForeground)',
      opacity: 0.7,
      marginTop: 8,
      marginBottom: 3,
    }}>
      {children}
    </div>
  );
}

// ─── InfoRow (simple key→value) ───────────────────────────────────────────────

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 6, padding: '2px 0', fontSize: 10.5 }}>
      <span style={{ color: 'var(--vscode-descriptionForeground)', flexShrink: 0 }}>→</span>
      <span style={{ color: 'var(--vscode-foreground)', opacity: 0.9 }}><strong style={{ fontWeight: 600 }}>{label}</strong> {value && `— ${value}`}</span>
    </div>
  );
}
