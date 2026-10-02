/**
 * The determinants that apply to one pod — yours and your team's.
 *
 * One hook so the three places that answer them agree on which: the Summary
 * panel over a pod's log, the Window's rail, and Settings' preview. Each used
 * to pick its own set, and a question that answered in one and not in another
 * is a question nobody trusts in either.
 */
import { useMemo } from 'react';
import { useCatalogue, type CataloguePattern } from '../../store/dk8s-logger-store';
import { useTeamDeterminants, isTeamOn, type TeamDeterminant } from '../../store/dk8s-team-store';
import { determinantsFor, podScope, type ScopeTarget } from './determinants';
import { scopeOf } from './LoggersTab';

/** The scopes an open pod answers to. Undefined with no pod: only `*` applies. */
export function scopeTargetOf(pod: {
  name: string; namespace: string; context?: string; workload?: { kind: string; name: string };
} | undefined): ScopeTarget | undefined {
  return pod ? { workload: scopeOf(pod), pod: podScope(pod) } : undefined;
}

export interface PodDeterminants {
  /** Yours that apply here, on or off. */
  mine: CataloguePattern[];
  /** Your team's that apply here, on or off. */
  team: TeamDeterminant[];
  /** What a window answers by default: every one of those that is on. */
  enabled: CataloguePattern[];
}

export function useDeterminantsFor(pod: Parameters<typeof scopeTargetOf>[0]): PodDeterminants {
  const catalogue = useCatalogue();
  const { all, off } = useTeamDeterminants();
  const target = scopeTargetOf(pod);
  /* Keyed on the two strings, not the pod object, which is a new object on
     every poll of the grid. */
  const workload = target?.workload;
  const podKey = target?.pod;

  return useMemo(() => {
    const t = workload !== undefined && podKey !== undefined ? { workload, pod: podKey } : undefined;
    const mine = determinantsFor(catalogue.patterns, t);
    const team = all.filter(d => determinantsFor([d.pattern], t).length > 0);
    const enabled = [
      ...mine.filter(p => !p.summary!.off),
      ...team.filter(d => isTeamOn(d, off)).map(d => d.pattern),
    ];
    return { mine, team, enabled };
  }, [catalogue, all, off, workload, podKey]);
}
