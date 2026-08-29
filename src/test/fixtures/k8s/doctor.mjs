/**
 * dk8s:doctor — the standing smoke test.
 *
 * Runs the whole capability probe against a real cluster and prints what dk8s
 * would be able to offer on every pod it can see. That table IS the bug report:
 * every wrong cell is a fix, and it is much cheaper to read than to discover
 * the same fact from a broken button three milestones later.
 *
 * It found its first bug before the UI existed. zp-backend runs on
 * eclipse-temurin:21-jre, which ships java, jfr and keytool and no jcmd,
 * jstack, jmap or python3 — so the pod_doctor payload cannot run there at all,
 * and neither could the "just call jcmd directly" fallback.
 *
 *   npm run dk8s:doctor                  # current context, all namespaces it can see
 *   npm run dk8s:doctor -- -n dk8s-test  # one namespace
 *   npm run dk8s:doctor -- --json        # machine-readable, for assertions
 *
 * Exits 0 when the probe ran, 2 when kubectl or the cluster is unusable. A pod
 * with no capabilities is a finding, not a failure — this reports, it does not
 * judge.
 */
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';

// ── Args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (...names) => {
  const i = argv.findIndex(a => names.includes(a));
  return i >= 0 ? (argv[i + 1] ?? '') : undefined;
};
const has = (...names) => argv.some(a => names.includes(a));

const nsArg = flag('-n', '--namespace');
const ctxArg = flag('-c', '--context');
const asJson = has('--json');
const noProbe = has('--no-probe');

// ── Colour, only when a human is watching ───────────────────────────────────
const tty = process.stdout.isTTY && !asJson;
const C = {
  reset: tty ? '\x1b[0m' : '', dim: tty ? '\x1b[2m' : '', bold: tty ? '\x1b[1m' : '',
  red: tty ? '\x1b[31m' : '', green: tty ? '\x1b[32m' : '',
  yellow: tty ? '\x1b[33m' : '', cyan: tty ? '\x1b[36m' : '',
};
const say = (s = '') => { if (!asJson) console.log(s); };

// ── Bundle the services so this runs as plain Node ──────────────────────────
// Same trick as proxy.test.mjs: the k8s services are free of the VS Code API
// on purpose, so they bundle and run standalone with no extension host.
const dir = mkdtempSync(join(tmpdir(), 'dk8s-doctor-'));
const entry = join(dir, 'entry.ts');
const bundle = join(dir, 'bundle.cjs');
const abs = (p) => JSON.stringify(resolve(p));

writeFileSync(entry, [
  `export * from ${abs('src/services/k8s/kubectl.ts')};`,
  `export * from ${abs('src/services/k8s/pod-classify.ts')};`,
].join('\n'));

let svc;
try {
  const esbuild = await import(pathToFileURL(resolve('node_modules/esbuild/lib/main.js')).href);
  await esbuild.build({
    entryPoints: [entry], bundle: true, platform: 'node',
    format: 'cjs', outfile: bundle, logLevel: 'error',
  });
  svc = createRequire(import.meta.url)(bundle);
} catch (err) {
  console.error(`Could not bundle the k8s services: ${err.message}`);
  process.exit(2);
}

const { probeEnvironment, run, classifyFromSpec, workloadKey, probeCapabilities, availableActions } = svc;

const report = { env: null, context: null, namespaces: [], pods: [], problems: [] };
const problem = (msg) => { report.problems.push(msg); };

// ── 1. kubectl ───────────────────────────────────────────────────────────────
say(`${C.bold}dk8s doctor${C.reset}${C.dim}  — what dk8s can actually do against this cluster${C.reset}\n`);

const env = await probeEnvironment();
report.env = env;
if (!env.present) {
  say(`${C.red}kubectl   NOT FOUND${C.reset}`);
  say(`${C.dim}  tried: ${(env.triedPaths ?? []).join(', ')}${C.reset}`);
  say(`${C.dim}  set DAAKIA_KUBECTL to an explicit path, or install it.${C.reset}`);
  if (asJson) console.log(JSON.stringify(report, null, 2));
  process.exit(2);
}
say(`${C.green}kubectl${C.reset}   ${env.clientVersion ?? 'unknown version'}   ${C.dim}${env.binary}${C.reset}`);

