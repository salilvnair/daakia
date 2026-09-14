/**
 * dkgh wiki captures — see wiki-capture-rest.test.ts for the pattern, and
 * wiki-capture-dk8s.test.ts for why a surface with no local fixture seeds
 * itself instead of clicking.
 *
 * ── Why this one posts messages ──
 *
 * dkgh's screens are somebody's repository, read through `gh`. A capture run
 * has neither a repository nor a login, and making it need them would mean the
 * wiki could only be rebuilt on a machine signed in to the right account.
 *
 * dk8s solves that by writing its store; dkgh cannot, because the board keeps
 * what it read in component state behind a `message` listener. So the fixture
 * goes in as the messages the host would have posted — `dkgh:probe:result`,
 * `dkgh:board:result`, `dkgh:repoMeta:result` — and every screen renders from
 * them through exactly the code path a real read goes through.
 *
 * The timing matters: the panel probes on mount and the board asks for its
 * issues, and the real host answers both with a failure (no gh, no repo). The
 * seed therefore lands *after* those replies, and a second seed follows the
 * board's own mount-time read for the same reason dk8s seeds twice.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { runCapture, type MainPanelLike, type CaptureDirective } from '../wiki-capture/capture-orchestrator';

interface ScreenSpec { id: string; label: string; explanation: string; directives: CaptureDirective[] }

const OUT_DIR = path.resolve(__dirname, '../../../plan/daakia_live/dkgh');

const REPO = 'acme/ledger';

// ── The fixture repository ───────────────────────────────────────────────────

const PROBE = {
  type: 'dkgh:probe:result',
  repo: REPO,
  oldGhDismissed: [],
  env: {
    present: true,
    binary: '/opt/homebrew/bin/gh',
    version: { version: '2.62.0', raw: 'gh version 2.62.0 (2026-08-14)' },
    platform: 'darwin',
    capabilities: {
      project: true, issueJson: true, searchIssues: true,
      issueCreate: true, issueEdit: true, issueTypes: true,
    },
    auth: {
      loggedIn: true,
      hosts: ['github.com'],
      accounts: [{
        host: 'github.com',
        login: 'rmurray',
        active: true,
        scopes: ['repo', 'read:org', 'project', 'gist'],
      }],
    },
  },
};

const LABEL = (name: string, color: string) => ({ name, color });

const ISSUE = (over: Record<string, unknown>) => ({
  state: 'OPEN',
  author: 'rmurray',
  assignees: [],
  labels: [],
  commentCount: 0,
  dimensions: {},
  evidence: [],
  createdAt: '2026-08-28T09:14:00Z',
  updatedAt: '2026-09-11T16:02:00Z',
  ageDays: 16,
  quietDays: 2,
  url: `https://github.com/${REPO}/issues/0`,
  ...over,
});

const ISSUES = [
  ISSUE({
    number: 481, title: 'Checkout hangs after pressing Pay',
    labels: [LABEL('bug', 'd73a4a'), LABEL('priority: high', 'b60205')],
    assignees: ['rmurray'], milestone: '1.5 — Payments',
    dimensions: { Module: 'Checkout', Environment: 'PROD', Type: 'UI' },
    commentCount: 6, ageDays: 3, quietDays: 0,
    bodyFirstLine: 'The spinner never stops and no order is created.',
    createdAt: '2026-09-10T08:30:00Z', updatedAt: '2026-09-13T07:41:00Z',
  }),
  ISSUE({
    number: 479, title: 'Settlement retries give up after three attempts',
    labels: [LABEL('bug', 'd73a4a')],
    dimensions: { Module: 'Settlement', Environment: 'PROD', Type: 'Backend' },
    commentCount: 2, ageDays: 5, quietDays: 4,
    bodyFirstLine: 'SocketTimeoutException on the upstream call.',
  }),
  ISSUE({
    number: 476, title: 'Export to Excel drops the Module column',
    labels: [LABEL('bug', 'd73a4a'), LABEL('good first issue', '7057ff')],
    assignees: ['jchen'],
    dimensions: { Module: 'Reporting', Environment: 'UAT', Type: 'Excel Processing' },
    commentCount: 1, ageDays: 9, quietDays: 6,
  }),
  ISSUE({
    number: 470, title: 'Add a webhook for settlement completion',
    labels: [LABEL('enhancement', 'a2eeef')],
    milestone: '1.6 — Integrations',
    dimensions: { Module: 'Settlement', Environment: 'DEV', Type: 'API' },
    commentCount: 4, ageDays: 21, quietDays: 15,
  }),
  ISSUE({
    number: 468, title: 'Ledger reconciliation is slow on large accounts',
    labels: [LABEL('performance', 'fbca04')],
    assignees: ['rmurray', 'jchen'],
    dimensions: { Module: 'Ledger', Environment: 'PROD', Type: 'Backend' },
    commentCount: 9, ageDays: 24, quietDays: 1,
  }),
  ISSUE({
    number: 455, title: 'Refund receipt shows the wrong currency symbol',
    labels: [LABEL('bug', 'd73a4a')],
    dimensions: { Module: 'Checkout', Environment: 'UAT', Type: 'UI' },
    commentCount: 0, ageDays: 33, quietDays: 28,
  }),
  ISSUE({
    number: 442, title: 'Document the settlement state machine',
    labels: [LABEL('documentation', '0075ca')],
    assignees: ['dpatel'],
    dimensions: { Module: 'Settlement', Environment: 'DEV', Type: 'Docs' },
    commentCount: 3, ageDays: 41, quietDays: 12,
  }),
  ISSUE({
    number: 431, title: 'Duplicate transfer created on double submit',
    state: 'CLOSED',
    labels: [LABEL('bug', 'd73a4a')],
    assignees: ['jchen'], milestone: '1.4 — Hardening',
    dimensions: { Module: 'Ledger', Environment: 'PROD', Type: 'Backend' },
    commentCount: 12, ageDays: 55, quietDays: 7,
    closedAt: '2026-09-06T11:20:00Z',
  }),
];

const FORM = {
  file: 'bug.yml',
  name: 'Bug Report',
  description: 'Something is broken',
  labels: ['bug'],
  fields: [
    { type: 'input', label: 'Summary', options: [], required: true },
    { type: 'dropdown', label: 'Type', options: ['UI', 'API', 'Backend', 'Excel Processing'], required: true },
    { type: 'dropdown', label: 'Module', options: ['Checkout', 'Settlement', 'Ledger', 'Reporting'], required: true },
    { type: 'dropdown', label: 'Environment', options: ['DEV', 'UAT', 'PROD'], required: true },
    { type: 'textarea', label: 'Steps to Reproduce', options: [], required: false },
    { type: 'textarea', label: 'Expected Result', options: [], required: false },
    { type: 'textarea', label: 'Actual Result', options: [], required: false },
    { type: 'textarea', label: 'Evidence', options: [], required: false },
  ],
};

const dimension = (dimension: string, options: string[]) => ({
  dimension, heading: dimension, options, files: ['bug.yml'],
});

const BOARD = {
  type: 'dkgh:board:result',
  repo: REPO,
  issues: ISSUES,
  dimensions: [
    dimension('Module', ['Checkout', 'Settlement', 'Ledger', 'Reporting']),
    dimension('Environment', ['DEV', 'UAT', 'PROD']),
    dimension('Type', ['UI', 'API', 'Backend', 'Excel Processing', 'Docs']),
  ],
  forms: [FORM],
  formErrors: [],
  noTemplates: false,
  fetchedAt: Date.parse('2026-09-13T08:00:00Z'),
};

const META = {
  type: 'dkgh:repoMeta:result',
  repo: REPO,
  labels: [
    { name: 'bug', color: 'd73a4a', description: 'Something is not working' },
    { name: 'enhancement', color: 'a2eeef' },
    { name: 'documentation', color: '0075ca' },
    { name: 'performance', color: 'fbca04' },
    { name: 'priority: high', color: 'b60205' },
    { name: 'good first issue', color: '7057ff' },
  ],
  milestones: [{ title: '1.5 — Payments', dueOn: '2026-09-30' }, { title: '1.6 — Integrations' }],
  assignees: ['rmurray', 'jchen', 'dpatel'],
  unavailable: [],
};

/** Open the tab, let the real (failing) answers land, then seed over them. */
const seeded = (extra: CaptureDirective[] = []): CaptureDirective[] => [
  { action: 'closeAllTabs' },
  { action: 'openDkghTab' },
  /* The probe fires on open. Seeding before its reply lands means the fixture
     is overwritten and every screen parks on the install prompt. */
  { action: 'wait', ms: 1500 },
  { action: 'seedDkgh', dkghMessages: [PROBE] },
  /* The board asks for its issues when it mounts, and that answer would wipe
     what we just put in — so the board fixture follows it. */
  { action: 'wait', ms: 1200 },
  { action: 'seedDkgh', dkghMessages: [BOARD, META] },
  { action: 'wait', ms: 1200 },
  ...extra,
  { action: 'wait', ms: 900 },
];

