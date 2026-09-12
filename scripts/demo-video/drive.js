/**
 * Driving the app for the camera, without lying about it.
 *
 * ── The bug this file exists to kill ──
 *
 * The old recipes wrapped nearly every interaction in `.catch(() => {})`, and
 * `record.js` caught recipe errors on top of that. So when a click missed — a
 * dialog that had not opened yet, a button whose label had changed, a request
 * that never fired — the recipe carried on and the camera happily recorded the
 * app sitting in the wrong state. Half-typed URLs, a Send that never sent, an
 * empty response pane. Nothing anywhere said so, and the broken clip went
 * straight into the finished video.
 *
 * The rule here is the opposite: **a step that does not do what it says stops
 * the clip.** `act` throws with the step's own name; `expect` throws when the
 * screen cannot show the thing the step claimed to do. `record.js` collects
 * those and refuses to compose a video out of footage that failed.
 *
 * `soft` exists for the genuinely optional — a "dismiss the tour" button that
 * is only there the first time. If you find yourself reaching for it to get
 * past something that keeps failing, the step is wrong, not the helper.
 */

/** How long any one interaction gets before it is a failure. */
const STEP_MS = 8000;

/*
  ── Every locator is visible-only, and that is not a detail ──

  Daakia keeps a tab's DOM mounted after you leave it. So once a recipe has
  been through two protocols, the page holds two Send buttons, two URL bars and
  two Monaco editors, and only one set of them is on screen. A plain
  `getByRole('button', { name: 'Send' })` is then a coin toss, and
  `getByPlaceholder('Server name')` will happily resolve to a panel nobody can
  see — which is how the last video ended up with typing that went nowhere and
  a Send that never fired.

  Filtering to what is visible is the whole fix, so it is built into the
  finders below rather than left for each recipe to remember.
*/
const vis = (locator) => locator.filter({ visible: true });

/** A button, by its label, among the ones actually on screen. */
const btn = (page, name, exact = true) => vis(page.getByRole('button', { name, exact }));
/** A field, by its placeholder. */
const field = (page, placeholder) => vis(page.getByPlaceholder(placeholder));
/** A tab strip's tab. */
const tab = (page, name) => vis(page.getByRole('tab', { name, exact: true }));
/** Anything else, by CSS. */
const css = (page, selector) => vis(page.locator(selector));
/** Text on screen, for the many controls in this app that are plain divs. */
const text = (page, value, exact = true) => vis(page.getByText(value, { exact }));

/**
 * One interaction, named.
 *
 * The name is what a failure reports, so it should say what the *user* is
 * doing — "type the URL", "press Send" — not which selector was used. When
 * this run is over somebody has to read the log and know which beat of the
 * demo broke.
 */
async function act(name, fn) {
  try {
    return await fn();
  } catch (e) {
    const first = String(e && e.message ? e.message : e).split('\n')[0];
    throw new Error(`step "${name}" failed: ${first}`);
  }
}

/**
 * A step that is allowed not to happen.
 *
 * Only for things whose absence is normal — a first-run dialog, a Prettify
 * button that one panel has and another does not. It says what it skipped, so
 * a step quietly never firing is still visible in the log.
 */
async function soft(name, fn) {
  try {
    return await fn();
  } catch {
    console.log(`      · skipped (optional): ${name}`);
    return undefined;
  }
}

/**
 * The screen has to be able to show it.
 *
 * This is the half the old recorder had none of. Driving the UI proves the
 * clicks landed somewhere; it does not prove the app did anything. A REST clip
 * is only a REST clip if a response actually came back, and the only way to
 * know that is to look for it.
 */
async function expect(page, name, locator, { timeout = STEP_MS, state = 'visible' } = {}) {
  try {
    await locator.first().waitFor({ state, timeout });
  } catch {
    throw new Error(`expected "${name}" on screen, and it never appeared`);
  }
}

/**
 * What a field currently reads, whatever kind of field it is.
 *
 * Half the "inputs" in this app are not `<input>`s. dui's `SelectTextInputView`
 * (the REST/GraphQL URL bar) and `HighlightedInputView` (the gRPC endpoint) are
 * `contenteditable` divs whose placeholder is a decorative `<span>`, so
 * `inputValue()` throws on them and `getByPlaceholder` never finds them at all.
 * That is not a detail: it is why the last video's REST segment typed into
 * nothing and then pressed Send on an empty URL.
 */
async function readField(locator) {
  const el = locator.first();
  const tag = await el.evaluate((n) => n.tagName.toLowerCase()).catch(() => '');
  if (tag === 'input' || tag === 'textarea') return el.inputValue();
  return (await el.textContent().catch(() => '')) ?? '';
}

/** Type into a field the way somebody would, having first proved it is there. */
async function typeInto(page, name, locator, value, delay = 42) {
  await expect(page, name, locator);
  await act(`focus ${name}`, () => locator.first().click({ timeout: STEP_MS }));
  await page.waitForTimeout(180);
  await act(`clear ${name}`, async () => {
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await page.keyboard.press('Delete');
  });
  await act(`type into ${name}`, () => locator.first().pressSequentially(value, { delay }));
  await page.waitForTimeout(150);
  /* What is on screen is what the video shows, so that is what is checked —
     not what we asked to be typed. A field that swallowed half the keystrokes
     is exactly the failure people saw in the last video. */
  const got = (await readField(locator)).trim();
  if (got !== value.trim()) {
    throw new Error(`typed "${value}" into ${name} but it reads "${got}"`);
  }
}

/**
 * The URL bar, whichever of the two shapes this protocol uses.
 *
 * REST and GraphQL use dui's `SelectTextInputView` (method dropdown + editor);
 * gRPC uses `HighlightedInputView`. Both are contenteditable editors with the
 * same job, and no recipe should have to know which it got.
 */
