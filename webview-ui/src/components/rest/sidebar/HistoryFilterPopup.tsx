/**
 * The history filter, as a panel you can see all of at once.
 *
 * ── Why a popup with tabs ──
 *
 * The questions people bring to history are not one kind. "Show me the POSTs
 * that failed this week" is facets — a list of values with counts, ticked.
 * "Show me the ones whose Authorization header carried a Bearer token" is a
 * predicate, because a header name is not a list you can offer. Facets on one
 * screen and predicates on another would be two features; both in one panel,
 * split by *where in the request you are looking*, is one.
 *
 * So the tabs are Request, Headers, Body, Auth and Scripts — the same divisions
 * the request editor already uses, because that is where somebody already knows
 * these things live.
 *
 * ── Why one component, mounted twice ──
 *
 * The sidebar opens it from the filter icon; the History tab docks it in a
 * rail. Two components would drift, and a filter that behaves differently
 * depending on where you opened it is worse than one that only exists in one
 * place. `docked` is the only difference: the popup portals itself against a
 * trigger, the rail is laid into its parent.
 *
 * ── Why a condition row does not filter until it is finished ──
 *
 * Typing `authorization` into the field box, with nothing in the value box yet,
 * is not the filter "header authorization contains nothing" — it is somebody
 * halfway through. `isUsable` decides, and until it says yes the row is drawn
 * but not applied. Without that the list empties under your hands between the
 * two keystrokes that would have made it meaningful.
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { IconSize, SelectInputView } from '@salilvnair/dui';
import {
  CheckIcon, CloseIcon, CopyIcon, FilterIcon, FilterOffIcon, PlusIcon, SparkleIcon, TrashIcon,
} from '../../../icons';
import {
  ICON_SLOT, MENU_HINT, MENU_ROW, MENU_SURFACE, MenuSeparator, SectionHeading,
} from './filter-chrome';
import {
  AREA_ICONS, AREA_TONES, CONDITION_LOOK, FACET_ICONS, lookOf,
} from './filter-icons';
import { isAiStageEnabled } from '../../../store/ai-features-store';
import {
  askForFilter, describeResult, readFilterAnswer,
} from '../../../services/history-filter/ai-suggest';
import {
  HAS_LABELS, HAS_VALUES, OPERATORS, NULLARY, STATUS_VALUES, WHEN_VALUES,
  activeCount, addCondition, describeBrackets, dropCondition, except, formatQuery,
  isEmpty, isUsable, only, prettyPhrase, setCondition, toggleValue,
  type Condition, type ConditionField, type FilterState, type Operator, type TermField,
} from '../../../services/history-filter/filter-model';
import { buildFacet, type MatchContext } from '../../../services/history-filter/matcher';
import type { HistoryRowLike } from '../../../services/history-filter/history-facts';

const WIDTH = 392;
const MAX_H = 620;
const MARGIN = 8;

type TabId = 'request' | 'headers' | 'body' | 'auth' | 'scripts';

const TABS: { id: TabId; label: string }[] = [
  { id: 'request', label: 'Request' },
  { id: 'headers', label: 'Headers' },
  { id: 'body', label: 'Body' },
  { id: 'auth', label: 'Auth' },
  { id: 'scripts', label: 'Scripts' },
];

/**
 * Which condition fields each tab offers, in the order they are added.
 *
 * ── Why Request offers all of them ──
 *
 * The other four tabs are *places* — headers, body, auth, scripts — and each
 * shows the conditions that live there. Request is not a fifth place, it is the
 * whole request, so restricting it to `url` made the one tab you land on the
 * only one that could not ask most of the questions. It now offers every field
 * and lists every condition, whichever tab it was added from.
 *
 * The badge is still counted per owning tab, so a header condition lights
 * `Headers` and not both — a filter counted twice reads as two filters.
 */
