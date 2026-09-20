/**
 * The conditions half of the filter: rows, and the brackets around them.
 *
 * ── Why the brackets are drawn as blocks ──
 *
 * The first attempt put an `and`/`or` chip in the gap between two rows. It
 * stored the right thing and it was unreadable: a chip in a gap tells you how
 * two neighbours relate, and leaves you to derive the brackets yourself by
 * reading the whole stack top to bottom. `(1 or 2) and 3` was information you
 * had to reconstruct rather than something you could see.
 *
 * A bracket is a container, so it is drawn as one. Rows that are ORed sit
 * inside a bordered block labelled **any of**; blocks are separated by an
 * **AND** rule. Now the structure is the shape of the panel, and the sentence
 * in the heading is a caption for something already visible rather than the
 * only place it exists.
 *
 * ── The two verbs, and why there are only two ──
 *
 * - **The `AND` rule between two blocks is clickable** — it merges them.
 * - **The `or` tag on a row is clickable** — it splits that row into its own
 *   block.
 *
 * They are exact inverses, which means there is no arrangement you can reach
 * and not get back from, and nothing to learn beyond "click the word between
 * the things you want joined". `+ or` inside a block adds a row already in it,
 * so the common case — "also accept this" — never needs either verb.
 *
 * ── Uniform control heights ──
 *
 * Every control in a row is `CTRL_H` tall and says so explicitly. dui's `xs`
 * input is 20px and a padded `<input>` came out around 25px, so the select sat
 * visibly short against the boxes either side of it. Heights that are *nearly*
 * the same read as a mistake in a way that two obviously different sizes do
 * not.
 */
import { useRef, useState } from 'react';
import { ContextMenuView, SelectInputView } from '@salilvnair/dui';
import { PlusIcon, TrashIcon } from '../../../icons';
import {
  NULLARY, OPERATORS, addCondition, dropCondition, groupRows, setCondition,
  type Condition, type ConditionField, type FilterState, type Operator,
} from '../../../services/history-filter/filter-model';
import { CONDITION_LOOK } from './filter-icons';

/**
 * One height for every control in a row.
 *
 * dui's `sm` input is 24px; the plain inputs are pinned to the same number with
 * `box-sizing: border-box` so padding and borders cannot push them past it.
 */
const CTRL_H = 24;

const NEG_COL = 16;
const OP_COL = 104;
/*
  Wide enough for the `or` tag and the bin together.

  At the bin's own width the two overlapped on any row that could be split, and
  the bin came out clipped. The column is the same width on every row whether
  or not the tag is there, because a trailing column that resized per row would
  move the bin up and down the stack.
*/
const BIN_COL = 40;
const GRID_GAP = 5;
const BLOCK_PAD = 6;

export const FIELD_LABELS: Record<ConditionField, string> = {
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

const OP_OPTIONS = OPERATORS.map(op => ({
  value: op,
  label: OP_LABELS[op],
  color: NULLARY.has(op) ? 'var(--color-text-secondary)' : 'var(--color-filter-op)',
}));

/** The shared look of the boxes in a condition row. */
const BOX: React.CSSProperties = {
  /* Sunk into the menu's ground rather than sitting on the panel's: on
     `--color-elevated` an input painted `--color-surface` reads as a lighter
     patch, which is the opposite of what a field should look like. */
  background: 'color-mix(in srgb, var(--color-surface-bg) 70%, transparent)',
  border: '1px solid var(--color-surface-border)',
  borderRadius: 5,
  fontSize: 11.5,
  fontWeight: 500,
  height: CTRL_H,
  boxSizing: 'border-box',
  padding: '0 7px',
  outline: 'none',
  minWidth: 0,
};

const ROW_GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: `${NEG_COL}px minmax(0, 1fr) ${OP_COL}px minmax(0, 1fr) ${BIN_COL}px`,
  alignItems: 'center',
  gap: GRID_GAP,
};

function placeholderFor(field: ConditionField): string {
  if (field === 'header' || field === 'resheader') return 'header name or *';
  if (field === 'json' || field === 'resjson') return '$.path.to.value';
  if (field === 'authfield') return 'field name or *';
  return 'text';
}

// ── One row ─────────────────────────────────────────────────────────────────

/**
 * One predicate: field, operator, value — coloured as the three things they are.
 *
 * Three grey boxes in a row is a shape you have to read left to right to parse;
 * a blue field, a purple operator and an amber value is one you recognise.
 *
 * The operator is dui's select rather than a bare `<select>`, whose menu is
 * drawn by the platform — platform greys and a platform blue highlight, on a
 * dark panel it knows nothing about.
 */
