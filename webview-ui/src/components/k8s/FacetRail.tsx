/**
 * The fields a log carried, and how the events divide across them.
 *
 * ── Why a rail and not a menu ──
 *
 * The facets already existed, reachable by selecting text and opening a menu.
 * That works when you know what you are looking for and it is useless for the
 * question people actually arrive with, which is "what IS this log". A rail
 * answers that before anything is clicked: four threads, two tenants, one of
 * them carrying most of the errors.
 *
 * ── What the counts are counts of ──
 *
 * The buffer. dk8s holds a few hundred to a few thousand lines out of a pod's
 * millions, so "settle-worker-3 · 412" means 412 of what is on screen. The
 * heading says so, in those words, and it is the one label here not worth
 * shortening — a facet count read as a total is a wrong answer that looks
 * like a right one.
 *
 * ── Three states, not two ──
 *
 * Clicking cycles include → exclude → off, because "everything except this
 * thread" is the filter the search box could never express and the reason
 * field filters exist at all.
 */
import { useMemo, useState } from 'react';
import { BadgeChipView, IconSize } from '@salilvnair/dui';
import { ChevronDownIcon, ChevronRightIcon, FilterIcon, SearchIcon } from '../../icons';
import { buildFacets, type Facet } from './log-facets';
import type { FieldFilter } from './log-view';
import type { LogLine } from '../../store/k8s-store';
import { ACCENT, BAD, MUTED } from './tone';