const ALL_FIELDS: ConditionField[] =
  ['url', 'header', 'body', 'json', 'authfield', 'script', 'resheader', 'resbody', 'resjson'];

const TAB_FIELDS: Record<TabId, ConditionField[]> = {
  request: ALL_FIELDS,
  headers: ['header', 'resheader'],
  body: ['body', 'json', 'resbody', 'resjson'],
  auth: ['authfield'],
  scripts: ['script'],
};

/** What each tab counts on its badge — Request owns only the fields no one else does. */
const TAB_OWNS: Record<TabId, ConditionField[]> = {
  request: ['url'],
  headers: ['header', 'resheader'],
  body: ['body', 'json', 'resbody', 'resjson'],
  auth: ['authfield'],
  scripts: ['script'],
};

const FIELD_LABELS: Record<ConditionField, string> = {
  url: 'URL',
  header: 'Request header',
  resheader: 'Response header',
  body: 'Request body',
  json: 'Request JSONPath',
  resbody: 'Response body',
  resjson: 'Response JSONPath',
  script: 'Script',
  authfield: 'Auth field',
};

const OP_LABELS: Record<Operator, string> = {
  present: 'is present',
  absent: 'is absent',
  equals: 'equals',
  contains: 'contains',
  starts: 'starts with',
  regex: 'matches /re/',
};

/**
 * Facets each tab shows, and the values each offers where they are fixed.
 *
 * `icon` overrides the field's own mark, because three different sections are
 * all built on the `has` field — "Has a body", "Secrets", "Scripts" — and
 * inheriting one mark would have put a pair of braces above the secrets. The
 * heading names a section, so it wears the section's icon.
 */
const TAB_FACETS: Record<TabId, {
  field: TermField; label: string; fixed?: readonly string[]; icon?: React.ReactNode;
}[]> = {
  request: [
    { field: 'method', label: 'Method' },
    { field: 'status', label: 'Status', fixed: STATUS_VALUES },
    { field: 'saved', label: 'In a collection', fixed: ['yes', 'no'] },
    { field: 'when', label: 'Sent', fixed: WHEN_VALUES },
    { field: 'protocol', label: 'Protocol' },
  ],
  headers: [],
  body: [{ field: 'has', label: 'Has', fixed: ['body', 'json'] }],
  auth: [
    { field: 'auth', label: 'Auth type' },
    { field: 'has', label: 'Secrets', fixed: ['secret'], icon: AREA_ICONS.auth },
  ],
  scripts: [{
    field: 'has', label: 'Scripts',
    fixed: ['prescript', 'postscript', 'script'], icon: AREA_ICONS.scripts,
  }],
};

