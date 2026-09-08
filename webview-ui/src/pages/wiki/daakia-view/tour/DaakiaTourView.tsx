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
import { GRPC_CAPTURES } from '../grpc/captures';
import { SOAP_CAPTURES } from '../soap/captures';
import { WEBSOCKET_CAPTURES } from '../websocket/captures';
import type { CaptureEntry } from '../capture/CaptureScrollView';
import { ChevronRightIcon, CloseIcon, PlayIcon, PauseIcon } from '../../../../icons';
import './tour.css';

/** How long each marker's card stays open while the tour plays itself. */
const SPOT_MS = 5000;

const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;

const BY_SECTION: Record<TourStop['section'], CaptureEntry[]> = {
  rest: REST_CAPTURES,
  platform: PLATFORM_CAPTURES,
  'mock-server': MOCK_SERVER_CAPTURES,
  dk8s: DK8S_CAPTURES,
  graphql: GQL_CAPTURES,
  grpc: GRPC_CAPTURES,
  soap: SOAP_CAPTURES,
  realtime: WEBSOCKET_CAPTURES,
};

export function captureFor(stop: TourStop): CaptureEntry | undefined {
  return BY_SECTION[stop.section]?.find(c => c.id === stop.capture);
}

/**
 * Where a marker actually goes, once the capture has rendered.
 *
 * A hotspot naming an `anchor` is placed on the text it names — found in the
 * capture's own DOM — so it follows that element when a recapture moves it.
 * Ninety screens is more than anyone will re-measure by hand, and a marker
 * pointing at where a button used to be is worse than no marker.
 *
 * Returns null when the anchor is nowhere and no coordinates were given: a
 * marker that cannot find its subject is dropped rather than parked in a
 * corner still claiming to point at it.
 */
function resolveSpot(
  spot: Hotspot,
  shot: HTMLElement | null,
): { x: number; y: number } | null {
  if (spot.anchor && shot) {
    const wanted = spot.anchor.toLowerCase();
    const all = Array.from(shot.querySelectorAll<HTMLElement>('*'));

    /* The deepest element carrying the text, not the innermost childless one:
       a button reading "Send" is usually an icon plus a text node, so it has
       children and a leaf-only search misses it entirely. Deepest-match finds
       the button and skips its ancestors, which all carry the text too. */
    const deepest = (list: HTMLElement[]) =>
      list.filter(el => !list.some(other => other !== el && el.contains(other)));

    const exact = deepest(all.filter(el => el.textContent?.trim().toLowerCase() === wanted));
    const starts = deepest(all.filter(el => el.textContent?.trim().toLowerCase().startsWith(wanted)));
    const hits = exact.length > 0 ? exact : starts;
    const el = hits[spot.nth ?? 0];

    if (el) {
      const box = shot.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      /* The shot is scaled, so both rects are in the same scaled space and the
         ratio is scale-independent. */
      if (box.width > 0 && box.height > 0 && r.width > 0) {
        return {
          x: ((r.left + r.width / 2 - box.left) / box.width) * 100 + (spot.dx ?? 0),
          y: ((r.top + r.height / 2 - box.top) / box.height) * 100 + (spot.dy ?? 0),
        };
      }
    }
  }

  if (spot.x != null && spot.y != null) return { x: spot.x, y: spot.y };
  return null;
}

// ── The stage ────────────────────────────────────────────────────────────────

function Stage({ stop, playing, onDone }: {
  stop: TourStop; playing: boolean; onDone: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shotRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [openSpot, setOpenSpot] = useState<number | null>(null);
  const [placed, setPlaced] = useState<({ x: number; y: number } | null)[]>([]);

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
  // would describe the old screen over the new one. Playing is the exception:
  // it opens the first marker straight away rather than showing a bare screen
  // for a beat first.
  useEffect(() => { setOpenSpot(playing ? 0 : null); }, [stop.id, playing]);

  /* Anchors resolve after the capture is in the DOM and has been laid out,
     and again whenever the frame is rescaled. */
  useLayoutEffect(() => {
    setPlaced(stop.hotspots.map(h => resolveSpot(h, shotRef.current)));
  }, [stop, scale]);

  /*
    Playing reads the screen, it does not just flip through screens.

    Each marker opens in turn and holds for SPOT_MS; when the last one has had
    its turn the card closes and the stop is done, which is what moves the tour
    on. Markers whose anchor was not found are skipped — pausing on an invisible
    one would look like the tour had stalled.
  */
  useEffect(() => {
    if (!playing) return;
    const shown = placed.map((p, i) => (p ? i : -1)).filter(i => i >= 0);
    if (shown.length === 0) {
      const t = setTimeout(onDone, SPOT_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      const at = shown.indexOf(openSpot ?? -1);
      if (at < 0) { setOpenSpot(shown[0]); return; }
      if (at + 1 < shown.length) { setOpenSpot(shown[at + 1]); return; }
      setOpenSpot(null);
      onDone();
    }, SPOT_MS);
    return () => clearTimeout(t);
  }, [playing, openSpot, placed, onDone]);

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
          ref={shotRef}
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
        {stop.hotspots.map((spot, i) => {
          const at = placed[i];
          if (!at) return null;
          return (
            <Spot
              key={i}
              spot={spot}
              at={at}
              index={i}
              open={openSpot === i}
              onToggle={() => setOpenSpot(openSpot === i ? null : i)}
            />
          );
        })}
      </div>
    </div>
  );
}

