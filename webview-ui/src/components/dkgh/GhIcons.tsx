/**
 * dkgh's icons, taken from the mock.
 *
 * One sprite, defined once and referenced by `<use>` — which is how the mock
 * does it, and the reason every glyph in the tab is the size and weight it was
 * drawn at rather than an approximation from the app's own set.
 *
 * The markup is the mock's, verbatim, injected rather than transcribed into
 * JSX: converting `stroke-width` to `strokeWidth` forty-three times is forty-
 * three chances to change a number that was chosen deliberately.
 *
 * One glyph is not the mock's: `x`. The mock never drew a heading being
 * cleared, so it never needed one; it is drawn to the same construction as the
 * rest — a 16px box, geometric — so it stands in a row with the others without
 * announcing itself. The pin is not here at all: pinning is a thing the app
 * already does in its own tab bar, and it has to be the same drawing pin
 * there and here, so `PinIcon` is imported rather than redrawn.
 *
 * When the mock's icons change, this file is regenerated from it.
 */
import { useEffect, useRef } from 'react';

export type IcoName =
  | 'gh'
  | 'issue'
  | 'closed'
  | 'table'
  | 'board'
  | 'cards'
  | 'tl'
  | 'search'
  | 'filter'
  | 'tag'
  | 'milestone'
  | 'person'
  | 'cal'
  | 'dl'
  | 'chart'
  | 'check'
  | 'warn'
  | 'lock'
  | 'term'
  | 'repo'
  | 'img'
  | 'clip'
  | 'cmt'
  | 'ai'
  | 'pen'
  | 'copy'
  | 'trash'
  | 'drag'
  | 'x'
  | 'b'
  | 'i'
  | 'h'
  | 'code'
  | 'link'
  | 'list'
  | 'task'
  | 'at'
  | 'plus'
  | 'chev'
  | 'refresh'
  | 'xls'
  | 'pdf'
  | 'csv'
  | 'md';

