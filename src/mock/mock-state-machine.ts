/**
 * mock-state-machine.ts — Stateful behavior runtime for WireMock-grade mocking.
 * Implements 6A.11: named states, transitions triggered by requests, state variables, session tracking.
 *
 * Backed by the real @salilvnair/state-machine engine (StateMachineEngine) —
 * the same engine the canvas "Run" debugger in the state-machine editor uses
 * — instead of a separate hand-rolled reimplementation. A route's
 * `triggerEvent` is matched directly against the connected canvas workflow's
 * own transition graph (config.transitions[].label) and fires via
 * `engine.send()`, exactly like the canvas Run debugger — no synthetic
 * per-route event keys or raw state overrides.
 *
 * One runtime instance = one connected workflow's state machine (see
 * mock-runtime.ts, which keys instances by `${serverId}::${workflowId}` so a
 * server with multiple connected workflows gets independent session tracking
 * per workflow).
 *
 * @salilvnair/state-machine is ESM-only; this extension host compiles to
 * CommonJS, so the engine class is loaded once via a dynamic import() (see
 * preloadStateMachineEngine, awaited by startMockServer() before any server
 * with a state machine starts) rather than a static top-level import. The
 * types below are a small structural mirror of the library's own shapes
 * (StateDefinition/TransitionDefinition/StateMachineConfig in
 * @salilvnair/state-machine/core/types) — kept local so this file doesn't
 * need a static cross-module type import across the CJS/ESM boundary.
 */
import type { StateMachineConfig, StateTransition } from './mock-types';

interface EngineInstance {
  readonly currentState: string | null;
  readonly context: Record<string, unknown>;
  start(): void;
  canSend(eventType: string): boolean;
  send(event: { type: string; payload?: unknown }): Promise<boolean>;
  setState(stateId: string): void;
  getResponseForRoute(method: string, path: string): { status: number; body: string } | null;
}

interface EngineCtor {
  new (config: LibConfig): EngineInstance;
}

interface LibStateDefinition {
  id: string;
  label?: string;
  initial?: boolean;
  mockResponses?: Array<{ method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; path: string; status: number; body: string }>;
  meta?: { x?: number; y?: number; color?: string };
}
interface LibTransitionDefinition {
  id?: string;
  from: string;
  to: string;
  event: string;
}
interface LibConfig {
  id: string;
  name: string;
  states: LibStateDefinition[];
  transitions: LibTransitionDefinition[];
  context?: Record<string, unknown>;
}

let EngineCtor: EngineCtor | null = null;

/**
 * Lazily loads the real engine class. Must be awaited (see startMockServer()
 * in mock-server-manager.ts, which awaits this before starting any server
 * with `config.stateMachine?.enabled`) before the first StateMachineRuntime
 * is constructed — the constructor itself stays synchronous for every other
 * caller in mock-http-server.ts's hot request path.
 */
export async function preloadStateMachineEngine(): Promise<void> {
  if (EngineCtor) return;
  const mod = await import('@salilvnair/state-machine/engine');
  EngineCtor = mod.StateMachineEngine as unknown as EngineCtor;
}

interface SessionEntry {
  engine: EngineInstance;
  lastActivity: number;
}

/** Converts Daakia's StateMachineConfig (mock-types.ts) into the engine's config shape. */
function toLibraryConfig(config: StateMachineConfig): LibConfig {
  const states: LibStateDefinition[] = config.states.map((s) => ({
    id: s.id,
    label: s.name,
    initial: s.id === config.defaultState,
    mockResponses: s.mockResponses,
    meta: { x: s.x, y: s.y, color: s.color },
  }));

  // Ensure exactly one state is marked initial even if defaultState doesn't
  // match any configured state id — mirrors the old runtime's
  // `defaultState || 'initial'` fallback (start() throws with none marked).
  if (!states.some((s) => s.initial) && states.length > 0) {
    states[0].initial = true;
  }

  // Canvas-authored transitions: event = the real event name from the edge
  // (config.transitions[].label, e.g. "PAY") — this is the graph a route's
  // `triggerEvent` gets matched against. Falls back to `routeId` only for
  // very old hand-crafted configs that predate the `label` field.
  const transitions: LibTransitionDefinition[] = config.transitions.map((t) => ({
    id: t.id,
    from: t.from,
    to: t.to,
    event: t.label || t.routeId,
  }));

  return {
    id: 'daakia-mock-server',
    name: 'Daakia Mock Server',
    states,
    transitions,
    context: {},
  };
}

/**
 * StateMachineRuntime manages per-session state for a single mock server,
 * backed by one real StateMachineEngine instance per session.
 * Sessions are identified by cookie / header value (or a global singleton).
 */
export class StateMachineRuntime {
  private config: StateMachineConfig;
  private libConfig: LibConfig;
  private sessions = new Map<string, SessionEntry>();
  private readonly SESSION_TTL = 30 * 60 * 1000; // 30 min idle expiry

  constructor(config: StateMachineConfig) {
    if (!EngineCtor) {
      throw new Error('StateMachineRuntime: preloadStateMachineEngine() must be awaited before constructing a runtime');
    }
    this.config = config;
    this.libConfig = toLibraryConfig(config);
  }

  updateConfig(config: StateMachineConfig) {
    this.config = config;
    this.libConfig = toLibraryConfig(config);
    // Existing sessions keep running against their engine's original config
    // snapshot — hot-reloading routes doesn't retroactively rewrite a live
    // session's state graph, only new sessions pick up the fresh config
    // (same behavior as before this change).
  }

