/**
 * What Enter means in the namespace filter box.
 *
 * ── Why this needed deciding at all ──
 *
 * The box does two jobs: it filters the list, and it is where you type a
 * namespace the cluster would not list. An account scoped to one namespace
 * cannot list namespaces, so on those clusters typing is the *only* way in —
 * and Enter did nothing. You typed the name, the screen said it was not
 * listed, offered "+ Add and save", and the key everybody presses at the end
 * of typing was ignored.
 *
 * ── Why it is not simply "press the first button" ──
 *
 * With several clusters selected, the same name can be missing from one and
 * present in another, and the buttons say WHERE for that reason. Enter has no
 * way to say where, so it commits only when there is exactly one thing it
 * could mean. Ambiguity leaves the buttons to answer it — they are on screen
 * and they are labelled.
 */

export interface EnterOffer {
  context: string;
  namespaces: string[];
  pinned: string[];
}

export type EnterIntent =
  /** Pin and select a name this cluster did not list. */
  | { kind: 'add'; context: string }
  /** Tick a name that is already on offer — Enter after filtering to one. */
  | { kind: 'tick'; context: string; namespace: string }
  /** Nothing unambiguous to do; the buttons on screen say more than a guess. */
  | { kind: 'none' };

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function enterIntent(typed: string, offers: EnterOffer[]): EnterIntent {
  const name = typed.trim();
  if (!name) return { kind: 'none' };

  /* Clusters that already know this name, matched exactly — a filter narrowed
     to one row means Enter can tick that row. A prefix is not enough: "kube"
     matches four namespaces and Enter must not pick one of them. */
  const known = offers.filter(o =>
    o.namespaces.some(ns => eq(ns, name)) || o.pinned.some(ns => eq(ns, name)));
  if (known.length === 1) {
    /* Answer with the cluster's own spelling, not the one that was typed. */
    const o = known[0];
    const actual = [...o.namespaces, ...o.pinned].find(ns => eq(ns, name)) ?? name;
    return { kind: 'tick', context: o.context, namespace: actual };
  }
  if (known.length > 1) return { kind: 'none' };

  /*
    Nothing matches it exactly, so this would be the add case — but "kube" does
    not match anything exactly either, and it is obviously half-typed. Adding
    there would pin a namespace that does not exist and start a watch on it.

    So: only add when the box is not still narrowing a list. If anything on
    offer begins with what was typed, the person is filtering, and Enter waits.
  */
  const stillFiltering = offers.some(o =>
    [...o.namespaces, ...o.pinned].some(ns => ns.toLowerCase().startsWith(name.toLowerCase())));
  if (stillFiltering) return { kind: 'none' };

  /* Nobody lists it and nobody is about to — add it, if there is exactly one
     cluster on screen to add it to. */
  if (offers.length === 1) return { kind: 'add', context: offers[0].context };

  return { kind: 'none' };
}
