/**
 * State Machine Smoke Test — verifies Daakia's built-in mock server state
 * machine (`src/mock/mock-state-machine.ts` + the routing hooks in
 * `src/mock/mock-http-server.ts`) for real, end-to-end, over real HTTP.
 *
 * Starts a real mock REST server (via the same `mock-server-manager` the
 * extension uses) with one state ("logged_out" -> "logged_in") and two
 * routes wired to it purely via `triggerEvent` — the only state-gating
 * mechanism a route supports (the legacy requiredState/newState/
 * stateTransitions fields were removed; a route's event is matched
 * directly against the connected canvas workflow's own transition graph,
 * exactly what SmMockServerCanvas.tsx writes from the canvas edges).
 * Hits it with real `fetch()` calls — the same way the REST tab would —
 * and asserts the server's behavior actually changes as the state
 * transitions, proving the state machine is not just persisted config but
 * live runtime logic.
 */
import * as assert from 'assert';
import {
  initMockServerManager,
  startMockServer,
  stopMockServer,
  setPortRange,
  getPortRange,
  type MockServerConfig,
} from '../../mock/mock-server-manager';

suiteSetup(() => {
  initMockServerManager(__dirname);
});

suite('Daakia Mock Server — Built-in State Machine', () => {
  let port: number;
  let savedPortRange: { min: number; max: number };
  const id = 'e2e-state-machine';

  suiteSetup(async () => {
    // Use a dedicated port range so this suite's start/stop cycle never
    // shares port 8000 with `protocols.test.ts` — avoids perturbing that
    // suite's (pre-existing, unrelated) close()-timing race on gRPC/lifecycle.
    savedPortRange = getPortRange();
    setPortRange(18000, 18010);

    const cfg: MockServerConfig = {
      id,
      name: 'test-state-machine',
      description: 'One state (logged_out -> logged_in), two routes',
      protocol: 'rest',
      stateMachine: {
        enabled: true,
        states: [
          { id: 'logged_out', name: 'Logged Out', x: 0, y: 0, isInitial: true },
          { id: 'logged_in', name: 'Logged In', x: 200, y: 0 },
        ],
        transitions: [
          { id: 't1', from: 'logged_out', to: 'logged_in', routeId: '', label: 'LOGIN' },
          { id: 't2', from: 'logged_in', to: 'logged_in', routeId: '', label: 'VIEW_PROFILE' },
        ],
        sessionMode: 'global',
        defaultState: 'logged_out',
      },
      routes: [
        {
          id: 'r-login', method: 'POST', path: '/login', statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: '{"ok":true,"token":"abc123"}', delay: 0, enabled: true,
          triggerEvent: 'LOGIN',
        },
        {
          id: 'r-profile', method: 'GET', path: '/profile', statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: '{"user":"alice","authenticated":true}', delay: 0, enabled: true,
          triggerEvent: 'VIEW_PROFILE',
        },
      ],
    };
    ({ port } = await startMockServer(cfg));
  });
  suiteTeardown(async () => {
    await stopMockServer(id);
    setPortRange(savedPortRange.min, savedPortRange.max);
  });

  test('a route gated on an event is unreachable before that event has a valid transition', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/profile`);
    assert.strictEqual(res.status, 404, 'GET /profile should 404 while session is still logged_out — VIEW_PROFILE only valid from logged_in');
  });

  test('hitting the transition route succeeds and moves the server into the new state', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/login`, { method: 'POST' });
    assert.strictEqual(res.status, 200);
    const body = await res.json() as { ok: boolean; token: string };
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.token, 'abc123');
  });

  test('the gated route is now reachable and reflects the new state', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/profile`);
    assert.strictEqual(res.status, 200, 'GET /profile should now succeed — session transitioned to logged_in');
    const body = await res.json() as { user: string; authenticated: boolean };
    assert.strictEqual(body.user, 'alice');
    assert.strictEqual(body.authenticated, true);
  });

  test('hitting the transition route again is a no-op (LOGIN has no transition from logged_in)', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/login`, { method: 'POST' });
    assert.strictEqual(res.status, 404, 'POST /login should 404 now — no LOGIN transition is defined from "logged_in"');
  });
});

