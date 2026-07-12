/**
 * workflowToMockConfig — converts a @salilvnair/state-machine canvas workflow
 * into Daakia's MockServer.stateMachine config on "Connect to Mock Server".
 *
 * Regression coverage for a real bug: the canvas node Inspector has a
 * user-facing "State ID" field (placeholder "e.g. idle, fetching, success"),
 * but the conversion originally used each node's raw ReactFlow id
 * (e.g. "state_1782141662744") instead — so anything the user typed into
 * "State ID" was silently ignored by the running mock server: routes wired
 * against the friendly id in the route's Trigger Event selector would never gate/transition,
 * and a state's "Mock Responses" (Advanced tab) would never fire.
 */
import { describe, it, expect } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import type { SMachine, SMNodeData } from '@salilvnair/state-machine';
import { workflowToMockConfig } from '../components/mock/SmMockServerCanvas';

function node(id: string, nodeType: SMNodeData['nodeType'], label: string, stateId?: string, mockResponses?: SMNodeData['mockResponses']): Node<SMNodeData> {
  return {
    id,
    type: nodeType,
    position: { x: 0, y: 0 },
    data: { nodeType, label, stateId, mockResponses },
  };
}

function edge(id: string, source: string, target: string, event: string): Edge {
  return { id, source, target, data: { event } };
}

function machine(nodes: Node<SMNodeData>[], edges: Edge[]): SMachine {
  return { id: 'm1', name: 'test', color: '#000', folderId: null, nodes, edges, createdAt: 0, updatedAt: 0 };
}

describe('workflowToMockConfig', () => {
  it('uses the friendly "State ID" as the state\'s id when the user set one', () => {
    const m = machine(
      [node('trigger_1', 'trigger', 'Start'), node('state_1', 'state', 'Logged In', 'idle')],
      [],
    );
    const cfg = workflowToMockConfig(m);
    const loggedIn = cfg.states.find(s => s.name === 'Logged In');
    expect(loggedIn?.id).toBe('idle');
    expect(loggedIn?.id).not.toBe('state_1');
  });

  it('falls back to the raw node id when "State ID" is left blank', () => {
    const m = machine(
      [node('trigger_1', 'trigger', 'Start'), node('state_1', 'state', 'Logged In')],
      [],
    );
    const cfg = workflowToMockConfig(m);
    const loggedIn = cfg.states.find(s => s.name === 'Logged In');
    expect(loggedIn?.id).toBe('state_1');
  });

  it('carries the state node\'s Mock Responses through (previously dropped entirely)', () => {
    const mockResponses = [{ method: 'GET' as const, path: '/', status: 200, body: '{}' }];
    const m = machine(
      [node('trigger_1', 'trigger', 'Start'), node('state_1', 'state', 'Logged In', 'logged_in', mockResponses)],
      [],
    );
    const cfg = workflowToMockConfig(m);
    const loggedIn = cfg.states.find(s => s.name === 'Logged In');
    expect(loggedIn?.mockResponses).toEqual(mockResponses);
  });

  it('resolves transition from/to through the same effective (friendly) ids as the states array', () => {
    const m = machine(
      [
        node('trigger_1', 'trigger', 'Start', 'logged_out'),
        node('state_1', 'state', 'Logged In', 'logged_in'),
      ],
      [edge('e1', 'trigger_1', 'state_1', 'LOGIN')],
    );
    const cfg = workflowToMockConfig(m);
    expect(cfg.transitions[0].from).toBe('logged_out');
    expect(cfg.transitions[0].to).toBe('logged_in');
    // Every transition endpoint must correspond to an actual entry in `states`,
    // otherwise applyTransition()'s `t.from === currentState` join can never match.
    const stateIds = new Set(cfg.states.map(s => s.id));
    expect(stateIds.has(cfg.transitions[0].from)).toBe(true);
    expect(stateIds.has(cfg.transitions[0].to)).toBe(true);
  });

  it('defaultState uses the trigger node\'s effective (friendly) id, not its raw node id', () => {
    const m = machine(
      [node('trigger_1', 'trigger', 'Start', 'logged_out'), node('state_1', 'state', 'Logged In', 'logged_in')],
      [],
    );
    const cfg = workflowToMockConfig(m);
    expect(cfg.defaultState).toBe('logged_out');
  });
});
