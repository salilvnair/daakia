/**
 * Screens 04A and 04B — the panel beside the board.
 *
 * Two decisions that look separate and are not: **what the board is grouped by**
 * and **what is on a card**. They interact — a card repeating its own group
 * header is noise, so grouping by Module turns the Module chip off — and a
 * reader who has to open two menus to discover that will never discover it.
 *
 * Every dimension in the field map can be the grouping. The ones GitHub always
 * has come first, then whatever the repository's templates declared, with the
 * number of distinct values beside each: a dimension with one value is a
 * grouping that produces one group, and seeing that before you pick it saves
 * the click.
 *
 * Everything on a card can be switched off **except the title**. A card whose
 * title ends in an ellipsis makes you open it to find out whether you cared,
 * which is the one thing a board exists to save you.
 */
import { CheckboxView, TogglePillView } from '@salilvnair/dui';
import { CARD_FIELDS, type CardField, type Density } from './board-prefs';
import { cap, type BoardIssue, type ProposedDimension } from './board-types';
import { NATIVE_GROUPS, valueOf } from './board-types';
import { ACCENT } from './types';

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
  /** The table has its own column panel; this side only offers density there. */
  view: string;
}) {
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

  const toggle = (id: CardField) => {
    onCardFields(cardFields.includes(id)
      ? cardFields.filter(f => f !== id)
      : [...cardFields, id]);
  };

  return (
    <div className="flex flex-col gap-3 overflow-y-auto flex-shrink-0"
         style={{
           width: 186,
           borderRight: '1px solid var(--color-surface-border)',
           padding: '12px 10px',
         }}>

      <Facet title="Group by">
        {options.map(o => {
          const n = spread(o.id);
          return (
            <Row key={o.id} on={groupBy === o.id} onClick={() => onGroupBy(o.id)}
                 aside={o.id === 'none' ? 'flat' : n !== undefined ? String(n) : undefined}>
              {o.label}
            </Row>
          );
        })}
      </Facet>

      <Facet title="Density">
        <div className="flex flex-wrap gap-1 px-0.5">
          {(['comfortable', 'compact', 'dense'] as Density[]).map(d => (
            <TogglePillView key={d} accentColor={ACCENT} active={density === d}
                            onClick={() => onDensity(d)}>
              {cap(d)}
            </TogglePillView>
          ))}
        </div>
      </Facet>

      {view === 'cards' && (
        <Facet title="Show on each card">
          {CARD_FIELDS.map(f => {
            /*
              Module is off while the board is grouped by it, and the checkbox
              says why rather than silently disagreeing with the screen.
            */
            const shadowed = f.id === 'module' && groupBy === 'module';
            return (
              <label key={f.id}
                     title={shadowed
                       ? 'The board is grouped by module — a card repeating its own group header is noise'
                       : f.why}
                     className="flex items-center gap-1.5 px-1 py-[3px] cursor-pointer"
                     style={{ opacity: shadowed ? 0.5 : 1 }}>
                <CheckboxView
                  checked={cardFields.includes(f.id) && !shadowed}
                  onChange={() => toggle(f.id)}
                  accentColor={ACCENT}
                  size="sm"
                />
                <span className="text-[10.5px]" style={{ color: 'var(--color-text-secondary)' }}>
                  {f.label}
                </span>
              </label>
            );
          })}
          <span className="text-[9.5px] px-1 pt-1"
                style={{ color: 'var(--color-text-muted)', lineHeight: 1.5,
                         borderTop: '1px solid var(--color-surface-border)' }}>
            The title is not on this list. It is never truncated and never
            switched off — a half-title is worse than a tall card.
          </span>
        </Facet>
      )}
    </div>
  );
}

function Facet({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] font-bold uppercase tracking-[.09em] px-1 pb-1"
            style={{ color: 'var(--color-text-muted)' }}>
        {title}
      </span>
      {children}
    </div>
  );
}

function Row({ on, aside, onClick, children }: {
  on: boolean;
  aside?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 px-1 py-[3px] text-left cursor-pointer rounded"
      style={{
        background: on ? `color-mix(in srgb, ${ACCENT} 12%, transparent)` : 'transparent',
        border: 'none',
        color: on ? ACCENT : 'var(--color-text-secondary)',
        fontWeight: on ? 600 : 400,
      }}
    >
      <span className="text-[10.5px] flex-1">{children}</span>
      {aside && (
        <span className="text-[9.5px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
          {aside}
        </span>
      )}
    </button>
  );
}