function Spot({ spot, at, index, open, onToggle }: {
  spot: Hotspot; at: { x: number; y: number }; index: number; open: boolean; onToggle: () => void;
}) {
  /* Past the middle the card would run off the right edge, so it flips to the
     other side of the dot rather than being clipped. */
  const flipX = at.x > 62;
  const flipY = at.y > 68;

  return (
    <div
      className="dt-spot"
      style={{ left: `${at.x}%`, top: `${at.y}%` }}
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
  const [playing, setPlaying] = useState(false);
  const stop = TOUR_STOPS[index];
  const chapters = tourChapters();
  const railRef = useRef<HTMLElement>(null);

  /*
    The strip is 88 ticks wide and had a scrollbar under it, which is a second
    thing to aim at for something you would rather just shove. Press and drag
    scrolls it directly; the scrollbar itself is hidden in CSS.
  */
  const drag = useRef<{ x: number; left: number } | null>(null);
  const dragProps = {
    onPointerDown: (e: React.PointerEvent) => {
      const el = railRef.current;
      if (!el || (e.target as HTMLElement).closest('button')) return;
      drag.current = { x: e.clientX, left: el.scrollLeft };
      el.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const el = railRef.current;
      if (!el || !drag.current) return;
      el.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
    },
    onPointerUp: (e: React.PointerEvent) => {
      drag.current = null;
      railRef.current?.releasePointerCapture(e.pointerId);
    },
  };

  /* The tour walks itself past the right-hand edge within a chapter or two, so
     the strip follows the stop rather than leaving it off screen. */
  useEffect(() => {
    const on = railRef.current?.querySelector<HTMLElement>('[data-on]');
    on?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [index]);

  const go = useCallback((next: number) => {
    setIndex(Math.max(0, Math.min(TOUR_STOPS.length - 1, next)));
  }, []);

  /* The stage says when a stop is finished — it has its own markers to get
     through first. Playing stops at the end rather than looping: a tour that
     starts over without being asked is a thing you have to notice and stop. */
  const onStopDone = useCallback(() => {
    setIndex(i => {
      if (i >= TOUR_STOPS.length - 1) { setPlaying(false); return i; }
      return i + 1;
    });
  }, []);

  /* Any deliberate move takes the wheel back. */
  const goManually = useCallback((next: number) => {
    setPlaying(false);
    go(next);
  }, [go]);

  /* Arrow keys, because a tour is a thing you page through. Ignored while a
     field has focus so the wiki's own search box still works. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
      if (e.key === 'ArrowRight') goManually(index + 1);
      if (e.key === 'ArrowLeft') goManually(index - 1);
      if (e.key === ' ') { e.preventDefault(); setPlaying(p => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, goManually]);

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

      {/* The controls sit under the hero text rather than at the foot of the
          page: the picture is tall, and a Next button below it is off-screen
          on a short panel — which is where it is needed most. */}
      <div className="dt-controls">
        <button
          type="button"
          className="dt-nav"
          disabled={index === 0}
          onClick={() => goManually(index - 1)}
        >
          <ChevronRightIcon size={12} style={{ transform: 'rotate(180deg)' }} />
          Back
        </button>

        {/* Play alone in the middle. Eighty-eight pips wrapped into a block of
            dots that said nothing you could act on — the chapter strip below
            already shows where you are, and each of its ticks is one stop. */}
        <div className="dt-controls-mid">
          <button
            type="button"
            className={`dt-play${playing ? ' dt-play--on' : ''}`}
            onClick={() => setPlaying(p => !p)}
            title={playing ? 'Pause the tour (space)' : 'Play the tour (space)'}
          >
            {playing ? <PauseIcon size={12} /> : <PlayIcon size={12} />}
            {playing ? 'Pause' : 'Play tour'}
          </button>
        </div>

        <button
          type="button"
          className="dt-nav"
          disabled={index === TOUR_STOPS.length - 1}
          onClick={() => goManually(index + 1)}
        >
          Next
          <ChevronRightIcon size={12} />
        </button>
      </div>

      <nav className="dt-rail" ref={railRef} aria-label="Tour stops" {...dragProps}>
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
                    data-on={at === index || undefined}
                    onClick={() => goManually(at)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="dt-body">
        <Stage stop={stop} playing={playing} onDone={onStopDone} />
        <p className="dt-hint">
          {playing
            ? `Playing — each of the ${stop.hotspots.length} points opens in turn`
            : `${stop.hotspots.length} points on this screen — click a numbered marker to read what it does`}
        </p>
      </div>

    </div>
  );
}
