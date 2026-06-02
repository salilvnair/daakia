import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useToastStore, type ToastData } from '../../../store/toast-store';
import { getToastTypeConfig } from '../../../colors';

function ToastItem({ toast, onDismiss }: { toast: ToastData; onDismiss: (id: string) => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [exiting, setExiting] = useState(false);
  const TYPE_CONFIG = getToastTypeConfig();
  const config = TYPE_CONFIG[toast.type] || TYPE_CONFIG.info;

  const dismiss = () => {
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 200);
  };

  useEffect(() => {
    const dur = toast.duration ?? 4000;
    if (dur > 0) {
      timerRef.current = setTimeout(dismiss, dur);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [toast.id]);

  return (
    <div
      className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border-l-[3px] text-[13px] text-[var(--color-text-primary)] shadow-lg backdrop-blur-sm transition-all duration-200 ${
        exiting ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0 animate-[toastSlideUp_0.3s_cubic-bezier(0.16,1,0.3,1)]'
      }`}
      style={{
        borderColor: config.border,
        borderTop: '1px solid rgba(255,255,255,0.06)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: `${config.bg}`,
        backdropFilter: 'blur(12px)',
      }}
    >
      <span
        className="w-5 h-5 flex items-center justify-center rounded-full text-[11px] font-bold flex-shrink-0"
        style={{ background: config.border, color: '#fff' }}
      >
        {config.icon}
      </span>
      <span className="flex-1 leading-snug break-words overflow-hidden">{toast.message}</span>
      <button
        type="button"
        className="text-[#ef4444] hover:text-[#dc2626] cursor-pointer text-base leading-none ml-1"
        onClick={dismiss}
      >
        ×
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts, dismissToast } = useToastStore();

  if (toasts.length === 0) return null;

  return createPortal(
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col-reverse gap-2 max-w-sm pointer-events-auto">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={dismissToast} />
      ))}
    </div>,
    document.body
  );
}