function valueLabel(field: TermField, value: string): string {
  if (field === 'has') return HAS_LABELS[value] ?? value;
  if (field === 'when') return prettyPhrase(value);
  if (field === 'saved') return value === 'yes' ? 'Already saved' : 'Never saved';
  if (field === 'status') return value === 'error' ? 'No response' : value.toUpperCase();
  if (field === 'method') return value.toUpperCase();
  if (value === 'none') return 'None';
  return value;
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/**
 * One facet value, drawn as a menu item.
 *
 * The icon column carries the value's own mark in the value's own colour — a
 * green tick for 2xx, the GET green, the GraphQL pink — so the list is
 * scannable without reading it. When the value is ticked the mark is replaced
 * by a check, because two marks on one row is one more than a row can carry
 * and the tick is the one that has changed.
 *
 * `only` and `except` ride in on hover: the everyday interaction is a tick, and
 * two extra verbs drawn on every row would be noise on all of them. Alt-click
 * excludes too, for people who have learnt that.
 */
function FacetRow({ field, value, label, count, ticked, excluded, onToggle, onOnly, onExcept }: {
  field: TermField; value: string;
  label: string; count: number; ticked: boolean; excluded: boolean;
  onToggle: () => void; onOnly: () => void; onExcept: () => void;
}) {
  const [hover, setHover] = useState(false);
  const look = lookOf(field, value);
  const tone = excluded ? 'var(--color-error)'
    : ticked ? 'var(--color-accent, var(--color-primary))'
    : look.tone;
  return (
    <div
      className="dui_ctx-menu__item"
      style={{
        ...MENU_ROW,
        color: tone,
        fontWeight: ticked || excluded ? 700 : 500,
        /* A value at zero stays in the list and stays readable — hiding it
           would leave you wondering where POST went. */
        opacity: count === 0 && !ticked && !excluded ? 0.45 : 1,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={e => (e.altKey ? onExcept() : onToggle())}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
    >
      <span style={{ ...ICON_SLOT, color: tone }}>
        {ticked || excluded ? <CheckIcon size={12} color="currentColor" /> : look.icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {hover ? (
        <span className="flex items-center gap-1.5 shrink-0 text-[10px]">
          <button type="button" className="border-none bg-transparent cursor-pointer p-0"
                  style={{ color: 'var(--color-text-muted)' }}
                  title="Only this value"
                  onClick={e => { e.stopPropagation(); onOnly(); }}>only</button>
          <button type="button" className="border-none bg-transparent cursor-pointer p-0"
                  style={{ color: 'var(--color-error)' }}
                  title="Everything except this value"
                  onClick={e => { e.stopPropagation(); onExcept(); }}>except</button>
        </span>
      ) : (
        <span style={MENU_HINT}>{count}</span>
      )}
    </div>
  );
}

/*
  The condition grid, in one place.

  The add-a-condition buttons below the rows are indented by exactly
  `NEG_COL + GRID_GAP`, so they start where the field boxes start rather than
  under the negation column — which is what made them look dropped in from
  somewhere else.
*/
const NEG_COL = 16;
const OP_COL = 104;
const BIN_COL = 20;
const GRID_GAP = 5;
const SIDE_PAD = 10;
const FIELD_INDENT = NEG_COL + GRID_GAP;

/** The shared look of the three boxes in a condition row. */
const BOX: React.CSSProperties = {
  /* Sunk into the menu's ground rather than sitting on the panel's: on
     `--color-elevated` an input painted `--color-surface` reads as a lighter
     patch, which is the opposite of what a field should look like. */
  background: 'color-mix(in srgb, var(--color-surface-bg) 70%, transparent)',
  border: '1px solid var(--color-surface-border)',
  borderRadius: 5,
  fontSize: 11.5,
  fontWeight: 500,
  padding: '4px 7px',
  outline: 'none',
  minWidth: 0,
};

/**
 * The `and` / `or` between two rows.
 *
 * ── Why a control in the gap rather than a "group" button ──
 *
 * What somebody wants is `(1 or 2) and 3`, and the shortest way to say that is
 * to point at the gap between 1 and 2 and call it `or`. Grouping tools that ask
 * you to select rows and press "group" make you hold the bracket structure in
 * your head first; this way the structure is whatever the gaps say, and there
 * is no state in which the brackets are wrong.
 *
 * `or` is the loud one: it takes the accent and a filled ground, because it is
 * the choice that changes the meaning away from the default everything else on
 * this panel uses.
 */
function JoinToggle({ join, onChange }: {
  join: 'and' | 'or';
  onChange: (next: 'and' | 'or') => void;
}) {
  const or = join === 'or';
  const tone = or ? 'var(--color-accent, var(--color-primary))' : 'var(--color-text-muted)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: GRID_GAP,
                  padding: `1px ${SIDE_PAD}px`, marginLeft: FIELD_INDENT }}>
      <button
        type="button"
        onClick={() => onChange(or ? 'and' : 'or')}
        title={or
          ? 'These two are ORed — click to require both instead'
          : 'These two are ANDed — click to accept either instead'}
        className="cursor-pointer text-[9.5px] uppercase tracking-wider px-1.5 rounded"
        style={{
          color: tone,
          fontWeight: 700,
          lineHeight: '15px',
          border: `1px solid color-mix(in srgb, ${tone} ${or ? 45 : 22}%, transparent)`,
          background: or ? `color-mix(in srgb, ${tone} 14%, transparent)` : 'transparent',
        }}
      >
        {join}
      </button>
      <span style={{ flex: 1, height: 1,
                     background: or
                       ? `color-mix(in srgb, ${tone} 28%, transparent)`
                       : 'var(--color-surface-border)' }} />
    </div>
  );
}

/**
 * The columns every condition row shares.
 *
 * A grid rather than a flex row, because the rows have to line up with each
 * other *and* with the buttons underneath them: with flex, a row whose operator
 * is `is present` loses its value box and the three that remain redistribute,
 * so no two rows agreed on where a column started. The value cell now stays
 * empty instead, which is what keeps the stack readable.
 */
const ROW_GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: `${NEG_COL}px minmax(0, 1fr) ${OP_COL}px minmax(0, 1fr) ${BIN_COL}px`,
  alignItems: 'center',
  gap: GRID_GAP,
};