/**
 * A state node's own Mock Responses (Advanced tab / SMNodeData.mockResponses)
 * — proves StateMachineRuntime.getStateResponseForRoute correctly reads them
 * from the real engine's current state after a triggerEvent-driven
 * transition fires, and that a route with NO triggerEvent of its own still
 * resolves a runtime (for session-scoped state) when the server has exactly
 * one state machine — the common single-workflow case.
 */
suite('Daakia Mock Server — Built-in State Machine (per-state Mock Responses)', () => {
  let port: number;
  let savedPortRange: { min: number; max: number };
  const id = 'e2e-state-machine-mock-responses';

  suiteSetup(async () => {
    savedPortRange = getPortRange();
    setPortRange(18020, 18030);

    const cfg: MockServerConfig = {
      id,
      name: 'test-state-machine-mock-responses',
      description: 'idle -> active via triggerEvent, GET /status ungated but reflects per-state Mock Responses',
      protocol: 'rest',
      stateMachine: {
        enabled: true,
        states: [
          {
            id: 'idle', name: 'Idle', x: 0, y: 0, isInitial: true,
            mockResponses: [{ method: 'GET', path: '/status', status: 200, body: '{"phase":"idle"}' }],
          },
          {
            id: 'active', name: 'Active', x: 200, y: 0,
            mockResponses: [{ method: 'GET', path: '/status', status: 200, body: '{"phase":"active"}' }],
          },
        ],
        transitions: [{ id: 't1', from: 'idle', to: 'active', routeId: '', label: 'ACTIVATE' }],
        sessionMode: 'global',
        defaultState: 'idle',
      },
      routes: [
        {
          id: 'r-activate', method: 'POST', path: '/activate', statusCode: 200,
          headers: { 'Content-Type': 'application/json' }, body: '{"activated":true}', delay: 0, enabled: true,
          triggerEvent: 'ACTIVATE',
        },
        {
          // No triggerEvent — always matches, but still session-scoped since
          // the server has exactly one state machine (resolved automatically).
          id: 'r-status', method: 'GET', path: '/status', statusCode: 200,
          headers: { 'Content-Type': 'application/json' }, body: '{"phase":"unknown"}', delay: 0, enabled: true,
        },
      ],
    };
    ({ port } = await startMockServer(cfg));
  });
  suiteTeardown(async () => {
    await stopMockServer(id);
    setPortRange(savedPortRange.min, savedPortRange.max);
  });

  test("GET /status reflects the idle state's own Mock Responses before any transition", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/status`);
    assert.strictEqual(res.status, 200);
    const body = await res.json() as { phase: string };
    assert.strictEqual(body.phase, 'idle');
  });

  test('POST /activate fires ACTIVATE and moves the session to active', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/activate`, { method: 'POST' });
    assert.strictEqual(res.status, 200);
  });

  test("GET /status now reflects the active state's Mock Responses — the transition genuinely moved the session", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/status`);
    const body = await res.json() as { phase: string };
    assert.strictEqual(body.phase, 'active');
  });

  test('POST /activate again 404s — ACTIVATE has no transition from "active"', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/activate`, { method: 'POST' });
    assert.strictEqual(res.status, 404);
  });
});

/**
 * Proves the third, most-direct mechanism: a route's `triggerEvent` matched
 * straight against the canvas's own transition graph (config.transitions[]
 * with real event labels like "PLACE"/"PAY", exactly what
 * SmMockServerCanvas.tsx writes from the canvas edges) — no
 * requiredState/newState/stateTransitions on the route at all. Mirrors the
 * canvas's own Dispatch Event panel: wrong event/wrong state -> rejected
 * (404 here), right event from the right state -> fires and moves on.
 */
