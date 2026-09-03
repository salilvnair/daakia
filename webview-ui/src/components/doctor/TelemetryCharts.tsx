/**
 * The recording's telemetry, as small multiples on one shared axis.
 *
 * Stacked rather than overlaid, and every chart on the same time range, so a
 * spike in one lines up vertically with whatever else was happening at that
 * instant. That alignment is the entire value: "CPU rose here" is a fact,
 * "CPU rose here while threads climbed and classes did not" is a diagnosis.
 *
 * The crosshair reads every chart at once for the same reason. Hovering one
 * and getting one number would make the reader hold the others in their head.
 */
import { useMemo, useRef, useState } from 'react';

export interface SeriesPoint { t: number; v: number }
export interface Series {
  id: string; label: string; group: string;
  unit: 'percent' | 'bytes' | 'count' | 'perSecond' | 'bytesPerSecond' | 'ms';
  points: SeriesPoint[];
}
export interface TelemetryGroup { group: string; series: Series[] }

/** Distinct within a chart; a chart rarely holds more than three. */
const LINE_COLORS = [
  'var(--color-dk8s)',
  'var(--color-protocol-graphql, #e535ab)',
  'var(--color-text-muted)',
];

function human(v: number, unit: Series['unit']): string {
  switch (unit) {
    case 'percent': return `${v.toFixed(v < 10 ? 2 : 1)}%`;
    case 'ms': return `${v < 1 ? v.toFixed(2) : v.toFixed(1)} ms`;
    case 'perSecond':
      return `${v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString()}/s`;
    case 'bytes': case 'bytesPerSecond': {
      const suffix = unit === 'bytesPerSecond' ? '/s' : '';
      if (v < 1024) return `${Math.round(v)} B${suffix}`;
      if (v < 1024 ** 2) return `${(v / 1024).toFixed(1)} KB${suffix}`;
      if (v < 1024 ** 3) return `${(v / 1024 ** 2).toFixed(1)} MB${suffix}`;
      return `${(v / 1024 ** 3).toFixed(2)} GB${suffix}`;
    }
    default: return v >= 1000 ? v.toLocaleString() : String(Math.round(v * 100) / 100);
  }
}

const W = 1000;      // viewBox units; the svg scales to its container
const H = 54;

function Chart({ group, series, fromMs, toMs, hoverMs, onHover }: {
  group: string; series: Series[];
  fromMs: number; toMs: number;
  hoverMs: number | null;
  onHover: (t: number | null) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const span = Math.max(1, toMs - fromMs);

  /*
    One scale per chart, not per series.

    Live threads and daemon threads belong on the same axis or the comparison
    between them is a lie told with two different rulers. The scale starts at
    zero for the same reason: a chart cropped to its own range turns a steady
    10.0–10.2 into a dramatic climb.
  */
  const max = useMemo(() => {
    const top = Math.max(...series.flatMap(s => s.points.map(p => p.v)), 0);
    return top <= 0 ? 1 : top * 1.08;
  }, [series]);

  const x = (t: number) => ((t - fromMs) / span) * W;
  const y = (v: number) => H - (v / max) * H;

  const readAt = (t: number) =>
    series.map(s => {
      let best: SeriesPoint | undefined;
      for (const p of s.points) {
        if (!best || Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
      }
      return { s, p: best };
    });

  const move = (e: React.MouseEvent) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    onHover(fromMs + ((e.clientX - box.left) / box.width) * span);
  };

  const readings = hoverMs === null ? null : readAt(hoverMs);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider"
              style={{ color: 'var(--color-text-muted)' }}>{group}</span>
        {series.map((s, i) => {
          const r = readings?.find(x2 => x2.s.id === s.id);
          return (
            <span key={s.id} className="flex items-center gap-1.5 text-[10.5px]">
              <span style={{
                width: 7, height: 2, borderRadius: 1,
                background: LINE_COLORS[i % LINE_COLORS.length], display: 'inline-block',
              }} />
              <span style={{ color: 'var(--color-text-secondary)' }}>{s.label}</span>
              {/* The hovered value, or the last one — never nothing, so the
                  row does not jump in width as the pointer moves. */}
              <span className="tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                {r?.p ? human(r.p.v, s.unit)
                  : s.points.length ? human(s.points[s.points.length - 1].v, s.unit) : '—'}
              </span>
            </span>
          );
        })}
      </div>

      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: 54, display: 'block' }}
        onMouseMove={move}
        onMouseLeave={() => onHover(null)}
      >
        <rect x={0} y={0} width={W} height={H} fill="var(--color-surface)" rx={3} />
        {series.map((s, i) => {
          const color = LINE_COLORS[i % LINE_COLORS.length];
          if (s.points.length === 1) {
            // A single reading is a dot, not a line. Drawing one point as a
            // flat line across the chart would claim a measurement that spans
            // the whole recording.
            const p = s.points[0];
            return <circle key={s.id} cx={x(p.t)} cy={y(p.v)} r={2.5} fill={color} />;
          }
          const d = s.points.map((p, j) => `${j ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
          return (
            <path key={s.id} d={d} fill="none" stroke={color}
                  strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
          );
        })}
        {hoverMs !== null && (
          <line x1={x(hoverMs)} y1={0} x2={x(hoverMs)} y2={H}
                stroke="var(--color-text-muted)" strokeWidth={1}
                vectorEffect="non-scaling-stroke" opacity={0.6} />
        )}
      </svg>
    </div>
  );
}

export function TelemetryCharts({ groups, fromMs, toMs }: {
  groups: TelemetryGroup[]; fromMs: number; toMs: number;
}) {
  // Shared, so a crosshair in one chart appears in all of them.
  const [hoverMs, setHoverMs] = useState<number | null>(null);

  if (!groups.length) {
    return (
      <div className="px-2 py-6 text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
        This recording carries no telemetry events. That usually means it was made with a
        custom setting rather than <code>settings=profile</code>.
      </div>
    );
  }

  const secs = Math.max(1, Math.round((toMs - fromMs) / 1000));
  return (
    <div className="flex flex-col gap-4">
      {groups.map(g => (
        <Chart
          key={g.group} group={g.group} series={g.series}
          fromMs={fromMs} toMs={toMs}
          hoverMs={hoverMs} onHover={setHoverMs}
        />
      ))}
      <div className="flex items-center justify-between text-[10px]"
           style={{ color: 'var(--color-text-muted)' }}>
        <span>0s</span>
        <span>
          {hoverMs === null
            ? `${secs}s of recording — hover to read every chart at the same instant`
            : `${((hoverMs - fromMs) / 1000).toFixed(1)}s`}
        </span>
        <span>{secs}s</span>
      </div>
    </div>
  );
}
