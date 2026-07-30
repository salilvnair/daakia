#!/usr/bin/env node
/**
 * Records the raw video clips config.json describes: the brand intro (a
 * generated HTML page) plus one clip per segment, each driven by a real
 * Playwright session against the actual running Daakia dev server — real
 * typing, real requests, real UI, not staged screenshots.
 *
 * Requires: `npm run dev:webview` (or `npm run local-server` +
 * `dev:webview`) already running at config.json's appUrl.
 *
 * Usage: node scripts/demo-video/record.js [path/to/config.json]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { recipes } = require('./recipes');
const { buildIntroHtml } = require('./intro-template');

const ROOT = __dirname;
const configPath = path.resolve(process.argv[2] || path.join(ROOT, 'config.json'));
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const OUT_DIR = path.join(ROOT, '.output');
const RAW_DIR = path.join(OUT_DIR, 'raw');
fs.rmSync(RAW_DIR, { recursive: true, force: true });
fs.mkdirSync(RAW_DIR, { recursive: true });

async function recordClip(browser, id, task) {
  const dir = path.join(RAW_DIR, id + '_tmp');
  fs.mkdirSync(dir, { recursive: true });
  const { width, height } = config.output;
  const context = await browser.newContext({
    viewport: { width, height },
    recordVideo: { dir, size: { width, height } },
  });
  const page = await context.newPage();
  await task(page);
  await page.waitForTimeout(400);
  await context.close();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.webm'));
  const dest = path.join(RAW_DIR, id + '.webm');
  fs.renameSync(path.join(dir, files[0]), dest);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('recorded', dest);
  return dest;
}

(async () => {
  const browser = await chromium.launch();

  if (config.intro?.enabled) {
    const introHtmlPath = path.join(OUT_DIR, 'intro.html');
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(introHtmlPath, buildIntroHtml(config.intro));
    await recordClip(browser, 'intro', async (page) => {
      await page.goto('file://' + introHtmlPath);
      await page.waitForTimeout((config.intro.durationSec || 3.2) * 1000);
    });
  }

  for (const seg of config.segments) {
    const recipe = recipes[seg.recipe];
    if (!recipe) throw new Error(`No recipe named "${seg.recipe}" (segment "${seg.id}"). See recipes.js for available names.`);
    await recordClip(browser, seg.id, async (page) => {
      await page.goto(config.appUrl, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      try {
        await recipe(page, seg.options || {});
      } catch (e) {
        console.log(`[${seg.id}] recipe error:`, e.message.split('\n')[0]);
      }
    });
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT_DIR, 'config.snapshot.json'), JSON.stringify(config, null, 2));
  console.log('\nAll clips recorded to', RAW_DIR);
  console.log('Next: node scripts/demo-video/compose.js');
})();
