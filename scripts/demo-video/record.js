#!/usr/bin/env node
/**
 * Records one clip per segment, driving the real running app.
 *
 * ── What changed, and why ──
 *
 * This used to catch every recipe error and carry on:
 *
 *     try { await recipe(page, seg.options) } catch (e) { console.log(...) }
 *
 * so a segment whose typing went into a hidden panel, or whose Send never
 * fired, still produced a clip — of the app sitting in the wrong state — and
 * `compose.js` stitched it into the finished video with no idea anything was
 * wrong. That is how the last showcase ended up with half-typed URLs and empty
 * response panes.
 *
 * Now: every recipe runs its own `verify` against the screen before the clip is
 * kept, a failed segment's clip is thrown away, and the run exits non-zero with
 * a list of what broke. `compose.js` will not stitch a video that is missing
 * clips, so a bad take cannot reach the output by accident.
 *
 * Flags:
 *   --url URL       the app to record (default: config.json's appUrl)
 *   --only a,b      record just these segment ids
 *   --keep-going    record the rest after a failure instead of stopping
 *   --retries N     attempts per segment before giving up (default 2)
 *
 * Requires the app running at config.json's appUrl — `npm run dev` in
 * webview-ui, and `npm run local-server:dev` for anything host-backed
 * (dk8s, dkgh, mock servers).
 *
 * Usage: node scripts/demo-video/record.js [path/to/config.json]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { recipes } = require('./recipes');
const { closeAllTabs, tabCount } = require('./drive');
const { buildIntroHtml } = require('./intro-template');

const ROOT = __dirname;
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(name);
  return at >= 0 ? (argv[at + 1] ?? true) : fallback;
};
const only = String(flag('--only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const keepGoing = argv.includes('--keep-going');
const retries = Number(flag('--retries', 2));

const configPath = path.resolve(argv.find((a) => a.endsWith('.json')) || path.join(ROOT, 'config.json'));
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
/* `--url` beats the config, for the common case of the dev server being on a
   different port than the day this file was written. */
const urlOverride = flag('--url', '');
if (urlOverride && urlOverride !== true) config.appUrl = String(urlOverride);

const OUT_DIR = path.join(ROOT, '.output');
const RAW_DIR = path.join(OUT_DIR, 'raw');
const SHOT_DIR = path.join(OUT_DIR, 'failed');
/*
  A full run starts from nothing; `--only` reshoots one segment and leaves the
  rest of the take alone.

  Wiping unconditionally made reshooting a single segment destroy the twenty-one
  clips beside it, so the only way to fix one bad segment was to record them all
  again. The snapshot below is merged for the same reason: it has to keep saying
  where the untouched clips were trimmed.
*/
if (!only.length) fs.rmSync(RAW_DIR, { recursive: true, force: true });
fs.rmSync(SHOT_DIR, { recursive: true, force: true });
fs.mkdirSync(RAW_DIR, { recursive: true });

/** What the previous run verified, so an `--only` reshoot can keep it. */
function previousSnapshot() {
  try {
    return JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'config.snapshot.json'), 'utf8'));
  } catch { return null; }
}

/** Is the app actually up? A refused connection is worth saying once, clearly. */
async function reachable(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return res.ok || res.status < 500;
  } catch { return false; }
}

/**
 * Record one take.
 *
 * The video file is kept only if the take succeeded. Playwright writes it on
 * `context.close()`, so a failed take is recorded and then deleted — which
 * costs a few seconds and keeps the "no bad footage survives" rule absolute.
 */
/**
 * Chromium, with room to work.
 *
 * A browser per take rather than one for the whole run. Twenty-two video
 * recordings in one process exhausts the renderer eventually and it crashes —
 * at a different segment each time, which is the tell that it is resource
 * pressure rather than a bad step. A launch costs a fraction of a second
 * against a take that runs for ten.
 */
