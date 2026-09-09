/**
 * Screen 08, with 08A, 08B and 08D in it — the facet panel.
 *
 * Every facet with a live count, every one of them combinable. **The counts are
 * the point**: you can see there are three unassigned PROD issues before you
 * click anything, which is what turns a filter panel into an answer.
 *
 * The two rules everybody gets wrong once and then mistrusts the counts for are
 * printed on the panel rather than assumed — two ticks in one facet means
 * either, two ticks in different facets means both.
 *
 * **A value at zero stays visible, greyed.** It is not that Reporting has no
 * issues, it is that it has none given everything else you have ticked. Hiding
 * it would leave you wondering where it went; showing its unfiltered count
 * would be a lie you could act on.
 *
 * **An excluded value is red, ticked, and still in the list.** It has to stay
 * visible or you cannot untick it, and it has to look different from an
 * included one or the panel is unreadable at a glance. Alt-click excludes
 * directly; `except` on hover does the same for people who do not know that.
 */
import { useMemo, useState } from 'react';
import { AvatarView, BadgeChipView, TogglePillView } from '@salilvnair/dui';
import { CheckIcon, CloseIcon, WarningTriangleIcon } from '../../icons';
import { prettyPhrase, resolveRange, type FilterState } from './filter-model';
import {
  buildActivity, buildFacets, dropField, except, only, setMode, termFor, toggleValue,
  type Facet, type FacetValue, type MatchContext,
} from './filter-model';
import type { BoardIssue, ProposedDimension } from './board-types';
import { ACCENT } from './types';

/** Above this many values a facet gets its own filter box. */
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
  {
    field: 'closed',
    label: 'Closed on',
    unavailable: 'Only open issues are loaded — turn on Closed under State first.',
  },
];

export function GhFilters({ issues, dimensions, state, onChange, ctx }: {
  /** Everything the board holds, before any facet. Counts are taken from here. */
  issues: BoardIssue[];
  dimensions: ProposedDimension[];
  state: FilterState;
  onChange: (next: FilterState) => void;
  ctx: MatchContext;
}) {
  const facets = useMemo(
    () => buildFacets(issues, state, dimensions, ctx),
    [issues, state, dimensions, ctx],
  );
  const activity = useMemo(() => buildActivity(issues, state, ctx), [issues, state, ctx]);

  return (
    <div className="flex flex-col gap-3 overflow-y-auto flex-shrink-0"
         style={{
           width: 208,
           borderRight: '1px solid var(--color-surface-border)',
           padding: '10px 9px 14px',
         }}>

      {/*
        The rule, stated. Everybody gets this wrong at some point and then
        stops trusting the counts, which is a worse outcome than the sentence
        costing four lines of panel.
      */}
      <div className="text-[9px] px-1"
           style={{ color: 'var(--color-text-muted)', lineHeight: 1.55 }}>
        Two ticks in one facet mean <b style={{ color: 'var(--color-text-primary)' }}>either</b>.
        Two facets mean <b style={{ color: 'var(--color-text-primary)' }}>both</b>.
      </div>

      <Section title="Activity" note="no GitHub equivalent">
        {activity.map(a => (
          <ValueRow
            key={a.id}
            label={a.label}
            count={a.count}
            ticked={a.ticked}
            excluded={false}
            disabled={a.unavailable}
            onToggle={() => onChange(a.ticked
              ? dropField(state, a.term.field)
              : { ...state, terms: [...state.terms.filter(t => t.field !== a.term.field), a.term] })}
          />
        ))}
      </Section>

      {facets.map(f => (
        <FacetBlock key={f.field} facet={f} state={state} onChange={onChange} />
      ))}

      <Dates issues={issues} state={state} onChange={onChange} ctx={ctx} />
    </div>
  );
}

// ── One facet ───────────────────────────────────────────────────────────────

