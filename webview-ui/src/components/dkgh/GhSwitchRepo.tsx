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
import { ModalView } from '@salilvnair/dui';
import { RepoIcon } from '../../icons';
import { Ico, type IcoName } from './GhIcons';
import { Dk, GhNote } from './GhShell';
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
        <Dk><span className="sub">
          {to
            ? `${to.nameWithOwner}: ${to.openIssues} open · ${formsLabel(to.templates)}`
              + (to.countedAt ? ` · read ${since(to.countedAt)}` : '')
            : 'The picker opens next — nothing is chosen yet.'}
        </span></Dk>
      }
      footerRight={
        <Dk>
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className="btn" onClick={onCancel}>Stay here</button>
            <button type="button" className="btn go" onClick={onConfirm}>
              {to ? 'Switch' : 'Choose another'}
            </button>
          </span>
        </Dk>
      }
    >
      <Dk>
        <List title="Comes with you" tone="var(--dk-green)" mark="check" rows={keeps} />
        <List title="Does not, and why" tone="var(--dk-amber)" mark="x" rows={loses} />
        <GhNote title="Nothing is deleted" icon="check">
          What is listed above stays attached to <code>{from}</code> and is waiting when you
          come back. It is not shown as broken on the other side, because it is not broken —
          it is somewhere else.
        </GhNote>
      </Dk>
    </ModalView>
  );
}

/** One side of the ledger — a facet heading and the mock's own rows under it. */
function List({ title, tone, mark, rows }: {
  title: string;
  tone: string;
  mark: IcoName;
  rows: { key: string; title: string; note: string }[];
}) {
  return (
    <div className="facet">
      <div className="fh" style={{ padding: '4px 0 6px' }}>{title}</div>
      <div className="opt" style={{ gap: 0, padding: 0 }}>
        {rows.length === 0 ? (
          <div className="fct" style={{ color: 'var(--dk-faint)', cursor: 'default' }}>
            Nothing — this board is on its defaults.
          </div>
        ) : rows.map(r => (
          <div key={r.key} className="fct" style={{ alignItems: 'flex-start', cursor: 'default' }}>
            <span
              className="bx"
              style={{ color: tone, borderColor: 'transparent', marginTop: 2,
                       background: `color-mix(in srgb, ${tone} 16%, transparent)` }}
            >
              <Ico name={mark} />
            </span>
            <span style={{ lineHeight: 1.55 }}>
              <b style={{ color: 'var(--dk-text)' }}>{r.title}</b>
              <span style={{ color: 'var(--dk-faint)' }}> — {r.note}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
