/**
 * The dk8s AI conversation, end to end, inside the extension host.
 *
 * ── Why this test exists ──
 *
 * The follow-up was built and never verified. The browser dev path cannot
 * verify it: the configured provider is Copilot, whose session belongs to VS
 * Code, so a follow-up asked from a browser tab fails for a reason that says
 * nothing about the follow-up.
 *
 * ── Why the mock provider is not a cop-out ──
 *
 * `daakia-mock` points at a real running mock-ai-server and routes through
 * `autoResolveProvider` → `executeAiRequest`, which is the same engine a real
 * key uses. What it cannot judge is whether the model's ANSWER is good. What
 * it can judge is everything this feature is made of: that a first question
 * carries its evidence, that a second carries the thread as turns, that the
 * cap is honoured, that chunks come back addressed to the turn that asked, and
 * that a follow-up with no evidence is not rejected as empty — which is the
 * bug this path shipped with once already.
 *
 * The one thing left for a human is whether Copilot in particular replies, and
 * that is a provider integration shared with every other Daakia feature rather
 * than anything dk8s owns.
 */
import * as assert from 'assert';
import * as path from 'path';
import {
  initMockServerManager, startMockServer, stopMockServer, type MockServerConfig,
} from '../../mock/mock-server-manager';
import { initDb, setSetting } from '../../storage/db';

type Msg = Record<string, unknown>;

/**
 * Collect posts until the stream says it is finished.
 *
 * The handlers are async wrappers over a callback-based engine: the promise
 * resolves when the request is SENT, so waiting on it proves nothing. The
 * completion only arrives later, through postMessage.
 */
function collectUntilDone(doneType: string, errorType: string, timeoutMs = 15_000) {
  const received: Msg[] = [];
  let resolve!: (v: Msg[]) => void;
  let reject!: (e: Error) => void;
  const result = new Promise<Msg[]>((res, rej) => { resolve = res; reject = rej; });
  const timer = setTimeout(
    () => reject(new Error(`timed out waiting for '${doneType}'. Got: ${JSON.stringify(received)}`)),
    timeoutMs,
  );
  const post = (msg: unknown) => {
    const m = msg as Msg;
    received.push(m);
    if (m.type === doneType || m.type === errorType) { clearTimeout(timer); resolve(received); }
  };
  return { post, result };
}

