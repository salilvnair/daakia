/**
 * dk8s tests — the runner, the classifier, the context services, and the watch.
 *
 * Two layers in one file, deliberately:
 *
 *   PURE      the JSON splitter, classification, workload keys, the production
 *             heuristic. No cluster, always runs, fast.
 *   LIVE      contexts, reachability, namespaces against whatever cluster is
 *             actually configured. Skips itself with a message when there is
 *             none, so this never blocks someone without kubectl.
 *
 * The live layer matters because the interesting failures here are
 * environmental. Probing a real cluster before any of this was written is what
 * found that the JRE images carry no jcmd — a config-object assertion would
 * have happily agreed with the wrong design.
 *
 * Run: node src/test/fixtures/k8s/k8s.test.mjs
 */
import { strict as assert } from 'assert';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';

const dir = mkdtempSync(join(tmpdir(), 'dk8s-test-'));
const entry = join(dir, 'entry.ts');
const bundle = join(dir, 'bundle.cjs');
const abs = (p) => JSON.stringify(resolve(p));

writeFileSync(entry, [
  `export * from ${abs('src/services/k8s/kubectl.ts')};`,
  `export * from ${abs('src/services/k8s/kube-context.ts')};`,
  `export * from ${abs('src/services/k8s/pod-classify.ts')};`,
  `export * from ${abs('src/services/k8s/k8s-watch.ts')};`,
  `export * from ${abs('src/services/k8s/k8s-log-stream.ts')};`,
  `export * from ${abs('src/services/k8s/k8s-artifacts.ts')};`,
  `export * from ${abs('src/services/k8s/k8s-logs.ts')};`,
].join('\n'));

const esbuild = await import(pathToFileURL(resolve('node_modules/esbuild/lib/main.js')).href);
await esbuild.build({
  entryPoints: [entry], bundle: true, platform: 'node',
  format: 'cjs', outfile: bundle, logLevel: 'error',
});

const k8s = createRequire(import.meta.url)(bundle);
const {
  createJsonObjectSplitter, probeEnvironment, run,
  listContexts, checkReachable, listNamespaces, looksLikeProduction,
  classifyFromSpec, workloadKey, availableActions, probeCapabilities,
  toPodSummary, watchPods, topPods,
  levelOf, parseLine, streamLogs,
  collectArtifact, extractLastThreadDump, decodeProcNetTcp, artifactName,
  logFileName,
} = k8s;

let failures = 0;
let skipped = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); }
  catch (err) { failures++; console.error(`  FAIL  ${name}\n        ${err.message}`); }
};
const checkAsync = async (name, fn) => {
  try { await fn(); console.log(`  PASS  ${name}`); }
  catch (err) { failures++; console.error(`  FAIL  ${name}\n        ${err.message}`); }
};
const skip = (name, why) => { skipped++; console.log(`  SKIP  ${name}  (${why})`); };

// ── The watch stream splitter ───────────────────────────────────────────────
console.log('watch stream parsing');

check('splits concatenated objects that arrive in one chunk', () => {
  const seen = [];
  const feed = createJsonObjectSplitter(v => seen.push(v));
  feed('{"type":"ADDED","object":{"a":1}}{"type":"MODIFIED","object":{"a":2}}');
  assert.equal(seen.length, 2);
  assert.equal(seen[0].type, 'ADDED');
  assert.equal(seen[1].object.a, 2);
});

check('reassembles an object split across chunk boundaries', () => {
  // The real failure mode: kubectl writes 64KB at a time, so a pod with a long
  // status block is routinely torn in half. A newline split loses it silently.
  const seen = [];
  const feed = createJsonObjectSplitter(v => seen.push(v));
  const whole = JSON.stringify({ type: 'ADDED', object: { name: 'x'.repeat(500) } });
  for (let i = 0; i < whole.length; i += 37) feed(whole.slice(i, i + 37));
  assert.equal(seen.length, 1);
  assert.equal(seen[0].object.name.length, 500);
});

