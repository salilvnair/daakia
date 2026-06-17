import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  // Start hidden; made visible after we measure actual size
  const [pos, setPos] = useState<{ top: number; left: number; visible: boolean }>({
    top: -9999, left: -9999, visible: false,
  });

  // Outside-click and Escape listeners
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (popRef.current?.contains(e.target as Node)) return;
      if (anchorEl?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handle);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, anchorEl]);

  // Reset visibility when closed
  useEffect(() => {
    if (!open) setPos(p => ({ ...p, visible: false }));
  }, [open]);

  // Render-then-measure: after popup mounts, compute viewport-safe position.
  // Re-runs on scroll/resize so the popup tracks the anchor element.
  useLayoutEffect(() => {
    if (!open || !popRef.current) return;

    const place = () => {
      if (!popRef.current) return;
      const pop = popRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      if (!anchorEl) {
        setPos({
          top: Math.max(8, (vh - pop.height) / 2),
          left: Math.max(8, (vw - pop.width) / 2),
          visible: true,
        });
        return;
      }

      const btn = anchorEl.getBoundingClientRect();

      let left = btn.left;
      let top  = btn.bottom + 6;

      if (left + pop.width > vw - 8) left = btn.right - pop.width;
      if (top + pop.height > vh - 8)  top  = btn.top - pop.height - 6;

      left = Math.max(8, Math.min(left, vw - pop.width - 8));
      top  = Math.max(8, Math.min(top,  vh - pop.height - 8));

      setPos({ top, left, visible: true });
    };

    const id = requestAnimationFrame(place);
    // Reposition when any ancestor scrolls or window resizes
    window.addEventListener('scroll', place, { passive: true, capture: true });
    window.addEventListener('resize', place);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('scroll', place, { capture: true });
      window.removeEventListener('resize', place);
    };
  }, [open, anchorEl]);

  if (!open) return null;

  const popup = (
    <div
      ref={popRef}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width,
        visibility: pos.visible ? 'visible' : 'hidden',
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
                  background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
                  color: 'var(--color-accent)',
                  border: '1px solid color-mix(in srgb, var(--color-accent) 22%, transparent)',
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
              color: 'var(--color-accent)',
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
