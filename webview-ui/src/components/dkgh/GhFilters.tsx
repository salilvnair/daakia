/**
 * Screen 08, with 08A, 08B and 08D in it — the facet panel.
 *
 * The markup is the mock's: `.facets` of `.facet`, each a `.fh` heading over
 * `.fct` rows carrying a `.bx`, an optional `.sw` swatch or `.av` avatar, the
 * label, and a `.n` count. `only`/`except` ride in on `.fct.hover .only`, an
 * excluded value takes `.fct.excluded`, the or/and switch is `.andor`, and a
 * long list gets a `.fsearch`.
 *
 * Every facet with a live count, every one combinable. **The counts are the
 * point**: you can see there are three unassigned PROD issues before you click
 * anything, which is what turns a filter panel into an answer.
 *
 * **A value at zero stays visible, greyed.** It is not that Reporting has no
 * issues, it is that it has none given everything else you have ticked. Hiding
 * it would leave you wondering where it went; showing its unfiltered count
 * would be a lie you could act on.
 *
 * **An excluded value is red, ticked, and still in the list.** It has to stay
 * visible or you cannot untick it. Alt-click excludes directly; `except` on
 * hover does the same for people who do not know that.
 */
import { useMemo, useState } from 'react';
import { Ico } from './GhIcons';
import { avClass } from './GhCards';
import { colourOf } from './field-colour';
import {
  buildActivity, buildFacets, dropField, except, only, prettyPhrase, resolveRange,
  setMode, termFor, toggleValue,
  type Facet, type FilterState, type MatchContext,
} from './filter-model';
import { PanelSearch, PanelSection, matches } from './GhPanel';
import type { BoardIssue, ProposedDimension } from './board-types';

/** Above this many values a facet gets its own search box. */
const FILTERABLE_AT = 8;

/** The relative spans people actually say, and what each one means. */
const SPANS = [
  { phrase: 'today', label: 'Today' },
  { phrase: 'week', label: 'This week' },
  { phrase: '14d', label: 'Last 14 days' },
  { phrase: 'sprint', label: 'This sprint' },
  { phrase: '>30d', label: 'Older than 30 days' },
];

/** Date fields the board could carry, and which of them it actually has. */
const DATE_FIELDS = [
  { field: 'created', label: 'Opened' },
  { field: 'updated', label: 'Last updated' },
  {
    field: 'eta',
    label: 'ETA',
    unavailable: 'Start and target dates live on a Project, which dkgh does not read yet.',
  },
];

export function GhFilters({ issues, dimensions, state, onChange, ctx }: {
  /** Everything the board holds. Counts are taken from here. */
  issues: BoardIssue[];
  dimensions: ProposedDimension[];
  state: FilterState;
  onChange: (next: FilterState) => void;
  ctx: MatchContext;
}) {
  const [term, setTerm] = useState('');

  const facets = useMemo(
    () => buildFacets(issues, state, dimensions, ctx),
    [issues, state, dimensions, ctx],
  );
  const activity = useMemo(() => buildActivity(issues, state, ctx), [issues, state, ctx]);
  const declared = useMemo(
    () => new Map(dimensions.map(d => [d.dimension, d.options])),
    [dimensions],
  );

  /*
    The search covers both halves of a row — the section it is in and the value
    itself — so "prod" finds the value and "environment" finds the whole
    section. Matching only one of those makes half the searches somebody tries
    come back empty.
  */
  const shownActivity = activity.filter(a => matches(a.label, term) || matches('activity', term));
  const shownFacets = facets
    .map(f => matches(f.label, term)
      ? f
      : { ...f, values: f.values.filter(v => matches(v.label, term)) })
    .filter(f => f.values.length > 0);
  const showing = shownActivity.length
    + shownFacets.reduce((n, f) => n + f.values.length, 0);

  return (
    <div className="facets">
      <PanelSearch
        value={term}
        onChange={setTerm}
        placeholder="Search filters…"
        count={showing}
      />

      {/*
        The rule, stated. Everybody gets this wrong at some point and then stops
        trusting the counts, which is worse than the sentence costing two lines.
      */}
      <div className="fct" style={{ color: 'var(--dk-faint)', fontSize: 9, lineHeight: 1.5,
                                    display: 'block', paddingBottom: 8 }}>
        Two ticks in one facet mean <b style={{ color: 'var(--dk-text)' }}>either</b>.
        Two facets mean <b style={{ color: 'var(--dk-text)' }}>both</b>.
      </div>

      {shownActivity.length > 0 && (
      <PanelSection title="Activity" note="no github equivalent">
        {shownActivity.map(a => (
          <FctRow
            key={a.id}
            label={a.label}
            count={a.count}
            ticked={a.ticked}
            disabled={a.unavailable}
            onToggle={() => onChange(a.ticked
              ? dropField(state, a.term.field)
              : { ...state, terms: [...state.terms.filter(t => t.field !== a.term.field), a.term] })}
          />
        ))}
      </PanelSection>
      )}

      {shownFacets.map(f => (
        <FacetBlock
          key={f.field}
          facet={f}
          state={state}
          options={declared.get(f.field)}
          onChange={onChange}
        />
      ))}

      {showing === 0 && (
        <div className="fct" style={{ color: 'var(--dk-faint)' }}>
          Nothing here matches “{term.trim()}”.
        </div>
      )}

      <Dates issues={issues} state={state} onChange={onChange} ctx={ctx} />
    </div>
  );
}

