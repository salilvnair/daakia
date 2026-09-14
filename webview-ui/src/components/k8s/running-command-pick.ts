/**
 * Which command a loader may show — the decision, on its own.
 *
 * Separated from the component so it can be held to by a test. It is the whole
 * of the rule, and everything the component does with the result is layout.
 */
import type { KubectlCommand } from '../../store/k8s-store';

/**
 * How long a finished command stays on a loader after it ends.
 *
 * Long enough to read what a fast refusal said — a forbidden `get pods` comes
 * back in under a second and its message is the whole answer — and short
 * enough that it is gone before the next screen.
 */
export const SETTLED_GRACE_MS = 4_000;

/**
 * What kind of screen is asking.
 *
 * `waiting` is a loader: it wants the line it is waiting on, so a command must
 * still be running or have only just finished. Anything older belongs to
 * something else — including the backlog the host replays into a panel that
 * opened after the commands had run, which is how a fresh start came up with a
 * finished command's error under a spinner that had only just begun.
 *
 * `settled` is a screen showing a RESULT — "slow-lab did not answer". The
 * command that produced that result has by definition finished, and it is the
 * whole point of the screen: it is where "it works in my terminal" starts.
 * Ageing it out there leaves the failure with nothing to check it against,
 * which is the one place that was never acceptable.
 */
export type CommandMode = 'waiting' | 'settled';

export function showable({ commands, context, now, match, mode = 'waiting' }: {
  commands: KubectlCommand[];
  /** The cluster the screen is about. */
  context?: string;
  now: number;
  /** Only commands whose verb starts with this — `get pods`, `auth can-i`. */
  match?: string;
  mode?: CommandMode;
}): KubectlCommand | undefined {
  const fits = commands.filter(c => {
    if (match && !c.what.startsWith(match)) return false;
    /* A command with no context belongs to no cluster — `config get-contexts`
       is the honest answer on the screen that lists them — so it is never
       filtered out by one. */
    if (context && c.context && c.context !== context) return false;
    if (mode === 'settled') return true;
    /* Still running, or only just finished. */
    return c.ms === undefined || now - c.at <= SETTLED_GRACE_MS;
  });
  return fits[fits.length - 1];
}