function launch() {
  return chromium.launch({
    args: [
      '--disable-dev-shm-usage',
      '--js-flags=--max-old-space-size=4096',
    ],
  });
}

async function take(browser, id, drive) {
  const dir = path.join(RAW_DIR, `${id}_tmp`);
  fs.mkdirSync(dir, { recursive: true });
  const { width, height } = config.output;
  const context = await browser.newContext({
    viewport: { width, height },
    recordVideo: { dir, size: { width, height } },
  });
  /*
    Tell dui that something other than a person is typing.

    Editor options are construction options: every re-render hands Monaco the
    same object again, so turning bracket and tag auto-closing off from outside
    lasted exactly until the next keystroke put it back. The typing then landed
    a closing brace on top of one Monaco had already inserted. Setting this
    before the app loads is the only place the answer holds for the whole take.
  */
  await context.addInitScript(() => { window.__DUI_NO_AUTOCLOSE__ = true; });

  const page = await context.newPage();
  /*
    Playwright starts filming when the page is created, so the clip opens on a
    blank frame, the app booting, and the warmup — eighteen seconds of nothing
    in a segment whose interesting part is ten. The driver marks the window
    that is worth keeping and compose.js cuts to it; without this every clip
    has the same long dead head and the finished video runs three times its
    useful length.
  */
  const t0 = Date.now();
  const marks = {};
  const mark = {
    begin: () => { marks.begin = (Date.now() - t0) / 1000; },
    end: () => { marks.end = (Date.now() - t0) / 1000; },
  };

  let failure;
  try {
    await drive(page, mark);
  } catch (e) {
    failure = e;
    /* A picture of the moment it went wrong, which is worth far more than the
       message when the message is "element not found". */
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOT_DIR, `${id}.png`) }).catch(() => {});
  }

  await page.waitForTimeout(400);
  await context.close();

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.webm'));
  if (failure || !files.length) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw failure || new Error('Playwright wrote no video for this take');
  }
  const dest = path.join(RAW_DIR, `${id}.webm`);
  fs.renameSync(path.join(dir, files[0]), dest);
  fs.rmSync(dir, { recursive: true, force: true });
  return { dest, marks };
}

/**
 * Turn the marked window into the trim the composer wants.
 *
 * A little lead-in so the first click is not the first frame, and a little
 * hold at the end so the result is on screen long enough to read. A take that
 * never marked anything keeps the old behaviour rather than guessing.
 */
const LEAD_IN_SEC = 0.6;
const HOLD_SEC = 1.4;

function trimFromMarks(marks, fallbackStart) {
  if (typeof marks.begin !== 'number') return { trimStartSec: fallbackStart };
  const trimStartSec = Math.max(0, marks.begin - LEAD_IN_SEC);
  if (typeof marks.end !== 'number') return { trimStartSec };
  return { trimStartSec, endAtSec: marks.end + HOLD_SEC };
}

