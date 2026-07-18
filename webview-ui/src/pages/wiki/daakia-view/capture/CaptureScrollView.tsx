/**
 * CaptureScrollView — renders a protocol's captured screens as a vertical
 * scroll: [scaled live capture] -> [explanation] -> [scaled live capture] -> ...
 * Each capture is a real outerHTML snapshot (see CaptureBridge.tsx), injected
 * via dangerouslySetInnerHTML with pointer-events disabled — CSS variables
 * resolve against the live theme, so one capture looks correct in dark and
 * light automatically.
 *
 * `CaptureCard` and `WikiScrollPage` are exported separately so protocol pages
 * can interleave real captures with rich WikiShared content (ported from the
 * old wiki — E-wiki-content-migration) instead of only a flat capture list.
 */
import { useRef, useLayoutEffect, useState, useCallback } from 'react';
import './CaptureScrollView.css';

export interface CaptureEntry {
  id: string;
  label: string;
  explanation: string;
  html: string;
}

/** Horizontal region (in the capture's native 1280-wide design space) to zoom
 * into instead of showing the full-width screenshot — for screens where the
 * relevant content (e.g. a 260px sidebar panel) sits in a small slice of the
 * full app width and would otherwise be squeezed illegibly small once scaled
 * down to card width. */
export interface CaptureCrop {
  x: number;
  width: number;
}

// Design size the captures were taken at — see wiki-capture-*.test.ts.
// Kept in sync with CaptureScrollView.css's .dw-capture-frozen overrides,
// which freeze captured content's w-screen/h-screen (100vw/100vh) to this
// same size — those units otherwise resolve against the wiki viewer's real
// window, not this fixed design box. Change both together.
const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;

export function CaptureCard({ entry, crop }: { entry: CaptureEntry; crop?: CaptureCrop }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const cropWidth = crop?.width ?? DESIGN_WIDTH;
  const cropX = crop?.x ?? 0;

  const updateScale = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const raw = el.clientWidth / cropWidth;
    // Uncropped captures never zoom past 1x (would just upscale/blur); a
    // crop is a deliberate zoom-in, so it's allowed past 1x.
    setScale(crop ? raw : Math.min(raw, 1));
  }, [cropWidth, crop]);

  useLayoutEffect(() => {
    updateScale();
    const ro = new ResizeObserver(updateScale);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [updateScale]);

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-lg border border-[var(--color-surface-border)]"
        style={{ height: DESIGN_HEIGHT * scale }}
      >
        <div
          className="dw-capture-frozen"
          style={{
            width: DESIGN_WIDTH,
            height: DESIGN_HEIGHT,
            transform: `scale(${scale}) translateX(${-cropX}px)`,
            transformOrigin: 'top left',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
          dangerouslySetInnerHTML={{ __html: entry.html }}
        />
      </div>
      <div className="dw-capture-caption">
        <div className="dw-capture-caption-eyebrow">
          <span className="dw-capture-caption-dot" />
          LIVE CAPTURE
        </div>
        <h3 className="dw-capture-caption-title">{entry.label}</h3>
        <p className="dw-capture-caption-desc">{entry.explanation}</p>
      </div>
    </div>
  );
}

/** Generic scrollable, max-width-capped container — the shell CaptureScrollView
 * uses internally, exposed so pages can mix CaptureCards with rich content.
 * An optional `hero` (see WikiHero in WikiShared.tsx) renders full-width and
 * pinned above the scrollable body, like a docs-page header. An optional
 * `toc` (see TocBar in WikiShared.tsx) renders pinned just below the hero —
 * both stay visible while the body underneath scrolls. */
export function WikiScrollPage({ children, hero, toc }: { children: React.ReactNode; hero?: React.ReactNode; toc?: React.ReactNode }) {
  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      {hero}
      {toc}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1160px] mx-auto flex flex-col gap-5 px-6 py-4">
          {children}
        </div>
      </div>
    </div>
  );
}

export function CaptureScrollView({ entries }: { entries: CaptureEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-[var(--color-text-muted)]">
        <span className="text-[24px]">{'⟨/⟩'}</span>
        <span className="text-[12px]">No captures yet for this protocol</span>
      </div>
    );
  }
  return (
    <WikiScrollPage>
      {entries.map(entry => <CaptureCard key={entry.id} entry={entry} />)}
    </WikiScrollPage>
  );
}
