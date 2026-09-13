/**
 * A screenshot, at the size it was taken.
 *
 * On a card an image is a thumbnail — cropped, small, there to say "there is
 * evidence here". In an issue body it is the evidence itself, and a 84px strip
 * with `object-fit: cover` showed the top-left corner of somebody's screen and
 * cut off the error they attached it for.
 *
 * So inline it is drawn at its own aspect ratio up to a sensible ceiling, and a
 * click opens it properly: zoom, pan, fullscreen, and the three things somebody
 * actually wants to do with a screenshot on a bug report — save it, copy its
 * address, or open it where it lives.
 */
import { useEffect, useRef, useState } from 'react';
import { Ico } from './GhIcons';

export function GhLightbox({ src, alt, onClose }: {
  src: string;
  alt?: string;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [fitted, setFitted] = useState(true);
  const shell = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  /* Escape closes, and the arrow keys are left alone — a gallery owns those. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === '+' || e.key === '=') { setFitted(false); setZoom(z => Math.min(z * 1.25, 8)); }
      if (e.key === '-') { setFitted(false); setZoom(z => Math.max(z / 1.25, 0.1)); }
      if (e.key === '0') { setFitted(true); setZoom(1); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const fullscreen = () => {
    const el = shell.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  const save = () => {
    /* A data: URI is what the host hands back for a private asset, and an
       anchor download is the only way to get one onto disk from a webview. */
    const a = document.createElement('a');
    a.href = src;
    a.download = (alt || 'evidence').replace(/[^\w.-]+/g, '-').slice(0, 60) + '.png';
    a.click();
  };

  return (
    <div
      ref={shell}
      className="ghlb"
      /* Click the backdrop to close; clicks on the image itself must not. */
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="ghlb-bar" onClick={e => e.stopPropagation()}>
        <span className="ghlb-name">{alt || 'Evidence'}</span>
        {natural && (
          <span className="ghlb-dim">{natural.w} × {natural.h}</span>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={() => { setFitted(true); setZoom(1); }}
                title="Fit to the window (0)">Fit</button>
        <button type="button" className="btn" onClick={() => { setFitted(false); setZoom(1); }}
                title="Show at 100%">1:1</button>
        <button type="button" className="btn" onClick={() => { setFitted(false); setZoom(z => Math.max(z / 1.25, 0.1)); }}
                title="Zoom out (-)">&minus;</button>
        <span className="ghlb-dim" style={{ minWidth: 44, textAlign: 'center' }}>
          {fitted ? 'fit' : `${Math.round(zoom * 100)}%`}
        </span>
        <button type="button" className="btn" onClick={() => { setFitted(false); setZoom(z => Math.min(z * 1.25, 8)); }}
                title="Zoom in (+)">+</button>
        <button type="button" className="btn" onClick={fullscreen} title="Fullscreen">
          <Ico name="export" />
        </button>
        <button type="button" className="btn" onClick={save} title="Save the image">
          <Ico name="dl" />
        </button>
        <button type="button" className="btn" onClick={() => navigator.clipboard?.writeText(src)}
                title="Copy the image address">
          <Ico name="copy" />
        </button>
        <button type="button" className="btn" onClick={onClose} title="Close (Esc)">
          <Ico name="x" />
        </button>
      </div>

      <div className="ghlb-stage" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <img
          src={src}
          alt={alt ?? 'Evidence attached to this issue'}
          onLoad={e => setNatural({
            w: (e.currentTarget as HTMLImageElement).naturalWidth,
            h: (e.currentTarget as HTMLImageElement).naturalHeight,
          })}
          style={fitted
            ? { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }
            /* Past fit, the stage scrolls rather than shrinking the image —
               reading a stack trace in a screenshot needs real pixels. */
            : { width: `${zoom * 100}%`, maxWidth: 'none', height: 'auto' }}
        />
      </div>
    </div>
  );
}