/** The operators, as a dui menu: each with its own mark and its own colour. */
const OP_OPTIONS = OPERATORS.map(op => ({
  value: op,
  label: OP_LABELS[op],
  color: NULLARY.has(op) ? 'var(--color-text-secondary)' : 'var(--color-filter-op)',
}));

/**
 * One predicate: field, operator, value — coloured as the three things they are.
 *
 * The colours are not decoration. Three grey boxes in a row is a shape you have
 * to read left to right to parse; a blue field, a purple operator and an amber
 * value is one you recognise, which is the difference between a filter panel
 * people use and one they open once.
 *
 * The operator is dui's own select rather than a bare `<select>`: the browser's
 * dropdown is drawn by the platform, so it arrives in the platform's greys with
 * the platform's blue highlight, sitting on a dark panel it knows nothing
 * about. dui's is the same menu as everything else in this popup.
 */
function ConditionRow({ c, onChange, onRemove, keyPlaceholder, keyChoices }: {
  c: Condition;
  onChange: (next: Condition) => void;
  onRemove: () => void;
  keyPlaceholder: string;
  keyChoices?: readonly string[];
}) {
  const nullary = NULLARY.has(c.op);
  return (
    <div style={{ ...ROW_GRID, padding: `2px ${SIDE_PAD}px` }}>
      <button
        type="button"
        title={c.negated ? 'Negated — click to match instead of exclude' : 'Click to negate'}
        onClick={() => onChange({ ...c, negated: !c.negated })}
        className="border-none bg-transparent cursor-pointer text-[12px] flex items-center justify-center"
        style={{ color: c.negated ? 'var(--color-error)' : 'var(--color-text-muted)',
                 fontWeight: c.negated ? 700 : 400, height: 24 }}
      >
        ¬
      </button>

      {keyChoices ? (
        <SelectInputView
          size="xs"
          value={c.key}
          onChange={key => onChange({ ...c, key })}
          options={keyChoices.map(k => ({ value: k, label: k, color: 'var(--color-filter-field)' }))}
          accentColor="var(--color-filter-field)"
          width="100%"
        />
      ) : (
        <input
          value={c.key}
          onChange={e => onChange({ ...c, key: e.target.value })}
          placeholder={keyPlaceholder}
          spellCheck={false}
          style={{ ...BOX, color: 'var(--color-filter-field)', fontWeight: 600 }}
        />
      )}

      <SelectInputView
        size="xs"
        value={c.op}
        onChange={op => onChange({ ...c, op: op as Operator })}
        options={OP_OPTIONS}
        accentColor="var(--color-filter-op)"
        menuMinWidth={132}
        width="100%"
      />

      {/* A value box on `is present` would be a box that does nothing, so it
          goes away — but its column stays, so the rows above and below keep
          their alignment. */}
      {nullary ? <span /> : (
        <input
          value={c.value}
          onChange={e => onChange({ ...c, value: e.target.value })}
          placeholder="value"
          spellCheck={false}
          style={{ ...BOX, color: 'var(--color-filter-value)' }}
        />
      )}

      <button type="button" onClick={onRemove} title="Remove this condition"
              className="border-none bg-transparent cursor-pointer flex items-center justify-center"
              style={{ color: 'var(--color-text-muted)', height: 24 }}>
        <TrashIcon size={11} color="currentColor" />
      </button>
    </div>
  );
}