suite('Daakia Mock Server — Built-in State Machine (event-driven routes, no requiredState)', () => {
  let port: number;
  let savedPortRange: { min: number; max: number };
  const id = 'e2e-state-machine-event-driven';

  suiteSetup(async () => {
    savedPortRange = getPortRange();
    setPortRange(18040, 18050);

    const cfg: MockServerConfig = {
      id,
      name: 'test-state-machine-event-driven',
      description: 'cart -> placed -> payment via real event names (PLACE, PAY), no requiredState on routes',
      protocol: 'rest',
      stateMachine: {
        enabled: true,
        states: [
          { id: 'cart', name: 'Cart', x: 0, y: 0, isInitial: true },
          { id: 'placed', name: 'Placed', x: 200, y: 0 },
          { id: 'payment', name: 'Payment', x: 400, y: 0 },
        ],
        // Canvas-authored transitions — `label` is the real event name, exactly
        // what SmMockServerCanvas.tsx writes from the canvas edges.
        transitions: [
          { id: 't1', from: 'cart', to: 'placed', routeId: '', label: 'PLACE' },
          { id: 't2', from: 'placed', to: 'payment', routeId: '', label: 'PAY' },
        ],
        sessionMode: 'global',
        defaultState: 'cart',
      },
      routes: [
        {
          id: 'r-place', method: 'POST', path: '/orders/place', statusCode: 200,
          headers: { 'Content-Type': 'application/json' }, body: '{"placed":true}', delay: 0, enabled: true,
          triggerEvent: 'PLACE',
        },
        {
          id: 'r-pay', method: 'POST', path: '/orders/pay', statusCode: 200,
          headers: { 'Content-Type': 'application/json' }, body: '{"paid":true}', delay: 0, enabled: true,
          triggerEvent: 'PAY',
        },
      ],
    };
    ({ port } = await startMockServer(cfg));
  });
  suiteTeardown(async () => {
    await stopMockServer(id);
    setPortRange(savedPortRange.min, savedPortRange.max);
  });

  test('PAY before PLACE 404s — no transition for "PAY" from the initial state "cart"', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/orders/pay`, { method: 'POST' });
    assert.strictEqual(res.status, 404, 'PAY has no transition from cart — the graph itself rejects it, no requiredState needed');
  });

  test('PLACE fires from cart — moves the session to "placed"', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/orders/place`, { method: 'POST' });
    assert.strictEqual(res.status, 200);
    const body = await res.json() as { placed: boolean };
    assert.strictEqual(body.placed, true);
  });

  test('PAY now fires from placed — moves the session to "payment"', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/orders/pay`, { method: 'POST' });
    assert.strictEqual(res.status, 200);
    const body = await res.json() as { paid: boolean };
    assert.strictEqual(body.paid, true);
  });

  test('PLACE again 404s — no transition for "PLACE" from the current state "payment"', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/orders/place`, { method: 'POST' });
    assert.strictEqual(res.status, 404, 'PLACE is only defined from cart — the graph correctly rejects it from payment');
  });
});

/**
 * Proves the "Auth Flow (Real Validation)" REST sample
 * (webview-ui/src/components/mock/samples/rest.ts, id 'auth-conditional')
 * end-to-end — the transition genuinely depends on real request content
 * (bodyMatcher checks the body for non-empty username+password), not just
 * "the state machine says any state matches". Same route (POST /login)
 * has two entries: a state-gated + bodyMatcher-gated success route
 * (priority 1) and a catch-all failure route (no priority, no state
 * machine involvement) — mirrors exactly what a user builds via the
 * Trigger Event dropdown + Matching tab's Body matcher.
 */
