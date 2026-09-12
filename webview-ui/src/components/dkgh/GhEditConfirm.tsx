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
import { Ico } from './GhIcons';
import { CopyWord } from './GhShell';
import type { EditFlow } from './edit-flow';

export function GhEditConfirm({ flow }: { flow: EditFlow }) {
  const { plan, running, outcomes, apply, cancel, dismiss } = flow;

  if (outcomes) {
    const ok = outcomes.filter(o => o.ok).length;
    const failed = outcomes.filter(o => !o.ok);
    return (
      <Strip>
        <div className="flex items-center gap-2">
          <Ico name={failed.length === 0 ? 'check' : 'warn'}
               style={{ color: failed.length === 0 ? 'var(--dk-green)' : 'var(--dk-amber)' }} />
          <span style={{ color: 'var(--dk-text)' }}>{ok} of {outcomes.length} applied</span>
          {failed.length > 0 && ok > 0 && <span className="chip c-stale">partly applied</span>}
          <span className="sp" style={{ flex: 1 }} />
          <button type="button" className="btn" onClick={dismiss}>Dismiss</button>
        </div>
        {failed.map(o => (
          <span key={o.number} className="flex items-start gap-1.5 sub"
                style={{ color: 'var(--dk-red)' }}>
            <Ico name="warn" style={{ marginTop: 2, flexShrink: 0 }} />
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
        <span style={{ color: 'var(--dk-text)' }}>{plan.summary}</span>
        <span className="sp" style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={cancel} disabled={running}>
          Cancel
        </button>
        <button type="button" className="btn go" onClick={apply}
                disabled={running || plan.commands.length === 0}>
          {running ? 'Running…'
            : plan.commands.length === 1 ? 'Run it'
            : `Run ${plan.commands.length}`}
        </button>
      </div>
      {plan.commands.length === 0 ? (
        <span className="sub" style={{ color: 'var(--dk-amber)' }}>
          That would change nothing on any of them.
        </span>
      ) : (
        <>
          {/* The mock's command panel, holding the list rather than one line —
              which is the whole point of showing it before it runs. */}
          <div className="cmd" style={{ alignItems: 'flex-start', maxHeight: 132,
                                        overflowY: 'auto' }}>
            <pre className="code" style={{ flex: 1 }}>
              {plan.commands.map(c => c.display).join('\n')}
            </pre>
            <CopyWord text={plan.commands.map(c => c.display).join('\n')} />
          </div>
          <span className="sub">
            {plan.commands.length === 1
              ? 'One call. Nothing is retried — a failure comes back said plainly.'
              : `${plan.commands.length} calls, run in order. If one fails the rest still happen.`}
          </span>
        </>
      )}
    </Strip>
  );
}

/**
 * The strip itself — the mock's unsaved-view bar, stacked rather than in a row.
 *
 * It is the same object: a thin accented band across the top of the board that
 * says something is pending and offers the two things to do about it.
 */
function Strip({ children }: { children: React.ReactNode }) {
  return (
    <div className="dirtybar" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 6,
      padding: '9px 19px', flexShrink: 0,
      background: 'color-mix(in srgb, var(--dk-gh) 6%, var(--dk-panel))',
      borderTop: '1px solid var(--dk-border)',
      /* Amber is the unsaved-view rule. This strip is about a pending write. */
      borderLeftColor: 'var(--dk-gh)',
    }}>
      {children}
    </div>
  );
}
