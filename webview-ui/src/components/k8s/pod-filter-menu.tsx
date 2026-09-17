/**
 * The filter, as menu rows.
 *
 * ── Why this is shared and not written twice ──
 *
 * Two menus offer it: the pod grid's background, and a pod's own right-click.
 * They are built in different files by different components, and the first
 * version of this existed only in the first of them — so the filter was
 * reachable by right-clicking the gap between cards and not by right-clicking
 * a card, which is the harder target to hit on purpose.
 *
 * Written twice they would drift: a facet added to one, a count fixed in the
 * other. One builder, called from both.
 *
 * ── Why the menu is not the whole filter ──
 *
 * A menu shows one level at a time and closes on the first choice, which is
 * right for "narrow to this one thing" and wrong for building up three
 * narrowings or seeing what is already on. That is what the panel behind the
 * toolbar button is for. These rows are the shortcut, not the interface.
 */
import {
  CheckIcon, FilterIcon, FilterOffIcon, LayersIcon, ServerIcon, FolderIcon, TagIcon,
} from '../../icons';
import type { PodSummary } from '../../store/k8s-store';
import {
  facetOptions, kindCounts, toggleFacet, isEmptyFilter, NO_POD_FILTER,
  type PodFacet, type PodFilter, type PodKind,
} from './pod-filter';

/** One row of a dk8s menu — the shape both call sites already build. */
export interface MenuRow {
  id: string;
  label: string;
  icon?: React.ReactNode;
  iconColor?: string;
  shortcut?: string;
  description?: string;
  danger?: boolean;
  onClick?: () => void;
  children?: MenuRow[];
}

const KINDS: { id: PodKind; label: string }[] = [
  { id: 'all', label: 'All pods' },
  { id: 'pods', label: 'Pods' },
  { id: 'runs', label: 'CronJob runs' },
];

/**
 * Widest first, the same order the panel lists them in, each with the icon it
 * wears everywhere else — a cluster is a server, a namespace a folder, an app
 * a tag. Every row in a dk8s menu carries a coloured icon; four that did not
 * read as a submenu that had not finished loading.
 */
const FACETS: { id: PodFacet; label: string; Icon: typeof ServerIcon }[] = [
  { id: 'contexts', label: 'Cluster', Icon: ServerIcon },
  { id: 'namespaces', label: 'Namespace', Icon: FolderIcon },
  { id: 'workloads', label: 'App', Icon: TagIcon },
];

/**
 * How many values a facet must offer before it is worth a submenu.
 *
 * One value narrows nothing — every pod on screen already has it — so a
 * `Cluster ▸ kind-dk8s-prod` on a single-cluster view is a submenu that cannot
 * change the list. Watching one cluster is the common case, and this is what
 * keeps the menu from growing a row for it.
 */
const WORTH_OFFERING = 2;

/**
 * The `Filter` row, with everything under it.
 *
 * Returns nothing when there is nothing to offer — no pods, or a single
 * cluster with a single namespace and a single app, where every facet would be
 * a dead end and `Type` is the only live choice.
 */
export function filterMenuRow(
  pods: PodSummary[],
  filter: PodFilter,
  setFilter: (f: PodFilter) => void,
  /** The tick beside a chosen value, and the `Filter` row's own funnel. */
  iconColor: string,
  /** The facets, which narrow. Defaults to the menu's "narrows" tone. */
  narrowColor = 'var(--color-ctx-close-batch)',
  /** `Clear filter`, which undoes. Defaults to the menu's "destroys" tone. */
  clearColor = 'var(--color-ctx-close)',
): MenuRow | undefined {
  if (!pods.length) return undefined;

  const kinds = kindCounts(pods, filter);
  const children: MenuRow[] = [{
    id: 'filter-type',
    label: 'Type',
    icon: <LayersIcon size={13} />,
    iconColor: narrowColor,
    children: KINDS.map(k => ({
      id: `kind-${k.id}`,
      label: k.label,
      icon: filter.kind === k.id ? <CheckIcon size={13} /> : undefined,
      iconColor,
      /* The count on the right, where a shortcut would go — a quantity, so it
         reads as one rather than as part of the name. */
      shortcut: String(kinds[k.id]),
      onClick: () => setFilter({ ...filter, kind: k.id }),
    })),
  }];

  for (const facet of FACETS) {
    const options = facetOptions(pods, filter, facet.id);
    if (options.length < WORTH_OFFERING) continue;
    children.push({
      id: `filter-${facet.id}`,
      label: facet.label,
      icon: <facet.Icon size={13} />,
      iconColor: narrowColor,
      children: options.map(o => ({
        id: `${facet.id}-${o.value}`,
        label: o.value,
        icon: filter[facet.id].includes(o.value) ? <CheckIcon size={13} /> : undefined,
        iconColor,
        shortcut: String(o.count),
        onClick: () => setFilter(toggleFacet(filter, facet.id, o.value)),
      })),
    });
  }

  /* Last, and only when it would do something. A Clear that is always there
     reads as a thing you have left undone. */
  if (!isEmptyFilter(filter)) {
    children.push({
      id: 'filter-clear',
      label: 'Clear filter',
      /* The funnel with a cross through it: a plain X here would read as
         "close the menu" beside four rows that choose things. Red, because it
         is the row that undoes what the others did. */
      icon: <FilterOffIcon size={13} />,
      iconColor: clearColor,
      onClick: () => setFilter(NO_POD_FILTER),
    });
  }

  return {
    id: 'filter',
    label: 'Filter',
    icon: <FilterIcon size={13} />,
    iconColor,
    children,
  };
}
