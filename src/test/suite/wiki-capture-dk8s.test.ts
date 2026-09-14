/**
 * dk8s wiki captures — see wiki-capture-rest.test.ts for the pattern.
 *
 * ── Why this one seeds instead of clicking ──
 *
 * Every other protocol's screens are reachable from an empty app: open a tab,
 * fill in a request, capture. dk8s's screens are a live cluster — pods it is
 * watching, logs streaming from a container, a file tree read over exec. A
 * capture run has no cluster, and making it need one would mean the wiki could
 * only be rebuilt on a machine with the fixtures up.
 *
 * So the cluster arrives as store state. Everything below is the shape a real
 * watch produces, and each view renders from it exactly as it would from the
 * real thing — which is the whole point of capturing the app rather than
 * drawing a mockup of it.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { runCapture, type MainPanelLike, type CaptureDirective } from '../wiki-capture/capture-orchestrator';

interface ScreenSpec { id: string; label: string; explanation: string; directives: CaptureDirective[] }

const OUT_DIR = path.resolve(__dirname, '../../../plan/daakia_live/dk8s');

// ── The fixture cluster ──────────────────────────────────────────────────────

const CONTEXTS = [
  { name: 'docker-desktop', cluster: 'docker-desktop', user: 'docker-desktop', current: true },
  { name: 'staging-eu', cluster: 'staging-eu', user: 'deploy', current: false },
];

const container = (name: string, ready = true, restarts = 0) => ({
  name, ready, restarts, image: `registry.example.com/${name}:1.4.2`,
});

const POD = (over: Record<string, unknown>) => ({
  namespace: 'payments',
  context: 'docker-desktop',
  phase: 'Running',
  ready: { current: 1, total: 1 },
  restarts: 0,
  startedAt: '2026-09-05T08:12:44Z',
  node: 'docker-desktop',
  healthy: true,
  deleting: false,
  ...over,
});

const PODS = [
  POD({
    name: 'ledger-api-7d9c4b8f6-x2mzq', uid: 'uid-ledger-1',
    containers: [container('ledger-api')],
    workload: { kind: 'Deployment', name: 'ledger-api' },
    image: 'registry.example.com/ledger-api:1.4.2',
  }),
  POD({
    name: 'ledger-api-7d9c4b8f6-p8kdr', uid: 'uid-ledger-2',
    containers: [container('ledger-api')],
    workload: { kind: 'Deployment', name: 'ledger-api' },
    image: 'registry.example.com/ledger-api:1.4.2',
  }),
  POD({
    name: 'settlement-worker-5f7b9d-qq4wl', uid: 'uid-settle-1',
    restarts: 4,
    lastRestartAt: '2026-09-07T04:02:10Z',
    containers: [container('settlement-worker', true, 4)],
    workload: { kind: 'Deployment', name: 'settlement-worker' },
    image: 'registry.example.com/settlement-worker:0.9.7',
  }),
  POD({
    name: 'reconciler-6c8d5f9b4-t7nsv', uid: 'uid-recon-1',
    phase: 'CrashLoopBackOff', reason: 'CrashLoopBackOff',
    ready: { current: 0, total: 1 }, restarts: 11, healthy: false,
    lastRestartAt: '2026-09-07T09:41:02Z',
    containers: [container('reconciler', false, 11)],
    workload: { kind: 'Deployment', name: 'reconciler' },
    image: 'registry.example.com/reconciler:2.0.1',
  }),
];

const USAGE = {
  'uid-ledger-1': { cpuMilli: 142, memBytes: 412 * 1024 * 1024 },
  'uid-ledger-2': { cpuMilli: 118, memBytes: 388 * 1024 * 1024 },
  'uid-settle-1': { cpuMilli: 610, memBytes: 1180 * 1024 * 1024 },
  'uid-recon-1': { cpuMilli: 12, memBytes: 96 * 1024 * 1024 },
};

const USAGE_HISTORY = {
  'uid-ledger-1': [380, 392, 401, 398, 405, 412],
  'uid-ledger-2': [372, 378, 381, 384, 386, 388],
  'uid-settle-1': [640, 742, 861, 967, 1074, 1180],
  'uid-recon-1': [88, 91, 94, 96, 96, 96],
};

const T0 = Date.parse('2026-09-07T09:40:00Z');
const line = (seq: number, level: string, text: string, extra: Record<string, unknown> = {}) => ({
  seq, ts: T0 + seq * 400, level, text, ...extra,
});

const LOGS = [
  line(1, 'info', '2026-09-07T09:40:00.412Z INFO  [main] c.e.ledger.Boot - Starting ledger-api v1.4.2', { logger: 'c.e.ledger.Boot', thread: 'main' }),
  line(2, 'info', '2026-09-07T09:40:00.812Z INFO  [main] c.e.ledger.Boot - Connected to postgres://ledger-db:5432/ledger', { logger: 'c.e.ledger.Boot', thread: 'main' }),
  line(3, 'info', '2026-09-07T09:40:01.204Z INFO  [main] o.s.b.w.e.tomcat - Tomcat started on port 8080', { logger: 'o.s.b.w.e.tomcat', thread: 'main' }),
  line(4, 'debug', '2026-09-07T09:40:03.118Z DEBUG [http-nio-8080-exec-1] c.e.ledger.Api - GET /v1/accounts/8821 -> 200 (14ms)', { logger: 'c.e.ledger.Api', thread: 'http-nio-8080-exec-1' }),
  line(5, 'warn', '2026-09-07T09:40:05.640Z WARN  [pool-2-thread-3] c.e.ledger.Settle - Retry 1/3 for settlement 4471 — upstream timed out', { logger: 'c.e.ledger.Settle', thread: 'pool-2-thread-3' }),
  line(6, 'error', '2026-09-07T09:40:07.902Z ERROR [pool-2-thread-3] c.e.ledger.Settle - Settlement 4471 failed after 3 attempts', { logger: 'c.e.ledger.Settle', thread: 'pool-2-thread-3' }),
  line(7, 'error', 'java.net.SocketTimeoutException: Read timed out', { logger: 'c.e.ledger.Settle', thread: 'pool-2-thread-3' }),
  line(8, 'error', '\tat java.base/java.net.SocketInputStream.socketRead0(Native Method)', { logger: 'c.e.ledger.Settle', thread: 'pool-2-thread-3' }),
  line(9, 'error', '\tat com.example.ledger.Settle.post(Settle.java:118)', { logger: 'c.e.ledger.Settle', thread: 'pool-2-thread-3' }),
  line(10, 'info', '2026-09-07T09:40:09.331Z INFO  [http-nio-8080-exec-4] c.e.ledger.Api - POST /v1/transfers -> 201 (38ms)', { logger: 'c.e.ledger.Api', thread: 'http-nio-8080-exec-4' }),
];

/**
 * A Quick Search that has already run.
 *
 * Its own store — the pod store's watch updates would throw results away, and
 * a result set is worth keeping while you click through pods — so it seeds
 * through its own directive. Two pods, two sources: the live half read through
 * `kubectl logs`, the archive half read off a mounted volume, reported as
 * separate rows because they are two different bodies of text.
 */
