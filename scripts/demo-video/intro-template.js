/**
 * Generates the brand-intro HTML (typewriter title + tagline + protocol
 * badges) from config.json's `intro` block. Rendered as a real page in the
 * Playwright browser rather than via ffmpeg drawtext, because the ffmpeg
 * build on this machine has no libfreetype/drawtext support — a real page
 * also gets proper CSS animation (typewriter, fade) for free.
 */
const BADGE_COLORS = {
  REST: '#7c8cff',
  GraphQL: '#ec4899',
  WebSocket: '#34d399',
  gRPC: '#2ad4a8',
  SOAP: '#f87171',
  'Mock Server': '#fbbf24',
};

function badgeHtml(name, i) {
  const color = BADGE_COLORS[name] || '#8a93a3';
  return `<span class="badge" style="color:${color};animation-delay:${2.0 + i * 0.05}s">${name}</span>`;
}

function buildIntroHtml({ title, tagline, badges, accentColor = '#2ad4a8', width = 1280, height = 800 }) {
  const typeSteps = title.length;
  const typeDuration = Math.max(0.5, typeSteps * 0.14);
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
  .brand {
    font-size: 110px; font-weight: 800; letter-spacing: 2px; color: #ffffff;
    white-space: nowrap; overflow: hidden;
    border-right: 5px solid ${accentColor};
    width: 0; margin: 0 auto;
    animation: type ${typeDuration}s steps(${typeSteps}, end) 0.25s forwards, blink 0.8s step-end infinite;
  }
  @keyframes type { from { width: 0; } to { width: ${typeSteps + 0.15}ch; } }
  @keyframes blink { 50% { border-color: transparent; } }
  .tagline {
    margin-top: 28px; font-size: 26px; font-weight: 400; color: #8a93a3;
    opacity: 0; animation: fadeUp 0.6s ease-out ${(0.25 + typeDuration).toFixed(2)}s forwards;
  }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  .badges { margin-top: 42px; display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
  .badge {
    font-size: 13px; font-weight: 700; padding: 7px 16px; border-radius: 999px;
    border: 1px solid currentColor; background: color-mix(in srgb, currentColor 12%, transparent);
    opacity: 0; animation: fadeUp 0.5s ease-out forwards;
  }
</style></head>
<body>
  <div class="stage">
    <div class="brand">${title}</div>
    <div class="tagline">${tagline}</div>
    <div class="badges">${badges.map(badgeHtml).join('\n      ')}</div>
  </div>
</body></html>`;
}

module.exports = { buildIntroHtml };
