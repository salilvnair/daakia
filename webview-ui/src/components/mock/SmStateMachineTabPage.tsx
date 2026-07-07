/**
 * SmStateMachineTabPage — full-screen state machine workspace rendered as a
 * first-class Daakia tab (type: 'state-machine').
 *
 * Opened via useTabsStore.getState().openStateMachineTab(serverId).
 * When the user right-clicks a workflow and clicks "Connect to Mock Server",
 * this component:
 *   1. Converts the SMachine canvas nodes/edges → Daakia MockServer.stateMachine
 *   2. Updates the linked mock server in useMockStore (in-memory)
 *   3. Posts mockServer:patchStateMachine to extension host (persists immediately)
 */
import { lazy, Suspense, useCallback, useEffect, useMemo } from 'react'
import { useSMWorkspaceStore, useSMStore } from '@salilvnair/state-machine'
import type { SMachine } from '@salilvnair/state-machine'
import { IconButtonView } from '@salilvnair/dui'
import { useTabsStore } from '../../store/tabs-store'
import { useMockStore } from '../../store/mock-store'
import type { MockServer, StateMachineConfig, StateNode, StateTransition, ConnectedWorkflow, StateMockResponse } from './mock-types'
import { postMsg } from '../../vscode'
import { DisconnectIcon } from '../../icons'
import { logUiEvent } from '../../store/ui-audit-store'

// Canvas CSS (not re-exported by the library — import from source directly)
import '@salilvnair/state-machine/src/style/tokens.css'
import '@salilvnair/state-machine/src/style/ck8t-blocks.css'
import '@salilvnair/state-machine/src/style/canvas.css'
import '@xyflow/react/dist/style.css'

const StateMachineWorkspace = lazy(() =>
  import('@salilvnair/state-machine').then((m) => ({ default: m.StateMachineWorkspace })),
)

interface Props {
  tabId: string
}