const MATCH = (over: Record<string, unknown>) => ({
  namespace: 'payments',
  context: 'docker-desktop',
  level: 'error',
  hits: [[0, 9]] as [number, number][],
  before: [],
  after: [],
  ...over,
});

const SEARCH_GROUPS = [
  {
    source: 'live',
    result: {
      pod: 'ledger-api-7d9c4b8f6-x2mzq', namespace: 'payments', context: 'docker-desktop',
      scanned: 5000, matched: 3, capped: false, elapsedMs: 412,
    },
    matches: [
      MATCH({
        pod: 'ledger-api-7d9c4b8f6-x2mzq', line: 4471, ts: Date.parse('2026-09-07T09:40:07.902Z'),
        text: '2026-09-07T09:40:07.902Z ERROR [pool-2-thread-3] c.e.ledger.Settle - Settlement 4471 failed after 3 attempts',
        hits: [[64, 72]] as [number, number][],
        before: ['2026-09-07T09:40:05.640Z WARN  [pool-2-thread-3] c.e.ledger.Settle - Retry 1/3 for settlement 4471 — upstream timed out'],
        after: ['java.net.SocketTimeoutException: Read timed out'],
      }),
      MATCH({
        pod: 'ledger-api-7d9c4b8f6-x2mzq', line: 4620, ts: Date.parse('2026-09-07T09:41:12.004Z'),
        text: '2026-09-07T09:41:12.004Z ERROR [pool-2-thread-1] c.e.ledger.Settle - Settlement 4488 failed after 3 attempts',
        hits: [[64, 72]] as [number, number][],
      }),
      MATCH({
        pod: 'ledger-api-7d9c4b8f6-x2mzq', line: 4881, ts: Date.parse('2026-09-07T09:44:31.117Z'),
        level: 'warn',
        text: '2026-09-07T09:44:31.117Z WARN  [pool-2-thread-6] c.e.ledger.Settle - settlement queue depth 812',
        hits: [[52, 62]] as [number, number][],
      }),
    ],
  },
  {
    source: 'archive',
    result: {
      pod: 'ledger-api-7d9c4b8f6-x2mzq', namespace: 'payments', context: 'docker-desktop',
      scanned: 1840226, matched: 214, capped: true, elapsedMs: 9106,
    },
    files: [
      { rel: 'ledger-api/2026-09-06.log.gz', file: '2026-09-06.log.gz', bytes: 48_112_009, mtime: Date.parse('2026-09-07T00:00:00Z'), scanned: 912_004, matched: 141 },
      { rel: 'ledger-api/2026-09-05.log.gz', file: '2026-09-05.log.gz', bytes: 44_889_120, mtime: Date.parse('2026-09-06T00:00:00Z'), scanned: 928_222, matched: 73 },
    ],
    matches: [
      MATCH({
        pod: 'ledger-api-7d9c4b8f6-x2mzq', line: 118204, ts: Date.parse('2026-09-06T22:14:02.551Z'),
        text: '2026-09-06T22:14:02.551Z ERROR [pool-2-thread-9] c.e.ledger.Settle - Settlement 3910 failed after 3 attempts',
        hits: [[64, 72]] as [number, number][],
      }),
    ],
  },
  {
    source: 'live',
    result: {
      pod: 'settlement-worker-5f7b9d-qq4wl', namespace: 'payments', context: 'docker-desktop',
      scanned: 5000, matched: 0, capped: false, elapsedMs: 284,
    },
    matches: [],
  },
];

