/**
 * InfoPopup — Standard "?" help popup used across Daakia.
 * Dark card with white title, gray description, blue-badge code examples, HR dividers.
 * Viewport-aware: renders hidden, measures actual size, then flips left/up if needed.
 *
 * Usage:
 *   <InfoPopup
 *     title="Section Title"
 *     description="What this section does"
 *     items={[{ code: '.name', label: 'Access field' }]}
 *     footer="Example: use .data.users"
 *     wikiSlug="environments"
 *   />
 */
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircleIcon } from '../../../icons';
import { useClickOutside } from '../../../hooks/useClickOutside';

export interface InfoPopupItem {
  code: string;
  label: string;
}

interface InfoPopupProps {
  title: string;
  description?: string;
  items?: InfoPopupItem[];
  footer?: string;
  wikiSlug?: string;
  accentColor?: string;
}

export function InfoPopup({ title, description, items, footer, wikiSlug, accentColor }: InfoPopupProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  // Start invisible at a provisional position; made visible after measurement
  const [pos, setPos] = useState<{ top: number; left: number; visible: boolean }>({
    top: -9999, left: -9999, visible: false,
  });

  useClickOutside(popupRef, () => setOpen(false), open);

  // Reset visibility when closing so next open starts hidden
  useEffect(() => {
    if (!open) setPos(p => ({ ...p, visible: false }));
  }, [open]);

  // Measure after the popup renders in the DOM, then snap to correct position
  const reposition = useCallback(() => {
    if (!open || !popupRef.current || !buttonRef.current) return;
    const btn = buttonRef.current.getBoundingClientRect();
    const pop = popupRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Default: below-left aligned with button
    let left = btn.left;
    let top = btn.bottom + 6;

    // Flip right → left if popup would overflow right edge
    if (left + pop.width > vw - 8) {
      left = btn.right - pop.width;
    }
    // Flip down → up if popup would overflow bottom edge
    if (top + pop.height > vh - 8) {
      top = btn.top - pop.height - 6;
    }
    // Clamp so it never escapes the viewport
    left = Math.max(8, Math.min(left, vw - pop.width - 8));
    top  = Math.max(8, Math.min(top,  vh - pop.height - 8));

    setPos({ top, left, visible: true });
  }, [open]);

  // Run after every paint when open changes (popup just mounted or unmounted)
  useLayoutEffect(() => {
    if (!open) return;
    // rAF gives the browser one frame to lay out the popup before we measure
    const id = requestAnimationFrame(reposition);
    return () => cancelAnimationFrame(id);
  }, [open, reposition]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-5 h-5 flex items-center justify-center rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.06)] cursor-pointer transition-colors"
        title="Help"
      >
        <HelpCircleIcon size={13} />
      </button>

      {open && createPortal(
        <div
          ref={popupRef}
          className="fixed z-[99999] w-[300px] bg-[var(--color-surface)] border border-[var(--color-surface-border)] rounded-lg shadow-xl p-4"
          style={{
            top: pos.top,
            left: pos.left,
            visibility: pos.visible ? 'visible' : 'hidden',
          }}
        >
          {/* Title */}
          <h4 className="text-[13px] font-semibold text-[var(--color-text-primary)] mb-1">{title}</h4>

          {/* Description */}
          {description && (
            <p className="text-[11px] text-[var(--color-text-muted)] mb-3 leading-[16px]">{description}</p>
          )}

          {/* Items with blue badges — table-like uniform layout */}
          {items && items.length > 0 && (
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-[11px] font-mono items-center">
              {items.map((item, idx) => (
                <React.Fragment key={idx}>
                  <code
                    className="px-1.5 py-0.5 rounded whitespace-nowrap"
                    style={{
                      background: accentColor ? `color-mix(in srgb, ${accentColor} 12%, transparent)` : 'rgba(99,102,241,0.1)',
                      color: accentColor || 'var(--color-primary)',
                    }}
                  >{item.code}</code>
                  <span className="text-[var(--color-text-muted)]">{item.label}</span>
                </React.Fragment>
              ))}
            </div>
          )}

          {/* Footer with divider */}
          {footer && (
            <div className="mt-3 pt-2 border-t border-[var(--color-surface-border)]">
              <p className="text-[10px] text-[var(--color-text-muted)] leading-[15px]">{footer}</p>
            </div>
          )}

          {/* Wiki link */}
          {wikiSlug && (
            <div className={`${footer ? 'mt-2' : 'mt-3 pt-2 border-t border-[var(--color-surface-border)]'}`}>
              <button
                className="text-[10px] hover:underline cursor-pointer"
                style={{ color: accentColor || 'var(--color-primary)' }}
                onClick={() => { /* TODO: open wiki page */ }}
              >
                Open Wiki →
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
