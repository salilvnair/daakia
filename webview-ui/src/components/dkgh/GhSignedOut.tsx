/**
 * Screen 02C — the credential dies while you are working.
 *
 * It never happens on the sign-in screen. It happens on the third card of a
 * triage session, and this screen's whole job is to make that survivable.
 *
 * Three deliberate choices, all of them about not punishing somebody for a
 * token expiring:
 *
 *   The board stays visible, dimmed, with its age stated. Blanking a board
 *   somebody is reading takes away the thing they were in the middle of using.
 *
 *   What is being held is listed — including what was NOT held. A recovery
 *   screen that reports only the good news is not a report.
 *
 *   The queued write is not replayed. Minutes have passed and somebody else may
 *   have moved that card; replaying a stale intention silently is exactly how a
 *   status board ends up wrong. It is offered, with what it would do.
 */
import { postMsg } from '../../vscode';
import { Ico } from './GhIcons';
import { GhCommand, GhNote } from './GhShell';
import { useGhSession, type HeldItem } from './session-store';

export function GhSignedOut({ repo, boardAge, onSignedBackIn, onReplay }: {
  repo?: string;
  /** Milliseconds since the board was last read, so it can state its own age. */
  boardAge?: number;
  onSignedBackIn: () => void;
  /** Offered, never automatic. */
  onReplay: (item: HeldItem) => void;
}) {
  const { detail, held, resumed } = useGhSession();
  const kept = held.filter(h => h.fate === 'kept');
  const dropped = held.filter(h => h.fate === 'dropped');

  return (
    /* The mock's unsaved-view strip, in red: a rule down the left edge rather
       than a wash across a board somebody is still reading. */
    <div className="dirtybar" style={{
      display: 'block', padding: 0,
      background: 'color-mix(in srgb, var(--dk-red) 7%, transparent)',
      borderBottom: '1px solid color-mix(in srgb, var(--dk-red) 35%, transparent)',
      /* The strip's rule is amber for an unsaved view; this one is not that. */
      borderLeftColor: 'var(--dk-red)',
    }}>
      <div className="mx-auto flex flex-col gap-3"
           style={{ maxWidth: 720, padding: '14px 20px' }}>

        <div className="flex items-center gap-2 flex-wrap">
          <Ico name="lock" style={{ color: 'var(--dk-red)', flexShrink: 0 }} />
          <span style={{ fontSize: 14.4, fontWeight: 700, color: 'var(--dk-red)' }}>
            Signed out
          </span>
          <span className="chip" style={{ color: 'var(--dk-red)',
                                          background: 'color-mix(in srgb, var(--dk-red) 14%, transparent)' }}>
            session ended
          </span>
          <span className="sp" style={{ flex: 1 }} />
          {boardAge != null && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11.4, color: 'var(--dk-faint)' }}>
              board is {Math.max(1, Math.round(boardAge / 60_000))} min old
            </span>
          )}
        </div>

        <p className="p" style={{ margin: 0, maxWidth: 'none', textAlign: 'left' }}>
          Your GitHub session ended. <b style={{ color: 'var(--dk-text)' }}>Nothing you
          were doing has been lost.</b> The board below is what was on screen when it happened —
          it is not being refreshed, and it says its own age.
        </p>

        {detail && <pre className="code" style={{ color: 'var(--dk-faint)' }}>{detail}</pre>}

        <GhCommand text="gh auth login" prompt="$" />

        {/* What survived, and what did not */}
        {held.length > 0 && (
          <div className="opt">
            <div className="fl">Held for you</div>
            {kept.map(h => (
              <Row key={h.id} ok label={h.label} />
            ))}
            {dropped.map(h => (
              <Row key={h.id} label={h.label} action={h.replay && (
                <button type="button" className="btn" style={{ padding: '2px 9px' }}
                        onClick={() => onReplay(h)}>
                  {h.replay.label}
                </button>
              )} />
            ))}
          </div>
        )}

        {dropped.some(h => h.replay) && (
          <GhNote title="Not replayed on your behalf" tone="warn" style={{ margin: 0 }}>
            Time has passed and somebody else may have moved that card since. Replaying a stale
            intention silently is exactly how a status board ends up wrong — so it is offered,
            with what it would do, and you decide.
          </GhNote>
        )}

        <div className="flex gap-2 flex-wrap">
          <button type="button" className="btn go"
                  onClick={() => { resumed(); onSignedBackIn(); }}>
            <Ico name="refresh" />I have signed back in
          </button>
          <button type="button" className="btn"
                  onClick={() => postMsg({ type: 'terminal:open' })}>
            <Ico name="term" />Open a terminal here
          </button>
        </div>
      </div>
    </div>
  );
}

/** One thing that was held, and whether it survived. */
function Row({ ok, label, action }: { ok?: boolean; label: string; action?: React.ReactNode }) {
  return (
    <div className="fct" style={{ cursor: 'default' }}>
      <Ico name={ok ? 'check' : 'x'}
           style={{ color: ok ? 'var(--dk-green)' : 'var(--dk-amber)', flexShrink: 0 }} />
      <span>{label}</span>
      <span className="sp" style={{ flex: 1 }} />
      {action}
    </div>
  );
}
