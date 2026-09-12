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
  ButtonView, CalloutView, EmptyStateView, SplitPanelView,
  IssueCardSkeletonView, TableSkeletonView,
} from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { useSettledWait } from '../../hooks/useSettledWait';
import {
  RefreshIcon, LayoutGridIcon, TableIcon, IssueOpenedIcon, RepoIcon, PlusIcon,
  ChartBarIcon, ColumnsIcon, TimelineIcon, FilterIcon, DownloadIcon, KeyboardIcon,
  TagIcon, ClockIcon, SaveIcon, SettingsIcon,
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
  EMPTY as EMPTY_FILTER, describeAll, dropField, except, formatQuery, labelsOf,
  matchesAll, only, runSearch, type FilterState, type MatchContext, type SearchHit,
} from './filter-model';
/**
 * What the per-view menu can ask for.
 *
 * It lived in `GhViewBar` until the bar became a segmented strip with no room
 * for a menu of its own. The verbs did not go away with it — see `GhMenu`.
 */
export type ViewAction =
  | 'rename' | 'duplicate' | 'copy-query' | 'share' | 'chart' | 'export' | 'delete';
import { GhSaveView } from './GhSaveView';
import { GhManageViews } from './GhManageViews';
import { GhShareView } from './GhShareView';
import { GhChart } from './GhChart';
import { GhCompose } from './GhCompose';
import { GhReview } from './GhReview';
import { GhIssue } from './GhIssue';
import { useScheduleRunner, rowsFor, type RunFailure } from './schedule-runner';
import { GhCopyMap } from './GhCopyMap';
import { loadFieldMap, merged, saveFieldMap, type MapField } from './field-map';
import { GhExport } from './GhExport';
import { GhInsights } from './GhInsights';
import { GhTeam } from './GhTeam';
import { GhAvatar } from './GhAvatar';
import { GhRepository } from './GhRepository';
import { GhImport } from './GhImport';
import { openExternal } from './open-external';
import { GhLabels } from './GhLabels';
import { useToastStore } from '../../store/toast-store';
import { GhColumns, GhColumnControls, type Move } from './GhColumns';
import { GhRoadmap, type Reschedule, type Scale } from './GhRoadmap';
import {
  absentBecause, changedSince, dateFields, projectDimensions, recordSlips, useProject,
  withProject, type Elsewhere, type ProjectField, type Slip,
} from './project-store';
import { Ico, type IcoName } from './GhIcons';
import {
  assembleBody, discardDraft, emptyDraft, type Draft,
} from './composer-model';
import { colourMap } from './field-colour';
import {
  capture, countFor, describeDiff, diffView, loadViews, orderedViews, saveViews,
  type BoardSnapshot, type CapturePart, type SavedView, type StoredViews,
} from './views-model';
import { GhPeek } from './GhPeek';
import { useBoardMenu } from './GhMenu';
import { GhKeys, GhKeyStatus, PEEK_HOLD_MS } from './GhKeys';
import { useEditFlow, type EditRequest } from './edit-flow';
import { useShapePrefs, useMeaningPrefs, type CardField } from './board-prefs';
import { arrange, catalogue } from './table-columns';
import {
  QUIET_DAYS, NATIVE_GROUPS, cap, groupIssues,
  type BoardData, type BoardIssue, type Group,
} from './board-types';
import { since, until, atClock } from './format';
import { ACCENT, activeAccount, hasScope, type GhEnv, type RepoMeta } from './types';
import { isPlainKeyInField } from '../../utils/typing-target';

/** The four sections of the tab, in the order a lead uses them. */
const SECTIONS: { id: string; label: string; icon: IcoName; disabled?: boolean }[] = [
  { id: 'board', label: 'Board', icon: 'board' },
  /* Between the board and filing: "who has what" is the question asked
     immediately after "what is the state of this", and before anybody writes
     anything new. */
  { id: 'team', label: 'Team', icon: 'person' },
  { id: 'new', label: 'New issue', icon: 'plus' },
  { id: 'insights', label: 'Insights', icon: 'chart' },
  { id: 'repository', label: 'Repository', icon: 'repo' },
];

