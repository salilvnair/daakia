/**
 * dkgh's host side: probing gh, and remembering where it is.
 *
 * Everything the three first-run screens need arrives from `dkgh:probe` in one
 * message — screens 01, 02 and 03 are three states of the same question, and
 * asking three times invites them to disagree with each other on a slow
 * machine.
 *
 * State is persisted through `app_settings` under one key, the way dk8s keeps
 * its own. There is no token in it and never will be: the credential stays
 * wherever `gh` put it, and dkgh's only question is whether one exists.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getSetting, setSetting } from '../../../storage/db';
import { getActiveWorkspaceId } from '../../../storage/workspaces';
import {
  probeEnvironment, setGhPath, verifyGhPath, forgetGh, probeReachability,
  searchCommonLocations, onAuthFailure, type GhEnv,
} from '../../../services/gh/gh';
import { fetchBoard, fetchIssueDetail, searchIssues } from '../../../services/gh/board';
import { fetchEvidence } from '../../../services/gh/evidence';
import {
  guessFromWorkspace, searchRepos, summarise, inspectRepo, inspectFork,
  type RepoSummary,
} from '../../../services/gh/repos';
import {
  planEdit, applyPlan, planCreate, applyCreate,
  type EditRequest, type CreateRequest, type StepKind,
} from '../../../services/gh/write';
import { fetchRepoMeta } from '../../../services/gh/meta';
import { harvest } from '../../../services/gh/harvest';
import { due, isoDay, type Schedule } from '../../../services/gh/schedule';
import { fetchRelations } from '../../../services/gh/relations';
import { fetchTimeline } from '../../../services/gh/timeline';
import { workbookParts, type Sheet } from '../../../services/gh/xlsx';
import {
  applyTemplateCommit, fetchTemplatesFrom, isForm, planTemplateCommit, readZip, starterSet,
  type TemplateFile, type TemplateSource,
} from '../../../services/gh/templates';
import { parseIssueForms, proposeDimensions } from '../../../services/gh/issue-forms';
import { applyLabels, planLabels, type LabelEdit } from '../../../services/gh/labels';
import {
  applyUpload, planUpload, type EvidenceFile,
} from '../../../services/gh/evidence-upload';
import {
  applyProjectEdit, fetchProject, planProjectEdit, type ProjectEdit,
} from '../../../services/gh/project';
import { buildReport, render as renderPdf, type Report } from '../../../services/gh/pdf';
import { GH_COMMANDS, GH_SCOPES } from '../../../services/gh/commands';

type PostMessage = (msg: unknown) => void;

const KEY = 'dkgh';

/** How many repositories the Recent list keeps. Enough to be useful, few
    enough that its counts cost four API calls rather than forty. */
const RECENT_LIMIT = 4;

/** Persisted across sessions. Deliberately small. */
export interface DkghState {
  /**
   * The repository each Daakia workspace is pointed at, keyed by workspace id.
   *
   * Per workspace rather than global because which product you are testing is
   * exactly what a workspace already distinguishes — switching workspace should
   * switch repository with it, not leave you filing a bug against the last
   * project you looked at.
   */
  repoByWorkspace?: Record<string, string>;
  /** The last few, per workspace. Most recent first. */
  recentByWorkspace?: Record<string, string[]>;
  /** Kept above the recents, in the order they were pinned. */
  pinnedByWorkspace?: Record<string, string[]>;
  /**
   * The last counts read for a repository, and when.
   *
   * Global rather than per workspace: how many issues `acme/web-console` has
   * open is a fact about the repository, not about which workspace asked. A
   * picker that fires four API calls to render a list is a picker that is slow
   * every time, so the list draws from here and says how old it is.
   */
  counts?: Record<string, { openIssues: number; templates: number; at: number }>;
  /**
   * Repositories where the "old gh" banner has been dismissed.
   *
   * Per repository because a team on a pinned corporate gh should not be
   * nagged daily about a version they cannot change — and because the features
   * it names only matter for the repository you are looking at.
   */
  oldGhDismissed?: string[];
  /** Pre-workspace saves. Read once, then migrated into the map. */
  repo?: string;
  /**
   * An explicit gh path, for a machine where it is installed somewhere
   * unusual — or not on PATH at all, which is the common case on a locked-down
   * laptop where somebody unpacked a zip.
   *
   * Outranked by the DAAKIA_GH environment variable. See `candidates()`.
   */
  ghPath?: string;
  /**
   * The scheduled exports — 15E.
   *
   * Global rather than per workspace: a schedule names its own repository, and
   * a report that stopped running because somebody opened a different folder
   * is a report nobody trusts again.
   */
  schedules?: Schedule[];
}

function state(): DkghState {
  return getSetting<DkghState>(KEY) ?? {};
}

/** The repository this workspace is on, honouring the pre-workspace save. */
function currentRepo(): string | undefined {
  const s = state();
  return s.repoByWorkspace?.[getActiveWorkspaceId()] ?? s.repo;
}

function currentRecent(): string[] {
  return state().recentByWorkspace?.[getActiveWorkspaceId()] ?? [];
}

function currentPinned(): string[] {
  return state().pinnedByWorkspace?.[getActiveWorkspaceId()] ?? [];
}

/**
 * The folder whose git remote is worth guessing from.
 *
 * The first workspace folder, because a multi-root workspace has no single
 * answer and picking the second one at random would be a worse guess than the
 * first. Absent outside an editor, where the guess simply is not offered.
 */
function workspaceFolder(): string | undefined {
  try {
    const open = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
    if (open) return open;
  } catch {
    /* No editor — the browser dev server. */
  }
  /* Where the process was started. In the editor with no folder open this is
     usually not a repository, and gh says so, which is the right answer. */
  return process.cwd();
}