function FacetBlock({ facet, state, onChange }: {
  facet: Facet;
  state: FilterState;
  onChange: (next: FilterState) => void;
}) {
  const [filter, setFilter] = useState('');
  const term = termFor(state, facet.field);
  const on = term?.values.length ?? 0;

  const shown = filter
    ? facet.values.filter(v => v.label.toLowerCase().includes(filter.toLowerCase()))
    : facet.values;

  /*
    "All of these" is only meaningful where an issue can hold more than one
    value. On a single-valued field it matches nothing — so it is offered with
    the reason rather than hidden, because somebody looking for it should learn
    why it is not there instead of assuming the panel is incomplete.
  */
  const impossible = facet.multiValued ? undefined
    : `No issue has two ${facet.label.toLowerCase()} values, so “all of these” would match nothing.`;

  return (
    <Section
      title={facet.label}
      note={on > 0 ? `${on} of ${facet.values.length}` : undefined}
      onClear={on > 0 ? () => onChange(dropField(state, facet.field)) : undefined}
    >
      {on > 1 && (
        <div className="flex items-center gap-1 px-1 pb-1">
          <TogglePillView accentColor={ACCENT} active={term?.mode !== 'all'}
                          onClick={() => onChange(setMode(state, facet.field, 'any'))}>
            any of these
          </TogglePillView>
          <TogglePillView accentColor={ACCENT} active={term?.mode === 'all'}
                          title={impossible}
                          onClick={() => onChange(setMode(state, facet.field, 'all'))}>
            all of these
          </TogglePillView>
        </div>
      )}
      {term?.mode === 'all' && impossible && (
        <div className="flex items-start gap-1 px-1 pb-1 text-[9px]"
             style={{ color: 'var(--color-warning)', lineHeight: 1.5 }}>
          <WarningTriangleIcon size={9} style={{ marginTop: 2, flexShrink: 0 }} />
          <span>{impossible}</span>
        </div>
      )}

      {facet.values.length > FILTERABLE_AT && (
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder={`filter this list`}
          className="text-[10px] px-1.5 py-1 mx-1 mb-1 rounded"
          style={{
            background: 'var(--color-panel)',
            border: '1px solid var(--color-surface-border)',
            color: 'var(--color-text-primary)',
            outline: 'none',
          }}
        />
      )}

      {shown.map(v => (
        <ValueRow
          key={v.value}
          label={v.label}
          avatar={facet.field === 'assignee' || facet.field === 'author'}
          count={v.count}
          ticked={v.ticked}
          excluded={v.excluded}
          onToggle={(alt) => onChange(alt
            ? except(state, facet.field, v.value)
            : toggleValue(state, facet.field, v.value))}
          onOnly={() => onChange(only(state, facet.field, v.value))}
          onExcept={() => onChange(except(state, facet.field, v.value))}
        />
      ))}
      {shown.length === 0 && (
        <span className="px-1 text-[9.5px]" style={{ color: 'var(--color-text-muted)' }}>
          {filter
            ? `Nothing in this facet matches “${filter}”.`
            : 'This repository carries no value for this field.'}
        </span>
      )}
    </Section>
  );
}

/**
 * One value.
 *
 * `only` and `except` appear on hover — the two verbs people actually mean, and
 * both are one click where the alternative is untick, untick, untick.
 */
function ValueRow({
  label, count, ticked, excluded, avatar, disabled, onToggle, onOnly, onExcept,
}: {
  label: string;
  count: number;
  ticked: boolean;
  excluded: boolean;
  avatar?: boolean;
  /** A reason this cannot be ticked, shown instead of the count. */
  disabled?: string;
  onToggle: (alt: boolean) => void;
  onOnly?: () => void;
  onExcept?: () => void;
}) {
  const [hover, setHover] = useState(false);
  const tone = excluded ? 'var(--color-error)' : ticked ? ACCENT : 'var(--color-text-secondary)';

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="flex items-center gap-1.5 px-1 py-[2px] rounded"
      style={{
        opacity: disabled ? 0.55 : count === 0 && !ticked && !excluded ? 0.5 : 1,
        background: ticked || excluded
          ? `color-mix(in srgb, ${tone} 12%, transparent)`
          : 'transparent',
      }}
      title={disabled}
    >
      <button
        type="button"
        disabled={!!disabled}
        onClick={e => onToggle(e.altKey)}
        className="flex items-center gap-1.5 flex-1 min-w-0 text-left cursor-pointer"
        style={{ background: 'transparent', border: 'none', padding: 0,
                 cursor: disabled ? 'default' : 'pointer' }}
      >
        <span className="flex items-center justify-center flex-shrink-0"
              style={{
                width: 11, height: 11, borderRadius: 3,
                border: `1px solid ${ticked || excluded ? tone : 'var(--color-surface-border)'}`,
                background: ticked || excluded
                  ? `color-mix(in srgb, ${tone} 30%, transparent)` : 'transparent',
                color: tone,
              }}>
          {excluded ? <CloseIcon size={8} /> : ticked ? <CheckIcon size={8} /> : null}
        </span>
        {avatar && label !== 'Nobody' && <AvatarView name={label} size="xs" />}
        <span className="text-[10.5px] truncate" style={{ color: tone }}>{label}</span>
      </button>

      {/* only · except, on hover — never taking the count's place permanently */}
      {hover && !disabled && onOnly && onExcept ? (
        <span className="flex items-center gap-1 text-[9px]">
          <Mini onClick={onOnly}>only</Mini>
          <span style={{ color: 'var(--color-text-muted)' }}>·</span>
          <Mini onClick={onExcept}>except</Mini>
        </span>
      ) : excluded ? (
        <span className="text-[9px]" style={{ color: 'var(--color-error)' }}>excluded</span>
      ) : (
        <span className="text-[9.5px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
          {disabled ? '—' : count}
        </span>
      )}
    </div>
  );
}

function Mini({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="cursor-pointer"
            style={{ background: 'none', border: 'none', padding: 0, color: ACCENT }}>
      {children}
    </button>
  );
}

// ── 08B — dates, the way people say them ────────────────────────────────────

/**
 * Nobody thinks "created between 2026-08-25 and 2026-09-08". They think *this
 * fortnight*, or *older than a month*.
 *
 * The relative phrase is what gets stored, so a view saved on a Monday still
 * means the last fortnight next Monday — and the resolved range is printed
 * underneath so there is never a question about what it currently covers.
 */
