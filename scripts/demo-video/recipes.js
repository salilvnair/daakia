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
  act, soft, expect, typeInto, btn, field, tab, css, text, urlBar, openRail, newTab,
} = require('./drive');

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

  restRequest: {
    async run(page, o = {}) {
      await sendRest(page, o.url || 'https://jsonplaceholder.typicode.com/users/1');
      await page.waitForTimeout(o.settleMs ?? 1600);
    },
    async verify(page) {
      await expect(page, 'the response body', css(page, '.monaco-editor, pre'), { timeout: 8000 });
    },
  },

  jsonBodyType: {
    async run(page, o = {}) {
      const url = o.url || 'https://jsonplaceholder.typicode.com/posts';
      const json = o.json || '{\n"title": "Daakia is fast",\n"body": "Live JSON typing, recorded in one take",\n"userId": 1\n}';
      await openRail(page, 'REST');
      await newTab(page);
      await typeInto(page, 'the URL bar', urlBar(page), url, 30);
      await act('open the Body tab', () => tab(page, 'Body').first().click({ timeout: 8000 }));
      await page.waitForTimeout(400);
      /* The control reads "No Body" until a type is chosen — not "None", which
         is what the old recipe looked for and never found. */
      await act('open the body-type menu', () => text(page, 'No Body').first().click({ timeout: 8000 }));
      await page.waitForTimeout(300);
      /* The menu says "JSON", not the MIME type the old recipe looked for. */
      await act('choose JSON', () => text(page, 'JSON').first().click({ timeout: 8000 }));
      await page.waitForTimeout(500);
      await typeCode(page, 'request body', json, { delay: o.typeDelay || 32 });
      await soft('prettify', () => css(page, 'button[title="Prettify"], button[title="Prettify JSON"]').first().click({ timeout: 2500 }));
      await page.waitForTimeout(o.settleMs ?? 1200);
    },
    async verify(page) {
      const seen = await page.evaluate(() => window.monaco?.editor.getEditors().map((e) => e.getValue()).find((v) => v && v.trim()));
      if (!seen || !seen.includes('Daakia is fast')) throw new Error('the body editor does not hold the typed JSON');
    },
  },

  graphqlQuery: {
    async run(page, o = {}) {
      const query = o.query || '{\ncountries {\ncode\nname\nemoji\n}\n}';
      await openRail(page, 'GraphQL');
      await newTab(page);
      await typeInto(page, 'the endpoint', urlBar(page), o.url || 'https://countries.trevorblades.com/', 30);
      await page.waitForTimeout(300);
      await typeCode(page, 'query', query, { delay: o.typeDelay || 30, json: false });
      await page.waitForTimeout(300);
      await act('run the query', () => css(page, 'button[title="Run query"]').first().click({ timeout: 8000 }));
      await page.waitForTimeout(o.settleMs ?? 2400);
    },
    async verify(page) {
      await expect(page, 'a GraphQL response', css(page, ':text("data"), :text("countries")'), { timeout: 12000 });
    },
  },

  websocketEcho: {
    async run(page, o = {}) {
      const json = o.json || '{\n"type": "subscribe",\n"channel": "orders"\n}';
      await openRail(page, 'Real time');
      await newTab(page);
      await typeInto(page, 'the socket URL', urlBar(page), o.url || 'wss://echo.websocket.org', 30);
      await page.waitForTimeout(300);
      await act('connect', () => btn(page, 'Connect').first().click({ timeout: 8000 }));
      await expect(page, 'a connected socket', css(page, ':text("Connected"), :text("OPEN")'), { timeout: 12000 });
      await typeCode(page, 'message', json, { delay: o.typeDelay || 30 });
      await soft('send the message', () => btn(page, 'Send').first().click({ timeout: 4000 }));
      await page.waitForTimeout(o.settleMs ?? 1600);
    },
    async verify(page) {
      await expect(page, 'the communication panel', css(page, ':text("Connected"), :text("OPEN")'), { timeout: 6000 });
    },
  },

  grpcMessage: {
    async run(page, o = {}) {
      await openRail(page, 'gRPC');
      await newTab(page);
      /* gRPC's endpoint bar is dui's HighlightedInputView — a contentEditable
         div with a decorative placeholder span, not an <input>, so
         getByPlaceholder never matches it. */
      await typeInto(page, 'the endpoint', urlBar(page), o.endpoint || 'localhost:50051', 40);
      await page.waitForTimeout(300);
      await act('open the Message tab', () => tab(page, 'Message').first().click({ timeout: 8000 }));
      await page.waitForTimeout(400);
      await typeCode(page, 'request message', o.message || '{\n"name": "Daakia"\n}', { delay: o.typeDelay || 30 });
      await page.waitForTimeout(o.settleMs ?? 1400);
    },
    async verify(page) {
      const seen = await page.evaluate(() => window.monaco?.editor.getEditors().map((e) => e.getValue()).find((v) => v && v.trim()));
      if (!seen || !seen.includes('Daakia')) throw new Error('the gRPC message editor is empty');
    },
  },

  soapEnvelope: {
    async run(page, o = {}) {
      await openRail(page, 'SOAP');
      await newTab(page);
      await expect(page, 'the envelope editor', css(page, '.monaco-editor'), { timeout: 10000 });
      await act('focus the envelope editor', () => css(page, '.monaco-editor').first().click({ timeout: 8000 }));
      await page.waitForTimeout(250);
      await act('clear it', async () => {
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
        await page.keyboard.press('Delete');
      });

      /*
        Opening tags only — the editor writes the closing ones.

        dui's editor completes an element the moment you type the `>` and puts
        the caret between the tags (`installTagAutoClose`). Typing the closing
        tags on top of that is what produced
        `</Currency>Currency></GetRate>GetRate>` in the last video: two things
        both doing the same job. So this types the envelope the way the editor
        is built to be typed, which is also how a person using it would.
      */
      for (const open of ['<soap:Envelope>', '<soap:Body>', '<GetRate>', '<Currency>']) {
        await act(`type ${open}`, () => page.keyboard.type(open, { delay: o.typeDelay || 34 }));
        await page.waitForTimeout(120);
      }
      await act('type the value', () => page.keyboard.type(o.value || 'EUR', { delay: o.typeDelay || 34 }));
      await page.waitForTimeout(o.settleMs ?? 1600);
    },
    async verify(page) {
      const seen = await page.evaluate(() => window.monaco?.editor.getEditors().map((e) => e.getValue()).find((v) => v && v.trim()));
      const want = '<soap:Envelope><soap:Body><GetRate><Currency>EUR</Currency></GetRate></soap:Body></soap:Envelope>';
      const flat = (seen || '').replace(/\s+/g, '');
      if (flat !== want.replace(/\s+/g, '')) {
        throw new Error(`the envelope came out as:
${seen}
expected:
${want}`);
      }
    },
  },

  mcpServer: {
    async run(page, o = {}) {
      await openRail(page, 'MCP');
      await newTab(page);
      /* MCP's command bar is the same dui editor every other protocol uses —
         `testId="url-bar"` — rather than the `npx…` placeholder input the old
         recipe hunted for and never found. */
      await typeInto(page, 'the MCP command', urlBar(page),
        o.command || 'npx @modelcontextprotocol/server-filesystem /workspace', o.typeDelay || 34);
      await page.waitForTimeout(o.settleMs ?? 1600);
    },
    async verify(page) {
      await expect(page, 'the MCP panel', text(page, 'STDIO', false), { timeout: 8000 });
    },
  },

  aiChat: {
    async run(page, o = {}) {
      await openRail(page, 'Daakia AI', 900);
      const box = field(page, 'Ask anything about APIs, REST, GraphQL, mocks, cURL, tests…');
      await expect(page, 'the AI chat box', box);
      await typeInto(page, 'the AI chat box', box,
        o.message || 'Generate a mock server from this collection', o.typeDelay || 38);
      await page.waitForTimeout(o.settleMs ?? 1500);
    },
    async verify(page) {
      await expect(page, 'the AI panel', field(page, 'Ask anything about APIs, REST, GraphQL, mocks, cURL, tests…'));
    },
  },

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

  dk8sPods: {
    async run(page, o = {}) {
      await openRail(page, 'Dk8s — Daakia K8s', 1800);
      await expect(page, 'the pod list', css(page, 'input[placeholder^="Filter pods"]'), { timeout: 20000 });
      /* A cluster with nothing in it makes a dull and misleading clip, so it is
         a failure rather than something to record. */
      await expect(page, 'at least one pod', css(page, '[class*="pod"], button:has-text("Deployment/")'), { timeout: 20000 });
      await page.waitForTimeout(900);
      await soft('filter the pods', async () => {
        await typeInto(page, 'the pod filter', css(page, 'input[placeholder^="Filter pods"]'), o.filter || 'zp', 60);
      });
      await page.waitForTimeout(o.settleMs ?? 2000);
    },
    async verify(page) {
      await expect(page, 'the pod list', css(page, 'input[placeholder^="Filter pods"]'), { timeout: 6000 });
    },
  },

  dk8sLogs: {
    async run(page, o = {}) {
      await openRail(page, 'Dk8s — Daakia K8s', 1800);
      await expect(page, 'the pod list', css(page, 'input[placeholder^="Filter pods"]'), { timeout: 20000 });
      const pod = css(page, 'button:has-text("Deployment/")').first();
      await expect(page, 'a pod to open', pod, { timeout: 20000 });
      await act('open a pod', () => pod.click({ timeout: 8000 }));
      await page.waitForTimeout(o.settleMs ?? 2600);
    },
    async verify(page) {
      await expect(page, 'the pod detail', css(page, ':text("Logs"), :text("Containers"), :text("Events")'), { timeout: 10000 });
    },
  },

  // ── dkgh ──────────────────────────────────────────────────────────────────

  dkghBoard: {
    async run(page, o = {}) {
      await openRail(page, 'DkGH — Daakia GitHub', 2200);
      await expect(page, 'the issue board', css(page, 'input[placeholder="Search issues"]'), { timeout: 20000 });
      await act('switch to the Table view', () => btn(page, 'Table').first().click({ timeout: 8000 }));
      await page.waitForTimeout(900);
      await act('switch to Columns', () => btn(page, 'Columns').first().click({ timeout: 8000 }));
      await page.waitForTimeout(o.settleMs ?? 2000);
    },
    async verify(page) {
      await expect(page, 'the board', css(page, 'input[placeholder="Search issues"]'), { timeout: 6000 });
    },
  },

  dkghTeam: {
    async run(page, o = {}) {
      await openRail(page, 'DkGH — Daakia GitHub', 2200);
      await expect(page, 'the issue board', css(page, 'input[placeholder="Search issues"]'), { timeout: 20000 });
      await act('open the Team view', () => btn(page, 'Team').first().click({ timeout: 8000 }));
      await expect(page, 'the assignee rail', css(page, '.ghteam-row'), { timeout: 10000 });
      await page.waitForTimeout(900);
      /* The sheet is the thing worth filming — it slides in over the board
         rather than navigating away from it. */
      await act('open an issue', () => css(page, '.dkgh tbody tr').first().click({ timeout: 8000 }));
      await expect(page, 'the issue sheet', css(page, '.dui_sheet__panel'), { timeout: 10000 });
      await page.waitForTimeout(o.settleMs ?? 2600);
    },
    async verify(page) {
      await expect(page, 'the open sheet', css(page, '.dui_sheet__panel'), { timeout: 6000 });
    },
  },

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
