/**
 * The board — screen 04 (cards) and 05 (table).
 *
 * Laid out to the mock: repository head, the section tabs, a toolbar of pills,
 * the row of filters that are on, then the groups. Every piece is a dui
 * component with dkgh's accent passed in; nothing here draws its own pill,
 * chip, card, tab or group header.
 *
 * Everything shown is derived. Age, quiet-for and the grouping all come from
 * data the host computed or GitHub already had — nothing is stored, because a
 * local copy would be a cache to invalidate and a second truth to disagree
 * with.
 *
 * The toolbar carries the mock's full set of views. The ones whose host side is
 * not built yet are drawn disabled and say so on hover, rather than being
 * hidden — the shape of the board is the thing being agreed on, and a pill that
 * looks live and does nothing is the one thing worse than a pill that is
 * plainly not ready.
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  ButtonView, IconButtonView, AvatarView, BadgeChipView, DataTableView,
  EmptyStateView, CalloutView, IssueCardView, GroupHeaderView, TogglePillView,
  UnderlineTabsView, SearchFieldView, FilterBarView, SkeletonView,
  IssueCardSkeletonView, TableSkeletonView,
  type DataTableColumn,
} from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { useSettledWait } from '../../hooks/useSettledWait';
import {
  RefreshIcon, LayoutGridIcon, TableIcon, IssueOpenedIcon, RepoIcon, PlusIcon,
  ChartBarIcon, ColumnsIcon, TimelineIcon, FilterIcon, DownloadIcon,
  TagIcon, ClockIcon, WarningTriangleIcon,
} from '../../icons';
import { ACCENT, activeAccount, type GhEnv } from './types';

interface Label { name: string; color: string; description?: string }
interface BoardIssue {
  number: number;
  title: string;
  state: 'OPEN' | 'CLOSED';
  url: string;
  author?: string;
  assignees: string[];
  labels: Label[];
  milestone?: string;
  createdAt: string;
  commentCount: number;
  dimensions: Record<string, string>;
  ageDays: number;
  quietDays: number;
}
interface ProposedDimension { dimension: string; heading: string; options: string[]; files: string[] }
interface BoardData {
  repo: string;
  issues: BoardIssue[];
  dimensions: ProposedDimension[];
  formErrors: { file: string; message: string; line?: number }[];
  noTemplates: boolean;
  fetchedAt: number;
  error?: string;
}

/** Nothing is stale until a fortnight — the number the plan settled on. */
const QUIET_DAYS = 14;

/** Grouping the board always has, whatever the templates declared. */
const NATIVE_GROUPS = [
  { id: 'none', label: 'Nothing' },
  { id: 'assignee', label: 'Assignee' },
  { id: 'milestone', label: 'Milestone' },
];

/** The views the mock lays out, with the two that are built marked. */
const VIEWS = [
  { id: 'cards', label: 'Cards', icon: <LayoutGridIcon size={11} />, ready: true },
  { id: 'table', label: 'Table', icon: <TableIcon size={11} />, ready: true },
  { id: 'columns', label: 'Columns', icon: <ColumnsIcon size={11} />, ready: false },
  { id: 'roadmap', label: 'Roadmap', icon: <TimelineIcon size={11} />, ready: false },
];