function Dates({ issues, state, onChange, ctx }: {
  issues: BoardIssue[];
  state: FilterState;
  onChange: (next: FilterState) => void;
  ctx: MatchContext;
}) {
  const [field, setField] = useState('created');
  const [exact, setExact] = useState(false);
  const term = termFor(state, field);
  const phrase = term?.values[0];
  const range = phrase ? resolveRange(phrase, ctx.now ?? Date.now()) : undefined;
  const unavailable = DATE_FIELDS.find(d => d.field === field)?.unavailable;

  const set = (value: string | undefined) => onChange(value
    ? { ...state, terms: [...state.terms.filter(t => t.field !== field), { field, values: [value] }] }
    : dropField(state, field));

  const countFor = (p: string) => issues.filter(i => {
    const iso = field === 'created' ? i.createdAt : i.updatedAt;
    const r = resolveRange(p, ctx.now ?? Date.now());
    if (!r || !iso) return false;
    const t = Date.parse(iso);
    return (r.from === undefined || t >= r.from) && (r.to === undefined || t <= r.to);
  }).length;

  return (
    <Section title="Dates" onClear={term ? () => set(undefined) : undefined}>
      <div className="flex flex-wrap gap-1 px-1 pb-1">
        {DATE_FIELDS.map(d => (
          <TogglePillView key={d.field} accentColor={ACCENT} active={field === d.field}
                          title={d.unavailable} onClick={() => setField(d.field)}>
            {d.label}
          </TogglePillView>
        ))}
      </div>

      {unavailable ? (
        <div className="flex items-start gap-1 px-1 text-[9px]"
             style={{ color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          <WarningTriangleIcon size={9} style={{ marginTop: 2, flexShrink: 0,
                                                 color: 'var(--color-warning)' }} />
          <span>{unavailable}</span>
        </div>
      ) : (
        <>
          <div className="flex gap-1 px-1 pb-1">
            <TogglePillView accentColor={ACCENT} active={!exact} onClick={() => setExact(false)}>
              Relative
            </TogglePillView>
            <TogglePillView accentColor={ACCENT} active={exact} onClick={() => setExact(true)}>
              Exact
            </TogglePillView>
          </div>

          {exact ? (
            <div className="flex flex-col gap-1 px-1">
              <label className="flex items-center gap-1.5 text-[10px]"
                     style={{ color: 'var(--color-text-muted)' }}>
                before
                <input
                  type="date"
                  value={phrase?.startsWith('<') ? phrase.slice(1) : ''}
                  onChange={e => set(e.target.value ? `<${e.target.value}` : undefined)}
                  className="text-[10px] px-1 py-0.5 rounded flex-1"
                  style={{ background: 'var(--color-panel)', color: 'var(--color-text-primary)',
                           border: '1px solid var(--color-surface-border)', outline: 'none' }}
                />
              </label>
              <label className="flex items-center gap-1.5 text-[10px]"
                     style={{ color: 'var(--color-text-muted)' }}>
                after
                <input
                  type="date"
                  value={phrase?.startsWith('>') && !phrase.endsWith('d') ? phrase.slice(1) : ''}
                  onChange={e => set(e.target.value ? `>${e.target.value}` : undefined)}
                  className="text-[10px] px-1 py-0.5 rounded flex-1"
                  style={{ background: 'var(--color-panel)', color: 'var(--color-text-primary)',
                           border: '1px solid var(--color-surface-border)', outline: 'none' }}
                />
              </label>
            </div>
          ) : (
            SPANS.map(s => (
              <ValueRow
                key={s.phrase}
                label={s.label}
                count={countFor(s.phrase)}
                ticked={phrase === s.phrase}
                excluded={false}
                onToggle={() => set(phrase === s.phrase ? undefined : s.phrase)}
              />
            ))
          )}

          {range && (
            <div className="px-1 pt-1 text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
              resolves to{' '}
              <span style={{ color: 'var(--color-text-primary)' }}>
                {range.from ? new Date(range.from).toISOString().slice(0, 10) : '…'}
                {' … '}
                {range.to ? new Date(range.to).toISOString().slice(0, 10) : 'now'}
              </span>
              <br />
              <span>the phrase is saved, not the dates — “{prettyPhrase(phrase!)}” still means
                that next month</span>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

// ── Furniture ───────────────────────────────────────────────────────────────

function Section({ title, note, onClear, children }: {
  title: string;
  note?: string;
  onClear?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 px-1 pb-1">
        <span className="text-[9px] font-bold uppercase tracking-[.09em]"
              style={{ color: 'var(--color-text-muted)' }}>
          {title}
        </span>
        {note && <BadgeChipView tone={ACCENT} size="xs">{note}</BadgeChipView>}
        <span className="flex-1" />
        {onClear && (
          <button type="button" onClick={onClear} className="cursor-pointer text-[9px]"
                  style={{ background: 'none', border: 'none', padding: 0, color: ACCENT }}>
            clear
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

export type { FacetValue };