function saveState(patch: Partial<DkghState>): DkghState {
  const next = { ...state(), ...patch };
  setSetting(KEY, next);
  return next;
}

/**
 * Apply the saved path to the runner.
 *
 * Called once when the panel comes up, so a path saved in Settings is in force
 * before anything asks whether gh exists.
 */
export function initDkgh(post?: PostMessage): void {
  const saved = state();
  if (saved.ghPath) setGhPath(saved.ghPath);

  /*
    Tell the tab the moment any call finds the credential gone.

    It never happens on the sign-in screen — it happens on the third card of a
    triage session, from whichever call was in flight. Raised from the runner
    so every path reports it, and the webview decides what to hold on to.
  */
  if (post) {
    onAuthFailure(detail => post({ type: 'dkgh:signedOut', detail, at: Date.now() }));
  }

  /*
    15E's clock.

    There is no daemon, and this does not pretend to be one: it ticks on launch
    — which is where the catch-up for a missed Friday happens — and once a
    minute after that, for as long as the panel is up. A minute is fine because
    the thing being watched moves in hours.
  */
  if (post) {
    if (scheduleTimer) clearInterval(scheduleTimer);
    tickSchedules(post);
    scheduleTimer = setInterval(() => tickSchedules(post), 60_000);
    /* Node keeps the process alive for a pending interval, which in the browser
       dev build means the server never exits on Ctrl-C. */
    scheduleTimer.unref?.();
  }
}

/** Cleared and replaced on every init, so two panels do not tick twice. */
let scheduleTimer: ReturnType<typeof setInterval> | undefined;

/** Stop the clock. Called when the panel goes away. */
export function disposeDkgh(): void {
  if (scheduleTimer) clearInterval(scheduleTimer);
  scheduleTimer = undefined;
}

/** Remember the repository for this workspace, so the tab opens where it was left. */
export async function handleDkghSetRepo(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const repo = String(msg.repo ?? '').trim();
  const ws = getActiveWorkspaceId();
  const s = state();

  const byWorkspace = { ...(s.repoByWorkspace ?? {}) };
  if (repo) byWorkspace[ws] = repo;
  else delete byWorkspace[ws];

  /* The one being left goes to the front of Recent, not the one being chosen:
     the list is where you came from, and an entry for where you already are is
     a row that does nothing. */
  const previous = s.repoByWorkspace?.[ws] ?? s.repo;
  const recent = [...(s.recentByWorkspace?.[ws] ?? [])];
  if (previous && previous !== repo) {
    const at = recent.indexOf(previous);
    if (at >= 0) recent.splice(at, 1);
    recent.unshift(previous);
  }
  const trimmed = recent.filter(r => r !== repo).slice(0, RECENT_LIMIT);

  saveState({
    repoByWorkspace: byWorkspace,
    recentByWorkspace: { ...(s.recentByWorkspace ?? {}), [ws]: trimmed },
    /* The pre-workspace value is superseded the moment a workspace has its own. */
    repo: undefined,
  });
  postMessage({ type: 'dkgh:repo:result', repo: repo || undefined });
}

/**
 * Everything screen 03 draws, in one message.
 *
 * The guess, the recents and their counts arrive together because they are one
 * question — "which repository?" — and a screen that filled in three at
 * different moments would reflow under the cursor of somebody about to click.
 */
export async function handleDkghRepoOptions(postMessage: PostMessage): Promise<void> {
  postMessage({ type: 'dkgh:repoOptions:loading' });
  const pins = currentPinned();
  /* Pinned entries are lifted out of Recent rather than shown twice. */
  const recentNames = currentRecent().filter(r => !pins.includes(r));

  /*
    The lists as they were, first — then again once they have been re-read.

    Every row in them costs two API calls, and a picker that waits for eight of
    those before it draws anything is slow every single time somebody switches
    workspace. So the cached counts go out immediately with the age attached,
    and the fresh ones replace them in place when they land.
  */
  const cached = {
    recent: recentNames.map(cachedSummary).filter((r): r is RepoSummary => !!r),
    pinned: pins.map(cachedSummary).filter((r): r is RepoSummary => !!r),
  };
  if (cached.recent.length > 0 || cached.pinned.length > 0) {
    postMessage({
      type: 'dkgh:repoOptions:result',
      cached: true,
      current: currentRepo(),
      ...cached,
    });
  }

  const [guess, recent, pinned] = await Promise.all([
    guessFromWorkspace(workspaceFolder()),
    summarise(recentNames),
    summarise(pins),
  ]);

  /*
    Screen 03C. Asked only when the guess is actually a fork, because it is a
    second `gh repo view` and every other first run would pay for it.
  */
  const fork = guess.repo ? await inspectFork(guess.repo) : undefined;

  rememberCounts([...(guess.repo ? [guess.repo] : []), ...recent, ...pinned,
    ...(fork?.upstream ? [fork.upstream] : [])]);

  postMessage({
    type: 'dkgh:repoOptions:result',
    guess,
    fork,
    recent,
    pinned,
    current: currentRepo(),
  });
}

/** A repository's counts as they were last read, or nothing if never. */
function cachedSummary(name: string): RepoSummary | undefined {
  const hit = state().counts?.[name];
  if (!hit) return undefined;
  return {
    nameWithOwner: name,
    isPrivate: false,
    isArchived: false,
    isFork: false,
    openIssues: hit.openIssues,
    templates: hit.templates,
    countedAt: hit.at,
  };
}

/** Keep what was just read, so the next picker draws before it calls anything. */
function rememberCounts(repos: RepoSummary[]): void {
  const at = Date.now();
  const counts = { ...(state().counts ?? {}) };
  for (const r of repos) {
    if (r.templates === undefined) continue;
    counts[r.nameWithOwner] = { openIssues: r.openIssues, templates: r.templates, at };
  }
  saveState({ counts });
}