check('is not fooled by braces inside strings', () => {
  const seen = [];
  const feed = createJsonObjectSplitter(v => seen.push(v));
  feed('{"msg":"a { brace } in a string","n":1}{"msg":"second","n":2}');
  assert.equal(seen.length, 2);
  assert.equal(seen[0].msg, 'a { brace } in a string');
  assert.equal(seen[1].n, 2);
});

check('is not fooled by an escaped quote before a brace', () => {
  const seen = [];
  const feed = createJsonObjectSplitter(v => seen.push(v));
  feed('{"msg":"ends with a quote \\" then { and }","n":1}{"n":2}');
  assert.equal(seen.length, 2, 'an escaped quote ended the string early');
  assert.equal(seen[1].n, 2);
});

check('a malformed object does not kill the stream', () => {
  const seen = [];
  const feed = createJsonObjectSplitter(v => seen.push(v));
  feed('{"broken": }{"n":2}');
  assert.equal(seen.length, 1, 'the good object after a bad one was lost');
  assert.equal(seen[0].n, 2);
});

// ── Classification ──────────────────────────────────────────────────────────
console.log('\nruntime classification');

const podOf = (over = {}) => ({
  metadata: { name: 'orders-api-7d9f8b6c4-x2ktp', ...over.metadata },
  spec: { containers: [{ name: 'app', ...over.container }] },
});

check('recognises a JRE image as java', () => {
  const t = classifyFromSpec(podOf({ container: { image: 'eclipse-temurin:21-jre' } }));
  assert.equal(t.runtime, 'java');
  assert.equal(t.detectedFrom, 'image');
});

check('recognises python from the image', () => {
  assert.equal(classifyFromSpec(podOf({ container: { image: 'python:3.12-slim' } })).runtime, 'python');
});

check('falls back to the command when the image says nothing', () => {
  const t = classifyFromSpec(podOf({ container: { image: 'registry.internal/app:1.4', command: ['java', '-jar', 'app.jar'] } }));
  assert.equal(t.runtime, 'java');
  assert.equal(t.detectedFrom, 'command');
});

check('says unknown rather than guessing', () => {
  // Postgres and Mongo must land here: offering a heap dump on a database
  // would be a confident wrong answer.
  assert.equal(classifyFromSpec(podOf({ container: { image: 'postgres:16-alpine' } })).runtime, 'unknown');
  assert.equal(classifyFromSpec(podOf({ container: { image: 'mongo:7' } })).runtime, 'unknown');
});

check('an explicit label beats every heuristic', () => {
  const t = classifyFromSpec(podOf({
    metadata: { labels: { 'dk8s.daakia/runtime': 'python' } },
    container: { image: 'eclipse-temurin:21-jre' },
  }));
  assert.equal(t.runtime, 'python');
  assert.equal(t.confidence, 1);
});

console.log('\nworkload keys');

check('both replicas of a Deployment share one key', () => {
  // This is what makes a runtime tag survive a rollout. Keyed on the pod name,
  // every tag would evaporate on the next deploy and the user would re-tag
  // forever, quietly losing faith in the feature.
  const mk = (name) => ({
    metadata: { name, ownerReferences: [{ kind: 'ReplicaSet', name: 'orders-api-7d9f8b6c4' }] },
  });
  const a = workloadKey('ctx', 'ns', mk('orders-api-7d9f8b6c4-x2ktp'));
  const b = workloadKey('ctx', 'ns', mk('orders-api-7d9f8b6c4-mn41q'));
  assert.equal(a, b);
  assert.equal(a, 'ctx/ns/Deployment/orders-api');
});

check('a new ReplicaSet after a deploy keeps the same key', () => {
  const before = workloadKey('ctx', 'ns', {
    metadata: { name: 'orders-api-7d9f8b6c4-x2ktp', ownerReferences: [{ kind: 'ReplicaSet', name: 'orders-api-7d9f8b6c4' }] },
  });
  const after = workloadKey('ctx', 'ns', {
    metadata: { name: 'orders-api-9f2a1c3b5-qq82p', ownerReferences: [{ kind: 'ReplicaSet', name: 'orders-api-9f2a1c3b5' }] },
  });
  assert.equal(before, after, 'the tag would be lost on every rollout');
});

