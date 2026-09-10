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
import { fetchTimeline } from '../../../services/gh/timeline';
import { workbookParts, type Sheet } from '../../../services/gh/xlsx';
import {
  applyTemplateCommit, fetchTemplatesFrom, isForm, planTemplateCommit, readZip, starterSet,
  type TemplateFile, type TemplateSource,
} from '../../../services/gh/templates';
import { parseIssueForms, proposeDimensions } from '../../../services/gh/issue-forms';
import { applyLabels, planLabels, type LabelEdit } from '../../../services/gh/labels';
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
  const repo = String(msg.repo ?? '').trim();
  if (!repo) return;
  postMessage({ type: 'dkgh:inspectRepo:loading', repo });
  postMessage({ type: 'dkgh:inspectRepo:result', ...(await inspectRepo(repo)) });
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
  const repo = String(msg.repo ?? currentRepo() ?? '').trim();
  const query = String(msg.query ?? '').trim();
  if (!repo || !query) return;
  postMessage({ type: 'dkgh:searchIssues:loading', query });
  const result = await searchIssues(repo, query, { comments: msg.comments === true });
  postMessage({ type: 'dkgh:searchIssues:result', ...result });
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
  const repo = String(msg.repo ?? currentRepo() ?? '').trim();
  const number = Number(msg.number);
  if (!repo || !Number.isFinite(number)) return;
  postMessage({ type: 'dkgh:issue:result', ...(await fetchIssueDetail(repo, number)) });
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
  const repo = String(msg.repo ?? currentRepo() ?? '').trim();
  const number = Number(msg.number);
  if (!repo || !Number.isFinite(number)) return;
  postMessage({ type: 'dkgh:timeline:result', ...(await fetchTimeline(repo, number)) });
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
export async function handleDkghExport(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const filename = String(msg.filename ?? 'export.txt');
  const ext = filename.includes('.') ? filename.split('.').pop()! : 'txt';

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
export async function handleDkghImport(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
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
  const repo = String(msg.repo ?? currentRepo() ?? '').trim();
  const files = (msg.files as TemplateFile[]) ?? [];
  const message = String(msg.message ?? 'Add issue forms');
  postMessage({
    type: 'dkgh:planTemplates:result',
    plan: await planTemplateCommit(repo, files, message),
  });
}

/** Run it, re-planned here for the same reason every other apply re-plans. */
export async function handleDkghApplyTemplates(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
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
  const repo = String(msg.repo ?? currentRepo() ?? '').trim();
  const edits = (msg.edits as LabelEdit[]) ?? [];
  postMessage({ type: 'dkgh:planLabels:result', plan: planLabels(repo, edits) });
}

/** Run it, and answer with the fresh set so the screen stops guessing. */
export async function handleDkghApplyLabels(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
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

/**
 * The lists a write chooses from — labels, milestones, assignable people.
 *
 * Asked once when the board opens rather than when a menu is clicked: a bulk
 * bar that spends two seconds fetching labels after you press Label is a bulk
 * bar people stop using.
 */
export async function handleDkghRepoMeta(
  msg: Record<string, unknown>,
  postMessage: PostMessage,
): Promise<void> {
  const repo = String(msg.repo ?? currentRepo() ?? '').trim();
  if (!repo) return;
  postMessage({ type: 'dkgh:repoMeta:result', ...(await fetchRepoMeta(repo)) });
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
  const req = msg.request as CreateRequest;
  postMessage({ type: 'dkgh:planCreate:result', plan: planCreate(req), request: req });
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