function workflowToMockConfig(machine: SMachine): StateMachineConfig {
  const nodes = machine.nodes ?? []
  const edges = machine.edges ?? []

  const states: StateNode[] = nodes.map((n) => {
    const data = n.data as Record<string, unknown>
    const nodeType = data.nodeType as string
    const pos = n.position as { x: number; y: number } | undefined
    const rawMockResponses = (data.mockResponses ?? []) as Array<{
      method?: string; path?: string; status?: number; body?: string
    }>
    const mockResponses: StateMockResponse[] = rawMockResponses
      .filter((r) => r.method && r.path)
      .map((r) => ({
        method: r.method as StateMockResponse['method'],
        path: r.path!,
        status: r.status ?? 200,
        body: r.body ?? '',
      }))
    return {
      id: n.id,
      name: (data.label as string) ?? n.id,
      x: pos?.x ?? 0,
      y: pos?.y ?? 0,
      isInitial: nodeType === 'trigger',
      color: nodeTypeToColor(nodeType),
      ...(mockResponses.length > 0 ? { mockResponses } : {}),
    }
  })

  const transitions: StateTransition[] = edges.map((e) => ({
    id: e.id,
    from: e.source as string,
    to: e.target as string,
    routeId: '',
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

export function SmStateMachineTabPage({ tabId }: Props) {
  const smLinkedServerId = useTabsStore(s => s.tabs.find(t => t.id === tabId)?.smLinkedServerId)
  const linkedServer = useMockStore(s => s.servers.find(srv => srv.id === smLinkedServerId))
  // Suggestions from the linked server's own routes — only relevant paths, no URL history noise
  const urlSuggestions = useMemo(() => {
    if (!linkedServer?.routes?.length) return []
    const paths = new Set<string>()
    for (const route of linkedServer.routes) {
      if (route.path) paths.add(route.path)
    }
    return [...paths]
  }, [linkedServer?.routes])
  const connectedWorkflowIds = (linkedServer?.connectedWorkflows ?? []).map(w => w.workflowId)

  // Count of connected workflows (multi-workflow model)
  const connectedWorkflows = linkedServer?.connectedWorkflows ?? []
  const hasAnyConnection = connectedWorkflows.length > 0 || !!linkedServer?.connectedWorkflowId

  // Live node count for the legacy single-connected machine (used in banner fallback)
  const connectedMachineNodeCount = useSMWorkspaceStore(s => {
    const id = linkedServer?.connectedWorkflowId
    if (!id) return 0
    return s.machines.find(m => m.id === id)?.nodes?.length ?? 0
  })

  // For auto-disconnect: watch whether the connected workflow is ACTIVE on canvas AND canvas is empty
  const activeMachineId = useSMWorkspaceStore(s => s.activeMachineId)
  const canvasNodeCount = useSMStore(s => s.nodes.length)
  const canvasEdgeCount = useSMStore(s => s.edges.length)

  const handleCopyId = useCallback((machine: SMachine) => {
    navigator.clipboard.writeText(machine.id).catch(() => {})
  }, [])

  const handleConnect = useCallback((machine: SMachine) => {
    if (!smLinkedServerId) return
    logUiEvent('mock.sm_link', { workflowId: machine.id, serverId: smLinkedServerId })

    const ws = useSMWorkspaceStore.getState()
    const canvasMachine = ws.machines.find((m) => m.id === machine.id) ?? machine
    const cfg = workflowToMockConfig(canvasMachine)

    const existing: ConnectedWorkflow[] = linkedServer?.connectedWorkflows ?? []
    // Replace if already in list, otherwise append
    const updated: ConnectedWorkflow[] = [
      ...existing.filter(w => w.workflowId !== machine.id),
      { workflowId: machine.id, name: machine.name, stateMachine: cfg },
    ]

    const patch: Partial<MockServer> = {
      connectedWorkflows: updated,
      // Keep legacy fields in sync for backward-compat with extension host SM engine
      stateMachine: cfg,
      connectedWorkflowId: machine.id,
    }

    useMockStore.getState().updateServer(smLinkedServerId, patch)
    postMsg({ type: 'mockServer:patchStateMachine', serverId: smLinkedServerId, ...patch })
  }, [smLinkedServerId, linkedServer?.connectedWorkflows])

  // Unlink ALL workflows (clears the server completely)
  const handleUnlink = useCallback(() => {
    if (!smLinkedServerId) return
    logUiEvent('mock.sm_unlink', { serverId: smLinkedServerId })
    const patch: Partial<MockServer> = { stateMachine: undefined, connectedWorkflowId: undefined, connectedWorkflows: [] }
    useMockStore.getState().updateServer(smLinkedServerId, patch)
    postMsg({ type: 'mockServer:patchStateMachine', serverId: smLinkedServerId, stateMachine: null, connectedWorkflowId: null, connectedWorkflows: [] })
  }, [smLinkedServerId])

  // Unlink a specific workflow by ID
  const handleUnlinkWorkflow = useCallback((machine: SMachine) => {
    if (!smLinkedServerId) return
    const existing: ConnectedWorkflow[] = linkedServer?.connectedWorkflows ?? []
    const updated = existing.filter(w => w.workflowId !== machine.id)
    // If this was also the legacy single-connected workflow, clear those too
    const wasLegacy = linkedServer?.connectedWorkflowId === machine.id
    const patch: Partial<MockServer> = {
      connectedWorkflows: updated,
      ...(wasLegacy ? { stateMachine: undefined, connectedWorkflowId: undefined } : {}),
    }
    useMockStore.getState().updateServer(smLinkedServerId, patch)
    postMsg({ type: 'mockServer:patchStateMachine', serverId: smLinkedServerId, ...patch,
      ...(wasLegacy ? { stateMachine: null, connectedWorkflowId: null } : {}) })
  }, [smLinkedServerId, linkedServer?.connectedWorkflows, linkedServer?.connectedWorkflowId])

  // Auto-disconnect: only when the connected workflow is the ACTIVE canvas tab AND canvas is empty.
  // Guard: if the workspace store still has nodes for this machine but the canvas is empty, it
  // means the machine was never opened this session — don't auto-disconnect. This prevents the
  // first-time connect bug where activeMachineId auto-initialises to machines[0] on workspace
  // load before the canvas has loaded anything.
  useEffect(() => {
    if (!linkedServer?.connectedWorkflowId) return
    if (activeMachineId !== linkedServer.connectedWorkflowId) return // user is on a different tab
    if (canvasNodeCount > 0 || canvasEdgeCount > 0) return // canvas has content — keep connected
    if (connectedMachineNodeCount > 0) return // machine has saved nodes but hasn't been opened yet
    // Canvas is empty AND workspace store is also empty → genuine empty machine → auto-disconnect
    handleUnlink()
  }, [linkedServer?.connectedWorkflowId, activeMachineId, canvasNodeCount, canvasEdgeCount, connectedMachineNodeCount, handleUnlink])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Server link banner */}
      {linkedServer && (
        <div style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
          padding: '3px 10px 3px 14px',
          borderBottom: '1px solid rgba(245,158,11,0.18)',
          background: hasAnyConnection
            ? 'rgba(34,197,94,0.07)'
            : 'rgba(245,158,11,0.07)',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: hasAnyConnection ? '#22c55e' : '#f59e0b',
          }} />
          <span style={{
            fontSize: 11, fontWeight: 600, flex: 1,
            color: hasAnyConnection ? '#86efac' : '#fcd34d',
          }}>
            {hasAnyConnection
              ? `Connected to "${linkedServer.name}" — ${connectedWorkflows.length || 1} workflow${(connectedWorkflows.length || 1) !== 1 ? 's' : ''}`
              : `Linked to "${linkedServer.name}" — right-click a workflow → Connect to Mock Server`}
          </span>
          {hasAnyConnection && (
            <IconButtonView
              size="xs"
              icon={<DisconnectIcon size={11} />}
              title="Unlink all workflows"
              accentColor="var(--color-warning)"
              onClick={handleUnlink}
            />
          )}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Suspense fallback={
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'color-mix(in srgb, var(--color-text-primary) 40%, transparent)' }}>
            Loading canvas…
          </div>
        }>
          <StateMachineWorkspace
            onCopyWorkflowId={handleCopyId}
            onConnectWorkflow={smLinkedServerId ? handleConnect : undefined}
            onUnlinkWorkflow={smLinkedServerId ? handleUnlinkWorkflow : undefined}
            urlSuggestions={urlSuggestions}
            connectedWorkflowIds={smLinkedServerId ? connectedWorkflowIds : undefined}
          />
        </Suspense>
      </div>
    </div>
  )
}
