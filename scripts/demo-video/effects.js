/**
 * Camera-effect presets for the demo-video generator, expressed as ffmpeg
 * `zoompan` filters. Every effect is really the same shot: the crop window
 * eases in (or out) toward a focal point on the frame, expressed as a
 * fraction of width/height (fx, fy — 0,0 is top-left, 1,1 is bottom-right,
 * 0.5,0.5 is centered). Named presets below are just convenient (fx, fy,
 * zoomTo) triples for common gimbal-style moves — pass fx/fy/zoomTo directly
 * in config.json for a fully custom shot instead of a preset name.
 *
 * Tuned twice: v1 used linear interpolation and 1.15–1.35x zoom, which on a
 * screen recording (crisp UI edges/text, not a photo) reads as "shaky" —
 * zoompan recomputes the crop by rescaling with swscale every output frame,
 * and rounding x/y/zoom to the working resolution's pixel grid means a tiny
 * change in the requested crop between frames can land on a different
 * rounded pixel, which shows up as visible jitter on thin lines exactly
 * where it wouldn't on a photo. Fixed two ways: (1) ease in/out (smoothstep)
 * instead of linear, so motion starts and stops gently instead of a
 * constant-velocity "robot pan"; (2) zoompan renders at `supersample`x the
 * final resolution (compose.js scales back down after) so each frame's
 * rounding error is a fraction of a real output pixel instead of a whole
 * one — this is the standard fix for zoompan jitter. Also dropped the zoom
 * range to 1.05–1.10x — real product-video Ken Burns is subtle enough that
 * you feel the shot is alive without consciously noticing the camera move.
 */

// name -> { fx, fy, zoomTo } — the "gimbal shot" vocabulary.
const PRESETS = {
  'static':               { fx: 0.5,  fy: 0.5,  zoomTo: 1.0 },
  'zoom-in':              { fx: 0.5,  fy: 0.5,  zoomTo: 1.06 },
  'zoom-out':             { fx: 0.5,  fy: 0.5,  zoomTo: 1.06, direction: 'out' },
  'pan-left-right':       { fx: 0.68, fy: 0.5,  zoomTo: 1.07 },
  'pan-right-left':       { fx: 0.32, fy: 0.5,  zoomTo: 1.07 },
  'tilt-top-down':        { fx: 0.5,  fy: 0.68, zoomTo: 1.07 },
  'tilt-bottom-up':       { fx: 0.5,  fy: 0.32, zoomTo: 1.07 },
  'zoom-in-top-left':     { fx: 0.32, fy: 0.32, zoomTo: 1.10 },
  'zoom-in-top-right':    { fx: 0.68, fy: 0.32, zoomTo: 1.10 },
  'zoom-in-bottom-left':  { fx: 0.32, fy: 0.68, zoomTo: 1.10 },
  'zoom-in-bottom-right': { fx: 0.68, fy: 0.68, zoomTo: 1.10 },
};

/**
 * Resolve an effect config (either a preset name string, or an object that
 * may reference a preset via `effect` and override any of fx/fy/zoomTo/direction)
 * into the concrete { fx, fy, zoomTo, direction } used to build the filter.
 */
function resolveEffect(effectConfig) {
  if (typeof effectConfig === 'string') {
    const preset = PRESETS[effectConfig];
    if (!preset) throw new Error(`Unknown camera effect preset "${effectConfig}". Known presets: ${Object.keys(PRESETS).join(', ')}`);
    return { direction: 'in', ...preset };
  }
  const base = effectConfig.preset ? PRESETS[effectConfig.preset] : { fx: 0.5, fy: 0.5, zoomTo: 1.06 };
  if (effectConfig.preset && !base) throw new Error(`Unknown camera effect preset "${effectConfig.preset}"`);
  return { direction: 'in', ...base, ...effectConfig };
}

/**
 * Build the ffmpeg -vf zoompan filter string for a clip of `totalFrames`
 * output frames at the given effect. Works directly on video input (not just
 * still images) because d=1 advances exactly one input frame per output
 * frame — the zoom/pan position is a pure function of the output frame
 * index (`on`), not a stateful accumulator, so it scales cleanly to any clip
 * length and supports zooming back out.
 *
 * Renders at `supersample`x the final width/height — the caller (compose.js)
 * must follow this filter with a `scale=width:height` to bring it back down;
 * see buildZoompanFilter's own comment block above for why.
 */
function buildZoompanFilter(effectConfig, totalFrames, { width = 1280, height = 800, fps = 25, supersample = 2 } = {}) {
  const { fx, fy, zoomTo, direction } = resolveEffect(effectConfig);
  const N = Math.max(1, totalFrames);

  if (zoomTo === 1.0) {
    // Pure static shot — no zoompan needed at all.
    return null;
  }

  const rawT = direction === 'out' ? `(1-on/${N})` : `(on/${N})`;
  // Smoothstep ease-in-out: 3t²-2t³. Zero velocity at both endpoints, so the
  // shot settles into and out of motion instead of snapping to a constant
  // speed — this is what separates "cinematic drift" from "shaky robot pan".
  const t = `(3*pow(${rawT},2)-2*pow(${rawT},3))`;
  const zExpr = `1+${zoomTo - 1}*${t}`;
  const cx = `(iw*0.5+(iw*${fx}-iw*0.5)*${t})`;
  const cy = `(ih*0.5+(ih*${fy}-ih*0.5)*${t})`;
  // clip() keeps the crop window in-bounds even if a custom fx/fy/zoomTo
  // combination would otherwise push it past the frame edge.
  const xExpr = `clip(${cx}-(iw/zoom/2),0,iw-iw/zoom)`;
  const yExpr = `clip(${cy}-(ih/zoom/2),0,ih-ih/zoom)`;

  const workW = width * supersample;
  const workH = height * supersample;
  return `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=1:s=${workW}x${workH}:fps=${fps}`;
}

module.exports = { PRESETS, resolveEffect, buildZoompanFilter };