export function FacetRail({ lines, filters, onToggle, onClear, onSearchEverywhere }: {
  lines: LogLine[];
  filters: FieldFilter[];
  onToggle: (f: FieldFilter) => void;
  onClear: (field: string, value: string) => void;
  /**
   * Take this value to the whole log, rather than the buffer.
   *
   * The counts here are of what is on screen, which is the honest limit of a
   * facet — and the obvious next question when one of them looks interesting
   * is "how many really". That question already has an answer in dk8s: the
   * log search reads the pod's log rather than the buffer, so this hands the
   * value to it instead of growing a second way to read a log.
   */
  onSearchEverywhere: (field: string, value: string) => void;
}) {
  /*
    Recomputed from the lines rather than kept in the store.

    The buffer changes on every batch of log, and a cached facet list is a
    count that quietly stops matching the rows beside it — which is the one
    thing a number in this panel must never do.
  */
  const facets = useMemo(() => buildFacets(lines), [lines]);
  const [closed, setClosed] = useState<string[]>([]);

  // Nothing honest to show: no format is configured, or one is and no line
  // parsed. Saying "no facets" would imply the log has no structure, when
  // what it has is no format telling dk8s where the structure is.
  if (!facets.length) return null;

  const modeOf = (field: string, value: string): FieldFilter['mode'] | undefined =>
    filters.find(f => f.field === field && f.value === value)?.mode;

  return (
    <div
      className="flex flex-col shrink-0 overflow-auto dk8s-no-scrollbar"
      style={{
        width: 208,
        borderRight: '1px solid var(--color-surface-border)',
        background: 'color-mix(in srgb, var(--color-surface) 55%, transparent)',
      }}
    >
      <div className="flex items-center gap-1.5 px-3 py-2 shrink-0">
        <FilterIcon size={IconSize.chip} color="var(--color-text-muted)" />
        <span className="text-[9px] uppercase tracking-wider"
              style={{ color: 'var(--color-text-muted)' }}>
          fields · {facets[0].scanned.toLocaleString()} events on screen
        </span>
      </div>

      {facets.map(facet => {
        const open = !closed.includes(facet.field);
        return (
          <div key={facet.field} className="shrink-0" style={{ marginBottom: 6 }}>
            <button
              type="button"
              onClick={() => setClosed(c =>
                c.includes(facet.field) ? c.filter(x => x !== facet.field) : [...c, facet.field])}
              className="flex items-center gap-1 w-full px-2.5 py-1 border-none bg-transparent cursor-pointer text-left"
            >
              {open
                ? <ChevronDownIcon size={IconSize.chip} color="var(--color-text-muted)" />
                : <ChevronRightIcon size={IconSize.chip} color="var(--color-text-muted)" />}
              <span className="text-[10.5px] font-semibold truncate"
                    style={{ color: 'var(--color-text-primary)' }}>
                {facet.label}
              </span>
              {/* Where the field came from, because a key the application
                  chose and a slot dk8s defined are different kinds of thing. */}
              {!facet.named && (
                <BadgeChipView tone={MUTED} size="2xs" style={{ opacity: 0.8 }}>mdc</BadgeChipView>
              )}
            </button>

            {open && (
              <FacetValues
                facet={facet} modeOf={modeOf} onToggle={onToggle}
                onClear={onClear} onSearchEverywhere={onSearchEverywhere}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function FacetValues({ facet, modeOf, onToggle, onClear, onSearchEverywhere }: {
  facet: Facet;
  modeOf: (field: string, value: string) => FieldFilter['mode'] | undefined;
  onToggle: (f: FieldFilter) => void;
  onClear: (field: string, value: string) => void;
  onSearchEverywhere: (field: string, value: string) => void;
}) {
  const top = facet.values[0]?.count ?? 1;
  return (
    <>
      {facet.values.map(v => {
        const mode = modeOf(facet.field, v.value);
        const on = mode === 'include';
        const out = mode === 'exclude';
        return (
          <div key={v.value}>
            <div className="flex items-center gap-1 px-2.5 py-0.5">
            <button
              type="button"
              title={out ? 'Click to clear' : on ? 'Click to exclude' : 'Click to include'}
              onClick={() => {
                if (!mode) onToggle({ field: facet.field, value: v.value, mode: 'include' });
                else if (on) onToggle({ field: facet.field, value: v.value, mode: 'exclude' });
                else onClear(facet.field, v.value);
              }}
              className="flex items-center gap-1.5 flex-1 min-w-0 border-none bg-transparent cursor-pointer text-left"
              style={{ padding: 0 }}
            >
              <span style={{
                width: 11, height: 11, borderRadius: 3, flexShrink: 0,
                display: 'grid', placeItems: 'center', fontSize: 8, lineHeight: 1,
                border: `1.5px solid ${on ? ACCENT : out ? BAD : 'var(--color-text-muted)'}`,
                background: on ? ACCENT : out ? BAD : 'transparent',
                color: 'var(--color-surface)',
              }}>{on ? '✓' : out ? '–' : ''}</span>
              <span
                className="flex-1 min-w-0 truncate text-[10.5px] font-mono"
                style={{
                  color: on ? ACCENT : 'var(--color-text-secondary)',
                  textDecoration: out ? 'line-through' : undefined,
                  opacity: out ? 0.6 : 1,
                }}
              >{v.value}</span>
              <span className="text-[9.5px] font-mono shrink-0"
                    style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                {v.count.toLocaleString()}
              </span>
            </button>
            {/* The count above is of the buffer; this asks the pod's whole log.
                Dimmed and small because it is the second question, not the
                first — most of the time narrowing what is on screen is what
                someone wants, and only sometimes "how many really". */}
            <button
              type="button"
              title={`Search the whole log for ${v.value}`}
              aria-label={`Search the whole log for ${v.value}`}
              onClick={() => onSearchEverywhere(facet.field, v.value)}
              className="border-none bg-transparent cursor-pointer shrink-0"
              style={{ padding: 0, lineHeight: 0, opacity: 0.45, marginLeft: 4 }}
            >
              <SearchIcon size={IconSize.chip} color="var(--color-text-muted)" />
            </button>
            </div>
            {/* Share of the buffer, so a value taking most of it is visible
                without reading a number. */}
            <div style={{
              height: 2, marginLeft: 27, borderRadius: 2,
              width: `${Math.max(4, Math.round((v.count / top) * 60))}%`,
              background: on ? ACCENT : 'var(--color-text-muted)',
              opacity: on ? 0.55 : 0.25,
            }} />
          </div>
        );
      })}

      {/* Said, not hidden: twenty of two hundred looks like two hundred. */}
      {facet.distinct > facet.values.length && (
        <div className="px-2.5 pt-1 text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
          {(facet.distinct - facet.values.length).toLocaleString()} more, not shown
        </div>
      )}
    </>
  );
}