/** The views the mock lays out, with the two that are built marked. */
const VIEWS: { id: string; label: string; icon: IcoName; ready: boolean }[] = [
  { id: 'cards', label: 'Cards', icon: 'cards', ready: true },
  { id: 'table', label: 'Table', icon: 'table', ready: true },
  { id: 'columns', label: 'Columns', icon: 'board', ready: true },
  { id: 'roadmap', label: 'Roadmap', icon: 'tl', ready: true },
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
  /** The issue screen 14 is showing, and what Back returns from. */
  const [viewing, setViewing] = useState<BoardIssue | undefined>();
  /** How far back screen 16's weekly chart looks. */
  const [weeks, setWeeks] = useState(12);
  /** Re-read the Project after a drag writes to it. */
  const [projectRead, setProjectRead] = useState(0);
  /** 06 — which single-select the columns are, and what colours the cards. */
  const [columnField, setColumnField] = useState('');
  const [colourBy, setColourBy] = useState('');
  /** 06C — the lanes, and 06D — the columns put away. */
  const [laneBy, setLaneBy] = useState('');
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [wip, setWip] = useState(0);
  /** 06E — what moved on GitHub between two reads, and 07E's own record. */
  const [elsewhere, setElsewhere] = useState<Elsewhere[]>([]);
  const [slips, setSlips] = useState<Slip[]>([]);
  /** The issues this session wrote to, which is what makes a change a conflict. */
  const touched = useRef<Set<number>>(new Set());
  const lastProject = useRef<typeof project>(null);
  /** 07 — how wide the roadmap's window is. */
  const [scale, setScale] = useState<Scale>('month');
  /** Issues with a Project write in flight, and what it is writing. */
  const [writing, setWriting] = useState<Map<number, string>>(new Map());

  /*
    The linked Project.

    Asked for separately from the board: a repository with no project is the
    ordinary case and should not pay a GraphQL call on every refresh to find
    that out again. The board renders without it and gains Status, Priority and
    the dates when it answers — see project-store.
  */
  const addToast = useToastStore(t => t.addToast);
  const project = useProject(repo, projectRead);

  /*
    06E and 07E, both off the same pair of reads.

    A change is only news if this session saw the value before it changed — so
    the comparison is against the previous read rather than against a clock,
    and the first read of a repository reports nothing, which is right.
  */
  useEffect(() => {
    if (!project?.id) return;
    const before = lastProject.current;
    lastProject.current = project;
    if (!before || before.repo !== project.repo) { setSlips(recordSlips(repo, null, project)); return; }
    setElsewhere(changedSince(before, project, touched.current));
    setSlips(recordSlips(repo, before, project));
  }, [project, repo]);

  /** The single-selects the columns can be, and the dates a roadmap can use. */
  const columnFields = useMemo(
    () => (project?.fields ?? []).filter(f => f.dataType === 'SINGLE_SELECT'
      && !['title', 'repository'].includes(f.name.toLowerCase())),
    [project],
  );
  const columnOn: ProjectField | undefined =
    columnFields.find(f => f.name === columnField)
    ?? columnFields.find(f => /status/i.test(f.name))
    ?? columnFields[0];
  const dates = useMemo(() => dateFields(project), [project]);
  const startField = dates.find(f => /start/i.test(f.name)) ?? dates[0];
  const endField = dates.find(f => /target|due|eta|end/i.test(f.name))
    ?? dates.find(f => f !== startField);

  /*
    06A / 07A — the card moves first and the write follows.

    A board that waits for a round trip before moving anything feels broken;
    one that moves and never checks is lying. So the value is written into the
    board's own copy immediately, the command runs, and a failure puts it back
    with the reason attached.
  */
  const writeProject = useCallback((
    issue: BoardIssue, field: ProjectField, value: string, optionId?: string,
  ) => {
    const item = project?.items.find(i => i.number === issue.number);
    if (!project?.id || !item) return;

    /* Touched by this session, which is what turns somebody else's change on
       the same card into a conflict rather than an update. */
    touched.current.add(issue.number);
    setWriting(prev => new Map(prev).set(issue.number, `${field.name} = ${value}`));
    const done = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg.type !== 'dkgh:applyProject:result') return;
      window.removeEventListener('message', done);
      setWriting(prev => {
        const next = new Map(prev);
        next.delete(issue.number);
        return next;
      });
      const failed = ((msg.outcomes as { number: number; ok: boolean; error?: string }[]) ?? [])
        .find(o => !o.ok);
      if (failed) {
        addToast({ type: 'error', message: `#${failed.number}: ${failed.error}` });
      }
      /* Right or wrong, the Project is re-read — the board's copy was a claim
         and this is the answer. */
      setProjectRead(n => n + 1);
    };
    window.addEventListener('message', done);
    postMsg({
      type: 'dkgh:applyProject',
      projectId: project.id,
      edits: [{
        itemId: item.id,
        number: issue.number,
        field,
        ...(optionId ? { option: { id: optionId, name: value } } : { date: value }),
      }],
    });
  }, [project, addToast]);

  /*
    Archive or remove one card — the `…` on the issue's title.

    The same road as a drag: the host plans it, the confirm bar shows the exact
    `gh project item-archive` / `item-delete`, and only then does it run. The
    scope is not checked here — `GhIssueMenu` draws the two entries greyed with
    the grant command when the token cannot do it, which is earlier and more
    useful than a 403 after the fact.
  */
  const projectItem = useCallback((
    what: 'archive' | 'remove', itemId: string, number: number,
  ) => {
    if (!project?.id) return;
    const done = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg.type !== 'dkgh:applyProject:result') return;
      window.removeEventListener('message', done);
      const failed = ((msg.outcomes as { number: number; ok: boolean; error?: string }[]) ?? [])
        .find(o => !o.ok);
      if (failed) addToast({ type: 'error', message: `#${failed.number}: ${failed.error}` });
      setProjectRead(n => n + 1);
    };
    window.addEventListener('message', done);
    postMsg({ type: 'dkgh:applyProjectItem', projectId: project.id, itemId, number, what });
  }, [project, addToast]);

  /** The repository's own, plus whatever the Project adds. */
  /* 17E — a map copied from another repository, if one was. */
  const [copiedMap, setCopiedMap] = useState<MapField[]>(() => loadFieldMap(repo));
  const [copyingMap, setCopyingMap] = useState(false);
  /* The repositories dkgh already knows, which are the ones worth offering as
     a source. Asked for only when the dialog opens: it is a settings read the
     board has no other use for. */
  const [known, setKnown] = useState<string[]>([]);
  useEffect(() => {
    if (!copyingMap) return;
    const onMsg = (e: MessageEvent) => {
      const msg = e.data as Record<string, unknown>;
      if (msg?.type !== 'dkgh:repoOptions:result') return;
      const rows = [
        ...((msg.pinned as { repo?: string }[]) ?? []),
        ...((msg.recent as { repo?: string }[]) ?? []),
      ];
      setKnown([...new Set(rows.map(r => r.repo).filter((x): x is string => !!x))]);
    };
    window.addEventListener('message', onMsg);
    postMsg({ type: 'dkgh:repoOptions' });
    return () => window.removeEventListener('message', onMsg);
  }, [copyingMap]);

  const dimensions = useMemo(() => {
    const fromForms = data?.dimensions ?? [];
    const known = new Set(fromForms.map(d => d.dimension));
    const all = [
      ...fromForms,
      ...projectDimensions(project).filter(d => !known.has(d.dimension)),
    ];
    return merged(all, copiedMap);
  }, [data?.dimensions, project, copiedMap]);

  /** `open` until somebody asks for the closed ones — screen 04E's first state. */
  const [issueState, setIssueState] = useState<'open' | 'all'>('open');
  /** Which side panel is open, if any. One at a time — three at once is a board
      with no room left on it. */
  const [panel, setPanel] = useState<'none' | 'filters' | 'view'>('none');
  /** 08E, on the right rather than the left, because it is about the results. */
  const [why, setWhy] = useState(false);
  /* Screen 09 — the views, and the four dialogs that hang off them. */
  const [views, setViews] = useState<StoredViews>(() => loadViews(repo));
  const [activeView, setActiveView] = useState<string | undefined>();
  const [saving, setSaving] = useState<{ existing?: SavedView } | undefined>();
  const [managing, setManaging] = useState(false);
  const [sharing, setSharing] = useState<{ view?: SavedView } | undefined>();
  const [charting, setCharting] = useState<SavedView | 'board' | undefined>();
  const [showKeys, setShowKeys] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [cursor, setCursor] = useState<number | undefined>();
  const [peek, setPeek] = useState<BoardIssue | undefined>();
  /*
    How the peek was opened, because it decides how it closes. Held with Space
    it needs no close — letting go is the close, and drawing an X and a backdrop
    for something that lives for four seconds would flicker on every hold.
    Chosen from the right-click menu there is nothing being held, so it gets the
    X, Escape and the backdrop that every other dialog here answers to.
  */
  const [peekHeld, setPeekHeld] = useState(false);
  /** A key asked for one of the bulk menus — see `useKeys` and screen 05D. */
  const [autoOpen, setAutoOpen] = useState<'assign' | 'label' | 'milestone' | undefined>();
  /**
   * The composer's draft, held here rather than inside it.
   *
   * The composer and the review screen are two views of one draft, and the tab
   * moves between them — so the draft outlives both, and going back to the
   * board and returning does not lose what was written.
   */
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(repo));

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
      dimensions: dimensions.map(d => d.dimension),
    });
  }, [filter, dimensions, onContext]);

  /** Dimensions the repository declared, plus the ones GitHub always has. */
  const groupOptions = useMemo(() => [
    ...NATIVE_GROUPS,
    ...dimensions.map(d => ({ id: d.dimension, label: cap(d.dimension) })),
  ], [dimensions]);

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

  /** The declared spelling of every form value, so chips agree with the board. */
  const labels = useMemo(() => labelsOf(dimensions), [data]);
  /** Every dimension value's colour, by the option's index in its own dropdown. */
  const colours = useMemo(() => colourMap(dimensions), [data]);

  /**
   * Everything a view can freeze, as it stands right now.
   *
   * Assembled in one place so the save dialog, the diff and the chart all read
   * the same board — three of them each reaching for their own pieces is how
   * "unsaved changes" starts disagreeing with what the dialog would save.
   */
  const snapshot: BoardSnapshot = useMemo(() => ({
    filters: filter,
    layout: { view: shape.view, density: shape.density },
    grouping: meaning.groupBy,
    sort: meaning.sort,
    columns: shape.columns,
  }), [filter, shape.view, shape.density, shape.columns, meaning.groupBy, meaning.sort]);

  /* Comment hits come from the host; everything else is answered locally. */
  const commentHits = remote?.query === filter.search.text.trim()
    ? remote.comments : undefined;

  /*
    The board's issues, with the Project's fields folded into their dimensions.

    Merged here rather than beside them, because everything downstream — the
    facets, the grouping, the colours, the chart, the export, the columns view
    — already speaks dimension. A project field that arrived as its own
    parallel concept would need all six taught about it.
  */
  const all = useMemo(
    () => withProject(data?.issues ?? [], project),
    [data?.issues, project],
  );

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
    const cols = arrange(catalogue(dimensions), shape.columns, shape.pinnedColumns);
    return groups.flatMap(g => view === 'table'
      ? sortIssues(g.issues, meaning.sort, cols, dimensions)
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

  /**
   * Open one issue — here, not in a browser tab.
   *
   * It used to be `window.open`, which is the one move that takes somebody out
   * of the tab they came to for triage. Screen 14 is the whole issue, and the
   * external link is still one click away on the page itself and on the
   * right-click menu, where somebody asking for github.com asks for it.
   */
  const open = useCallback((issue: BoardIssue) => {
    setViewing(issue);
    setSection('issue');
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

  // ── Screen 09 — the views ────────────────────────────────────────────────

  /* A different repository has different views; re-read rather than carry.
     A draft belongs to the repository it was written against, too. */
  useEffect(() => {
    setViews(loadViews(repo));
    setActiveView(undefined);
    setDraft(emptyDraft(repo));
  }, [repo]);

  const persist = useCallback((next: StoredViews) => {
    setViews(next);
    saveViews(repo, next);
  }, [repo]);

  const shownViews = useMemo(() => orderedViews(views), [views]);

  /*
    15E. A scheduled run comes due on the host's clock and lands here, because
    this is where the rows and the saved views are. It writes a file and says
    nothing; the only thing that reaches the screen is a failure.
  */
  const [runFailed, setRunFailed] = useState<RunFailure | undefined>();
  useScheduleRunner({
    repo,
    all,
    views: shownViews,
    dimensions,
    query: describeAll(filter),
    onFailed: setRunFailed,
  });
  const active = shownViews.find(v => v.id === activeView);

  /** How many each view holds right now, for the number on its tab. */
  const viewCounts = useMemo(() => {
    const out = new Map<string, number>();
    for (const v of views.views) out.set(v.id, countFor(v, all, ctx));
    return out;
  }, [views, all, ctx]);

  /**
   * What has changed since this view was opened — screen 09B.
   *
   * Computed rather than tracked. A flag set on every edit drifts the moment
   * something is changed back by hand, and then the bar nags about a view that
   * matches what is saved.
   */
  const viewDiff = useMemo(
    () => (active ? diffView(active, snapshot) : undefined),
    [active, snapshot],
  );

  /** Put a view on screen. Nothing it did not capture is touched. */
  const openView = useCallback((id: string | undefined) => {
    setActiveView(id);
    const v = views.views.find(x => x.id === id);
    if (!v) return;
    const c = v.capture;
    if (c.filters) {
      setFilter(f => ({
        terms: c.filters!.terms,
        search: { ...f.search, text: c.searchText ?? '' },
      }));
    } else if (c.searchText !== undefined) {
      setFilter(f => ({ ...f, search: { ...f.search, text: c.searchText! } }));
    }
    if (c.layout) setShape({ view: c.layout.view, density: c.layout.density });
    if (c.columns) setShape({ columns: c.columns });
    if (c.grouping !== undefined) setMeaning({ groupBy: c.grouping });
    if (c.sort) setMeaning({ sort: c.sort });
  }, [views, setShape, setMeaning]);

  /** The first thing the board shows, when a view was pinned as the default. */
  const openedDefault = useRef(false);
  useEffect(() => {
    if (openedDefault.current || !views.defaultId || !data) return;
    openedDefault.current = true;
    openView(views.defaultId);
  }, [views.defaultId, data, openView]);

  const saveView = useCallback((name: string, icon: string, parts: Set<CapturePart>) => {
    const existing = saving?.existing;
    const next: SavedView = {
      id: existing?.id ?? `v${Date.now().toString(36)}`,
      name,
      icon,
      preset: existing?.preset,
      capture: capture(snapshot, parts),
    };
    persist({
      ...views,
      views: existing
        ? views.views.map(v => (v.id === existing.id ? next : v))
        : [...views.views, next],
    });
    setActiveView(next.id);
    setSaving(undefined);
  }, [saving, snapshot, views, persist]);

  const onViewAction = useCallback((view: SavedView, action: ViewAction) => {
    switch (action) {
      case 'rename':
        setActiveView(view.id);
        setSaving({ existing: view });
        break;
      case 'duplicate':
        persist({
          ...views,
          views: [...views.views, {
            ...view,
            id: `v${Date.now().toString(36)}`,
            name: `${view.name} copy`,
            preset: undefined,
          }],
        });
        break;
      case 'copy-query':
        navigator.clipboard?.writeText(
          formatQuery(view.capture.filters ?? EMPTY_FILTER),
        );
        break;
      case 'share': setSharing({ view }); break;
      case 'chart': setCharting(view); break;
      case 'export': setSharing({ view }); break;
      case 'delete':
        /* A preset is hidden rather than deleted — it is not the reader's to
           throw away, and Restore brings it back. */
        if (view.preset) {
          persist({
            ...views,
            views: views.views.map(v => (v.id === view.id ? { ...v, hidden: true } : v)),
          });
        } else {
          setManaging(true);
        }
        break;
    }
  }, [views, persist]);

  const searchRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  /*
    What a key does, said once so the right-click menu can say it too.

    The keyboard's rule is that an action takes the selection if there is one
    and the cursor's row otherwise. A menu opened on a particular issue knows
    something the keyboard does not — which row was clicked — so it passes the
    numbers in, and this is the one place that turns a kind and a set of numbers
    into the thing that happens. Two callers, one behaviour; a second copy of
    this logic is how a menu ends up closing a different issue than the key.
  */
  const act = useCallback((
    kind: 'assign' | 'label' | 'milestone' | 'close', numbers: number[],
  ) => {
    if (numbers.length === 0) return;
    if (kind === 'close') {
      propose({ repo, numbers, state: 'close', closeReason: 'completed' });
      return;
    }
    /*
      The bulk bar acts on the selection, so a menu opened on an unselected row
      has to make that row the selection first or the bar it opens would have
      nothing to act on.
    */
    setSelected(() => new Set(numbers));
    setAutoOpen(kind);
  }, [propose, repo]);

  const menu = useBoardMenu({
    repo,
    issueAt: n => all.find(i => i.number === n),
    selected,
    /* Chosen from a menu: nothing is being held, so it gets a way out. */
    onPeek: next => { setPeekHeld(false); setPeek(next); },
    /*
      The menu item says "Open on github.com" and has to mean it.

      `open` used to be `window.open` and now opens screen 14 inside the tab,
      so wiring the menu to it made that item quietly do something else — and
      `window.open` would have done nothing at all in the shipped extension.
    */
    onOpenExternal: (issue: BoardIssue) => openExternal(issue.url),
    onSelect: issue => toggle(issue, { ctrl: true, shift: false }),
    onAct: act,

    views: shownViews,
    activeView,
    defaultViewId: views.defaultId,
    onOpenView: openView,
    onEditView: v => setSaving({ existing: v }),
    onDefaultView: v => persist({
      ...views,
      defaultId: views.defaultId === v.id ? undefined : v.id,
    }),
    onDeleteView: v => persist(v.preset
      ? { ...views, views: views.views.map(x => (x.id === v.id ? { ...x, hidden: true } : x)) }
      : {
        ...views,
        views: views.views.filter(x => x.id !== v.id),
        defaultId: views.defaultId === v.id ? undefined : views.defaultId,
      }),
    onDuplicateView: v => onViewAction(v, 'duplicate'),
    onCopyViewQuery: v => onViewAction(v, 'copy-query'),
    onShareView: v => onViewAction(v, 'share'),
    onChartView: v => onViewAction(v, 'chart'),
    onNewView: () => setSaving({}),
    onManageViews: () => setManaging(true),

    sectionLabel: id => SECTIONS.find(x => x.id === id)?.label ?? id,
    onSection: setSection,

    onOnly: (field, value) => setFilter(f => only(f, field, value)),
    onExcept: (field, value) => setFilter(f => except(f, field, value)),
    onClearField: field => setFilter(f => dropField(f, field)),
    onClearFilters: () => setFilter(f => ({ terms: [], search: { ...f.search, text: '' } })),
    hasFilters: filter.terms.length > 0 || !!filter.search.text.trim(),
    query: formatQuery(filter),

    columnLabel: key => catalogue(dimensions).find(c => c.key === key)?.label ?? key,
    isPinned: key => shape.pinnedColumns.includes(key),
    onSort: (key, dir) => setMeaning({ sort: [{ key, dir }] }),
    onPinColumn: key => setShape({
      pinnedColumns: shape.pinnedColumns.includes(key)
        ? shape.pinnedColumns.filter(k => k !== key)
        : [...shape.pinnedColumns, key],
    }),
    onHideColumn: key => setShape({ columns: shape.columns.filter(k => k !== key) }),

    onRefresh: refresh,
    onPanel: next => setPanel(p => (p === next ? 'none' : next)),
    onKeys: () => setShowKeys(true),
  });

  useKeys({
    enabled: section === 'board' && !showKeys,
    ordered,
    cursor,
    setCursor,
    selected,
    setSelected,
    onOpen: open,
    /* Held with Space: letting go is the close. */
    onPeek: next => { setPeekHeld(true); setPeek(next); },
    onHelp: () => setShowKeys(true),
    onSearch: () => searchRef.current?.querySelector('input')?.focus(),
    onFilters: () => setPanel(p => (p === 'filters' ? 'none' : 'filters')),
    onPanel: () => setPanel(p => (p === 'view' ? 'none' : 'view')),
    /* The selection if there is one, otherwise the row under the cursor. */
    onAct: kind => act(kind, targets()),
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

  /*
    Screen 14 takes the whole tab, head included.

    It draws its own — the repository, this issue's state, and the way back —
    because a board's head above one issue would be a filter row filtering
    nothing, and the sub-tabs would offer four places none of which is where
    the reader is.
  */
  /*
    Screen 15 takes the tab the same way screen 14 does.

    It is about the rows the board is showing, not about the board — and a
    filter row above an export screen is a filter row that changes what the
    export would write without saying so.
  */
  if (section === 'export') {
    return (
      <GhExport
        repo={repo}
        view={active?.name ?? (filter.terms.length ? 'filtered' : 'all open')}
        rows={filtered}
        selected={filtered.filter(i => selected.has(i.number))}
        everything={all}
        columns={shape.columns}
        groupBy={meaning.groupBy === 'none' ? undefined : meaning.groupBy}
        dimensions={dimensions}
        query={describeAll(filter)}
        onClose={() => setSection('board')}
      />
    );
  }

  if (section === 'issue' && viewing) {
    return (
      <GhIssue
        repo={repo}
        issue={all.find(i => i.number === viewing.number) ?? viewing}
        dimensions={dimensions}
        closed={all.filter(i => i.state === 'CLOSED')}
        all={all}
        end={endField}
        /* The pickers, and the Project write path — the same one the columns
           board's drag uses, so a Status set here and a Status dragged there
           are one call. */
        meta={meta}
        project={project}
        writingProject={writing.get(viewing.number)?.split(' = ')[0]}
        onWriteProject={(field, value, optionId) => {
          const row = all.find(i => i.number === viewing.number);
          if (row) writeProject(row, field, value, optionId);
        }}
        me={ctx.me}
        /* `project` covers `read:project`, so this is the one to ask for —
           see `hasScope`. */
        canWriteProject={hasScope(activeAccount(env ?? null), 'project')}
        onProjectItem={(what, itemId) => projectItem(what, itemId, viewing.number)}
        onOpen={n => setViewing(all.find(i => i.number === n) ?? viewing)}
        onBack={() => { setViewing(undefined); setSection('board'); }}
        /* "Reference in a new issue" — the composer, seeded with the quote and
           the link back. The board owns the draft, so this is where it lands. */
        onReference={seed => {
          setDraft({ ...emptyDraft(repo), description: seed });
          setViewing(undefined);
          setSection('new');
        }}
        onWrote={refresh}
      />
    );
  }

  const showPanel = panel !== 'none' && (view === 'cards' || view === 'table');

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden" ref={boardRef}
         style={{ position: 'relative' }}
         onContextMenu={menu.onContextMenu}>
      {menu.node}

      {copyingMap && (
        <GhCopyMap
          repo={repo}
          recent={known.filter(r => r !== repo)}
          dimensions={data?.dimensions ?? []}
          project={(project?.fields ?? [])
            .filter(f => f.dataType === 'SINGLE_SELECT')
            .map(f => ({ name: f.name, options: (f.options ?? []).map(o => o.name) }))}
          onCancel={() => setCopyingMap(false)}
          onCopy={fields => {
            setCopiedMap(fields);
            saveFieldMap(repo, fields);
            setCopyingMap(false);
          }}
        />
      )}

      {/* 15E. A scheduled run says nothing when it works — the file is the
          answer. A run that could not happen has to be said, or the week it
          mattered is the week nobody notices it is missing. */}
      {runFailed && (
        <div className="chiprow" style={{
          background: 'color-mix(in srgb, var(--dk-amber) 8%, transparent)',
        }}>
          <span className="lead" style={{ color: 'var(--dk-amber)' }}>
            Scheduled export
          </span>
          <span style={{ fontSize: 12.6, color: 'var(--dk-text)' }}>
            {runFailed.why} It was due for {runFailed.forDay}.
          </span>
          <span className="spacer" style={{ flex: 1 }} />
          <button type="button" className="btn" style={{ padding: '2.4px 9.6px' }}
                  onClick={() => setRunFailed(undefined)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Head — repository, count, when it was last read */}
      <div className="head">
        <div className="repo">
          <Ico name="repo" />
          <span className="path">{owner}<span>/</span>{name}</span>
        </div>
        {!pending && (
          <span className="chip c-gh">
            {total} {issueState === 'open' ? 'open' : 'issues'}
          </span>
        )}
        <span className="spacer" />
        <span className="ago">
          {frozen ? 'paused — signed out'
            : limited ? 'paused — rate limited'
            : pending ? 'reading…'
            : loading ? 'refreshing…'
            : `auto 60s · refreshed ${since(data?.fetchedAt)}`}
        </span>
        {account && onOpenAccount && (
          <button type="button" className="btn" onClick={onOpenAccount}
                  title="Scopes, hosts, accounts, and every command dkgh runs">
            {/* The identity chip carries your own face too — see `GhAvatar`. */}
            <GhAvatar who={account.login}
                      className={`av av-${account.login[0].toLowerCase()}`} />
            {account.login}
          </button>
        )}
        <button type="button" className="btn" onClick={refresh} disabled={frozen}
                title="Read it again now">
          <Ico name="refresh" />
        </button>
        <button type="button" className="btn" onClick={onChangeRepo}>Switch</button>
      </div>

      {/* The sections of the tab */}
      <div className="subtabs">
        {SECTIONS.map(sec => (
          <button
            key={sec.id}
            type="button"
            data-section={sec.id}
            className={`s${section === sec.id ? ' on' : ''}`}
            disabled={sec.disabled}
            title={sec.disabled ? `${sec.label} is not built yet` : undefined}
            style={sec.disabled ? { opacity: 0.45, cursor: 'default' } : undefined}
            onClick={() => { if (!sec.disabled) setSection(sec.id); }}
          >
            <Ico name={sec.icon} />
            {sec.label}
            {sec.id === 'board' && !pending && total > 0 && (
              <span className="cnt">{total}</span>
            )}
          </button>
        ))}
      </div>

      {/*
        The composer takes the tab from the sub-tabs down — everything below is
        the board's own chrome, and a filter row above a form is a filter row
        filtering nothing.
      */}
      {section === 'labels' ? (
        <GhLabels
          repo={repo}
          meta={meta}
          issues={all}
          onClose={() => setSection('repository')}
          onRefresh={refresh}
        />
      ) : section === 'import' ? (
        <GhImport
          repo={repo}
          existing={data?.forms ?? []}
          onClose={() => setSection('repository')}
          onImported={refresh}
        />
      ) : section === 'repository' ? (
        <GhRepository
          repo={repo}
          data={data ?? undefined}
          meta={meta}
          issues={all}
          onRefresh={refresh}
          onChangeRepo={onChangeRepo}
          onCopyMap={() => setCopyingMap(true)}
          /*
            17D — the unmapped count is a link to the rows behind it, which is
            the only way to find out why a heading stopped parsing.
          */
          /*
             `none`, not `''`. `valuesOf` reports an issue with no value for a
             field as `['none']`, so a term of `['']` matches nothing at all —
             this link landed on an empty board rather than on the unmapped
             rows it names.
          */
          onExplain={dimension => {
            setFilter(f => only(f, dimension, 'none'));
            setSection('board');
          }}
          onImport={() => setSection('import')}
          onLabels={() => setSection('labels')}
        />
      ) : section === 'team' ? (
        /*
          Who is carrying what — see `GhTeam`. It reads `filtered` rather than
          `all` on purpose: the filters above are the ones already on screen,
          and a team view that ignored them would answer a different question
          from the board beside it.
        */
        <GhTeam
          repo={repo}
          issues={filtered}
          dimensions={dimensions}
          meta={meta}
          project={project}
          me={ctx.me}
          end={endField}
          writingProject={undefined}
          onWriteProject={(field, value, optionId) => {
            const row = all.find(i => i.number === viewing?.number);
            if (row) writeProject(row, field, value, optionId);
          }}
          onWrote={refresh}
          onReference={seed => {
            setDraft({ ...emptyDraft(repo), description: seed });
            setSection('new');
          }}
        />
      ) : section === 'insights' ? (
        <GhInsights
          repo={repo}
          issues={filtered}
          dimensions={dimensions}
          /* 16D — a pinned chart is a chart *of* a saved view, so it needs the
             names and a way to ask each one for its rows. */
          views={shownViews.map(v => v.name)}
          currentView={active?.name ?? ''}
          rowsForView={name => rowsFor(name, shownViews, all)}
          who={account?.login}
          weeks={weeks}
          onWeeks={setWeeks}
          /*
            16A — a bar is a filter you have not applied yet. It lands on the
            board with that one value ticked, which is the move somebody makes
            ten seconds after seeing a bar they did not expect.
          */
          onFilter={(field, value) => {
            if (field === 'age') {
              /* The age chart's buckets are a band, not a value; the honest
                 move is the board with nothing added rather than a filter
                 that does not mean what the bar meant. */
              setSection('board');
              return;
            }
            setFilter(f => only(f, field, value));
            setSection('board');
          }}
        />
      ) : section === 'new' ? (
        <GhCompose
          repo={repo}
          forms={data?.forms ?? []}
          noTemplates={!!data?.noTemplates}
          meta={meta}
          me={ctx.me}
          draft={draft}
          issues={all}
          onDraft={setDraft}
          onReview={() => setSection('review')}
        />
      ) : section === 'review' ? (
        <GhReview
          repo={repo}
          draft={draft}
          request={{
            repo,
            title: draft.title,
            body: assembleBody(draft, (data?.forms ?? []).find(f => f.file === draft.templateFile)),
            labels: [...new Set([
              ...((data?.forms ?? []).find(f => f.file === draft.templateFile)?.labels ?? []),
              ...draft.labels,
            ])],
            assignees: draft.assignees,
            milestone: draft.milestone,
          }}
          dimensions={dimensions}
          issues={all}
          onBack={() => setSection('new')}
          onBody={() => undefined}
          onFiled={() => {
            discardDraft(repo);
            setDraft(emptyDraft(repo));
            setSection('board');
            refresh();
          }}
          onAnother={() => {
            /* Keeps the classification, clears the words — filing four related
               bugs after a test run is the normal case, and re-answering the
               same dropdowns each time is why people batch them and never
               write them. */
            setDraft({
              ...emptyDraft(repo),
              templateFile: draft.templateFile,
              answers: draft.answers,
              labels: draft.labels,
              assignees: draft.assignees,
            });
            setSection('new');
          }}
        />
      ) : (
        <>

      {/*
        The saved views — screen 09's `.viewbar`, as a segmented control.

        They were a second row of tabs directly under the section tabs, and two
        rows of near-identical tabs a few pixels apart is a bar nobody can read:
        the eye cannot tell which row it is choosing from. A section is *where
        you are in the tab*; a saved view is *which question the board is
        answering*. Two different kinds of choice, so they get two different
        kinds of control — tabs above, and the same recessed segmented strip
        dk8s uses for its artifact filter here.

        The strip is built here rather than taken from the shared control,
        because a segment has to carry a count. `Stale & unowned 0` is the whole
        reason to look at this row — a view that is empty right now is one you
        can stop reading — and the shared control takes a string, which would
        have left the number loose in the label instead of in a badge you can
        find without reading.
      */}
      <div className="viewbar">
        <div className="vseg" role="tablist" aria-label="Saved views">
          {shownViews.map(v => {
            const on = v.id === activeView;
            return (
              <button
                key={v.id}
                type="button"
                role="tab"
                data-view={v.id}
                aria-selected={on}
                className={`vs${on ? ' on' : ''}`}
                title={on ? 'Click again to leave this view' : v.name}
                onClick={() => openView(on ? undefined : v.id)}
              >
                {v.name}
                {/* A zero is not worth a badge. `Stale & unowned` holding an
                    empty orange chip reads as a number you should look at; the
                    absence of the chip is the same fact, told quietly. */}
                {(viewCounts.get(v.id) ?? 0) > 0 && (
                  <span className="cnt">{viewCounts.get(v.id)}</span>
                )}
                {viewDiff?.dirty && on && <span className="dot" title="Changed since saved" />}
              </button>
            );
          })}
          {/*
            `New view` is the last segment rather than a button beside the
            strip. Saving the filters you are looking at is how the next tab in
            this row comes to exist, so it belongs at the end of the row it will
            join — the same place a browser puts `+`.
          */}
          <button type="button" className="vs add" onClick={() => setSaving({})}>
            <Ico name="plus" />New view
          </button>
        </div>
        <span className="sp" style={{ flex: 1 }} />
        {/*
          Managing views is housekeeping, not a view — so it is a gear with no
          button around it, sitting apart from the strip rather than looking
          like one more thing to choose from.
        */}
        <button type="button" className="vgear" title="Manage views"
                aria-label="Manage views" onClick={() => setManaging(true)}>
          <SettingsIcon size={14} />
        </button>
      </div>

      {/* 09B — the view has been changed, and nothing is saved until you say so */}
      {viewDiff?.dirty && active && (
        <div className="dirtybar">
          <b>You have changed this view.</b> {describeDiff(viewDiff, labels)}
          <span className="sp" style={{ flex: 1 }} />
          {/*
            Three buttons, three different things, and until now three
            identical grey rectangles beside one orange one. Throwing away what
            you changed and keeping it under a new name are opposite acts, so
            they are not the same colour: discard is red, the new view is cyan,
            and Update stays the accent because it is what the bar is for.
          */}
          <button type="button" className="btn warn" onClick={() => openView(activeView)}>
            Reset to saved
          </button>
          <button type="button" className="btn alt" onClick={() => setSaving({})}>
            Save as new view
          </button>
          <button type="button" className="btn go" onClick={() => setSaving({ existing: active })}>
            Update “{active.name}”
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="toolbar">
        <span className="search" ref={searchRef}>
          <Ico name="search" />
          <input
            value={filter.search.text}
            onChange={e => setFilter(f => ({ ...f, search: { ...f.search, text: e.target.value } }))}
            placeholder="Search issues"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--dk-text)', font: 'inherit',
            }}
          />
        </span>
        <button
          type="button"
          className={`pill${panel === 'filters' ? ' on' : ''}`}
          onClick={() => setPanel(p => (p === 'filters' ? 'none' : 'filters'))}
        >
          <Ico name="filter" />Filters
          {filter.terms.length > 0 && <span className="cnt">{filter.terms.length}</span>}
        </button>
        {VIEWS.map(v => (
          <button
            key={v.id}
            type="button"
            /* Its id, the way the section buttons above carry theirs — the
               labels here ("Table", "Columns") also appear in the filter and
               group menus, so text is not a way to ask for one. */
            data-view={v.id}
            className={`pill${view === v.id ? ' on' : ''}`}
            disabled={!v.ready}
            title={v.ready ? undefined : `${v.label} is not built yet`}
            onClick={() => setShape({ view: v.id as typeof shape.view })}
          >
            <Ico name={v.icon} />{v.label}
          </button>
        ))}
        <button
          type="button"
          className={`pill${meaning.groupBy !== 'none' ? ' on' : ''}`}
          onClick={() => setPanel(p => (p === 'view' ? 'none' : 'view'))}
        >
          Group: {groupLabel}
        </button>
        {filter.terms.length > 0 && !activeView && (
          <button type="button" className="pill go" onClick={() => setSaving({})}>
            Save as view
          </button>
        )}
        {/*
          Amber and solid, the way dk8s draws its own export.

          This is the only control in the row that writes a file, and as
          another outlined pill it read as one more filter. Same token dk8s
          uses — `--color-warning` — rather than a second amber of dkgh's own,
          because "the button that writes files" should look the same in both
          tabs.
        */}
        <button type="button" className="pill exp"
                title="Export writes exactly these columns, in this order"
                onClick={() => setSection('export')}>
          <Ico name="export" />Export
        </button>
        {view === 'columns' && (
          <GhColumnControls
            fields={columnFields}
            field={columnOn}
            onField={setColumnField}
            colourBy={colourBy}
            options={dimensions.filter(d => d.dimension !== columnOn?.name.toLowerCase())}
            onColour={setColourBy}
            laneBy={laneBy}
            onLane={setLaneBy}
            hidden={hiddenColumns}
            onHidden={setHiddenColumns}
            wip={wip}
            onWip={setWip}
          />
        )}
        {view === 'roadmap' && (
          <span style={{ display: 'inline-flex', gap: 3 }}>
            {(['week', 'month', 'quarter'] as const).map(sc => (
              <button key={sc} type="button" className={`pill${scale === sc ? ' on' : ''}`}
                      onClick={() => setScale(sc)}>
                {cap(sc)}
              </button>
            ))}
          </span>
        )}
        <button type="button" className="pill" onClick={() => setShowKeys(true)} title="Keys">
          <Ico name="term" />
        </button>
      </div>

      {/* What is filtering the list right now, in words — and the query behind it */}
      <GhChips
        state={filter}
        labels={labels}
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

      {/*
        The board — the mock's `.split`, made draggable.

        `SplitPanelView` rather than a fixed rail: a facet panel somebody cannot
        widen is a facet panel that truncates the one label they needed. The
        panel stays mounted when it is closed (`collapsed`, not unmounted), so
        its search box and its scroll position survive the toggle.
      */}
      <SplitPanelView
        className="split"
        direction="horizontal"
        defaultSplit={22}
        minFirstPct={11}
        minSecondPct={45}
        accentColor="var(--dk-gh)"
        collapsed={panel === 'none'}
        collapsedSide="first"
        first={panel === 'view' && view === 'table' ? (
          <GhColumnPanel
            dimensions={dimensions}
            columns={shape.columns}
            onColumns={columns => setShape({ columns })}
            pinned={shape.pinnedColumns}
            onPinned={pinnedColumns => setShape({ pinnedColumns })}
            wrapTitles={shape.wrapTitles}
            onWrapTitles={wrapTitles => setShape({ wrapTitles })}
          />
        ) : panel === 'view' ? (
          <GhCardOptions
            issues={filtered}
            dimensions={dimensions}
            groupBy={meaning.groupBy}
            onGroupBy={groupBy => setMeaning({ groupBy })}
            cardFields={shape.cardFields}
            onCardFields={cardFields => setShape({ cardFields: cardFields as CardField[] })}
            density={shape.density}
            onDensity={density => setShape({ density })}
            view={view}
          />
        ) : (
          <GhFilters
            /* Counted over what the search left, so the number beside a value
               is how many you would get if you ticked it given what you typed. */
            issues={searched}
            dimensions={dimensions}
            state={filter}
            onChange={setFilter}
            ctx={ctx}
          />
        )}
        second={
          <div className="pane"
               style={{ overflow: view === 'table' && !pending ? 'hidden' : 'auto' }}>
            {pending ? (
              <div className="groups">
                {stuck
                  ? <GhBoardStalled repo={repo} onChangeRepo={onChangeRepo} />
                  : <BoardSkeleton view={view} />}
              </div>
            ) : filtered.length === 0 ? (
              <div className="groups">
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
            ) : view === 'columns' ? (
              <GhColumns
                issues={filtered}
                project={project}
                field={columnOn}
                colourBy={colourBy || dimensions.find(d => /priority/i.test(d.dimension))?.dimension}
                laneBy={laneBy || undefined}
                hidden={hiddenColumns}
                dimensions={dimensions}
                wip={wip}
                pending={writing}
                elsewhere={elsewhere}
                onTakeTheirs={() => setElsewhere([])}
                onKeepMine={change => {
                  const back = columnOn?.options?.find(o => o.name === change.was);
                  const issue = all.find(i => i.number === change.number);
                  if (!columnOn || !back || !issue) return;
                  setElsewhere(prev => prev.filter(e => e !== change));
                  writeProject(issue, columnOn, change.was, back.id);
                }}
                onOpen={open}
                onMove={(move: Move) => {
                  const option = columnOn?.options?.find(o => o.name === move.to);
                  if (!columnOn || !option) return;
                  writeProject(move.issue, columnOn, move.to, option.id);
                }}
              />
            ) : view === 'roadmap' ? (
              <GhRoadmap
                issues={filtered}
                project={project}
                start={startField}
                end={endField}
                scale={scale}
                colourBy={colourBy || dimensions[0]?.dimension}
                laneBy={laneBy || undefined}
                dimensions={dimensions}
                milestones={meta?.milestones ?? []}
                slips={slips}
                pending={writing}
                onOpen={open}
                onReschedule={(change: Reschedule) =>
                  writeProject(change.issue, change.field, change.date)}
              />
            ) : view === 'cards' ? (
              <GhCards
                groups={groups}
                showGroups={meaning.groupBy !== 'none'}
                fields={shape.cardFields}
                density={shape.density}
                dimensions={dimensions}
                selected={selected}
                onToggle={toggle}
                onOpen={open}
                cursor={cursor}
                hits={hits}
              />
            ) : (
              <GhIssueTable
                groups={groups}
                showGroups={meaning.groupBy !== 'none'}
                dimensions={dimensions}
                columns={shape.columns}
                pinned={shape.pinnedColumns}
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
                renderHeader={(g: Group) => (
                  <Header group={g} dimensions={dimensions} />
                )}
              />
            )}
          </div>
        }
      />

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

      {/* Footer — the mock's `.footbar` */}
      <div className="footbar">
        {/*
          The way back into 08E.

          It was only reachable from the Explain button in the chip row, and
          that row draws nothing at all when no filter is set — so closing the
          sheet on an unfiltered board closed it for good, with no control
          anywhere that would open it again. The count is the thing the sheet
          is about, so the count is the button.
        */}
        {pending ? (
          <span>reading the repository</span>
        ) : (
          <button
            type="button"
            className={`whycount${why ? ' on' : ''}`}
            title="Why is an issue here — and where did that one go"
            onClick={() => setWhy(w => !w)}
          >
            {`${filtered.length}${filtered.length !== total ? ` of ${total}` : ''} shown`}
          </button>
        )}
        <span style={{ opacity: 0.5 }}>·</span>
        <GhKeyStatus selected={[...selected]} cursor={cursor} />
        <span className="sp" />
        {!pending && stale > 0 && (
          <span className="chip c-stale">{stale} quiet {QUIET_DAYS}d+</span>
        )}
        {!pending && unassigned > 0 && (
          <span className="chip c-stale">{unassigned} unassigned</span>
        )}
      </div>

      </>
      )}

      {peek && (
        <GhPeek
          repo={repo}
          issue={peek}
          onOpen={i => { setPeek(undefined); open(i); }}
          onClose={peekHeld ? undefined : () => setPeek(undefined)}
        />
      )}
      {showKeys && <GhKeys onClose={() => setShowKeys(false)} />}

      <GhSaveView
        open={!!saving}
        now={snapshot}
        existing={saving?.existing}
        matches={filtered.length}
        onCancel={() => setSaving(undefined)}
        onSave={saveView}
      />
      <GhManageViews
        open={managing}
        stored={views}
        counts={viewCounts}
        onClose={() => setManaging(false)}
        onChange={persist}
      />
      <GhShareView
        open={!!sharing}
        repo={repo}
        view={sharing?.view}
        /* What is on screen is what gets shared — sharing a saved view while
           looking at something else would hand somebody a third thing. */
        state={sharing?.view?.capture.filters ?? filter}
        issues={all}
        formFields={(dimensions).map(d => d.dimension)}
        ctx={ctx}
        onClose={() => setSharing(undefined)}
        onApply={(next, andSave) => {
          setFilter(next);
          setActiveView(undefined);
          if (andSave) setSaving({});
        }}
      />
      <GhChart
        open={!!charting}
        title={charting === 'board' || !charting ? 'this board' : charting.name}
        /* The rows already on screen, so the numbers match what was just read
           rather than being a second query that might disagree. */
        issues={filtered}
        dimensions={dimensions}
        onClose={() => setCharting(undefined)}
      />
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
      /* Never steal a key from something somebody is typing into — see
         `isPlainKeyInField`, which knows about Monaco and contenteditable as
         well as the three field tags. */
      if (isPlainKeyInField(e)) return;

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
      <button type="button" className="btn" onClick={onChangeRepo}>
        Choose a different repository
      </button>
    </div>
  );
}
