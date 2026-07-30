#!/usr/bin/env node
/**
 * Composes the raw clips recorded by record.js into the final showcase:
 * per-clip camera effect (config.json's `effect`, via effects.js) applied
 * with ffmpeg zoompan, then chained with crossfade transitions (xfade).
 * Exports an .mp4 always, and a .gif too if run with --gif (GIF's 256-color
 * palette bands on smooth zoom/crossfade content, so prefer the mp4 unless
 * you specifically need a GIF for a place that can't embed video).
 *
 * Usage: node scripts/demo-video/compose.js [path/to/config.json] [--gif]
 */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { buildZoompanFilter } = require('./effects');

const ROOT = __dirname;
const args = process.argv.slice(2).filter((a) => a !== '--gif');
const makeGif = process.argv.includes('--gif');
const configPath = path.resolve(args[0] || path.join(ROOT, 'config.json'));
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const OUT_DIR = path.join(ROOT, '.output');
const RAW_DIR = path.join(OUT_DIR, 'raw');
const PROC_DIR = path.join(OUT_DIR, 'processed');
fs.mkdirSync(PROC_DIR, { recursive: true });

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
}

function ffprobeDuration(file) {
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file,
  ]).toString().trim();
  return parseFloat(out);
}

function checkFfmpeg() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  } catch {
    console.error('ffmpeg not found on PATH. Install it (e.g. `brew install ffmpeg`) and re-run.');
    process.exit(1);
  }
}
checkFfmpeg();

const { width, height, fps } = config.output;

// clip plan: intro first (no trim), then each segment (trimmed per config).
const plan = [];
if (config.intro?.enabled) {
  plan.push({ id: 'intro', raw: path.join(RAW_DIR, 'intro.webm'), trimStartSec: 0, effect: config.intro.effect || 'zoom-in' });
}
for (const seg of config.segments) {
  plan.push({ id: seg.id, raw: path.join(RAW_DIR, seg.id + '.webm'), trimStartSec: seg.trimStartSec ?? 1.5, effect: seg.effect || 'zoom-in' });
}

for (const clip of plan) {
  if (!fs.existsSync(clip.raw)) {
    throw new Error(`Missing raw clip ${clip.raw} — run record.js first.`);
  }
}

console.log('Processing clips (trim + camera effect)...');
const processed = plan.map((clip, i) => {
  const rawDuration = ffprobeDuration(clip.raw);
  const duration = Math.max(0.5, rawDuration - clip.trimStartSec);
  const totalFrames = Math.round(duration * fps);
  const zoompan = buildZoompanFilter(clip.effect, totalFrames, { width, height, fps });
  const outFile = path.join(PROC_DIR, `${i}_${clip.id}.mp4`);
  const vfParts = [];
  if (zoompan) {
    // zoompan rendered at 2x working resolution (see effects.js) to avoid
    // per-frame rounding jitter on crisp UI edges — scale back down here.
    vfParts.push(zoompan, `scale=${width}:${height}:flags=lanczos`);
  }
  const ffArgs = ['-ss', String(clip.trimStartSec), '-i', clip.raw];
  if (vfParts.length) ffArgs.push('-vf', vfParts.join(','));
  ffArgs.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', outFile);
  ffmpeg(ffArgs);
  const outDuration = ffprobeDuration(outFile);
  console.log(`  ${clip.id}: ${outDuration.toFixed(2)}s, effect="${typeof clip.effect === 'string' ? clip.effect : JSON.stringify(clip.effect)}"`);
  return { ...clip, outFile, duration: outDuration };
});

console.log('Chaining transitions...');
const transDur = config.transitions?.durationSec ?? 0.7;
const transType = config.transitions?.type ?? 'zoomin';

let filterParts = [];
let offset = processed[0].duration - transDur;
let running = processed[0].duration;
let lastLabel = '0:v';
for (let i = 1; i < processed.length; i++) {
  const outLabel = i === processed.length - 1 ? 'vout' : `vx${i}`;
  filterParts.push(`[${lastLabel}][${i}:v]xfade=transition=${transType}:duration=${transDur}:offset=${offset.toFixed(3)}[${outLabel}]`);
  running = running + processed[i].duration - transDur;
  offset = running - transDur;
  lastLabel = outLabel;
}

const inputArgs = processed.flatMap((c) => ['-i', c.outFile]);
const finalMp4 = path.join(OUT_DIR, `${config.output.name}.mp4`);
ffmpeg([
  ...inputArgs,
  '-filter_complex', filterParts.join('; '),
  '-map', '[vout]',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-r', String(fps),
  finalMp4,
]);
console.log('Wrote', finalMp4, `(${running.toFixed(1)}s)`);

if (makeGif) {
  const palette = path.join(OUT_DIR, 'palette.png');
  const finalGif = path.join(OUT_DIR, `${config.output.name}.gif`);
  ffmpeg(['-i', finalMp4, '-vf', 'fps=12,scale=800:-1:flags=lanczos,palettegen=stats_mode=diff', palette]);
  ffmpeg(['-i', finalMp4, '-i', palette, '-lavfi', 'fps=12,scale=800:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer', '-loop', '0', finalGif]);
  console.log('Wrote', finalGif);
}
