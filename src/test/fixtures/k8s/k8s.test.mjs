/**
 * dk8s M1 tests — the runner, the classifier, and the context services.
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

rmSync(dir, { recursive: true, force: true });
console.log(
  failures === 0
    ? `\ndk8s M1 holds.${skipped ? ` (${skipped} skipped)` : ''}`
    : `\n${failures} check(s) FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);
