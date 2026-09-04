/**
 * The heap as ranked bars, for the shape a treemap cannot draw.
 *
 * A treemap and a sunburst both encode size as AREA, and area is the thing the
 * eye judges worst. That is a tolerable trade when the data is spread out. It
 * collapses completely when one class holds 98% of the heap: that class takes
 * 98% of the pixels, every other class is a sliver too small to label, and the
 * chart answers a question you already knew the answer to while hiding the
 * forty classes you were actually looking for.
 *
 * A bar per row fixes it because the ROW is the guaranteed space. Length still
 * encodes the share honestly — `byte[]` still runs the full width and nothing
 * is rescaled to flatter it — but a class holding 0.01% still gets a line with
 * its name, its size and its count on it, which is all anyone needed. Length
 * on a common baseline is also the comparison people read most accurately;
 * area is near the bottom of that list.
 *
 * `Excluding the biggest` is the other half. Once you know one class dominates,
 * the next question is always what the REST looks like, and the answer is
 * unreadable while the dominant one sets the scale. Dropping it and
 * re-normalising is not a distortion as long as the view says it did — so it
 * says it, in the control that did it.
 */
import { useMemo, useState } from 'react';
import { bytes, hueForShare } from './heap-query';
import { decodeClassName, fullClassName } from './class-name';
import { isRollup, toBarRows, type BarRow } from './heap-bars';

const ROW_H = 22;

export function HeapClassBars({ groups, totalBytes, onNarrow }: {
  groups: { name: string; children: { name: string; bytes: number; instances: number }[] }[];
  totalBytes: number;
  onNarrow?: (className: string) => void;
}) {
  const [dropBiggest, setDropBiggest] = useState(false);

  const all = useMemo<BarRow[]>(() => toBarRows(groups), [groups]);

  const rows = dropBiggest ? all.slice(1) : all;
  /*
    The scale is the largest bar SHOWN, not the heap total.

    Against the total, dropping the dominant class would leave every remaining
    bar as short as it was before and the control would appear to do nothing.
    Against the largest of what is on screen, the remainder actually spreads
    out — which is the entire reason to drop it.
  */
  const scale = rows.length ? rows[0].bytes : 1;
  const shownBytes = rows.reduce((a, r) => a + r.bytes, 0);
  const biggest = all[0];
  // Excluding a rollup would drop an aggregate rather than a class, which is
  // not the question the control is offering to answer.
  const canDrop = all.length > 1 && !isRollup(all[0].className);

  if (!all.length) {
    return (
      <div className="flex-1 grid place-items-center px-6">
        <p className="text-[11.5px] m-0" style={{ color: 'var(--color-text-muted)' }}>
          Nothing in this set.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-3 px-3 py-1.5 flex-shrink-0 flex-wrap"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
          {rows.length.toLocaleString()} {rows.length === 1 ? 'class' : 'classes'}
          {' · '}{bytes(shownBytes)}
          {dropBiggest && biggest && (
            <> shown, {fullClassName(biggest.className)} left out</>
          )}
        </span>
        <div className="flex-1" />
        {canDrop && (
          <button type="button"
                  onClick={() => setDropBiggest(v => !v)}
                  title={dropBiggest
                    ? 'Put the largest class back on the chart'
                    : `Drop ${fullClassName(biggest.className)} and rescale, to compare everything else`}
                  style={{
                    font: 'inherit', fontSize: 10, cursor: 'pointer',
                    fontFamily: 'ui-monospace, monospace',
                    padding: '2px 8px', borderRadius: 5,
                    color: dropBiggest ? 'var(--color-warning)' : 'var(--color-text-muted)',
                    background: dropBiggest
                      ? 'color-mix(in srgb, var(--color-warning) 14%, transparent)'
                      : 'transparent',
                    border: `1px solid ${dropBiggest
                      ? 'color-mix(in srgb, var(--color-warning) 38%, transparent)'
                      : 'var(--color-surface-border)'}`,
                  }}>
            {dropBiggest ? 'showing the rest' : 'excluding the biggest'}
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
        {rows.map(r => {
          const pctOfHeap = totalBytes ? (r.bytes / totalBytes) * 100 : 0;
          const width = scale ? (r.bytes / scale) * 100 : 0;
          const d = decodeClassName(r.className);
          return (
            <div
              key={`${r.group}:${r.className}`}
              onClick={onNarrow && !isRollup(r.className) ? () => onNarrow(r.className) : undefined}
              title={isRollup(r.className)
                ? `The remaining classes in ${r.group}, added together — ${bytes(r.bytes)}`
                : `${fullClassName(r.className)} — ${bytes(r.bytes)}, ${pctOfHeap.toFixed(2)}% of the live heap`}
              style={{
                height: ROW_H, display: 'flex', alignItems: 'center', gap: 8,
                cursor: onNarrow && !isRollup(r.className) ? 'pointer' : 'default',
              }}
            >
              <span style={{
                width: 190, flexShrink: 0, minWidth: 0,
                fontFamily: 'ui-monospace, monospace', fontSize: 10.5,
                color: 'var(--color-text-primary)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {isRollup(r.className) ? (
                  <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                    {r.className} in {r.group}
                  </span>
                ) : (
                  <>
                    {d.simpleName}
                    {d.packageName && (
                      <span style={{ color: 'var(--color-text-muted)' }}> · {d.packageName}</span>
                    )}
                  </>
                )}
              </span>

              <span style={{
                flex: 1, minWidth: 40, height: 9, borderRadius: 3,
                background: 'var(--color-surface-hover)', overflow: 'hidden',
              }}>
                {/*
                  A floor of a quarter of a percent, so a class that is really
                  there still leaves a mark. Rounding it to nothing would make
                  "present but tiny" and "absent" look the same, which is the
                  failure this whole view exists to avoid.
                */}
                <span style={{
                  display: 'block', height: '100%', borderRadius: 3,
                  width: `${Math.max(0.25, width)}%`,
                  background: hueForShare(pctOfHeap),
                  opacity: 0.85,
                }} />
              </span>

              <span style={{
                width: 68, textAlign: 'right', flexShrink: 0,
                fontFamily: 'ui-monospace, monospace', fontSize: 10.5,
                fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-secondary)',
              }}>{bytes(r.bytes)}</span>

              <span style={{
                width: 50, textAlign: 'right', flexShrink: 0,
                fontFamily: 'ui-monospace, monospace', fontSize: 10,
                fontVariantNumeric: 'tabular-nums',
                color: pctOfHeap >= 5 ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
              }}>
                {/*
                  Two decimals below 1%, because "0.0%" for forty different
                  classes is a column of zeroes that distinguishes none of them.
                */}
                {pctOfHeap >= 1 ? `${pctOfHeap.toFixed(1)}%` : `${pctOfHeap.toFixed(2)}%`}
              </span>

              <span style={{
                width: 66, textAlign: 'right', flexShrink: 0,
                fontFamily: 'ui-monospace, monospace', fontSize: 10,
                fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-muted)',
              }}>
                {r.instances !== undefined ? `${r.instances.toLocaleString()} ×` : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
