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
import { getSetting, setSetting } from '../../../storage/db';
import { getActiveWorkspaceId } from '../../../storage/workspaces';
import {
  probeEnvironment, setGhPath, verifyGhPath, forgetGh, probeReachability,
  searchCommonLocations, onAuthFailure, type GhEnv,
} from '../../../services/gh/gh';
import { fetchBoard } from '../../../services/gh/board';
import { guessFromWorkspace, searchRepos, summarise } from '../../../services/gh/repos';
import { planEdit, applyPlan, type EditRequest } from '../../../services/gh/write';
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
  const [guess, recent, pinned] = await Promise.all([
    guessFromWorkspace(workspaceFolder()),
    /* Pinned entries are lifted out of Recent rather than shown twice. */
    summarise(currentRecent().filter(r => !pins.includes(r))),
    summarise(pins),
  ]);
  postMessage({ type: 'dkgh:repoOptions:result', guess, recent, pinned });
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
  postMessage({ type: 'dkgh:diagnose:loading' });
  postMessage({ type: 'dkgh:diagnose:result', ...(await probeReachability()) });
}

/** "Search common locations", for the machine where gh came out of a zip. */
export async function handleDkghFindGh(postMessage: PostMessage): Promise<void> {
  postMessage({ type: 'dkgh:findGh:loading' });
  postMessage({ type: 'dkgh:findGh:result', found: await searchCommonLocations() });
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
  const query = String(msg.query ?? '').trim();
  postMessage({ type: 'dkgh:searchRepos:loading', query });
  const result = await searchRepos(query, { includeArchived: msg.includeArchived === true });
  postMessage({ type: 'dkgh:searchRepos:result', query, ...result });
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
  const req = msg.request as EditRequest;
  postMessage({ type: 'dkgh:planEdit:result', plan: planEdit(req), request: req });
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
  const req = msg.request as EditRequest;
  const plan = planEdit(req);
  if (plan.empty) {
    postMessage({ type: 'dkgh:applyEdit:result', outcomes: [], allOk: false, partial: false });
    return;
  }
  postMessage({ type: 'dkgh:applyEdit:running', plan });
  const result = await applyPlan(plan);
  postMessage({ type: 'dkgh:applyEdit:result', ...result, repo: req.repo });
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
