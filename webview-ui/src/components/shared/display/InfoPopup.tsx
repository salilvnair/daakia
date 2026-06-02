/**
 * InfoPopup — Standard "?" help popup used across Daakia.
 * Dark card with white title, gray description, blue-badge code examples, HR dividers.
 * Auto-positions to stay within viewport (left/right/top/bottom).
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
import React, { useState, useRef, useEffect, useCallback } from 'react';
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

type PopupPosition = { top: number; left: number };

export function InfoPopup({ title, description, items, footer, wikiSlug, accentColor }: InfoPopupProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<PopupPosition>({ top: 0, left: 0 });
  useClickOutside(ref, () => setOpen(false), open);

  const calculatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const popupWidth = 300;
    const popupHeight = 320; // estimate

    let left = rect.left;
    let top = rect.bottom + 6;

    // Flip horizontal if overflows right
    if (left + popupWidth > window.innerWidth) {
      left = rect.right - popupWidth;
    }
    // Flip vertical if overflows bottom
    if (top + popupHeight > window.innerHeight) {
      top = rect.top - popupHeight - 6;
    }
    // Clamp
    left = Math.max(4, Math.min(left, window.innerWidth - popupWidth - 4));
    top = Math.max(4, top);

    setPos({ top, left });
  }, []);

  useEffect(() => {
    if (open) calculatePosition();
  }, [open, calculatePosition]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="w-5 h-5 flex items-center justify-center rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.06)] cursor-pointer transition-colors"
        title="Help"
      >
        <HelpCircleIcon size={13} />
      </button>
      {open && createPortal(
        <div
          ref={ref}
          className="fixed z-[99999] w-[300px] bg-[var(--color-surface)] border border-[var(--color-surface-border)] rounded-lg shadow-xl p-4"
          style={{ top: pos.top, left: pos.left }}
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