export function GhBoard({ repo, onChangeRepo, env, onOpenAccount, frozen = false }: {
  repo: string;
  onChangeRepo: () => void;
  env?: GhEnv;
  /** Opens screens 02A/B/D/E from the identity chip. */
  onOpenAccount?: () => void;
  /**
   * The credential is gone, so this board is a photograph.
   *
   * It keeps showing what it had — blanking a board somebody is reading
   * punishes them for a token expiring — but it stops asking for more, because
   * every request would fail the same way and each failure would re-raise the
   * signal that put the recovery screen on screen in the first place.
   */
  frozen?: boolean;
}) {
  const [data, setData] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [groupBy, setGroupBy] = useState('none');
  const [view, setView] = useState('cards');
  const [section, setSection] = useState('board');

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg.type === 'dkgh:board:loading') { setLoading(true); return; }
      if (msg.type !== 'dkgh:board:result') return;
      setLoading(false);
      setData(msg as unknown as BoardData);
    };
    window.addEventListener('message', handler);
    if (!frozen) postMsg({ type: 'dkgh:board', repo });
    return () => window.removeEventListener('message', handler);
  }, [repo, frozen]);

  /*
    Auto-refresh, at the cadence the plan settled on. A refresh is one or two
    API calls against a budget of 5,000 an hour, so 60 seconds costs about 2%.
    Paused while the tab is hidden — nobody needs a background webview polling
    on their behalf.
  */
  useEffect(() => {
    if (frozen) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') postMsg({ type: 'dkgh:board', repo });
    }, 60_000);
    return () => window.clearInterval(id);
  }, [repo, frozen]);

  const refresh = () => {
    if (frozen) return;
    setLoading(true);
    postMsg({ type: 'dkgh:board', repo });
  };

  /** Dimensions the repository declared, plus the ones GitHub always has. */
  const groupOptions = useMemo(() => [
    ...NATIVE_GROUPS,
    ...(data?.dimensions ?? []).map(d => ({ id: d.dimension, label: cap(d.dimension) })),
  ], [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data?.issues ?? [];
    /* Title and number. Body search belongs with the facet work; offering it
       here and matching only titles would be worse than not offering it. */
    return (data?.issues ?? []).filter(i =>
      i.title.toLowerCase().includes(q) || String(i.number).includes(q));
  }, [data, search]);

  const groups = useMemo(() => groupIssues(filtered, groupBy), [filtered, groupBy]);

  /*
    The first read shows the board's shape, not a panel over it.

    A skeleton is the honest thing to draw here: the chrome is already known —
    the repository, the sections, the toolbar — so only the part that depends on
    the network is unknown, and only that part should look unknown. Nothing
    moves when the issues land, because the cards arrive exactly where their
    outlines stood.
  */
  const pending = loading && !data;

  /*
    And if the data does not come, THEN the placeholder.

    Past about eight seconds a skeleton stops reassuring and starts looking
    stuck, and the question changes from "how much is coming" to "what is it
    doing". That is the point at which naming the calls earns its space.
  */
  const stuck = useSettledWait(pending, { delayMs: 8000, minMs: 1200 });

  const total = data?.issues.length ?? 0;
  const stale = filtered.filter(i => i.quietDays >= QUIET_DAYS).length;
  const unassigned = filtered.filter(i => i.assignees.length === 0).length;
  const [owner, name] = repo.split('/');
  const account = activeAccount(env ?? null);
  const groupLabel = groupOptions.find(g => g.id === groupBy)?.label ?? 'Nothing';

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">

      {/* Head — repository, count, when it was last read */}
      <div className="flex items-center gap-2.5 px-4 pt-3 flex-shrink-0 min-w-0">
        <RepoIcon size={15} style={{ color: ACCENT, flexShrink: 0 }} />
        <span className="text-[13px] font-medium font-mono truncate"
              style={{ color: 'var(--color-text-primary)' }}>
          {owner}<span style={{ color: 'var(--color-text-muted)' }}>/</span>{name}
        </span>
        {pending
          ? <SkeletonView variant="block" width={46} height={15} />
          : <BadgeChipView tone={ACCENT} size="sm">{total} open</BadgeChipView>}
        <span className="flex-1" />
        <span className="text-[10.5px] font-mono whitespace-nowrap"
              style={{ color: 'var(--color-text-muted)' }}>
          {frozen ? 'paused — signed out'
            : pending ? 'reading...'
            : loading ? 'refreshing...'
            : `auto 60s · refreshed ${ago(data?.fetchedAt)}`}
        </span>
        {account && onOpenAccount && (
          <button
            type="button"
            onClick={onOpenAccount}
            title="Scopes, hosts, accounts, and every command dkgh runs"
            className="flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer"
            style={{ background: 'transparent', border: '1px solid var(--color-surface-border)' }}
          >
            <AvatarView name={account.login} size="xs" />
            <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
              {account.login}
            </span>
          </button>
        )}
        <IconButtonView icon={<RefreshIcon size={12} />} tooltip="Read it again now"
                        accentColor={ACCENT} onClick={refresh} disabled={frozen} />
        <ButtonView size="sm" accentColor="var(--color-text-muted)" onClick={onChangeRepo}>
          Switch
        </ButtonView>
      </div>

      {/* The sections of the tab */}
      <div className="px-4 pt-2.5 flex-shrink-0">
        <UnderlineTabsView
          accentColor={ACCENT}
          activeId={section}
          onChange={setSection}
          tabs={[
            { id: 'board', label: 'Board', icon: <IssueOpenedIcon size={12} />,
              count: pending ? undefined : total },
            { id: 'new', label: 'New issue', icon: <PlusIcon size={12} />, disabled: true },
            { id: 'insights', label: 'Insights', icon: <ChartBarIcon size={12} />, disabled: true },
            { id: 'repository', label: 'Repository', icon: <RepoIcon size={12} />, disabled: true },
          ]}
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-[7px] px-4 py-2 flex-wrap flex-shrink-0 min-w-0"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <div className="flex-1" style={{ minWidth: 200 }}>
          <SearchFieldView value={search} onChange={setSearch} onClear={() => setSearch('')}
                           placeholder="Search issues" size="sm" accentColor={ACCENT}
                           width="100%" />
        </div>
        <TogglePillView icon={<FilterIcon size={11} />} accentColor={ACCENT} disabled
                        title="Facets come with the filter work">
          Filters
        </TogglePillView>
        {VIEWS.map(v => (
          <TogglePillView
            key={v.id}
            icon={v.icon}
            accentColor={ACCENT}
            active={view === v.id}
            disabled={!v.ready}
            title={v.ready ? undefined : `${v.label} is not built yet`}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </TogglePillView>
        ))}
        <GroupPill options={groupOptions} value={groupBy} label={groupLabel} onChange={setGroupBy} />
        <TogglePillView icon={<DownloadIcon size={11} />} accentColor={ACCENT} disabled
                        title="Export comes with the assignee view">
          Export
        </TogglePillView>
      </div>

      {/* What is filtering the list right now */}
      {search.trim() !== '' && (
        <div className="px-4 py-1.5 flex items-center gap-1.5 flex-shrink-0"
             style={{
               borderBottom: '1px solid var(--color-surface-border)',
               background: `color-mix(in srgb, ${ACCENT} 5%, transparent)`,
             }}>
          <span className="text-[9.5px] font-bold uppercase tracking-[.09em]"
                style={{ color: 'var(--color-text-muted)' }}>
            Showing
          </span>
          <FilterBarView
            color={ACCENT}
            filters={[{ key: 'search', label: `search ${search.trim()}` }]}
            onRemove={() => setSearch('')}
            onClearAll={() => setSearch('')}
          />
        </div>
      )}

      {/* What the templates did, or did not, give us */}
      {(data?.noTemplates || (data?.formErrors.length ?? 0) > 0) && (
        <div className="px-4 flex-shrink-0">
          {data?.noTemplates && (
            <CalloutView variant="info" title="No issue forms in this repository"
                         style={{ margin: '8px 0 0' }}>
              Module, Environment and Type are headings a template declares — without one there
              is nothing to read, so those groupings are absent rather than empty. Everything
              GitHub has of its own still works.
            </CalloutView>
          )}
          {data?.formErrors.map(e => (
            <CalloutView key={e.file} variant="warning" title={e.file}
                         style={{ margin: '8px 0 0' }}>
              {e.line ? `Line ${e.line}: ` : ''}{e.message}. The other templates were still read.
            </CalloutView>
          ))}
        </div>
      )}

      {/* The groups */}
      <div className="flex-1 overflow-y-auto min-w-0 px-4 pt-3 pb-4">
        {pending ? (
          stuck
            ? <GhBoardStalled repo={repo} onChangeRepo={onChangeRepo} />
            : <BoardSkeleton view={view} />
        ) : filtered.length === 0 ? (
          <EmptyStateView
            variant="medallion"
            accentColor={ACCENT}
            icon={<IssueOpenedIcon size={24} />}
            title={search ? 'Nothing matches that' : 'Nothing is open'}
            message={search
              ? `No open issue in ${repo} has "${search}" in its title or number. There are ${total} altogether.`
              : `${repo} has no open issues. Closed ones are not read yet — the state filter comes with the facets.`}
            action={search ? { label: 'Clear the search', onClick: () => setSearch('') } : undefined}
          />
        ) : view === 'cards' ? (
          <div className="flex flex-col" style={{ gap: 17 }}>
            {groups.map(g => (
              <div key={g.key}>
                {groupBy !== 'none' && <Header group={g} />}
                <div className="grid gap-2"
                     style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
                  {g.issues.map(i => <Card key={i.number} issue={i} />)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <IssueTable groups={groups} showGroups={groupBy !== 'none'} dims={data?.dimensions ?? []} />
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 px-4 py-2 text-[10.5px] flex-shrink-0"
           style={{ borderTop: '1px solid var(--color-surface-border)', color: 'var(--color-text-muted)' }}>
        <span>
          {pending ? 'reading the repository' :
            `${filtered.length}${filtered.length !== total ? ` of ${total}` : ''} shown`}
        </span>
        <span className="flex-1" />
        {!pending && stale > 0 && (
          <BadgeChipView tone="var(--color-warning)" size="sm">
            {stale} quiet {QUIET_DAYS}d+
          </BadgeChipView>
        )}
        {!pending && unassigned > 0 && (
          <BadgeChipView tone="var(--color-warning)" size="sm">{unassigned} unassigned</BadgeChipView>
        )}
      </div>
    </div>
  );
}

/**
 * `Group: Module`, and the list behind it.
 *
 * One pill rather than a row of them, the way the mock has it: the grouping is
 * a single choice, and spelling out every dimension in the toolbar would push
 * the views off the end on a narrow panel.
 */
function GroupPill({ options, value, label, onChange }: {
  options: { id: string; label: string }[];
  value: string;
  label: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: 'relative' }}>
      <TogglePillView accentColor={ACCENT} active={value !== 'none'} onClick={() => setOpen(o => !o)}>
        Group: {label}
      </TogglePillView>
      {open && (
        <>
          {/* Click anywhere to dismiss, without trapping focus. */}
          <span className="fixed inset-0" style={{ zIndex: 10 }} onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 rounded-lg border py-1"
               style={{
                 zIndex: 11,
                 minWidth: 150,
                 borderColor: 'var(--color-surface-border)',
                 background: 'var(--color-surface)',
                 boxShadow: '0 8px 22px rgba(0,0,0,.35)',
               }}>
            {options.map(o => (
              <button
                key={o.id}
                type="button"
                onClick={() => { onChange(o.id); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-[11px] cursor-pointer"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: o.id === value ? ACCENT : 'var(--color-text-secondary)',
                  fontWeight: o.id === value ? 600 : 400,
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}

// ── Grouping ────────────────────────────────────────────────────────────────

interface Group { key: string; label: string; issues: BoardIssue[]; unowned?: boolean }

function groupIssues(issues: BoardIssue[], by: string): Group[] {
  if (by === 'none') return [{ key: 'all', label: '', issues }];

  const buckets = new Map<string, BoardIssue[]>();
  for (const i of issues) {
    const value =
      by === 'assignee' ? (i.assignees[0] ?? '')
      : by === 'milestone' ? (i.milestone ?? '')
      : (i.dimensions[by] ?? '');
    const key = value || '__none__';
    const list = buckets.get(key) ?? [];
    list.push(i);
    buckets.set(key, list);
  }

  const named = [...buckets.entries()]
    .filter(([k]) => k !== '__none__')
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => ({ key: k, label: k, issues: v }));

  const none = buckets.get('__none__');
  /*
    The unowned pile goes FIRST, not last.

    Alphabetical order would bury "nobody" in the middle and "no module" at the
    end, and three unassigned issues is the finding a lead can act on today —
    not a footnote after everyone's name.
  */
  if (!none) return named;
  const label = by === 'assignee' ? 'Nobody' : by === 'milestone' ? 'No milestone' : `No ${by}`;
  return [{ key: '__none__', label, issues: none, unowned: true }, ...named];
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function Header({ group }: { group: Group }) {
  const worstQuiet = Math.max(...group.issues.map(i => i.quietDays), 0);
  return (
    <GroupHeaderView
      name={group.label}
      count={group.issues.length}
      tone={group.unowned ? 'var(--color-warning)' : undefined}
      summary={worstQuiet >= QUIET_DAYS
        ? <BadgeChipView tone="var(--color-warning)" size="xs">oldest quiet {worstQuiet}d</BadgeChipView>
        : undefined}
      style={{ marginBottom: 8 }}
    />
  );
}

function Card({ issue }: { issue: BoardIssue }) {
  const quiet = issue.quietDays >= QUIET_DAYS;
  const who = issue.assignees[0];
  return (
    <IssueCardView
      reference={`#${issue.number}`}
      title={issue.title}
      accentColor={ACCENT}
      onClick={() => window.open(issue.url, '_blank')}
      chips={
        <span className="flex gap-[5px] flex-wrap items-center">
          {Object.values(issue.dimensions).map(v => (
            <BadgeChipView key={v} tone={ACCENT} size="xs">{v}</BadgeChipView>
          ))}
          {issue.labels.slice(0, 2).map(l => (
            <BadgeChipView key={l.name} tone={`#${l.color}`} size="xs">{l.name}</BadgeChipView>
          ))}
        </span>
      }
      owner={who
        ? <span title={who}><AvatarView name={who} size="xs" /></span>
        : <span style={{ color: 'var(--color-warning)' }}>unassigned</span>}
      meta={
        <span className="flex items-center gap-[7px]">
          {quiet
            ? <BadgeChipView tone="var(--color-warning)" size="xs">stale {issue.quietDays}d</BadgeChipView>
            : <span>{issue.ageDays}d</span>}
          {issue.commentCount > 0 && (
            <span>{issue.commentCount} comment{issue.commentCount === 1 ? '' : 's'}</span>
          )}
        </span>
      }
    />
  );
}

/** A row as DataTableView wants it: a flat record it can sort, plus the issue. */
type IssueRow = Record<string, unknown> & { issue: BoardIssue };

function IssueTable({ groups, showGroups, dims }: {
  groups: Group[]; showGroups: boolean; dims: ProposedDimension[];
}) {
  const columns: DataTableColumn<IssueRow>[] = [
    { key: 'number', label: '#', width: 56, sortable: true },
    {
      key: 'title', label: 'Title', sortable: true,
      /* Wrapped, never clipped — an ellipsis lands exactly where the sentence
         was about to say the useful part. */
      renderCell: (r) => (
        <span style={{ color: 'var(--color-text-primary)', overflowWrap: 'anywhere' }}>
          {r.issue.title}
        </span>
      ),
    },
    ...dims.map(d => ({
      key: d.dimension,
      label: cap(d.dimension),
      sortable: true,
      renderCell: (r: IssueRow) => r.issue.dimensions[d.dimension] ?? '—',
    })),
    {
      key: 'assignee', label: 'Assignee', sortable: true,
      renderCell: (r: IssueRow) => r.issue.assignees[0]
        ?? <span style={{ color: 'var(--color-warning)' }}>—</span>,
    },
    {
      key: 'labels', label: 'Labels',
      renderCell: (r: IssueRow) => (
        <span className="flex gap-1 flex-wrap">
          {r.issue.labels.slice(0, 3).map(l => (
            <BadgeChipView key={l.name} tone={`#${l.color}`} size="xs">{l.name}</BadgeChipView>
          ))}
        </span>
      ),
    },
    {
      key: 'ageDays', label: 'Age', width: 64, sortable: true, align: 'right',
      renderCell: (r: IssueRow) => `${r.issue.ageDays}d`,
    },
    {
      key: 'quietDays', label: 'Quiet', width: 72, sortable: true, align: 'right',
      renderCell: (r: IssueRow) => (
        <span style={{ color: r.issue.quietDays >= QUIET_DAYS ? 'var(--color-warning)' : undefined }}>
          {r.issue.quietDays}d
        </span>
      ),
    },
  ];

  const rowsOf = (g: Group): IssueRow[] => g.issues.map(i => ({
    issue: i,
    number: i.number,
    title: i.title,
    assignee: i.assignees[0] ?? '',
    labels: '',
    ageDays: i.ageDays,
    quietDays: i.quietDays,
    ...Object.fromEntries(dims.map(d => [d.dimension, i.dimensions[d.dimension] ?? ''])),
  }));

  /*
    One table per group, rather than one table with heading rows inside it.

    A sortable table whose body contains section headings sorts them into the
    middle of the data the moment anybody clicks a column. Separate tables sort
    within their group, which is what grouping meant.
  */
  return (
    <div className="flex flex-col gap-4">
      {groups.map(g => (
        <Fragment key={g.key}>
          {showGroups && <Header group={g} />}
          <DataTableView<IssueRow>
            columns={columns}
            rows={rowsOf(g)}
            keyField="number"
            size="sm"
            compact
            sortable
            onRowClick={(r) => window.open(r.issue.url, '_blank')}
          />
        </Fragment>
      ))}
    </div>
  );
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

function ago(at?: number) {
  if (!at) return 'just now';
  const s = Math.max(0, Math.floor((Date.now() - at) / 1000));
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

// ── While it reads ──────────────────────────────────────────────────────────

/**
 * The board's shape, before the board.
 *
 * Six cards rather than a number chosen to match: nobody knows how many issues
 * are coming, and a skeleton that promises twelve and delivers three is a
 * worse lie than one that plainly stands for "some". The widths vary so it
 * reads as a list of different things rather than a printed pattern.
 */
function BoardSkeleton({ view }: { view: string }) {
  if (view === 'table') {
    return (
      <TableSkeletonView
        rows={6}
        leadingIcon
        columns={[
          { width: 40 },
          { width: 'flex', fill: 0.8 },
          { width: 90 },
          { width: 120 },
          { width: 50, align: 'right' },
          { width: 50, align: 'right' },
        ]}
      />
    );
  }
  /* Fixed fills, not random: a skeleton that reshuffles on every render is a
     second animation fighting the pulse. */
  const fills = [0.86, 0.52, 0.94, 0.68, 0.78, 0.44];
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
      {fills.map((f, i) => <IssueCardSkeletonView key={i} titleFill={f} />)}
    </div>
  );
}

/**
 * The read is taking long enough to wonder about.
 *
 * Replaces the skeleton rather than covering the board, because at this point
 * the skeleton has stopped reassuring and started looking stuck — the question
 * has changed from "how much is coming" to "what is it doing", and only naming
 * the calls answers that.
 *
 * The three lines are not a progress bar. Nothing here knows which call is in
 * flight, and a bar that guessed would be a lie.
 */
function GhBoardStalled({ repo, onChangeRepo }: { repo: string; onChangeRepo: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <EmptyStateView
        variant="medallion"
        accentColor={ACCENT}
        icon={<RepoIcon size={26} />}
        title={`Still reading ${repo}`}
        message={
          'Through gh, using the credential it already holds. Nothing is copied to disk — the '
          + 'issues stay in GitHub, and this board is a view of them rather than a second place '
          + 'they live. A large repository, a slow network or a VPN can all make this take a '
          + 'while; it will appear as soon as it lands.'
        }
        hints={[
          {
            key: <TagIcon size={12} />,
            text: 'Issue templates. A dropdown in a form declares its own values, which is where '
                + 'Module, Environment and Type come from — GitHub itself has no such fields.',
          },
          {
            key: <IssueOpenedIcon size={12} />,
            text: 'Open issues. Titles, labels, assignees, milestones and comment counts, in one '
                + 'call rather than one per issue.',
          },
          {
            key: <ClockIcon size={12} />,
            text: 'Age and quiet time. Days since each issue was opened, and days since anything '
                + 'last happened on it — the second is the number github.com will not show you.',
          },
        ]}
      />
      <ButtonView size="md" accentColor="var(--color-text-muted)" onClick={onChangeRepo}>
        Choose a different repository
      </ButtonView>
    </div>
  );
}
