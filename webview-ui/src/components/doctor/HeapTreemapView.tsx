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
import { useEffect, useRef, useState } from 'react';
import { heapQuery, bytes, hueFor, type TreemapData } from './heap-query';
import { squarify, type Tile } from './treemap-layout';

export function HeapTreemapView({ packageFilter }: { packageFilter?: string }) {
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
        ctx.fillStyle = hueFor(t.group);
        ctx.globalAlpha = 0.82;
        ctx.fillRect(t.x, t.y, t.w, t.h);
        ctx.globalAlpha = 1;
        if (t.w > 1 && t.h > 1) {
          ctx.strokeStyle = 'rgba(0,0,0,0.28)';
          ctx.lineWidth = 0.6;
          ctx.strokeRect(t.x + 0.3, t.y + 0.3, t.w - 0.6, t.h - 0.6);
        }
        // Only label tiles with room, or the text becomes noise.
        if (t.w > 58 && t.h > 16) {
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.font = '10px ui-monospace, monospace';
          ctx.save();
          ctx.beginPath(); ctx.rect(t.x + 2, t.y + 2, t.w - 4, t.h - 4); ctx.clip();
          ctx.fillText(t.label, t.x + 4, t.y + 12);
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
  }, [data]);

  const onMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    setHover(tilesRef.current.find(t => x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h) ?? null);
  };

  if (error) return <p className="text-[12px] text-[var(--color-error)] px-4 py-4 m-0">{error}</p>;
  if (!data) return <p className="text-[12px] text-[var(--color-text-muted)] px-4 py-4 m-0">Building treemap…</p>;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-3 px-3 py-2 flex-shrink-0 flex-wrap"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <span className="text-[11.5px] text-[var(--color-text-secondary)]">
          Live heap by package — area is shallow bytes
        </span>
        <div className="flex-1" />
        {hover ? (
          <span className="text-[11.5px] font-mono text-[var(--color-text-primary)] truncate" style={{ maxWidth: '60%' }}>
            {hover.group}.{hover.label} · {bytes(hover.value)}
            {hover.instances !== undefined && ` · ${hover.instances.toLocaleString()} objects`}
          </span>
        ) : (
          <span className="text-[11.5px] font-mono text-[var(--color-text-muted)] tabular-nums">
            {bytes(data.totalBytes)} total
          </span>
        )}
      </div>
      <div ref={wrapRef} className="flex-1 min-h-0" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <canvas ref={canvasRef} style={{ display: 'block', cursor: 'crosshair' }} />
      </div>
    </div>
  );
}