const SCREENS: ScreenSpec[] = [
  {
    id: 'dkgh-board',
    label: 'dkgh — Board',
    explanation:
      'One repository’s open issues as cards, grouped by the dimensions the repository’s own issue forms declare. The rail down the left carries saved views with live counts; the chips across the top say in words what is being filtered.',
    directives: seeded(),
  },
  {
    id: 'dkgh-table',
    label: 'dkgh — Table',
    explanation:
      'The same filter as a dense table — one row per issue, sortable columns, and the same actions on each. Cards are for scanning a small repository; the table is for comparing many issues on one field.',
    directives: seeded([{ action: 'click', selector: '[data-view="table"]' }]),
  },
  {
    id: 'dkgh-team',
    label: 'dkgh — Team',
    explanation:
      'Who is carrying what, with the unassigned pile first on purpose: that is the row a lead needs, and sorting it alphabetically would bury it in the middle.',
    directives: seeded([{ action: 'click', selector: '[data-section="team"]' }]),
  },
  {
    id: 'dkgh-compose',
    label: 'dkgh — New issue',
    explanation:
      'The composer opens with one box, not eleven fields. The metadata column beside it is the repository’s own template fields, and each row says where its value will be written.',
    directives: seeded([{ action: 'click', selector: '[data-section="new"]' }]),
  },
  {
    id: 'dkgh-insights',
    label: 'dkgh — Insights',
    explanation:
      'Four questions answered from the issues already loaded — no extra calls: open issues over time, where they are by module split by environment, how long they sit, and who is carrying what.',
    directives: seeded([{ action: 'click', selector: '[data-section="insights"]' }]),
  },
];

