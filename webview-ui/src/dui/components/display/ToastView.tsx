import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircleIcon, CloseIcon, WarningTriangleIcon, InfoCircleIcon, CloseCircleIcon } from '../../../icons';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  message?: string;
  duration?: number;
}

export interface ToastViewProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
}

const VARIANT_CONFIG: Record<ToastVariant, { icon: React.ReactNode; color: string; bgVar: string }> = {
  success: {
    icon: <CheckCircleIcon size={13} />,
    color: 'var(--color-success)',
    bgVar: 'color-mix(in srgb, var(--color-success) 12%, var(--color-panel))',
  },
  error: {
    icon: <CloseCircleIcon size={13} />,
    color: 'var(--color-error)',
    bgVar: 'color-mix(in srgb, var(--color-error) 12%, var(--color-panel))',
  },
  warning: {
    icon: <WarningTriangleIcon size={13} />,
    color: 'var(--color-warning)',
    bgVar: 'color-mix(in srgb, var(--color-warning) 12%, var(--color-panel))',
  },
  info: {
    icon: <InfoCircleIcon size={13} />,
    color: 'var(--color-info, var(--color-primary))',
    bgVar: 'color-mix(in srgb, var(--color-primary) 12%, var(--color-panel))',
  },
};

const POSITIONS: Record<string, React.CSSProperties> = {
  'top-right':    { top: 16, right: 16 },
  'top-left':     { top: 16, left: 16 },
  'bottom-right': { bottom: 16, right: 16 },
  'bottom-left':  { bottom: 16, left: 16 },
  'top-center':   { top: 16, left: '50%', transform: 'translateX(-50%)' },
  'bottom-center':{ bottom: 16, left: '50%', transform: 'translateX(-50%)' },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const cfg = VARIANT_CONFIG[toast.variant];
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const dur = toast.duration ?? 4000;
    if (dur > 0) {
      timerRef.current = setTimeout(() => onDismiss(toast.id), dur);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        minWidth: 260,
        maxWidth: 360,
        padding: '10px 12px',
        borderRadius: '8px',
        background: cfg.bgVar,
        border: `1px solid color-mix(in srgb, ${cfg.color} 30%, transparent)`,
        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        animation: 'fadeInUp 180ms ease',
      }}
    >
      <span style={{ color: cfg.color, flexShrink: 0, marginTop: '1px' }}>
        {cfg.icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: toast.message ? '2px' : 0 }}>
          {toast.title}
        </div>
        {toast.message && (
          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
            {toast.message}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--color-text-muted)', padding: 0, flexShrink: 0, marginTop: '1px',
        }}
      >
        <CloseIcon size={11} />
      </button>
    </div>
  );
}

export function ToastView({ toasts, onDismiss, position = 'bottom-right' }: ToastViewProps) {
  if (toasts.length === 0) return null;

  const posStyle = POSITIONS[position] ?? POSITIONS['bottom-right'];

  return createPortal(
    <>
      <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div
        style={{
          position: 'fixed',
          ...posStyle,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          pointerEvents: 'none',
        }}
      >
        {toasts.map(t => (
          <div key={t.id} style={{ pointerEvents: 'all' }}>
            <ToastItem toast={t} onDismiss={onDismiss} />
          </div>
        ))}
      </div>
    </>,
    document.body
  );
}

export function useToast() {
  const toastsRef = useRef<Toast[]>([]);
  const setters = useRef<Array<(t: Toast[]) => void>>([]);

  const subscribe = (fn: (t: Toast[]) => void) => {
    setters.current.push(fn);
    return () => { setters.current = setters.current.filter(f => f !== fn); };
  };

  const notify = () => setters.current.forEach(fn => fn([...toastsRef.current]));

  const toast = (variant: ToastVariant, title: string, message?: string, duration?: number) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    toastsRef.current = [...toastsRef.current, { id, variant, title, message, duration }];
    notify();
    return id;
  };

  const dismiss = (id: string) => {
    toastsRef.current = toastsRef.current.filter(t => t.id !== id);
    notify();
  };

  return { subscribe, toast, dismiss };
}
