/**
 * One live action sequence per segment, against the real running app.
 *
 * Every recipe is `{ run, verify }`. `run` drives the UI; `verify` looks at the
 * screen afterwards and says whether the thing actually happened. A clip whose
 * `verify` fails is not a clip — `record.js` refuses to compose it.
 *
 * That split is the point. Driving the UI only proves the clicks landed
 * somewhere; it does not prove the app did anything, and the previous video
 * shipped several clips where it plainly had not. If you add a recipe here and
 * cannot think what its `verify` should look for, the segment does not yet know
 * what it is demonstrating.
 *
 * See `drive.js` for the helpers, and for why every locator is visible-only.
 */
const {
  act, soft, expect, typeInto, btn, field, tab, css, text, byId, rail, urlBar, openRail, newTab,
} = require('./drive');
/* The five protocol recipes live next door — see protocols.js for why. */
const { protocols } = require('./protocols');
/* The assistant and its settings — see ai.js, and ai-mock.js for the provider. */
const { ai } = require('./ai');
/* The cluster console — see dk8s.js. */
const { dk8s } = require('./dk8s');
/* The issue board — see dkgh.js. */
const { dkgh } = require('./dkgh');

// ── Monaco ──────────────────────────────────────────────────────────────────

/*
  Monaco closes brackets, quotes and XML tags for you, and typing the closing
  characters on top of that is what produced the malformed content in the last
  video — `{"a": 1}}`, and a SOAP envelope with every tag doubled.

  Turning it off takes BOTH of these, which is the part that is easy to get
  wrong: the editor option governs the generic behaviour, but JSON and XML
  bring their own `autoClosingPairs` through the *language configuration*, and
  that is what actually inserts the `}` and the `</Currency>`. Setting only the
  editor option looks like it worked until you type a brace.

  Auto-indent stays on — pressing Enter mid-object should land where a real
  developer would see it land, which is why the strings below carry no leading
  indentation of their own.
*/
/*
  The two tab strips REST puts on screen both carry a "Headers", and the
  response one renders a count beside several labels. `data-tab` is the id the
  app gave the tab, which neither problem touches.
*/
/*
  The control that picks the body type.

  It reads "No Body" on a fresh request and the chosen type afterwards, so it
  cannot be found by its text twice in a row — and asking for "the last dui
  select on screen" found the *method* dropdown instead, so the recipe opened
  GET/POST/PUT and then waited six seconds for an "XML" that was never coming.
  `BodyEditor` names it.
*/
const bodyTypeMenu = (page) => byId(page, 'body-type');

const reqTab = (page, id) => css(page, `[data-testid="rest-request-tabs"] [data-tab="${id}"]`).first();
const resTab = (page, id) => css(page, `[data-testid="rest-response-tabs"] [data-tab="${id}"]`).first();

async function calmMonaco(page) {
  await page.evaluate(() => {
    if (!window.monaco) return;
    window.monaco.editor.getEditors().forEach((ed) => ed.updateOptions({
      autoClosingBrackets: 'never',
      autoClosingQuotes: 'never',
      autoClosingOvertype: 'never',
      autoSurround: 'never',
    }));
    for (const lang of ['json', 'xml', 'html', 'graphql', 'plaintext', 'yaml', 'javascript']) {
      try {
        window.monaco.languages.setLanguageConfiguration(lang, {
          autoClosingPairs: [], surroundingPairs: [], brackets: [],
        });
      } catch { /* that language is not registered in this build */ }
    }
  });
}

/** Which editor is on screen — there can be several mounted at once. */
const editor = (page) => css(page, '.monaco-editor');

async function typeCode(page, what, code, { delay = 30, json = true } = {}) {
  await expect(page, `the ${what} editor`, editor(page));
  await act(`focus the ${what} editor`, () => editor(page).first().click({ timeout: 6000 }));
  await page.waitForTimeout(200);
  /* After the click, not before: choosing a body type remounts the editor, and
     options set on the instance that has gone do nothing at all. */
  await calmMonaco(page);
  await page.waitForTimeout(120);
  await act('clear it', async () => {
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await page.keyboard.press('Delete');
  });
  await page.waitForTimeout(120);
  await act(`type the ${what}`, () => page.keyboard.type(code, { delay }));
  await page.waitForTimeout(250);

  /*
    What ended up on screen, compared with what we meant.

    Not a string comparison: auto-indent legitimately adds whitespace the input
    string does not have, and that is worth keeping — it is what makes the
    typing look real. JSON is compared as JSON; anything else is compared with
    whitespace collapsed. A mismatch is a hard failure rather than a silent
    correction, because a silent correction is how the last video ended up
    showing text nobody typed.
  */
  const seen = await page.evaluate(() => window.monaco?.editor.getEditors()
    .map((e) => e.getValue()).find((v) => v && v.trim().length));
  if (seen === undefined) throw new Error('the editor never received the text');

  const same = json
    ? (() => { try { return JSON.stringify(JSON.parse(seen)) === JSON.stringify(JSON.parse(code)); } catch { return false; } })()
    : seen.replace(/\s+/g, ' ').trim() === code.replace(/\s+/g, ' ').trim();

  if (!same) {
    throw new Error(`the editor shows something other than what was typed:\n--- typed ---\n${code}\n--- on screen ---\n${seen}`);
  }
}

