/**
 * Screens 04A and 04B — the panel beside the card board.
 *
 * The markup is the mock's `.facets`, with the search box and the collapsible
 * headings every dkgh panel now carries — see `GhPanel`.
 *
 * Two decisions that look separate and are not: **what the board is grouped by**
 * and **what is on a card**. They interact — a card repeating its own group
 * header is noise, so grouping by Module turns the Module chip off — and a
 * reader who has to open two menus to discover that will never discover it.
 *
 * Every dimension in the field map can be the grouping, with the number of
 * distinct values beside each: a dimension with one value is a grouping that
 * produces one group, and seeing that before you pick it saves the click.
 *
 * Everything on a card can be switched off **except the title**. A card whose
 * title ends in an ellipsis makes you open it to find out whether you cared,
 * which is the one thing a board exists to save you.
 */
import { useState } from 'react';
import { Ico } from './GhIcons';
import { PanelSearch, PanelSection, matches } from './GhPanel';
import { CARD_FIELDS, type CardField, type Density } from './board-prefs';
import { NATIVE_GROUPS, cap, valueOf, type BoardIssue, type ProposedDimension } from './board-types';

const DENSITIES: Density[] = ['comfortable', 'compact', 'dense'];

export function GhCardOptions({
  issues, dimensions, groupBy, onGroupBy,
  cardFields, onCardFields, density, onDensity, view,
}: {
  issues: BoardIssue[];
  dimensions: ProposedDimension[];
  groupBy: string;
  onGroupBy: (id: string) => void;
  cardFields: CardField[];
  onCardFields: (next: CardField[]) => void;
  density: Density;
  onDensity: (d: Density) => void;
  /** The table has its own column panel; this one only offers density there. */
  view: string;
}) {
  const [term, setTerm] = useState('');

  const options = [
    ...NATIVE_GROUPS,
    ...dimensions.map(d => ({ id: d.dimension, label: cap(d.dimension) })),
  ];

  /* How many groups each choice would actually make. A dimension nothing in
     this repository fills is a grouping that produces one pile called "No
     module", and the number says so before anybody picks it. */
  const spread = (id: string) => {
    if (id === 'none') return undefined;
    const seen = new Set<string>();
    for (const i of issues) seen.add(valueOf(i, id) || '—');
    return seen.size;
  };

  const toggle = (id: CardField) => onCardFields(
    cardFields.includes(id) ? cardFields.filter(f => f !== id) : [...cardFields, id],
  );

  const shownGroups = options.filter(o => matches(o.label, term) || matches('group by', term));
  const shownFields = CARD_FIELDS.filter(f => matches(f.label, term) || matches('card', term));
  const shownDensity = DENSITIES.filter(d => matches(d, term) || matches('density', term));
  const showing = shownGroups.length + shownDensity.length
    + (view === 'cards' ? shownFields.length : 0);

  return (
    <div className="facets">
      <PanelSearch value={term} onChange={setTerm} placeholder="Search options…" count={showing} />

      {shownGroups.length > 0 && (
        <PanelSection title="Group by" count={options.length}>
          {shownGroups.map(o => {
            const n = spread(o.id);
            return (
              <div
                key={o.id}
                className={`fct${groupBy === o.id ? ' on' : ''}`}
                style={{ width: '100%', cursor: 'pointer' }}
                onClick={() => onGroupBy(o.id)}
              >
                <span className="bx">{groupBy === o.id && <Ico name="check" />}</span>
                {o.label}
                <span className="n">{o.id === 'none' ? 'flat' : n ?? ''}</span>
              </div>
            );
          })}
        </PanelSection>
      )}

      {shownDensity.length > 0 && (
        <PanelSection title="Density" note={density}>
          <div className="andor">
            {shownDensity.map(d => (
              <span key={d} className={density === d ? 'on' : undefined}
                    style={{ cursor: 'pointer' }} onClick={() => onDensity(d)}>
                {cap(d)}
              </span>
            ))}
          </div>
        </PanelSection>
      )}

      {view === 'cards' && shownFields.length > 0 && (
        <PanelSection title="Show on each card" note={`${cardFields.length} on`}>
          {shownFields.map(f => {
            /*
              Module is off while the board is grouped by it, and the row says
              why rather than silently disagreeing with the screen.
            */
            const shadowed = f.id === 'module' && groupBy === 'module';
            const on = cardFields.includes(f.id) && !shadowed;
            return (
              <div
                key={f.id}
                className={`fct${on ? ' on' : ''}`}
                style={{ width: '100%', cursor: 'pointer', opacity: shadowed ? 0.5 : 1 }}
                title={shadowed
                  ? 'The board is grouped by module — a card repeating its own group header is noise'
                  : f.why}
                onClick={() => toggle(f.id)}
              >
                <span className="bx">{on && <Ico name="check" />}</span>
                {f.label}
              </div>
            );
          })}
          <div className="fct" style={{ display: 'block', fontSize: 9, lineHeight: 1.5,
                                        color: 'var(--dk-faint)' }}>
            The title is not on this list. It is never truncated and never switched off — a
            half-title is worse than a tall card.
          </div>
        </PanelSection>
      )}

      {showing === 0 && (
        <div className="fct" style={{ color: 'var(--dk-faint)' }}>
          Nothing here matches “{term.trim()}”.
        </div>
      )}
    </div>
  );
}
