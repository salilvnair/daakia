/**
 * One recipe per protocol, each showing the tabs that protocol actually has.
 *
 * These were "type a URL, maybe press a button". Every one of them now walks
 * its own request tabs and, where there is a response, its response tabs — the
 * things that make the protocol worth having a panel of its own — and leaves
 * the right-hand panel open on whichever of Collections / Schema / History
 * belongs to it.
 *
 * Kept out of `recipes.js` because that file was already long enough that the
 * protocol recipes were hard to find in it. `recipes.js` spreads these in.
 */
const {
  act, soft, expect, typeInto, btn, css, text, urlBar, openRail, newTab, openPanel,
} = require('./drive');

/*
  A request-panel tab, and a response-panel one.

  Every protocol renders both strips with dui's `TabView`, which puts the tab's
  id in `data-tab`. Several ids appear in both strips — `headers` in all of
  them, `body` in most — and the request panel is always first in the document,
  so first and last are the two halves. REST names its strips instead, because
  there the ambiguity is worth removing properly; here `soft` covers a miss.
*/
const reqSub = (page, id) => css(page, `[data-tab="${id}"]`).first();
const resSub = (page, id) => css(page, `[data-tab="${id}"]`).last();

/** Click through a set of tabs, holding on each long enough to read it. */
async function walk(page, what, tabs, pick, hold = 1200) {
  for (const [id, label] of tabs) {
    await soft(`the ${what} ${label} tab`, async () => {
      await pick(page, id).click({ timeout: 4000 });
      await page.waitForTimeout(hold);
    });
  }
}

