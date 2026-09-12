/**
 * GIFs, from clips that already exist.
 *
 *   node scripts/demo-video/gif.js              # the whole showcase
 *   node scripts/demo-video/gif.js --highlights # a short loop
 *   node scripts/demo-video/gif.js --width 640 --fps 10
 *
 * `compose.js --gif` can do the full one too, but only as part of recomposing
 * every clip — twenty minutes to change a frame rate. This reads the finished
 * mp4, or the per-segment files in `.output/refined/`, and writes only the GIF.
 *
 * ── On size ──
 *
 * GIF has no interframe compression worth the name and a 256-colour palette,
 * so a dark UI with text costs roughly 2.7 MB per twenty seconds at 800px and
 * 12fps. The full seven minutes is therefore ~57 MB, which is fine as a file
 * and far too big for a README (GitHub stops rendering around 10 MB) or a chat
 * message. `--highlights` exists for those: a few seconds from each of the
 * segments that read well without sound or context, in one short loop.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, '.output');
const REFINED_DIR = path.join(OUT_DIR, 'refined');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(name);
  return at === -1 ? fallback : argv[at + 1];
};
const highlights = argv.includes('--highlights');
/* A GIF of named segments — `--pick dk8s_pods,dkgh_board` — for the ones that
   go beside a specific piece of writing rather than at the top of a README. */
const pick = String(flag('--pick', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const seconds = Number(flag('--seconds', 6));
const name = flag('--name', pick.length ? 'daakia_picked' : null);
const width = Number(flag('--width', 800));
const fps = Number(flag('--fps', 12));

const ffmpeg = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: ['ignore', 'ignore', 'inherit'] });
const mb = (f) => (fs.statSync(f).size / 1024 / 1024).toFixed(1);

/**
 * The segments a silent loop can carry, and how many seconds of each.
 *
 * Chosen for what reads at a glance with no narration: something being typed,
 * a status going green, a chart drawing. The settings tours are left out — a
 * page of checkboxes says nothing in four seconds.
 */
const HIGHLIGHTS = [
  /* The title card, so a loop that plays with no context says what it is. */
  ['intro', 5.2],
  /* Then Ctrl+K, which is how somebody reaches everything below it. */
  ['command_palette', 5.0],
  ['rest', 5.5],
  ['graphql', 4.5],
  ['websocket', 4.5],
  ['soap', 4.0],
  ['mcp', 4.0],
  ['ai_chat', 4.5],
  ['dk8s_pods', 4.0],
  ['dk8s_detail', 5.0],
  ['dkgh_board', 4.5],
  ['dkgh_sections', 4.5],
];

/** Two passes: a palette built from the whole clip, then the encode. */
function toGif(source, dest, extraIn = []) {
  const palette = path.join(OUT_DIR, 'palette.png');
  const chain = `fps=${fps},scale=${width}:-1:flags=lanczos`;
  ffmpeg([...extraIn, '-i', source, '-vf', `${chain},palettegen=stats_mode=diff`, palette]);
  ffmpeg([...extraIn, '-i', source, '-i', palette,
    '-lavfi', `${chain}[x];[x][1:v]paletteuse=dither=bayer`, '-loop', '0', dest]);
  fs.unlinkSync(palette);
}

if (highlights || pick.length) {
  /*
    A picked GIF opens on the title card as well — `--no-intro` to skip it.

    Without this the GIFs began mid-request, which reads as a clip that lost
    its first second rather than as the start of anything.
  */
  const picked = pick.map((id) => [id, seconds]);
  const wantsIntro = !argv.includes('--no-intro') && !pick.includes('intro');
  const chosen = pick.length
    ? (wantsIntro ? [['intro', 5.2], ...picked] : picked)
    : HIGHLIGHTS;
  const parts = [];
  const listFile = path.join(OUT_DIR, '_highlights.txt');
  const tmp = [];

  for (const [id, secs] of chosen) {
    const clip = path.join(REFINED_DIR, `${id}.mp4`);
    if (!fs.existsSync(clip)) {
      console.log(`  ${id}: no refined clip, skipped`);
      continue;
    }
    /* From a little way in — the opening second of a segment is usually the
       app settling, and the interesting part is what happens next. */
    const cut = path.join(OUT_DIR, `_hl_${id}.mp4`);
    /*
      The title card is taken from the first keystroke; everything else from
      2s in, which is where the app has stopped settling.

      This used to read the intro backwards from its end, so that the first
      frame — what GitHub shows before the image loads, and what a paused loop
      sits on — was the finished card. It did give a tidy still, and it threw
      away the entire point of the intro: the GIF showed the card already
      written and never a letter being typed.

      Starting at the first keystroke instead means frame one is a single "D"
      rather than a finished card. That is the trade, and it is the right way
      round: a still that is obviously mid-typing says more about the thing
      than a static logo does.
    */
    const args = id === 'intro'
      ? ['-ss', '0.42', '-i', clip, '-t', String(secs)]
      : ['-ss', '2', '-i', clip, '-t', String(secs)];
    ffmpeg([...args, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', cut]);
    tmp.push(cut);
    parts.push(`file '${cut.replace(/\\/g, '/')}'`);
  }
  if (!parts.length) {
    console.error(`Nothing in ${path.relative(process.cwd(), REFINED_DIR)} to make highlights from.`);
    process.exit(1);
  }

  fs.writeFileSync(listFile, parts.join('\n'));
  const joined = path.join(OUT_DIR, '_highlights.mp4');
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', joined]);

  const dest = path.join(OUT_DIR, `${name || config.output.name + '_highlights'}.gif`);
  toGif(joined, dest);

  for (const f of [...tmp, listFile, joined]) fs.unlinkSync(f);
  console.log(`${path.relative(process.cwd(), dest)}  ${mb(dest)} MB  (${width}px, ${fps}fps, ${parts.length} segments)`);
} else {
  const source = path.join(OUT_DIR, `${config.output.name}.mp4`);
  if (!fs.existsSync(source)) {
    console.error(`No ${path.relative(process.cwd(), source)} yet — run compose.js first.`);
    process.exit(1);
  }
  const dest = path.join(OUT_DIR, `${config.output.name}.gif`);
  toGif(source, dest);
  console.log(`${path.relative(process.cwd(), dest)}  ${mb(dest)} MB  (${width}px, ${fps}fps)`);
}
