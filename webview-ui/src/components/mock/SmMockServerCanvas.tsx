/**
 * SmMockServerCanvas — embeds @salilvnair/state-machine inside the REST (and SOAP)
 * mock server's "State Machine" tab.
 *
 * Provides:
 *  - Full visual canvas with workflow list (right-side SideNav)
 *  - "Copy Workflow ID" → copies UUID to clipboard
 *  - "Connect to Mock Server" → converts canvas nodes/edges to MockServer.stateMachine
 *    + stores connectedWorkflowId on the server so routes can reference states
 */
import { lazy, Suspense, useCallback } from 'react'
import { useSMWorkspaceStore } from '@salilvnair/state-machine'
import type { SMachine } from '@salilvnair/state-machine'
import type { MockServer, StateMachineConfig, StateNode, StateTransition } from './mock-types'

// State machine canvas CSS (not re-exported by the library — must import from src directly)
import '@salilvnair/state-machine/src/style/tokens.css'
import '@salilvnair/state-machine/src/style/ck8t-blocks.css'
import '@salilvnair/state-machine/src/style/canvas.css'
// ReactFlow base styles (required by @xyflow/react)
import '@xyflow/react/dist/style.css'

const StateMachineWorkspace = lazy(() =>
  import('@salilvnair/state-machine').then((m) => ({ default: m.StateMachineWorkspace })),
)

interface Props {
  server: MockServer
  onUpdate: (patch: Partial<MockServer>) => void
}

/** Convert SM library nodes/edges → Daakia mock server StateMachineConfig */
function workflowToMockConfig(machine: SMachine): StateMachineConfig {
  const nodes = machine.nodes ?? []
  const edges = machine.edges ?? []

  const states: StateNode[] = nodes.map((n) => {
    const data = n.data as Record<string, unknown>
    const nodeType = data.nodeType as string
    const pos = n.position as { x: number; y: number } | undefined
    return {
      id: n.id,
      name: (data.label as string) ?? n.id,
      x: pos?.x ?? 0,
      y: pos?.y ?? 0,
      isInitial: nodeType === 'trigger',
      color: nodeTypeToColor(nodeType),
    }
  })

  const transitions: StateTransition[] = edges.map((e) => ({
    id: e.id,
    from: e.source as string,
    to: e.target as string,
    routeId: '',   // user wires this in Routes tab per route
    label: ((e.data as Record<string, unknown>)?.event as string) ?? '',
  }))

  const triggerNode = nodes.find((n) => (n.data as Record<string, unknown>)?.nodeType === 'trigger')

  return {
    enabled: true,
    states,
    transitions,
    sessionMode: 'header',
    sessionKey: 'X-Session-ID',
    defaultState: triggerNode?.id ?? (nodes[0]?.id ?? 'initial'),
  }
}

function nodeTypeToColor(nodeType: string): string {
  const map: Record<string, string> = {
    trigger:   '#22c55e',
    state:     '#6366f1',
    condition: '#f59e0b',
    function:  '#22d3ee',
    terminal:  '#ef4444',
  }
  return map[nodeType] ?? '#6366f1'
}

export function SmMockServerCanvas({ server, onUpdate }: Props) {
  const handleCopyId = useCallback((machine: SMachine) => {
    navigator.clipboard.writeText(machine.id).catch(() => {})
  }, [])

  const handleConnect = useCallback((machine: SMachine) => {
    const ws = useSMWorkspaceStore.getState()
    const canvasMachine = ws.machines.find((m) => m.id === machine.id) ?? machine
    const cfg = workflowToMockConfig(canvasMachine)
    onUpdate({
      stateMachine: cfg,
      connectedWorkflowId: machine.id,
    })
  }, [onUpdate])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Connection status badge */}
      {server.connectedWorkflowId && (
        <div style={{
          position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
          zIndex: 10, display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
          borderRadius: 20, padding: '3px 10px', fontSize: 11, color: '#86efac',
          fontWeight: 600, pointerEvents: 'none',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
          Connected — {server.stateMachine?.states?.length ?? 0} states imported
        </div>
      )}

      <Suspense fallback={
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'color-mix(in srgb, var(--color-text-primary) 40%, transparent)' }}>
          Loading canvas…
        </div>
      }>
        <StateMachineWorkspace
          onCopyWorkflowId={handleCopyId}
          onConnectWorkflow={handleConnect}
        />
      </Suspense>
    </div>
  )
}
