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
import { ButtonView, CalloutView, CodeBlockView, BadgeChipView } from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { CheckIcon, CloseIcon, RefreshIcon, LockIcon } from '../../icons';
import { ACCENT } from './types';
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
    <div className="flex-shrink-0" style={{
      borderBottom: '1px solid color-mix(in srgb, var(--color-error) 35%, transparent)',
      background: 'color-mix(in srgb, var(--color-error) 6%, transparent)',
    }}>
      <div className="mx-auto px-5 py-4 flex flex-col gap-3" style={{ maxWidth: 720 }}>

        <div className="flex items-center gap-2 flex-wrap">
          <LockIcon size={14} style={{ color: 'var(--color-error)', flexShrink: 0 }} />
          <span className="text-[13px] font-bold" style={{ color: 'var(--color-error)' }}>
            Signed out
          </span>
          <BadgeChipView tone="var(--color-error)" size="xs">session ended</BadgeChipView>
          <span className="flex-1" />
          {boardAge != null && (
            <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
              board is {Math.max(1, Math.round(boardAge / 60_000))} min old
            </span>
          )}
        </div>

        <p className="text-[11.5px] m-0" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
          Your GitHub session ended. <b style={{ color: 'var(--color-text-primary)' }}>Nothing you
          were doing has been lost.</b> The board below is what was on screen when it happened —
          it is not being refreshed, and it says its own age.
        </p>

        {detail && (
          <pre className="text-[10px] m-0 px-2.5 py-1.5 rounded-lg whitespace-pre-wrap"
               style={{ background: 'var(--color-panel)', color: 'var(--color-text-muted)',
                        overflowWrap: 'anywhere' }}>
            {detail}
          </pre>
        )}

        <CodeBlockView code="gh auth login" language="bash" fill showCopyButton accentColor={ACCENT} />

        {/* What survived, and what did not */}
        {held.length > 0 && (
          <div className="rounded-lg border overflow-hidden"
               style={{ borderColor: 'var(--color-surface-border)', background: 'var(--color-surface)' }}>
            <div className="px-3 py-1.5 text-[9.5px] font-bold uppercase tracking-wider"
                 style={{ color: 'var(--color-text-muted)',
                          borderBottom: '1px solid var(--color-surface-border)' }}>
              Held for you
            </div>
            {kept.map(h => (
              <Row key={h.id} ok label={h.label} />
            ))}
            {dropped.map(h => (
              <Row key={h.id} label={h.label} action={h.replay && (
                <ButtonView size="sm" variant="ghost" accentColor={ACCENT}
                            onClick={() => onReplay(h)}>
                  {h.replay.label}
                </ButtonView>
              )} />
            ))}
          </div>
        )}

        {dropped.some(h => h.replay) && (
          <CalloutView variant="warning" title="Not replayed on your behalf" style={{ margin: 0 }}>
            Time has passed and somebody else may have moved that card since. Replaying a stale
            intention silently is exactly how a status board ends up wrong — so it is offered,
            with what it would do, and you decide.
          </CalloutView>
        )}

        <div className="flex gap-2 flex-wrap">
          <ButtonView size="md" variant="primary" accentColor={ACCENT}
                      iconLeft={<RefreshIcon size={12} />}
                      onClick={() => { resumed(); onSignedBackIn(); }}>
            I have signed back in
          </ButtonView>
          <ButtonView size="md" accentColor="var(--color-text-muted)"
                      onClick={() => postMsg({ type: 'terminal:open' })}>
            Open a terminal here
          </ButtonView>
        </div>
      </div>
    </div>
  );
}

function Row({ ok, label, action }: { ok?: boolean; label: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5"
         style={{ borderTop: '1px solid color-mix(in srgb, var(--color-surface-border) 55%, transparent)' }}>
      {ok
        ? <CheckIcon size={11} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
        : <CloseIcon size={11} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />}
      <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      <span className="flex-1" />
      {action}
    </div>
  );
}