(async () => {
  if (!(await reachable(config.appUrl))) {
    console.error(`\nThe app is not answering at ${config.appUrl}.`);
    console.error('Start it first:');
    console.error('  cd webview-ui && npm run dev -- --port ' + (new URL(config.appUrl).port || '5173'));
    console.error('  npm run local-server:dev      (needed for dk8s, dkgh and mock servers)\n');
    process.exit(1);
  }

  const failed = [];
  const made = [];
  /* id -> the trim its marks earned, written into the snapshot below. */
  const kept = {};
  if (config.intro?.enabled && !only.length) {
    const introHtmlPath = path.join(OUT_DIR, 'intro.html');
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(introHtmlPath, buildIntroHtml(config.intro));
    const browser = await launch();
    await take(browser, 'intro', async (page, mark) => {
      await page.goto('file://' + introHtmlPath);
      mark.begin();
      await page.waitForTimeout((config.intro.durationSec || 3.2) * 1000);
    });
    await browser.close();
    made.push('intro');
    console.log('✓ intro');
  }

  const segments = config.segments.filter((s) => !only.length || only.includes(s.id));

  for (const seg of segments) {
    const recipe = recipes[seg.recipe];
    if (!recipe) throw new Error(`No recipe named "${seg.recipe}" (segment "${seg.id}"). See recipes.js.`);

    let ok = false;
    let last;
    let trim;
    for (let attempt = 1; attempt <= retries && !ok; attempt++) {
      /* Its own browser, closed below whatever happens — a crashed renderer
         must not take the rest of the run with it. */
      const browser = await launch();
      try {
        const { marks } = await take(browser, seg.id, async (page, mark) => {
          await page.goto(config.appUrl, { waitUntil: 'networkidle' });
          await page.waitForTimeout(seg.warmupMs ?? 1500);
          /*
            An empty bar to start from, and never a frame of getting there.

            This runs before the mark, so the right-click, the menu and the
            unsaved-changes prompt all happen outside the window compose keeps.
            It used to run at the *end* of the take instead, where the hold
            after the mark reached straight into it — which is how a confirm
            dialog ended up flickering at the close of the recorded segment.
          */
          await closeAllTabs(page);
          await page.waitForTimeout(400);
          mark.begin();
          await recipe.run(page, seg.options || {});
          /* The half the old recorder had none of: does the screen agree that
             the thing happened? */
          if (recipe.verify) await recipe.verify(page, seg.options || {});
          mark.end();
          /* Still frames for the hold compose keeps after the mark. Nothing
             else may touch the screen from here to the end of the take. */
          await page.waitForTimeout(HOLD_SEC * 1000 + 400);
        });
        trim = trimFromMarks(marks, seg.trimStartSec ?? 1.5);
        ok = true;
      } catch (e) {
        last = e;
        const why = String(e.message).split('\n')[0];
        console.log(`  ${attempt < retries ? '…retrying' : '✗'} ${seg.id}: ${why}`);
      }
    }

    if (ok) {
      made.push(seg.id);
      kept[seg.id] = trim;
      console.log(`✓ ${seg.id} (${trim.endAtSec ? (trim.endAtSec - trim.trimStartSec).toFixed(1) + 's usable' : 'untrimmed'})`);
    } else {
      failed.push({ id: seg.id, why: String(last && last.message) });
      if (!keepGoing) break;
    }
  }

  /*
    Everything this run verified, plus everything an earlier run verified whose
    clip is still on disk. A reshoot of one segment must not drop the other
    twenty-one out of the composition.
  */
  const previous = previousSnapshot();
  const carried = new Map();
  for (const seg of previous?.segments || []) {
    if (!made.includes(seg.id) && fs.existsSync(path.join(RAW_DIR, seg.id + '.webm'))) {
      carried.set(seg.id, seg);
    }
  }
  fs.writeFileSync(path.join(OUT_DIR, 'config.snapshot.json'),
    JSON.stringify({
      ...config,
      segments: config.segments
        .filter((s) => made.includes(s.id) || carried.has(s.id))
        .map((s) => (made.includes(s.id) ? { ...s, ...(kept[s.id] || {}) } : carried.get(s.id))),
    }, null, 2));

  console.log(`\n${made.length} clip${made.length === 1 ? '' : 's'} recorded to ${RAW_DIR}`);

  if (failed.length) {
    console.error(`\n${failed.length} segment${failed.length === 1 ? '' : 's'} failed and produced no clip:\n`);
    for (const f of failed) console.error(`  ${f.id}\n    ${f.why.split('\n').join('\n    ')}\n`);
    if (fs.existsSync(SHOT_DIR)) console.error(`Screenshots of each failure: ${SHOT_DIR}`);
    console.error('\nNothing was composed. Fix the segment, or re-run with --only to retry just it.');
    process.exit(1);
  }

  console.log('Next: node scripts/demo-video/compose.js');
})();
