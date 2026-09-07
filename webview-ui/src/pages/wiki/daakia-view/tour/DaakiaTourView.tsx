/**
 * Daakia Tour — the app, walked through.
 *
 * ── What it is ──
 *
 * A real captured screen per stop, with the interesting parts marked. Click a
 * marker and it says what that thing is. The rest of the wiki is reference you
 * read once you know what you are looking for; this is the part for somebody
 * who has not opened Daakia yet and wants to see it before reading about it.
 *
 * ── How the markers stay put ──
 *
 * A capture is a `#root` outerHTML rendered at a fixed design size and scaled
 * to whatever width the panel has. Hotspots are percentages of that box and
 * live in the same transformed layer as the picture, so they move with it and
 * need no recalculation on resize.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TOUR_STOPS, tourChapters, type TourStop, type Hotspot } from './tour-stops';
import { REST_CAPTURES } from '../rest/captures';
import { PLATFORM_CAPTURES } from '../platform/captures';
import { MOCK_SERVER_CAPTURES } from '../mock-server/captures';
import { DK8S_CAPTURES } from '../dk8s/captures';
import { GQL_CAPTURES } from '../gql/captures';
import type { CaptureEntry } from '../capture/CaptureScrollView';
import { ChevronRightIcon, CloseIcon } from '../../../../icons';
import './tour.css';

const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;

const BY_SECTION: Record<TourStop['section'], CaptureEntry[]> = {
  rest: REST_CAPTURES,
  platform: PLATFORM_CAPTURES,
  'mock-server': MOCK_SERVER_CAPTURES,
  dk8s: DK8S_CAPTURES,
  graphql: GQL_CAPTURES,
};

export function captureFor(stop: TourStop): CaptureEntry | undefined {
  return BY_SECTION[stop.section]?.find(c => c.id === stop.capture);
}

// ── The stage ────────────────────────────────────────────────────────────────

function Stage({ stop }: { stop: TourStop }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [openSpot, setOpenSpot] = useState<number | null>(null);

  const entry = captureFor(stop);

  const updateScale = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setScale(Math.min(el.clientWidth / DESIGN_WIDTH, 1));
  }, []);

  useLayoutEffect(() => {
    updateScale();
    const ro = new ResizeObserver(updateScale);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [updateScale]);

  // A new stop starts with nothing open — leaving the previous popover up
  // would describe the old screen over the new one.
  useEffect(() => { setOpenSpot(null); }, [stop.id]);

  if (!entry) {
    return (
      <div className="dt-stage dt-stage--missing">
        <p>This screen has not been captured yet.</p>
        <code>npm run screencapture -- {stop.capture}</code>
      </div>
    );
  }

  /*
    Two layers, and only the picture is scaled.

    The markers used to live inside the scaled layer, which shrank them with
    the screenshot and — worse — put their popovers inside the clipped box, so
    a card near an edge was cut off. The overlay is unscaled and exactly
    covers the picture, so the same percentages land in the same places while
    the dots and their cards stay at their natural, readable size.
  */
  return (
    <div ref={containerRef} className="dt-stage-wrap" onClick={() => setOpenSpot(null)}>
      <div className="dt-stage" style={{ height: DESIGN_HEIGHT * scale }}>
        <div
          className="dw-capture-frozen dt-shot"
          style={{
            width: DESIGN_WIDTH,
            height: DESIGN_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
          dangerouslySetInnerHTML={{ __html: entry.html }}
        />
      </div>

      <div className="dt-spots" style={{ height: DESIGN_HEIGHT * scale }}>
        {stop.hotspots.map((spot, i) => (
          <Spot
            key={i}
            spot={spot}
            index={i}
            open={openSpot === i}
            onToggle={() => setOpenSpot(openSpot === i ? null : i)}
          />
        ))}
      </div>
    </div>
  );
}

function Spot({ spot, index, open, onToggle }: {
  spot: Hotspot; index: number; open: boolean; onToggle: () => void;
}) {
  /* Past the middle the card would run off the right edge, so it flips to the
     other side of the dot rather than being clipped. */
  const flipX = spot.x > 62;
  const flipY = spot.y > 68;

  return (
    <div
      className="dt-spot"
      style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
      onClick={e => { e.stopPropagation(); onToggle(); }}
    >
      <button
        type="button"
        className={`dt-dot${open ? ' dt-dot--open' : ''}`}
        aria-label={spot.title}
        aria-expanded={open}
      >
        <span className="dt-dot-pulse" aria-hidden="true" />
        <span className="dt-dot-num">{index + 1}</span>
      </button>

      {open && (
        <div className={`dt-pop${flipX ? ' dt-pop--left' : ''}${flipY ? ' dt-pop--up' : ''}`}>
          <div className="dt-pop-head">
            <span className="dt-pop-index">{index + 1}</span>
            <span className="dt-pop-title">{spot.title}</span>
            <button type="button" className="dt-pop-close" onClick={onToggle} aria-label="Close">
              <CloseIcon size={11} />
            </button>
          </div>
          <p className="dt-pop-body">{spot.body}</p>
        </div>
      )}
    </div>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────

export function DaakiaTourView() {
  const [index, setIndex] = useState(0);
  const stop = TOUR_STOPS[index];
  const chapters = tourChapters();

  const go = useCallback((next: number) => {
    setIndex(Math.max(0, Math.min(TOUR_STOPS.length - 1, next)));
  }, []);

  /* Arrow keys, because a tour is a thing you page through. Ignored while a
     field has focus so the wiki's own search box still works. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
      if (e.key === 'ArrowRight') go(index + 1);
      if (e.key === 'ArrowLeft') go(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, go]);

  return (
    <div className="dt-root">
      <header className="dt-hero">
        <div className="dt-hero-main">
          <span className="dt-hero-eyebrow">Daakia Tour</span>
          <h1 className="dt-hero-title">{stop.title}</h1>
          <p className="dt-hero-blurb">{stop.blurb}</p>
        </div>
        <div className="dt-hero-meta">
          <span className="dt-chapter">{stop.chapter}</span>
          <span className="dt-count">{index + 1} <i>/</i> {TOUR_STOPS.length}</span>
        </div>
      </header>

      <nav className="dt-rail" aria-label="Tour stops">
        {chapters.map(ch => (
          <div key={ch.chapter} className="dt-rail-group">
            <span className="dt-rail-label">{ch.chapter}</span>
            <div className="dt-rail-dots">
              {ch.stops.map(s => {
                const at = TOUR_STOPS.indexOf(s);
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`dt-rail-dot${at === index ? ' dt-rail-dot--on' : ''}`}
                    title={s.title}
                    onClick={() => go(at)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="dt-body">
        <Stage stop={stop} />
        <p className="dt-hint">
          {stop.hotspots.length} points on this screen — click a numbered marker to read what it does
        </p>
      </div>

      <footer className="dt-foot">
        <button type="button" className="dt-nav" disabled={index === 0} onClick={() => go(index - 1)}>
          <ChevronRightIcon size={12} style={{ transform: 'rotate(180deg)' }} />
          Back
        </button>
        <div className="dt-foot-mid">
          {TOUR_STOPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`dt-pip${i === index ? ' dt-pip--on' : ''}`}
              title={s.title}
              onClick={() => go(i)}
            />
          ))}
        </div>
        <button
          type="button"
          className="dt-nav dt-nav--primary"
          disabled={index === TOUR_STOPS.length - 1}
          onClick={() => go(index + 1)}
        >
          Next
          <ChevronRightIcon size={12} />
        </button>
      </footer>
    </div>
  );
}
