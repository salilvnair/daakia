/**
 * The brand intro — a typed title, a tagline, and the protocol badges.
 *
 * Rendered as a real page in the Playwright browser rather than through
 * ffmpeg's drawtext, because the ffmpeg build on this machine has no
 * libfreetype — and a real page gets CSS animation for free.
 *
 * ── Two things that were wrong ──
 *
 * The typewriter animated `width` from `0` to `${n}ch`. A `ch` is the width of
 * a `0` in the current font, and the title is set in a proportional 110px
 * bold, where no letter is that width — so the reveal stopped short of the
 * word or ran past it, and the caret sat in the wrong place either way. The
 * width is measured on load now and the animation runs to that, so it types to
 * exactly the end of the word whatever the word is.
 *
 * And the card was never on screen finished. The animation ran to about 2.9s
 * and the clip was 3.2s long, so the thing the intro exists to show — the
 * name, the tagline and the badges, all drawn — held for a third of a second.
 * `holdSec` is now explicit, and `durationSec` in config.json is the whole
 * card: the animation, then the hold.
 */
const BADGE_COLORS = {
  REST: '#7c8cff',
  GraphQL: '#ec4899',
  WebSocket: '#34d399',
  gRPC: '#2ad4a8',
  SOAP: '#f87171',
  MCP: '#a78bfa',
  Mock: '#fbbf24',
  'Mock Server': '#fbbf24',
  Dk8s: '#38bdf8',
  DkGH: '#fb923c',
};

/** When the badges start, relative to the page load. */
const BADGES_AT = 2.45;
const BADGE_STAGGER = 0.07;
const BADGE_FADE = 0.5;

function badgeHtml(name, i) {
  const color = BADGE_COLORS[name] || '#8a93a3';
  const at = (BADGES_AT + i * BADGE_STAGGER).toFixed(2);
  return `<span class="badge" style="color:${color};animation-delay:${at}s">${name}</span>`;
}

/**
 * How long the animation takes, so the caller can hold the finished card for a
 * known number of seconds afterwards rather than guessing.
 */
function introAnimationSec(badgeCount) {
  return BADGES_AT + Math.max(0, badgeCount - 1) * BADGE_STAGGER + BADGE_FADE;
}

function buildIntroHtml({ title, tagline, badges, accentColor = '#2ad4a8', width = 1280, height = 800 }) {
  const typeStart = 0.35;
  const typeDuration = Math.max(0.9, title.length * 0.2);
  const taglineAt = (typeStart + typeDuration + 0.15).toFixed(2);

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body {
    margin: 0; padding: 0; width: ${width}px; height: ${height}px;
    background: radial-gradient(circle at 50% 45%, #14171c 0%, #0a0b0d 70%);
    display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, "SF Pro Display", Helvetica, Arial, sans-serif;
    overflow: hidden;
  }
  .stage { text-align: center; }

  /*
    The box is the finished width; the text grows inside it from the left.

    This is what makes it read as typing. Centre the growing element itself —
    with a centring margin, or inside a flex row — and each new letter pushes
    the whole word outward from the middle, which looks like a zoom, not a
    keyboard. Fixing the box at the measured width and left-aligning the text
    inside it anchors the first letter where it will finally sit, so only the
    right-hand edge moves.
  */
  .title {
    width: calc(var(--brand-w, 400px) + 14px);
    margin: 0 auto;
    text-align: left;
  }
  .brand {
    display: inline-block;
    font-size: 110px; font-weight: 800; letter-spacing: 2px; color: #ffffff;
    white-space: nowrap; overflow: hidden; vertical-align: bottom;
    width: 0;
    /* The caret is this element's right border, so it sits at the last letter
       typed rather than at the end of the box. */
    border-right: 5px solid ${accentColor};
    animation:
      type ${typeDuration}s steps(${title.length}, end) ${typeStart}s forwards,
      blink 0.75s step-end infinite;
  }
  /* var(--brand-w) is measured on load — see the script below. */
  @keyframes type { from { width: 0; } to { width: var(--brand-w); } }
  @keyframes blink { 50% { border-right-color: transparent; } }

  .tagline {
    margin-top: 28px; font-size: 26px; font-weight: 400; color: #8a93a3;
    opacity: 0; animation: fadeUp 0.6s ease-out ${taglineAt}s forwards;
  }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

  .badges { margin-top: 42px; display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
  .badge {
    font-size: 13px; font-weight: 700; padding: 7px 16px; border-radius: 999px;
    border: 1px solid currentColor; background: color-mix(in srgb, currentColor 12%, transparent);
    opacity: 0; animation: fadeUp ${BADGE_FADE}s ease-out forwards;
  }
</style></head>
<body>
  <div class="stage">
    <div class="title"><span class="brand" id="brand">${title}</span></div>
    <div class="tagline">${tagline}</div>
    <div class="badges">${badges.map(badgeHtml).join('\n      ')}</div>
  </div>
  <script>
    /*
      Measure the title, then let the animation run to that width.

      The element is clipped to width 0, so its own offsetWidth is 0 — the
      measurement is taken from a clone laid out off-screen at the same font.
    */
    (function () {
      var brand = document.getElementById('brand');
      var ghost = brand.cloneNode(true);
      ghost.id = '';
      ghost.style.cssText = 'position:absolute;visibility:hidden;width:auto;animation:none;white-space:nowrap';
      document.body.appendChild(ghost);
      var w = Math.ceil(ghost.getBoundingClientRect().width);
      ghost.remove();
      document.documentElement.style.setProperty('--brand-w', w + 'px');
    })();
  </script>
</body></html>`;
}

module.exports = { buildIntroHtml, introAnimationSec };
