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
 * ── Two levels, and the operator lives on the box ──
 *
 * A box has one operator and it applies to every row in it: **ANY OF** means
 * any row may match, **ALL OF** means all must. The chips between the rows and
 * the heading above them are the same control said twice — both flip the box —
 * because the operator belongs to the box rather than to a particular gap.
 *
 * Between boxes there is one more operator, `groupOp`, and the chip between any
 * two boxes flips it. That is why every between-box chip reads the same word:
 * there is only one of them.
 *
 * An earlier attempt let each *gap* carry its own operator and derived the
 * boxes from the sequence. It could not express an ALL OF box ORed with an ANY
 * OF one — flipping the operator between two boxes collapsed them into one —
 * and while it looked like it could, the picture and the meaning had come
 * apart. See `filter-model` for why two levels is where this stops.
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
  NULLARY, OPERATORS, addCondition, addToGroup, dropCondition, setCondition, setGroupOp,
  type Condition, type ConditionField, type ConditionGroup, type FilterState, type Operator,
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
const BIN_COL = 22;
const GRID_GAP = 5;
const BLOCK_PAD = 6;
/** Where the field boxes start — what the gap chips and add buttons line up to. */
const FIELD_INDENT = NEG_COL + GRID_GAP;

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
function ConditionRow({ c, onChange, onRemove }: {
  c: Condition;
  onChange: (next: Condition) => void;
  onRemove: () => void;
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
        {/* The join used to live here as a one-way `or` tag. It is a chip in
            the gap above the row now, where the relationship it describes
            actually is. */}
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
    Runs are built from what has been typed *and* what has not: `bracket` drops
    rows with nothing in them because they match nothing, which is right for
    the matcher and wrong here — a fresh row would be drawn outside any box and
    so without the box's add button, at exactly the moment somebody wants it.

    Filtered to this tab's fields first, so a run whose rows all live on
    another tab simply does not appear here.
  */
  const patch = (next: Condition) => onChange(setCondition(state, next));
  const remove = (id: string) => onChange(dropCondition(state, id));

  const groups = state.groups
    .map(g => ({ ...g, rows: g.rows.filter(visible) }))
    .filter(g => g.rows.length > 0);

  const tone = (op: 'and' | 'or') => (op === 'or'
    ? 'var(--color-accent, var(--color-primary))'
    : 'var(--color-text-muted)');

  /**
   * The chip that shows an operator and flips it.
   *
   * Drawn the same between two rows of one box and between two boxes, because
   * it is the same kind of statement in both places — the only difference is
   * which operator it is bound to.
   */
  const OpChip = ({ op, onFlip, title }: {
    op: 'and' | 'or'; onFlip: () => void; title: string;
  }) => (
    <div className="flex items-center gap-1.5" style={{ padding: '3px 0', marginLeft: FIELD_INDENT }}>
      <button
        type="button"
        onClick={onFlip}
        title={title}
        className="cursor-pointer text-[9px] uppercase tracking-wider px-1.5 rounded"
        style={{
          color: tone(op),
          fontWeight: 700,
          lineHeight: '15px',
          border: `1px solid color-mix(in srgb, ${tone(op)} ${op === 'or' ? 45 : 28}%, transparent)`,
          background: op === 'or' ? `color-mix(in srgb, ${tone(op)} 14%, transparent)` : 'transparent',
        }}
      >
        {op}
      </button>
      <span style={{ flex: 1, height: 1,
                     background: op === 'or'
                       ? `color-mix(in srgb, ${tone(op)} 25%, transparent)`
                       : 'var(--color-surface-border)' }} />
    </div>
  );

  /** `+ and` / `+ or`, adding a row into an existing box. */
  const AddRow = ({ group, op }: { group: ConditionGroup; op: 'and' | 'or' }) => (
    <button
      type="button"
      onClick={() => onChange(addToGroup(state, group.id, group.rows[group.rows.length - 1]?.field, op))}
      title={op === 'or'
        ? 'Add a row this box will accept as an alternative'
        : 'Add a row this box will also require'}
      className="flex items-center gap-1 text-[9.5px] uppercase tracking-wider px-1.5 rounded cursor-pointer"
      style={{
        color: tone(op), fontWeight: 700, lineHeight: '16px', background: 'transparent',
        border: `1px dashed color-mix(in srgb, ${tone(op)} 35%, transparent)`,
      }}
    >
      <PlusIcon size={8} color="currentColor" />
      {op}
    </button>
  );

  return (
    <div className="flex flex-col" style={{ padding: '2px 10px 0' }}>
      {!groups.length && (
        <span className="py-1 text-[11px] leading-snug block"
              style={{ color: 'var(--color-text-muted)' }}>
          {hint}
        </span>
      )}

      {groups.map((group, i) => {
        const multi = group.rows.length > 1;
        const boxed = multi && group.op === 'or';
        return (
          <div key={group.id}>
            {/*
              The one operator between boxes. Every chip here shows the same
              word and flips the same thing, because in a two-level model there
              is exactly one operator at this level.
            */}
            {i > 0 && (
              <OpChip
                op={state.groupOp}
                title={state.groupOp === 'or'
                  ? 'Any box may match — click to require every box'
                  : 'Every box must match — click to accept any one of them'}
                onFlip={() => onChange({
                  ...state, groupOp: state.groupOp === 'or' ? 'and' : 'or',
                })}
              />
            )}

            <div style={{
              border: boxed
                ? `1px solid color-mix(in srgb, ${tone('or')} 30%, transparent)`
                : '1px solid var(--color-surface-border)',
              background: boxed
                ? `color-mix(in srgb, ${tone('or')} 5%, transparent)`
                : 'transparent',
              borderRadius: 6,
              padding: BLOCK_PAD,
            }}>
              {/* The heading names the box and flips it. A box of one relates
                  to nothing, so there is nothing for a label to say. */}
              {multi && (
                <button
                  type="button"
                  onClick={() => onChange(setGroupOp(state, group.id, group.op === 'or' ? 'and' : 'or'))}
                  title={group.op === 'or'
                    ? 'Any of these may match — click to require all of them'
                    : 'All of these must match — click to accept any of them'}
                  className="text-[9px] uppercase tracking-wider pb-0.5 cursor-pointer border-none bg-transparent block text-left"
                  style={{ color: tone(group.op), fontWeight: 700 }}
                >
                  {group.op === 'or' ? 'any of' : 'all of'}
                </button>
              )}

              {group.rows.map((c, j) => (
                <div key={c.id}>
                  {j > 0 && (
                    <OpChip
                      op={group.op}
                      title={group.op === 'or'
                        ? 'Any row in this box may match — click to require all of them'
                        : 'Every row in this box must match — click to accept any of them'}
                      onFlip={() => onChange(setGroupOp(state, group.id, group.op === 'or' ? 'and' : 'or'))}
                    />
                  )}
                  <ConditionRow c={c} onChange={patch} onRemove={() => remove(c.id)} />
                </div>
              ))}

              {/*
                A box of one has not committed to an operator yet, so it offers
                both and the choice decides what kind of box it becomes. Once
                it has two rows the operator is settled and shown, and there is
                only one sensible thing to add.
              */}
              <div className="pt-1 flex gap-1" style={{ paddingLeft: FIELD_INDENT }}>
                {multi ? (
                  <AddRow group={group} op={group.op} />
                ) : (
                  <>
                    <AddRow group={group} op="and" />
                    <AddRow group={group} op="or" />
                  </>
                )}
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