function ConditionRow({ c, onChange, onRemove, onSplit }: {
  c: Condition;
  onChange: (next: Condition) => void;
  onRemove: () => void;
  /** Present only on a row that is inside a bracket with something above it. */
  onSplit?: () => void;
}) {
  const nullary = NULLARY.has(c.op);
  const keyChoices = c.field === 'script' ? ['any', 'pre', 'post'] : undefined;

  return (
    <div style={{ ...ROW_GRID, padding: '2px 0' }}>
      <div className="flex items-center justify-center" style={{ gap: 2 }}>
        <button
          type="button"
          title={c.negated ? 'Negated — click to match instead of exclude' : 'Click to negate'}
          onClick={() => onChange({ ...c, negated: !c.negated })}
          className="border-none bg-transparent cursor-pointer text-[12px] flex items-center justify-center"
          style={{ color: c.negated ? 'var(--color-error)' : 'var(--color-text-muted)',
                   fontWeight: c.negated ? 700 : 400, height: CTRL_H, width: NEG_COL }}
        >
          ¬
        </button>
      </div>

      {keyChoices ? (
        <SelectInputView
          size="sm"
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
          placeholder={placeholderFor(c.field)}
          spellCheck={false}
          style={{ ...BOX, color: 'var(--color-filter-field)', fontWeight: 600 }}
        />
      )}

      <SelectInputView
        size="sm"
        value={c.op}
        onChange={op => onChange({ ...c, op: op as Operator })}
        options={OP_OPTIONS}
        accentColor="var(--color-filter-op)"
        menuMinWidth={132}
        width="100%"
      />

      {/* A value box on `is present` would be a box that does nothing, so it
          goes away — but its column stays, so the rows keep their alignment. */}
      {nullary ? <span /> : (
        <input
          value={c.value}
          onChange={e => onChange({ ...c, value: e.target.value })}
          placeholder="value"
          spellCheck={false}
          style={{ ...BOX, color: 'var(--color-filter-value)' }}
        />
      )}

      <div className="flex items-center justify-end" style={{ gap: 2 }}>
        {/*
          The `or` tag says why this row is inside the block, and clicking it
          takes it back out. A label rather than an icon because the word is
          already the explanation — an icon here would need a tooltip to say
          what a two-letter word says on its own.
        */}
        {!!onSplit && (
          <button
            type="button"
            onClick={onSplit}
            title="Move this row out into its own group"
            className="cursor-pointer text-[9px] uppercase tracking-wider border-none bg-transparent"
            style={{ color: 'var(--color-accent, var(--color-primary))', fontWeight: 700 }}
          >
            or
          </button>
        )}
        <button type="button" onClick={onRemove} title="Remove this condition"
                className="border-none bg-transparent cursor-pointer flex items-center justify-center"
                style={{ color: 'var(--color-text-muted)', height: CTRL_H, width: 18 }}>
          <TrashIcon size={11} color="currentColor" />
        </button>
      </div>
    </div>
  );
}

// ── Adding one ──────────────────────────────────────────────────────────────

/**
 * The picker.
 *
 * ── Why a menu and not nine buttons ──
 *
 * Nine dashed pills in three wrapped rows was most of the panel, and it grew
 * every time a field was added. Worse, every one of them was the same verb —
 * "add a condition" — spelled nine ways, so the eye had to read all of them to
 * find the one noun it wanted.
 *
 * One button, one menu, the nouns inside it. With a single option there is
 * nothing to pick from, so the button says the noun outright and opens nothing.
 */
function AddCondition({ fields, label, onAdd }: {
  fields: readonly ConditionField[];
  label: string;
  onAdd: (field: ConditionField) => void;
}) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const only = fields.length === 1 ? fields[0] : undefined;
  const look = only ? CONDITION_LOOK[only] : undefined;
  const tone = look?.tone ?? 'var(--color-accent, var(--color-primary))';

  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => (only ? onAdd(only) : setOpen(o => !o))}
        title={only ? `Add condition: ${FIELD_LABELS[only]}` : 'Add a condition'}
        className="flex items-center gap-1 text-[10.5px] px-2 rounded cursor-pointer"
        style={{
          color: tone,
          fontWeight: 600,
          height: CTRL_H,
          border: `1px dashed color-mix(in srgb, ${tone} 45%, transparent)`,
          background: `color-mix(in srgb, ${tone} 8%, transparent)`,
        }}
      >
        <PlusIcon size={9} color="currentColor" />
        {look?.icon}
        {only ? FIELD_LABELS[only] : label}
      </button>

      <ContextMenuView
        open={open}
        anchorEl={anchor.current}
        onClose={() => setOpen(false)}
        width="lg"
        items={fields.map(f => ({
          id: f,
          label: FIELD_LABELS[f],
          icon: CONDITION_LOOK[f].icon,
          iconColor: CONDITION_LOOK[f].tone,
          onClick: () => onAdd(f),
        }))}
      />
    </>
  );
}

// ── The section ─────────────────────────────────────────────────────────────

/**
 * Every bracket this tab can see, as blocks.
 *
 * The brackets come from the whole filter, not from the rows this tab shows —
 * a tab that hides a row must not renumber the ones it does show, or the
 * sentence in the heading would describe a different filter from the one that
 * is running.
 */
