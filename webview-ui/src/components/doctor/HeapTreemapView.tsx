/**
 * HeapTreemapView — the whole live heap as nested rectangles.
 *
 * Canvas rather than SVG or DOM: a real dump produces thousands of leaves and
 * one <div> each would make pan and hover stutter. Squarified layout, because
 * slice-and-dice produces slivers that are impossible to read or click.
 *
 * Areas are live *shallow* bytes, which is the only per-object metric that
 * partitions the heap exactly — retained sizes overlap, so a retained treemap
 * would draw more area than the heap contains.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { SegmentedControlView, SunburstView } from '@salilvnair/dui';
import { decodeClassName, fullClassName } from './class-name';
import { heapQuery, bytes, hueFor, type TreemapData } from './heap-query';
import { squarify, type Tile } from './treemap-layout';

export function HeapTreemapView({ packageFilter }: { packageFilter?: string }) {
  /*
    Two geometries over one dataset.

    A treemap packs by area and is the better tool for comparing two things
    that are far apart on screen. A sunburst reads outward from the centre, so
    containment is the axis rather than something inferred from adjacency —
    which is what makes it the profiler's idiom for "what is inside this".
    Neither is a substitute for the other, and neither is new information, so
    this is a toggle rather than a seventh tab.
  */
  const [shape, setShape] = useState<'treemap' | 'sunburst'>('treemap');
  const [data, setData] = useState<TreemapData | null>(null);
  const [error, setError] = useState('');
  const [hover, setHover] = useState<Tile | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tilesRef = useRef<Tile[]>([]);

  useEffect(() => {
    let live = true;
    heapQuery<TreemapData>({ type: 'treemap', packageFilter })
      .then(d => { if (live) { setData(d); setError(''); } })
      .catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [packageFilter]);

  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap || !data) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if (w < 10 || h < 10) return;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Outer level: packages. Inner: classes within each package.
      const outer: Tile[] = [];
      squarify(data.groups.map(g => ({ name: g.name, value: g.bytes })), 0, 0, w, h, '', outer);

      const tiles: Tile[] = [];
      for (const box of outer) {
        const group = data.groups.find(g => g.name === box.label);
        if (!group) continue;
        const pad = box.w > 40 && box.h > 26 ? 1 : 0;
        const inner: Tile[] = [];
        squarify(
          group.children.map(c => ({ name: c.name, value: c.bytes, instances: c.instances })),
          box.x + pad, box.y + pad, Math.max(0, box.w - pad * 2), Math.max(0, box.h - pad * 2),
          group.name, inner,
        );
        tiles.push(...inner);
      }
      tilesRef.current = tiles;

      for (const t of tiles) {
        /*
          Quieter than the hue itself.

          At full strength one large tile is a wall of flat colour — a single
          class narrowed to fills the pane and the screen becomes one saturated
          rectangle. Dropped toward the panel's own ground, the tiles still
          separate from each other while the labels stay the brightest thing in
          the view, which is the right order: the names are the information.
        */
        ctx.fillStyle = hueFor(t.group);
        ctx.globalAlpha = 0.34;
        ctx.fillRect(t.x, t.y, t.w, t.h);
        ctx.globalAlpha = 1;
        if (t.w > 1 && t.h > 1) {
          ctx.strokeStyle = 'rgba(0,0,0,0.42)';
          ctx.lineWidth = 0.6;
          ctx.strokeRect(t.x + 0.3, t.y + 0.3, t.w - 0.6, t.h - 0.6);
        }
        // Only label tiles with room, or the text becomes noise.
        if (t.w > 58 && t.h > 16) {
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.font = '10px ui-monospace, monospace';
          ctx.save();
          ctx.beginPath(); ctx.rect(t.x + 2, t.y + 2, t.w - 4, t.h - 4); ctx.clip();
          // Decoded, or the largest tile in most heaps is labelled `[B`.
          ctx.fillText(decodeClassName(t.label).simpleName, t.x + 4, t.y + 12);
          if (t.h > 28) {
            ctx.globalAlpha = 0.8;
            ctx.fillText(bytes(t.value), t.x + 4, t.y + 24);
            ctx.globalAlpha = 1;
          }
          ctx.restore();
        }
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
    /*
      `shape` is a dependency, and that is the whole fix for a blank treemap.

      Switching to the sunburst UNMOUNTS this canvas. Switching back mounts a
      new one, and with only `data` here the effect never re-ran — so the ref
      pointed at a fresh canvas nothing had ever drawn on, and the view came
      back empty. Nothing was wrong with the data; it had simply never been
      painted.
    */
  }, [data, shape]);

  /** The same groups, as a hierarchy the chart can lay out. */
  const tree = useMemo(() => ({
    name: 'live heap',
    children: (data?.groups ?? []).map(g => ({
      name: g.name,
      children: g.children.map(c => ({
        name: decodeClassName(c.name).simpleName,
        value: c.bytes,
      })),
    })),
  }), [data]);

  const onMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    setHover(tilesRef.current.find(t => x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h) ?? null);
  };

  if (error) return <p className="text-[12px] text-[var(--color-error)] px-4 py-4 m-0">{error}</p>;
  if (!data) return <p className="text-[12px] text-[var(--color-text-muted)] px-4 py-4 m-0">Building treemap…</p>;

  /*
    A treemap of one thing is a rectangle.

    Both shapes here answer "how is the heap divided", and a filter narrowed to
    a single class leaves nothing to divide — the pane fills with one flat
    tile that carries no information at all and looks like a rendering fault.
    Say what happened and where the answer actually is, rather than drawing it.
  */
  const tileCount = data.groups.reduce((a, g) => a + g.children.length, 0);

  /*
    One tile filling the pane is a finding, not a rendering fault.

    A heap that is 98% one class draws as a single flat rectangle, which looks
    exactly like a broken chart — and the picture is CORRECT: that is what the
    heap looks like. Saying it turns the confusing image into the sentence it
    was always making.
  */
  const biggest = data.groups
    .flatMap(g => g.children)
    .reduce((best, c) => (c.bytes > (best?.bytes ?? 0) ? c : best),
            undefined as { name: string; bytes: number } | undefined);
  const dominantPct = biggest && data.totalBytes
    ? (biggest.bytes / data.totalBytes) * 100 : 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-3 px-3 py-2 flex-shrink-0 flex-wrap"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <span className="text-[11.5px] text-[var(--color-text-secondary)]">
          Live heap by package — {shape === 'treemap' ? 'area' : 'arc'} is shallow bytes
        </span>
        {tileCount > 1 && dominantPct >= 60 && (
          <span className="text-[11px]" style={{ color: 'var(--color-warning)' }}>
            · {fullClassName(biggest!.name)} is {dominantPct.toFixed(0)}% of it, which is
            why this is one shape
          </span>
        )}
        <SegmentedControlView
          options={[{ label: 'Treemap', value: 'treemap' }, { label: 'Sunburst', value: 'sunburst' }]}
          value={shape}
          onChange={(v) => setShape(v as 'treemap' | 'sunburst')}
          density="compact"
          accentColor="var(--color-doctor)"
        />
        <div className="flex-1" />
        {hover ? (
          <span className="text-[11.5px] font-mono text-[var(--color-text-primary)] truncate" style={{ maxWidth: '60%' }}>
            {hover.group === 'arrays'
              ? fullClassName(hover.label)
              : `${hover.group}.${decodeClassName(hover.label).simpleName}`} · {bytes(hover.value)}
            {hover.instances !== undefined && ` · ${hover.instances.toLocaleString()} objects`}
          </span>
        ) : (
          <span className="text-[11.5px] font-mono text-[var(--color-text-muted)] tabular-nums">
            {bytes(data.totalBytes)} total
          </span>
        )}
      </div>
      {tileCount <= 1 ? (
        <div className="flex-1 min-h-0 grid place-items-center px-6">
          <div style={{ maxWidth: 380, textAlign: 'center' }}>
            <p className="text-[12px] m-0 mb-2" style={{ color: 'var(--color-text-primary)' }}>
              {tileCount === 1
                ? `Just ${fullClassName(data.groups[0]?.children[0]?.name ?? '')} in this set.`
                : 'Nothing in this set.'}
            </p>
            <p className="text-[11px] leading-relaxed m-0" style={{ color: 'var(--color-text-muted)' }}>
              {tileCount === 1
                ? 'Both of these shapes compare one part of the heap against the others, and there is only one part here — it would fill the pane whatever its size. Clear the filter above to see the whole heap, or use Histogram and Retention, which are about a single class.'
                : 'Clear the filter above to see the whole heap.'}
            </p>
          </div>
        </div>
      ) : shape === 'treemap' ? (
        <div ref={wrapRef} className="flex-1 min-h-0" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          <canvas ref={canvasRef} style={{ display: 'block', cursor: 'crosshair' }} />
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid place-items-center overflow-auto py-3">
          <SunburstView
            root={tree}
            size={360}
            maxDepth={2}
            accentColor="var(--color-doctor)"
            format={bytes}
            centerLabel="live heap"
          />
        </div>
      )}
    </div>
  );
}