suite('Daakia Mock Server — Auth Flow (Real Validation) sample', () => {
  let port: number;
  let savedPortRange: { min: number; max: number };
  const id = 'e2e-auth-conditional';

  suiteSetup(async () => {
    savedPortRange = getPortRange();
    setPortRange(18060, 18070);

    const cfg: MockServerConfig = {
      id,
      name: 'test-auth-conditional',
      description: 'Auth Flow (Real Validation) sample, reproduced exactly',
      protocol: 'rest',
      stateMachine: {
        enabled: true,
        sessionMode: 'global',
        defaultState: 'unauthenticated',
        states: [
          { id: 'unauthenticated', name: 'Unauthenticated', x: 250, y: 20, isInitial: true },
          { id: 'authorized', name: 'Authorized', x: 250, y: 200 },
        ],
        transitions: [
          { id: 'auth-t1', from: 'unauthenticated', to: 'authorized', routeId: '', label: 'LOGIN_SUCCESS' },
          { id: 'auth-t2', from: 'authorized', to: 'authorized', routeId: '', label: 'VIEW_PROFILE' },
          { id: 'auth-t3', from: 'authorized', to: 'unauthenticated', routeId: '', label: 'LOGOUT' },
          { id: 'auth-t4', from: 'unauthenticated', to: 'unauthenticated', routeId: '', label: 'LOGIN_FAILED' },
        ],
      },
      routes: [
        {
          id: 'r-login-ok', method: 'POST', path: '/api/auth/login', statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: '{"success":true,"message":"Logged in"}', delay: 0, enabled: true, priority: 1,
          bodyMatcher: { matchType: 'regex', value: '(?=.*"username"\\s*:\\s*"[^"]+")(?=.*"password"\\s*:\\s*"[^"]+")' },
          triggerEvent: 'LOGIN_SUCCESS',
        },
        {
          id: 'r-login-fail', method: 'POST', path: '/api/auth/login', statusCode: 401,
          headers: { 'Content-Type': 'application/json' },
          body: '{"success":false,"error":"username and password are required"}', delay: 0, enabled: true,
          triggerEvent: 'LOGIN_FAILED',
        },
        {
          id: 'r-profile', method: 'GET', path: '/api/profile', statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: '{"user":"demo","authorized":true}', delay: 0, enabled: true,
          triggerEvent: 'VIEW_PROFILE',
        },
      ],
    };
    ({ port } = await startMockServer(cfg));
  });
  suiteTeardown(async () => {
    await stopMockServer(id);
    setPortRange(savedPortRange.min, savedPortRange.max);
  });

  test('GET /api/profile before any login 404s — session starts unauthenticated', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/profile`);
    assert.strictEqual(res.status, 404);
  });

  test('POST /api/auth/login with an empty body 401s — no username/password present', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    assert.strictEqual(res.status, 401);
    const responseBody = await res.json() as { success: boolean };
    assert.strictEqual(responseBody.success, false);
  });

  test('POST /api/auth/login with only a username 401s — password still missing', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'alice' }),
    });
    assert.strictEqual(res.status, 401);
  });

  test('GET /api/profile is still 404 after failed login attempts — no state change happened', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/profile`);
    assert.strictEqual(res.status, 404);
  });

  test('POST /api/auth/login with real username + password succeeds and fires LOGIN_SUCCESS', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'hunter2' }),
    });
    assert.strictEqual(res.status, 200);
    const responseBody = await res.json() as { success: boolean };
    assert.strictEqual(responseBody.success, true);
  });

  test('GET /api/profile now succeeds — the real credential check genuinely moved the session to authorized', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/profile`);
    assert.strictEqual(res.status, 200);
    const body = await res.json() as { user: string; authorized: boolean };
    assert.strictEqual(body.authorized, true);
  });
});

/**
 * Same real-content + real-state pattern as the REST Auth Flow sample above,
 * proven for GraphQL. Unlike REST (which can register two routes on the same
 * path and let priority pick a candidate), GraphQL resolves a single
 * operation by name — so the gate is expressed as one mutation with a
 * bodyMatcher (regex over the raw POST body, which includes `variables`)
 * plus a triggerEvent, exactly mirroring mock-graphql-server.ts's real
 * matching order: name/type match -> headerMatchers -> bodyMatcher ->
 * state-machine gate -> response (+ fireEvent).
 */
suite('Daakia Mock Server — GraphQL real-content + real-state gating', () => {
  let port: number;
  let savedPortRange: { min: number; max: number };
  const id = 'e2e-graphql-auth';

  suiteSetup(async () => {
    savedPortRange = getPortRange();
    setPortRange(18080, 18090);

    const cfg: MockServerConfig = {
      id,
      name: 'test-graphql-auth',
      description: 'GraphQL mutation gated on real credential content + real state',
      protocol: 'graphql',
      graphqlSchema: 'type Mutation { login(username: String, password: String): LoginResult } type Query { profile: Profile } type LoginResult { success: Boolean } type Profile { user: String authorized: Boolean }',
      stateMachine: {
        enabled: true,
        sessionMode: 'global',
        defaultState: 'unauthenticated',
        states: [
          { id: 'unauthenticated', name: 'Unauthenticated', x: 250, y: 20, isInitial: true },
          { id: 'authorized', name: 'Authorized', x: 250, y: 200 },
        ],
        transitions: [
          { id: 'gql-t1', from: 'unauthenticated', to: 'authorized', routeId: '', label: 'LOGIN_SUCCESS' },
          { id: 'gql-t2', from: 'authorized', to: 'authorized', routeId: '', label: 'VIEW_PROFILE' },
        ],
      },
      routes: [],
      graphqlOperations: [
        {
          id: 'op-login', operationType: 'mutation', operationName: 'Login',
          response: '{"data":{"login":{"success":true}}}', statusCode: 200, delay: 0, enabled: true,
          bodyMatcher: { matchType: 'regex', value: '(?=.*"username"\\s*:\\s*"[^"]+")(?=.*"password"\\s*:\\s*"[^"]+")' },
          triggerEvent: 'LOGIN_SUCCESS',
        },
        {
          id: 'op-profile', operationType: 'query', operationName: 'Profile',
          response: '{"data":{"profile":{"user":"demo","authorized":true}}}', statusCode: 200, delay: 0, enabled: true,
          triggerEvent: 'VIEW_PROFILE',
        },
      ],
    };
    ({ port } = await startMockServer(cfg));
  });
  suiteTeardown(async () => {
    await stopMockServer(id);
    setPortRange(savedPortRange.min, savedPortRange.max);
  });

  async function gql(query: string, variables: Record<string, unknown>) {
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    return { status: res.status, json: await res.json() as { data: any; errors?: Array<{ message: string }> } };
  }

  test('querying Profile before login is rejected by the state gate — session starts unauthenticated', async () => {
    const { json } = await gql('query Profile { profile { user authorized } }', {});
    assert.strictEqual(json.data, null);
    assert.ok(json.errors?.[0].message.includes('state gate'), `expected a state-gate error, got: ${JSON.stringify(json.errors)}`);
  });

  test('Login mutation with empty variables is rejected by bodyMatcher — no username/password present', async () => {
    const { json } = await gql('mutation Login($username: String, $password: String) { login(username: $username, password: $password) { success } }', {});
    assert.strictEqual(json.data, null);
    assert.ok(json.errors?.[0].message.includes('body match failed'), `expected a body-match error, got: ${JSON.stringify(json.errors)}`);
  });

  test('Login mutation with real username + password succeeds and fires LOGIN_SUCCESS', async () => {
    const { json } = await gql(
      'mutation Login($username: String, $password: String) { login(username: $username, password: $password) { success } }',
      { username: 'alice', password: 'hunter2' },
    );
    assert.strictEqual(json.data.login.success, true);
  });

  test('querying Profile now succeeds — the real credential check genuinely moved the session to authorized', async () => {
    const { json } = await gql('query Profile { profile { user authorized } }', {});
    assert.strictEqual(json.data.profile.authorized, true);
    assert.strictEqual(json.data.profile.user, 'demo');
  });
});

/**
 * Same pattern proven for gRPC — a unary Login call gated on real request
 * message content (bodyMatcher over JSON.stringify(call.request), since
 * gRPC's generic/JSON mode round-trips messages as plain JSON) combined with
 * triggerEvent, and a GetProfile unary call gated purely on real state.
 * Session key is resolved from gRPC metadata (mock-grpc-server.ts has no
 * concept of cookies), so requests reuse the same client/channel deliberately
 * — a fresh grpc.Client per call would still share metadata-resolved session
 * state here since sessionMode is 'global'.
 */
suite('Daakia Mock Server — gRPC real-content + real-state gating', () => {
  let port: number;
  let savedPortRange: { min: number; max: number };
  const id = 'e2e-grpc-auth';
  let grpcModule: typeof import('@grpc/grpc-js');

  suiteSetup(async () => {
    grpcModule = await import('@grpc/grpc-js');
    savedPortRange = getPortRange();
    setPortRange(18100, 18110);

    const cfg: MockServerConfig = {
      id,
      name: 'test-grpc-auth',
      description: 'gRPC unary methods gated on real message content + real state',
      protocol: 'grpc',
      routes: [],
      stateMachine: {
        enabled: true,
        sessionMode: 'global',
        defaultState: 'unauthenticated',
        states: [
          { id: 'unauthenticated', name: 'Unauthenticated', x: 250, y: 20, isInitial: true },
          { id: 'authorized', name: 'Authorized', x: 250, y: 200 },
        ],
        transitions: [
          { id: 'grpc-t1', from: 'unauthenticated', to: 'authorized', routeId: '', label: 'LOGIN_SUCCESS' },
          { id: 'grpc-t2', from: 'authorized', to: 'authorized', routeId: '', label: 'VIEW_PROFILE' },
        ],
      },
      grpcMethods: [
        {
          id: 'm-login', service: 'Auth', method: 'Login', type: 'unary',
          response: '{"success":true}', enabled: true, serviceEnabled: true,
          bodyMatcher: { matchType: 'regex', value: '(?=.*"username"\\s*:\\s*"[^"]+")(?=.*"password"\\s*:\\s*"[^"]+")' },
          triggerEvent: 'LOGIN_SUCCESS',
        },
        {
          id: 'm-profile', service: 'Auth', method: 'GetProfile', type: 'unary',
          response: '{"user":"demo","authorized":true}', enabled: true, serviceEnabled: true,
          triggerEvent: 'VIEW_PROFILE',
        },
      ],
    };
    ({ port } = await startMockServer(cfg));
  });
  suiteTeardown(async () => {
    await stopMockServer(id);
    setPortRange(savedPortRange.min, savedPortRange.max);
  });

  function callUnary(method: string, request: unknown): Promise<{ code?: number; response?: any }> {
    const client = new grpcModule.Client(`127.0.0.1:${port}`, grpcModule.credentials.createInsecure());
    const serialize = (v: unknown) => Buffer.from(JSON.stringify(v));
    const deserialize = (buf: Buffer) => JSON.parse(buf.toString());
    return new Promise((resolve) => {
      client.makeUnaryRequest(
        `/Auth/${method}`, serialize, deserialize, request,
        (err: import('@grpc/grpc-js').ServiceError | null, res: unknown) => {
          client.close();
          if (err) { resolve({ code: err.code }); return; }
          resolve({ response: res });
        }
      );
    });
  }

  test('GetProfile before any login is rejected with FAILED_PRECONDITION — session starts unauthenticated', async () => {
    const { code } = await callUnary('GetProfile', {});
    assert.strictEqual(code, grpcModule.status.FAILED_PRECONDITION);
  });

  test('Login with an empty message is rejected with NOT_FOUND — no username/password present', async () => {
    const { code } = await callUnary('Login', {});
    assert.strictEqual(code, grpcModule.status.NOT_FOUND);
  });

  test('Login with real username + password succeeds and fires LOGIN_SUCCESS', async () => {
    const { response } = await callUnary('Login', { username: 'alice', password: 'hunter2' });
    assert.strictEqual(response.success, true);
  });

  test('GetProfile now succeeds — the real credential check genuinely moved the session to authorized', async () => {
    const { response } = await callUnary('GetProfile', {});
    assert.strictEqual(response.authorized, true);
    assert.strictEqual(response.user, 'demo');
  });

  test('Login again is rejected with FAILED_PRECONDITION — LOGIN_SUCCESS no longer valid from "authorized"', async () => {
    const { code } = await callUnary('Login', { username: 'alice', password: 'hunter2' });
    assert.strictEqual(code, grpcModule.status.FAILED_PRECONDITION);
  });
});

/**
 * Same pattern proven for SOAP — two operations share the SOAPAction "Login"
 * (mirroring REST's two-route-same-path trick): a priority-1 candidate gated
 * by a real bodyMatcher (regex over the raw envelope XML) + triggerEvent, and
 * a priority-less catch-all fault candidate. A separate GetProfile operation
 * is gated purely on real state. This also exercises mock-soap-server.ts's
 * bodyMatcher/headerMatchers wiring for the first time — previously declared
 * on SoapMockOperation but never actually implemented.
 */
suite('Daakia Mock Server — SOAP real-content + real-state gating', () => {
  let port: number;
  let savedPortRange: { min: number; max: number };
  const id = 'e2e-soap-auth';

  suiteSetup(async () => {
    savedPortRange = getPortRange();
    setPortRange(18120, 18130);

    const cfg: MockServerConfig = {
      id,
      name: 'test-soap-auth',
      description: 'SOAP operations gated on real envelope content + real state',
      protocol: 'soap',
      routes: [],
      stateMachine: {
        enabled: true,
        sessionMode: 'global',
        defaultState: 'unauthenticated',
        states: [
          { id: 'unauthenticated', name: 'Unauthenticated', x: 250, y: 20, isInitial: true },
          { id: 'authorized', name: 'Authorized', x: 250, y: 200 },
        ],
        transitions: [
          { id: 'soap-t1', from: 'unauthenticated', to: 'authorized', routeId: '', label: 'LOGIN_SUCCESS' },
          { id: 'soap-t2', from: 'authorized', to: 'authorized', routeId: '', label: 'VIEW_PROFILE' },
        ],
      },
      soapOperations: [
        {
          id: 'op-login-ok', service: 'Auth', operation: 'Login', soapAction: 'Login',
          responseType: 'static', delay: 0, enabled: true, serviceEnabled: true, priority: 1,
          response: '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><LoginResponse><success>true</success></LoginResponse></soap:Body></soap:Envelope>',
          bodyMatcher: { matchType: 'regex', value: '(?=.*<username>[^<]+</username>)(?=.*<password>[^<]+</password>)' },
          triggerEvent: 'LOGIN_SUCCESS',
        },
        {
          id: 'op-login-fail', service: 'Auth', operation: 'Login', soapAction: 'Login',
          responseType: 'static', delay: 0, enabled: true, serviceEnabled: true,
          response: '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><LoginResponse><success>false</success></LoginResponse></soap:Body></soap:Envelope>',
        },
        {
          id: 'op-profile', service: 'Auth', operation: 'GetProfile', soapAction: 'GetProfile',
          responseType: 'static', delay: 0, enabled: true, serviceEnabled: true,
          response: '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><GetProfileResponse><user>demo</user><authorized>true</authorized></GetProfileResponse></soap:Body></soap:Envelope>',
          triggerEvent: 'VIEW_PROFILE',
        },
      ],
    };
    ({ port } = await startMockServer(cfg));
  });
  suiteTeardown(async () => {
    await stopMockServer(id);
    setPortRange(savedPortRange.min, savedPortRange.max);
  });

  async function soapCall(action: string, innerXml: string) {
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml', SOAPAction: action },
      body: `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${innerXml}</soap:Body></soap:Envelope>`,
    });
    return { status: res.status, text: await res.text() };
  }

  test('GetProfile before any login returns the fault route — no candidate satisfies the state gate', async () => {
    const { text } = await soapCall('GetProfile', '<GetProfile/>');
    assert.ok(text.includes('soap:Fault'), `expected a SOAP fault, got: ${text}`);
  });

  test('Login with empty username/password falls through to the catch-all failure operation', async () => {
    const { text } = await soapCall('Login', '<Login><username></username><password></password></Login>');
    assert.ok(text.includes('<success>false</success>'), `expected the catch-all failure response, got: ${text}`);
  });

  test('Login with real username + password matches the priority-1 candidate and fires LOGIN_SUCCESS', async () => {
    const { text } = await soapCall('Login', '<Login><username>alice</username><password>hunter2</password></Login>');
    assert.ok(text.includes('<success>true</success>'), `expected the success response, got: ${text}`);
  });

  test('GetProfile now succeeds — the real credential check genuinely moved the session to authorized', async () => {
    const { text } = await soapCall('GetProfile', '<GetProfile/>');
    assert.ok(text.includes('<user>demo</user>') && text.includes('<authorized>true</authorized>'), `expected the authorized profile, got: ${text}`);
  });
});

/**
 * Proves a server with MULTIPLE connected workflows tracks each one's
 * session independently — the "State Machine" dropdown scenario: a route's
 * `connectedWorkflowId` picks which of the server's `connectedWorkflows`
 * entries its `triggerEvent` is matched against, and each workflow gets its
 * own real StateMachineRuntime (mock-runtime.ts keys instances by
 * `${serverId}::${workflowId}`), not one runtime shared across all of them.
 * Both workflows deliberately reuse the same event name ("START") to prove
 * this isn't just "different event names happen not to collide" — firing
 * START on workflow A must have zero effect on workflow B's session.
 */
suite('Daakia Mock Server — multiple connected workflows track state independently', () => {
  let port: number;
  let savedPortRange: { min: number; max: number };
  const id = 'e2e-multi-workflow';

  suiteSetup(async () => {
    savedPortRange = getPortRange();
    setPortRange(18140, 18150);

    const cfg: MockServerConfig = {
      id,
      name: 'test-multi-workflow',
      description: 'Two independently connected workflows, same event name, gated per-route via connectedWorkflowId',
      protocol: 'rest',
      routes: [
        {
          id: 'r-start-a', method: 'POST', path: '/a/start', statusCode: 200,
          headers: { 'Content-Type': 'application/json' }, body: '{"startedA":true}', delay: 0, enabled: true,
          triggerEvent: 'START', connectedWorkflowId: 'wf-a',
        },
        {
          id: 'r-start-b', method: 'POST', path: '/b/start', statusCode: 200,
          headers: { 'Content-Type': 'application/json' }, body: '{"startedB":true}', delay: 0, enabled: true,
          triggerEvent: 'START', connectedWorkflowId: 'wf-b',
        },
      ],
      connectedWorkflows: [
        {
          workflowId: 'wf-a', name: 'Flow A',
          stateMachine: {
            enabled: true, sessionMode: 'global', defaultState: 'cartA',
            states: [
              { id: 'cartA', name: 'Cart A', x: 0, y: 0, isInitial: true },
              { id: 'placedA', name: 'Placed A', x: 200, y: 0 },
            ],
            transitions: [{ id: 'a1', from: 'cartA', to: 'placedA', routeId: '', label: 'START' }],
          },
        },
        {
          workflowId: 'wf-b', name: 'Flow B',
          stateMachine: {
            enabled: true, sessionMode: 'global', defaultState: 'cartB',
            states: [
              { id: 'cartB', name: 'Cart B', x: 0, y: 0, isInitial: true },
              { id: 'placedB', name: 'Placed B', x: 200, y: 0 },
            ],
            transitions: [{ id: 'b1', from: 'cartB', to: 'placedB', routeId: '', label: 'START' }],
          },
        },
      ],
    };
    ({ port } = await startMockServer(cfg));
  });
  suiteTeardown(async () => {
    await stopMockServer(id);
    setPortRange(savedPortRange.min, savedPortRange.max);
  });

  test('START fires on workflow A — moves A to placedA', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/a/start`, { method: 'POST' });
    assert.strictEqual(res.status, 200);
  });

  test('workflow B is unaffected by A\'s START — its own START still fires from cartB', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/b/start`, { method: 'POST' });
    assert.strictEqual(res.status, 200, 'workflow B should still be at its own initial state cartB, independent of workflow A');
  });

  test('START again on workflow A 404s — no transition from placedA', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/a/start`, { method: 'POST' });
    assert.strictEqual(res.status, 404);
  });

  test('START again on workflow B 404s too — confirms B genuinely transitioned in the earlier test, not just always-succeeding', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/b/start`, { method: 'POST' });
    assert.strictEqual(res.status, 404);
  });
});