// ── One facet ───────────────────────────────────────────────────────────────

function FacetBlock({ facet, state, options, onChange }: {
  facet: Facet;
  state: FilterState;
  options?: string[];
  onChange: (next: FilterState) => void;
}) {
  const [search, setSearch] = useState('');
  const term = termFor(state, facet.field);
  const on = term?.values.length ?? 0;

  const shown = search
    ? facet.values.filter(v => v.label.toLowerCase().includes(search.toLowerCase()))
    : facet.values;

  /*
    "All of these" is only meaningful where an issue can hold more than one
    value. On a single-valued field it matches nothing — so it is offered with
    the reason rather than hidden, because somebody looking for it should learn
    why it is not there instead of assuming the panel is incomplete.
  */
  const impossible = facet.multiValued ? undefined
    : `No issue has two ${facet.label.toLowerCase()} values, so “all of these” matches nothing.`;

  /* A swatch where the value has a colour of its own — the field map's, so the
     panel and the board agree on what PROD looks like. */
  const swatch = facet.kind === 'form';

  return (
    <PanelSection
      title={facet.label}
      note={on > 0 ? `${on} of ${facet.values.length}` : undefined}
      count={facet.values.length}
      onClear={on > 0 ? () => onChange(dropField(state, facet.field)) : undefined}
    >
      {on > 1 && (
        <div className="andor">
          <span className={term?.mode !== 'all' ? 'on' : undefined}
                style={{ cursor: 'pointer' }}
                onClick={() => onChange(setMode(state, facet.field, 'any'))}>
            any of these
          </span>
          <span className={term?.mode === 'all' ? 'on' : undefined}
                title={impossible}
                style={{ cursor: 'pointer' }}
                onClick={() => onChange(setMode(state, facet.field, 'all'))}>
            all of these
          </span>
        </div>
      )}

      {facet.values.length > FILTERABLE_AT && (
        <div className="fsearch">
          <Ico name="search" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="filter this list"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--dk-text)', font: 'inherit',
            }}
          />
        </div>
      )}

      {shown.map(v => (
        <FctRow
          key={v.value}
          label={v.label}
          count={v.count}
          ticked={v.ticked}
          excluded={v.excluded}
          swatch={swatch ? colourOf(v.label, options) : undefined}
          avatar={facet.field === 'assignee' || facet.field === 'author'}
          onToggle={alt => onChange(alt
            ? except(state, facet.field, v.value)
            : toggleValue(state, facet.field, v.value))}
          onOnly={() => onChange(only(state, facet.field, v.value))}
          onExcept={() => onChange(except(state, facet.field, v.value))}
          field={facet.field}
          value={v.value}
        />
      ))}

      {shown.length === 0 && (
        <div className="fct" style={{ color: 'var(--dk-faint)' }}>
          {search ? `Nothing matches “${search}”.` : 'No value for this field here.'}
        </div>
      )}
    </PanelSection>
  );
}

/**
 * One `.fct` row.
 *
 * `only` and `except` appear on hover — the two verbs people actually mean, and
 * both are one click where the alternative is untick, untick, untick.
 */
