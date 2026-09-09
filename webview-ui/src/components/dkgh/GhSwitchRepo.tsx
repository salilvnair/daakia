/**
 * Screen 03E — switching away, and what comes with you.
 *
 * Changing repository throws away more than people expect. Everyone expects
 * filters to reset; almost nobody expects that a grouping can be
 * repository-specific until it silently returns nothing. Naming what goes,
 * before the switch, is the difference between a rule people understand and one
 * they discover.
 *
 * Two lists, and the second is the point. Both are derived from what is
 * actually stored rather than written out as prose — a dialog that lists a
 * saved view somebody does not have is a dialog that stops being read.
 *
 * **Nothing is deleted.** What is left behind stays attached to the repository
 * being left and is waiting when you come back. It is not shown as broken on
 * the other side, because it is not broken — it is somewhere else.
 */
import { ButtonView, ModalView, BadgeChipView } from '@salilvnair/dui';
import { CheckIcon, CloseIcon, RepoIcon } from '../../icons';
import { since, formsLabel } from './format';
import { meaningFor, type ShapePrefs } from './board-prefs';
import { ACCENT, type RepoSummary } from './types';

export function GhSwitchRepo({ open, from, to, shape, search, dimensions, onCancel, onConfirm }: {
  open: boolean;
  /** The repository being left. */
  from: string;
  /** Where you are going, when it is known. Absent means back to the picker. */
  to?: RepoSummary;
  shape: ShapePrefs;
  /** The term in the search box right now, which does not travel. */
  search: string;
  /** The dimensions the current repository's templates declared. */
  dimensions: string[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const meaning = meaningFor(from);
  const groupBy = meaning?.groupBy ?? 'none';

  /*
    A grouping or a sort only fails to travel when it names a dimension the
    templates declared — `assignee` and `milestone` are GitHub's own and mean
    the same thing everywhere. Listing those as lost would be a warning about
    nothing, which is how a confirm dialog teaches people to click through it.
  */
  const groupIsLocal = groupBy !== 'none' && dimensions.includes(groupBy);
  const localSorts = (meaning?.sort ?? []).filter(s => dimensions.includes(s.key));

  const keeps = [
    {
      key: 'layout',
      title: shape.view === 'table' ? 'Table, and its column arrangement' : 'Cards, and what is on them',
      note: shape.view === 'table'
        ? `${shape.columns.length} columns, in the order you put them`
        : `${shape.cardFields.length} elements on each card`,
    },
    {
      key: 'density',
      title: 'Density',
      note: `${shape.density}${shape.wrapTitles ? ', long titles wrapped' : ', long titles on one line'}`,
    },
    {
      key: 'native',
      title: 'Grouping on a GitHub field',
      note: 'Assignee and milestone exist in every repository, so they mean the same thing there',
    },
  ];

  const loses = [
    ...(search.trim()
      ? [{ key: 'search', title: 'The search', note: `"${search.trim()}" — a term about these issues` }]
      : []),
    ...(groupIsLocal
      ? [{
          key: 'group',
          title: `Grouping by ${groupBy}`,
          note: to
            ? `${to.nameWithOwner} declares its own fields, and may not have one called ${groupBy}`
            : `${groupBy} comes from this repository's issue forms`,
        }]
      : []),
    ...(localSorts.length > 0
      ? [{
          key: 'sort',
          title: `${localSorts.length} sort level${localSorts.length === 1 ? '' : 's'}`,
          note: localSorts.map(s => s.key).join(', ') + ' — columns only this repository has',
        }]
      : []),
    {
      key: 'map',
      title: 'The field map',
      note: to
        ? `${to.nameWithOwner} has its own; it is read when the board opens`
        : 'Module, Environment and Type are read from whichever repository you choose next',
    },
  ];

  return (
    <ModalView
      open={open}
      onClose={onCancel}
      size="md"
      headerGradient
      headerColor={ACCENT}
      headerIcon={<RepoIcon size={14} />}
      title={to ? `Switch to ${to.nameWithOwner}` : `Leave ${from}`}
      footerLeft={
        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
          {to
            ? `${to.nameWithOwner}: ${to.openIssues} open · ${formsLabel(to.templates)}`
              + (to.countedAt ? ` · read ${since(to.countedAt)}` : '')
            : 'The picker opens next — nothing is chosen yet.'}
        </span>
      }
      footerRight={
        <span className="flex items-center gap-2">
          <ButtonView size="sm" accentColor="var(--color-text-muted)" onClick={onCancel}>
            Stay here
          </ButtonView>
          <ButtonView size="sm" variant="primary" accentColor={ACCENT} onClick={onConfirm}>
            {to ? 'Switch' : 'Choose another'}
          </ButtonView>
        </span>
      }
    >
      <div className="flex flex-col gap-3">
        <List title="Comes with you" tone="var(--color-success)" mark={<CheckIcon size={10} />}
              rows={keeps} />
        <List title="Does not, and why" tone="var(--color-warning)" mark={<CloseIcon size={10} />}
              rows={loses} />
        <div className="flex items-start gap-2 text-[10px] rounded-lg px-2.5 py-2"
             style={{
               color: 'var(--color-text-muted)',
               lineHeight: 1.65,
               border: '1px solid var(--color-surface-border)',
               background: `color-mix(in srgb, ${ACCENT} 5%, transparent)`,
             }}>
          <BadgeChipView tone="var(--color-success)" size="xs">kept</BadgeChipView>
          <span>
            <b style={{ color: 'var(--color-text-primary)' }}>Nothing is deleted.</b> What is
            listed above stays attached to <code>{from}</code> and is waiting when you come
            back. It is not shown as broken on the other side, because it is not broken — it is
            somewhere else.
          </span>
        </div>
      </div>
    </ModalView>
  );
}

function List({ title, tone, mark, rows }: {
  title: string;
  tone: string;
  mark: React.ReactNode;
  rows: { key: string; title: string; note: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[9.5px] font-bold uppercase tracking-[.09em]"
            style={{ color: 'var(--color-text-muted)' }}>
        {title}
      </span>
      <div className="rounded-lg border flex flex-col"
           style={{ borderColor: 'var(--color-surface-border)', background: 'var(--color-panel)' }}>
        {rows.length === 0 ? (
          <span className="px-2.5 py-2 text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
            Nothing — this board is on its defaults.
          </span>
        ) : rows.map((r, i) => (
          <span key={r.key} className="flex items-start gap-2 px-2.5 py-1.5"
                style={{
                  borderTop: i === 0 ? 'none'
                    : '1px solid color-mix(in srgb, var(--color-surface-border) 60%, transparent)',
                }}>
            <span className="flex items-center justify-center flex-shrink-0"
                  style={{ width: 14, height: 14, borderRadius: 4, color: tone,
                           background: `color-mix(in srgb, ${tone} 15%, transparent)`, marginTop: 1 }}>
              {mark}
            </span>
            <span className="text-[10.5px]" style={{ lineHeight: 1.55 }}>
              <b style={{ color: 'var(--color-text-primary)' }}>{r.title}</b>
              <span style={{ color: 'var(--color-text-muted)' }}> — {r.note}</span>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
