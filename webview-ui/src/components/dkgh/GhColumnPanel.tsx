/**
 * Screen 05A — the columns, and the order they are in.
 *
 * The markup is the mock's `.colpick` of `.colrow`: a drag grip, a `.sel` tick,
 * the name, and on the right the pin and a `.bsrc` badge saying where the
 * column comes from — inside the `.facets` rail every dkgh panel uses, with its
 * search box and collapsible headings.
 *
 * The column set is the table's whole personality, and it is also what the
 * export writes. Picking, ordering and pinning are one panel because they are
 * one decision — **there is no second dialog deciding what lands in the
 * spreadsheet.**
 *
 * **A column knows where it comes from.** That badge is not decoration: on a
 * repository with no issue forms, seeing that five of your eleven columns are
 * form-sourced is what explains an otherwise baffling row of dashes.
 *
 * **Pinning is a toggle, not a verdict.** `#` and `Title` start pinned, because
 * a row you cannot identify is not a row — but the pin beside every name says
 * so in a way you can argue with, and it is the app's own drawing pin, the one
 * that pins a request tab. The single rule it keeps is that a pinned column
 * cannot be hidden: freezing a column you cannot see is not a state worth being
 * able to reach, so the row asks you to unpin it first.
 */
import { useState } from 'react';
import { Ico } from './GhIcons';
import { PinIcon, UnpinIcon } from '../../icons';
import { PanelSearch, PanelSection, matches } from './GhPanel';
import { DEFAULT_COLUMNS } from './board-prefs';
import {
  arrange, catalogue, DEFAULT_PINNED, SOURCE_LABEL, type TableColumn,
} from './table-columns';
import type { ProposedDimension } from './board-types';

const SOURCE_CLASS: Record<string, string> = {
  native: 'b-native',
  form: 'b-form',
  computed: 'b-label',
};

