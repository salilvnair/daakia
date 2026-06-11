import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLinkIcon } from '../../../icons';

export interface InfoPopupItem {
  code: string;
  description: string;
}

export interface InfoPopupViewProps {
  open: boolean;
  onClose: () => void;
  anchorEl?: HTMLElement | null;
  title: string;
  description?: string;
  items?: InfoPopupItem[];
  footer?: string;
  wikiLabel?: string;
  wikiHref?: string;
  width?: number;
}

export function InfoPopupView({
  open,
  onClose,
  anchorEl,
  title,
  description,
  items,
  footer,
  wikiLabel = 'Open Wiki →',
  wikiHref,
  width = 320,
}: InfoPopupViewProps) {
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node) &&
          anchorEl && !anchorEl.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handle);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, anchorEl]);

  if (!open) return null;

  // Position near anchorEl or center
  let pos: React.CSSProperties = { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' };
  if (anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    pos = {
      position: 'fixed',
      top: rect.bottom + 6,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
    };
  }

  const popup = (
    <div
      ref={popRef}
      style={{
        ...pos,
        width,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-surface-border)',
        borderRadius: '10px',
        boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
        zIndex: 1100,
        overflow: 'hidden',
      }}
    >
      {/* Title */}
      <div style={{ padding: '12px 14px 8px', borderBottom: '1px solid var(--color-surface-border)' }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{title}</span>
      </div>

      {/* Body */}
      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {description && (
          <p style={{ margin: 0, fontSize: '11px', color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>
            {description}
          </p>
        )}
        {items && items.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {items.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{
                  flexShrink: 0,
                  padding: '1px 7px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontFamily: 'monospace',
                  background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
                  color: 'var(--color-primary-light)',
                  border: '1px solid color-mix(in srgb, var(--color-primary) 22%, transparent)',
                }}>
                  {item.code}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', lineHeight: 1.4, paddingTop: '1px' }}>
                  {item.description}
                </span>
              </div>
            ))}
          </div>
        )}
        {footer && (
          <p style={{ margin: 0, fontSize: '10px', color: 'var(--color-text-muted)', lineHeight: 1.4, fontStyle: 'italic' }}>
            {footer}
          </p>
        )}
      </div>

      {/* Wiki link */}
      {wikiHref && (
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--color-surface-border)' }}>
          <a
            href={wikiHref}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              color: 'var(--color-primary)',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            {wikiLabel}
            <ExternalLinkIcon size={10} />
          </a>
        </div>
      )}
    </div>
  );

  return createPortal(popup, document.body);
}
