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
 *
 * **The sheet is grouped, and reads left to right.** Fourteen bindings in one
 * ragged column with the keys right-aligned against a wall is a list you scan
 * three times to find `m`. They are four short groups instead — where you are,
 * what you open, what you do to it, what you go looking for — in two columns,
 * each row reading *name, then key*, the order somebody thinks in when they
 * already know what they want to do and are only after the shortcut for it.
 */
import { useEffect } from 'react';
import { KbdView } from '@salilvnair/dui';
import { ACCENT } from './types';

/** How long Space has to be down before it is a peek rather than a select. */
export const PEEK_HOLD_MS = 220;

export interface Binding { keys: string[]; joiner?: string; does: string }

/**
 * The bindings, in the four groups the sheet shows them in.
 *
 * `BINDINGS` below is still the flat list, because everything else that reads
 * this file — the status line, the tests — wants one list and does not care
 * which heading a key sits under.
 */
export const KEY_GROUPS: { title: string; keys: Binding[] }[] = [
  {
    title: 'Move and select',
    keys: [
      { keys: ['j', 'k'], joiner: ' ', does: 'move the cursor' },
      { keys: ['Space'], does: 'select this row · hold to peek' },
      { keys: ['Shift', 'j'], joiner: '+', does: 'extend the selection' },
      { keys: ['Esc'], does: 'clear the selection' },
    ],
  },
  {
    title: 'Open',
    keys: [
      { keys: ['Enter'], does: 'open the issue' },
      { keys: ['o'], does: 'open it on github.com' },
    ],
  },
  {
    title: 'Act on it',
    keys: [
      { keys: ['a'], does: 'assign…' },
      { keys: ['l'], does: 'label…' },
      { keys: ['m'], does: 'milestone…' },
      { keys: ['c'], does: 'close' },
    ],
  },
  {
    title: 'Find',
    keys: [
      { keys: ['/'], does: 'jump to search' },
      { keys: ['f'], does: 'open the filters' },
      { keys: ['g'], does: 'group by…' },
      { keys: ['?'], does: 'this list' },
    ],
  },
];

export const BINDINGS: Binding[] = KEY_GROUPS.flatMap(g => g.keys);

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
      <div className="absolute inset-0" style={{ zIndex: 40, background: 'rgba(0,0,0,.5)' }}
           onClick={onClose} />
      <div
        className="absolute rounded-xl border overflow-hidden"
        role="dialog"
        aria-label="Keyboard shortcuts"
        style={{
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(680px, 92%)',
          maxHeight: '86%',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 41,
          borderColor: 'var(--color-surface-border)',
          background: 'var(--color-surface)',
          boxShadow: '0 18px 56px rgba(0,0,0,.55)',
        }}
      >
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{
            borderBottom: '1px solid var(--color-surface-border)',
            background: `color-mix(in srgb, ${ACCENT} 10%, transparent)`,
          }}
        >
          <span className="text-[14px] font-semibold" style={{ color: ACCENT }}>
            Keyboard shortcuts
          </span>
          <span className="flex-1" />
          <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            press <KbdView keys="Esc" size="md" /> to close
          </span>
        </div>

        {/*
          Two columns on anything but a narrow panel, and the groups flow down
          them. `break-inside: avoid` is what keeps a heading from ending up at
          the bottom of the first column with its keys at the top of the second.
        */}
        <div
          className="p-5 overflow-y-auto"
          style={{ columnCount: 2, columnGap: 32 }}
        >
          {KEY_GROUPS.map(g => (
            <section key={g.title} style={{ breakInside: 'avoid', marginBottom: 18 }}>
              <h3
                className="text-[10px] font-bold uppercase mb-1.5"
                style={{ letterSpacing: '.09em', color: 'var(--color-text-muted)' }}
              >
                {g.title}
              </h3>
              {g.keys.map(b => <Row key={b.keys.join('+')} binding={b} />)}
            </section>
          ))}
        </div>

        <div
          className="px-4 py-3 text-[11.5px]"
          style={{
            color: 'var(--color-text-secondary)',
            borderTop: '1px solid var(--color-surface-border)',
            lineHeight: 1.55,
          }}
        >
          Every one of these acts on <b style={{ color: 'var(--color-text-primary)' }}>the
          selection if there is one</b>, otherwise on the row under the cursor.
        </div>
      </div>
    </>
  );
}

/**
 * One binding: what it does, then the key.
 *
 * The name leads because that is the half you are searching for — you arrive
 * knowing you want to set a milestone and leave knowing it is `m`. The dotted
 * rule between them is there so the eye can cross a wide column without losing
 * the line.
 */
function Row({ binding }: { binding: Binding }) {
  const { keys, joiner, does } = binding;
  return (
    <div className="flex items-center gap-2.5 py-[5px]">
      <span className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
        {does}
      </span>
      <span
        className="flex-1"
        style={{ borderBottom: '1px dotted var(--color-surface-border)', minWidth: 8 }}
      />
      {/*
        Real keys, at the size a key is. `xs` chips beside 13px prose read as
        footnote markers rather than as something you press — and this sheet is
        read by exactly one kind of person: somebody looking for a key to press.
      */}
      <span className="dkkeys flex items-center gap-1.5 shrink-0">
        {joiner === '+'
          ? <KbdView keys={keys} size="lg" />
          : keys.map(k => <KbdView key={k} keys={k} size="lg" />)}
      </span>
    </div>
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