/**
 * Why can this account not see a repository — screen 03B.
 *
 * The reply ranks the causes and never asserts one. GitHub answers 404 for a
 * private repository you lack access to and for one that does not exist, on
 * purpose, and a lapsed SSO grant looks identical to both from here.
 */
export async function handleDkghInspectRepo(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  await answering(postMessage, 'dkgh:inspectRepo:result', msg, async () => {
    const repo = String(msg.repo ?? '').trim();
    if (!repo) return;
    postMessage({ type: 'dkgh:inspectRepo:loading', repo });
    postMessage({ type: 'dkgh:inspectRepo:result', ...(await inspectRepo(repo)) });
  });
}

/** Pin or unpin a repository for this workspace. */
export async function handleDkghPinRepo(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const repo = String(msg.repo ?? '').trim();
  if (!repo) return;
  const ws = getActiveWorkspaceId();
  const s = state();
  const pins = [...(s.pinnedByWorkspace?.[ws] ?? [])];
  const at = pins.indexOf(repo);
  if (at >= 0) pins.splice(at, 1);
  else pins.push(repo);
  saveState({ pinnedByWorkspace: { ...(s.pinnedByWorkspace ?? {}), [ws]: pins } });
  await handleDkghRepoOptions(postMessage);
}

/**
 * Why can gh not reach GitHub?
 *
 * Asked only once something has already failed. The reply is a transcript, not
 * a verdict — see `probeReachability`.
 */
export async function handleDkghDiagnose(postMessage: PostMessage): Promise<void> {
  await answering(postMessage, 'dkgh:diagnose:result', {}, async () => {
    postMessage({ type: 'dkgh:diagnose:loading' });
    postMessage({ type: 'dkgh:diagnose:result', ...(await probeReachability()) });
  });
}

/** "Search common locations", for the machine where gh came out of a zip. */
export async function handleDkghFindGh(postMessage: PostMessage): Promise<void> {
  await answering(postMessage, 'dkgh:findGh:result', {}, async () => {
    postMessage({ type: 'dkgh:findGh:loading' });
    postMessage({ type: 'dkgh:findGh:result', found: await searchCommonLocations() });
  });
}

/**
 * The native file picker, for "Browse…".
 *
 * Opening a dialog is the editor's job; there is no browser equivalent, so the
 * webview asks and takes what it is given. In the dev server there is no
 * editor, and the reply says so rather than hanging.
 */
export async function handleDkghBrowseGh(postMessage: PostMessage): Promise<void> {
  try {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Use this gh',
      title: 'Locate the GitHub CLI',
      filters: process.platform === 'win32' ? { Executable: ['exe'] } : undefined,
    });
    const path = picked?.[0]?.fsPath;
    postMessage({ type: 'dkgh:browseGh:result', path });
  } catch {
    postMessage({
      type: 'dkgh:browseGh:result',
      unavailable: 'A file picker needs the editor — type the path instead.',
    });
  }
}

/** Stop nagging about an old gh, for this repository only. */
export async function handleDkghDismissOldGh(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const repo = String(msg.repo ?? currentRepo() ?? '').trim();
  if (!repo) return;
  const list = state().oldGhDismissed ?? [];
  if (!list.includes(repo)) saveState({ oldGhDismissed: [...list, repo] });
  postMessage({ type: 'dkgh:oldGh:dismissed', repo });
}

/** The search, run against every org this account belongs to. */
export async function handleDkghSearchRepos(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  await answering(postMessage, 'dkgh:searchRepos:result', msg, async () => {
    const query = String(msg.query ?? '').trim();
    postMessage({ type: 'dkgh:searchRepos:loading', query });
    const result = await searchRepos(query, { includeArchived: msg.includeArchived === true });
    postMessage({ type: 'dkgh:searchRepos:result', query, ...result });
  });
}

/**
 * The board.
 *
 * One message carries the issues, the dimensions the templates declared and
 * any template that would not parse — because they are read together and a UI
 * that received them separately would render a board before it knew how to
 * group it.
 */
export async function handleDkghBoard(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  await answering(postMessage, 'dkgh:board:result', msg, async () => {
    const repo = String(msg.repo ?? currentRepo() ?? '').trim();
    if (!repo) {
      postMessage({ type: 'dkgh:board:result', error: 'No repository is selected.' });
      return;
    }
    postMessage({ type: 'dkgh:board:loading', repo });
    const result = await fetchBoard(repo, {
      state: (msg.state as 'open' | 'closed' | 'all') ?? 'open',
    });
    postMessage({ type: 'dkgh:board:result', ...result });
  });
}

/**
 * Search the repository rather than the page — screen 08C.
 *
 * Asked only when the reader widens the scope to comments, or when the board is
 * bigger than one page and they say so. Everything else the search box does
 * runs in the webview over what it already holds.
 */
export async function handleDkghSearchIssues(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  await answering(postMessage, 'dkgh:searchIssues:result', msg, async () => {
    const repo = String(msg.repo ?? currentRepo() ?? '').trim();
    const query = String(msg.query ?? '').trim();
    if (!repo || !query) return;
    postMessage({ type: 'dkgh:searchIssues:loading', query });
    const result = await searchIssues(repo, query, { comments: msg.comments === true });
    postMessage({ type: 'dkgh:searchIssues:result', ...result });
  });
}

/**
 * One issue in full, for the peek — screen 04D.
 *
 * Asked when somebody holds Space over a card, and not before. The comments on
 * every issue in a busy repository are megabytes to fill a panel that is open
 * for four seconds.
 */