// ── 2. Context ───────────────────────────────────────────────────────────────
const currentCtx = ctxArg || (await run(['config', 'current-context'])).stdout.trim();
if (!currentCtx) {
  say(`${C.red}context   none selected${C.reset}`);
  problem('no current context');
  if (asJson) console.log(JSON.stringify(report, null, 2));
  process.exit(2);
}
report.context = currentCtx;

const ver = await run(['--context', currentCtx, 'version', '-o', 'json', '--request-timeout=8s'], { timeoutMs: 15_000 });
let serverVersion;
try { serverVersion = JSON.parse(ver.stdout)?.serverVersion?.gitVersion; } catch { /* older kubectl */ }
if (!ver.ok && !serverVersion) {
  say(`${C.red}context${C.reset}   ${currentCtx}   ${C.red}unreachable${C.reset}`);
  say(`${C.dim}  ${(ver.stderr || ver.failure || '').split('\n')[0]}${C.reset}`);
  problem(`context ${currentCtx} is unreachable`);
  if (asJson) console.log(JSON.stringify(report, null, 2));
  process.exit(2);
}
say(`${C.green}context${C.reset}   ${currentCtx}   ${C.dim}server ${serverVersion ?? 'unknown'}${C.reset}`);

// ── 3. Namespaces ────────────────────────────────────────────────────────────
// Cluster-scoped list is forbidden in plenty of real clusters. That is a
// routing problem, not a dead end — dk8s must fall back, so the doctor does too.
let namespaces = [];
if (nsArg) {
  namespaces = [nsArg];
  say(`${C.green}namespace${C.reset} ${nsArg} ${C.dim}(explicit)${C.reset}`);
} else {
  const nsRes = await run(['--context', currentCtx, 'get', 'ns', '-o', 'name']);
  if (nsRes.ok) {
    namespaces = nsRes.stdout.split('\n').map(l => l.trim().replace(/^namespace\//, '')).filter(Boolean);
    say(`${C.green}namespaces${C.reset} ${namespaces.length} visible`);
  } else {
    const denied = /forbidden/i.test(nsRes.stderr);
    say(`${C.yellow}namespaces${C.reset} ${denied ? 'listing forbidden (normal in locked-down clusters)' : 'list failed'}`);
    if (denied) problem('cannot list namespaces — dk8s must offer a manual entry field');
    const def = (await run(['--context', currentCtx, 'config', 'view', '--minify', '-o', 'jsonpath={..namespace}'])).stdout.trim();
    namespaces = def ? [def] : ['default'];
    say(`${C.dim}  falling back to: ${namespaces.join(', ')}${C.reset}`);
  }
}
report.namespaces = namespaces;

// ── 4. Metrics ───────────────────────────────────────────────────────────────
const top = await run(['--context', currentCtx, 'top', 'pods', '-n', namespaces[0], '--no-headers'], { timeoutMs: 15_000 });
const metrics = top.ok;
say(`${metrics ? C.green + 'metrics' : C.yellow + 'metrics'}${C.reset}   ${
  metrics ? 'metrics-server present — usage column available'
          : 'ABSENT — usage column must hide itself, this is normal not an error'}`);
report.metricsServer = metrics;

// ── 5. Pods ──────────────────────────────────────────────────────────────────
say('');
const targetNs = nsArg ? [nsArg] : namespaces.filter(n => !/^kube-|^local-path/.test(n));

for (const ns of targetNs) {
  const res = await run(['--context', currentCtx, '-n', ns, 'get', 'pods', '-o', 'json'], { timeoutMs: 30_000 });
  if (!res.ok) {
    say(`${C.yellow}${ns}${C.reset} ${C.dim}— cannot list pods: ${(res.stderr || '').split('\n')[0]}${C.reset}`);
    problem(`cannot list pods in ${ns}`);
    continue;
  }
  let items = [];
  try { items = JSON.parse(res.stdout).items ?? []; } catch { /* fall through */ }
  if (!items.length) continue;

  say(`${C.bold}${ns}${C.reset} ${C.dim}(${items.length} pods)${C.reset}`);

  for (const pod of items) {
    const name = pod.metadata?.name ?? '?';
    const phase = pod.status?.phase ?? '?';
    const cs = pod.status?.containerStatuses ?? [];
    const restarts = cs.reduce((n, c) => n + (c.restartCount ?? 0), 0);
    const waiting = cs.find(c => c.state?.waiting)?.state?.waiting?.reason;
    const terminated = cs.find(c => c.state?.terminated)?.state?.terminated?.reason;
    const reason = waiting || terminated || pod.status?.reason;
    const ready = `${cs.filter(c => c.ready).length}/${cs.length || 1}`;

    const tag = classifyFromSpec(pod);
    const key = workloadKey(currentCtx, ns, pod);

    const running = phase === 'Running';
    let caps = null;
    if (!noProbe && running) {
      caps = await probeCapabilities(currentCtx, ns, name, pod.spec?.containers?.[0]?.name);
    }

    const stateColor = reason && /Crash|OOM|Error|ImagePull/i.test(reason) ? C.red
      : restarts > 0 ? C.yellow : C.green;
    const state = reason ? `${reason}` : phase;

    say(`  ${stateColor}●${C.reset} ${name.padEnd(42)} ${C.dim}${ready}${C.reset} ` +
        `${stateColor}${state.padEnd(18)}${C.reset} ` +
        `${restarts ? C.yellow + '↻' + restarts : C.dim + '↻0'}${C.reset}  ` +
        `${tag.runtime === 'unknown' ? C.dim : C.cyan}${tag.runtime}${C.reset}` +
        `${C.dim}(${tag.detectedFrom})${C.reset}`);

    const podReport = {
      namespace: ns, name, phase, reason: reason ?? null, restarts, ready,
      runtime: tag.runtime, detectedFrom: tag.detectedFrom, workloadKey: key,
      image: pod.spec?.containers?.[0]?.image ?? null,
      capabilities: caps, actions: null,
    };

    if (caps) {
      if (caps.unreachable) {
        say(`      ${C.yellow}probe${C.reset} ${C.dim}${caps.unreachable}${C.reset}`);
      } else {
        const bits = [
          caps.shell ? `shell=${caps.shell}` : 'NO SHELL',
          caps.tar ? 'tar' : `${C.red}no-tar${C.reset}`,
          caps.python3 ? 'python3' : null,
          caps.jcmd ? 'jcmd' : null,
          caps.jstack ? 'jstack' : null,
          caps.jfr ? 'jfr' : null,
          caps.targetPid ? `pid=${caps.targetPid}` : null,
        ].filter(Boolean).join(' ');
        say(`      ${C.dim}${bits}${C.reset}`);

        const actions = availableActions(tag.runtime, caps);
        podReport.actions = actions;
        for (const a of actions.filter(x => x.id !== 'logs')) {
          const mark = a.available ? `${C.green}✓${C.reset}` : `${C.dim}✗${C.reset}`;
          say(`      ${mark} ${a.label.padEnd(30)} ${C.dim}${a.reason}${C.reset}`);
        }
        if (!caps.tar && tag.runtime !== 'unknown') {
          problem(`${ns}/${name}: no tar — kubectl cp will fail, must stream via exec+cat`);
        }
      }
    }
    report.pods.push(podReport);
  }
  say('');
}

// ── Summary ──────────────────────────────────────────────────────────────────
if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const probed = report.pods.filter(p => p.capabilities && !p.capabilities.unreachable);
  const java = report.pods.filter(p => p.runtime === 'java');
  const noJcmd = java.filter(p => p.capabilities && !p.capabilities.unreachable && !p.capabilities.jcmd);

  say(`${C.bold}summary${C.reset}`);
  say(`  ${report.pods.length} pods, ${probed.length} probed, ${report.pods.filter(p => p.runtime !== 'unknown').length} classified`);
  if (java.length) {
    say(`  ${java.length} java pods, ${C.yellow}${noJcmd.length} without jcmd${C.reset}` +
        (noJcmd.length ? ` ${C.dim}— heap dumps need jattach; thread dumps use SIGQUIT${C.reset}` : ''));
  }
  if (report.problems.length) {
    say(`\n${C.yellow}things dk8s has to handle${C.reset}`);
    for (const p of report.problems) say(`  · ${p}`);
  }
}

rmSync(dir, { recursive: true, force: true });
process.exit(0);
