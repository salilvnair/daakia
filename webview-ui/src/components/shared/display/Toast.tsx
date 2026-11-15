/**
 * Toasts, drawn the way the rest of Daakia's floating surfaces are.
 *
 * The same elevated card as a menu or popover. Colour lives in the icon tile
 * and a 2px timer line along the bottom — not a stripe down the edge, and not
 * a tinted wash behind the text. The close button is grey: it dismisses, it
 * does not warn.
 *
 * Behaviour:
 *   - newest in front; the rest tuck behind as a stack and fan out on hover;
 *   - hovering (or focusing) any toast pauses every timer — the timer is the
 *     line's CSS animation, so pausing it is `animation-play-state`, and the
 *     toast leaves when that animation ends;
 *   - an error stays until dismissed; the same toast again counts ("×3").
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useToastStore, defaultDuration, type ToastData } from '../../../store/toast-store';
import { CheckIcon, CloseIcon, InfoCircleIcon, WarningTriangleIcon, XCircleIcon } from '../../../icons';
import './toast.css';

const ICON: Record<ToastData['type'], ReactNode> = {
  success: <CheckIcon size={15} />,
  error: <XCircleIcon size={15} />,
  warning: <WarningTriangleIcon size={15} />,
  info: <InfoCircleIcon size={15} />,
};

function ToastItem({ toast, onGone, style, behind, measure }: {
  toast: ToastData;
  onGone: (id: string) => void;
  style?: React.CSSProperties;
  behind?: boolean;
  measure?: (el: HTMLDivElement | null) => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const duration = toast.duration ?? defaultDuration(toast.type);

  const onAnimationEnd = (e: React.AnimationEvent) => {
    // `dk-toast-out-fade` is the reduced-motion exit.
    if (e.animationName.startsWith('dk-toast-out')) onGone(toast.id);
    else if (e.animationName === 'dk-toast-timer') setLeaving(true);
  };

  return (
    <div
      ref={measure}
      className={`dk-toast dk-toast--${toast.type}${leaving ? ' is-leaving' : ''}${behind ? ' is-behind' : ''}`}
      role={toast.type === 'error' ? 'alert' : 'status'}
      style={style}
      onAnimationEnd={onAnimationEnd}
    >
      <span className="dk-toast__icon" aria-hidden="true">{ICON[toast.type]}</span>
      <div className="dk-toast__body">
        {toast.title && (
          <p className="dk-toast__title">
            {toast.title}
            {(toast.count ?? 1) > 1 && <span className="dk-toast__count">×{toast.count}</span>}
          </p>
        )}
        <p className={toast.title ? 'dk-toast__msg' : 'dk-toast__msg dk-toast__msg--only'}>
          {toast.message}
          {!toast.title && (toast.count ?? 1) > 1 && <span className="dk-toast__count">×{toast.count}</span>}
        </p>
      </div>
      {toast.action && (
        <button
          type="button"
          className="dk-toast__action"
          onClick={() => { toast.action!.run(); setLeaving(true); }}
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" className="dk-toast__close" aria-label="Dismiss" onClick={() => setLeaving(true)}>
        <CloseIcon size={13} />
      </button>
      {duration > 0 && !leaving && (
        <span
          key={toast.rev ?? 0}
          className="dk-toast__timer"
          style={{ animationDuration: `${duration}ms` }}
        />
      )}
    </div>
  );
}

export function ToastContainer() {
  const { toasts, dismissToast } = useToastStore();
  const [open, setOpen] = useState(false);
  const [frontH, setFrontH] = useState(0);
  const frontRef = useRef<HTMLDivElement | null>(null);

  // The cards behind take the front card's height, so the stack reads as one pile.
  useLayoutEffect(() => {
    const el = frontRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFrontH(el.offsetHeight));
    ro.observe(el);
    setFrontH(el.offsetHeight);
    return () => ro.disconnect();
  }, [toasts.length]);

  if (toasts.length === 0) return null;
  const fanned = open || toasts.length === 1;
  const ordered = [...toasts].reverse(); // newest first

  return createPortal(
    <div
      className={`dk-toasts${fanned ? ' is-open' : ''}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}
    >
      {ordered.map((t, i) => {
        if (fanned) return <ToastItem key={t.id} toast={t} onGone={dismissToast} measure={i === 0 ? el => { frontRef.current = el; } : undefined} />;
        if (i === 0) return <ToastItem key={t.id} toast={t} onGone={dismissToast} measure={el => { frontRef.current = el; }} style={{ zIndex: 10 }} />;
        return (
          <ToastItem
            key={t.id}
            toast={t}
            onGone={dismissToast}
            behind
            style={{
              position: 'absolute', left: 0, right: 0, bottom: 0,
              height: frontH || undefined,
              zIndex: 10 - i,
              opacity: i > 2 ? 0 : 1,
              transform: `translateY(${-i * 10}px) scale(${1 - i * 0.05})`,
            }}
          />
        );
      })}
    </div>,
    document.body,
  );
}
