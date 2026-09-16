/**
 * Settings → DK8S → General — how many commands the audit reads back.
 *
 * ── Why it is a number and not "all" ──
 *
 * The audit table is the record and it keeps everything; this is how much of
 * it the screen asks for and renders. The whole page is one table with a row
 * per kubectl call, and dk8s makes a lot of them — a watch on eight namespaces
 * polls metrics once an interval, so a morning's work is thousands. Asking for
 * all of them makes opening the page a pause.
 *
 * Five hundred is roughly a session, which is the span somebody is actually
 * comparing against their terminal. It is here rather than in the code because
 * the right number depends on how many namespaces you watch, and that is not
 * something dk8s can know.
 */
import { usePersistedPref } from '../../store/ui-state-store';
import { TableIcon } from '../../icons';

const ACCENT = 'var(--color-dk8s)';

export const COMMAND_AUDIT_LIMIT_KEY = 'dk8s.commandAuditLimit';
export const DEFAULT_COMMAND_AUDIT_LIMIT = 500;

/** Below this the page cannot show a session; above it, it is a data export. */
const CHOICES = ['100', '250', '500', '1000', '2500'] as const;
type Choice = typeof CHOICES[number];

/** What the audit screen should ask for, resolved from what was stored. */
export function commandAuditLimit(stored: string | undefined): number {
  /* `Number('')` is 0, not NaN — so a blank preference would clamp to the
     minimum and show a nearly empty screen rather than falling back. */
  if (stored === undefined || stored.trim() === '') return DEFAULT_COMMAND_AUDIT_LIMIT;
  const n = Number(stored);
  if (!Number.isFinite(n)) return DEFAULT_COMMAND_AUDIT_LIMIT;
  return Math.min(5000, Math.max(50, Math.round(n)));
}

export function CommandAuditLimitSetting() {
  const [value, setValue] = usePersistedPref<Choice>(
    COMMAND_AUDIT_LIMIT_KEY, String(DEFAULT_COMMAND_AUDIT_LIMIT) as Choice, CHOICES,
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        <span className="text-[9.5px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
          commands
        </span>
        <div className="flex-1 h-px" style={{ background: 'var(--color-surface-border)' }} />
      </div>

      <div className="flex flex-col gap-3 px-4 py-3.5 rounded-lg"
           style={{
             background: 'var(--color-surface)',
             border: '1px solid var(--color-surface-border)',
             maxWidth: '100%',
           }}>
        <div className="flex items-start gap-3">
          <TableIcon size={15} style={{ color: ACCENT, marginTop: 2, flexShrink: 0 }} />
          <div className="flex flex-col gap-1.5 min-w-0 flex-1">
            <span className="text-[13px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
              How many commands the Commands tab shows
            </span>
            <span className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              The newest this many, most recent first. Nothing is deleted &mdash; the audit keeps
              every call either way; this is how far back the screen reads. Raise it if you watch
              many namespaces, because a metrics poll per namespace fills a page quickly.
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {CHOICES.map(c => {
            const on = c === value;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setValue(c)}
                className="text-[11.5px] px-2.5 py-1 rounded-md cursor-pointer transition-colors tabular-nums"
                style={{
                  color: on ? ACCENT : 'var(--color-text-muted)',
                  background: on ? `color-mix(in srgb, ${ACCENT} 12%, transparent)` : 'none',
                  border: `1px solid ${on
                    ? `color-mix(in srgb, ${ACCENT} 30%, transparent)`
                    : 'var(--color-surface-border)'}`,
                }}
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
