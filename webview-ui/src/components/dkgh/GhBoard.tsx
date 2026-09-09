/**
 * The board — the shell around screens 04 and 05.
 *
 * Repository head, the section tabs, a toolbar of pills, the row of filters
 * that are on, an optional panel down the left, and then either the cards or
 * the table. This file owns everything the two views share and neither of them
 * should own twice:
 *
 * - **The read**, and the sixty-second refresh that pauses when the tab is
 *   hidden, when the credential is gone, or when GitHub is rate-limiting us.
 * - **The selection**, which survives a filter change and not a repository
 *   switch — see `GhBulkBar`.
 * - **The cursor and the keys**, because `j` has to move down whichever view is
 *   showing, and the cursor and the selection being different things is the one
 *   genuinely confusing part of a keyboard board. The footer says which is
 *   which out loud — see `GhKeys`.
 * - **The write path**, so a bulk assign and a single cell change take the same
 *   route through the same confirm — see `edit-flow.ts`.
 *
 * Everything shown is derived. Age, quiet-for and the grouping come from what
 * the host computed or GitHub already had; nothing is stored, because a local
 * copy would be a cache to invalidate and a second truth to disagree with.
 *
 * The toolbar carries the mock's full set of views. The two whose host side is
 * not built are drawn disabled and say so on hover rather than being hidden —
 * the shape of the board is the thing being agreed on, and a pill that looks
 * live and does nothing is the one thing worse than a pill that is plainly not
 * ready.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ButtonView, IconButtonView, AvatarView, BadgeChipView, CalloutView, EmptyStateView,
  TogglePillView, UnderlineTabsView, SearchFieldView, SkeletonView,
  IssueCardSkeletonView, TableSkeletonView,
} from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { useSettledWait } from '../../hooks/useSettledWait';
import {
  RefreshIcon, LayoutGridIcon, TableIcon, IssueOpenedIcon, RepoIcon, PlusIcon,
  ChartBarIcon, ColumnsIcon, TimelineIcon, FilterIcon, DownloadIcon, KeyboardIcon,
  TagIcon, ClockIcon,
} from '../../icons';
import { GhNoAccess } from './GhNoAccess';
import { GhCards, Header } from './GhCards';
import { GhIssueTable, sortIssues } from './GhIssueTable';
import { GhCardOptions } from './GhCardOptions';
import { GhColumnPanel } from './GhColumnPanel';
import { GhBulkBar } from './GhBulkBar';
import { GhEditConfirm } from './GhEditConfirm';
import { GhBoardEmpty, type ActiveFilter } from './GhBoardEmpty';
import { GhFilters } from './GhFilters';
import { GhChips, GhSearchScope } from './GhChips';
import { GhWhy } from './GhWhy';
import {
  EMPTY as EMPTY_FILTER, describeAll, dropField, isEmpty as filterIsEmpty,
  matchesAll, runSearch, type FilterState, type MatchContext, type SearchHit,
} from './filter-model';
import { GhPeek } from './GhPeek';
import { GhKeys, GhKeyStatus, PEEK_HOLD_MS } from './GhKeys';
import { useEditFlow, type EditRequest } from './edit-flow';
import { useShapePrefs, useMeaningPrefs, type CardField } from './board-prefs';
import { arrange, catalogue } from './table-columns';
import {
  QUIET_DAYS, NATIVE_GROUPS, cap, groupIssues,
  type BoardData, type BoardIssue, type Group,
} from './board-types';
import { since, until, atClock } from './format';
import { ACCENT, activeAccount, type GhEnv, type RepoMeta } from './types';

/** The views the mock lays out, with the two that are built marked. */
const VIEWS = [
  { id: 'cards', label: 'Cards', icon: <LayoutGridIcon size={11} />, ready: true },
  { id: 'table', label: 'Table', icon: <TableIcon size={11} />, ready: true },
  { id: 'columns', label: 'Columns', icon: <ColumnsIcon size={11} />, ready: false },
  { id: 'roadmap', label: 'Roadmap', icon: <TimelineIcon size={11} />, ready: false },
];