export async function handleDkghIssue(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  await answering(postMessage, 'dkgh:issue:result', msg, async () => {
    const repo = String(msg.repo ?? currentRepo() ?? '').trim();
    const number = Number(msg.number);
    if (!repo || !Number.isFinite(number)) return;
    postMessage({ type: 'dkgh:issue:result', ...(await fetchIssueDetail(repo, number)) });
  });
}

/**
 * What one issue is attached to — 14D.
 *
 * Answers even when it fails, because the panel is drawn under the timeline
 * and a silent failure there reads as "this issue is attached to nothing",
 * which is a different and much worse claim than "I could not ask".
 */
export async function handleDkghRelations(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  await answering(postMessage, 'dkgh:relations:result', msg, async () => {
    const repo = String(msg.repo ?? currentRepo() ?? '').trim();
    const number = Number(msg.number);
    if (!repo || !Number.isFinite(number)) return;
    postMessage({ type: 'dkgh:relations:result', ...(await fetchRelations(repo, number)) });
  });
}

/**
 * What happened to one issue, in order — screen 14's timeline.
 *
 * A second call, and only the full issue page makes it. The board does not
 * want a timeline and the peek does not want one: it is forty rows on a
 * three-week-old issue, and the peek is open for four seconds.
 */
export async function handleDkghTimeline(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  await answering(postMessage, 'dkgh:timeline:result', msg, async () => {
    const repo = String(msg.repo ?? currentRepo() ?? '').trim();
    const number = Number(msg.number);
    if (!repo || !Number.isFinite(number)) return;
    postMessage({ type: 'dkgh:timeline:result', ...(await fetchTimeline(repo, number)) });
  });
}


/**
 * Write the file screen 15 previewed.
 *
 * Text formats arrive already serialised — the CSV and the Markdown table are
 * built in the webview beside the preview that showed them, so what is written
 * is what was on screen rather than a second serialisation that can disagree
 * with the first.
 *
 * A workbook cannot work that way: it is a zip, and a webview has no zip. So
 * the sheets arrive as data and `services/gh/xlsx.ts` turns them into parts
 * here. That file is pure functions for the same reason the plan/apply split
 * exists elsewhere — a format nobody can test is a format nobody can trust.
 */
/**
 * The whole repository, paged — 15D.
 *
 * Runs in the background and reports every page, because the alternative on a
 * repository with two thousand issues is a spinner for two minutes. The
 * progress messages are fire-and-forget; the one that carries `done: true` is
 * the answer the screen waits on.
 *
 * **Cancel is a message, not a promise rejection.** The walk checks a flag
 * between pages, so pressing Cancel stops at a page boundary rather than
 * abandoning a request that GitHub has already been charged for.
 */
const harvesting = new Map<string, { cancelled: boolean }>();

export async function handleDkghHarvest(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  await answering(postMessage, 'dkgh:harvest:result', msg, async () => {
    const repo = String(msg.repo ?? currentRepo() ?? '').trim();
    if (!repo) return;

    /* One walk per repository. Starting a second would double the rate spend
       to produce the same file twice. */
    const running = harvesting.get(repo);
    if (running) { running.cancelled = true; }
    const token = { cancelled: false };
    harvesting.set(repo, token);

    const out = await harvest(repo, {
      cancelled: () => token.cancelled,
      onProgress: p => postMessage({ type: 'dkgh:harvest:progress', repo, ...p }),
    });

    harvesting.delete(repo);
    postMessage({ type: 'dkgh:harvest:result', ...out });
  });
}

/** Stop a walk that is already going. */
export async function handleDkghHarvestCancel(
  msg: Record<string, unknown>,
  _postMessage: PostMessage,
): Promise<void> {
  const repo = String(msg.repo ?? currentRepo() ?? '').trim();
  const running = harvesting.get(repo);
  if (running) running.cancelled = true;
}

/**
 * The schedules this machine keeps — 15E.
 *
 * Per repository, in the same small settings blob as everything else. There is
 * no daemon: `tick` is called on launch and once a minute while the panel is
 * up, and anything `due` returns is a run that was owed.
 */
export async function handleDkghSchedules(
  _msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  postMessage({ type: 'dkgh:schedules:result', schedules: state().schedules ?? [] });
}

/** Save one, replacing any schedule already on the same repository and view. */
export async function handleDkghSaveSchedule(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const next = msg.schedule as Schedule | undefined;
  if (!next?.repo) return;
  const rest = (state().schedules ?? [])
    .filter(s => !(s.repo === next.repo && s.view === next.view));
  const schedules = [...rest, next];
  saveState({ schedules });
  postMessage({ type: 'dkgh:schedules:result', schedules });
  /* A schedule turned on after its hour is owed straight away, and somebody
     who just pressed Schedule is expecting this week's file, not next week's. */
  tickSchedules(postMessage);
}

export async function handleDkghDeleteSchedule(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const repo = String(msg.repo ?? '');
  const view = String(msg.view ?? '');
  const schedules = (state().schedules ?? [])
    .filter(s => !(s.repo === repo && s.view === view));
  saveState({ schedules });
  postMessage({ type: 'dkgh:schedules:result', schedules });
}

/**
 * A scheduled run has produced its file — record which occurrence it was for.
 *
 * Recorded on success rather than when the run was handed out, so a failed
 * write is owed again on the next tick instead of being silently skipped.
 */
export async function handleDkghScheduleRan(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const repo = String(msg.repo ?? '');
  const view = String(msg.view ?? '');
  const forDay = String(msg.forDay ?? '');
  if (!repo || !forDay) return;
  const schedules = (state().schedules ?? []).map(s => (
    s.repo === repo && s.view === view ? { ...s, lastRunFor: forDay } : s
  ));
  saveState({ schedules });
  postMessage({ type: 'dkgh:schedules:result', schedules });
}

