/**
 * Screen 05A — the columns, and the order they are in.
 *
 * The column set is the table's whole personality, and it is also what the
 * export writes. Picking, ordering and pinning are one panel because they are
 * one decision — **there is no second dialog deciding what lands in the
 * spreadsheet.** What is arranged here is what gets written, in this order,
 * which is the only way to be sure the file agrees with the screen it was
 * checked against.
 *
 * Each name carries where it comes from. That badge is not decoration: on a
 * repository with no issue forms, seeing that five of your eleven columns are
 * form-sourced is what explains an otherwise baffling row of dashes.
 *
 * `#` and `Title` are pinned and cannot be moved or hidden. A row you cannot
 * identify is not a row.
 */
import { ButtonView, BadgeChipView } from '@salilvnair/dui';
import {
  ArrowUpIcon, ArrowDownIcon, EyeIcon, EyeOffIcon, PinIcon, WrapLinesIcon,
} from '../../icons';
import { DEFAULT_COLUMNS } from './board-prefs';
import { arrange, catalogue, SOURCE_LABEL, type TableColumn } from './table-columns';
import type { ProposedDimension } from './board-types';
import { ACCENT } from './types';

const SOURCE_TONE: Record<string, string> = {
  native: 'var(--color-text-muted)',
  form: 'var(--color-dkgh)',
  computed: 'var(--color-success)',
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
  const all = catalogue(dimensions);
  const shown = arrange(all, columns);
  const shownKeys = new Set(shown.map(c => c.key));
  const hidden = all.filter(c => !shownKeys.has(c.key));

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
    /* Never above the pinned pair, and never off either end. */
    const firstMovable = shown.findIndex(c => !c.pinned);
    if (at < 0 || to < firstMovable || to >= order.length) return;
    [order[at], order[to]] = [order[to], order[at]];
    onColumns(merge(columns, order));
  };

  const hide = (key: string) => onColumns(columns.filter(k => k !== key));
  const show = (key: string) => onColumns([...merge(columns, shown.map(c => c.key)), key]);

  return (
    <div className="flex flex-col gap-3 overflow-y-auto flex-shrink-0"
         style={{
           width: 210,
           borderRight: '1px solid var(--color-surface-border)',
           padding: '12px 10px',
         }}>

      <div className="flex items-center gap-2">
        <span className="text-[9px] font-bold uppercase tracking-[.09em] flex-1"
              style={{ color: 'var(--color-text-muted)' }}>
          Columns: {shown.length} of {all.length}
        </span>
        <ButtonView size="sm" variant="ghost" accentColor="var(--color-text-muted)"
                    onClick={() => onColumns(DEFAULT_COLUMNS)}>
          Reset
        </ButtonView>
      </div>

      <Section title="Shown — in this order">
        {shown.map((c, i) => (
          <Row key={c.key} col={c}>
            {c.pinned ? (
              <span title="Pinned — it stays while the rest scrolls sideways">
                <PinIcon size={10} style={{ color: ACCENT }} />
              </span>
            ) : (
              <span className="flex items-center gap-0.5">
                <Tiny label="Move up" disabled={i === 0 || shown[i - 1].pinned}
                      onClick={() => move(c.key, -1)}>
                  <ArrowUpIcon size={9} />
                </Tiny>
                <Tiny label="Move down" disabled={i === shown.length - 1}
                      onClick={() => move(c.key, 1)}>
                  <ArrowDownIcon size={9} />
                </Tiny>
                <Tiny label="Hide" onClick={() => hide(c.key)}>
                  <EyeOffIcon size={9} />
                </Tiny>
              </span>
            )}
          </Row>
        ))}
      </Section>

      {hidden.length > 0 && (
        <Section title={`Hidden — ${hidden.length}`}>
          {hidden.map(c => (
            <Row key={c.key} col={c} dim>
              <Tiny label="Show" onClick={() => show(c.key)}>
                <EyeIcon size={9} />
              </Tiny>
            </Row>
          ))}
        </Section>
      )}

      <Section title="Long values">
        <button
          type="button"
          onClick={() => onWrapTitles(!wrapTitles)}
          className="flex items-center gap-1.5 px-1 py-1 text-left cursor-pointer rounded"
          style={{
            background: wrapTitles ? `color-mix(in srgb, ${ACCENT} 12%, transparent)` : 'transparent',
            border: 'none',
            color: wrapTitles ? ACCENT : 'var(--color-text-secondary)',
          }}
        >
          <WrapLinesIcon size={11} />
          <span className="text-[10.5px]">Wrap long titles</span>
        </button>
        <span className="text-[9.5px] px-1" style={{ color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          A wrapped row is taller than the others and that is correct — the
          alternative is an ellipsis at exactly the point where the sentence was
          about to say the useful part.
        </span>
      </Section>

      <span className="text-[9.5px] px-1 pt-1"
            style={{ color: 'var(--color-text-muted)', lineHeight: 1.55,
                     borderTop: '1px solid var(--color-surface-border)' }}>
        This list is the export&rsquo;s column list too. There is no second dialog
        deciding what lands in the spreadsheet.
      </span>
    </div>
  );
}

/** Keep unknown keys — they belong to another repository — and reorder the rest. */
function merge(stored: string[], order: string[]): string[] {
  const known = new Set(order);
  const foreign = stored.filter(k => !known.has(k));
  return [...order, ...foreign];
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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

function Row({ col, dim, children }: {
  col: TableColumn;
  dim?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 px-1 py-[3px] rounded"
         style={{ opacity: dim ? 0.7 : 1 }}>
      <span className="text-[10.5px] flex-1 truncate"
            style={{ color: 'var(--color-text-secondary)' }}>
        {col.label}
      </span>
      <BadgeChipView tone={SOURCE_TONE[col.source]} size="xs">
        {SOURCE_LABEL[col.source]}
      </BadgeChipView>
      {children}
    </div>
  );
}

function Tiny({ label, disabled, onClick, children }: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex items-center justify-center cursor-pointer rounded"
      style={{
        width: 16,
        height: 16,
        background: 'transparent',
        border: 'none',
        color: 'var(--color-text-muted)',
        opacity: disabled ? 0.3 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}