export function GhColumnPanel({
  dimensions, columns, onColumns, pinned, onPinned, wrapTitles, onWrapTitles,
}: {
  dimensions: ProposedDimension[];
  columns: string[];
  onColumns: (next: string[]) => void;
  pinned: string[];
  onPinned: (next: string[]) => void;
  wrapTitles: boolean;
  onWrapTitles: (next: boolean) => void;
}) {
  const [term, setTerm] = useState('');

  const all = catalogue(dimensions);
  const shown = arrange(all, columns, pinned);
  const shownKeys = new Set(shown.map(c => c.key));
  const hidden = all.filter(c => !shownKeys.has(c.key));

  const visibleShown = shown.filter(c => matches(c.label, term));
  const visibleHidden = hidden.filter(c => matches(c.label, term));
  const showing = visibleShown.length + visibleHidden.length;

  /*
    The arrangement is written back in full, not patched, because the stored
    list can contain keys for columns this repository does not have — a Module
    column that means something in the repository you were in an hour ago. They
    are invisible here and must survive being here.
  */
  const move = (key: string, by: -1 | 1) => {
    const order = shown.map(c => c.key);
    const at = order.indexOf(key);
    const to = at + by;
    const firstMovable = shown.findIndex(c => !c.pinned);
    if (at < 0 || to < firstMovable || to >= order.length) return;
    [order[at], order[to]] = [order[to], order[at]];
    onColumns(merge(columns, order));
  };

  /* Pinning a hidden column shows it: a frozen column nobody can see is not a
     state worth being able to reach, and neither is the click that reaches it. */
  const togglePin = (key: string) => {
    if (pinned.includes(key)) {
      onPinned(pinned.filter(k => k !== key));
      return;
    }
    onPinned([...pinned, key]);
    if (!columns.includes(key)) onColumns([...merge(columns, shown.map(c => c.key)), key]);
  };

  return (
    <div className="facets">
      <PanelSearch value={term} onChange={setTerm} placeholder="Search columns…" count={showing} />

      {visibleShown.length > 0 && (
        <PanelSection
          title="Shown — in this order"
          note={`${shown.length} of ${all.length}`}
          clearTitle="Back to the default columns"
          onClear={() => { onColumns(DEFAULT_COLUMNS); onPinned(DEFAULT_PINNED); }}
        >
          <div className="colpick">
            {visibleShown.map((c, i) => (
              <div key={c.key} className={`colrow${c.pinned ? ' pinned' : ''}`}>
                <Ico name="drag" />
                <span className="sel on"><Ico name="check" /></span>
                {c.label}
                <span className="sp" />
                <span className={`bsrc ${SOURCE_CLASS[c.source]}`}>
                  {SOURCE_LABEL[c.source]}
                </span>
                <Pin on={!!c.pinned} label={c.label} onClick={() => togglePin(c.key)} />
                <Tiny label="Move up" name="chev" style={{ transform: 'rotate(180deg)' }}
                      disabled={c.pinned || i === 0 || !!visibleShown[i - 1]?.pinned}
                      onClick={() => move(c.key, -1)} />
                <Tiny label="Move down" name="chev"
                      disabled={c.pinned || i === visibleShown.length - 1}
                      onClick={() => move(c.key, 1)} />
                <Tiny label={c.pinned ? 'Unpin it before hiding it' : 'Hide'} name="x"
                      disabled={c.pinned}
                      onClick={() => onColumns(columns.filter(k => k !== c.key))} />
              </div>
            ))}
          </div>
        </PanelSection>
      )}

      {visibleHidden.length > 0 && (
        <PanelSection title="Hidden" count={hidden.length}>
          <div className="colpick">
            {visibleHidden.map(c => (
              <div key={c.key} className="colrow" style={{ opacity: 0.7 }}>
                <Ico name="drag" />
                <span className="sel" />
                {c.label}
                <span className="sp" />
                <span className={`bsrc ${SOURCE_CLASS[c.source]}`}>{SOURCE_LABEL[c.source]}</span>
                <Pin on={false} label={c.label} onClick={() => togglePin(c.key)} />
                <Tiny label="Show" name="plus"
                      onClick={() => onColumns([...merge(columns, shown.map(x => x.key)), c.key])} />
              </div>
            ))}
          </div>
        </PanelSection>
      )}

      <PanelSection title="Long values" note={wrapTitles ? 'wrapped' : 'one line'}>
        <div
          className={`fct${wrapTitles ? ' on' : ''}`}
          style={{ width: '100%', cursor: 'pointer' }}
          onClick={() => onWrapTitles(!wrapTitles)}
        >
          <span className="bx">{wrapTitles && <Ico name="check" />}</span>
          Wrap long titles
        </div>
        <div className="fct" style={{ display: 'block', fontSize: 9, lineHeight: 1.5,
                                      color: 'var(--dk-faint)' }}>
          A wrapped row is taller than the others and that is correct — the alternative is an
          ellipsis at exactly the point where the sentence was about to say the useful part.
        </div>
      </PanelSection>

      <div className="fct" style={{ display: 'block', fontSize: 9, lineHeight: 1.5,
                                    color: 'var(--dk-faint)' }}>
        This list is the export&rsquo;s column list too. There is no second dialog deciding what
        lands in the spreadsheet.
      </div>

      {showing === 0 && (
        <div className="fct" style={{ color: 'var(--dk-faint)' }}>
          Nothing here matches “{term.trim()}”.
        </div>
      )}
    </div>
  );
}

/** Keep unknown keys — they belong to another repository — and reorder the rest. */
function merge(stored: string[], order: string[]): string[] {
  const known = new Set(order);
  return [...order, ...stored.filter(k => !known.has(k))];
}

/**
 * The pin, and the same pin the app pins a tab with.
 *
 * It only appears on hover unless the column is pinned, so a panel at rest is a
 * list of column names rather than a column of identical icons — but a pinned
 * column keeps its pin lit, because that is the state you need to see without
 * hunting for it.
 */
function Pin({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`pin${on ? ' on' : ''}`}
      title={on ? `Unpin ${label}` : `Pin ${label} to the left`}
      aria-pressed={on}
      onClick={onClick}
    >
      {on ? <UnpinIcon size={11} /> : <PinIcon size={11} />}
    </button>
  );
}

function Tiny({ label, disabled, onClick, name, style }: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  name: 'chev' | 'x' | 'plus';
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'grid', placeItems: 'center', width: 15, height: 15, borderRadius: 3,
        color: 'var(--dk-faint)',
        opacity: disabled ? 0.3 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <Ico name={name} style={{ width: 9, height: 9, ...style }} />
    </button>
  );
}

export type { TableColumn };
