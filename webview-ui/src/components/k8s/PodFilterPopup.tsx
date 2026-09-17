/**
 * The filter, as a panel you can see all of at once.
 *
 * ── Why a popup and not more menu ──
 *
 * The background menu offers the same facets, and a menu is the right shape
 * for "narrow to this one thing" — you already know what you want, you right
 * click, you pick it. It is the wrong shape for the other half of the job:
 * seeing what is currently on, taking one of three things back off, or
 * discovering that `namespace` is something you can filter by at all. A menu
 * shows one level at a time and closes the moment you choose, so checking what
 * you told it means opening it again and reading down two submenus.
 *
 * This shows every facet at once, with what is chosen already ticked and the
 * counts beside each value, and stays open while several choices are made.
 *
 * ── Why it is portalled and fixed ──
 *
 * It was an absolutely-positioned child of the toolbar, which put it inside
 * the grid's own `overflow: hidden` — so it was in the DOM, the right size,
 * and clipped. Anchored popups in this app go to the body and position
 * themselves against the trigger's rect, the way dui's own select does, and
 * this one now does the same: no ancestor can clip it and no stacking context
 * can bury it.
 *
 * ── Why the counts move ──
 *
 * Each facet counts against what the OTHER facets already allow, so a number
 * says what picking it would actually leave. Picking `prod` and watching
 * `orders` drop from 6 to 3 is the filter explaining itself.
 */