check('a StatefulSet keeps its own kind', () => {
  const k = workloadKey('ctx', 'ns', {
    metadata: { name: 'ledger-0', ownerReferences: [{ kind: 'StatefulSet', name: 'ledger' }] },
  });
  assert.equal(k, 'ctx/ns/StatefulSet/ledger');
});

console.log('\nproduction heuristic');

check('matches the obvious names', () => {
  assert.equal(looksLikeProduction('aks-prod-eu', 'aks-prod-eu'), true);
  assert.equal(looksLikeProduction('prd-cluster', ''), true);
  assert.equal(looksLikeProduction('eu-live-01', ''), true);
});

check('does not match dev or staging', () => {
  assert.equal(looksLikeProduction('docker-desktop', 'docker-desktop'), false);
  assert.equal(looksLikeProduction('staging', 'staging'), false);
  assert.equal(looksLikeProduction('reproduction-tests', ''), false, '"reproduction" contains "produc"');
});

// ── Pod summary mapping ─────────────────────────────────────────────────────
console.log('\npod summary');

check('surfaces OOMKilled from the PREVIOUS run, not just the current state', () => {
  // A pod that was OOMKilled and restarted is Running again. The evidence is
  // in lastState, and a grid that only reads current state calls it healthy.
  const p = toPodSummary({
    metadata: { name: 'x', namespace: 'ns', uid: 'u1' },
    spec: { containers: [{ image: 'app:1' }] },
    status: {
      phase: 'Running',
      containerStatuses: [{
        name: 'app', ready: true, restartCount: 3, image: 'app:1',
        lastState: { terminated: { reason: 'OOMKilled', finishedAt: '2026-08-29T11:59:00Z' } },
      }],
    },
  });
  assert.equal(p.reason, 'OOMKilled');
  assert.equal(p.restarts, 3);
  assert.equal(p.lastRestartAt, '2026-08-29T11:59:00Z');
  assert.equal(p.healthy, false, 'a pod OOMKilled minutes ago is not healthy');
});

check('a clean exit does not masquerade as a failure reason', () => {
  const p = toPodSummary({
    metadata: { name: 'x', namespace: 'ns', uid: 'u2' },
    spec: { containers: [{ image: 'app:1' }] },
    status: {
      phase: 'Running',
      containerStatuses: [{
        name: 'app', ready: true, restartCount: 1, image: 'app:1',
        lastState: { terminated: { reason: 'Completed' } },
      }],
    },
  });
  assert.equal(p.reason, undefined);
  assert.equal(p.healthy, true);
});

check('a deleting pod reads as Terminating, not Running', () => {
  const p = toPodSummary({
    metadata: { name: 'x', namespace: 'ns', uid: 'u3', deletionTimestamp: '2026-08-29T12:00:00Z' },
    spec: { containers: [{ image: 'app:1' }] },
    status: { phase: 'Running', containerStatuses: [{ name: 'app', ready: true, restartCount: 0 }] },
  });
  assert.equal(p.phase, 'Terminating');
  assert.equal(p.deleting, true);
  assert.equal(p.healthy, false);
});

check('derives the Deployment from a ReplicaSet owner', () => {
  const p = toPodSummary({
    metadata: {
      name: 'orders-api-7d9f8b6c4-x2ktp', namespace: 'ns', uid: 'u4',
      ownerReferences: [{ kind: 'ReplicaSet', name: 'orders-api-7d9f8b6c4' }],
    },
    spec: { containers: [{ image: 'app:1' }] },
    status: { phase: 'Running', containerStatuses: [] },
  });
  assert.deepEqual(p.workload, { kind: 'Deployment', name: 'orders-api' });
});

// ── Live cluster ────────────────────────────────────────────────────────────
console.log('\nlive cluster');