// ── Shared beats ────────────────────────────────────────────────────────────

/** A REST request, sent for real, with the response proved to have arrived. */
async function sendRest(page, url, { typeDelay = 40 } = {}) {
  await openRail(page, 'REST');
  await newTab(page);
  await typeInto(page, 'the URL bar', urlBar(page), url, typeDelay);
  await page.waitForTimeout(400);
  await act('press Send', () => btn(page, 'Send').first().click({ timeout: 8000 }));
  /* The status pill is the proof. Without this the clip is "somebody typed a
     URL", which is what the old REST segment actually was whenever the request
     failed. */
  await expect(page, 'a response status', css(page, '[class*="status"]:has-text("200"), :text("200 OK")'), { timeout: 15000 });
  await page.waitForTimeout(900);
}

const recipes = {
  // ── Protocols ─────────────────────────────────────────────────────────────

  /**
   * The flagship segment: one request, end to end.
   *
   * It types a body minified on purpose so that formatting has visible work to
   * do, then shows both ways to ask for it — the editor's own right-click menu
   * and the toolbar button beside it — before sending and walking the two tab
   * strips the response arrives in.
   *
   * Tabs are addressed by `data-tab`, not by their label: the response strip
   * renders counts beside "Headers" and "Cookies", so the accessible name is
   * "Headers 12" on one run and "Headers 9" on the next.
   */
  restRequest: {
    async run(page, o = {}) {
      const url = o.url || 'https://jsonplaceholder.typicode.com/posts';
      /* One line, no spaces — the "before" that makes Format Document read as
         something happening rather than as a no-op. */
      const minified = o.json
        || '{"title":"Daakia","body":"Every protocol in one window","userId":1,"tags":["rest","grpc","graphql"]}';
      const delay = o.typeDelay || 30;

      await openRail(page, 'REST');
      await newTab(page);

      /*
        The method first, and through its own control.

        Clicking the URL bar opens the suggestion list — history and mock
        routes — and an earlier version of this recipe then clicked the first
        thing reading "POST", which was a saved request. The URL bar ended up
        holding somebody else's localhost URL and the segment recorded a
        connection refused. The method sits in a dui select with its own
        trigger; nothing else on screen is one.
      */
      await act('open the method menu', () => css(page, '.dui_select-text__trigger').first().click({ timeout: 6000 }));
      await page.waitForTimeout(400);
      await act('choose POST', () => css(page, '.dui_select-text__option:has-text("POST")').first().click({ timeout: 6000 }));
      await page.waitForTimeout(500);

      await typeInto(page, 'the URL bar', urlBar(page), url, delay);
      /* Dismiss the suggestion list, so the next click lands on the tab strip
         and not on whatever the list is covering. */
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);

      await act('open the Body tab', () => reqTab(page, 'body').click({ timeout: 8000 }));
      await page.waitForTimeout(400);
      await act('open the body-type menu', () => text(page, 'No Body').first().click({ timeout: 8000 }));
      await page.waitForTimeout(300);
      await act('choose JSON', () => text(page, 'JSON').first().click({ timeout: 8000 }));
      await page.waitForTimeout(500);
      await typeCode(page, 'request body', minified, { delay });
      await page.waitForTimeout(700);

      /* One: the editor's own context menu, shortcut and all. */
      await act('right-click the body', () => editor(page).first().click({ button: 'right', timeout: 6000 }));
      await page.waitForTimeout(600);
      await act('choose Format Document', () => text(page, 'Format Document').first().click({ timeout: 6000 }));
      await page.waitForTimeout(1200);

      /* Two: the same thing from the toolbar. Undo puts the one-liner back so
         the button has the same work to do — Monaco formats as a single edit,
         so one undo is exactly the format and not the typing. */
      await act('undo the formatting', async () => {
        await editor(page).first().click({ timeout: 6000 });
        await page.keyboard.press('Control+Z');
      });
      await page.waitForTimeout(800);
      await act('press Prettify', () => css(page, 'button[title="Prettify"], button[title="Prettify JSON"]').first().click({ timeout: 6000 }));
      await page.waitForTimeout(1100);

      await act('press Send', () => btn(page, 'Send').first().click({ timeout: 8000 }));
      await expect(page, 'a response status', css(page, '[class*="status"]:has-text("201"), [class*="status"]:has-text("200"), :text("201 Created")'), { timeout: 20000 });
      await page.waitForTimeout(1100);

      /* The response, tab by tab, and back to the body it opened on. */
      for (const [id, label] of [['headers', 'Headers'], ['timeline', 'Timeline'], ['raw', 'Raw'], ['json', 'JSON']]) {
        await soft(`the response ${label} tab`, async () => {
          await resTab(page, id).click({ timeout: 4000 });
          await page.waitForTimeout(1100);
        });
      }

      /* Then the request's own, ending on the two the segment is here for. */
      for (const [id, label] of [['params', 'Params'], ['headers', 'Headers'], ['docs', 'Docs'], ['settings', 'Settings']]) {
        await soft(`the request ${label} tab`, async () => {
          await reqTab(page, id).click({ timeout: 4000 });
          await page.waitForTimeout(1400);
        });
      }
      await page.waitForTimeout(o.settleMs ?? 900);
    },

    async verify(page) {
      /*
        Three things, because this segment claims three.

        The formatted body proves both Format paths ran — a one-line body means
        the right-click did nothing and Prettify did nothing either. The status
        proves the request left the machine. The Settings panel proves the last
        tab click landed somewhere real rather than on a tab that exists but
        renders nothing.
      */
      const body = await page.evaluate(() => window.monaco?.editor.getEditors()
        .map((e) => e.getValue()).find((v) => v && v.includes('Daakia')));
      if (!body) throw new Error('the body editor does not hold the typed JSON');
      if (!body.includes('\n')) throw new Error(`the body was never formatted — it is still one line:\n${body}`);

      /* The same selector `run` waited on. An earlier version looked only for
         an element whose class contains "status"; the pill's class does not,
         so `run` passed on the text match and `verify` then failed on a screen
         that was entirely correct. */
      await expect(page, 'a response status', css(page, ':text("201 Created"), :text("200 OK")'), { timeout: 8000 });
      /* Something the Settings tab shows without scrolling. */
      await expect(page, 'the request Settings panel', text(page, 'Follow Redirects', false), { timeout: 6000 });
    },
  },

  /**
   * The body is not only JSON.
   *
   * REST already shows a JSON body being typed and formatted, so this one is
   * about the menu beside it: the same request carrying XML, then YAML, then a
   * form — each with the editor or the table the app swaps in for it.
   */
  bodyTypes: {
    async run(page, o = {}) {
      const delay = o.typeDelay || 26;
      await openRail(page, 'REST');
      await newTab(page);

      await act('open the method menu', () => css(page, '.dui_select-text__trigger').first().click({ timeout: 6000 }));
      await page.waitForTimeout(350);
      await act('choose POST', () => css(page, '.dui_select-text__option:has-text("POST")').first().click({ timeout: 6000 }));
      await page.waitForTimeout(400);

      await typeInto(page, 'the URL bar', urlBar(page), o.url || 'https://httpbin.org/post', delay);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(350);

      await act('open the Body tab', () => reqTab(page, 'body').click({ timeout: 8000 }));
      await page.waitForTimeout(500);

      /* Held open a beat: the whole point of the segment is the list. */
      await act('open the body-type menu', () => bodyTypeMenu(page).click({ timeout: 8000 }));
      await page.waitForTimeout(1500);
      await act('choose XML', () => text(page, 'XML').first().click({ timeout: 6000 }));
      await page.waitForTimeout(600);
      await typeCode(page, 'XML body', o.xml
        || '<order>\n<item sku=\'DK-1\'>Daakia</item>\n<qty>2</qty>\n</order>',
        { delay, json: false });
      await page.waitForTimeout(1300);

      await act('back to the body-type menu', () => bodyTypeMenu(page).click({ timeout: 8000 }));
      await page.waitForTimeout(700);
      await act('choose YAML', () => text(page, 'YAML').first().click({ timeout: 6000 }));
      await page.waitForTimeout(600);
      await typeCode(page, 'YAML body', o.yaml
        || 'order:\nsku: DK-1\nqty: 2',
        { delay, json: false });
      await page.waitForTimeout(1300);

      /* The two that are a table rather than an editor. */
      await act('back to the body-type menu', () => bodyTypeMenu(page).click({ timeout: 8000 }));
      await page.waitForTimeout(700);
      await act('choose Form URL Encoded', () => text(page, 'Form URL Encoded').first().click({ timeout: 6000 }));
      await page.waitForTimeout(1400);

      await soft('type a form field', async () => {
        const cell = css(page, 'input[placeholder="Key"], input[placeholder="key"]').first();
        await cell.click({ timeout: 4000 });
        await page.keyboard.type('sku', { delay });
        await page.keyboard.press('Tab');
        await page.keyboard.type('DK-1', { delay });
        await page.waitForTimeout(900);
      });

      await act('back to the body-type menu', () => bodyTypeMenu(page).click({ timeout: 8000 }));
      await page.waitForTimeout(700);
      await act('choose Multipart Form', () => text(page, 'Multipart Form').first().click({ timeout: 6000 }));
      await page.waitForTimeout(o.settleMs ?? 1600);
    },

    async verify(page) {
      /* The trigger names whichever type the request is carrying now — the one
         thing that is true at the end however the middle went. */
      await expect(page, 'the Multipart Form body type', text(page, 'Multipart Form', false), { timeout: 6000 });
    },
  },

  ...protocols,

  ...ai,

  // ── Mock server, end to end ───────────────────────────────────────────────

  mockServerRun: {
    async run(page, o = {}) {
      const name = o.name || 'Orders API (demo)';
      await openRail(page, 'Mock Server', 900);
      await soft('start a new mock server', () => css(page, 'button[title="New mock server"]').first().click({ timeout: 4000 }));
      await page.waitForTimeout(500);
      const nameBox = field(page, 'Mock server name');
      if (await nameBox.count()) {
        await typeInto(page, 'the server name', nameBox, name, o.typeDelay || 40);
        await act('create it', () => btn(page, 'Create').first().click({ timeout: 8000 }));
        await page.waitForTimeout(900);
      }
      await act('start the server', () => btn(page, 'Start', false).first().click({ timeout: 8000 }));
      /* The proof it really started: the button becomes Stop, and the app says
         which port it took. */
      await expect(page, 'a running server', btn(page, 'Stop', false), { timeout: 15000 });
      await page.waitForTimeout(o.settleMs ?? 2200);
    },
    async verify(page) {
      await expect(page, 'the Stop button of a running server', btn(page, 'Stop', false), { timeout: 6000 });
    },
  },

  // ── dk8s ──────────────────────────────────────────────────────────────────

  ...dk8s,

  // ── dkgh ──────────────────────────────────────────────────────────────────

  ...dkgh,

  // ── The rest of the app ───────────────────────────────────────────────────

  collections: {
    async run(page, o = {}) {
      await openRail(page, 'REST');
      await openRail(page, 'Collections', 1400);
      await expect(page, 'the collections tree', text(page, 'Collections', false), { timeout: 10000 });
      /* Opening a folder shows what a collection actually holds, which is a
         better thirty frames than a naming dialog. Creating one meant driving a
         Save that lives in a different panel — three fragile steps for a less
         interesting shot. */
      await soft('expand a folder', () => css(page, 'button[title="Expand this folder and everything in it"]').first().click({ timeout: 4000 }));
      await page.waitForTimeout(o.settleMs ?? 2000);
    },
    async verify(page) {
      await expect(page, 'the collections panel', text(page, 'Collections', false), { timeout: 8000 });
    },
  },

  historyShow: {
    async run(page, o = {}) {
      await sendRest(page, o.url || 'https://jsonplaceholder.typicode.com/todos/1');
      await openRail(page, 'History', 1200);
      await page.waitForTimeout(o.settleMs ?? 1400);
    },
    async verify(page) {
      await expect(page, 'a history entry', text(page, 'todos', false), { timeout: 8000 });
    },
  },

  environments: {
    async run(page, o = {}) {
      await openRail(page, 'REST');
      await openRail(page, 'Environments', 1400);
      await expect(page, 'the environments list', text(page, 'Environments', false), { timeout: 10000 });
      await page.waitForTimeout(o.settleMs ?? 1800);
    },
    async verify(page) {
      await expect(page, 'the environments panel', text(page, 'Environments', false), { timeout: 8000 });
    },
  },

  devTools: {
    async run(page, o = {}) {
      await sendRest(page, o.url || 'https://jsonplaceholder.typicode.com/users/1');
      await openRail(page, 'DevTools (Console / Timeline)', 900);
      await soft('open the Network tab', () => btn(page, 'Network').first().click({ timeout: 4000 }));
      await page.waitForTimeout(o.settleMs ?? 1800);
    },
    async verify(page) {
      await expect(page, 'the DevTools panel', text(page, 'Network', false), { timeout: 8000 });
    },
  },

  // ── Settings ──────────────────────────────────────────────────────────────

  settings: {
    async run(page, o = {}) {
      const section = o.section;
      await openRail(page, 'Settings', 1100);
      if (section) {
        await act(`open ${section}`, () => text(page, section).last().click({ timeout: 8000 }));
        await page.waitForTimeout(1100);
      }
      await page.waitForTimeout(o.settleMs ?? 1200);
    },
    async verify(page, o = {}) {
      if (o.expect) await expect(page, o.expect, text(page, o.expect, false), { timeout: 8000 });
    },
  },
};

module.exports = { recipes, typeCode, sendRest };