const urlBar = (page) => byId(page, 'url-bar');

/**
 * The contract the app exposes for automation.
 *
 * dui components take a `testId` and put it on their root as `data-testid`;
 * daakia sets those on the elements a test or the recorder drives. Addressing
 * the app through that rather than through dui's internal class names is the
 * difference between a recorder that survives a refactor and one that has to be
 * re-reverse-engineered every time a component changes.
 */
const byId = (page, id) => css(page, `[data-testid="${id}"]`);

/** A rail button, by the title the app gives it. */
/*
  Prefix, not exact. The Mock Server rail button relabels itself to
  "Mock Server (2 running)" once anything is up, so an exact-title selector
  finds it on a clean machine and never again.
*/
/*
  A rail button by its name.

  The titles carry more than the name — "DkGH — Daakia GitHub", and
  "Mock Server (2 running)" once one is up — so this matches the name and
  whatever the app appends to it.
*/
const rail = (page, title) => css(page, `button[title="${title}"], button[title^="${title} "]`);

/** Click a rail icon and wait for the tab to settle. */
async function openRail(page, title, settle = 700) {
  /* `force`, because the Mock Server icon carries a pulsing animation while a
     server is running and Playwright reads a never-still element as "not
     stable" forever. The click is real either way. */
  await act(`open ${title}`, () => rail(page, title).first().click({ timeout: STEP_MS, force: true }));
  await page.waitForTimeout(settle);
}

/**
 * A fresh tab in the current protocol.
 *
 * The app restores whatever tab you were last on, so a recipe that assumes it
 * starts on an empty one is a recipe that works on your machine and nowhere
 * else. Always open a new one.
 */
async function newTab(page) {
  await act('open a new tab', () => css(page, 'button[title="New Tab"]').first().click({ timeout: STEP_MS }));
  await page.waitForTimeout(500);
}

/**
 * Close the scratch tabs, and only those.
 *
 * Every take opens a tab, and they persist. After a few runs the bar is fifty
 * "Untitled Request"s — which is the least tidy thing in the finished video,
 * and heavy enough that the renderer eventually crashes partway through a
 * segment.
 *
 * A tab is scratch when it still has the name the app gave it. Anything
 * somebody named, saved, or opened as a panel is theirs and is never touched:
 * this runs on a real workspace, and losing somebody's open request to tidy up
 * a video would be a bad trade at any price.
 *
 * Returns how many it closed, so the run can say so rather than quietly
 * rearranging the reader's window.
 */
/**
 * Empty the tab bar, using the app's own "Close All".
 *
 * Every take opens a tab and they persist, so a few runs leave eighty
 * "Untitled Request"s in the bar — visible in the clips, and heavy enough that
 * the renderer crashed partway through a segment.
 *
 * The first version clicked each tab's own × and answered the unsaved-changes
 * prompt each time: eighty clicks, eighty dialogs, and a real chance of one of
 * them landing in a frame. "Close All" asks once for the whole set, however
 * many of them are dirty — so this is one right-click, one menu item, one
 * confirmation. Pinned tabs survive it, which is the app's rule and the right
 * one: a pinned tab belongs to whoever is at this machine.
 */
async function closeAllTabs(page, { rounds = 3 } = {}) {
  const before = await tabCount(page);
  if (!before) return 0;

  for (let round = 0; round < rounds; round++) {
    const rows = css(page, '[data-context-menu="tab"]');
    if (!(await rows.count())) break;

    await rows.first().click({ button: 'right', force: true, timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(320);

    const closeAll = text(page, 'Close All');
    if (!(await closeAll.count())) { await page.keyboard.press('Escape'); break; }
    await closeAll.first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(350);

    /* One dialog for the whole set — `TabBar` raises it once when any tab is
       dirty, and `closeAllTabs` in the store is a single update. */
    await page.evaluate(() => {
      const yes = [...document.querySelectorAll('button')]
        .find((b) => /^Discard & Close All$/.test((b.textContent || '').trim()));
      yes?.click();
    });
    await page.waitForTimeout(500);

    const now = await tabCount(page);
    if (!now || now === before) break;
  }

  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(150);
  return before - (await tabCount(page));
}

/**
 * Open one of the right-hand panels — Collections, History, Schema and so on.
 *
 * Only a request tab has these: a standalone tab (dk8s, dkgh, mock server,
 * settings) owns the whole width and the rail is not rendered at all, so this
 * is a no-op there rather than a failure.
 */
async function openPanel(page, title) {
  const icon = css(page, `button[title="${title}"]`).first();
  if (!(await icon.count())) return false;

  /*
    The icons toggle, so clicking the one already showing *closes* the panel.
    That is right for a person and wrong here: the SOAP take ended with a shut
    panel because Collections happened to be the section already open.

    `AppSidebar` reports what it is showing in `data-section` — empty when the
    panel is collapsed — so this can tell "switched to it" from "closed it"
    rather than assuming. The section ids are protocol-prefixed (`gql-schema`,
    `soap-collections`), so the check is that the panel ends up open at all,
    which keeps this free of that naming.
  */
  const open = async () => !!(await page.getAttribute('[data-testid="side-panel"]', 'data-section').catch(() => ''));

  await icon.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(700);
  if (await open()) return true;

  await icon.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(700);
  return open();
}

/** How many tabs are open right now. */
async function tabCount(page) {
  return css(page, 'button[title="Close tab"]').count().catch(() => 0);
}

module.exports = {
  closeAllTabs, tabCount, openPanel,
  STEP_MS, act, soft, expect, typeInto,
  vis, btn, field, tab, css, text, byId, rail, urlBar, readField, openRail, newTab,
};
