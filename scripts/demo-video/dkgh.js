/**
 * DkGH — an issue tracker for one repository, inside the API client.
 *
 * These run against a real GitHub repository through the `gh` CLI, so they
 * need it installed and authenticated and the tab pointed at a repo. Reading
 * the board is a network round trip; the waits here are sized for that rather
 * than for a local render.
 *
 * Almost every step is `soft`. The board is somebody's live repository: a view
 * can be empty because nothing is assigned this sprint, Insights can have
 * nothing to chart, and none of that is a reason to lose the segment. What is
 * not soft is the board loading at all — a DkGH segment filmed against a
 * skeleton is worth nothing.
 */
const {
  act, soft, expect, typeInto, btn, css, text, openRail,
} = require('./drive');

/** One of the five sections across the top, by the id GhBoard already sets. */
const section = (page, id) => css(page, `[data-section="${id}"]`).first();
/** One of the four board shapes — cards, table, columns, roadmap. */
const view = (page, id) => css(page, `[data-view="${id}"]`).first();

const SEARCH = 'input[placeholder="Search issues"]';

/** Wait for the board to be a board, not a page of loading placeholders. */
async function boardReady(page) {
  await expect(page, 'the issue board', css(page, SEARCH), { timeout: 30000 });
  /* The skeleton renders the search box too, so the board is not ready until
     the repository has actually answered. */
  await expect(page, 'the repository to finish loading',
    css(page, `[data-view="cards"]`), { timeout: 30000 });
  await page.waitForTimeout(2200);
}

const dkgh = {
  /**
   * The board, in each of the shapes it can take.
   */
  dkghBoard: {
    async run(page, o = {}) {
      await openRail(page, 'DkGH', 2400);
      await boardReady(page);

      /* A saved view first — the board opens on "All open", and the point of
         the others is that a lead does not rebuild the same filter daily. */
      await soft('a saved view', async () => {
        await text(page, 'Stale & unowned', false).first().click({ timeout: 5000 });
        await page.waitForTimeout(2400);
        await text(page, 'All open', false).first().click({ timeout: 5000 });
        await page.waitForTimeout(1800);
      });

      for (const [id, label, hold] of [
        ['table', 'Table', 2600],
        ['columns', 'Columns', 3000],
        ['roadmap', 'Roadmap', 3000],
        ['cards', 'Cards', 2400],
      ]) {
        await soft(`the ${label} view`, async () => {
          await view(page, id).click({ timeout: 5000 });
          await page.waitForTimeout(hold);
        });
      }

      await soft('search the issues', async () => {
        await typeInto(page, 'the issue search', css(page, SEARCH), o.search || 'bug', 70);
        await page.waitForTimeout(2200);
        await css(page, SEARCH).first().click({ timeout: 4000 });
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Delete');
        await page.waitForTimeout(1500);
      });

      await page.waitForTimeout(o.settleMs ?? 1400);
    },
    async verify(page) {
      await expect(page, 'the board', css(page, SEARCH), { timeout: 8000 });
    },
  },

  /**
   * Who has what, and one issue opened over the top of it.
   */
  dkghTeam: {
    async run(page, o = {}) {
      await openRail(page, 'DkGH', 2400);
      await boardReady(page);

      await act('open the Team view', () => section(page, 'team').click({ timeout: 10000 }));
      await expect(page, 'the assignee rail', css(page, '.ghteam-row'), { timeout: 20000 });
      await page.waitForTimeout(2600);

      /* The sheet is the thing worth filming — it slides in over the board
         rather than navigating away from it. */
      await soft('open an issue', async () => {
        await css(page, '.dkgh tbody tr').first().click({ timeout: 6000 });
        await expect(page, 'the issue sheet', css(page, '.dui_sheet__panel'), { timeout: 12000 });
        await page.waitForTimeout(3200);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(900);
      });

      await page.waitForTimeout(o.settleMs ?? 1400);
    },
    async verify(page) {
      await expect(page, 'the team view', css(page, '.ghteam-row'), { timeout: 8000 });
    },
  },

  /**
   * The three sections that are not the board: charts, the repo, and filing.
   */
  dkghSections: {
    async run(page, o = {}) {
      await openRail(page, 'DkGH', 2400);
      await boardReady(page);

      for (const [id, label, hold] of [
        ['insights', 'Insights', 4000],
        ['repository', 'Repository', 3600],
        ['new', 'New issue', 3400],
        ['board', 'Board', 2000],
      ]) {
        await soft(`the ${label} section`, async () => {
          await section(page, id).click({ timeout: 6000 });
          await page.waitForTimeout(hold);
        });
      }

      await page.waitForTimeout(o.settleMs ?? 1200);
    },
    async verify(page) {
      await expect(page, 'the board', css(page, SEARCH), { timeout: 8000 });
    },
  },

  /**
   * The dkgh half of Settings — which `gh`, and which repository.
   */
  dkghSettings: {
    async run(page, o = {}) {
      await openRail(page, 'Settings', 1200);
      await page.waitForTimeout(900);

      /*
        Expand the group first.

        The settings nav collapses a group down to its name and a count, and
        DKGH has one child — so "GitHub CLI" is not in the document at all
        until the group is opened. DK8S happened to be expanded already, which
        is why the dk8s settings segment worked and this one timed out looking
        for a label that was never there.
      */
      await soft('expand the DkGH group', async () => {
        await text(page, 'DKGH', false).first().click({ timeout: 5000 });
        await page.waitForTimeout(900);
      });

      await act('open GitHub CLI', () => text(page, 'GitHub CLI').last().click({ timeout: 8000 }));
      await page.waitForTimeout(o.settleMs ?? 4000);
    },
    async verify(page) {
      await expect(page, 'the GitHub CLI section', text(page, 'GitHub CLI', false), { timeout: 8000 });
    },
  },
};

module.exports = { dkgh };