const SPRITE = "<!-- One icon set, defined once and referenced by <use>. Geometric octicon\n         shapes: recognisable at 12px, and no external request to a CDN. -->\n    <g id=\"i-gh\"><circle cx=\"8\" cy=\"8\" r=\"7\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\"/><path d=\"M8 3.4a4.6 4.6 0 0 0-1.45 8.96c.23.04.31-.1.31-.22v-.78c-1.28.28-1.55-.62-1.55-.62-.21-.53-.51-.67-.51-.67-.42-.29.03-.28.03-.28.46.03.7.48.7.48.41.7 1.08.5 1.35.38.04-.3.16-.5.29-.62-1.02-.12-2.1-.51-2.1-2.28 0-.5.18-.92.48-1.24-.05-.12-.21-.59.04-1.24 0 0 .39-.12 1.27.47a4.4 4.4 0 0 1 2.3 0c.88-.59 1.27-.47 1.27-.47.25.65.09 1.12.05 1.24.3.32.47.74.47 1.24 0 1.78-1.08 2.16-2.11 2.27.17.14.32.43.32.86v1.28c0 .12.08.27.31.22A4.6 4.6 0 0 0 8 3.4z\" fill=\"currentColor\"/></g>\n    <g id=\"i-issue\"><circle cx=\"8\" cy=\"8\" r=\"6.4\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\"/><circle cx=\"8\" cy=\"8\" r=\"2.2\" fill=\"currentColor\"/></g>\n    <g id=\"i-closed\"><circle cx=\"8\" cy=\"8\" r=\"6.4\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\"/><path d=\"M5.2 8.2l2 2 3.6-4\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></g>\n    <g id=\"i-table\"><rect x=\"1.6\" y=\"2.6\" width=\"12.8\" height=\"10.8\" rx=\"1.6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\"/><path d=\"M1.6 6h12.8M6.4 6v7.4M10.6 6v7.4\" stroke=\"currentColor\" stroke-width=\"1.2\"/></g>\n    <g id=\"i-board\"><rect x=\"1.6\" y=\"2.6\" width=\"3.6\" height=\"10.8\" rx=\"1.2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\"/><rect x=\"6.2\" y=\"2.6\" width=\"3.6\" height=\"7.4\" rx=\"1.2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\"/><rect x=\"10.8\" y=\"2.6\" width=\"3.6\" height=\"9\" rx=\"1.2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\"/></g>\n    <g id=\"i-cards\"><rect x=\"1.6\" y=\"2.6\" width=\"5.4\" height=\"5\" rx=\"1.2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\"/><rect x=\"9\" y=\"2.6\" width=\"5.4\" height=\"5\" rx=\"1.2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\"/><rect x=\"1.6\" y=\"8.9\" width=\"5.4\" height=\"4.5\" rx=\"1.2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\"/><rect x=\"9\" y=\"8.9\" width=\"5.4\" height=\"4.5\" rx=\"1.2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\"/></g>\n    <g id=\"i-tl\"><path d=\"M2 4.4h7M4.4 8h9M2 11.6h5.6\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\"/></g>\n    <g id=\"i-search\"><circle cx=\"7\" cy=\"7\" r=\"4.4\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"/><path d=\"M10.4 10.4L14 14\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\"/></g>\n    <g id=\"i-filter\"><path d=\"M2 3.6h12L9.4 8.6v4.2l-2.8 1.4V8.6z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linejoin=\"round\"/></g>\n    <g id=\"i-tag\"><path d=\"M2.4 2.4h5l6.2 6.2-5 5L2.4 7.4z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linejoin=\"round\"/><circle cx=\"5.2\" cy=\"5.2\" r=\"1.1\" fill=\"currentColor\"/></g>\n    <g id=\"i-milestone\"><path d=\"M4 1.6v12.8\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\"/><path d=\"M4 2.6h8.4l-1.8 2.4 1.8 2.4H4z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linejoin=\"round\"/></g>\n    <g id=\"i-person\"><circle cx=\"8\" cy=\"5.4\" r=\"2.6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\"/><path d=\"M2.8 13.6a5.2 5.2 0 0 1 10.4 0\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linecap=\"round\"/></g>\n    <g id=\"i-cal\"><rect x=\"1.8\" y=\"3\" width=\"12.4\" height=\"11\" rx=\"1.6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\"/><path d=\"M1.8 6.4h12.4M4.8 1.6v2.6M11.2 1.6v2.6\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linecap=\"round\"/></g>\n    <g id=\"i-dl\"><path d=\"M8 2v8m0 0L4.8 6.8M8 10l3.2-3.2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M2.4 12.4v1.2h11.2v-1.2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\"/></g>\n    <g id=\"i-chart\"><path d=\"M2 13.6V2.6\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linecap=\"round\"/><path d=\"M2 13.6h12\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linecap=\"round\"/><rect x=\"4.4\" y=\"8\" width=\"2.2\" height=\"4\" fill=\"currentColor\"/><rect x=\"7.8\" y=\"5.2\" width=\"2.2\" height=\"6.8\" fill=\"currentColor\"/><rect x=\"11.2\" y=\"9.6\" width=\"2.2\" height=\"2.4\" fill=\"currentColor\"/></g>\n    <g id=\"i-check\"><path d=\"M2.6 8.4l3.4 3.4 7.4-8\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></g>\n    <g id=\"i-warn\"><path d=\"M8 2.2l6 11H2z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linejoin=\"round\"/><path d=\"M8 6.4v3.2\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\"/><circle cx=\"8\" cy=\"11.4\" r=\".8\" fill=\"currentColor\"/></g>\n    <g id=\"i-lock\"><rect x=\"3\" y=\"7\" width=\"10\" height=\"7\" rx=\"1.6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\"/><path d=\"M5.4 7V5.2a2.6 2.6 0 0 1 5.2 0V7\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\"/></g>\n    <g id=\"i-term\"><rect x=\"1.6\" y=\"2.6\" width=\"12.8\" height=\"10.8\" rx=\"1.6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\"/><path d=\"M4.4 6.4l2.2 1.8-2.2 1.8M8.4 10.6h3.2\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></g>\n    <g id=\"i-repo\"><path d=\"M3.4 2.2h9.2v11.6H4.6a1.2 1.2 0 0 1 0-2.4h8\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linejoin=\"round\"/></g>\n    <g id=\"i-img\"><rect x=\"1.8\" y=\"3\" width=\"12.4\" height=\"10\" rx=\"1.6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\"/><circle cx=\"5.6\" cy=\"6.4\" r=\"1.2\" fill=\"currentColor\"/><path d=\"M2.4 12l3.6-3.6 2.6 2.6 2-2 3 3\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linejoin=\"round\"/></g>\n    <g id=\"i-clip\"><path d=\"M11.6 7.4l-4.3 4.3a2.6 2.6 0 0 1-3.7-3.7l5-5a1.8 1.8 0 0 1 2.5 2.5l-4.8 4.8a.9.9 0 1 1-1.3-1.3l4.2-4.2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></g>\n    <g id=\"i-cmt\"><path d=\"M2 3.6h12v7.2H8.4L5 13.8v-3H2z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linejoin=\"round\"/></g>\n    <g id=\"i-ai\"><path d=\"M8 1.8l1.5 3.9 3.9 1.5-3.9 1.5L8 12.6 6.5 8.7 2.6 7.2l3.9-1.5z\" fill=\"currentColor\"/><circle cx=\"12.6\" cy=\"12\" r=\"1.4\" fill=\"currentColor\"/></g>\n    <g id=\"i-pen\"><path d=\"M11.2 2.4l2.4 2.4-8 8-3.2.8.8-3.2z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linejoin=\"round\"/></g>\n    <g id=\"i-copy\"><rect x=\"5\" y=\"5\" width=\"9\" height=\"9\" rx=\"1.5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\"/><path d=\"M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\"/></g>\n    <g id=\"i-trash\"><path d=\"M3 4.4h10M6.2 4.4V2.8h3.6v1.6M4.4 4.4l.7 9h5.8l.7-9\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></g>\n    <g id=\"i-drag\"><circle cx=\"6\" cy=\"4\" r=\"1.2\" fill=\"currentColor\"/><circle cx=\"10\" cy=\"4\" r=\"1.2\" fill=\"currentColor\"/><circle cx=\"6\" cy=\"8\" r=\"1.2\" fill=\"currentColor\"/><circle cx=\"10\" cy=\"8\" r=\"1.2\" fill=\"currentColor\"/><circle cx=\"6\" cy=\"12\" r=\"1.2\" fill=\"currentColor\"/><circle cx=\"10\" cy=\"12\" r=\"1.2\" fill=\"currentColor\"/></g>\n    <g id=\"i-x\"><path d=\"M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\"/></g>\n    <g id=\"i-b\"><path d=\"M4.4 2.8h4.2a2.6 2.6 0 0 1 0 5.2H4.4zM4.4 8h5a2.6 2.6 0 0 1 0 5.2h-5z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linejoin=\"round\"/></g>\n    <g id=\"i-i\"><path d=\"M6.4 2.8h5.2M4.4 13.2h5.2M9.4 2.8L6.6 13.2\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\"/></g>\n    <g id=\"i-h\"><path d=\"M3.4 2.8v10.4M10.4 2.8v10.4M3.4 8h7\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\"/></g>\n    <g id=\"i-code\"><path d=\"M5.6 4.4L2 8l3.6 3.6M10.4 4.4L14 8l-3.6 3.6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></g>\n    <g id=\"i-link\"><path d=\"M6.6 9.4a2.8 2.8 0 0 0 4 0l2-2a2.8 2.8 0 0 0-4-4l-1 1\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linecap=\"round\"/><path d=\"M9.4 6.6a2.8 2.8 0 0 0-4 0l-2 2a2.8 2.8 0 0 0 4 4l1-1\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linecap=\"round\"/></g>\n    <g id=\"i-list\"><path d=\"M5.4 4.4H14M5.4 8H14M5.4 11.6H14\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\"/><circle cx=\"2.6\" cy=\"4.4\" r=\"1.1\" fill=\"currentColor\"/><circle cx=\"2.6\" cy=\"8\" r=\"1.1\" fill=\"currentColor\"/><circle cx=\"2.6\" cy=\"11.6\" r=\"1.1\" fill=\"currentColor\"/></g>\n    <g id=\"i-task\"><rect x=\"1.8\" y=\"2.4\" width=\"5\" height=\"5\" rx=\"1.2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\"/><path d=\"M3 4.9l1.2 1.2 2-2.2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><rect x=\"1.8\" y=\"8.6\" width=\"5\" height=\"5\" rx=\"1.2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\"/><path d=\"M9 4.9H14M9 11.1H14\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linecap=\"round\"/></g>\n    <g id=\"i-at\"><circle cx=\"8\" cy=\"8\" r=\"3\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\"/><path d=\"M11 5.4v3.8a1.9 1.9 0 0 0 3.1 1.2A6.4 6.4 0 1 0 11.4 13\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linecap=\"round\"/></g>\n    <g id=\"i-plus\"><path d=\"M8 3v10M3 8h10\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\"/></g>\n    <g id=\"i-chev\"><path d=\"M4.4 6.2L8 9.8l3.6-3.6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></g>\n    <g id=\"i-refresh\"><path d=\"M13.2 8a5.2 5.2 0 1 1-1.6-3.7\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\"/><path d=\"M13.4 2.2v3.2h-3.2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></g>\n    <g id=\"i-xls\"><path d=\"M3 1.8h6.4L13 5.4v8.8H3z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linejoin=\"round\"/><path d=\"M9.2 1.8v3.8H13\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\"/><path d=\"M5.4 8.6l3.6 3.8M9 8.6l-3.6 3.8\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linecap=\"round\"/></g>\n    <g id=\"i-pdf\"><path d=\"M3 1.8h6.4L13 5.4v8.8H3z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linejoin=\"round\"/><path d=\"M9.2 1.8v3.8H13\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\"/><path d=\"M5.4 12V8.6h1.4a1.1 1.1 0 0 1 0 2.2H5.4M9 12V8.6h1a1.4 1.4 0 0 1 0 3.4z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></g>\n    <g id=\"i-csv\"><path d=\"M3 1.8h6.4L13 5.4v8.8H3z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linejoin=\"round\"/><path d=\"M9.2 1.8v3.8H13\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\"/><path d=\"M5.2 9.4h5.4M5.2 11.6h5.4M7.4 8.2v4.6\" stroke=\"currentColor\" stroke-width=\"1.1\"/></g>\n    <g id=\"i-md\"><rect x=\"1.4\" y=\"3.4\" width=\"13.2\" height=\"9.2\" rx=\"1.6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\"/><path d=\"M3.8 10.6V5.8l2 2.4 2-2.4v4.8M11 5.8v4.2m0 0l-1.4-1.6M11 10l1.4-1.6\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></g>";

/** Whether the sprite is already in the document. Ids must not be duplicated. */
let mounted = 0;

/**
 * The sprite, mounted once for as long as any dkgh screen is on screen.
 *
 * Rendered into the document rather than into the panel, because a `<use>`
 * looks the id up in the whole document and a panel that unmounts would take
 * every other panel's icons with it.
 */
export function GhSprite() {
  const host = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    mounted += 1;
    if (mounted === 1) {
      const el = document.createElement('div');
      el.id = 'dkgh-sprite';
      el.innerHTML =
        `<svg width="0" height="0" style="position:absolute" aria-hidden="true">`
        + `<defs>${SPRITE}</defs></svg>`;
      document.body.appendChild(el);
      host.current = el;
    }
    return () => {
      mounted -= 1;
      if (mounted === 0) document.getElementById('dkgh-sprite')?.remove();
    };
  }, []);

  return null;
}

/**
 * One icon.
 *
 * No size prop: the mock sizes its icons in CSS, per place — 15px in the
 * repository line, 12px in the sub-tabs, 11px on a chip — so a size passed here
 * would be a second opinion about a number the stylesheet already holds.
 */
export function Ico({ name, className, style }: {
  name: IcoName;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg viewBox="0 0 16 16" className={className} style={style} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}
