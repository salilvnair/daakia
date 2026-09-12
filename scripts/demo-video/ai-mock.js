/**
 * Point Daakia's AI at Daakia's own mock server.
 *
 *   node scripts/demo-video/ai-mock.js
 *
 * ── Why this exists ──
 *
 * The AI segments need the assistant to actually answer. On this machine the
 * default provider is GitHub Copilot, which only resolves inside VS Code — in
 * the browser the chat replies "No GitHub Copilot model available", which is a
 * poor thing to put in a showcase and not something a viewer can act on.
 *
 * Faking a reply was the other option and is worse: the video would show text
 * the app never produced. Daakia already ships the honest answer — an AI mock
 * server serving an OpenAI-compatible `/v1/chat/completions` with fifteen
 * API-development scenarios, and a provider entry (`daakia-mock`) made for
 * exactly this. So the assistant in the recording is doing real work against a
 * real endpoint; the endpoint is just ours.
 *
 * Idempotent: run it as often as you like. It talks to local-server over the
 * same WebSocket the app uses, so it needs `npm run local-server:dev` running.
 */
const WebSocket = require('ws');

const LOCAL_SERVER = process.env.LOCAL_SERVER_URL || 'ws://localhost:7890';
const SERVER_ID = 'daakia-ai-demo-0001';
const SERVER_NAME = 'Daakia AI (demo)';
const PROVIDER_ID = 'daakia-mock';
const MODEL_ID = 'mock1-model';

const config = {
  id: SERVER_ID,
  name: SERVER_NAME,
  description: 'OpenAI-compatible answers, served locally',
  protocol: 'ai',
  routes: [], graphqlSchema: '', graphqlOperations: [],
  wsHandlers: [], sseEvents: [], socketioHandlers: [], mqttTopics: [],
  grpcMethods: [], grpcProtoFile: '', soapOperations: [],
  /* Empty means the server's own fifteen scenarios — see
     src/mock/mock-ai-server.ts, DEFAULT_AI_SCENARIOS. */
  aiScenarios: [],
  mcpTools: [], connectedWorkflows: [],
};

const ws = new WebSocket(LOCAL_SERVER);
let port;

const fail = (why) => { console.error(why); process.exit(1); };

ws.on('error', (e) => fail(
  `Could not reach local-server at ${LOCAL_SERVER} (${e.message}).\n`
  + 'Start it first:  npm run local-server:dev'));

ws.on('open', () => ws.send(JSON.stringify({ type: 'mockServer:start', config })));

ws.on('message', async (data) => {
  const msg = JSON.parse(data.toString());

  if (msg.type === 'mockServer:started' && msg.id === SERVER_ID) {
    port = msg.port;
    /* Prove it answers before wiring anything to it, so a failure here says
       "the mock is not serving" rather than surfacing later as "the AI is
       broken" in the middle of a take. */
    const res = await fetch(`http://localhost:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL_ID, messages: [{ role: 'user', content: 'write a curl command' }] }),
    }).catch((e) => fail(`The mock started on ${port} but did not answer: ${e.message}`));
    const body = await res.json();
    const reply = String(body.choices?.[0]?.message?.content || '');
    if (!reply) fail(`The mock answered ${res.status} with no content:\n${JSON.stringify(body).slice(0, 300)}`);
    console.log(`AI mock server "${SERVER_NAME}" on port ${port} — answered ${reply.length} characters`);

    ws.send(JSON.stringify({ type: 'aiProviders:load' }));
    return;
  }

  if (msg.type === 'aiProviders:data') {
    /* Read, change one entry, write back. Saving only the mock provider would
       drop the other twelve from whoever's machine this runs on. */
    const providers = Array.isArray(msg.providers) ? msg.providers : null;
    if (!providers) {
      fail('No saved AI providers to amend. Open Settings → LLM Provider once so the app writes its defaults, then run this again.');
    }
    const mock = providers.find((p) => p.id === PROVIDER_ID);
    if (!mock) fail(`No "${PROVIDER_ID}" provider. Found: ${providers.map((p) => p.id).join(', ')}`);

    mock.baseUrl = `http://localhost:${port}/v1`;
    mock.enabled = true;

    ws.send(JSON.stringify({
      type: 'aiProviders:save',
      providers,
      defaultProviderId: PROVIDER_ID,
      defaultModelId: MODEL_ID,
    }));
    console.log(`DaakiaAI (Mock) -> ${mock.baseUrl}, and it is the default provider`);
    console.log('\nThe AI segments can record now:\n  node scripts/demo-video/record.js --only ai_chat,settings_ai');
    setTimeout(() => process.exit(0), 1200);
  }
});

setTimeout(() => fail('local-server never answered. Is it running?'), 25000);
