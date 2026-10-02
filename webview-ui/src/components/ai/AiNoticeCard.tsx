/**
 * An answer that did not come: stopped by the asker, or failed on the way.
 *
 * It says which, in words, and offers the one thing to do next — ask the same
 * question again — as a button, so a lost answer costs a click rather than a
 * retyped question. It is drawn from the envelope the bridge (or a reopened
 * conversation) hands the chat, so it looks the same either way.
 */
import { ButtonView } from '@salilvnair/dui';

export interface AiNoticePayload {
  type: 'daakia-notice';
  tone: 'stopped' | 'error';
  rawText: string;
  /** The question to ask again. */
  retry?: string;
}

export function isAiNoticePayload(p: unknown): p is AiNoticePayload {
  return !!p && typeof p === 'object' && (p as { type?: unknown }).type === 'daakia-notice';
}

const ACCENT = 'var(--color-ai-accent, #D97757)';

export function AiNoticeCard({ payload, submit }: { payload: AiNoticePayload; submit?: (text: string) => void }) {
  const error = payload.tone === 'error';
  const color = error ? 'var(--color-error)' : 'var(--color-text-muted)';
  return (
    <div className="flex items-center flex-wrap" role={error ? 'alert' : 'status'}
         style={{
           gap: 10, padding: '9px 12px', borderRadius: 10, maxWidth: 640,
           border: `1px solid color-mix(in srgb, ${color} 35%, var(--color-surface-border))`,
           background: `color-mix(in srgb, ${color} ${error ? 8 : 4}%, var(--color-panel))`,
         }}>
      {error ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill={color} aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
      )}
      <span className="flex-1 min-w-0" style={{ fontSize: 12.5, lineHeight: 1.5, color: error ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
        {payload.rawText}
      </span>
      {payload.retry && submit && (
        <ButtonView
          variant="secondary"
          size="sm"
          accentColor={ACCENT}
          color={ACCENT}
          iconLeft={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" /><path d="M3 21v-5h5" /></svg>}
          title={`Ask again: ${payload.retry.slice(0, 120)}${payload.retry.length > 120 ? '…' : ''}`}
          onClick={() => submit(payload.retry!)}
        >
          {error ? 'Retry' : 'Ask again'}
        </ButtonView>
      )}
    </div>
  );
}
