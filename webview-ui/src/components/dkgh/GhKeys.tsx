/**
 * Screen 05D — the whole board from the keyboard.
 *
 * Triage is repetitive, and repetitive work is where a keyboard beats a mouse
 * by a factor nobody argues about. The bindings are the ones muscle memory
 * already has from other tools: `j`/`k` to move, `Space` to select, `Enter` to
 * open, `/` to search, `?` for this list.
 *
 * **The cursor and the selection are different things**, and that is the one
 * genuinely confusing part of a keyboard table. Every action acts on the
 * selection if there is one, otherwise on the row under the cursor — so with
 * two rows selected, `a` assigns those two and not the row the cursor happens
 * to be sitting on. The footer says so out loud, before the key is pressed,
 * rather than leaving somebody to discover it by assigning the wrong issue.
 *
 * `Space` is also the peek: held, it opens the panel; tapped, it selects. One
 * key with two meanings separated by the hold, which is how a spring-loaded
 * gesture is supposed to work — see screen 04D.
 */
import { useEffect } from 'react';
import { KbdView } from '@salilvnair/dui';
import { ACCENT } from './types';

/** How long Space has to be down before it is a peek rather than a select. */
export const PEEK_HOLD_MS = 220;

export const BINDINGS: { keys: string[]; joiner?: string; does: string }[] = [
  { keys: ['j', 'k'], joiner: ' ', does: 'move the cursor' },
  { keys: ['Space'], does: 'select this row · hold to peek' },
  { keys: ['Shift', 'j'], joiner: '+', does: 'extend the selection' },
  { keys: ['Enter'], does: 'open the issue' },
  { keys: ['o'], does: 'open it on github.com' },
  { keys: ['a'], does: 'assign…' },
  { keys: ['l'], does: 'label…' },
  { keys: ['m'], does: 'milestone…' },
  { keys: ['c'], does: 'close' },
  { keys: ['/'], does: 'jump to search' },
  { keys: ['g'], does: 'group by…' },
  { keys: ['?'], does: 'this list' },
  { keys: ['Esc'], does: 'clear the selection' },
];

export function GhKeys({ onClose }: { onClose: () => void }) {
  /*
    Escape closes it, and the board's own keys are off while it is up.
    A list of keys you have to reach for the mouse to dismiss is a list that
    contradicts itself.
  */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="absolute inset-0" style={{ zIndex: 40, background: 'rgba(0,0,0,.45)' }}
           onClick={onClose} />
      <div className="absolute rounded-xl border overflow-hidden"
           style={{
             left: '50%',
             top: '50%',
             transform: 'translate(-50%, -50%)',
             width: 'min(400px, 88%)',
             zIndex: 41,
             borderColor: 'var(--color-surface-border)',
             background: 'var(--color-surface)',
             boxShadow: '0 14px 42px rgba(0,0,0,.5)',
           }}>
        <div className="px-3 py-2 text-[11px] font-medium"
             style={{
               color: 'var(--color-text-primary)',
               borderBottom: '1px solid var(--color-surface-border)',
               background: `color-mix(in srgb, ${ACCENT} 10%, transparent)`,
             }}>
          Keys
        </div>
        <div className="p-2 grid gap-x-3 gap-y-1"
             style={{ gridTemplateColumns: 'auto 1fr' }}>
          {BINDINGS.map(b => (
            <Fragmentish key={b.keys.join('+')} keys={b.keys} joiner={b.joiner} does={b.does} />
          ))}
        </div>
        <div className="px-3 py-2 text-[9.5px]"
             style={{
               color: 'var(--color-text-muted)',
               borderTop: '1px solid var(--color-surface-border)',
               lineHeight: 1.55,
             }}>
          Every one of these acts on <b style={{ color: 'var(--color-text-primary)' }}>the
          selection if there is one</b>, otherwise on the row under the cursor.
        </div>
      </div>
    </>
  );
}

/** One binding, as two grid cells rather than a row, so the keys line up. */
function Fragmentish({ keys, joiner, does }: { keys: string[]; joiner?: string; does: string }) {
  return (
    <>
      <span className="flex items-center gap-1 justify-end">
        {joiner === '+' ? (
          <KbdView keys={keys} size="xs" />
        ) : (
          keys.map(k => <KbdView key={k} keys={k} size="xs" />)
        )}
      </span>
      <span className="text-[10.5px] flex items-center"
            style={{ color: 'var(--color-text-secondary)' }}>
        {does}
      </span>
    </>
  );
}

/**
 * The line at the bottom that says what the next key would do.
 *
 * Resolves the cursor-versus-selection question out loud, in the exact terms of
 * what is on screen right now — "a would assign #36 and #28, not #24" is a
 * sentence nobody has to be taught.
 */
export function GhKeyStatus({ selected, cursor }: { selected: number[]; cursor?: number }) {
  if (selected.length === 0) {
    return cursor === undefined ? null : (
      <span>
        cursor on <b style={{ color: 'var(--color-text-primary)' }}>#{cursor}</b> — keys act on it
      </span>
    );
  }
  const list = selected.slice(0, 3).map(n => `#${n}`).join(' and ');
  const more = selected.length > 3 ? ` and ${selected.length - 3} more` : '';
  return (
    <span>
      {selected.length} selected
      {cursor !== undefined && !selected.includes(cursor) && <> · cursor on #{cursor}</>} —{' '}
      <b style={{ color: 'var(--color-text-primary)' }}>a</b> would assign {list}{more}
      {cursor !== undefined && !selected.includes(cursor) && <>, not #{cursor}</>}
    </span>
  );
}