const POD_AT = (name: string) => ({ name, namespace: 'payments', context: 'docker-desktop' });

/** Searches that were actually run — only those, never a keystroke on the way. */
const SEARCH_HISTORY = [
  {
    query: 'failed after 3 attempts', where: 'logs', at: Date.now() - 4 * 60 * 1000,
    pods: [POD_AT('ledger-api-7d9c4b8f6-x2mzq'), POD_AT('settlement-worker-5f7b9d-qq4wl')],
  },
  {
    query: 'SocketTimeoutException', where: 'logs', at: Date.now() - 52 * 60 * 1000,
    pods: [POD_AT('ledger-api-7d9c4b8f6-x2mzq')],
  },
  {
    query: 'a41f9c2e-77b1-4f0e-9a2d-0b6f1c3d8e55', where: 'logs', at: Date.now() - 3 * 60 * 60 * 1000,
    pods: [POD_AT('ledger-api-7d9c4b8f6-x2mzq'), POD_AT('ledger-api-7d9c4b8f6-p8kdr')],
  },
  {
    query: 'queue depth', where: 'logs', at: Date.now() - 26 * 60 * 60 * 1000,
    pods: [POD_AT('settlement-worker-5f7b9d-qq4wl')],
  },
];

const SEARCH_STATE = {
  open: true,
  searchIn: 'logs',
  running: false,
  progress: { done: 3, total: 3 },
  groups: SEARCH_GROUPS,
  picked: ['uid-ledger-1', 'uid-settle-1'],
  pickerOpen: false,
  archiveSearched: true,
  scanningArchive: false,
  filesOpen: [],
  collapsed: [],
  history: SEARCH_HISTORY,
  options: {
    query: 'failed after 3 attempts',
    regex: false, caseSensitive: false, contextLines: 2, tailLines: 5000,
    includePrevious: false,
  },
};