const protocols = {
  /**
   * A GraphQL query against a public schema, and the panel that knows it.
   *
   * The Schema panel is the point of the protocol — it is what you cannot get
   * from a REST tab — so this opens it rather than the collections tree.
   */
  graphqlQuery: {
    async run(page, o = {}) {
      const query = o.query || '{\ncountries {\ncode\nname\nemoji\n}\n}';
      await openRail(page, 'GraphQL');
      await newTab(page);
      await typeInto(page, 'the endpoint', urlBar(page), o.url || 'https://countries.trevorblades.com/', 30);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      const { typeCode } = require('./recipes');
      await typeCode(page, 'query', query, { delay: o.typeDelay || 30, json: false });
      await page.waitForTimeout(400);

      await act('run the query', () => css(page, 'button[title="Run query"]').first().click({ timeout: 8000 }));
      await expect(page, 'a GraphQL response', css(page, ':text("countries"), :text("data")'), { timeout: 15000 });
      await page.waitForTimeout(1200);

      await walk(page, 'request', [['variables', 'Variables'], ['headers', 'Headers'], ['authorization', 'Authorization'], ['subscription', 'Subscription'], ['query', 'Query']], reqSub);

      await soft('open the Schema panel', () => openPanel(page, 'Schema'));
      await page.waitForTimeout(o.settleMs ?? 1800);
    },
    async verify(page) {
      await expect(page, 'a GraphQL response', css(page, ':text("countries"), :text("data")'), { timeout: 8000 });
    },
  },

  /**
   * A live socket: connect, send a frame, watch it come back.
   *
   * Real time is four protocols behind one rail — WebSocket, SSE, Socket.IO,
   * MQTT — so the segment opens that chooser before settling on the first.
   */
  websocketEcho: {
    async run(page, o = {}) {
      const json = o.json || '{\n"type": "subscribe",\n"channel": "orders"\n}';
      await openRail(page, 'Real time');
      await newTab(page);

      /* The four behind this rail, held open long enough to read. */
      await soft('show the real-time protocols', async () => {
        await css(page, '.dui_select-text__trigger').first().click({ timeout: 5000 });
        await page.waitForTimeout(1500);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      });

      await typeInto(page, 'the socket URL', urlBar(page), o.url || 'wss://echo.websocket.org', 30);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      await act('connect', () => btn(page, 'Connect').first().click({ timeout: 8000 }));
      await expect(page, 'a connected socket', css(page, ':text("Connected"), :text("OPEN")'), { timeout: 15000 });
      await page.waitForTimeout(900);

      const { typeCode } = require('./recipes');
      await typeCode(page, 'message', json, { delay: o.typeDelay || 30 });
      await soft('send the frame', () => btn(page, 'Send').first().click({ timeout: 5000 }));
      await page.waitForTimeout(1800);

      await walk(page, 'panel', [['templates', 'Templates'], ['authorization', 'Authorization'], ['communication', 'Communication']], reqSub);

      await soft('open Collections', () => openPanel(page, 'Collections'));
      await page.waitForTimeout(o.settleMs ?? 1500);
    },
    async verify(page) {
      await expect(page, 'a connected socket', css(page, ':text("Connected"), :text("OPEN")'), { timeout: 8000 });
    },
  },

  /**
   * gRPC: the endpoint, the message, and the service definition it came from.
   */
  grpcMessage: {
    async run(page, o = {}) {
      await openRail(page, 'gRPC');
      await newTab(page);
      /* gRPC's endpoint bar is dui's HighlightedInputView — a contentEditable
         div with a decorative placeholder span, not an <input>, so
         getByPlaceholder never matches it. */
      await typeInto(page, 'the endpoint', urlBar(page), o.endpoint || 'localhost:50051', 38);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);

      await act('open the Message tab', () => reqSub(page, 'message').click({ timeout: 8000 }));
      await page.waitForTimeout(500);

      const { typeCode } = require('./recipes');
      await typeCode(page, 'request message', o.message || '{\n"name": "Daakia",\n"greeting": "hello"\n}', { delay: o.typeDelay || 30 });
      await page.waitForTimeout(1300);

      await walk(page, 'request', [['proto', 'Service Definition'], ['metadata', 'Metadata'], ['auth', 'Auth'], ['message', 'Message']], reqSub, 1400);

      await soft('open Collections', () => openPanel(page, 'Collections'));
      await page.waitForTimeout(o.settleMs ?? 1500);
    },
    async verify(page) {
      const seen = await page.evaluate(() => window.monaco?.editor.getEditors()
        .map((e) => e.getValue()).find((v) => v && v.includes('Daakia')));
      if (!seen) throw new Error('the gRPC message editor does not hold the typed message');
    },
  },

  /**
   * A SOAP envelope, typed in full.
   *
   * The previous version typed opening tags only and let the editor complete
   * them — which worked until dui learned to stop closing tags for anything
   * that is not a person (`window.__DUI_NO_AUTOCLOSE__`), at which point the
   * envelope came out with no closing tags at all. Typing the whole thing is
   * both what a person does and the only version that does not depend on an
   * editor behaviour the recorder itself turns off.
   */
  soapEnvelope: {
    async run(page, o = {}) {
      await openRail(page, 'SOAP');
      await newTab(page);
      await typeInto(page, 'the endpoint', urlBar(page), o.url || 'https://www.dataaccess.com/webservicesserver/NumberConversion.wso', 26);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);

      const envelope = o.envelope || [
        '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">',
        '<soap:Body>',
        '<NumberToWords>',
        '<ubiNum>2024</ubiNum>',
        '</NumberToWords>',
        '</soap:Body>',
        '</soap:Envelope>',
      ].join('\n');

      const { typeCode } = require('./recipes');
      await typeCode(page, 'envelope', envelope, { delay: o.typeDelay || 22, json: false });
      await page.waitForTimeout(1200);

      await walk(page, 'request', [['form', 'Form'], ['wssecurity', 'WS-Security'], ['auth', 'Authorization'], ['envelope', 'Envelope']], reqSub, 1400);

      await soft('open Collections', () => openPanel(page, 'Collections'));
      await page.waitForTimeout(o.settleMs ?? 1500);
    },
    async verify(page) {
      const seen = await page.evaluate(() => window.monaco?.editor.getEditors()
        .map((e) => e.getValue()).find((v) => v && v.includes('soap:Envelope')));
      if (!seen) throw new Error('the envelope editor is empty');
      if (!/<\/soap:Envelope>/.test(seen)) throw new Error(`the envelope is not closed:\n${seen}`);
    },
  },

  /**
   * MCP: a server command, and the four things a server offers once it answers.
   */
  mcpServer: {
    async run(page, o = {}) {
      await openRail(page, 'MCP');
      await newTab(page);
      /* MCP's command bar is the same dui editor every other protocol uses —
         `testId="url-bar"` — rather than the `npx…` placeholder input the old
         recipe hunted for and never found. */
      await typeInto(page, 'the MCP command', urlBar(page),
        o.command || 'npx @modelcontextprotocol/server-filesystem /workspace', o.typeDelay || 30);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);

      await walk(page, 'request', [['args', 'Args'], ['env', 'Env'], ['config', 'Config']], reqSub, 1300);
      await walk(page, 'server', [['tools', 'Tools'], ['resources', 'Resources'], ['prompts', 'Prompts'], ['servers', 'Servers']], resSub, 1300);

      await soft('open Collections', () => openPanel(page, 'Collections'));
      await page.waitForTimeout(o.settleMs ?? 1500);
    },
    async verify(page) {
      await expect(page, 'the MCP panel', text(page, 'STDIO', false), { timeout: 8000 });
    },
  },
};

module.exports = { protocols };