function FctRow({
  label, count, ticked, excluded, swatch, avatar, disabled, onToggle, onOnly, onExcept,
  field, value,
}: {
  label: string;
  count: number;
  ticked: boolean;
  excluded?: boolean;
  swatch?: string;
  avatar?: boolean;
  /** A reason this cannot be ticked, shown instead of the count. */
  disabled?: string;
  onToggle: (alt: boolean) => void;
  onOnly?: () => void;
  onExcept?: () => void;
  /** Which facet this row belongs to, for the right-click menu. See GhMenu. */
  field?: string;
  value?: string;
}) {
  const [hover, setHover] = useState(false);
  const cls = ['fct', ticked && !excluded ? 'on' : '', excluded ? 'excluded' : '',
    hover ? 'hover' : ''].filter(Boolean).join(' ');

  return (
    <div
      className={cls}
      data-facet={field}
      data-value={value}
      style={{
        width: '100%',
        opacity: disabled ? 0.5 : count === 0 && !ticked && !excluded ? 0.5 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
      title={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={e => { if (!disabled) onToggle(e.altKey); }}
    >
      <span className="bx">{(ticked || excluded) && <Ico name="check" />}</span>
      {swatch && <span className="sw" style={{ background: swatch }} />}
      {avatar && label !== 'Nobody' && (
        <span className={avClass(label)}>{label[0].toUpperCase()}</span>
      )}
      {label}
      {hover && !disabled && onOnly && onExcept ? (
        <span className="only">
          {/*
            Two verbs, and two real buttons. They were spans, so the two words a
            reader is most likely to want on this row were the two with no
            cursor and nothing under the pointer to say they could be pressed.
          */}
          <button type="button" className="v" title={`Only ${label}`}
                  onClick={e => { e.stopPropagation(); onOnly(); }}>only</button>
          <button type="button" className="v" title={`Everything except ${label}`}
                  onClick={e => { e.stopPropagation(); onExcept(); }}>except</button>
        </span>
      ) : excluded ? (
        <span className="n" style={{ color: 'var(--dk-red)' }}>excluded</span>
      ) : (
        <span className="n">{disabled ? '—' : count}</span>
      )}
    </div>
  );
}

// ── 08B — dates, the way people say them ────────────────────────────────────

/**
 * Nobody thinks "created between 2026-08-25 and 2026-09-08". They think *this
 * fortnight*, or *older than a month*.
 *
 * **A relative filter stays relative.** The phrase is what gets stored, so a
 * view saved on a Monday still means the last fortnight next Monday — and the
 * resolved range is printed underneath so there is never a question about what
 * it currently covers.
 */
function Dates({ issues, state, onChange, ctx }: {
  issues: BoardIssue[];
  state: FilterState;
  onChange: (next: FilterState) => void;
  ctx: MatchContext;
}) {
  const [field, setField] = useState('created');
  const term = termFor(state, field);
  const phrase = term?.values[0];
  const now = ctx.now ?? Date.now();
  const range = phrase ? resolveRange(phrase, now) : undefined;
  const unavailable = DATE_FIELDS.find(d => d.field === field)?.unavailable;

  const set = (value: string | undefined) => onChange(value
    ? { ...state, terms: [...state.terms.filter(t => t.field !== field), { field, values: [value] }] }
    : dropField(state, field));

  const countFor = (p: string) => issues.filter(i => {
    const iso = field === 'created' ? i.createdAt : i.updatedAt;
    const r = resolveRange(p, now);
    if (!r || !iso) return false;
    const t = Date.parse(iso);
    return (r.from === undefined || t >= r.from) && (r.to === undefined || t <= r.to);
  }).length;

  return (
    <PanelSection title="Dates" onClear={term ? () => set(undefined) : undefined}>
      <div className="andor">
        {DATE_FIELDS.map(d => (
          <span key={d.field} className={field === d.field ? 'on' : undefined}
                title={d.unavailable} style={{ cursor: 'pointer' }}
                onClick={() => setField(d.field)}>
            {d.label}
          </span>
        ))}
      </div>

      {unavailable ? (
        <div className="fct" style={{ color: 'var(--dk-amber)', display: 'block',
                                      lineHeight: 1.5, fontSize: 9.5 }}>
          {unavailable}
        </div>
      ) : (
        <>
          {SPANS.map(s => (
            <FctRow
              key={s.phrase}
              label={s.label}
              count={countFor(s.phrase)}
              ticked={phrase === s.phrase}
              onToggle={() => set(phrase === s.phrase ? undefined : s.phrase)}
            />
          ))}
          {range && (
            <div className="fct" style={{ display: 'block', fontSize: 9, lineHeight: 1.5,
                                          color: 'var(--dk-faint)' }}>
              resolves to{' '}
              <span style={{ color: 'var(--dk-text)' }}>
                {range.from ? new Date(range.from).toISOString().slice(0, 10) : '…'}
                {' … '}
                {range.to ? new Date(range.to).toISOString().slice(0, 10) : 'now'}
              </span>
              <br />
              the phrase is saved, not the dates — “{prettyPhrase(phrase!)}” still means that
              next month
            </div>
          )}
        </>
      )}
    </PanelSection>
  );
}
