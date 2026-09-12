/**
 * Instances per class, across the recording's censuses.
 *
 * A heap dump says what is in memory; it cannot say what is GROWING, because
 * one photograph has no direction. Several censuses in a row can, and that is
 * the whole point of this view: a class whose count only ever rises, next to
 * forty that sawtooth around a steady mean, which is what healthy allocation
 * looks like.
 *
 * Ranked by growth rather than by size, because sorting on instance count puts
 * `String` and `byte[]` at the top of every recording ever taken — true, and
 * useless.
 */
import { decodeClassName } from './class-name';

export interface ClassPoint { atMs: number; gcId: number; count: number; bytes: number }
export interface ClassSeries {
  className: string;
  points: ClassPoint[];
  peakCount: number;
  lastCount: number;
  lastBytes: number;
  growth: number;
  growthPercent: number;
}
export interface ClassCensus {
  times: { atMs: number; gcId: number }[];
  series: ClassSeries[];
  present: boolean;
}

function bytes(v: number): string {
  if (v < 1024) return `${Math.round(v)} B`;
  if (v < 1024 ** 2) return `${(v / 1024).toFixed(0)} KB`;
  if (v < 1024 ** 3) return `${(v / 1024 ** 2).toFixed(1)} MB`;
  return `${(v / 1024 ** 3).toFixed(2)} GB`;
}

/**
 * A series as a sparkline, on its own scale.
 *
 * Every row scaled to the largest class in the recording would flatten all but
 * the top one or two to a straight line, and the SHAPE is the finding — a
 * class rising steadily matters whether it holds ten thousand instances or ten
 * million. The count beside it carries the magnitude.
 */
function Spark({ points, w = 92, h = 18 }: { points: ClassPoint[]; w?: number; h?: number }) {
  if (points.length < 2) {
    // One census is a dot, not a line. Drawing a flat line across the full
    // width would claim we watched it stay level, which we did not.
    return (
      <svg width={w} height={h} style={{ display: 'block', overflow: 'visible' }}
           role="img" aria-label="a single census — no trend yet">
        <circle cx={w - 3} cy={h / 2} r={2.6} fill="var(--color-warning)" />
      </svg>
    );
  }
  const max = Math.max(...points.map(p => p.count), 1);
  const min = Math.min(...points.map(p => p.count));
  const span = Math.max(1, max - min);
  const d = points.map((p, i) => {
    const x = (i / (points.length - 1)) * (w - 4) + 2;
    const y = h - 2 - ((p.count - min) / span) * (h - 4);
    return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const rising = points[points.length - 1].count > points[0].count;
  return (
    <svg width={w} height={h} style={{ display: 'block' }} role="img"
         aria-label={rising ? 'rising' : 'steady or falling'}>
      <path d={d} fill="none" strokeWidth={1.4}
            stroke={rising ? 'var(--color-warning)' : 'var(--color-success)'} />
    </svg>
  );
}

export function ClassTrackerView({ census }: { census?: ClassCensus }) {
  if (!census?.present) {
    return (
      <div className="px-2 py-6 text-[12px] leading-relaxed"
           style={{ color: 'var(--color-text-muted)', maxWidth: '46em' }}>
        {/*
          Not an empty chart. This event is off in every stock setting,
          `profile` included, because producing it forces a full heap
          inspection GC at every chunk — so its absence is a recording that
          never asked the question, not a parsing failure, and the fix is a
          flag rather than a bug report.
        */}
        This recording carries no object censuses, so there is nothing to track.
        <div style={{ marginTop: 8 }}>
          <code style={{
            fontFamily: 'ui-monospace, monospace', fontSize: 10.5,
            background: 'var(--color-surface)', padding: '2px 6px', borderRadius: 4,
          }}>jdk.ObjectCount#enabled=true</code>
        </div>
        <div style={{ marginTop: 8 }}>
          JFR leaves that off even at <code style={{ fontFamily: 'ui-monospace, monospace' }}>settings=profile</code>,
          because each census forces a full heap-inspection GC. Worth turning on
          deliberately when you are hunting a leak, and worth leaving off otherwise.
        </div>
      </div>
    );
  }

  const worst = Math.max(...census.series.map(s => Math.abs(s.growth)), 1);

  return (
    <div className="flex flex-col gap-2 min-h-0">
      <div className="flex items-baseline gap-3 flex-wrap px-1">
        <span className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
          {census.series.length} classes across {census.times.length}{' '}
          {census.times.length === 1 ? 'census' : 'censuses'}, by growth
        </span>
        {census.times.length === 1 && (
          <span className="text-[11px]" style={{ color: 'var(--color-warning)' }}>
            · one census only — growth is measured against zero, not against a
            previous reading
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 px-2 py-1 text-[9.5px] uppercase tracking-wider"
           style={{ color: 'var(--color-text-muted)' }}>
        <span className="flex-1">class</span>
        <span style={{ width: 92 }}>trend</span>
        <span style={{ width: 78, textAlign: 'right' }}>growth</span>
        <span style={{ width: 74, textAlign: 'right' }}>instances</span>
        <span style={{ width: 66, textAlign: 'right' }}>size</span>
      </div>

      <div style={{ overflowY: 'auto', minHeight: 0 }}>
        {census.series.map(s => {
          const d = decodeClassName(s.className);
          const share = (Math.abs(s.growth) / worst) * 100;
          return (
            <div key={s.className}
                 title={`${s.className} — ${s.growth >= 0 ? '+' : ''}${s.growth.toLocaleString()} instances`}
                 style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '3px 8px' }}>
              <span style={{
                flex: 1, minWidth: 0,
                fontFamily: 'ui-monospace, monospace', fontSize: 10.5,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                color: 'var(--color-text-primary)',
              }}>
                {d.simpleName}
                {d.packageName && (
                  <span style={{ color: 'var(--color-text-muted)' }}> · {d.packageName}</span>
                )}
              </span>

              <span style={{ width: 92, flexShrink: 0 }}><Spark points={s.points} /></span>

              <span style={{
                width: 78, flexShrink: 0, textAlign: 'right',
                fontFamily: 'ui-monospace, monospace', fontSize: 10,
                fontVariantNumeric: 'tabular-nums',
                color: s.growth > 0
                  ? `color-mix(in srgb, var(--color-warning) ${Math.max(40, share)}%, var(--color-text-muted))`
                  : 'var(--color-text-muted)',
              }}>
                {s.growth > 0 ? '+' : ''}{s.growth.toLocaleString()}
              </span>

              <span style={{
                width: 74, flexShrink: 0, textAlign: 'right',
                fontFamily: 'ui-monospace, monospace', fontSize: 10,
                fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-secondary)',
              }}>{s.lastCount.toLocaleString()}</span>

              <span style={{
                width: 66, flexShrink: 0, textAlign: 'right',
                fontFamily: 'ui-monospace, monospace', fontSize: 10,
                fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-muted)',
              }}>{bytes(s.lastBytes)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
