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
import { getSetting, setSetting } from '../../../storage/db';
import { probeEnvironment, setGhPath, verifyGhPath, forgetGh, type GhEnv } from '../../../services/gh/gh';

type PostMessage = (msg: unknown) => void;

const KEY = 'dkgh';

/** Persisted across sessions. Deliberately small. */
export interface DkghState {
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
export function initDkgh(): void {
  const saved = state();
  if (saved.ghPath) setGhPath(saved.ghPath);
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
