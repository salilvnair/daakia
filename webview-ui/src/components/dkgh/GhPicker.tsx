/**
 * The pane's picker, as github.com does it.
 *
 * A gear on the section heading, a panel that drops under it with a filter box
 * and a list of checkboxes, and a click anywhere else puts it away. That is the
 * interaction everybody using this tab already knows from the site, and
 * matching it is worth more here than anything we might invent.
 *
 * ── Why a popover and not an accordion ──
 *
 * The rail has nine sections. An accordion pushes the eight below it down the
 * moment one opens, so the row somebody was about to read has moved; and a
 * list of thirty labels inside a rail is a list that scrolls the rail. A layer
 * on top leaves the page where it was.
 *
 * ── Closing ──
 *
 * Pointer-down outside, or Escape. `pointerdown` rather than `click` because a
 * click that started inside the panel and ended outside it — a drag across the
 * filter box that overshoots — is not somebody dismissing the panel.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Ico } from './GhIcons';
import { dropPortal, dropStyle, useDropPanel } from './drop-panel';
import { GhAvatar } from './GhAvatar';

export interface Choice {
  value: string;
  /** GitHub shows a label's description under its name. */
  note?: string;
  /** The dot beside it, in that value's own colour. */
  swatch?: string;
  /** An avatar initial instead of a dot, for a person. */
  avatar?: string;
}

export function GhPicker({
  title, filterLabel, choices, chosen, empty, single, onPick, label, value, isSet, footer,
}: {
  /** "Apply labels to this issue" — the panel's own heading. */
  title: string;
  filterLabel: string;
  choices: Choice[];
  chosen: string[];
  empty: string;
  /** A single-select field: picking one replaces what is there. */
  single?: boolean;
  onPick: (value: string) => void;
  /** The section heading, which the gear sits on. */
  label: string;
  /** What the section shows when the panel is shut. */
  value: React.ReactNode;
  /**
   * Whether that value is a real one.
   *
   * Normally a node means something is set and nothing means nothing is. The
   * composer breaks that: with no assignee the row still draws a line — "No
   * one — assign yourself" — and it must read as the placeholder it is, not
   * as a filled field.
   */
  isSet?: boolean;
  footer?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const box = useRef<HTMLDivElement>(null);
  /*
    Portalled and fixed — see `useDropPanel`.

    It was `position: absolute` inside the section, which is inside a 268px
    rail with `overflow-y: auto`. A 340px panel in there was clipped at the
    rail's edge *and* pushed a horizontal scrollbar across the bottom of the
    pane. No z-index fixes either of those: overflow clips a descendant
    whatever its stacking order, and content wider than its container is what
    makes the scrollbar.
  */
  const close = useCallback(() => setOpen(false), []);
  const { panel, at } = useDropPanel(open, close, box);

  /* Cleared on open, not on close: reopening a picker you were half-way
     through filtering and finding your own text still in it is the behaviour
     people expect from a search box they never emptied. */
  useEffect(() => { if (open) setFilter(''); }, [open]);

  const q = filter.trim().toLowerCase();
  const shown = q
    ? choices.filter(c => c.value.toLowerCase().includes(q)
      || (c.note ?? '').toLowerCase().includes(q))
    : choices;
  /* Ticked first, the way github.com groups them — the answer to "what is on
     this issue" should not be somewhere in the middle of forty rows. */
  const ordered = [
    ...shown.filter(c => chosen.includes(c.value)),
    ...shown.filter(c => !chosen.includes(c.value)),
  ];
  const firstUnchosen = ordered.findIndex(c => !chosen.includes(c.value));

  return (
    <div className="msec" ref={box} style={{ position: 'relative' }}>
      <div className="mh" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {label}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className={`iconbtn${open ? ' on' : ''}`}
          title={title}
          aria-label={title}
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
        >
          <Ico name="pen" />
        </button>
      </div>

      <div className={`val${(isSet ?? !!value) ? ' set' : ''}`}>
        {value ?? `No ${label.toLowerCase()}`}
      </div>

      {open && dropPortal(box.current, (
        <div ref={panel} className="ghpick" style={dropStyle(at)}>
          <div className="ghpick-h">{title}</div>
          <div className="ghpick-f">
            <Ico name="search" />
            <input
              autoFocus
              value={filter}
              placeholder={filterLabel}
              onChange={e => setFilter(e.target.value)}
              aria-label={filterLabel}
            />
          </div>
          <div className="ghpick-l">
            {ordered.length === 0 && (
              <div className="ghpick-e">{q ? `Nothing matches “${filter}”.` : empty}</div>
            )}
            {ordered.map((c, at) => {
              const on = chosen.includes(c.value);
              return (
                <div key={c.value}>
                  {/* The divider github.com puts between what is on the issue
                      and what is not. Only when there is something on it. */}
                  {at === firstUnchosen && at > 0 && <div className="ghpick-s" />}
                  <button
                    type="button"
                    className={`ghpick-r${on ? ' on' : ''}`}
                    onClick={() => { onPick(c.value); if (single) setOpen(false); }}
                  >
                    <span className="bx">{on && <Ico name="check" />}</span>
                    {c.avatar
                      ? <GhAvatar who={c.value} className={c.avatar} />
                      : c.swatch && <span className="sw" style={{ background: c.swatch }} />}
                    <span className="ghpick-t">
                      <b>{c.value}</b>
                      {c.note && <i>{c.note}</i>}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
          {footer && <div className="ghpick-b">{footer}</div>}
        </div>
      ))}
    </div>
  );
}