export function FilterConditions({ state, onChange, fields, hint, addLabel }: {
  state: FilterState;
  onChange: (next: FilterState) => void;
  /** Which fields this tab offers, and which of them it lists. */
  fields: readonly ConditionField[];
  hint: string;
  addLabel: string;
}) {
  const visible = (c: Condition) => fields.includes(c.field);
  /*
    `groupRows`, not `bracket`: the panel draws what has been built, including
    rows with nothing typed in them yet. `bracket` drops those because they
    match nothing, which is right for the matcher and wrong here — a fresh row
    would be drawn outside any block and so without the block's `+ or` button,
    exactly when you want it.

    Grouping runs over every row so the structure is the real one; the blocks
    are then filtered to what this tab shows, so a bracket whose rows all live
    on another tab simply does not appear here.
  */
  const blocks = groupRows(state.conditions)
    .map(group => group.filter(visible))
    .filter(group => group.length > 0);

  const patch = (next: Condition) => onChange(setCondition(state, next));
  const remove = (id: string) => onChange(dropCondition(state, id));

  /** Add a row already inside this bracket — the common case, and no verb needed. */
  const addToBlock = (after: Condition, field: ConditionField) => {
    const fresh = { ...newRow(field), join: 'or' as const };
    const at = state.conditions.findIndex(c => c.id === after.id);
    const conditions = [...state.conditions];
    conditions.splice(at + 1, 0, fresh);
    onChange({ ...state, conditions });
  };

  const renderRow = (c: Condition, indexInBlock: number) => (
    <ConditionRow
      key={c.id}
      c={c}
      onChange={patch}
      onRemove={() => remove(c.id)}
      onSplit={indexInBlock > 0 ? () => patch({ ...c, join: 'and' }) : undefined}
    />
  );

  const blockStyle = (multi: boolean): React.CSSProperties => ({
    border: multi
      ? '1px solid color-mix(in srgb, var(--color-accent, var(--color-primary)) 30%, transparent)'
      : '1px solid var(--color-surface-border)',
    background: multi
      ? 'color-mix(in srgb, var(--color-accent, var(--color-primary)) 5%, transparent)'
      : 'transparent',
    borderRadius: 6,
    padding: BLOCK_PAD,
  });

  return (
    <div className="flex flex-col" style={{ padding: '2px 10px 0' }}>
      {!blocks.length && (
        <span className="py-1 text-[11px] leading-snug block"
              style={{ color: 'var(--color-text-muted)' }}>
          {hint}
        </span>
      )}

      {blocks.map((group, i) => {
        const multi = group.length > 1;
        return (
          <div key={group[0].id}>
            {/*
              The rule between two blocks, and the verb that merges them. It is
              the exact inverse of the `or` tag on a row, so nothing you can do
              here is one-way.
            */}
            {i > 0 && (
              <button
                type="button"
                onClick={() => patch({ ...group[0], join: 'or' })}
                title="Merge with the group above — either may match"
                className="flex items-center gap-1.5 w-full cursor-pointer border-none bg-transparent"
                style={{ padding: '5px 0' }}
              >
                <span className="text-[9px] uppercase tracking-wider px-1.5 rounded"
                      style={{ color: 'var(--color-text-muted)', fontWeight: 700,
                               border: '1px solid var(--color-surface-border)', lineHeight: '14px' }}>
                  and
                </span>
                <span style={{ flex: 1, height: 1, background: 'var(--color-surface-border)' }} />
              </button>
            )}

            <div style={blockStyle(multi)}>
              {multi && (
                <div className="text-[9px] uppercase tracking-wider pb-0.5"
                     style={{ color: 'var(--color-accent, var(--color-primary))', fontWeight: 700 }}>
                  any of
                </div>
              )}
              {group.map(renderRow)}
              {/*
                Adding into this bracket. Only offered once a bracket exists to
                add to, and it inherits the last row's field, because a second
                clause is nearly always about the same thing as the first.
              */}
              <div className="pt-1" style={{ paddingLeft: NEG_COL + GRID_GAP }}>
                <button
                  type="button"
                  onClick={() => addToBlock(group[group.length - 1], group[group.length - 1].field)}
                  title="Add another row to this group — either may match"
                  className="flex items-center gap-1 text-[9.5px] uppercase tracking-wider px-1.5 rounded cursor-pointer"
                  style={{
                    color: 'var(--color-accent, var(--color-primary))', fontWeight: 700,
                    lineHeight: '16px', background: 'transparent',
                    border: '1px dashed color-mix(in srgb, var(--color-accent, var(--color-primary)) 35%, transparent)',
                  }}
                >
                  <PlusIcon size={8} color="currentColor" />
                  or
                </button>
              </div>
            </div>
          </div>
        );
      })}

      <div className="pt-2">
        <AddCondition
          fields={fields}
          label={addLabel}
          onAdd={field => onChange(addCondition(state, field))}
        />
      </div>
    </div>
  );
}

/* `addCondition` builds the row the store's way; this mirrors it for the one
   case that needs a join set before the row reaches the state. */
function newRow(field: ConditionField): Condition {
  const carrier = addCondition({ terms: [], conditions: [], text: '' }, field);
  return carrier.conditions[0];
}
