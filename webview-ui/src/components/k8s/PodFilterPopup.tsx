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
  CheckIcon, CloseIcon, FilterOffIcon, LayersIcon, ServerIcon, FolderIcon, TagIcon,
} from '../../icons';
import { useK8sStore, type PodSummary } from '../../store/k8s-store';
import {
  facetOptions, kindCounts, toggleFacet, isEmptyFilter, NO_POD_FILTER,
  type PodFacet, type PodFilter, type PodKind,
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
const FACETS: { id: PodFacet; label: string; hint: string; Icon: typeof ServerIcon }[] = [
  { id: 'contexts', label: 'Cluster', hint: 'Which cluster the pod is in', Icon: ServerIcon },
  { id: 'namespaces', label: 'Namespace', hint: 'Which namespace it lives in', Icon: FolderIcon },
  { id: 'workloads', label: 'App', hint: 'The Deployment, StatefulSet or CronJob behind it', Icon: TagIcon },
];

const KINDS: { id: PodKind; label: string }[] = [
  { id: 'all', label: 'All pods' },
  { id: 'pods', label: 'Pods' },
  { id: 'runs', label: 'CronJob runs' },
];

const WIDTH = 300;
const MAX_H = 420;
const MARGIN = 8;

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

function Heading({ label, hint, Icon }: {
  label: string; hint?: string; Icon: typeof ServerIcon;
}) {
  return (
    <span className="flex items-center gap-1.5 text-[9.5px] uppercase tracking-wider px-2 pb-0.5"
          title={hint}
          style={{ color: 'var(--color-text-muted)' }}>
      <Icon size={11} color={FACET_TONE} />
      {label}
    </span>
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
            <section key={f.id} className="flex flex-col gap-0.5">
              <Heading label={f.label} hint={f.hint} Icon={f.Icon} />
              {rows.map(o => (
                <Row
                  key={o.value} label={o.value} count={o.count}
                  on={filter[f.id].includes(o.value)}
                  onClick={() => setFilter(toggleFacet(filter, f.id, o.value))}
                />
              ))}
            </section>
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
