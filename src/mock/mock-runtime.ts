/**
 * mock-runtime.ts — shared StateMachineRuntime accessor across all mock
 * protocols (REST, GraphQL, gRPC, SOAP). A server can have multiple
 * connected workflows (MockServerConfig.connectedWorkflows) each with its
 * own independent state machine + session tracking — one real engine-backed
 * runtime per (server id, workflow id) pair, keyed so the same workflow
 * looks up the same runtime no matter which protocol-specific handler asks
 * for it.
 */
import { StateMachineRuntime } from './mock-state-machine';
import type { MockServerConfig, StateMachineConfig, MockRoute, GraphQLMockOperation, GrpcMockMethod, SoapMockOperation } from './mock-types';

const runtimes = new Map<string, StateMachineRuntime>();

/**
 * Resolves which connected-workflow id a given route/operation's
 * `triggerEvent` should be checked against:
 *  - explicit `connectedWorkflowId` on the route/operation wins
 *  - else, if the server has exactly one connected workflow, use that one
 *  - else undefined (ambiguous with 2+ workflows and nothing explicit set,
 *    or 0 workflows connected via the new list — falls through to the
 *    legacy singular `stateMachine` field in resolveWorkflowConfig, which
 *    covers hand-authored samples that never populate `connectedWorkflows`)
 */
export function effectiveWorkflowId(
  entity: { connectedWorkflowId?: string } | Pick<MockRoute | GraphQLMockOperation | GrpcMockMethod | SoapMockOperation, 'connectedWorkflowId'>,
  config: MockServerConfig,
): string | undefined {
  if (entity.connectedWorkflowId) return entity.connectedWorkflowId;
  if (config.connectedWorkflows?.length === 1) return config.connectedWorkflows[0].workflowId;
  return undefined;
}

function resolveWorkflowConfig(config: MockServerConfig, workflowId: string | undefined): StateMachineConfig | undefined {
  if (workflowId) {
    return config.connectedWorkflows?.find((w) => w.workflowId === workflowId)?.stateMachine;
  }
  return config.stateMachine;
}

/**
 * Lazily creates/updates the state machine runtime for a (server, workflow)
 * pair. Returns null if that workflow has no state machine enabled.
 */
export function getStateMachineRuntime(
  serverId: string,
  workflowId: string | undefined,
  config: MockServerConfig,
): StateMachineRuntime | null {
  const stateMachine = resolveWorkflowConfig(config, workflowId);
  if (!stateMachine?.enabled) return null;

  const key = `${serverId}::${workflowId ?? '__default__'}`;
  const existing = runtimes.get(key);
  if (!existing) {
    const runtime = new StateMachineRuntime(stateMachine);
    runtimes.set(key, runtime);
    return runtime;
  }
  existing.updateConfig(stateMachine);
  return existing;
}

export function disposeStateMachineRuntime(serverId: string): void {
  const prefix = `${serverId}::`;
  for (const key of runtimes.keys()) {
    if (key.startsWith(prefix)) runtimes.delete(key);
  }
}
