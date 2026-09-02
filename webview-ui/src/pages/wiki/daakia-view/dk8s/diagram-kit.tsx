/**
 * The pieces every dk8s diagram is drawn from.
 *
 * Hand-authored SVG rather than images: the drawings inherit the reader's
 * theme, stay sharp at any zoom, and cannot go stale the way a screenshot of a
 * dialog does. Colours are wiki tokens, so light and dark are one definition.
 */

export const FG = 'var(--dw-fg)';
export const MUTED = 'var(--dw-muted)';
export const LINE = 'var(--dw-border)';
export const LIVE = 'var(--dw-grpc)';   // cyan — the live/kubectl path
export const ARCH = 'var(--dw-mock)';   // amber — the volume/archive path
export const HIT = 'var(--dw-ws)';      // green — a good outcome
export const STOP = 'var(--dw-soap)';   // orange — a refusal or a dead end

/** Shared arrowhead. Ids are fragment-internal, so one per svg. */
export function Defs({ id }: { id: string }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 8 8" refX="7" refY="4"
              markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0,0 L8,4 L0,8 z" fill={MUTED} />
      </marker>
    </defs>
  );
}

export function Box({ x, y, w, h, stroke = LINE, dash }: {
  x: number; y: number; w: number; h: number; stroke?: string; dash?: string;
}) {
  return (
    <rect x={x} y={y} width={w} height={h} rx="6"
          fill="none" stroke={stroke} strokeWidth="1.2" strokeDasharray={dash} />
  );
}

export function T({ x, y, children, fill = FG, size = 11.5, anchor = 'middle', weight = 400 }: {
  x: number; y: number; children: React.ReactNode;
  fill?: string; size?: number; anchor?: 'start' | 'middle' | 'end'; weight?: number;
}) {
  return (
    <text x={x} y={y} fontSize={size} fill={fill} textAnchor={anchor}
          fontWeight={weight} fontFamily="inherit">{children}</text>
  );
}

/** A plain connector. `to` gets the arrowhead; a bare line has none. */
export function Arrow({ x1, y1, x2, y2, marker }: {
  x1: number; y1: number; x2: number; y2: number; marker?: string;
}) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={MUTED}
               markerEnd={marker ? `url(#${marker})` : undefined} />;
}