  // ─── Session resolution ───────────────────────────────────────────────────

  resolveSessionKey(headers: Record<string, string>, cookies: Record<string, string>): string {
    if (!this.config.enabled) return '__global__';
    if (this.config.sessionMode === 'global') return '__global__';

    const key = this.config.sessionKey || (this.config.sessionMode === 'header' ? 'X-Session-Id' : 'session_id');
    if (this.config.sessionMode === 'header') {
      return headers[key] || headers[key.toLowerCase()] || '__global__';
    }
    if (this.config.sessionMode === 'cookie') {
      return cookies[key] || '__global__';
    }
    return '__global__';
  }

  private getEngine(sessionKey: string): EngineInstance {
    this.evictExpiredSessions();
    let entry = this.sessions.get(sessionKey);
    if (!entry) {
      const engine = new EngineCtor!(this.libConfig);
      engine.start();
      entry = { engine, lastActivity: Date.now() };
      this.sessions.set(sessionKey, entry);
    }
    entry.lastActivity = Date.now();
    return entry.engine;
  }

  getCurrentState(sessionKey: string): string {
    return this.getEngine(sessionKey).currentState ?? '';
  }

  getVariables(sessionKey: string): Record<string, unknown> {
    return this.getEngine(sessionKey).context;
  }

  // ─── Transition application ───────────────────────────────────────────────

  /**
   * A route's `triggerEvent` (e.g. "PAY") — matched directly against the
   * canvas's own transition graph (config.transitions[].label). No
   * requiredState/newState needed: the graph already knows which states
   * "PAY" is valid from and where it leads, exactly like the canvas's
   * Dispatch Event panel. Used for route-matching gating (does this route
   * apply in the current state) without mutating anything.
   */
  canFireEvent(sessionKey: string, event: string): boolean {
    if (!this.config.enabled) return false;
    return this.getEngine(sessionKey).canSend(event);
  }

  /**
   * Events that CAN fire right now from the session's current state, each
   * with the human-readable name of the state it leads to. Used to tell a
   * caller whose request was gated exactly what their real options are,
   * instead of naming one hardcoded example step.
   */
  getAvailableEvents(sessionKey: string): Array<{ event: string; toState: string }> {
    const current = this.getCurrentState(sessionKey);
    const stateName = (id: string) => this.config.states.find((s) => s.id === id)?.name ?? id;
    const seen = new Set<string>();
    const out: Array<{ event: string; toState: string }> = [];
    for (const t of this.config.transitions) {
      if (t.from !== current) continue;
      const event = t.label || t.routeId;
      if (seen.has(event)) continue;
      seen.add(event);
      out.push({ event, toState: stateName(t.to) });
    }
    return out;
  }

  /**
   * BFS over the transition graph to find the shortest ordered sequence of
   * events that would make `targetEvent` fireable from the session's
   * current state. Returns `[]` if targetEvent is already fireable, `null`
   * if no sequence of events reaches a state that unlocks it.
   */
  findEventPathTo(sessionKey: string, targetEvent: string): string[] | null {
    const start = this.getCurrentState(sessionKey);
    const byFrom = new Map<string, StateTransition[]>();
    for (const t of this.config.transitions) {
      const list = byFrom.get(t.from) ?? [];
      list.push(t);
      byFrom.set(t.from, list);
    }
    const unlocks = (stateId: string) => (byFrom.get(stateId) ?? []).some((t) => (t.label || t.routeId) === targetEvent);

    if (unlocks(start)) return [];

    const visited = new Set<string>([start]);
    const queue: Array<{ state: string; path: string[] }> = [{ state: start, path: [] }];
    while (queue.length > 0) {
      const { state, path } = queue.shift()!;
      for (const t of byFrom.get(state) ?? []) {
        const event = t.label || t.routeId;
        const nextPath = [...path, event];
        if (unlocks(t.to)) return nextPath;
        if (!visited.has(t.to)) {
          visited.add(t.to);
          queue.push({ state: t.to, path: nextPath });
        }
      }
    }
    return null;
  }

  /** Actually fires a route's `triggerEvent` through the real engine. */
  async fireEvent(sessionKey: string, event: string): Promise<boolean> {
    if (!this.config.enabled) return false;
    return this.getEngine(sessionKey).send({ type: event });
  }

  /**
   * Returns the mock response configured on the current state node for the given method + path.
   * Called on every request — state mock responses take precedence over the route's default body.
   */
  getStateResponseForRoute(method: string, path: string, sessionKey: string): { status: number; body: string } | null {
    if (!this.config.enabled) return null;
    return this.getEngine(sessionKey).getResponseForRoute(method, path);
  }

  /** Reset a specific session to initial state */
  resetSession(sessionKey: string) {
    this.sessions.delete(sessionKey);
    this.getEngine(sessionKey);
  }

  /** Reset all sessions */
  resetAll() {
    this.sessions.clear();
  }

  /** Get all active sessions (for debugging) */
  getAllSessions(): Array<{ key: string; state: string; variables: Record<string, unknown> }> {
    return Array.from(this.sessions.entries()).map(([key, entry]) => ({
      key,
      state: entry.engine.currentState ?? '',
      variables: entry.engine.context,
    }));
  }

  private evictExpiredSessions() {
    const now = Date.now();
    for (const [key, entry] of this.sessions.entries()) {
      if (now - entry.lastActivity > this.SESSION_TTL) {
        this.sessions.delete(key);
      }
    }
  }
}
