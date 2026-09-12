/**
 * The furniture every left panel in dkgh shares.
 *
 * Two things, and both come from how Daakia's own Settings nav already behaves
 * rather than from anything dkgh invented:
 *
 * - **A search box at the top, with a count.** A panel of nine sections is a
 *   panel somebody scrolls; one with a box they can type into is a panel they
 *   can answer a question with. The count is what the box currently leaves
 *   showing, so an empty result is visible before you go looking for it.
 * - **Section headings that collapse, with their own count.** The heading keeps
 *   the mock's `.fh` type and spacing; what is added is the number, the
 *   chevron, and the fact that it is a button.
 *
 * Which sections are shut is held per panel and per section, so closing Author
 * on the filter panel does not close anything on the column panel — and a
 * section somebody shut stays shut when the panel is toggled, because the panel
 * is collapsed rather than unmounted.
 */
import { useMemo, useState } from 'react';
import { Ico } from './GhIcons';

/** Search a label the way a person expects: case-blind, anywhere in the word. */
export function matches(label: string, term: string): boolean {
  return !term.trim() || label.toLowerCase().includes(term.trim().toLowerCase());
}

export function PanelSearch({ value, onChange, placeholder, count }: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  /** How many rows the box currently leaves showing. */
  count: number;
}) {
  return (
    <div className="panelsearch">
      <Ico name="search" />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      <span className="n">{count}</span>
    </div>
  );
}

/**
 * One collapsible section.
 *
 * Open by default: a panel that starts folded up hides the thing it exists to
 * show, and the reader has to open every section to find out what is in them.
 */
export function PanelSection({
  title, count, note, defaultOpen = true, onClear, clearTitle, children,
}: {
  title: string;
  /** The number beside the heading — how many rows are under it. */
  count?: number | string;
  /** A word instead of a count, where a count would mean nothing. */
  note?: string;
  defaultOpen?: boolean;
  onClear?: () => void;
  /** What clearing this section actually does, for the pointer to say. */
  clearTitle?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="facet">
      {/*
        The chevron leads, and the count is last.

        It sat on the right, after the count — which put the heading's number in
        a different column from the numbers on every row beneath it, two of the
        same thing at two different x positions. Leading it is what a disclosure
        triangle does everywhere else anyway, and it leaves the count where the
        rows put theirs: hard against the same right gutter, one column, top to
        bottom.
      */}
      <button type="button" className="fh" onClick={() => setOpen(o => !o)}>
        <Ico name="chev" className={`chev${open ? '' : ' shut'}`} />
        {title}
        {/*
          Reset is an icon, not the word `clear`. The heading already carries a
          chevron, a title and a count; a fourth piece of text in the same row is
          the one you read last and the one you meant to press.
        */}
        {onClear && open && (
          <span
            className="clr"
            role="button"
            title={clearTitle ?? 'Reset this section'}
            onClick={e => { e.stopPropagation(); onClear(); }}
          >
            <Ico name="x" />
          </span>
        )}
        <span className="n">{note ?? count ?? ''}</span>
      </button>
      {open && children}
    </div>
  );
}

/** Rows that survive a search term, with the count the box should show. */
export function useSearched<T>(rows: T[], term: string, label: (row: T) => string) {
  return useMemo(() => {
    const kept = rows.filter(r => matches(label(r), term));
    return { kept, count: kept.length };
  }, [rows, term, label]);
}
