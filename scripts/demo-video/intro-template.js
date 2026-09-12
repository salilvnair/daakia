/**
 * The brand intro — a typed title, a tagline, and the protocol badges.
 *
 * Rendered as a real page in the Playwright browser rather than through
 * ffmpeg's drawtext, because the ffmpeg build on this machine has no
 * libfreetype — and a real page gets animation for free.
 *
 * ── Three things that were wrong ──
 *
 * 1. It did not read as typing. The reveal was a CSS width animation with
 *    steps(n), which divides the width into n equal slices — and no
 *    proportional font has equal letters, a capital D being nearly three
 *    times an i. The edge landed mid-letter, so it looked like a wipe with a
 *    cursor parked at the end of it. Nothing in CSS knows where one letter
 *    stops and the next begins. The script below does, because it appends
 *    them one at a time.
 *
 * 2. The reveal was centred, so each new letter pushed the whole word outward
 *    from the middle — a zoom, not a keyboard. The box is fixed at the width
 *    of the finished word now, with the text left-aligned inside it, so the
 *    first letter starts where it will end up and only the right edge moves.
 *
 * 3. The finished card was never on screen. The animation ran to about 2.9s
 *    and the clip was 3.2s, so the thing the intro exists to show held for a
 *    third of a second. holdSec in config.json is the hold, the animation
 *    length is measured, and record.js waits for both.
 *
 * Note for anyone editing the markup below: it is a template literal, so a
 * backtick anywhere inside it — including in a CSS comment — ends the string.
 */

/** Per protocol, so the badge row is not eight grey pills. */
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

/** How long a keystroke takes. Five a second reads as typing; eleven does not. */
const PER_CHAR = 0.2;
const TYPE_START = 0.35;

/** When the badges begin, relative to the page load. */
const BADGES_AT = 2.45;
const BADGE_STAGGER = 0.07;
const BADGE_FADE = 0.5;

function badgeHtml(name, i) {
  const color = BADGE_COLORS[name] || '#8a93a3';
  const at = (BADGES_AT + i * BADGE_STAGGER).toFixed(2);
  return `<span class="badge" style="color:${color};animation-delay:${at}s">${name}</span>`;
}

/**
 * How long the whole animation takes, so the caller can hold the finished
 * card for a stated number of seconds rather than guessing at it.
 */
function introAnimationSec(badgeCount) {
  return BADGES_AT + Math.max(0, badgeCount - 1) * BADGE_STAGGER + BADGE_FADE;
}

function buildIntroHtml({ title, tagline, badges, accentColor = '#2ad4a8', width = 1280, height = 800 }) {
  const taglineAt = (TYPE_START + title.length * PER_CHAR + 0.15).toFixed(2);

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

  /* Fixed at the finished width, text left-aligned inside it: the first
     letter starts where it will end up, and only the right edge moves. */
  .title {
    width: calc(var(--brand-w, 400px) + 16px);
    margin: 0 auto;
    text-align: left;
    white-space: nowrap;
  }
  .brand { font-size: 110px; font-weight: 800; letter-spacing: 2px; color: #ffffff; }
  .caret {
    display: inline-block; width: 5px; height: 84px;
    background: ${accentColor};
    vertical-align: -8px; margin-left: 4px;
    animation: blink 0.75s step-end infinite;
  }
  @keyframes blink { 50% { opacity: 0; } }

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
    <div class="title"><span class="brand" id="brand"></span><span class="caret"></span></div>
    <div class="tagline">${tagline}</div>
    <div class="badges">${badges.map(badgeHtml).join('\n      ')}</div>
  </div>
  <script>
    (function () {
      var text = ${JSON.stringify(title)};
      var brand = document.getElementById('brand');

      // Reserve the finished width first, measured from a clone, so the word
      // does not drift as it grows.
      var ghost = brand.cloneNode(false);
      ghost.textContent = text;
      ghost.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap';
      document.body.appendChild(ghost);
      document.documentElement.style.setProperty(
        '--brand-w', Math.ceil(ghost.getBoundingClientRect().width) + 'px');
      ghost.remove();

      var i = 0;
      function tick() {
        brand.textContent = text.slice(0, ++i);
        if (i < text.length) setTimeout(tick, ${Math.round(PER_CHAR * 1000)});
      }
      setTimeout(tick, ${Math.round(TYPE_START * 1000)});
    })();
  </script>
</body></html>`;
}

module.exports = { buildIntroHtml, introAnimationSec };
