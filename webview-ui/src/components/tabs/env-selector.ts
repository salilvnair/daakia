/**
 * Which environment the toolbar selector shows.
 *
 * Small enough to have looked like it did not need saying, which is how it came
 * to be wrong: the fallback was `envOptions[0]`, so a tab that had not been
 * given an environment of its own displayed whichever one happened to sort
 * first. The Environments panel meanwhile showed the real active environment
 * with a tick beside it — two controls claiming to state the same fact, and
 * disagreeing whenever the active one was not first in the list.
 *
 * Separated from TabBar so the rule is one function with a test on it rather
 * than a ternary in the middle of a render.
 */

export const GLOBAL = 'global';

export function selectedEnvId({ tabEnvId, activeEnvId, options }: {
  /** The environment this tab was given, if any. */
  tabEnvId?: string | null;
  /** What the store says is active. */
  activeEnvId?: string | null;
  /** The selectable environments — global is not among them. */
  options: { value: string }[];
}): string {
  /* A tab's own choice wins: picking an environment for one request is the
     point of a per-tab selector. */
  if (tabEnvId && tabEnvId !== GLOBAL) return tabEnvId;

  /* Otherwise the active one — but only if it is still selectable. Global
     always applies and is not a choice, and a deleted environment's id would
     leave the control blank anyway. */
  if (activeEnvId && activeEnvId !== GLOBAL && options.some(o => o.value === activeEnvId)) {
    return activeEnvId;
  }

  return '';
}