suite('Daakia Wiki Capture — dkgh', () => {
  let MainPanel: MainPanelLike;

  suiteSetup(async function () {
    this.timeout(20_000);
    const ext = vscode.extensions.getExtension('salilvnair.daakia');
    if (!ext) throw new Error('extension not found');
    const exports = ext.isActive ? ext.exports : await ext.activate();
    MainPanel = exports.MainPanel as MainPanelLike;
    if (!MainPanel.currentPanel) await vscode.commands.executeCommand('daakia.openPanel');
    for (let i = 0; i < 40 && !MainPanel.currentPanel; i++) await new Promise(r => setTimeout(r, 250));
    if (!MainPanel.currentPanel) throw new Error('MainPanel.currentPanel never became available');
    await new Promise(r => setTimeout(r, 2500));
    fs.mkdirSync(OUT_DIR, { recursive: true });
  });

  const manifest: Array<{ id: string; label: string; explanation: string; file: string }> = [];

  for (const screen of SCREENS) {
    test(`capture ${screen.id}`, async function () {
      this.timeout(30_000);
      const html = await runCapture(MainPanel, screen.directives);
      if (html.length < 200) throw new Error(`${screen.id}: captured HTML looks too small (${html.length} chars)`);
      const file = `${screen.id}.html`;
      fs.writeFileSync(path.join(OUT_DIR, file), html, 'utf-8');
      manifest.push({ id: screen.id, label: screen.label, explanation: screen.explanation, file });
    });
  }

  suiteTeardown(() => {
    if (manifest.length === 0) return;
    const manifestPath = path.join(OUT_DIR, 'manifest.json');
    let existing: Array<{ id: string; label: string; explanation: string; file: string }> = [];
    if (fs.existsSync(manifestPath)) {
      try { existing = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')); } catch { existing = []; }
    }
    const byId = new Map(existing.map(e => [e.id, e]));
    for (const e of manifest) byId.set(e.id, e);
    fs.writeFileSync(manifestPath, JSON.stringify(Array.from(byId.values()), null, 2), 'utf-8');
  });
});
