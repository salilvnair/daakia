/**
 * SmWorkflowDashboard — shown in the State Machine sub-tab of ServerDetail.
 *
 * Supports multi-workflow: renders one card per ConnectedWorkflow entry.
 * Falls back to legacy single-workflow (connectedWorkflowId) if connectedWorkflows is empty.
 */
import { useMemo } from 'react'
import { ButtonView, IconButtonView } from '@salilvnair/dui'
import { useSMWorkspaceStore } from '@salilvnair/state-machine'
import type { SMachine } from '@salilvnair/state-machine'
import { StateMachineIcon, DisconnectIcon } from '@salilvnair/dui'
import type { MockServer, ConnectedWorkflow } from './mock-types'
import { getMockProtocolColor, getMockProtocolLabel } from '../../colors'
import type { MockServerProtocol } from '../../colors'

interface Props {
  server: MockServer
  onOpenEditor: (workflowId?: string) => void
  onConnectNew?: () => void
  onUnlink: () => void
  onUnlinkWorkflow?: (workflowId: string) => void
}

const SM_AMBER = 'var(--color-sm-tab, #f59e0b)'

// ── helpers — read from live SMachine ────────────────────────────────────────

function blockTypesFromMachine(machine: SMachine): string[] {
  const ORDER = ['TRIGGER', 'STATE', 'CONDITION', 'FUNCTION', 'TERMINAL']
  const seen = new Set<string>()
  for (const n of machine.nodes ?? []) {
    const t = (n.data?.nodeType as string)?.toUpperCase()
    if (t) seen.add(t)
  }
  return Array.from(seen).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
}

function eventsFromMachine(machine: SMachine): string[] {
  const seen = new Set<string>()
  for (const e of machine.edges ?? []) {
    const ev = ((e.data as Record<string, unknown>)?.event as string)?.trim().toUpperCase()
    if (ev) seen.add(ev)
  }
  return Array.from(seen).slice(0, 6)
}

function subtitleFromMachine(machine: SMachine): string {
  return (machine.nodes ?? []).map((n) => (n.data?.label as string) ?? '').filter(Boolean).slice(0, 5).join(' → ')
}

// ── chip components ───────────────────────────────────────────────────────────

function BlockChip({ label }: { label: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 6px', borderRadius: 4,
      fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
      border: '1px solid rgba(255,255,255,0.15)',
      color: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.03)',
    }}>
      {label}
    </span>
  )
}

function EventChip({ label, filled, accent }: { label: string; filled?: boolean; accent: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 6px', borderRadius: 4,
      fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
      border: `1px solid ${accent}`,
      color: filled ? '#000' : accent,
      background: filled ? accent : `${accent}18`,
    }}>
      {label}
    </span>
  )
}

function RouteChip({ label }: { label: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 6px', borderRadius: 4,
      fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
      border: '1px solid rgba(139,92,246,0.4)',
      color: '#a78bfa', background: 'rgba(139,92,246,0.08)',
    }}>
      {label}
    </span>
  )
}

// ── single workflow card ──────────────────────────────────────────────────────

interface WorkflowCardProps {
  index: number
  workflow: ConnectedWorkflow
  server: MockServer
  protocolColor: string
  protocolLabel: string
  onUnlink?: () => void
  onOpenEditor: (workflowId?: string) => void
}