/** The state every dk8s screen starts from: connected, watching, pods in. */
const CONNECTED = {
  stage: 'ready',
  /* Answered, so the panel is past the production-cluster prompt. Without it
     the probe's reply parks every screen on `ask-sensitivity`. */
  sensitivity: { 'docker-desktop': 'normal' },
  sensitivityGuess: false,
  platform: 'darwin',
  contexts: CONTEXTS,
  selectedContexts: ['docker-desktop'],
  namespaces: ['default', 'payments', 'kube-system'],
  targets: [{ context: 'docker-desktop', namespace: 'payments' }],
  pinned: ['payments'],
  pods: PODS,
  usage: USAGE,
  usageHistory: USAGE_HISTORY,
  metricsAvailable: true,
  watchStatus: 'connected',
  podScope: 'all',
  busy: false,
};

/**
 * One pod open.
 *
 * `detail` is the pod-detail panel's own flag — `selectedPod` only marks the
 * row in the grid, so setting it alone leaves the grid on screen and every
 * detail capture looks identical to the pod list.
 */
const WITH_POD = {
  ...CONNECTED,
  view: 'cards',
  selectedPod: 'ledger-api-7d9c4b8f6-x2mzq',
  detail: PODS[0],
  /* The Doctor tab offers a heap dump, a thread dump and a JFR recording only
     once it knows what is running in there — without this it correctly, and
     unhelpfully for a screenshot, reports "runtime not identified". */
  runtime: { runtime: 'jvm', confidence: 0.94, detectedFrom: 'process command line' },
  /* `capabilities` is the in-container tool probe, not the cluster's RBAC —
     Doctor greys out every collection it has no tool for, so a fixture without
     these shows a JVM it cannot take a dump from. */
  capabilities: {
    shell: '/bin/sh', tar: true, python3: false,
    jcmd: true, jstack: true, jmap: true, jfr: true,
    targetPid: '1',
  },
  /* What the host's pod-classify produces for a JVM whose tools all probed
     clean. Without it Doctor says "nothing to collect", which is the honest
     answer to an empty action list and a useless screenshot. */
  actions: [
    { id: 'threaddump', label: 'Thread dump (jcmd)', available: true },
    { id: 'heapdump', label: 'Heap dump', available: true, disruptive: true },
    { id: 'jfr', label: 'Flight recording', available: true },
    { id: 'threaddump-sigquit', label: 'Thread dump (SIGQUIT to logs)', available: true, mutatesPod: true },
  ],
  probeBusy: false,
};