export function GhBoard({ repo, onChangeRepo, onContext, env, onOpenAccount, frozen = false }: {
  repo: string;
  onChangeRepo: () => void;
  /**
   * What is on screen, for the switch dialog to read — screen 03E.
   *
   * Reported upward rather than the dialog reaching down into the board,
   * because the dialog outlives the board it is describing: it is open at the
   * moment the board is about to be replaced.
   */
  onContext?: (c: { search: string; dimensions: string[] }) => void;
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
  /**
   * The last read that did not work, kept beside the last one that did.
   *
   * A failure must not blank a board somebody is reading. Rate limiting is the
   * case that makes this matter: the right screen there is the issues you
   * already had, with a line saying how old they are and when GitHub will
   * answer again — not an empty list implying a clean sprint.
   */
  const [failure, setFailure] = useState<
    { error?: string; rateLimit?: BoardData['rateLimit'] } | undefined
  >();
  const [meta, setMeta] = useState<RepoMeta | undefined>();
  const [loading, setLoading] = useState(true);
  /** Screen 08 — the one filter behind the facets, the chips and the query. */
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);
  /** Numbers the host found for the current term, when the scope reached past
      the board — comments, or a repository bigger than one page. */
  const [remote, setRemote] = useState<{ query: string; comments: Set<number> } | undefined>();
  const [searchingRepo, setSearchingRepo] = useState(false);
  const [section, setSection] = useState('board');
  /** `open` until somebody asks for the closed ones — screen 04E's first state. */
  const [issueState, setIssueState] = useState<'open' | 'all'>('open');
  /** Which side panel is open, if any. One at a time — three at once is a board
      with no room left on it. */
  const [panel, setPanel] = useState<'none' | 'filters' | 'view'>('none');
  /** 08E, on the right rather than the left, because it is about the results. */
  const [why, setWhy] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [cursor, setCursor] = useState<number | undefined>();
  const [peek, setPeek] = useState<BoardIssue | undefined>();
  /** A key asked for one of the bulk menus — see `useKeys` and screen 05D. */
  const [autoOpen, setAutoOpen] = useState<'assign' | 'label' | 'milestone' | undefined>();

  const [shape, setShape] = useShapePrefs();
  const [meaning, setMeaning] = useMeaningPrefs(repo);
  const view = shape.view;

  const read = useCallback(() => {
    if (frozen) return;
    postMsg({ type: 'dkgh:board', repo, state: issueState });
  }, [repo, frozen, issueState]);

  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg.type === 'dkgh:board:loading') { setLoading(true); return; }
      if (msg.type === 'dkgh:repoMeta:result') { setMeta(msg as unknown as RepoMeta); return; }
      if (msg.type === 'dkgh:searchIssues:loading') { setSearchingRepo(true); return; }
      if (msg.type === 'dkgh:searchIssues:result') {
        setSearchingRepo(false);
        setRemote({
          query: String(msg.query ?? ''),
          comments: new Set((msg.inComments as number[]) ?? []),
        });
        return;
      }
      if (msg.type !== 'dkgh:board:result') return;
      setLoading(false);
      const result = msg as unknown as BoardData;
      if (result.error || result.rateLimit) {
        setFailure({ error: result.error, rateLimit: result.rateLimit });
        return;
      }
      setFailure(undefined);
      setData(result);
    };
    window.addEventListener('message', handler);
    /* The lists a write chooses from, asked once when the board opens rather
       than when a menu is clicked: a bulk bar that spends two seconds fetching
       labels after you press Label is a bulk bar people stop using. */
    if (!frozen) postMsg({ type: 'dkgh:repoMeta', repo });
    return () => window.removeEventListener('message', handler);
  }, [repo, frozen]);

  /* The read itself, on mount and whenever what to read changes. Only here —
     asking in the listener's effect too would fire two of them on every open. */
  useEffect(() => { setLoading(true); read(); }, [read]);

  /*
    Auto-refresh, at the cadence the plan settled on. A refresh is one or two
    API calls against a budget of 5,000 an hour, so 60 seconds costs about 2%.
    Paused while the tab is hidden, while the credential is gone, and while
    GitHub is refusing — a poll that cannot succeed is a poll that only spends
    the budget it is waiting on.
  */
  const limited = !!failure?.rateLimit;
  useEffect(() => {
    if (frozen || limited) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') read();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [frozen, limited, read]);

  /* Stable, because the edit flow re-registers its listener whenever this
     changes and a new function on every render would do that every render. */
  const refresh = useCallback(() => {
    if (frozen) return;
    setLoading(true);
    read();
  }, [frozen, read]);

  /**
   * Ask the host to search the whole repository — screen 08C.
   *
   * Only on request. The everyday search runs here over what the board already
   * holds, which is instant and offline; this one spends an API call, so it
   * happens when somebody widens the scope to comments or says the board is
   * not the whole repository.
   */
  const searchRepo = useCallback(() => {
    const q = filter.search.text.trim();
    if (!q || frozen) return;
    postMsg({ type: 'dkgh:searchIssues', repo, query: q, comments: true });
  }, [filter.search.text, frozen, repo]);
  const flow = useEditFlow(repo, refresh);

  /* Whatever the switch dialog needs to name what is being left behind. */
  useEffect(() => {
    onContext?.({
      search: describeAll(filter),
      dimensions: (data?.dimensions ?? []).map(d => d.dimension),
    });
  }, [filter, data, onContext]);

  /** Dimensions the repository declared, plus the ones GitHub always has. */
  const groupOptions = useMemo(() => [
    ...NATIVE_GROUPS,
    ...(data?.dimensions ?? []).map(d => ({ id: d.dimension, label: cap(d.dimension) })),
  ], [data]);

  /**
   * Who `@me` is, and when now is.
   *
   * Passed in rather than read inside the model so a saved view follows its
   * reader — `-assignee:@me` means something different to whoever opens it,
   * which is the whole point of sharing one.
   */
  const ctx: MatchContext = useMemo(
    () => ({ me: activeAccount(env ?? null)?.login }),
    [env],
  );

  /* Comment hits come from the host; everything else is answered locally. */
  const commentHits = remote?.query === filter.search.text.trim()
    ? remote.comments : undefined;

  const all = data?.issues ?? [];

  /**
   * The facets, then the search — in that order, and it matters.
   *
   * The facet counts are taken over what the search left, so the number beside
   * a value is how many you would get if you ticked it *given what you typed*.
   * Counting them over the whole board would put a number on screen that the
   * next click cannot produce.
   */
  const searched = useMemo(() => {
    const q = filter.search.text.trim();
    if (!q) return all;
    return all.filter(i => !!runSearch(i, filter.search, commentHits));
  }, [all, filter.search, commentHits]);

  const filtered = useMemo(
    () => searched.filter(i => matchesAll(i, filter.terms, ctx)),
    [searched, filter.terms, ctx],
  );

  /** Where each shown issue matched, for the line under it — screen 08C. */
  const hits = useMemo(() => {
    const q = filter.search.text.trim();
    if (!q) return undefined;
    const map = new Map<number, SearchHit>();
    for (const i of filtered) {
      const hit = runSearch(i, filter.search, commentHits);
      if (hit) map.set(i.number, hit);
    }
    return map;
  }, [filtered, filter.search, commentHits]);

  const groups = useMemo(() => groupIssues(filtered, meaning.groupBy), [filtered, meaning.groupBy]);

  /*
    The rows as they read on screen, in that order.

    The keyboard needs it — `j` moves to whatever is visually next, which in the
    table is the sorted order and in the cards is the grouped order — and so
    does shift-click, whose range is "everything between these two as they are
    laid out" rather than "everything between these two issue numbers".
  */
  const ordered = useMemo(() => {
    const cols = arrange(catalogue(data?.dimensions ?? []), shape.columns);
    return groups.flatMap(g => view === 'table'
      ? sortIssues(g.issues, meaning.sort, cols, data?.dimensions ?? [])
      : g.issues);
  }, [groups, view, meaning.sort, shape.columns, data]);

  /* A cursor pointing at an issue that is no longer on the board is a cursor
     pointing at nothing, and every key would then do nothing silently. */
  useEffect(() => {
    if (cursor !== undefined && !ordered.some(i => i.number === cursor)) {
      setCursor(ordered[0]?.number);
    }
  }, [ordered, cursor]);

  /* The selection survives filters and does not survive a repository. */
  useEffect(() => { setSelected(new Set()); setCursor(undefined); }, [repo]);

  const lastPicked = useRef<number | undefined>(undefined);

  const toggle = useCallback((issue: BoardIssue, mods: { ctrl: boolean; shift: boolean }) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (mods.shift && lastPicked.current !== undefined) {
        /* Shift extends across what is on screen in the order it is on screen,
           which is what "between these two" means to somebody looking at it. */
        const from = ordered.findIndex(i => i.number === lastPicked.current);
        const to = ordered.findIndex(i => i.number === issue.number);
        if (from >= 0 && to >= 0) {
          const [a, b] = from < to ? [from, to] : [to, from];
          for (let k = a; k <= b; k++) next.add(ordered[k].number);
          return next;
        }
      }
      if (next.has(issue.number)) next.delete(issue.number);
      else next.add(issue.number);
      return next;
    });
    lastPicked.current = issue.number;
    setCursor(issue.number);
  }, [ordered]);

  const open = useCallback((issue: BoardIssue) => {
    window.open(issue.url, '_blank');
  }, []);

  /** The issues a key acts on: the selection if there is one, else the cursor. */
  const targets = useCallback(() => {
    if (selected.size > 0) return [...selected];
    return cursor === undefined ? [] : [cursor];
  }, [selected, cursor]);

  const propose = useCallback((
    request: EditRequest,
    showsAs?: { field: string; value: string },
  ) => {
    flow.propose(request, showsAs);
  }, [flow]);

  const editCell = useCallback((
    issue: BoardIssue, field: 'assignee' | 'milestone', value: string,
  ) => {
    propose(
      field === 'assignee'
        ? {
            repo,
            numbers: [issue.number],
            /* Replacing, not adding: the cell showed one name and now shows
               another, and leaving the old assignee on would make the cell a
               lie the moment the refresh landed. */
            removeAssignees: issue.assignees,
            addAssignees: [value],
          }
        : { repo, numbers: [issue.number], milestone: value },
      { field, value },
    );
  }, [propose, repo]);

  const searchRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  useKeys({
    enabled: section === 'board' && !showKeys,
    ordered,
    cursor,
    setCursor,
    selected,
    setSelected,
    onOpen: open,
    onPeek: setPeek,
    onHelp: () => setShowKeys(true),
    onSearch: () => searchRef.current?.querySelector('input')?.focus(),
    onFilters: () => setPanel(p => (p === 'filters' ? 'none' : 'filters')),
    onPanel: () => setPanel(p => (p === 'view' ? 'none' : 'view')),
    onAct: (kind) => {
      const numbers = targets();
      if (numbers.length === 0) return;
      if (kind === 'close') {
        propose({ repo, numbers, state: 'close', closeReason: 'completed' });
        return;
      }
      /*
        Acts on the selection if there is one, otherwise on the row under the
        cursor — which means the cursor's row has to become the selection first,
        or the bar it opens would have nothing to act on.
      */
      if (selected.size === 0) setSelected(() => new Set(numbers));
      setAutoOpen(kind);
    },
  });

  /*
    The first read shows the board's shape, not a panel over it.

    A skeleton is the honest thing to draw here: the chrome is already known, so
    only the part that depends on the network looks unknown, and nothing moves
    when the issues land because the cards arrive where their outlines stood.
  */
  const pending = loading && !data;

  /*
    And if the data does not come, THEN the placeholder. Past about eight
    seconds a skeleton stops reassuring and starts looking stuck, and the
    question changes from "how much is coming" to "what is it doing".
  */
  const stuck = useSettledWait(pending, { delayMs: 8000, minMs: 1200 });

  /*
    A read that failed because the repository would not resolve is screen 03B,
    not an empty board. gh says "could not resolve to a Repository" for one that
    does not exist AND for one this account cannot see, which are completely
    different problems — one is a typo, the other is an SSO authorisation thirty
    seconds away.
  */
  const unresolved = !!failure?.error
    && /could not resolve|not found|404|NOT_FOUND|no such/i.test(failure.error);

  const total = all.length;
  const stale = filtered.filter(i => i.quietDays >= QUIET_DAYS).length;
  const unassigned = filtered.filter(i => i.assignees.length === 0).length;
  const [owner, name] = repo.split('/');
  const account = activeAccount(env ?? null);
  const groupLabel = groupOptions.find(g => g.id === meaning.groupBy)?.label ?? 'Nothing';

  /**
   * What is narrowing the board, and what dropping each alone would give back.
   *
   * The counts come from the same evaluator the board uses, so the empty
   * state's "dropping X would show 5" is a promise it can keep rather than an
   * estimate.
   */
  const activeFilters: ActiveFilter[] = [
    ...filter.terms.map(t => {
      const others = filter.terms.filter(x => x !== t);
      const d = describeAll({ terms: [t], search: { text: '', scope: 'body' } });
      return {
        key: `${t.negated ? '-' : ''}${t.field}`,
        label: d,
        wouldShow: searched.filter(i => matchesAll(i, others, ctx)).length,
        drop: () => setFilter(f => dropField(f, t.field)),
      };
    }),
    ...(filter.search.text.trim() ? [{
      key: 'search',
      label: `the search for “${filter.search.text.trim()}”`,
      wouldShow: all.filter(i => matchesAll(i, filter.terms, ctx)).length,
      drop: () => setFilter(f => ({ ...f, search: { ...f.search, text: '' } })),
    }] : []),
    ...(issueState === 'open' && (data?.closedRecently ?? 0) > 0 ? [{
      key: 'state',
      label: 'open only',
      wouldShow: data?.closedRecently ?? 0,
      drop: () => setIssueState('all'),
    }] : []),
  ];

  if (unresolved) {
    return <GhNoAccess repo={repo} onRetry={refresh} onChangeRepo={onChangeRepo} />;
  }

  const showPanel = panel !== 'none' && (view === 'cards' || view === 'table');

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden" ref={boardRef}
         style={{ position: 'relative' }}>

      {/* Head — repository, count, when it was last read */}
      <div className="flex items-center gap-2.5 px-4 pt-3 flex-shrink-0 min-w-0">
        <RepoIcon size={15} style={{ color: ACCENT, flexShrink: 0 }} />
        <span className="text-[13px] font-medium font-mono truncate"
              style={{ color: 'var(--color-text-primary)' }}>
          {owner}<span style={{ color: 'var(--color-text-muted)' }}>/</span>{name}
        </span>
        {pending
          ? <SkeletonView variant="block" width={46} height={15} />
          : <BadgeChipView tone={ACCENT} size="sm">
              {total} {issueState === 'open' ? 'open' : 'issues'}
            </BadgeChipView>}
        <span className="flex-1" />
        <span className="text-[10.5px] font-mono whitespace-nowrap"
              style={{ color: 'var(--color-text-muted)' }}>
          {frozen ? 'paused — signed out'
            : limited ? 'paused — rate limited'
            : pending ? 'reading...'
            : loading ? 'refreshing...'
            : `auto 60s · refreshed ${since(data?.fetchedAt)}`}
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
        <div className="flex-1" style={{ minWidth: 180 }} ref={searchRef}>
          <SearchFieldView
            value={filter.search.text}
            onChange={text => setFilter(f => ({ ...f, search: { ...f.search, text } }))}
            onClear={() => setFilter(f => ({ ...f, search: { ...f.search, text: '' } }))}
            placeholder="Search issues"
            size="sm"
            accentColor={ACCENT}
            width="100%"
          />
        </div>
        <TogglePillView
          icon={<FilterIcon size={11} />}
          accentColor={ACCENT}
          active={panel === 'filters'}
          count={filter.terms.length || undefined}
          title="Every facet, with a live count"
          onClick={() => setPanel(p => (p === 'filters' ? 'none' : 'filters'))}
        >
          Filters
        </TogglePillView>
        <TogglePillView
          icon={view === 'table' ? <ColumnsIcon size={11} /> : <LayoutGridIcon size={11} />}
          accentColor={ACCENT}
          active={panel === 'view'}
          title={view === 'table'
            ? 'Columns, their order, and how long values behave'
            : 'Grouping, density, and what is on each card'}
          onClick={() => setPanel(p => (p === 'view' ? 'none' : 'view'))}
        >
          {view === 'table' ? 'Columns' : 'Options'}
        </TogglePillView>
        {VIEWS.map(v => (
          <TogglePillView
            key={v.id}
            icon={v.icon}
            accentColor={ACCENT}
            active={view === v.id}
            disabled={!v.ready}
            title={v.ready ? undefined : `${v.label} is not built yet`}
            onClick={() => setShape({ view: v.id as typeof shape.view })}
          >
            {v.label}
          </TogglePillView>
        ))}
        <TogglePillView accentColor={ACCENT} active={meaning.groupBy !== 'none'}
                        onClick={() => setPanel('view')}>
          Group: {groupLabel}
        </TogglePillView>
        <TogglePillView icon={<DownloadIcon size={11} />} accentColor={ACCENT} disabled
                        title="Export writes exactly these columns, in this order — screen 15">
          Export
        </TogglePillView>
        <IconButtonView icon={<KeyboardIcon size={12} />} tooltip="Keys"
                        accentColor="var(--color-text-muted)"
                        onClick={() => setShowKeys(true)} />
      </div>

      {/* What is filtering the list right now, in words — and the query behind it */}
      <GhChips
        state={filter}
        onChange={setFilter}
        explaining={why}
        onExplain={() => setWhy(w => !w)}
      />

      {/* What the box is actually searching — screen 08C */}
      <GhSearchScope
        state={filter}
        onChange={setFilter}
        loaded={all.length}
        truncated={data?.truncated}
        onSearchRepo={searchRepo}
        searching={searchingRepo}
      />

      {/* Selection, and the command it is about to run */}
      {selected.size > 0 && (
        <GhBulkBar
          repo={repo}
          selected={[...selected]}
          total={filtered.length}
          meta={meta}
          autoOpen={autoOpen}
          onAutoOpened={() => setAutoOpen(undefined)}
          onSelectAll={() => setSelected(new Set(filtered.map(i => i.number)))}
          onClear={() => setSelected(new Set())}
          onPropose={propose}
        />
      )}
      <GhEditConfirm flow={flow} />

      {/* A read that failed while there is still a board worth reading */}
      {failure && filtered.length > 0 && (
        <div className="px-4 flex-shrink-0">
          <CalloutView
            variant="warning"
            title={failure.rateLimit ? 'GitHub is rate-limiting us' : 'The last refresh failed'}
            style={{ margin: '8px 0 0' }}
          >
            {failure.rateLimit
              ? `${failure.rateLimit.remaining} of ${failure.rateLimit.limit} requests left. `
                + `Auto-refresh has stopped and will work again ${until(failure.rateLimit.resetAt)}, `
                + `at ${atClock(failure.rateLimit.resetAt)}. The board below is from `
                + `${since(data?.fetchedAt)}.`
              : `${failure.error} The board below is from ${since(data?.fetchedAt)}.`}
          </CalloutView>
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

      {/* The board */}
      <div className="flex-1 flex min-h-0 min-w-0">
        {panel === 'filters' && (
          <GhFilters
            /* Counted over what the search left, so the number beside a value
               is how many you would get if you ticked it given what you typed. */
            issues={searched}
            dimensions={data?.dimensions ?? []}
            state={filter}
            onChange={setFilter}
            ctx={ctx}
          />
        )}
        {showPanel && panel === 'view' && (view === 'table' ? (
          <GhColumnPanel
            dimensions={data?.dimensions ?? []}
            columns={shape.columns}
            onColumns={columns => setShape({ columns })}
            wrapTitles={shape.wrapTitles}
            onWrapTitles={wrapTitles => setShape({ wrapTitles })}
          />
        ) : (
          <GhCardOptions
            issues={filtered}
            dimensions={data?.dimensions ?? []}
            groupBy={meaning.groupBy}
            onGroupBy={groupBy => setMeaning({ groupBy })}
            cardFields={shape.cardFields}
            onCardFields={cardFields => setShape({ cardFields: cardFields as CardField[] })}
            density={shape.density}
            onDensity={density => setShape({ density })}
            view={view}
          />
        ))}

        <div className="flex-1 min-h-0 min-w-0"
             style={{ overflow: view === 'table' && !pending ? 'hidden' : 'auto' }}>
          {pending ? (
            <div className="px-4 pt-3 pb-4">
              {stuck
                ? <GhBoardStalled repo={repo} onChangeRepo={onChangeRepo} />
                : <BoardSkeleton view={view} />}
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 pt-3 pb-4">
              <GhBoardEmpty
                repo={repo}
                total={total}
                closedRecently={data?.closedRecently}
                filters={activeFilters}
                rateLimit={failure?.rateLimit}
                staleAt={data?.fetchedAt}
                error={failure?.error}
                onClearAll={() => activeFilters.forEach(f => f.drop())}
                onShowClosed={issueState === 'open' ? () => setIssueState('all') : undefined}
                onRetry={refresh}
              />
            </div>
          ) : view === 'cards' ? (
            <div className="px-4 pt-3 pb-4">
              <GhCards
                groups={groups}
                showGroups={meaning.groupBy !== 'none'}
                fields={shape.cardFields}
                density={shape.density}
                dimensions={data?.dimensions ?? []}
                selected={selected}
                onToggle={toggle}
                onOpen={open}
                cursor={cursor}
                hits={hits}
              />
            </div>
          ) : (
            <GhIssueTable
              groups={groups}
              showGroups={meaning.groupBy !== 'none'}
              dimensions={data?.dimensions ?? []}
              columns={shape.columns}
              density={shape.density}
              wrapTitles={shape.wrapTitles}
              sort={meaning.sort}
              onSort={sort => setMeaning({ sort })}
              selected={selected}
              onToggle={toggle}
              onOpen={open}
              cursor={cursor}
              meta={meta}
              onEdit={editCell}
              pending={flow.optimistic}
              hits={hits}
              renderHeader={(g: Group) => <Header group={g} dimensions={data?.dimensions ?? []} />}
            />
          )}
        </div>

        {/* 08E, on the right — it is about the results, not about the controls */}
        {why && !pending && (
          <GhWhy
            all={all}
            shown={filtered}
            state={filter}
            onChange={setFilter}
            ctx={ctx}
            onClose={() => setWhy(false)}
          />
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 px-4 py-2 text-[10.5px] flex-shrink-0"
           style={{ borderTop: '1px solid var(--color-surface-border)', color: 'var(--color-text-muted)' }}>
        <span>
          {pending ? 'reading the repository'
            : `${filtered.length}${filtered.length !== total ? ` of ${total}` : ''} shown`}
        </span>
        <span style={{ opacity: 0.5 }}>·</span>
        <GhKeyStatus selected={[...selected]} cursor={cursor} />
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

      {peek && <GhPeek repo={repo} issue={peek} onOpen={i => { setPeek(undefined); open(i); }} />}
      {showKeys && <GhKeys onClose={() => setShowKeys(false)} />}
    </div>
  );
}

// ── The keys ────────────────────────────────────────────────────────────────

/**
 * `j`, `k`, `Space` and the rest — screen 05D.
 *
 * Bound on the window rather than on a focused element, because the board has
 * no single thing to focus and a table that only answers the keyboard after you
 * have clicked a row is a table nobody discovers the keyboard on. Anything
 * typed into a real field is left alone, which is what the first check is.
 */
function useKeys({
  enabled, ordered, cursor, setCursor, selected, setSelected,
  onOpen, onPeek, onHelp, onSearch, onPanel, onFilters, onAct,
}: {
  enabled: boolean;
  ordered: BoardIssue[];
  cursor?: number;
  setCursor: (n: number | undefined) => void;
  selected: Set<number>;
  setSelected: (fn: (prev: Set<number>) => Set<number>) => void;
  onOpen: (issue: BoardIssue) => void;
  onPeek: (issue: BoardIssue | undefined) => void;
  onHelp: () => void;
  onSearch: () => void;
  onPanel: () => void;
  onFilters: () => void;
  onAct: (kind: 'assign' | 'label' | 'milestone' | 'close') => void;
}) {
  const held = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return;

    const at = () => ordered.findIndex(i => i.number === cursor);
    const move = (by: 1 | -1, extend: boolean) => {
      if (ordered.length === 0) return;
      const now = at();
      const next = now < 0 ? 0 : Math.min(ordered.length - 1, Math.max(0, now + by));
      const issue = ordered[next];
      setCursor(issue.number);
      if (extend) setSelected(prev => new Set(prev).add(issue.number));
    };

    const down = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      /* Never steal a key from something somebody is typing into. */
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (target?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const current = ordered.find(i => i.number === cursor);

      switch (e.key) {
        case 'j': case 'ArrowDown': move(1, e.shiftKey); break;
        case 'k': case 'ArrowUp': move(-1, e.shiftKey); break;
        case 'Enter': if (current) onOpen(current); break;
        case 'o': if (current) onOpen(current); break;
        case 'a': onAct('assign'); break;
        case 'l': onAct('label'); break;
        case 'm': onAct('milestone'); break;
        case 'c': onAct('close'); break;
        case 'g': onPanel(); break;
        case 'f': onFilters(); break;
        case '/': onSearch(); break;
        case '?': onHelp(); break;
        case 'Escape': setSelected(() => new Set()); onPeek(undefined); break;
        case ' ':
          /*
            Space is two things separated by the hold: tapped it selects,
            held it peeks. The timer starts here and the keyup decides which
            happened, which is why nothing is done on the way down.
          */
          if (!current || held.current !== undefined) break;
          held.current = window.setTimeout(() => {
            held.current = -1;
            onPeek(current);
          }, PEEK_HOLD_MS);
          break;
        default: return;
      }
      if (e.key !== 'Escape' || selected.size > 0) e.preventDefault();
    };

    const up = (e: KeyboardEvent) => {
      if (e.key !== ' ') return;
      const timer = held.current;
      held.current = undefined;
      if (timer === undefined) return;
      if (timer === -1) { onPeek(undefined); return; }
      window.clearTimeout(timer);
      const current = ordered.find(i => i.number === cursor);
      if (current) setSelected(prev => {
        const next = new Set(prev);
        if (next.has(current.number)) next.delete(current.number);
        else next.add(current.number);
        return next;
      });
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      if (typeof held.current === 'number' && held.current > 0) window.clearTimeout(held.current);
    };
  }, [enabled, ordered, cursor, selected, setCursor, setSelected,
      onOpen, onPeek, onHelp, onSearch, onPanel, onFilters, onAct]);
}

// ── While it reads ──────────────────────────────────────────────────────────

/**
 * The board's shape, before the board.
 *
 * Six cards rather than a number chosen to match: nobody knows how many issues
 * are coming, and a skeleton that promises twelve and delivers three is a worse
 * lie than one that plainly stands for "some". The widths vary so it reads as a
 * list of different things rather than a printed pattern.
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
