/**
 * The path box, with completions from the response on screen.
 *
 * ── Why a response knows the answer ──
 *
 * A chaining path was written by reading the JSON in another tab and typing
 * what you saw — which is how `data.user.id` becomes `data.users.id` and the
 * rule quietly extracts nothing for the rest of its life. The response that
 * would be extracted from is right there; typing `[0].` should offer `id` and
 * `email` the way an editor offers members.
 *
 * ── Why not Monaco ──
 *
 * This is a 24px input in a form row, and Monaco is an editor with a worker,
 * a model and a layout of its own. What is wanted is its BEHAVIOUR — filter
 * as you type, arrow through, Enter to take, Escape to dismiss — which is a
 * list and four key cases.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TextInputView } from '@salilvnair/dui';
import { pathSuggestions } from '../../services/request/chaining';

export function PathField({ value, onChange, responseBody, placeholder, disabled }: {
  value: string;
  onChange: (next: string) => void;
  /** The response the path is written against; no body, no completions. */
  responseBody?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /*
    The list is drawn in a portal, at coordinates.

    Absolutely positioned inside the row it was clipped by the request
    panel's own scroller — the first suggestion visible and the rest cut off
    by the splitter, which is the one thing a completion list must not do.
  */
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);

  const place = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ left: r.left, top: r.bottom + 4, width: r.width });
  }, []);

  const options = useMemo(
    () => (responseBody ? pathSuggestions(responseBody, value) : []),
    [responseBody, value],
  );

  // A new set of options is a new list; keeping the old index would arrow you
  // into whatever happens to be at position four.
  useEffect(() => setActive(0), [value]);

  useEffect(() => {
    if (!open) return;
    place();
    const onDown = (e: MouseEvent) => {
      const inBox = boxRef.current?.contains(e.target as Node);
      const inList = listRef.current?.contains(e.target as Node);
      if (!inBox && !inList) setOpen(false);
    };
    // Anything that moves the input moves the list; `true` catches scrolls in
    // the panel's own container, which do not bubble.
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const take = (index: number) => {
    const picked = options[index];
    if (!picked) return;
    onChange(picked.value);
    /*
      Stay open after a pick.

      Choosing `data` is nearly always followed by choosing what is inside it,
      and a list that closes on every step makes a three-segment path three
      round trips. The new value re-runs the query, so what is offered next is
      the next level down.
    */
    setActive(0);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || options.length === 0) {
      // Ctrl+Space opens it deliberately, the way an editor does.
      if ((e.key === ' ' && (e.ctrlKey || e.metaKey)) || e.key === 'ArrowDown') {
        if (options.length > 0) { setOpen(true); e.preventDefault(); }
      }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % options.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i - 1 + options.length) % options.length); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); take(active); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  };

  return (
    <div ref={boxRef} className="relative flex-1 min-w-0">
      {/* dui's input, so this box is the same height as the variable box
          beside it and every other field in the panel — a hand-rolled one
          came out 24px against their 28. */}
      <TextInputView
        ref={inputRef}
        size="md"
        width="fw"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); place(); }}
        onFocus={() => { setOpen(true); place(); }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck={false}
        autoComplete="off"
        inputStyle={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
      />

      {open && options.length > 0 && !disabled && rect && createPortal(
        <div
          ref={listRef}
          className="rounded-md overflow-auto"
          style={{
            position: 'fixed',
            left: rect.left,
            top: rect.top,
            width: rect.width,
            zIndex: 1000,
            maxHeight: 180,
            background: 'var(--color-panel)',
            border: '1px solid var(--color-surface-border)',
            boxShadow: '0 6px 20px rgba(0,0,0,.35)',
          }}
        >
          {options.map((option, i) => (
            <div
              key={option.value}
              data-i={i}
              // `onMouseDown`, not `onClick`: the input's blur would close the
              // list before a click ever landed.
              onMouseDown={e => { e.preventDefault(); take(i); }}
              onMouseEnter={() => setActive(i)}
              className="flex items-center gap-2 px-2 py-1 cursor-pointer"
              style={{ background: i === active ? 'var(--color-item-hover-bg)' : 'transparent' }}
            >
              <span className="text-[11px] font-mono truncate"
                    style={{ color: 'var(--color-text-primary)' }}>{option.label}</span>
              <span className="text-[10px] font-mono truncate ml-auto"
                    style={{ color: 'var(--color-text-muted)' }}>{option.preview}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