const env = await probeEnvironment();
if (!env.present) {
  skip('everything below', 'kubectl not found');
} else {
  await checkAsync('finds kubectl and reports a version', () => {
    assert.ok(env.clientVersion, 'no client version reported');
  });

  const list = await listContexts();
  await checkAsync('reads contexts without touching the kubeconfig', () => {
    assert.ok(Array.isArray(list.contexts));
    if (list.contexts.length) {
      const c = list.contexts[0];
      assert.ok(c.name, 'a context has no name');
      assert.equal(typeof c.current, 'boolean');
    }
  });

  const ctx = list.current;
  if (!ctx) {
    skip('reachability and namespaces', 'no current context');
  } else {
    const reach = await checkReachable(ctx);
    if (!reach.reachable) {
      skip('namespace listing', `context ${ctx} unreachable: ${reach.error}`);
    } else {
      await checkAsync(`reaches ${ctx} and reports a server version`, () => {
        assert.ok(reach.serverVersion, 'reachable but no server version');
      });

      const ns = await listNamespaces(ctx);
      await checkAsync('lists namespaces, or reports the refusal honestly', () => {
        if (ns.forbidden) {
          // Not a failure. This is the path a locked-down cluster takes and it
          // must offer a fallback rather than dead-ending.
          assert.ok(ns.fallback, 'forbidden but no fallback namespace offered');
        } else {
          assert.ok(ns.namespaces.length > 0, 'no namespaces and not forbidden');
        }
      });

      // The fixture namespace is where the interesting states live. Everything
      // below only runs if it has been deployed.
      const hasFixture = ns.namespaces.includes('dk8s-test');
      if (!hasFixture) {
        skip('fixture assertions', 'dk8s-test namespace not deployed');
      } else {
        const res = await run(['--context', ctx, '-n', 'dk8s-test', 'get', 'pods', '-o', 'json']);
        const items = JSON.parse(res.stdout).items ?? [];

        await checkAsync('classifies the real fixture pods correctly', () => {
          const byName = (frag) => items.find(p => p.metadata.name.startsWith(frag));
          const pg = byName('postgres');
          if (pg) assert.equal(classifyFromSpec(pg).runtime, 'unknown', 'postgres must not look like an app runtime');
          const java = byName('zp-backend-busy');
          if (java) assert.equal(classifyFromSpec(java).runtime, 'java');
        });

        await checkAsync('both leaky replicas share one workload key', () => {
          const replicas = items.filter(p => p.metadata.name.startsWith('zp-backend-leaky'));
          if (replicas.length < 2) return;   // deployment may be mid-rollout
          const keys = new Set(replicas.map(p => workloadKey(ctx, 'dk8s-test', p)));
          assert.equal(keys.size, 1, `replicas produced ${keys.size} keys: ${[...keys].join(', ')}`);
        });

        const jdk = items.find(p => p.metadata.name.startsWith('jdk-leaky') && p.status?.phase === 'Running');
        if (!jdk) {
          skip('JDK capability probe', 'jdk-leaky not running');
        } else {
          const caps = await probeCapabilities(ctx, 'dk8s-test', jdk.metadata.name, 'leak');
          await checkAsync('the JDK pod reports jcmd, so heap dumps are offerable', () => {
            assert.ok(!caps.unreachable, `probe failed: ${caps.unreachable}`);
            assert.equal(caps.jcmd, true, 'jcmd not found in a JDK image');
            assert.ok(caps.targetPid, 'no JVM pid found');
            const actions = availableActions('java', caps);
            const heap = actions.find(a => a.id === 'heapdump');
            assert.equal(heap.available, true, `heap dump not offered: ${heap.reason}`);
          });
        }

        const jre = items.find(p => p.metadata.name.startsWith('zp-backend-busy') && p.status?.phase === 'Running');
        if (!jre) {
          skip('JRE capability probe', 'zp-backend-busy not running');
        } else {
          const caps = await probeCapabilities(ctx, 'dk8s-test', jre.metadata.name, 'zp-backend');
          await checkAsync('a JRE pod offers SIGQUIT and JFR but not a heap dump', () => {
            assert.ok(!caps.unreachable, `probe failed: ${caps.unreachable}`);
            // This is the finding that reshaped M5: JRE images are the common
            // production case and they carry no JDK tooling at all.
            assert.equal(caps.jcmd, false, 'a JRE image should not have jcmd');
            assert.equal(caps.jfr, true, 'jfr ships in the JRE and should be found');
            const actions = availableActions('java', caps);
            const byId = Object.fromEntries(actions.map(a => [a.id, a]));
            assert.equal(byId.heapdump.available, false);
            assert.equal(byId['threaddump-sigquit'].available, true, 'the zero-tooling fallback must be offered');
            assert.equal(byId.jfr.available, true);
            assert.match(byId.heapdump.reason, /jattach|jcmd|jmap/, 'a disabled action must say why');
          });
        }

        // The watch is the heart of M2 and the easiest thing to get subtly
        // wrong, so it is exercised against the real stream rather than mocked.
        await checkAsync('watches the namespace and delivers a snapshot', async () => {
          const seen = { snapshot: null, events: 0, statuses: [] };
          const handle = watchPods(ctx, 'dk8s-test', {
            onSnapshot: (pods) => { seen.snapshot = pods; },
            onEvent: () => { seen.events++; },
            onStatus: (st) => { seen.statuses.push(st); },
          });
          // The fixture namespace has pods restarting constantly, so events
          // should flow; the snapshot must arrive regardless.
          await new Promise(r => setTimeout(r, 6_000));
          handle.stop();

          assert.ok(seen.snapshot, 'no snapshot within 6s');
          assert.ok(seen.snapshot.length > 0, 'snapshot was empty');
          assert.ok(seen.statuses.includes('connected'), `never reported connected: ${seen.statuses.join(',')}`);
          const sample = seen.snapshot[0];
          assert.ok(sample.uid, 'pod summary has no uid to key on');
          assert.equal(typeof sample.healthy, 'boolean');
        });

        await checkAsync('stopping a watch actually stops it', async () => {
          let after = 0;
          const handle = watchPods(ctx, 'dk8s-test', {
            onSnapshot: () => {},
            onEvent: () => { after++; },
            onStatus: () => {},
          });
          await new Promise(r => setTimeout(r, 3_000));
          handle.stop();
          const at = after;
          await new Promise(r => setTimeout(r, 2_500));
          // A leaked watch keeps emitting and keeps a kubectl child alive.
          assert.equal(after, at, 'events kept arriving after stop()');
        });

        await checkAsync('reports metrics honestly when metrics-server is absent', async () => {
          const usage = await topPods(ctx, 'dk8s-test');
          // null means "no metrics-server", which is normal and must not be
          // reported as an error. An array means it is installed.
          assert.ok(usage === null || Array.isArray(usage));
          if (Array.isArray(usage) && usage.length) {
            assert.equal(typeof usage[0].memBytes, 'number');
            assert.ok(usage[0].memBytes > 0, 'parsed 0 bytes from kubectl top');
          }
        });

        const noShell = items.find(p => p.metadata.name.startsWith('no-shell') && p.status?.phase === 'Running');
        if (!noShell) {
          skip('distroless probe', 'no-shell not running');
        } else {
          const caps = await probeCapabilities(ctx, 'dk8s-test', noShell.metadata.name, 'pause');
          await checkAsync('a shell-less container is reported as such, not as an error', () => {
            assert.ok(caps.unreachable, 'expected the probe to report no shell');
            assert.match(caps.unreachable, /no shell/i);
          });
        }

        const broken = items.find(p =>
          (p.status?.containerStatuses ?? []).some(c => c.state?.waiting || c.state?.terminated));
        if (!broken) {
          skip('crashlooping probe', 'no broken pod present');
        } else {
          const caps = await probeCapabilities(ctx, 'dk8s-test', broken.metadata.name,
            broken.spec.containers[0].name);
          await checkAsync('a crashlooping pod is NOT mistaken for distroless', () => {
            // kubectl says "container not found" for a pod that is not running,
            // which used to match the /not found/ that meant "this shell is
            // absent" — so a broken pod was confidently reported as distroless.
            if (caps.unreachable) {
              assert.doesNotMatch(caps.unreachable, /^no shell/i,
                `reported "${caps.unreachable}" for a pod that is simply not running`);
            }
          });
        }
      }
    }
  }
}