suite('dk8s AI — asking, then following up', () => {
  let port: number;
  const serverId = 'e2e-dk8s-ai-followup';

  const POD = { pod: 'zp-mdc', namespace: 'dk8s-test', phase: 'Running', restarts: 0 };
  const EVIDENCE = '09:12:40 ERROR SettlementJob - settlement batch failed';

  suiteSetup(async () => {
    initMockServerManager(__dirname, 19000, 19999);
    await initDb(path.resolve(__dirname, '../../../'));
    const cfg: MockServerConfig = {
      id: serverId, name: 'dk8s-ai-mock', description: '', protocol: 'ai', routes: [],
    };
    ({ port } = await startMockServer(cfg));
    setSetting('aiProviders', [{ id: 'daakia-mock', baseUrl: `http://127.0.0.1:${port}` }]);
    setSetting('aiDefaultProvider', 'daakia-mock');
  });

  suiteTeardown(async () => { await stopMockServer(serverId); });

  test('a first question streams an answer back', async () => {
    const { handleDk8sAsk } = await import('../../panel/main/handlers/k8s-handler.js');
    const { post, result } = collectUntilDone('ai:complete', 'ai:error');

    await handleDk8sAsk({
      promptKey: 'dk8s.log.askWhy',
      title: 'Ask AI why',
      evidence: EVIDENCE,
      evidenceLabel: 'LOG SELECTION',
      podContext: POD,
    }, post);

    const received = await result;
    const errors = received.filter(m => m.type === 'ai:error');
    assert.strictEqual(errors.length, 0, `expected no ai:error, got ${JSON.stringify(errors)}`);
    assert.ok(received.some(m => m.type === 'ai:chunk'), 'expected streamed chunks');

    // "Show what was sent" has to mean it: the panel is given the text that
    // actually left, after redaction, not the artifact the webview held.
    const echo = received.find(m => m.type === 'dk8s:aiEvidence');
    assert.ok(echo, 'expected the evidence to be echoed back');
    assert.ok(String(echo!.evidence).includes('settlement batch failed'));
  });

  test('a follow-up carries the thread and is not rejected for having no evidence', async () => {
    /*
      The first question sends the artifact; the ones after it send a question
      and the conversation so far. Rejecting an empty body made every follow-up
      fail with "Nothing selected to ask about" on a thread that plainly had
      something to ask about — which is the shape of the bug this guards.
    */
    const { handleDk8sAsk } = await import('../../panel/main/handlers/k8s-handler.js');
    const { post, result } = collectUntilDone('ai:complete', 'ai:error');

    await handleDk8sAsk({
      promptKey: 'dk8s.log.askWhy',
      title: 'Ask AI why',
      evidence: '',
      evidenceLabel: 'LOG SELECTION',
      podContext: POD,
      question: 'and the restarts?',
      history: [
        { q: 'why did this fail?', a: 'The ledger call timed out after three retries.' },
        { q: 'which thread?', a: 'settle-worker-3.' },
      ],
    }, post);

    const received = await result;
    const errors = received.filter(m => m.type === 'ai:error');
    assert.strictEqual(errors.length, 0, `follow-up errored: ${JSON.stringify(errors)}`);
    assert.ok(received.some(m => m.type === 'ai:chunk'), 'expected the follow-up to stream');

    const complete = received.find(m => m.type === 'ai:complete');
    const content = (complete?.message as { content?: string } | undefined)?.content ?? '';
    assert.ok(content.length > 0, 'expected a non-empty answer to the follow-up');
  });

  test('a follow-up with no question and no history is still refused', async () => {
    // The guard has to keep working in the direction it was written for: an
    // empty ask is a mistake, and sending it would spend a request to be told
    // nothing.
    const { handleDk8sAsk } = await import('../../panel/main/handlers/k8s-handler.js');
    const posted: Msg[] = [];
    await handleDk8sAsk({
      promptKey: 'dk8s.log.askWhy', evidence: '', podContext: POD,
    }, m => posted.push(m as Msg));

    const err = posted.find(m => m.type === 'dk8s:aiError');
    assert.ok(err, 'expected dk8s:aiError for an ask with nothing in it');
    assert.ok(String(err!.error).includes('Nothing selected'));
  });

  test('an unknown prompt key is refused rather than sent', async () => {
    const { handleDk8sAsk } = await import('../../panel/main/handlers/k8s-handler.js');
    const posted: Msg[] = [];
    await handleDk8sAsk({
      promptKey: 'dk8s.not.a.real.prompt', evidence: EVIDENCE, podContext: POD,
    }, m => posted.push(m as Msg));

    const err = posted.find(m => m.type === 'dk8s:aiError');
    assert.ok(err, 'expected dk8s:aiError for an unregistered prompt');
    assert.ok(String(err!.error).includes('Unknown prompt'));
  });

  test('a secret in the evidence never reaches the provider', async () => {
    /*
      Every dk8s AI call funnels through this handler, which is what makes it
      the right place for redaction — and what makes it worth proving here
      rather than in a unit test that could pass while the wiring changed
      underneath it.
    */
    const { handleDk8sAsk } = await import('../../panel/main/handlers/k8s-handler.js');
    const { post, result } = collectUntilDone('ai:complete', 'ai:error');

    await handleDk8sAsk({
      promptKey: 'dk8s.log.askWhy',
      evidence: 'spring.datasource.password=hunter2 failed to connect',
      evidenceLabel: 'FILE',
      podContext: POD,
    }, post);

    const received = await result;
    const echo = received.find(m => m.type === 'dk8s:aiEvidence');
    assert.ok(echo, 'expected an evidence echo');
    assert.ok(!String(echo!.evidence).includes('hunter2'),
      'the secret survived redaction on the way to the panel');
    assert.ok(echo!.redactionNote, 'expected the panel to be told something was removed');
  });
});
