/**
 * mock-state-machine.ts — Stateful behavior runtime for WireMock-grade mocking.
 * Implements 6A.11: named states, transitions triggered by requests, state variables, session tracking.
 */
import type { StateMachineConfig, StateTransition } from './mock-types';

interface SessionState {
  currentState: string;
  variables: Record<string, unknown>;
  createdAt: number;
  lastActivity: number;
}

/**
 * StateMachineRuntime manages per-session state for a single mock server.
 * Sessions are identified by cookie / header value (or a global singleton).
 */
export class StateMachineRuntime {
  private config: StateMachineConfig;
  private sessions = new Map<string, SessionState>();
  private readonly SESSION_TTL = 30 * 60 * 1000; // 30 min idle expiry

  constructor(config: StateMachineConfig) {
    this.config = config;
  }

  updateConfig(config: StateMachineConfig) {
    this.config = config;
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

  getSession(sessionKey: string): SessionState {
    this.evictExpiredSessions();
    if (!this.sessions.has(sessionKey)) {
      this.sessions.set(sessionKey, {
        currentState: this.config.defaultState || 'initial',
        variables: {},
        createdAt: Date.now(),
        lastActivity: Date.now(),
      });
    }
    const session = this.sessions.get(sessionKey)!;
    session.lastActivity = Date.now();
    return session;
  }

  getCurrentState(sessionKey: string): string {
    return this.getSession(sessionKey).currentState;
  }

  getVariables(sessionKey: string): Record<string, unknown> {
    return this.getSession(sessionKey).variables;
  }

  // ─── Transition application ───────────────────────────────────────────────

  /**
   * Given a matched routeId and sessionKey, find and apply the transition (if any).
   * Returns the new state name, or null if no transition fired.
   */
  applyTransition(routeId: string, sessionKey: string, variableUpdates?: Record<string, string>): string | null {
    if (!this.config.enabled) return null;

    const session = this.getSession(sessionKey);
    const currentState = session.currentState;

    const transition = this.findTransition(routeId, currentState);
    if (!transition) return null;

    // Apply state variable updates
    if (variableUpdates) {
      Object.entries(variableUpdates).forEach(([k, v]) => {
        // Support expressions like: counter + 1
        if (v.includes('+') || v.includes('-')) {
          const parts = v.split(/([+-])/);
          const base = session.variables[parts[0].trim()];
          const op = parts[1];
          const amount = parseFloat(parts[2].trim());
          const current = parseFloat(String(base ?? 0));
          session.variables[k] = op === '+' ? current + amount : current - amount;
        } else {
          session.variables[k] = v;
        }
      });
    }

    // Transition to new state
    session.currentState = transition.to;
    return transition.to;
  }

  private findTransition(routeId: string, currentState: string): StateTransition | undefined {
    return this.config.transitions.find(t =>
      t.routeId === routeId && t.from === currentState,
    );
  }

  /**
   * Check if a route is accessible in the current state.
   * Returns true if route has no requiredState OR currentState matches.
   */
  routeAllowedInState(requiredState: string | undefined, sessionKey: string): boolean {
    if (!this.config.enabled || !requiredState) return true;
    return this.getCurrentState(sessionKey) === requiredState;
  }

  /** Reset a specific session to initial state */
  resetSession(sessionKey: string) {
    this.sessions.set(sessionKey, {
      currentState: this.config.defaultState || 'initial',
      variables: {},
      createdAt: Date.now(),
      lastActivity: Date.now(),
    });
  }

  /** Reset all sessions */
  resetAll() {
    this.sessions.clear();
  }

  /** Get all active sessions (for debugging) */
  getAllSessions(): Array<{ key: string; state: string; variables: Record<string, unknown> }> {
    return Array.from(this.sessions.entries()).map(([key, s]) => ({
      key,
      state: s.currentState,
      variables: s.variables,
    }));
  }

  private evictExpiredSessions() {
    const now = Date.now();
    for (const [key, session] of this.sessions.entries()) {
      if (now - session.lastActivity > this.SESSION_TTL) {
        this.sessions.delete(key);
      }
    }
  }
}