// ── Log streaming and artifacts: the M3–M6 surface ──────────────────────────
//
// These need a running pod, so they gate on the fixture namespace being up.
// Everything above proves the pieces in isolation; this proves they work
// against a real container, which is where every interesting failure has been.
console.log('\nlog streaming and artifacts');

const FIXTURE_CTX = 'docker-desktop';
const FIXTURE_NS = 'dk8s-test';

async function fixturePods() {
  const res = await run(['--context', FIXTURE_CTX, '-n', FIXTURE_NS, 'get', 'pods', '-o', 'json'],
                        { timeoutMs: 30_000 });
  if (!res.ok) return [];
  try { return JSON.parse(res.stdout).items ?? []; } catch { return []; }
}

const livePods = env.present ? await fixturePods() : [];
const runningPods = livePods.filter(p => p.status?.phase === 'Running');
const named = (needle) => runningPods.find(p => p.metadata.name.startsWith(needle))?.metadata.name;

if (!runningPods.length) {
  skip('log streaming and artifacts', 'no running pods in ' + FIXTURE_CTX + '/' + FIXTURE_NS);
} else {
  const chatty = named('chatty-logger') ?? runningPods[0].metadata.name;
  const destDir = join(dir, 'artifacts');

  await checkAsync('streams a live pod and parses its lines', async () => {
    const lines = await new Promise((resolve, reject) => {
      const seen = [];
      let handle;
      const timer = setTimeout(() => { handle?.stop(); resolve(seen); }, 8000);
      handle = streamLogs(FIXTURE_CTX, FIXTURE_NS, chatty, { tailLines: 40 }, {
        onLines: (batch) => {
          seen.push(...batch);
          if (seen.length >= 20) { clearTimeout(timer); handle.stop(); resolve(seen); }
        },
        onStatus: (status, detail) => {
          if (status === 'error') { clearTimeout(timer); handle?.stop(); reject(new Error(detail)); }
        },
        onDropped: () => {},
      });
    });

    assert.ok(lines.length > 0, 'no lines from ' + chatty);
    // Timestamps are the whole reason --timestamps is on by default: without
    // them the range filters and the model's sense of timing are both gone.
    assert.ok(lines.some(l => typeof l.ts === 'number'), 'no line carried a parsed timestamp');
    // seq must strictly increase, or the webview's React keys collide and rows
    // are silently reused for different lines.
    for (let i = 1; i < lines.length; i++) {
      assert.ok(lines[i].seq > lines[i - 1].seq,
        'seq went backwards at ' + i + ': ' + lines[i - 1].seq + ' then ' + lines[i].seq);
    }
  });

  await checkAsync('a stopped stream really stops', async () => {
    let stopped = false;
    let after = 0;
    const handle = streamLogs(FIXTURE_CTX, FIXTURE_NS, chatty, { tailLines: 10 }, {
      onLines: () => { if (stopped) after++; },
      onStatus: () => {}, onDropped: () => {},
    });
    await new Promise(r => setTimeout(r, 2500));
    handle.stop();
    stopped = true;
    await new Promise(r => setTimeout(r, 2500));
    assert.equal(after, 0, after + ' batches arrived after stop()');
  });

  const jdk = named('jdk-leaky');
  const jre = named('zp-backend-hung');

  if (!jdk) {
    skip('jcmd artifacts', 'no jdk-leaky pod');
  } else {
    const jdkCaps = await probeCapabilities(FIXTURE_CTX, FIXTURE_NS, jdk);

    await checkAsync('collects a thread dump over stdout, with no file copy', async () => {
      const r = await collectArtifact(
        { context: FIXTURE_CTX, namespace: FIXTURE_NS, pod: jdk, targetPid: jdkCaps.targetPid },
        { kind: 'threaddump', destDir });
      assert.ok(r.ok, 'collect failed: ' + r.error);
      assert.match(r.text ?? '', /Full thread dump/, 'no dump header in the output');
      // Written to disk as well as returned — evidence has to survive closing
      // the panel.
      assert.ok(r.file, 'no file was written');
      assert.ok((r.bytes ?? 0) > 500, 'suspiciously small: ' + r.bytes + ' bytes');
    });

    await checkAsync('a class histogram finds the planted leak', async () => {
      const r = await collectArtifact(
        { context: FIXTURE_CTX, namespace: FIXTURE_NS, pod: jdk, targetPid: jdkCaps.targetPid },
        { kind: 'histogram', destDir });
      assert.ok(r.ok, 'collect failed: ' + r.error);
      // jcmd echoes the pid as "1:" on its own line before the table, so the
      // shape has to be matched properly rather than just the leading index.
      const rows = (r.text ?? '').split('\n')
        .filter(l => /^\s*\d+:\s+\d+\s+\d+\s/.test(l));
      assert.ok(rows.length > 5, 'histogram has almost no rows');
      // The fault injector holds a large byte[]; it has to dominate, or the
      // fixture is not doing what the rest of this suite assumes it is.
      const bytes = Number(rows[0].trim().split(/\s+/)[2]);
      assert.ok(bytes > 20 * 1024 * 1024,
        'top class is only ' + bytes + ' bytes — is the leak fixture running?');
    });

    await checkAsync('a connection snapshot comes back readable, not raw hex', async () => {
      const r = await collectArtifact(
        { context: FIXTURE_CTX, namespace: FIXTURE_NS, pod: jdk },
        { kind: 'conns', destDir });
      assert.ok(r.ok, 'collect failed: ' + r.error);
      // Either ss output, or the decoded /proc/net/tcp. Never the raw hex,
      // which is exactly what the decoder exists to prevent.
      assert.doesNotMatch(r.text ?? '', /^\s*\d+: [0-9A-F]{8}:[0-9A-F]{4} /m,
        'raw /proc/net/tcp hex leaked through undecoded');
    });
  }

  if (!jre) {
    skip('SIGQUIT thread dump', 'no zp-backend-hung pod');
  } else {
    const jreCaps = await probeCapabilities(FIXTURE_CTX, FIXTURE_NS, jre);

    await checkAsync('a JRE image offers SIGQUIT and JFR but not the jcmd paths', () => {
      assert.equal(jreCaps.jcmd, false, 'this fixture is supposed to be JRE-only');
      const actions = availableActions('java', jreCaps);
      const by = (id) => actions.find(a => a.id === id);
      assert.equal(by('threaddump').available, false, 'offered jcmd on a JRE image');
      assert.equal(by('heapdump').available, false, 'offered a heap dump with no jcmd or jmap');
      assert.equal(by('threaddump-sigquit').available, true, 'did not offer SIGQUIT');
    });

    await checkAsync('SIGQUIT produces a dump carrying the modern socket frame', async () => {
      const r = await collectArtifact(
        { context: FIXTURE_CTX, namespace: FIXTURE_NS, pod: jre, targetPid: jreCaps.targetPid },
        { kind: 'threaddump-sigquit', destDir });
      assert.ok(r.ok, 'collect failed: ' + r.error);
      assert.match(r.text ?? '', /Full thread dump/, 'no dump appeared in the log');
      // The hung fixture holds threads in a socket read. On JDK 13+ that reads
      // as NioSocketImpl; if this ever matches SocketInputStream instead, the
      // fixture was rebuilt on an ancient JDK and the suspect markers — which
      // are written around exactly this split — need revisiting.
      assert.match(r.text ?? '', /sun\.nio\.ch\.NioSocketImpl/,
        'the hung fixture is not actually blocked in a socket read');
    });
  }

  await checkAsync('an unknown artifact kind fails loudly rather than silently', async () => {
    const r = await collectArtifact(
      { context: FIXTURE_CTX, namespace: FIXTURE_NS, pod: runningPods[0].metadata.name },
      { kind: 'not-a-real-thing', destDir });
    assert.equal(r.ok, false, 'an unknown kind reported success');
    assert.match(r.error ?? '', /Unknown artifact/);
  });
}

rmSync(dir, { recursive: true, force: true });
console.log(
  failures === 0
    ? `\ndk8s holds.${skipped ? ` (${skipped} skipped)` : ''}`
    : `\n${failures} check(s) FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);