/**
 * Hand out every run that is owed.
 *
 * The webview builds the file, because the columns and the sheet shaping are
 * the same code a manual export uses and a second implementation of them here
 * would be a second thing to keep in step.
 */
export function tickSchedules(postMessage: PostMessage, now = new Date()): void {
  for (const s of state().schedules ?? []) {
    const forDay = due(s, now);
    if (!forDay) continue;
    postMessage({ type: 'dkgh:schedule:due', schedule: s, forDay: isoDay(forDay) });
  }
}

export async function handleDkghExport(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  await answering(postMessage, 'dkgh:export:result', msg, async () => {
    const filename = String(msg.filename ?? 'export.txt');
    const ext = filename.includes('.') ? filename.split('.').pop()! : 'txt';

    /*
      15E writes without asking.

      A scheduled export that opened a save dialog would be a scheduled export
      that blocks on somebody being at the keyboard on a Friday afternoon,
      which is the chore it exists to remove. The folder was chosen when the
      schedule was made, and the name never collides — see `unclashed`.
    */
    const given = typeof msg.path === 'string' ? msg.path.trim() : '';
    if (given) {
      try {
        fs.mkdirSync(path.dirname(given), { recursive: true });
        if (msg.sheets) await writeWorkbook(given, msg.sheets as Sheet[]);
        else if (msg.report) fs.writeFileSync(given, renderPdf(buildReport(msg.report as Report)));
        else fs.writeFileSync(given, String(msg.text ?? ''), 'utf-8');
        postMessage({ type: 'dkgh:export:result', path: given, scheduled: true });
      } catch (err) {
        postMessage({
          type: 'dkgh:export:result',
          scheduled: true,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(filename),
      filters: { [ext.toUpperCase()]: [ext], 'All Files': ['*'] },
      saveLabel: 'Save',
      title: 'Save the export',
    });
    /* Cancelling is an answer, and the screen has to hear it — a button that
       stays on "Saving\u2026" because somebody pressed Escape is a bug report. */
    if (!uri) { postMessage({ type: 'dkgh:export:result', cancelled: true }); return; }

    try {
      if (msg.sheets) {
        await writeWorkbook(uri.fsPath, msg.sheets as Sheet[]);
      } else if (msg.report) {
        /* A PDF is bytes, not text — and it is laid out here rather than in the
           webview because a page is a coordinate system, not a DOM. */
        fs.writeFileSync(uri.fsPath, renderPdf(buildReport(msg.report as Report)));
      } else {
        fs.writeFileSync(uri.fsPath, String(msg.text ?? ''), 'utf-8');
      }
      postMessage({ type: 'dkgh:export:result', path: uri.fsPath });
    } catch (err) {
      postMessage({
        type: 'dkgh:export:result',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

/** The parts, zipped. Resolves when the bytes are actually on disk. */
function writeWorkbook(path: string, sheets: Sheet[]): Promise<void> {
  return new Promise((resolve, reject) => {
    /* archiver 8 exports classes rather than the factory the older docs show:
       `archiver('zip')` is not a function here. */
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ZipArchive } = require('archiver');
    const out = fs.createWriteStream(path);
    const zip = new ZipArchive({ zlib: { level: 9 } });
    out.on('close', () => resolve());
    out.on('error', reject);
    zip.on('error', reject);
    zip.pipe(out);
    for (const part of workbookParts(sheets)) zip.append(part.content, { name: part.name });
    void zip.finalize();
  });
}


/**
 * Screen 18 — where the forms come from.
 *
 * Three sources and one shape. `parseIssueForms` in the webview does the rest,
 * which is the same parser the board uses, so what the import screen says a
 * file declares is what the board will read from it.
 */
/**
 * Another repository's field map, for 17E.
 *
 * The two halves of a map come from two places — the dimensions from its issue
 * forms, the Project fields from its board — and 17E has to report on both,
 * because "this repo has no Project" is one of the reasons a dimension cannot
 * be copied. Read together so the dialog cannot show a map that is half a
 * repository behind.
 *
 * Read-only on the source. Copying a map never touches the repository it came
 * from, and this is the call that guarantees that.
 */
export async function handleDkghFieldMap(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  await answering(postMessage, 'dkgh:fieldMap:result', msg, async () => {
    const repo = String(msg.repo ?? '').trim();
    if (!repo) return;

    const source = await fetchTemplatesFrom(repo);
    const parsed = parseIssueForms(source.files);
    const board = await fetchProject(repo);

    postMessage({
      type: 'dkgh:fieldMap:result',
      repo,
      dimensions: proposeDimensions(parsed.forms),
      /* Single-selects only. A date or a number is a Project field a board can
         read, but it is not a dimension anything groups by. */
      project: board.fields
        .filter(f => f.dataType === 'SINGLE_SELECT')
        .map(f => ({ name: f.name, options: (f.options ?? []).map(o => o.name) })),
      projectAbsent: board.absent,
      error: source.error,
    });
  });
}

export async function handleDkghImport(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  await answering(postMessage, 'dkgh:import:result', msg, async () => {
    /*
      Parsed here, with the parser the board uses.

      The webview could not do it — `js-yaml` and `issue-forms.ts` live on this
      side — and it should not: what the import screen says a file declares has
      to be what the board will read from it, and one parser is how that stays
      true.
    */
    const answer = (source: TemplateSource) => {
      const parsed = parseIssueForms(source.files);
      postMessage({
        type: 'dkgh:import:result',
        ...source,
        forms: parsed.forms,
        formErrors: parsed.errors,
        dimensions: proposeDimensions(parsed.forms),
      });
    };

    if (msg.source === 'starter') {
      answer({ files: starterSet(), from: 'a starter set dkgh wrote' });
      return;
    }

    if (msg.source === 'repo') {
      const from = String(msg.repo ?? '').trim();
      if (!from) { answer({ files: [], from: '', error: 'Name a repository first.' }); return; }
      answer(await fetchTemplatesFrom(from));
      return;
    }

    /*
      Files on disk. A zip and a folder of `.yml` are the same gesture to the
      person doing it, so they are one picker rather than two buttons.
    */
    /*
      "Cancelled" and "there is no picker" look identical from here, and the
      second one makes the button look broken rather than unavailable. The
      browser harness says which it is; a real extension host does not need to.
    */
    const noPicker =
      (vscode.window as unknown as { filePickerAvailable?: boolean }).filePickerAvailable === false;
    if (noPicker) {
      answer({
        files: [],
        from: '',
        error: 'File pickers are not available in the browser preview. Read from another '
          + 'repository or start from a template here, and use the picker in the VS Code '
          + 'extension.',
      });
      return;
    }

    const picked = await vscode.window.showOpenDialog({
      canSelectMany: true,
      openLabel: 'Import',
      filters: { 'Issue forms': ['yml', 'yaml', 'zip'] },
      title: 'Issue forms, or a zip of them',
    });
    if (!picked || picked.length === 0) { answer({ files: [], from: '' }); return; }

    const files: TemplateFile[] = [];
    for (const uri of picked) {
      const path = uri.fsPath;
      try {
        if (/\.zip$/i.test(path)) files.push(...readZip(fs.readFileSync(path)));
        else if (isForm(path)) {
          files.push({ file: path.split(/[\\/]/).pop() ?? 'form.yml',
            text: fs.readFileSync(path, 'utf-8') });
        }
      } catch {
        /* One unreadable file is not the others' problem — the screen counts
           what arrived against what was picked. */
      }
    }
    answer({ files, from: picked.length === 1 ? picked[0].fsPath : `${picked.length} files` });
  });
}

/**
 * What committing these would run, unrun — 18C.
 *
 * The other half of the rule the composer keeps: the commands are built here
 * and shown before anything happens, and `dkgh:applyTemplates` re-plans from
 * the same files rather than trusting an argv sent over the wire.
 */
export async function handleDkghPlanTemplates(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  await answering(postMessage, 'dkgh:planTemplates:result', msg, async () => {
    const repo = String(msg.repo ?? currentRepo() ?? '').trim();
    const files = (msg.files as TemplateFile[]) ?? [];
    const message = String(msg.message ?? 'Add issue forms');
    postMessage({
      type: 'dkgh:planTemplates:result',
      plan: await planTemplateCommit(repo, files, message),
    });
  });
}

/** Run it, re-planned here for the same reason every other apply re-plans. */
export async function handleDkghApplyTemplates(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  await answering(postMessage, 'dkgh:applyTemplates:result', msg, async () => {
    const repo = String(msg.repo ?? currentRepo() ?? '').trim();
    const files = (msg.files as TemplateFile[]) ?? [];
    const message = String(msg.message ?? 'Add issue forms');
    postMessage({ type: 'dkgh:applyTemplates:running' });
    const plan = await planTemplateCommit(repo, files, message);
    if (plan.refusal) {
      postMessage({ type: 'dkgh:applyTemplates:result', outcomes: [], refusal: plan.refusal });
      return;
    }
    postMessage({
      type: 'dkgh:applyTemplates:result',
      outcomes: await applyTemplateCommit(plan),
    });
  });
}


/**
 * What pushing the staged label edits would run — screen 19.
 *
 * The same plan/apply split the composer and the import screen use: built
 * here, shown before anything happens, and re-planned on apply rather than
 * running an argv that came over the wire.
 */
export async function handleDkghPlanLabels(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  await answering(postMessage, 'dkgh:planLabels:result', msg, async () => {
    const repo = String(msg.repo ?? currentRepo() ?? '').trim();
    const edits = (msg.edits as LabelEdit[]) ?? [];
    postMessage({ type: 'dkgh:planLabels:result', plan: planLabels(repo, edits) });
  });
}

/** Run it, and answer with the fresh set so the screen stops guessing. */
export async function handleDkghApplyLabels(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  await answering(postMessage, 'dkgh:applyLabels:result', msg, async () => {
    const repo = String(msg.repo ?? currentRepo() ?? '').trim();
    const edits = (msg.edits as LabelEdit[]) ?? [];
    postMessage({ type: 'dkgh:applyLabels:running' });

    const plan = planLabels(repo, edits);
    if (plan.refusal) {
      postMessage({ type: 'dkgh:applyLabels:result', outcomes: [], refusal: plan.refusal });
      return;
    }
    const outcomes = await applyLabels(plan);
    /* The set as GitHub now has it, so the screen shows what happened rather
       than what it hoped would happen. */
    postMessage({
      type: 'dkgh:applyLabels:result',
      outcomes,
      meta: await fetchRepoMeta(repo),
    });
  });
}



/**
 * A handler that cannot leave the screen waiting.
 *
 * Every `dkgh:*` case in the panel and the router is fire-and-forget — nothing
 * awaits them, so a throw becomes an unhandled rejection in a log nobody is
 * reading, and the screen that asked sits on "Uploading…" until somebody
 * reloads the window. gh failing is handled everywhere; the host itself
 * failing was not.
 *
 * The reply carries the same `:result` type the screen already listens for, so
 * no caller needs a second path for this.
 */
async function answering(
  postMessage: PostMessage,
  resultType: string,
  msg: Record<string, unknown>,
  work: () => Promise<void>,
): Promise<void> {
  try {
    await work();
  } catch (err) {
    /*
      The identity comes back with the failure.

      Several screens filter their own answers — `msg.number !== issue.number`,
      `msg.repo !== repo` — so a reply with only an error in it is a reply they
      drop, which is the same silence this exists to end.
    */
    postMessage({
      type: resultType,
      repo: msg.repo,
      number: msg.number,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * What uploading these screenshots would run — screen 12.
 *
 * The images arrive as base64 because a webview holds them as data URLs and
 * there is no file on disk to point at. Sizes are checked here rather than
 * there: the screen can offer a resize, but only the plan knows what the
 * contents API is about to be asked to swallow.
 */
export async function handleDkghPlanUpload(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  await answering(postMessage, 'dkgh:planUpload:result', msg, async () => {
    const repo = String(msg.repo ?? currentRepo() ?? '').trim();
    const files = (msg.files as EvidenceFile[]) ?? [];
    postMessage({ type: 'dkgh:planUpload:result', plan: await planUpload(repo, files) });
  });
}

/** Run it, re-planned here for the same reason every other apply re-plans. */
export async function handleDkghApplyUpload(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  await answering(postMessage, 'dkgh:applyUpload:result', msg, async () => {
    const repo = String(msg.repo ?? currentRepo() ?? '').trim();
    const files = (msg.files as EvidenceFile[]) ?? [];
    postMessage({ type: 'dkgh:applyUpload:running' });

    const plan = await planUpload(repo, files);
    if (plan.refusal) {
      postMessage({ type: 'dkgh:applyUpload:result', outcomes: [], refusal: plan.refusal });
      return;
    }
    postMessage({ type: 'dkgh:applyUpload:result', outcomes: await applyUpload(plan) });
  });
}


/**
 * The linked Project — screens 06 and 07.
 *
 * Asked for separately from the board rather than folded into it. A repository
 * with no project is the ordinary case and should not pay a GraphQL call on
 * every refresh to find that out again; the board renders on its own and gains
 * Status, Priority and the dates when this answers.
 */
export async function handleDkghProject(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  await answering(postMessage, 'dkgh:project:result', msg, async () => {
    const repo = String(msg.repo ?? currentRepo() ?? '').trim();
    if (!repo) return;
    postMessage({ type: 'dkgh:project:result', ...(await fetchProject(repo)) });
  });
}

/** What a drag would run, unrun — 06A's receipt, before the drop writes. */
export async function handleDkghPlanProject(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  await answering(postMessage, 'dkgh:planProject:result', msg, async () => {
    postMessage({
      type: 'dkgh:planProject:result',
      plan: planProjectEdit(String(msg.projectId ?? ''), (msg.edits as ProjectEdit[]) ?? []),
    });
  });
}

/** Run it, re-planned here for the same reason every other apply re-plans. */
export async function handleDkghApplyProject(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  await answering(postMessage, 'dkgh:applyProject:result', msg, async () => {
    const projectId = String(msg.projectId ?? '');
    const edits = (msg.edits as ProjectEdit[]) ?? [];
    postMessage({ type: 'dkgh:applyProject:running' });

    const plan = planProjectEdit(projectId, edits);
    if (plan.refusal) {
      postMessage({ type: 'dkgh:applyProject:result', outcomes: [], refusal: plan.refusal });
      return;
    }
    postMessage({ type: 'dkgh:applyProject:result', outcomes: await applyProjectEdit(plan) });
  });
}


/**
 * A terminal, where `gh` can be run by hand.
 *
 * The three screens that offer this — the network diagnosis, the mid-session
 * sign-out, the connection panel — all show a command and ask the reader to
 * run it. Installing software and authenticating are their actions, not ours,
 * so this opens a shell in the workspace and types nothing into it.
 *
 * It answers either way. A button that silently does nothing is what this was
 * before: the webview posted `terminal:open` and neither the panel nor the
 * router had ever heard of it.
 */
export async function handleDkghTerminal(
  _msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  try {
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri;
    const term = vscode.window.createTerminal({ name: 'gh', cwd });
    term.show();
    postMessage({ type: 'dkgh:terminal:result', ok: true });
  } catch (err) {
    postMessage({
      type: 'dkgh:terminal:result',
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * A screenshot, as bytes the webview is allowed to render.
 *
 * The webview cannot fetch the URL itself — its content policy forbids remote
 * images — and on a private repository the asset is behind the credential. So
 * it comes through gh and arrives as a data URI. See `services/gh/evidence.ts`
 * for the queue and the size cap.
 */
export async function handleDkghEvidence(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const url = String(msg.url ?? '').trim();
  if (!url) return;
  postMessage({ type: 'dkgh:evidence:result', ...(await fetchEvidence(url)) });
}

/**
 * Build the exact commands an edit would run, and send them back unrun.
 *
 * The half of the write path that never writes. The confirm screen renders what
 * comes back from here, and `dkgh:applyEdit` re-plans from the same request —
 * so the command shown and the command run are produced by one function, and a
 * screen that displays one thing while running another is not expressible.
 */
export async function handleDkghPlanEdit(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  await answering(postMessage, 'dkgh:planEdit:result', msg, async () => {
    const req = msg.request as EditRequest;
    postMessage({ type: 'dkgh:planEdit:result', plan: planEdit(req), request: req });
  });
}

/**
 * Run a plan the reader has seen.
 *
 * Re-planned here from the request rather than trusting an argv sent over the
 * wire: the webview is the one place a command could be tampered with between
 * being shown and being run, and re-deriving it costs nothing.
 */
export async function handleDkghApplyEdit(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  await answering(postMessage, 'dkgh:applyEdit:result', msg, async () => {
    const req = msg.request as EditRequest;
    const plan = planEdit(req);
    if (plan.empty) {
      postMessage({ type: 'dkgh:applyEdit:result', outcomes: [], allOk: false, partial: false });
      return;
    }
    postMessage({ type: 'dkgh:applyEdit:running', plan });
    const result = await applyPlan(plan);
    postMessage({ type: 'dkgh:applyEdit:result', ...result, repo: req.repo });
  });
}

/**
 * The lists a write chooses from — labels, milestones, assignable people.
 *
 * Asked once when the board opens rather than when a menu is clicked: a bulk
 * bar that spends two seconds fetching labels after you press Label is a bulk
 * bar people stop using.
 */
/**
 * Another repository's labels — 19D.
 *
 * Its own message rather than `dkgh:repoMeta` with a different repo, and that
 * is not tidiness. The board listens for `dkgh:repoMeta:result` and does not
 * check which repository it is about, so asking for the neighbour's meta
 * replaced the board's own: the import dialog then compared the source against
 * itself and reported "83 labels there, 83 here, all identical".
 *
 * A message nobody else is listening for cannot do that.
 */
export async function handleDkghLabelsFrom(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  await answering(postMessage, 'dkgh:labelsFrom:result', msg, async () => {
    const repo = String(msg.repo ?? '').trim();
    if (!repo) return;
    const meta = await fetchRepoMeta(repo);
    postMessage({
      type: 'dkgh:labelsFrom:result',
      repo,
      labels: meta.labels,
      /* `unavailable` is how fetchRepoMeta reports what it could not read. */
      error: meta.unavailable.includes('labels')
        ? `dkgh could not read ${repo}'s labels.`
        : undefined,
    });
  });
}

export async function handleDkghRepoMeta(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  await answering(postMessage, 'dkgh:repoMeta:result', msg, async () => {
    const repo = String(msg.repo ?? currentRepo() ?? '').trim();
    if (!repo) return;
    postMessage({ type: 'dkgh:repoMeta:result', ...(await fetchRepoMeta(repo)) });
  });
}

/**
 * Build the `gh issue create` an issue would be filed with, unrun.
 *
 * The composer's half of the same rule the bulk bar keeps: the command is built
 * here and shown before anything happens, and `dkgh:applyCreate` re-plans from
 * the same request rather than trusting an argv sent over the wire.
 */
export async function handleDkghPlanCreate(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  await answering(postMessage, 'dkgh:planCreate:result', msg, async () => {
    const req = msg.request as CreateRequest;
    postMessage({ type: 'dkgh:planCreate:result', plan: planCreate(req), request: req });
  });
}

/**
 * Run the sequence. Re-planned here, for the same reason `applyEdit` re-plans.
 *
 * `only` and `number` carry the retry from screen 13D — a subset of the steps,
 * against an issue that already exists. The create is never among them however
 * the request is shaped; see `applyCreate`.
 */
export async function handleDkghApplyCreate(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  await answering(postMessage, 'dkgh:applyCreate:result', msg, async () => {
    const req = msg.request as CreateRequest;
    const plan = planCreate(req);
    if (plan.refusal) {
      postMessage({ type: 'dkgh:applyCreate:result', outcomes: [], refusal: plan.refusal });
      return;
    }
    postMessage({ type: 'dkgh:applyCreate:running', plan });
    const result = await applyCreate(plan, {
      only: msg.only as StepKind[] | undefined,
      number: msg.number as number | undefined,
    });
    postMessage({ type: 'dkgh:applyCreate:result', ...result });
  });
}

/** The two static tables screens 02A and 02E render. */
export async function handleDkghCommands(postMessage: PostMessage): Promise<void> {
  postMessage({ type: 'dkgh:commands:result', commands: GH_COMMANDS, scopes: GH_SCOPES });
}

/** Everything screens 01–03 render, in one message. */
export async function handleDkghProbe(postMessage: PostMessage): Promise<void> {
  const env: GhEnv = await probeEnvironment();
  postMessage({
    type: 'dkgh:probe:result',
    env,
    /* Echoed so Settings can show what is actually in force without a second
       round trip — and so the UI can say "from the environment" when an env
       var is beating the saved setting, which is otherwise baffling. */
    configuredPath: state().ghPath,
    repo: currentRepo(),
    oldGhDismissed: state().oldGhDismissed ?? [],
    pinned: currentPinned(),
    envOverride: process.env.DAAKIA_GH || undefined,
  });
}

/**
 * Re-probe from scratch.
 *
 * The "Check again" button after somebody installs gh in another window, and
 * the poll while an install screen is open. Drops the memoised path first,
 * otherwise a successful earlier resolution would be reported forever.
 */
export async function handleDkghRecheck(postMessage: PostMessage): Promise<void> {
  forgetGh();
  const saved = state();
  setGhPath(saved.ghPath);
  await handleDkghProbe(postMessage);
}

/**
 * Set, or clear, the explicit path — the Settings field and "Locate gh
 * manually".
 *
 * Verified by running it before it is saved. A file called `gh.exe` is not
 * evidence of anything, and storing a path that does not work would turn the
 * next probe into a confusing failure with no obvious cause.
 */
export async function handleDkghSetPath(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const path = String(msg.path ?? '').trim();

  if (!path) {
    saveState({ ghPath: undefined });
    setGhPath(undefined);
    forgetGh();
    postMessage({ type: 'dkgh:setPath:result', ok: true, cleared: true });
    await handleDkghProbe(postMessage);
    return;
  }

  const check = await verifyGhPath(path);
  if (!check.ok) {
    /* Not saved. A path that does not run is not a preference, it is a typo. */
    postMessage({ type: 'dkgh:setPath:result', ok: false, path, error: check.error });
    return;
  }

  saveState({ ghPath: path });
  setGhPath(path);
  forgetGh();
  postMessage({
    type: 'dkgh:setPath:result',
    ok: true,
    path,
    version: check.version?.version,
  });
  await handleDkghProbe(postMessage);
}
