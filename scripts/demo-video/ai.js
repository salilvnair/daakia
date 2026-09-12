/**
 * The assistant, and the settings behind it.
 *
 * `aiChat` needs a provider that answers — run `node scripts/demo-video/ai-mock.js`
 * first, which points DaakiaAI (Mock) at Daakia's own OpenAI-compatible mock
 * server. The reply in the recording is then a real one over HTTP; only the
 * endpoint is ours. `verify` fails the segment if no answer arrives, so a
 * chat segment can never quietly record an error bubble the way the first
 * attempt did ("No GitHub Copilot model available").
 */
const {
  act, soft, expect, typeInto, field, css, text, openRail,
} = require('./drive');

const CHAT_PLACEHOLDER = 'Ask anything about APIs, REST, GraphQL, mocks, cURL, tests…';

const ai = {
  /**
   * Ask the assistant something and let the answer arrive.
   */
  aiChat: {
    async run(page, o = {}) {
      await openRail(page, 'Daakia AI', 1100);
      const box = field(page, CHAT_PLACEHOLDER);
      await expect(page, 'the AI chat box', box, { timeout: 10000 });

      await typeInto(page, 'the AI chat box', box,
        o.message || 'Write a curl command for this request', o.typeDelay || 34);
      await page.waitForTimeout(400);
      await act('send it', () => page.keyboard.press('Enter'));

      /*
        The answer, not just the fact that something happened.

        `mock-ai-server` matches on keywords and replies with a fenced code
        block, so waiting for a `bash` block is waiting for the real thing —
        an error bubble has no code in it.
      */
      await expect(page, 'the assistant\'s answer', css(page, 'pre, code'), { timeout: 30000 });
      await page.waitForTimeout(2600);

      /* Read it the way a person would. */
      await soft('scroll the answer', async () => {
        await page.mouse.move(560, 450);
        for (let i = 0; i < 3; i++) {
          await page.mouse.wheel(0, 260);
          await page.waitForTimeout(700);
        }
      });

      /* The two things the answer can become. */
      await soft('show the prompt library button', async () => {
        await text(page, 'Prompts', false).first().click({ timeout: 4000 });
        await page.waitForTimeout(2000);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
      });

      await page.waitForTimeout(o.settleMs ?? 1400);
    },

    async verify(page) {
      const body = await page.evaluate(() => document.body.innerText);
      if (/No GitHub Copilot model available|No provider configured|⚠ Error/i.test(body)) {
        throw new Error('the assistant answered with an error — run scripts/demo-video/ai-mock.js first');
      }
      await expect(page, 'an answer with code in it', css(page, 'pre, code'), { timeout: 8000 });
    },
  },

  /**
   * The four AI sections of Settings, in the order somebody would meet them.
   */
  aiSettings: {
    async run(page, o = {}) {
      await openRail(page, 'Settings', 1200);
      await page.waitForTimeout(900);

      const sections = o.sections || [
        ['LLM Provider', 2800],
        ['AI Features', 2200],
        ['Prompt Library', 2400],
        ['AI Audit', 2200],
      ];

      for (const [name, hold] of sections) {
        await act(`open ${name}`, () => text(page, name).last().click({ timeout: 8000 }));
        await page.waitForTimeout(hold);
      }

      await page.waitForTimeout(o.settleMs ?? 1200);
    },

    async verify(page, o = {}) {
      const last = (o.sections || [['AI Audit']]).at(-1)[0];
      await expect(page, `the ${last} section`, text(page, last, false), { timeout: 8000 });
    },
  },
};

module.exports = { ai };