import { useMemo, useRef, useEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { IconSize } from '@salilvnair/dui';
import {
  CheckIcon, CloseIcon, FilterOffIcon, LayersIcon, Dk8sIcon, FolderIcon, TagIcon,
  ChevronDownIcon, ChevronRightIcon,
} from '../../icons';
import { useK8sStore, type PodSummary } from '../../store/k8s-store';
import {
  facetOptions, kindCounts, toggleFacet, isEmptyFilter, matchOptions, NO_POD_FILTER,
  type FacetOption, type PodFacet, type PodFilter, type PodKind,
} from './pod-filter';
import { ACCENT } from './tone';

/** The same amber the menu rows wear, so the two read as one feature. */
const FACET_TONE = 'var(--color-ctx-close-batch)';

/**
 * The facets, in the order they narrow.
 *
 * Widest first: a cluster holds namespaces, a namespace holds apps. Reading
 * down the panel is the same movement as narrowing down the fleet, and the
 * counts to the right shrink as you go.
 */
const FACETS: {
  id: PodFacet; label: string; hint: string; find: string; Icon: typeof Dk8sIcon;
}[] = [
  {
    id: 'contexts', label: 'Cluster', Icon: Dk8sIcon,
    hint: 'Which cluster the pod is in',
    /* Spelt out per facet rather than built from the label — `Find a ${label}`
       gives "Find a app", and an article that does not agree is the kind of
       thing that makes a panel feel unfinished. */
    find: 'Find a cluster…',
  },
  {
    id: 'namespaces', label: 'Namespace', Icon: FolderIcon,
    hint: 'Which namespace it lives in',
    find: 'Find a namespace…',
  },
  {
    id: 'workloads', label: 'App', Icon: TagIcon,
    hint: 'The Deployment, StatefulSet or CronJob behind it',
    find: 'Find an app…',
  },
];

const KINDS: { id: PodKind; label: string }[] = [
  { id: 'all', label: 'All pods' },
  { id: 'pods', label: 'Pods' },
  { id: 'runs', label: 'CronJob runs' },
];

const WIDTH = 300;

/**
 * How tall the panel may get.
 *
 * Generous, because the alternative is worse. Capping it low and letting each
 * facet scroll inside its own box gave the panel two scrollbars side by side —
 * one for the facet, one for the panel — and a reader who scrolls the wrong
 * one sees nothing move. Taller, with the long facets folded away, is one
 * scrollbar and usually none.
 */
const MAX_H = 640;
const MARGIN = 8;

/**
 * Past this many values a facet opens folded.
 *
 * ── Why folding rather than a scrollbox each ──
 *
 * Ninety apps makes the App list the whole panel, and Cluster and Namespace —
 * two rows each, the ones actually reached for — get pushed off the top. The
 * first fix was to cap each facet and let it scroll inside itself, which
 * solved that and bought a worse problem: two scrollbars, a finger's width
 * apart, and no way to tell which one you are about to move.
 *
 * Folded, a long facet costs one row until it is asked for. Three or fewer
 * stays open because folding those hides nothing worth hiding and costs a
 * click to see two lines.
 */
const ROWS_BEFORE_FOLD = 3;

/**
 * And past this many values, reading the list is no longer the way to use it.
 *
 * A dozen you skim; ninety you find. The box appears only when it would earn
 * its two rows of height.
 */
const ROWS_BEFORE_SEARCH = 8;

function Row({ label, count, on, onClick }: {
  label: string; count: number; on: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="flex items-center gap-2 w-full px-2 py-1 rounded text-[11.5px] cursor-pointer border-none bg-transparent text-left"
      style={{ color: on ? ACCENT : 'var(--color-text-secondary)', fontWeight: on ? 600 : 400 }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{ width: 13, display: 'flex', flexShrink: 0 }}>
        {on && <CheckIcon size={13} color={ACCENT} />}
      </span>
      <span className="flex-1 truncate font-mono">{label}</span>
      {/* The number that says what picking this would leave. */}
      <span className="text-[10px] tabular-nums shrink-0"
            style={{ color: 'var(--color-text-muted)' }}>
        {count}
      </span>
    </button>
  );
}

function Heading({ label, hint, Icon, count, open, chosen, onToggle }: {
  label: string; hint?: string; Icon: typeof Dk8sIcon;
  count?: number; open?: boolean; chosen?: number;
  onToggle?: () => void;
}) {
  const body = (
    <>
      {onToggle && (
        open
          ? <ChevronDownIcon size={10} color="currentColor" />
          : <ChevronRightIcon size={10} color="currentColor" />
      )}
      <Icon size={11} color={FACET_TONE} />
      {label}
      {/* How many are in there, so a folded facet says what it is hiding. */}
      {count !== undefined && count > ROWS_BEFORE_FOLD && (
        <span className="tabular-nums" style={{ opacity: 0.7 }}>{count}</span>
      )}
      {/* And how many are chosen, because a narrowing folded out of sight
          would otherwise leave nothing on this row to say it is on. */}
      {!!chosen && (
        <span className="tabular-nums px-1 rounded"
              style={{
                color: ACCENT,
                background: `color-mix(in srgb, ${ACCENT} 16%, transparent)`,
              }}>
          {chosen}
        </span>
      )}
    </>
  );

  const cls = 'flex items-center gap-1.5 w-full text-[9.5px] uppercase tracking-wider px-2 pb-0.5';
  return onToggle ? (
    <button type="button" onClick={onToggle} title={hint}
            className={`${cls} cursor-pointer border-none bg-transparent text-left`}
            style={{ color: 'var(--color-text-muted)' }}>
      {body}
    </button>
  ) : (
    <span className={cls} title={hint} style={{ color: 'var(--color-text-muted)' }}>
      {body}
    </span>
  );
}

/**
 * One facet: a heading, a search once it is long, and its own scroll.
 *
 * The search is per-facet rather than one box for the panel because the
 * question is "which app", not "which of these hundred and six strings" — a
 * single box would match a namespace while you were looking for a Deployment
 * and quietly change what the other three facets were offering.
 */
function Facet({ label, hint, find, Icon, options, chosen, onPick }: {
  label: string;
  hint: string;
  find: string;
  Icon: typeof Dk8sIcon;
  options: FacetOption[];
  chosen: string[];
  onPick: (value: string) => void;
}) {
  const [query, setQuery] = useState('');
  /*
    Long facets open folded, and one with a choice in it opens anyway.

    Folding away a narrowing that is currently on would hide the reason the
    grid is short, in the panel whose whole job is to say why.
  */
  const [open, setOpen] = useState(
    () => options.length <= ROWS_BEFORE_FOLD || chosen.length > 0,
  );
  const shown = useMemo(() => matchOptions(options, query, chosen), [options, query, chosen]);

  return (
    <section className="flex flex-col gap-0.5">
      <Heading
        label={label} hint={hint} Icon={Icon}
        count={options.length}
        chosen={chosen.length}
        open={open}
        onToggle={options.length > ROWS_BEFORE_FOLD ? () => setOpen(v => !v) : undefined}
      />

      {open && options.length >= ROWS_BEFORE_SEARCH && (
        <div className="px-2 pb-1">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={find}
            className="w-full text-[11px] px-2 py-1 rounded font-mono"
            style={{
              background: 'var(--color-panel)',
              border: '1px solid var(--color-surface-border)',
              color: 'var(--color-text-primary)',
              outline: 'none',
            }}
          />
        </div>
      )}

      {/* No inner scroll: the panel has one scrollbar and this is not it. */}
      {open && (
        <div>
          {shown.map(o => (
            <Row
              key={o.value} label={o.value} count={o.count}
              on={chosen.includes(o.value)}
              onClick={() => onPick(o.value)}
            />
          ))}
          {/* A search that matches nothing says so, rather than leaving a gap
              where the list was and no sign the query is why. */}
          {!shown.length && (
            <span className="block px-2 py-1 text-[10.5px]"
                  style={{ color: 'var(--color-text-muted)' }}>
              Nothing matches &ldquo;{query.trim()}&rdquo;.
            </span>
          )}
        </div>
      )}
    </section>
  );
}

export function PodFilterPopup({ pods, anchorRef, onClose }: {
  /** Everything the grid could show — before this filter, after the text box. */
  pods: PodSummary[];
  /** The button this hangs from; also the one click that must not close it. */
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const filter = useK8sStore(s => s.podFilter);
  const setFilter = useK8sStore(s => s.setPodFilter);
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ top: number; left: number; maxHeight: number }>();

  /* Glued to the trigger, and re-measured while the window moves under it. */
  useEffect(() => {
    const place = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - MARGIN - 6;
      const above = r.top - MARGIN - 6;
      const down = below >= Math.min(MAX_H, above);
      const maxHeight = Math.max(160, Math.min(MAX_H, down ? below : above));
      setAt({
        top: down ? r.bottom + 6 : Math.max(MARGIN, r.top - 6 - maxHeight),
        /* Left-aligned to the button, pulled back in when that would hang it
           off the right-hand edge of a narrow panel. */
        left: Math.max(MARGIN, Math.min(r.left, window.innerWidth - WIDTH - MARGIN)),
        maxHeight,
      });
    };
    place();
    window.addEventListener('scroll', place, { passive: true, capture: true });
    window.addEventListener('resize', place, { passive: true });
    return () => {
      window.removeEventListener('scroll', place, { capture: true });
      window.removeEventListener('resize', place);
    };
  }, [anchorRef]);

  /*
    Click anywhere else to put it away. Escape too: it is a panel over the
    grid, and the grid is what the reader is trying to get back to.

    The trigger counts as inside. It has its own toggle, and letting this see
    that click as an outside one made the two fight — one closing what the
    other had just opened, on the same press.
  */
  useEffect(() => {
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', key);
    };
  }, [onClose, anchorRef]);

  const kinds = useMemo(() => kindCounts(pods, filter), [pods, filter]);
  const options = useMemo(() => Object.fromEntries(
    FACETS.map(f => [f.id, facetOptions(pods, filter, f.id)]),
  ) as Record<PodFacet, ReturnType<typeof facetOptions>>, [pods, filter]);

  const empty = isEmptyFilter(filter);
  if (!at) return null;

  return createPortal(
    <div
      ref={box}
      className="rounded-lg overflow-hidden flex flex-col"
      style={{
        position: 'fixed', top: at.top, left: at.left,
        width: WIDTH, maxHeight: at.maxHeight, zIndex: 1000,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-surface-border)',
        boxShadow: '0 10px 30px rgba(0,0,0,.38)',
      }}
    >
      <div className="flex items-center gap-2 px-3 py-2 shrink-0"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <span className="text-[11.5px] flex-1"
              style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
          Filter pods
        </span>
        {/* Only offered when there is something to clear — a permanently
            visible Clear on an untouched filter reads as a thing you have
            forgotten to do. */}
        {!empty && (
          <button type="button" onClick={() => setFilter(NO_POD_FILTER)}
                  title="Remove every narrowing"
                  className="flex items-center gap-1 text-[10.5px] cursor-pointer border-none bg-transparent px-1"
                  style={{ color: 'var(--color-error)' }}>
            <FilterOffIcon size={11} color="currentColor" />
            Clear
          </button>
        )}
        <button type="button" onClick={onClose} title="Close"
                className="dk-close-btn p-0.5 rounded cursor-pointer border-none bg-transparent flex">
          <CloseIcon size={IconSize.inline} color="currentColor" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-1.5 py-2 flex flex-col gap-2.5">
        <section className="flex flex-col gap-0.5">
          <Heading label="Type" Icon={LayersIcon} />
          {KINDS.map(k => (
            <Row
              key={k.id} label={k.label} count={kinds[k.id]}
              on={filter.kind === k.id}
              onClick={() => setFilter({ ...filter, kind: k.id })}
            />
          ))}
        </section>

        {FACETS.map(f => {
          const rows = options[f.id];
          /* A facet with one value narrows nothing — every pod on screen
             already has it. Offering it is a control that cannot change the
             list, which is how a filter panel stops being read. */
          if (rows.length < 2) return null;
          return (
            <Facet
              key={f.id} label={f.label} hint={f.hint} find={f.find} Icon={f.Icon}
              options={rows}
              chosen={filter[f.id]}
              onPick={value => setFilter(toggleFacet(filter, f.id, value))}
            />
          );
        })}
      </div>
    </div>,
    document.body,
  );
}

/** What the grid's own button needs to know, without importing the panel. */
export function filterIsOn(f: PodFilter): boolean {
  return !isEmptyFilter(f);
}