function WorkflowCard({ index, workflow, protocolColor, protocolLabel, onUnlink, onOpenEditor }: WorkflowCardProps) {
  const machine = useSMWorkspaceStore((s) =>
    s.machines.find((m) => m.id === workflow.workflowId)
  )

  const blockTypes = useMemo(
    () => machine ? blockTypesFromMachine(machine) : [],
    [machine],
  )
  const events = useMemo(
    () => machine ? eventsFromMachine(machine) : [],
    [machine],
  )
  const subtitle = useMemo(
    () => machine ? subtitleFromMachine(machine) : '',
    [machine],
  )

  const totalNodes      = machine ? (machine.nodes ?? []).length : (workflow.stateMachine?.states?.length ?? 0)
  const stateCount      = machine
    ? (machine.nodes ?? []).filter((n) => (n.data?.nodeType as string) === 'state').length
    : (workflow.stateMachine?.states ?? []).filter(s => !s.isInitial && s.color !== '#ef4444').length
  const transitionCount = machine ? (machine.edges ?? []).length : (workflow.stateMachine?.transitions?.length ?? 0)

  return (
    <div style={{
      borderRadius: 8, border: '1px solid rgba(255,255,255,0.07)',
      background: 'rgba(255,255,255,0.025)', overflow: 'hidden',
    }}>
      {/* left accent bar + content row */}
      <div style={{ display: 'flex' }}>
        <div style={{ width: 3, flexShrink: 0, background: protocolColor }} />
        <div style={{ flex: 1, padding: '9px 12px', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>

          {/* row 1: index · protocol · name · unlink */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.2)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
              {String(index).padStart(2, '0')}
            </span>
            <span style={{
              padding: '1px 7px', borderRadius: 4, flexShrink: 0,
              fontSize: 9, fontWeight: 800, letterSpacing: '0.06em',
              border: `1px solid ${protocolColor}`, color: protocolColor, background: `${protocolColor}15`,
            }}>
              {protocolLabel}
            </span>
            <span style={{
              fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary, #f2f6fa)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
            }}>
              {workflow.name}
            </span>
            {onUnlink && (
              <IconButtonView
                size="xs"
                icon={<DisconnectIcon size={10} />}
                title="Unlink this workflow"
                accentColor="var(--color-error)"
                onClick={onUnlink}
              />
            )}
          </div>

          {/* row 2: subtitle (state flow) */}
          {subtitle && (
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic', lineHeight: 1.3 }}>
              {subtitle}
            </div>
          )}

          {/* row 3: chips row — blocks + events + route/event inline */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
            {blockTypes.map((t) => <BlockChip key={t} label={t} />)}
            {events.length > 0 && (
              <EventChip label={`${events.length} EVENT${events.length !== 1 ? 'S' : ''}`} filled accent={protocolColor} />
            )}
            {events.map((e) => <EventChip key={e} label={e} accent={protocolColor} />)}
            {workflow.routePattern && <RouteChip label={workflow.routePattern} />}
            {workflow.event && <EventChip label={workflow.event} accent={protocolColor} />}
          </div>

          {/* row 4: counts + open editor */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)' }}>
              {stateCount}s · {totalNodes}n · {transitionCount}t
            </span>
            <button
              onClick={() => onOpenEditor(workflow.workflowId)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 700, color: protocolColor, padding: 0, opacity: 0.8 }}
            >
              Open Editor →
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}

// ── legacy single card (backward-compat) ──────────────────────────────────────

function LegacySingleCard({ server, onOpenEditor, onUnlink }: Props) {
  const machine = useSMWorkspaceStore((s) =>
    s.machines.find((m) => m.id === server.connectedWorkflowId)
  )
  const protocolColor = getMockProtocolColor((server.protocol ?? 'rest') as MockServerProtocol)
  const protocolLabel = getMockProtocolLabel((server.protocol ?? 'rest') as MockServerProtocol)

  const legacyWorkflow: ConnectedWorkflow = {
    workflowId: server.connectedWorkflowId!,
    name: machine?.name ?? 'Connected Workflow',
    stateMachine: server.stateMachine,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto', padding: '10px 14px', gap: 6 }}>
      <WorkflowCard
        index={1}
        workflow={legacyWorkflow}
        server={server}
        protocolColor={protocolColor}
        protocolLabel={protocolLabel}
        onUnlink={onUnlink}
        onOpenEditor={onOpenEditor}
      />
      <div style={{ display: 'flex', gap: 6, paddingTop: 2 }}>
        <ButtonView size="sm" variant="ghost" accentColor={protocolColor} onClick={() => (onConnectNew ?? onOpenEditor)()} style={{ flex: 1 }}>
          + Connect Another Workflow
        </ButtonView>
      </div>
    </div>
  )
}

// ── empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onOpenEditor }: { onOpenEditor: () => void }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
      <StateMachineIcon size={32} style={{ color: SM_AMBER, opacity: 0.5 }} />
      <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>No workflow connected</div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center', maxWidth: 220 }}>
        Open the State Machine editor, design a flow, then right-click a workflow to connect it here.
      </div>
      <ButtonView size="md" variant="ghost" accentColor={SM_AMBER} onClick={onOpenEditor}>
        Open State Machine Editor
      </ButtonView>
    </div>
  )
}

// ── main export ───────────────────────────────────────────────────────────────

export function SmWorkflowDashboard({ server, onOpenEditor, onConnectNew, onUnlink, onUnlinkWorkflow }: Props) {
  const protocolColor = getMockProtocolColor((server.protocol ?? 'rest') as MockServerProtocol)
  const protocolLabel = getMockProtocolLabel((server.protocol ?? 'rest') as MockServerProtocol)

  const connectedWorkflows = server.connectedWorkflows ?? []

  // Multi-workflow mode: render list of cards
  if (connectedWorkflows.length > 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto', padding: '10px 14px', gap: 6 }}>
        {connectedWorkflows.map((wf, i) => (
          <WorkflowCard
            key={wf.workflowId}
            index={i + 1}
            workflow={wf}
            server={server}
            protocolColor={protocolColor}
            protocolLabel={protocolLabel}
            onUnlink={onUnlinkWorkflow ? () => onUnlinkWorkflow(wf.workflowId) : undefined}
            onOpenEditor={onOpenEditor}
          />
        ))}

        {/* action row */}
        <div style={{ display: 'flex', gap: 6, paddingTop: 2 }}>
          <ButtonView size="sm" variant="ghost" accentColor={protocolColor} onClick={() => (onConnectNew ?? onOpenEditor)()} style={{ flex: 1 }}>
            + Connect Another Workflow
          </ButtonView>
          <IconButtonView
            size="sm"
            icon={<DisconnectIcon size={11} />}
            title="Unlink all workflows"
            accentColor="var(--color-error)"
            onClick={onUnlink}
          />
        </div>
      </div>
    )
  }

  // Legacy single-workflow backward-compat
  if (server.connectedWorkflowId) {
    return <LegacySingleCard server={server} onOpenEditor={onOpenEditor} onUnlink={onUnlink} />
  }

  return <EmptyState onOpenEditor={onOpenEditor} />
}
