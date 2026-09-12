/**
 * The parts of the app that are not a protocol: what you saved, where you
 * point it, what you already ran, what it mocked, and what it logged.
 */
const {
  act, soft, expect, typeInto, btn, field, css, text, urlBar, openRail, newTab, openPanel,
} = require('./drive');

const app = {
  /**
   * The collections tree, opened far enough to see requests in it.
   */
  collections: {
    async run(page, o = {}) {
      await openRail(page, 'REST');
      await newTab(page);
      await act('open Collections', () => openPanel(page, 'Collections'));
      await expect(page, 'a collection', css(page, '[title="Expand this folder and everything in it"], .dui_tree__row'), { timeout: 12000 });
      await page.waitForTimeout(1400);

      /* Opening a folder shows what a collection actually holds, which is a
         better thirty frames than a naming dialog. */
      await soft('expand a collection', async () => {
        await css(page, 'button[title="Expand this folder and everything in it"]').first().click({ timeout: 5000 });
        await page.waitForTimeout(2400);
      });

      /* And one of its requests, loaded into the tab. */
      await soft('open a saved request', async () => {
        const rows = css(page, '.dui_tree__row, [class*="tree"] [class*="row"]');
        await rows.nth(2).click({ timeout: 5000 });
        await page.waitForTimeout(2600);
      });

      await soft('search the tree', async () => {
        await typeInto(page, 'the collection search', css(page, 'input[placeholder="Search..."]'), o.search || 'user', 70);
        await page.waitForTimeout(2200);
      });

      await page.waitForTimeout(o.settleMs ?? 1400);
    },
    async verify(page) {
      await expect(page, 'the collections panel', text(page, 'Collections', false), { timeout: 8000 });
    },
  },

  /**
   * Environments — the variables a request resolves against.
   */
  environments: {
    async run(page, o = {}) {
      await openRail(page, 'REST');
      await newTab(page);
      await act('open Environments', () => openPanel(page, 'Environments'));
      await expect(page, 'the environments list', text(page, 'Environments', false), { timeout: 12000 });
      await page.waitForTimeout(2000);

      /* The switcher in the header is how anybody actually changes one. */
      await soft('open the environment switcher', async () => {
        await css(page, '.dui_select__trigger, [class*="env"] button').first().click({ timeout: 5000 });
        await page.waitForTimeout(2200);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(600);
      });

      await page.waitForTimeout(o.settleMs ?? 1800);
    },
    async verify(page) {
      await expect(page, 'the environments panel', text(page, 'Environments', false), { timeout: 8000 });
    },
  },

  /**
   * History — every request this app has run, and one of them reopened.
   */
  historyShow: {
    async run(page, o = {}) {
      const { sendRest } = require('./recipes');
      await sendRest(page, o.url || 'https://jsonplaceholder.typicode.com/todos/1');
      await act('open History', () => openPanel(page, 'History'));
      await page.waitForTimeout(2200);

      await soft('reopen an earlier request', async () => {
        await css(page, '[class*="history"] [class*="row"], [class*="history"] li').first().click({ timeout: 5000 });
        await page.waitForTimeout(2400);
      });

      await page.waitForTimeout(o.settleMs ?? 1400);
    },
    async verify(page) {
      await expect(page, 'a history entry', text(page, 'todos', false), { timeout: 8000 });
    },
  },

  /**
   * A mock server: started, and its own tabs.
   *
   * The previous version created a server every run. Five "Orders API (demo)"
   * rows had piled up in the panel by the time anybody noticed — visible in
   * the clip, and each one a saved config on somebody's machine. This reuses
   * the one it made last time.
   */
  mockServerRun: {
    async run(page, o = {}) {
      const name = o.name || 'Orders API (demo)';
      await openRail(page, 'Mock Server', 1400);
      await page.waitForTimeout(1200);

      const exists = await page.evaluate((n) => document.body.innerText.includes(n), name);
      if (exists) {
        await act('open the demo server', () => page.getByText(name, { exact: true }).first().click({ timeout: 8000 }));
        await page.waitForTimeout(1400);
      } else {
        await act('new mock server', () => css(page, 'button[title="New mock server"]').first().click({ timeout: 6000 }));
        await page.waitForTimeout(900);
        await typeInto(page, 'the server name', field(page, 'Mock server name'), name, o.typeDelay || 38);
        await act('create it', () => btn(page, 'Create').first().click({ timeout: 8000 }));
        await page.waitForTimeout(1600);
      }

      /* Start it if it is not already up — the button is Stop when it is. */
      const running = await btn(page, 'Stop', false).count();
      if (!running) {
        await act('start the server', () => btn(page, 'Start', false).first().click({ timeout: 8000 }));
        /* The proof it really started: the button becomes Stop, and the app
           says which port it took. */
        await expect(page, 'a running server', btn(page, 'Stop', false), { timeout: 20000 });
      }
      await page.waitForTimeout(2000);

      for (const [label, hold] of [['Traffic', 2400], ['Chaos', 2600], ['State Machine', 2600], ['Routes', 2200]]) {
        await soft(`the ${label} tab`, async () => {
          await text(page, label).first().click({ timeout: 4000 });
          await page.waitForTimeout(hold);
        });
      }

      await page.waitForTimeout(o.settleMs ?? 1400);
    },
    async verify(page) {
      await expect(page, 'the Stop button of a running server', btn(page, 'Stop', false), { timeout: 8000 });
    },
  },

  /**
   * DevTools — the app's own console, network and timeline.
   */
  devTools: {
    async run(page, o = {}) {
      const { sendRest } = require('./recipes');
      await sendRest(page, o.url || 'https://jsonplaceholder.typicode.com/users/1');
      await openRail(page, 'DevTools (Console / Timeline)', 1200);
      await page.waitForTimeout(1600);

      for (const [label, hold] of [['Network', 2800], ['Performance', 2600], ['AI Insights', 2600], ['Console', 2400]]) {
        await soft(`the ${label} tab`, async () => {
          await text(page, label, false).first().click({ timeout: 4000 });
          await page.waitForTimeout(hold);
        });
      }

      await page.waitForTimeout(o.settleMs ?? 1200);
    },
    async verify(page) {
      await expect(page, 'the DevTools panel', text(page, 'Network', false), { timeout: 8000 });
    },
  },

  /**
   * A settings section by name — used for the ones that need no tour.
   */
  settings: {
    async run(page, o = {}) {
      await openRail(page, 'Settings', 1100);
      await page.waitForTimeout(900);
      if (o.section) {
        await act(`open ${o.section}`, () => text(page, o.section).last().click({ timeout: 8000 }));
        await page.waitForTimeout(1600);
      }
      await page.waitForTimeout(o.settleMs ?? 2200);
    },
    async verify(page, o = {}) {
      if (o.expect) await expect(page, o.expect, text(page, o.expect, false), { timeout: 8000 });
    },
  },
};

module.exports = { app };