const SCREENS: ScreenSpec[] = [
  {
    id: 'dk8s-pods',
    label: 'dk8s — Pod grid',
    explanation:
      'The pod grid for every watched context and namespace. Each card carries phase, readiness, restart count and a live memory trend, so a pod that is climbing is visible before it is failing. The CrashLoopBackOff card is styled as unhealthy and offers its own AI explanation.',
    directives: [
      { action: 'closeAllTabs' },
      { action: 'openDk8sTab' },
      /* The probe fires on open and its reply writes `stage`. Seeding before
         it lands means the fixture is overwritten and every screen parks on
         the setup prompt — so the seed waits for the probe to finish. */
      { action: 'wait', ms: 1500 },
      { action: 'seedDk8sState', dk8sPatch: { ...CONNECTED, view: 'cards', detail: undefined } },
      /* The grid calls `startWatch()` when it mounts and the reply arrives
         with an empty pod list, wiping the fixture. So it goes in again
         once the watch has settled — the second write is the one the
         capture sees. */
      { action: 'wait', ms: 1200 },
      { action: 'seedDk8sState', dk8sPatch: { ...CONNECTED, view: 'cards', detail: undefined } },
      { action: 'wait', ms: 1500 },
    ],
  },
  {
    id: 'dk8s-pods-table',
    label: 'dk8s — Pod table',
    explanation:
      'The same pods as a dense table. Cards are for scanning a small namespace; the table is for a large one — sortable columns, one row per pod, and the same actions on each.',
    directives: [
      { action: 'closeAllTabs' },
      { action: 'openDk8sTab' },
      /* The probe fires on open and its reply writes `stage`. Seeding before
         it lands means the fixture is overwritten and every screen parks on
         the setup prompt — so the seed waits for the probe to finish. */
      { action: 'wait', ms: 1500 },
      { action: 'seedDk8sState', dk8sPatch: { ...CONNECTED, view: 'table' } },
      /* The grid calls `startWatch()` when it mounts and the reply arrives
         with an empty pod list, wiping the fixture. So it goes in again
         once the watch has settled — the second write is the one the
         capture sees. */
      { action: 'wait', ms: 1200 },
      { action: 'seedDk8sState', dk8sPatch: { ...CONNECTED, view: 'table' } },
      { action: 'wait', ms: 1500 },
    ],
  },
  {
    id: 'dk8s-logs',
    label: 'dk8s — Logs',
    explanation:
      'Streaming container logs with level colouring, a facet rail built from the fields the configured format actually named, wrap, tail depth, and a since-window. Selecting lines offers "Ask AI why" on exactly what is highlighted.',
    directives: [
      { action: 'closeAllTabs' },
      { action: 'openDk8sTab' },
      /* The probe fires on open and its reply writes `stage`. Seeding before
         it lands means the fixture is overwritten and every screen parks on
         the setup prompt — so the seed waits for the probe to finish. */
      { action: 'wait', ms: 1500 },
      { action: 'seedDk8sState', dk8sPatch: { ...WITH_POD, detailTab: 'logs', logs: LOGS, logStatus: 'streaming', logLive: true } },
      /* The grid calls `startWatch()` when it mounts and the reply arrives
         with an empty pod list, wiping the fixture. So it goes in again
         once the watch has settled — the second write is the one the
         capture sees. */
      { action: 'wait', ms: 1200 },
      { action: 'seedDk8sState', dk8sPatch: { ...WITH_POD, detailTab: 'logs', logs: LOGS, logStatus: 'streaming', logLive: true } },
      { action: 'wait', ms: 1800 },
    ],
  },
  {
    id: 'dk8s-logs-filtered',
    label: 'dk8s — Logs, filtered',
    explanation:
      'The same stream narrowed to errors and warnings. Levels and field facets combine, the count beside each facet is the count in the buffer, and turning one off never moves the rail — the filter strip sits in the body beside it for exactly that reason.',
    directives: [
      { action: 'closeAllTabs' },
      { action: 'openDk8sTab' },
      /* The probe fires on open and its reply writes `stage`. Seeding before
         it lands means the fixture is overwritten and every screen parks on
         the setup prompt — so the seed waits for the probe to finish. */
      { action: 'wait', ms: 1500 },
      { action: 'seedDk8sState', dk8sPatch: { ...WITH_POD, detailTab: 'logs', logs: LOGS, logStatus: 'idle', logLevels: ['error', 'warn'] } },
      /* The grid calls `startWatch()` when it mounts and the reply arrives
         with an empty pod list, wiping the fixture. So it goes in again
         once the watch has settled — the second write is the one the
         capture sees. */
      { action: 'wait', ms: 1200 },
      { action: 'seedDk8sState', dk8sPatch: { ...WITH_POD, detailTab: 'logs', logs: LOGS, logStatus: 'idle', logLevels: ['error', 'warn'] } },
      { action: 'wait', ms: 1800 },
    ],
  },
  {
    id: 'dk8s-overview',
    label: 'dk8s — Pod overview',
    explanation:
      'One pod at a glance: containers and their readiness, the workload that owns it, image, node, age, restart history, and the actions the cluster will actually permit — a probe up front means a forbidden action is a disabled button with a reason rather than a failure after the click.',
    directives: [
      { action: 'closeAllTabs' },
      { action: 'openDk8sTab' },
      /* The probe fires on open and its reply writes `stage`. Seeding before
         it lands means the fixture is overwritten and every screen parks on
         the setup prompt — so the seed waits for the probe to finish. */
      { action: 'wait', ms: 1500 },
      { action: 'seedDk8sState', dk8sPatch: { ...WITH_POD, detailTab: 'overview' } },
      /* The grid calls `startWatch()` when it mounts and the reply arrives
         with an empty pod list, wiping the fixture. So it goes in again
         once the watch has settled — the second write is the one the
         capture sees. */
      { action: 'wait', ms: 1200 },
      { action: 'seedDk8sState', dk8sPatch: { ...WITH_POD, detailTab: 'overview' } },
      { action: 'wait', ms: 1500 },
    ],
  },
  {
    id: 'dk8s-terminal',
    label: 'dk8s — Terminal',
    explanation:
      'A shell in the container, over kubectl exec. Same terminal surface as the rest of Daakia, with the container it is attached to shown as a chip.',
    directives: [
      { action: 'closeAllTabs' },
      { action: 'openDk8sTab' },
      /* The probe fires on open and its reply writes `stage`. Seeding before
         it lands means the fixture is overwritten and every screen parks on
         the setup prompt — so the seed waits for the probe to finish. */
      { action: 'wait', ms: 1500 },
      { action: 'seedDk8sState', dk8sPatch: { ...WITH_POD, detailTab: 'terminal' } },
      /* The grid calls `startWatch()` when it mounts and the reply arrives
         with an empty pod list, wiping the fixture. So it goes in again
         once the watch has settled — the second write is the one the
         capture sees. */
      { action: 'wait', ms: 1200 },
      { action: 'seedDk8sState', dk8sPatch: { ...WITH_POD, detailTab: 'terminal' } },
      { action: 'wait', ms: 1800 },
    ],
  },
  {
    id: 'dk8s-explorer',
    label: 'dk8s — File explorer',
    explanation:
      'The container filesystem, browsable. Files can be previewed, explained by AI, or pulled down as artifacts — which is how a heap dump or a JFR recording gets from a pod into the analyzers.',
    directives: [
      { action: 'closeAllTabs' },
      { action: 'openDk8sTab' },
      /* The probe fires on open and its reply writes `stage`. Seeding before
         it lands means the fixture is overwritten and every screen parks on
         the setup prompt — so the seed waits for the probe to finish. */
      { action: 'wait', ms: 1500 },
      { action: 'seedDk8sState', dk8sPatch: { ...WITH_POD, detailTab: 'explorer' } },
      /* The grid calls `startWatch()` when it mounts and the reply arrives
         with an empty pod list, wiping the fixture. So it goes in again
         once the watch has settled — the second write is the one the
         capture sees. */
      { action: 'wait', ms: 1200 },
      { action: 'seedDk8sState', dk8sPatch: { ...WITH_POD, detailTab: 'explorer' } },
      { action: 'wait', ms: 1800 },
    ],
  },
  {
    id: 'dk8s-doctor',
    label: 'dk8s — Doctor',
    explanation:
      'The diagnostics tab: collect a heap dump, a thread dump or a JFR recording from the running container and hand it straight to the analyzer, without a manual kubectl cp round trip.',
    directives: [
      { action: 'closeAllTabs' },
      { action: 'openDk8sTab' },
      /* The probe fires on open and its reply writes `stage`. Seeding before
         it lands means the fixture is overwritten and every screen parks on
         the setup prompt — so the seed waits for the probe to finish. */
      { action: 'wait', ms: 1500 },
      { action: 'seedDk8sState', dk8sPatch: { ...WITH_POD, detailTab: 'doctor' } },
      /* The grid calls `startWatch()` when it mounts and the reply arrives
         with an empty pod list, wiping the fixture. So it goes in again
         once the watch has settled — the second write is the one the
         capture sees. */
      { action: 'wait', ms: 1200 },
      { action: 'seedDk8sState', dk8sPatch: { ...WITH_POD, detailTab: 'doctor' } },
      { action: 'wait', ms: 1800 },
    ],
  },
  {
    id: 'dk8s-artifacts',
    label: 'dk8s — Artifacts',
    explanation:
      'Everything collected from the cluster so far — heap dumps, thread dumps, JFR recordings, archived logs — with the pod and moment each came from, so a dump is still identifiable a week later.',
    directives: [
      { action: 'closeAllTabs' },
      { action: 'openDk8sTab' },
      /* The probe fires on open and its reply writes `stage`. Seeding before
         it lands means the fixture is overwritten and every screen parks on
         the setup prompt — so the seed waits for the probe to finish. */
      { action: 'wait', ms: 1500 },
      { action: 'seedDk8sState', dk8sPatch: { ...CONNECTED, panel: 'artifacts' } },
      /* The grid calls `startWatch()` when it mounts and the reply arrives
         with an empty pod list, wiping the fixture. So it goes in again
         once the watch has settled — the second write is the one the
         capture sees. */
      { action: 'wait', ms: 1200 },
      { action: 'seedDk8sState', dk8sPatch: { ...CONNECTED, panel: 'artifacts' } },
      { action: 'wait', ms: 1500 },
    ],
  },
  {
    id: 'dk8s-search',
    label: 'dk8s — Quick Search',
    explanation:
      'One query across every selected pod, with the live half read through kubectl and the archive half read off a mounted volume — reported as separate rows per pod because they are two different bodies of text. Each row says what was scanned, what matched, and whether the count was capped.',
    directives: [
      { action: 'closeAllTabs' },
      { action: 'openDk8sTab' },
      { action: 'wait', ms: 1500 },
      { action: 'seedDk8sState', dk8sPatch: { ...CONNECTED, view: 'cards', detail: undefined } },
      { action: 'wait', ms: 1200 },
      { action: 'seedDk8sState', dk8sPatch: { ...CONNECTED, view: 'cards', detail: undefined } },
      /* The dialog belongs to the grid, so the grid has to be on screen and
         settled before the search store is told it is open. */
      { action: 'wait', ms: 800 },
      { action: 'seedDk8sSearch', searchPatch: SEARCH_STATE },
      { action: 'wait', ms: 1400 },
    ],
  },
  {
    id: 'dk8s-search-history',
    label: 'dk8s — Recent searches',
    explanation:
      'A search is a query and a set of pods, and the box remembers both. Focusing it drops the recent searches down inside the field — the same gesture a URL bar has — and picking one restores the query and re-picks the pods it ran over, skipping any that are gone. Logs and Files keep separate lists.',
    directives: [
      { action: 'closeAllTabs' },
      { action: 'openDk8sTab' },
      { action: 'wait', ms: 1500 },
      { action: 'seedDk8sState', dk8sPatch: { ...CONNECTED, view: 'cards', detail: undefined } },
      { action: 'wait', ms: 1200 },
      { action: 'seedDk8sState', dk8sPatch: { ...CONNECTED, view: 'cards', detail: undefined } },
      { action: 'wait', ms: 800 },
      { action: 'seedDk8sSearch', searchPatch: { ...SEARCH_STATE, groups: [], archiveSearched: false } },
      { action: 'wait', ms: 1000 },
      /* `type` focuses the field before it writes, and the empty string is the
         state this screen is about: nothing typed yet, and the list of what
         was run before under the box. */
      { action: 'type', selector: 'input[placeholder^="Search across the selected pods"]', text: '' },
      { action: 'wait', ms: 1200 },
    ],
  },
];

suite('Daakia Wiki Capture — dk8s', () => {
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
      this.timeout(25_000);
      const html = await runCapture(MainPanel, screen.directives);
      if (html.length < 200) throw new Error(`${screen.id}: captured HTML looks too small (${html.length} chars)`);
      const file = `${screen.id}.html`;
      fs.writeFileSync(path.join(OUT_DIR, file), html, 'utf-8');
      manifest.push({ id: screen.id, label: screen.label, explanation: screen.explanation, file });
    });
  }

  // Merged, not overwritten — a filtered run must not delete the entries it
  // did not touch.
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
