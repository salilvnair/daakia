import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from '../../../icons';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ModalViewProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children?: React.ReactNode;
  footerLeft?: React.ReactNode;
  footerRight?: React.ReactNode;
  size?: ModalSize;
  showCloseIcon?: boolean;
  /** Optional CSS color value for a tinted header background (e.g. 'var(--color-protocol-rest)') */
  headerColor?: string;
  /** Optional node rendered in the header right area, before the X button */
  headerRight?: React.ReactNode;
  /** When true, removes body padding (e.g. for full-bleed editor modals) */
  noPadding?: boolean;
  /** When true, uses var(--color-elevated) for the card background instead of var(--color-surface) */
  elevated?: boolean;
  className?: string;
}

const SIZE_MAP: Record<ModalSize, string> = {
  sm: '420px',
  md: '560px',
  lg: '720px',
  xl: '920px',
};

export function ModalView({
  open,
  onClose,
  title,
  children,
  footerLeft,
  footerRight,
  size = 'md',
  showCloseIcon = true,
  headerColor,
  headerRight,
  noPadding = false,
  elevated = false,
}: ModalViewProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const modal = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-modal-backdrop)',
        backdropFilter: 'blur(2px)',
      }}
      // backdrop click intentionally does NOT close — per design rules
    >
      <div
        style={{
          background: elevated ? 'var(--color-elevated)' : 'var(--color-surface)',
          border: '1px solid var(--color-surface-border)',
          borderRadius: '10px',
          width: '100%',
          maxWidth: SIZE_MAP[size],
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        {(title || showCloseIcon) && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid var(--color-surface-border)',
            flexShrink: 0,
            ...(headerColor ? {
              background: `color-mix(in srgb, ${headerColor} 12%, var(--color-surface))`,
              borderBottom: `1px solid color-mix(in srgb, ${headerColor} 30%, var(--color-surface-border))`,
            } : {}),
          }}>
            {title && (
              <span style={{
                fontSize: '14px', fontWeight: 600,
                color: headerColor
                  ? `color-mix(in srgb, ${headerColor} 80%, var(--color-text-primary))`
                  : 'var(--color-text-primary)',
              }}>
                {title}
              </span>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
              {headerRight}
              {showCloseIcon && (
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 24,
                    height: 24,
                    borderRadius: 4,
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: 'var(--color-error)',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'color-mix(in srgb, var(--color-error) 12%, transparent)';
                  }}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  title="Close"
                >
                  <CloseIcon size={14} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: noPadding ? 0 : '18px' }}>
          {children}
        </div>

        {/* Footer */}
        {(footerLeft || footerRight) && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 18px',
            borderTop: '1px solid var(--color-surface-border)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {footerLeft}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {footerRight}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