// ── The panel ───────────────────────────────────────────────────────────────

export interface HistoryFilterProps {
  /** Everything history holds, before this filter. Counts come from here. */
  rows: readonly HistoryRowLike[];
  state: FilterState;
  onChange: (next: FilterState) => void;
  ctx: MatchContext;
  /** How many rows survive, for the footer. */
  matched: number;
}

/**
 * Ask for a filter in words, and get one you can then edit.
 *
 * ── Why the answer lands in the panel rather than being applied ──
 *
 * The model writes a query; the query goes through the same parser a pasted one
 * does, and the panel says what it understood. A filter applied silently from a
 * sentence is a list you cannot explain — and the moment it is wrong once,
 * nobody trusts the panel again. This way the facets tick, the chips appear,
 * and everything is where it would have been had you clicked it.
 */
function AskBox({ rows, onChange }: {
  rows: readonly HistoryRowLike[];
  onChange: (next: FilterState) => void;
}) {
  const [question, setQuestion] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [said, setSaid] = useState('');

  useEffect(() => {
    if (!pending) return;
    const onMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.tabId !== pending) return;
      if (msg.type === 'ai:chunk') setAnswer(a => a + (msg.content ?? ''));
      if (msg.type === 'ai:complete' || msg.type === 'ai:error') {
        setPending(null);
        if (msg.type === 'ai:error') { setSaid(String(msg.message ?? 'That did not work.')); return; }
        const parsed = readFilterAnswer(msg.content ?? answer);
        setSaid(describeResult(parsed));
        /* The text the model could not place is kept: it is a search, which is
           a reasonable reading of a sentence, and it is visible in the box. */
        onChange(parsed.state);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [pending, answer, onChange]);

  const ask = () => {
    if (!question.trim() || pending) return;
    setAnswer('');
    setSaid('');
    setPending(askForFilter({ question: question.trim(), rows }));
  };

  return (
    <div className="flex flex-col gap-1 px-2 pb-1">
      <div className="flex items-center gap-1">
        <input
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') ask(); }}
          placeholder="Describe it: failing posts this week I never saved"
          spellCheck={false}
          style={{ ...BOX, flex: 1, color: 'var(--color-text-primary)' }}
        />
        <button
          type="button" onClick={ask} disabled={!question.trim() || !!pending}
          title="Turn this into a filter"
          className="flex items-center gap-1 text-[10px] px-1.5 py-1 rounded cursor-pointer shrink-0"
          style={{ background: 'transparent', color: 'var(--color-protocol-ai)',
                   border: '1px solid color-mix(in srgb, var(--color-protocol-ai) 35%, transparent)',
                   opacity: question.trim() && !pending ? 1 : 0.5 }}
        >
          <SparkleIcon size={10} color="currentColor" />
          {pending ? 'Reading…' : 'Filter'}
        </button>
      </div>
      {!!said && (
        <span className="text-[9.5px] font-mono leading-snug" style={{ color: 'var(--color-text-muted)' }}>
          {said}
        </span>
      )}
    </div>
  );
}

export function HistoryFilterBody({ rows, state, onChange, ctx, matched }: HistoryFilterProps) {
  const [tab, setTab] = useState<TabId>('request');
  const [copied, setCopied] = useState(false);

  const facets = useMemo(
    () => TAB_FACETS[tab].map(f => ({
      ...buildFacet(rows, state, f.field, f.label, f.fixed, v => valueLabel(f.field, v), ctx),
      icon: f.icon,
    })),
    [rows, state, tab, ctx],
  );

  const fields = TAB_FIELDS[tab];
  const shown = state.conditions.filter(c => fields.includes(c.field));
  /* The bracket sentence is about every row, not the ones this tab shows, so a
     tab that hides one does not misreport what the filter means. */
  const brackets = describeBrackets(state.conditions);
  const query = formatQuery(state);

  const copy = () => {
    navigator.clipboard?.writeText(query).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }).catch(() => { /* a clipboard the host refused is not worth an error */ });
  };

  return (
    <>
      <div className="flex shrink-0" style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        {TABS.map(t => {
          const on = t.id === tab;
          /* A tab with something switched on inside it says so, because the
             one thing a tabbed filter must never do is hide a filter that is
             running. */
          const live = state.conditions.filter(c =>
            TAB_OWNS[t.id].includes(c.field) && isUsable(c)).length
            + state.terms.filter(term =>
              TAB_FACETS[t.id].some(f => f.field === term.field)).length;
          /* The mark keeps its own colour on the selected tab and goes muted
             on the others, so the strip reads as five places rather than five
             words — and the selected one is obvious without relying on the
             underline alone. */
          const tone = AREA_TONES[t.id];
          return (
            <button
              key={t.id} type="button" onClick={() => setTab(t.id)}
              title={t.label}
              className="flex-1 flex items-center justify-center gap-1 text-[10.5px] py-2 cursor-pointer border-none bg-transparent"
              style={{
                color: on ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                fontWeight: on ? 600 : 500,
                background: on ? `color-mix(in srgb, ${tone} 9%, transparent)` : 'transparent',
                borderBottom: on ? `2px solid ${tone}` : '2px solid transparent',
              }}
            >
              <span style={{ ...ICON_SLOT, color: on ? tone : 'var(--color-text-muted)' }}>
                {AREA_ICONS[t.id]}
              </span>
              {t.label}
              {!!live && (
                <span className="tabular-nums px-1 rounded text-[9px]"
                      style={{ color: tone,
                               background: `color-mix(in srgb, ${tone} 18%, transparent)` }}>
                  {live}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto py-2 flex flex-col gap-2.5">
        {/* Only where the feature is switched on: a control whose only job is
            to report that a feature is off should not be drawn. */}
        {tab === 'request' && isAiStageEnabled('history.filter.parse') && (
          <AskBox rows={rows} onChange={onChange} />
        )}

        {tab === 'request' && (
          <div className="mx-2 px-2 py-1.5 rounded text-[9.5px] leading-relaxed"
               style={{ color: 'var(--color-text-muted)',
                        background: 'color-mix(in srgb, var(--color-info) 7%, transparent)',
                        border: '1px solid color-mix(in srgb, var(--color-info) 18%, transparent)' }}>
            Two ticks in one list mean <b style={{ color: 'var(--color-info)' }}>either</b>.
            Two lists mean <b style={{ color: 'var(--color-info)' }}>both</b>.
          </div>
        )}

        {facets.map((facet, i) => (
          <section key={`${facet.field}-${facet.label}`} className="flex flex-col">
            {i > 0 && <MenuSeparator />}
            <SectionHeading icon={facet.icon ?? FACET_ICONS[facet.field]} label={facet.label} />
            {facet.values.map(v => (
              <FacetRow
                key={v.value}
                field={facet.field}
                value={v.value}
                label={v.label}
                count={v.count}
                ticked={v.ticked}
                excluded={v.excluded}
                onToggle={() => onChange(toggleValue(state, facet.field, v.value))}
                onOnly={() => onChange(only(state, facet.field, v.value))}
                onExcept={() => onChange(except(state, facet.field, v.value))}
              />
            ))}
            {!facet.values.length && (
              <span className="px-2.5 py-1 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                Nothing in history has one yet.
              </span>
            )}
          </section>
        ))}

        <section className="flex flex-col">
          {!!facets.length && <MenuSeparator />}
          <SectionHeading
            icon={AREA_ICONS[tab]}
            label="Conditions"
            right={!!brackets && brackets !== '1' && (
              /* The sentence the rows add up to. Worth its line the moment
                 there is more than one bracket, because that is the point at
                 which the stack stops reading as a plain list. */
              <span className="font-mono normal-case tracking-normal text-[9.5px]"
                    style={{ color: 'var(--color-filter-op)' }}>
                {brackets}
              </span>
            )}
          />
          {shown.map((c, i) => (
            <div key={c.id}>
              {/* The first row has no gap above it, so it has no join. */}
              {i > 0 && (
                <JoinToggle
                  join={c.join === 'or' ? 'or' : 'and'}
                  onChange={join => onChange(setCondition(state, { ...c, join }))}
                />
              )}
              <ConditionRow
                c={c}
                onChange={next => onChange(setCondition(state, next))}
                onRemove={() => onChange(dropCondition(state, c.id))}
                keyPlaceholder={placeholderFor(c.field)}
                keyChoices={c.field === 'script' ? ['any', 'pre', 'post'] : undefined}
              />
            </div>
          ))}
          {!shown.length && (
            <span className="py-1 text-[11px] leading-snug block"
                  style={{ color: 'var(--color-text-muted)',
                           paddingLeft: SIDE_PAD + FIELD_INDENT, paddingRight: SIDE_PAD }}>
              {HINTS[tab]}
            </span>
          )}
          <div className="flex flex-wrap gap-1 pt-1.5"
               style={{ paddingLeft: SIDE_PAD + FIELD_INDENT, paddingRight: SIDE_PAD }}>
            {fields.map(f => {
              const look = CONDITION_LOOK[f];
              return (
                <button
                  key={f} type="button"
                  onClick={() => onChange(addCondition(state, f))}
                  /* Not "Add a ${label} condition": lower-casing the labels
                     produced "a url" and "a auth field". Naming the thing
                     after a colon sidesteps articles entirely. */
                  title={`Add condition: ${FIELD_LABELS[f]}`}
                  className="flex items-center gap-1 text-[10.5px] px-1.5 py-1 rounded cursor-pointer"
                  style={{
                    color: look.tone,
                    fontWeight: 500,
                    border: `1px dashed color-mix(in srgb, ${look.tone} 40%, transparent)`,
                    background: `color-mix(in srgb, ${look.tone} 8%, transparent)`,
                  }}
                >
                  <PlusIcon size={9} color="currentColor" />
                  {look.icon}
                  {FIELD_LABELS[f]}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/*
        The query line: what the clicking produced, for pasting somewhere.

        Sunk a shade below the menu's ground so it reads as the panel's base
        rather than as another row — and the count is the one number on this
        panel worth colouring, because "0 of 2,000" is the answer people most
        need to notice.
      */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 shrink-0"
           style={{
             borderTop: '1px solid var(--color-surface-border)',
             background: 'color-mix(in srgb, var(--color-surface-bg) 45%, transparent)',
           }}>
        <span className="flex-1 truncate font-mono text-[10px]"
              style={{ color: query ? 'var(--color-filter-op)' : 'var(--color-text-muted)' }}
              title={query}>
          {query || 'no filter'}
        </span>
        <span className="text-[10px] tabular-nums shrink-0 font-semibold"
              style={{
                color: matched === 0 && !!query ? 'var(--color-warning)'
                  : query ? 'var(--color-success)'
                  : 'var(--color-text-muted)',
              }}>
          {matched} of {rows.length}
        </span>
        {!!query && (
          <button type="button" onClick={copy} title="Copy this filter"
                  className="border-none bg-transparent cursor-pointer p-0.5 flex shrink-0"
                  style={{ color: copied ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
            <CopyIcon size={11} color="currentColor" />
          </button>
        )}
      </div>
    </>
  );
}

const HINTS: Record<TabId, string> = {
  request: 'Add a URL condition to match part of an address.',
  headers: 'Ask whether a header was sent, or what it carried.',
  body: 'Search the text, or pick a value out with a JSONPath.',
  auth: 'Look inside the auth fields — a token prefix, an empty secret.',
  scripts: 'Find the requests whose scripts call something in particular.',
};

function placeholderFor(field: ConditionField): string {
  if (field === 'header' || field === 'resheader') return 'header name or *';
  if (field === 'json' || field === 'resjson') return '$.path.to.value';
  if (field === 'authfield') return 'field name or *';
  return 'text';
}

/**
 * The popup form: portalled, glued to its trigger, and closed by anything else.
 *
 * Portalled because the sidebar has its own `overflow`, and an absolutely
 * positioned child of it is in the DOM, the right size, and clipped.
 */
export function HistoryFilterPopup({
  anchorRef, onClose, ...props
}: HistoryFilterProps & { anchorRef: RefObject<HTMLElement | null>; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ top: number; left: number; maxHeight: number }>();

  useEffect(() => {
    const place = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - MARGIN - 6;
      const above = r.top - MARGIN - 6;
      const down = below >= Math.min(MAX_H, above);
      const maxHeight = Math.max(200, Math.min(MAX_H, down ? below : above));
      setAt({
        top: down ? r.bottom + 6 : Math.max(MARGIN, r.top - 6 - maxHeight),
        left: Math.max(MARGIN, Math.min(r.left, window.innerWidth - WIDTH - MARGIN)),
        maxHeight,
      });
    };
    place();
    window.addEventListener('scroll', place, { passive: true, capture: true });
    window.addEventListener('resize', place, { passive: true });
    return () => {
      window.removeEventListener('scroll', place, { capture: true });
      window.removeEventListener('resize', place);
    };
  }, [anchorRef]);

  /* The trigger counts as inside: it has its own toggle, and letting this see
     that click as an outside one makes the two fight on the same press. */
  useEffect(() => {
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', key);
    };
  }, [onClose, anchorRef]);

  if (!at) return null;

  return createPortal(
    <div
      ref={box}
      className="overflow-hidden flex flex-col"
      style={{
        ...MENU_SURFACE,
        position: 'fixed', top: at.top, left: at.left,
        width: WIDTH, maxHeight: at.maxHeight,
        /* dui's menus sit at 99998; this has to clear whatever the sidebar
           stacks, but must still go under a menu opened from inside it. */
        zIndex: 99990,
      }}
    >
      <div className="flex items-center gap-2 px-2.5 py-2 shrink-0"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <span style={{ ...ICON_SLOT, color: 'var(--color-accent, var(--color-primary))' }}>
          <FilterIcon size={12} color="currentColor" />
        </span>
        <span className="text-[12px] flex-1"
              style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
          Filter history
        </span>
        {/* Only offered when there is something to clear — a permanent Clear on
            an untouched filter reads as a thing you have forgotten to do. */}
        {!isEmpty(props.state) && (
          <button type="button" onClick={() => props.onChange({ terms: [], conditions: [], text: props.state.text })}
                  title="Remove every condition"
                  className="flex items-center gap-1 text-[10.5px] cursor-pointer border-none bg-transparent px-1"
                  style={{ color: 'var(--color-error)' }}>
            <FilterOffIcon size={11} color="currentColor" />
            Clear
          </button>
        )}
        <button type="button" onClick={onClose} title="Close"
                className="dk-close-btn p-0.5 rounded cursor-pointer border-none bg-transparent flex">
          <CloseIcon size={IconSize.inline} color="currentColor" />
        </button>
      </div>

      <HistoryFilterBody {...props} />
    </div>,
    document.body,
  );
}

export { activeCount };
