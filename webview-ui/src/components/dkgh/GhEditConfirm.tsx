/**
 * The command, before it runs — and what happened, after.
 *
 * One strip for every write on the board, whether it came from the selection
 * bar or from a table cell. Two rules it exists to keep:
 *
 * - **A write shows its list before it runs.** The lines here came back from
 *   the host unrun, built by the same function that will run them, so this
 *   cannot display one command and execute another.
 * - **It reports per issue after.** If one of three fails — somebody closed it
 *   a minute ago — the other two still happened and the failure is named. A
 *   bulk action that rolls back on the first error is one nobody trusts twice,
 *   and a bulk action that reports only "failed" is worse: the reader needs to
 *   know which rows moved before they try again.
 */
import { ButtonView, BadgeChipView, CodeBlockView } from '@salilvnair/dui';
import { WarningTriangleIcon, CheckCircleIcon } from '../../icons';
import type { EditFlow } from './edit-flow';
import { ACCENT } from './types';

export function GhEditConfirm({ flow }: { flow: EditFlow }) {
  const { plan, running, outcomes, apply, cancel, dismiss } = flow;

  if (outcomes) {
    const ok = outcomes.filter(o => o.ok).length;
    const failed = outcomes.filter(o => !o.ok);
    return (
      <Strip>
        <div className="flex items-center gap-2">
          {failed.length === 0
            ? <CheckCircleIcon size={12} style={{ color: 'var(--color-success)' }} />
            : <WarningTriangleIcon size={12} style={{ color: 'var(--color-warning)' }} />}
          <span className="text-[10.5px]" style={{ color: 'var(--color-text-primary)' }}>
            {ok} of {outcomes.length} applied
          </span>
          {failed.length > 0 && ok > 0 && (
            <BadgeChipView tone="var(--color-warning)" size="xs">partly applied</BadgeChipView>
          )}
          <span className="flex-1" />
          <ButtonView size="sm" accentColor="var(--color-text-muted)" onClick={dismiss}>
            Dismiss
          </ButtonView>
        </div>
        {failed.map(o => (
          <span key={o.number} className="flex items-start gap-1.5 text-[10px]"
                style={{ color: 'var(--color-error)' }}>
            <WarningTriangleIcon size={10} style={{ marginTop: 2, flexShrink: 0 }} />
            <span><b>#{o.number}</b> — {o.error}</span>
          </span>
        ))}
      </Strip>
    );
  }

  if (!plan) return null;

  return (
    <Strip>
      <div className="flex items-center gap-2">
        <span className="text-[10.5px]" style={{ color: 'var(--color-text-primary)' }}>
          {plan.summary}
        </span>
        <span className="flex-1" />
        <ButtonView size="sm" accentColor="var(--color-text-muted)" onClick={cancel}
                    disabled={running}>
          Cancel
        </ButtonView>
        <ButtonView size="sm" variant="primary" accentColor={ACCENT} onClick={apply}
                    disabled={running || plan.commands.length === 0}>
          {running ? 'Running…'
            : plan.commands.length === 1 ? 'Run it'
            : `Run ${plan.commands.length}`}
        </ButtonView>
      </div>
      {plan.commands.length === 0 ? (
        <span className="text-[10px]" style={{ color: 'var(--color-warning)' }}>
          That would change nothing on any of them.
        </span>
      ) : (
        <>
          <CodeBlockView
            code={plan.commands.map(c => c.display).join('\n')}
            language="bash"
            fill
            showCopyButton
            accentColor={ACCENT}
            maxHeight="110px"
          />
          <span className="text-[9.5px]" style={{ color: 'var(--color-text-muted)' }}>
            {plan.commands.length === 1
              ? 'One call. Nothing is retried — a failure comes back said plainly.'
              : `${plan.commands.length} calls, run in order. If one fails the rest still happen.`}
          </span>
        </>
      )}
    </Strip>
  );
}

function Strip({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-2 flex flex-col gap-1.5 flex-shrink-0"
         style={{
           background: `color-mix(in srgb, ${ACCENT} 6%, var(--color-panel))`,
           borderTop: '1px solid var(--color-surface-border)',
           borderBottom: '1px solid var(--color-surface-border)',
         }}>
      {children}
    </div>
  );
}
