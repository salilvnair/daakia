/**
 * "Ask AI why" — the reason dk8s exists.
 *
 * Highlight anything in the log and this appears. It carries the pod's state
 * along with the text, because "NullPointerException" and "NullPointerException
 * from a pod that has restarted fourteen times in an hour" are different
 * questions with different answers.
 */
import { useState } from 'react';
import { WandIcon } from '../../icons';
import { useK8sStore, type LogSelection } from '../../store/k8s-store';
import { useDk8sAiStore, DK8S_LOG_ACTIONS } from '../../store/dk8s-ai-store';

const ACCENT = 'var(--color-dk8s)';

export function AskAiButton({ selection }: { selection: LogSelection }) {
  const detail = useK8sStore(s => s.detail);
  const runtime = useK8sStore(s => s.runtime);
  const ask = useDk8sAiStore(s => s.ask);
  const [open, setOpen] = useState(false);

  if (!detail) return null;

  const send = (promptKey: string, label: string) => {
    setOpen(false);
    ask({
      promptKey,
      title: label,
      evidence: selection.text,
      evidenceLabel: `SELECTED LOG (${selection.lineCount} line${selection.lineCount === 1 ? '' : 's'})`,
      podContext: {
        pod: detail.name,
        namespace: detail.namespace,
        phase: detail.phase,
        restarts: detail.restarts,
        reason: detail.reason,
        runtime: runtime?.runtime,
        image: detail.containers[0]?.image,
      },
    });
  };

  return (
    <div className="relative shrink-0 flex items-center gap-2 px-4 py-2"
         style={{
           borderTop: `1px solid color-mix(in srgb, ${ACCENT} 30%, transparent)`,
           background: `color-mix(in srgb, ${ACCENT} 7%, var(--color-surface))`,
         }}>
      <span className="text-[11px] text-[var(--color-text-secondary)]"
            style={{ fontVariantNumeric: 'tabular-nums' }}>
        {selection.lineCount} line{selection.lineCount === 1 ? '' : 's'} selected
      </span>

      <div className="flex-1" />

      {/* The dropdown is above the button, not below — the button sits at the
          bottom of the panel, and a menu opening downwards would be offscreen. */}
      {open && (
        <div className="absolute right-4 bottom-full mb-1.5 flex flex-col rounded-lg overflow-hidden z-20"
             style={{
               background: 'var(--color-surface)',
               border: '1px solid var(--color-surface-border)',
               boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
               minWidth: 260,
             }}>
          {DK8S_LOG_ACTIONS.map(a => (
            <button
              key={a.key}
              type="button"
              onClick={() => send(a.key, a.label)}
              className="flex flex-col items-start gap-0.5 px-3 py-2.5 text-left cursor-pointer border-none bg-transparent transition-colors hover:bg-[var(--color-surface-hover)]"
            >
              <span className="text-[12px]" style={{ color: 'var(--color-text-primary)' }}>
                {a.label}
              </span>
              <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
                {a.hint}
              </span>
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => send('dk8s.log.askWhy', 'Ask AI why')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11.5px] cursor-pointer transition-all"
        style={{
          background: `color-mix(in srgb, ${ACCENT} 20%, transparent)`,
          border: `1px solid color-mix(in srgb, ${ACCENT} 50%, transparent)`,
          color: '#fff', fontWeight: 600,
        }}
      >
        <WandIcon size={13} color={ACCENT} />
        Ask AI why
      </button>

      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Other questions"
        className="px-2 py-1.5 rounded-md text-[11px] cursor-pointer"
        style={{
          background: 'transparent',
          border: '1px solid var(--color-surface-border)',
          color: 'var(--color-text-secondary)',
        }}
      >
        {open ? '▾' : '▴'}
      </button>
    </div>
  );
}
