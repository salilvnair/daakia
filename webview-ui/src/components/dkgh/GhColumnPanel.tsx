/**
 * Screen 05A — the columns, and the order they are in.
 *
 * The markup is the mock's `.colpick` of `.colrow`: a drag grip, a `.sel`
 * tick, the name, and on the right either `pinned` or a `.bsrc` badge saying
 * where the column comes from — inside the `.facets` rail every dkgh panel
 * uses, with its search box and collapsible headings.
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
 * `#` and `Title` are pinned and cannot be moved or hidden. A row you cannot
 * identify is not a row.
 */
import { useState } from 'react';
import { Ico } from './GhIcons';
import { PanelSearch, PanelSection, matches } from './GhPanel';
import { DEFAULT_COLUMNS } from './board-prefs';
import { arrange, catalogue, SOURCE_LABEL, type TableColumn } from './table-columns';
import type { ProposedDimension } from './board-types';

const SOURCE_CLASS: Record<string, string> = {
  native: 'b-native',
  form: 'b-form',
  computed: 'b-label',
};

export function GhColumnPanel({
  dimensions, columns, onColumns, wrapTitles, onWrapTitles,
}: {
  dimensions: ProposedDimension[];
  columns: string[];
  onColumns: (next: string[]) => void;
  wrapTitles: boolean;
  onWrapTitles: (next: boolean) => void;
}) {
  const [term, setTerm] = useState('');

  const all = catalogue(dimensions);
  const shown = arrange(all, columns);
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

  return (
    <div className="facets">
      <PanelSearch value={term} onChange={setTerm} placeholder="Search columns…" count={showing} />

      {visibleShown.length > 0 && (
        <PanelSection
          title="Shown — in this order"
          note={`${shown.length} of ${all.length}`}
          onClear={() => onColumns(DEFAULT_COLUMNS)}
        >
          <div className="colpick">
            {visibleShown.map((c, i) => (
              <div key={c.key} className={`colrow${c.pinned ? ' pinned' : ''}`}>
                <Ico name="drag" />
                <span className="sel on"><Ico name="check" /></span>
                {c.label}
                <span className="sp" />
                {c.pinned ? (
                  <span style={{ fontSize: 9, color: 'var(--dk-gh)' }}>pinned</span>
                ) : (
                  <>
                    <span className={`bsrc ${SOURCE_CLASS[c.source]}`}>
                      {SOURCE_LABEL[c.source]}
                    </span>
                    <Tiny label="Move up" disabled={i === 0 || visibleShown[i - 1].pinned}
                          onClick={() => move(c.key, -1)} name="chev"
                          style={{ transform: 'rotate(180deg)' }} />
                    <Tiny label="Move down" disabled={i === visibleShown.length - 1}
                          onClick={() => move(c.key, 1)} name="chev" />
                    <Tiny label="Hide" name="check"
                          onClick={() => onColumns(columns.filter(k => k !== c.key))} />
                  </>
                )}
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

function Tiny({ label, disabled, onClick, name, style }: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  name: 'chev' | 'check' | 'plus';
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
