/**
 * The logs pane while it is still arriving.
 *
 * A skeleton's job is to be the shape of what is coming, so nothing jumps when
 * it does. The old one drew log rows only: the loading state was one column and
 * the loaded state was two, so the facet rail appeared to arrive from nowhere
 * and pushed the lines you had started reading sideways.
 *
 * This draws both — the rail's field groups on the left, the divider where the
 * divider goes, and the rows on the right — at the width the real rail has.
 */
import { SkeletonView, TableSkeletonView } from '@salilvnair/dui';

/** The width FacetRail sets on itself, repeated so nothing shifts on arrival. */
const RAIL_WIDTH = 208;

export function LogSkeleton({ railOpen, rowHeight }: {
  railOpen: boolean;
  rowHeight: number;
}) {
  return (
    <div className="flex flex-1 min-h-0 w-full">
      {railOpen && (
        <>
          <div
            className="flex flex-col gap-4 overflow-hidden px-3 py-3 shrink-0"
            style={{ width: RAIL_WIDTH }}
          >
            {/* Three groups of four, which is what a parsed log format usually
                yields — a thread, an id, a tenant. Enough to hold the space
                without pretending to know the fields. */}
            {[0, 1, 2].map(group => (
              <div key={group} className="flex flex-col gap-2">
                <SkeletonView variant="text" width="52%" height={9} />
                {[0, 1, 2, 3].map(row => (
                  <div key={row} className="flex items-center gap-2">
                    <SkeletonView variant="block" width={11} height={11} />
                    <SkeletonView variant="text" width={`${74 - row * 9}%`} height={8} />
                  </div>
                ))}
              </div>
            ))}
          </div>
          {/* The divider, in the place the real one sits. */}
          <div
            className="shrink-0"
            style={{ width: 1, background: 'var(--color-surface-border)' }}
          />
        </>
      )}

      <div className="flex-1 min-w-0 overflow-hidden pl-4 pr-1 py-2">
        {/* Timestamp, level, message — the three columns that are about to
            arrive, in the places they arrive in. A centred "Reading logs…"
            moved the eye to the middle of a pane whose first line then
            appeared at the top. */}
        <TableSkeletonView
          rowHeight={rowHeight}
          fill={0.72}
          columns={[{ width: 92, fill: 0.85 }, { width: 44 }, { width: 'flex', fill: 0.7 }]}
        />
      </div>
    </div>
  );
}
