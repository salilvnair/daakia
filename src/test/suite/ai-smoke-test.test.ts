/**
 * Functional smoke test — Phase 2 (E-ai-smoke-test-daakia-mock). Every one of
 * the 79 AI-generation call sites found by scripts/audit-ai-message-contracts.mjs
 * funnels into exactly 4 shared handler functions: handleAiSend (47 sites) and
 * handleAiChat/handleAiStream/handleAiStreamRequest (the 31 sites fixed by
 * E-ai-dead-message-contracts-fix). Testing the 4 shared handlers is therefore
 * equivalent, in terms of backend code-path coverage, to smoke-testing all 79
 * features — no external API key needed, no per-feature UI required: routes
 * through the `daakia-mock` provider at a real, running mock-ai-server.ts
 * instance, the exact same engine a real provider key would use
 * (autoResolveProvider -> executeAiRequest). A real provider key would
 * additionally validate prompt/response *quality* against a real model, which
 * this cannot — see plan/todo.md's E-ai-smoke-test-daakia-mock entry.
 *
 * All 4 handlers are async wrappers, but the underlying executeAiRequest/
 * executeCopilotRequest are callback-based (fire-and-forget) — the returned
 * promise resolves as soon as the request is *sent*, not when a response
 * arrives. Real completion only shows up later via the postMessage callback.
 * So each test posts, then waits on a promise that resolves when postMessage
 * actually receives a done/error event.
 */
import * as assert from 'assert';
import * as path from 'path';
import {
  initMockServerManager, startMockServer, stopMockServer, type MockServerConfig,
} from '../../mock/mock-server-manager';
import { initDb, setSetting } from '../../storage/db';

function collectUntilDone(doneType: string, errorType: string, timeoutMs = 10_000): { post: (msg: unknown) => void; result: Promise<Record<string, unknown>[]> } {
  const received: Record<string, unknown>[] = [];
  let resolve!: (v: Record<string, unknown>[]) => void;
  let reject!: (e: Error) => void;
  const result = new Promise<Record<string, unknown>[]>((res, rej) => { resolve = res; reject = rej; });
  const timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms waiting for '${doneType}'/'${errorType}'. Received so far: ${JSON.stringify(received)}`)), timeoutMs);
  const post = (msg: unknown) => {
    const m = msg as Record<string, unknown>;
    received.push(m);
    if (m.type === doneType || m.type === errorType) {
      clearTimeout(timer);
      resolve(received);
    }
  };
  return { post, result };
}

suite('Daakia AI — Smoke Test (functional, via daakia-mock)', () => {
  let port: number;
  const serverId = 'e2e-ai-legacy-stream';

  suiteSetup(async () => {
    // Same dedicated port range as protocols.test.ts — see its suiteSetup comment.
    initMockServerManager(__dirname, 19000, 19999);
    const extensionRoot = path.resolve(__dirname, '../../../');
    await initDb(extensionRoot);

    const cfg: MockServerConfig = { id: serverId, name: 'ai-mock', description: '', protocol: 'ai', routes: [] };
    ({ port } = await startMockServer(cfg));

    // Point the daakia-mock provider at this real running mock AI server, and make
    // it the default provider — mirrors what a user configures in Settings → AI Providers.
    setSetting('aiProviders', [{ id: 'daakia-mock', baseUrl: `http://127.0.0.1:${port}` }]);
    setSetting('aiDefaultProvider', 'daakia-mock');
  });

  suiteTeardown(async () => {
    await stopMockServer(serverId);
  });

  test('handleAiSend (47 features on the ai:send contract) gets a real completion via ai:chunk/ai:complete', async () => {
    const { handleAiSend } = await import('../../panel/main/handlers/ai-handler.js');
    const { post, result } = collectUntilDone('ai:complete', 'ai:error');
    await handleAiSend(
      { tabId: 'e2e-tab-send', systemPrompts: ['You are a helpful API assistant.'], userPrompt: 'suggest headers for this request', conversation: [], tools: [] },
      post,
    );
    const received = await result;

    const chunks = received.filter(m => m.type === 'ai:chunk');
    const complete = received.find(m => m.type === 'ai:complete');
    const errors = received.filter(m => m.type === 'ai:error');
    assert.strictEqual(errors.length, 0, `expected no ai:error, got: ${JSON.stringify(errors)}`);
    assert.ok(chunks.length > 0, 'expected at least one ai:chunk');
    assert.ok(complete, 'expected an ai:complete event');
    const message = (complete!.message as { content?: string } | undefined);
    assert.ok(message?.content && message.content.length > 0, 'expected non-empty completion content');
  });

  test('handleAiChat (17 previously-dead features) gets a real completion via aiStream:chunk/done', async () => {
    const { handleAiChat } = await import('../../panel/main/handlers/ai-handler.js');
    const { post, result } = collectUntilDone('aiStream:done', 'aiStream:error');
    await handleAiChat(
      { tabId: 'e2e-tab', messages: [{ role: 'user', content: 'please explain this api response to me' }] },
      post,
    );
    const received = await result;

    const chunks = received.filter(m => m.type === 'aiStream:chunk');
    const errors = received.filter(m => m.type === 'aiStream:error');
    assert.strictEqual(errors.length, 0, `expected no aiStream:error, got: ${JSON.stringify(errors)}`);
    assert.ok(chunks.length > 0, 'expected at least one aiStream:chunk');
    const fullText = chunks.map(c => c.chunk as string).join('');
    assert.ok(fullText.length > 0, 'expected non-empty streamed content from the mock AI server');
  });

  test('handleAiStream (13 previously-dead features) gets a real completion via aiStream:chunk/done', async () => {
    const { handleAiStream } = await import('../../panel/main/handlers/ai-handler.js');
    const { post, result } = collectUntilDone('aiStream:done', 'aiStream:error');
    await handleAiStream(
      { payload: { systemPrompt: 'You are a helpful API assistant.', userMessage: 'generate a json schema for a user', templateKey: 'e2e-test' } },
      post,
    );
    const received = await result;

    const chunks = received.filter(m => m.type === 'aiStream:chunk');
    const errors = received.filter(m => m.type === 'aiStream:error');
    assert.strictEqual(errors.length, 0, `expected no aiStream:error, got: ${JSON.stringify(errors)}`);
    assert.ok(chunks.length > 0, 'expected at least one aiStream:chunk');
  });

  test('handleAiStreamRequest (1 previously-dead feature) gets a real completion via requestId-correlated events', async () => {
    const { handleAiStreamRequest } = await import('../../panel/main/handlers/ai-handler.js');
    const requestId = 'e2e-req-1';
    const { post, result } = collectUntilDone('aiStreamDone', 'aiStreamError');
    await handleAiStreamRequest(
      { requestId, systemPrompt: 'You are a performance engineer.', userPrompt: 'explain this error response spike' },
      post,
    );
    const received = await result;

    const chunks = received.filter(m => m.type === 'aiStreamChunk' && m.requestId === requestId);
    const done = received.find(m => m.type === 'aiStreamDone' && m.requestId === requestId);
    const errors = received.filter(m => m.type === 'aiStreamError');
    assert.strictEqual(errors.length, 0, `expected no aiStreamError, got: ${JSON.stringify(errors)}`);
    assert.ok(chunks.length > 0, 'expected at least one aiStreamChunk correlated by requestId');
    assert.ok(done, 'expected an aiStreamDone event correlated by requestId');
  });
});
