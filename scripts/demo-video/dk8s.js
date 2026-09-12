/**
 * Dk8s — the cluster, one pod, and the settings behind them.
 *
 * These run against whatever cluster `kubectl` is pointed at, so they are the
 * only segments with an outside dependency. Each one fails rather than records
 * an empty grid: a Kubernetes panel with no pods in it is both dull and
 * misleading, and the fix (start the cluster) is not something a viewer of the
 * video can do.
 */
const {
  act, soft, expect, typeInto, css, text, openRail,
} = require('./drive');

/** A pod-detail tab, by the id PodDetail puts in `data-tab`. */
const detailTab = (page, id) => css(page, `[data-tab="${id}"]`).first();

const POD_FILTER = 'input[placeholder^="Filter pods"]';

const dk8s = {
  /**
   * The pod grid: everything running, then narrowed to one thing.
   */
  dk8sPods: {
    async run(page, o = {}) {
      await openRail(page, 'Dk8s', 1800);
      await expect(page, 'the pod list', css(page, POD_FILTER), { timeout: 25000 });
      /* A cluster with nothing in it makes a dull and misleading clip, so it is
         a failure rather than something to record. */
      await expect(page, 'at least one pod', css(page, 'button:has-text("Deployment/")'), { timeout: 25000 });
      await page.waitForTimeout(1600);

      await soft('filter the pods', async () => {
        await typeInto(page, 'the pod filter', css(page, POD_FILTER), o.filter || 'zp', 70);
        await page.waitForTimeout(1800);
      });

      /* Clear it again so the grid ends full — the last frame of this segment
         is the one that says "this is your whole cluster". */
      await soft('clear the filter', async () => {
        await css(page, POD_FILTER).first().click({ timeout: 4000 });
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Delete');
        await page.waitForTimeout(1600);
      });

      await page.waitForTimeout(o.settleMs ?? 1600);
    },
    async verify(page) {
      await expect(page, 'the pod list', css(page, POD_FILTER), { timeout: 8000 });
      await expect(page, 'at least one pod', css(page, 'button:has-text("Deployment/")'), { timeout: 8000 });
    },
  },

  /**
   * One pod, every tab: logs, a shell, the doctor, the filesystem, the YAML.
   *
   * This is the segment that earns dk8s its place in the video — the rest of
   * the app is an API client, and this is a Kubernetes console inside it.
   */
  dk8sDetail: {
    async run(page, o = {}) {
      await openRail(page, 'Dk8s', 1800);
      await expect(page, 'the pod list', css(page, POD_FILTER), { timeout: 25000 });

      const pod = css(page, 'button:has-text("Deployment/")').first();
      await expect(page, 'a pod to open', pod, { timeout: 25000 });
      await act('open a pod', () => pod.click({ timeout: 8000 }));
      await expect(page, 'the pod detail', detailTab(page, 'logs'), { timeout: 20000 });
      await page.waitForTimeout(2000);

      await act('read the logs', () => detailTab(page, 'logs').click({ timeout: 8000 }));
      await page.waitForTimeout(3000);

      /*
        A shell in the pod, and something typed into it.

        `soft` because Terminal needs exec on the cluster — it renders locked
        with a padlock where that is not granted, and a segment should not die
        on somebody else's RBAC.
      */
      await soft('open a shell', async () => {
        await detailTab(page, 'terminal').click({ timeout: 6000 });
        await page.waitForTimeout(3000);
        await page.mouse.click(640, 500);
        await page.keyboard.type(o.command || 'ls -la /', { delay: 55 });
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2600);
      });

      for (const [id, label, hold] of [
        ['doctor', 'Doctor', 3000],
        ['explorer', 'Explorer', 2800],
        ['describe', 'Describe', 2600],
        ['yaml', 'YAML', 2600],
        ['overview', 'Overview', 2400],
      ]) {
        await soft(`the ${label} tab`, async () => {
          await detailTab(page, id).click({ timeout: 5000 });
          await page.waitForTimeout(hold);
        });
      }

      await page.waitForTimeout(o.settleMs ?? 1200);
    },
    async verify(page) {
      await expect(page, 'the pod detail', detailTab(page, 'yaml'), { timeout: 8000 });
    },
  },

  /**
   * The dk8s half of Settings — which cluster, and what the terminal looks like.
   */
  dk8sSettings: {
    async run(page, o = {}) {
      await openRail(page, 'Settings', 1200);
      await page.waitForTimeout(900);

      for (const [name, hold] of o.sections || [['Cluster', 3200], ['Terminal', 3200], ['Theme', 2800]]) {
        await act(`open ${name}`, () => text(page, name).last().click({ timeout: 8000 }));
        await page.waitForTimeout(hold);
      }
      await page.waitForTimeout(o.settleMs ?? 1200);
    },
    async verify(page, o = {}) {
      const last = (o.sections || [['Theme']]).at(-1)[0];
      await expect(page, `the ${last} section`, text(page, last, false), { timeout: 8000 });
    },
  },
};

module.exports = { dk8s };
