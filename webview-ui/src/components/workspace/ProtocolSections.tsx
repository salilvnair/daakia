/**
 * A workspace's collections and history, per protocol.
 *
 * ── What this is, and is not ──
 *
 * It is a set of collapsible protocol rows. Inside each one is the *real*
 * sidebar panel for that protocol — the same component, with its own search,
 * its own right-click menus, its own drag-and-drop, its own date grouping and
 * its own everything else.
 *
 * It is not a re-implementation of those panels. A first attempt drew its own
 * tree and its own history rows, which meant a request opened from here had no
 * context menu, no rename, no duplicate, no "add to mock server" — the same
 * list of requests behaved differently depending on which screen you found it
 * on. The panels are the behaviour; this only decides which of them is on
 * screen.
 *
 * ── Why a section is only mounted when it is open ──
 *
 * Seven CollectionsPanels mounted at once is seven trees, seven subscriptions
 * and seven of every keyboard handler they register. The counts come from the
 * sidebar cache instead, which is already fetched for every protocol, so a
 * heading can say how much is inside without the inside existing yet.
 */
import { useEffect, useState } from 'react';
import { ButtonView, IconButtonView } from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { useWorkspaceEditable } from '../../store/workspace-store';
import { READ_ONLY_REASON } from '../../services/workspace/editable';
import { useSidebarDataStore } from '../../store/sidebar-data-store';
import { useUiStateStore } from '../../store/ui-state-store';
import { useEnvStore } from '../../store/env-store';
import { getProtocolAccent } from '../../colors/daakia-colors';
import { CollectionsPanel } from '../rest/sidebar/CollectionsPanel';
import { HistoryPanel } from '../rest/sidebar/HistoryPanel';
import { EnvironmentsPanel } from '../rest/sidebar/EnvironmentsPanel';
import { ChevronRightIcon, ChevronDownIcon, CollectionsFolderIcon, ClockIcon, PlusIcon, FolderPlusIcon, CloseIcon } from '../../icons';
import type { Protocol } from '../../store/tabs-store';
import './workspace.css';

/** The last ask each page answered, kept across its mounts. */
const answeredSignals = new Map<string, number>();

/**
 * Call `onAsk` once for each new value of `signal`.
 *
 * The naive `if (signal > 0)` fires on every mount, and the value is already
 * above zero once the button has been used, so a tab switch reopened the
 * dialog with nobody having asked. Taking the value at mount as the baseline
 * fixed that and broke the Overview's New collection and New environment: one
 * click switches to the tab and bumps the counter, so the page mounts already
 * holding the new value and never fired. What has been answered is remembered
 * per page instead, outside any one mount.
 */
function useCreateSignal(page: string, signal: number, onAsk: () => void) {
  useEffect(() => {
    if (signal === (answeredSignals.get(page) ?? 0)) return;
    answeredSignals.set(page, signal);
    onAsk();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal]);
}

/** Every protocol that can own a collection, in rail order. */
export const PROTOCOLS: { id: Protocol; label: string }[] = [
  { id: 'rest', label: 'REST' },
  { id: 'graphql', label: 'GraphQL' },
  { id: 'websocket', label: 'Realtime' },
  { id: 'grpc', label: 'gRPC' },
  { id: 'soap', label: 'SOAP' },
  { id: 'ai', label: 'AI' },
  { id: 'mcp', label: 'MCP' },
];

interface TreeNode {
  id: string;
  name: string;
  children?: TreeNode[];
  requests?: unknown[];
}

function countRequests(node: TreeNode): number {
  return (node.requests?.length ?? 0)
    + (node.children ?? []).reduce((n, c) => n + countRequests(c as TreeNode), 0);
}

// ── The protocol row ─────────────────────────────────────────────────────────

function ProtocolRow({ label, accent, count, open, onToggle, onAdd, children }: {
  label: string; accent: string; count: number;
  open: boolean; onToggle: () => void;
  /** A new collection in this protocol, named in its own tree. */
  onAdd?: () => void;
  children: React.ReactNode;
}) {
  return (
    /* The row re-points --color-accent at its own protocol, so everything
       inside it -- the panel's search box, its focus rings, its scrollbars --
       is that protocol's colour. The app sets --color-accent per tab, which on
       this screen is the workspace's teal for all seven rows; a GraphQL panel
       lighting up in another protocol's colour is the kind of wrong that only
       reads as sloppiness. Set here rather than passed down because it reaches
       every descendant through the cascade, including the ones this file does
       not render itself. */
    <div className={`ws-proto-sec${open ? ' ws-proto-sec--open' : ''}`}
         style={{ '--color-accent': accent } as React.CSSProperties}>
      <div className="ws-proto-headrow">
        <button type="button" className="ws-proto-head" onClick={onToggle}>
          {open ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
          <span className="ws-proto-name" style={{ color: accent }}>{label}</span>
          <span
            className="ws-proto-n"
            style={{ color: accent, background: `color-mix(in srgb, ${accent} 15%, transparent)` }}
          >
            {count}
          </span>
        </button>
        {onAdd && (
          <span className="ws-proto-add">
            <IconButtonView size="sm" icon={<FolderPlusIcon size={13} style={{ color: accent }} />}
                            tooltip={`New ${label} collection`} onClick={onAdd} />
          </span>
        )}
      </div>

      {/* Mounted only while open — see the note at the top of the file. */}
      {open && <div className="ws-proto-body">{children}</div>}
    </div>
  );
}

/**
 * The shell both tabs share: fetch every protocol for the counts, draw a row
 * per protocol that has something, and put the real panel inside the open one.
 */
function ProtocolSections({ kind, counts, present, panel, empty, extra, onAdd }: {
  kind: 'collections' | 'history';
  counts: (p: Protocol) => number;
  /** Whether a protocol gets a row. Something in it, unless told otherwise. */
  present?: (p: Protocol) => boolean;
  panel: (p: Protocol) => React.ReactNode;
  empty: React.ReactNode;
  extra?: React.ReactNode;
  onAdd?: (p: Protocol) => void;
}) {
  const withData = PROTOCOLS.filter(p => (present ? present(p.id) : counts(p.id) > 0));

  /* Which row is open survives leaving the tab: this component unmounts on a
     tab switch, so React state alone reopened whatever you had just collapsed.
     `''` is a real answer meaning "all closed" — distinct from never having
     chosen, which is what picks a default below. */
  const setPref = useUiStateStore(s => s.setPref);
  const stored = useUiStateStore(s => s.prefs[`workspace.${kind}.open`]);
  const open = (stored ?? null) as Protocol | '' | null;

  const choose = (next: Protocol | '') => setPref(`workspace.${kind}.open`, next);

  /* Open the first one that has something, but only before a choice has been
     made. A screen of closed rows makes you click before you can see anything,
     and the common case is one protocol. */
  useEffect(() => {
    if (open === null && withData.length > 0) choose(withData[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, withData.length]);

  if (withData.length === 0) {
    /* `extra` holds the create dialog. Returning without it meant the one
       screen that most needs "create your first collection" was the one screen
       where the dialog was not mounted to open. */
    return (
      <>
        {extra}
        <div className="ws-sec-empty">{empty}</div>
      </>
    );
  }

  return (
    <div className="ws-sections">
      {extra}
      <div className="ws-sec-list">
        {withData.map(p => (
          <ProtocolRow
            key={p.id}
            label={p.label}
            accent={getProtocolAccent(p.id)}
            count={counts(p.id)}
            open={open === p.id}
            onToggle={() => choose(open === p.id ? '' : p.id)}
            onAdd={onAdd ? () => onAdd(p.id) : undefined}
          >
            {panel(p.id)}
          </ProtocolRow>
        ))}
      </div>
    </div>
  );
}

// ── Collections ──────────────────────────────────────────────────────────────

export function WorkspaceCollections({ createSignal = 0 }: { createSignal?: number }) {
  const [choosing, setChoosing] = useState(false);
  /* Which protocol was asked for a new collection, and a fresh id per ask. */
  const [ask, setAsk] = useState<{ protocol: Protocol; id: string } | null>(null);
  const store = useSidebarDataStore();
  const setPref = useUiStateStore(s => s.setPref);

  /* One fetch per protocol, because the sidebar cache is keyed by protocol and
     a single call would land every protocol's tree under whichever one asked.
     These are what the headings count. */
  useEffect(() => {
    for (const p of PROTOCOLS) postMsg({ type: 'getCollections', protocol: p.id });
  }, []);

  const canEdit = useWorkspaceEditable('collections');
  useCreateSignal('collections', createSignal, () => { if (canEdit) setChoosing(true); });

  const counts = (p: Protocol) =>
    ((store.getCollections(p) ?? []) as unknown as TreeNode[])
      .reduce((n, t) => n + countRequests(t), 0);

  /*
    Open that protocol's row and name the collection in its own tree — the
    sidebar's way, the scratchpad's way. A dialog that asked for a name and a
    protocol, then put the collection somewhere off screen, was a form about a
    thing rather than the thing.
  */
  const start = (p: Protocol) => {
    setChoosing(false);
    setPref('workspace.collections.open', p);
    setAsk({ protocol: p, id: crypto.randomUUID() });
  };

  return (
    <ProtocolSections
      kind="collections"
      counts={counts}
      /* A collection with nothing in it yet still has a row — and so does the
         protocol one was just asked for, before the host has written it. */
      present={p => (store.getCollections(p) ?? []).length > 0 || ask?.protocol === p}
      panel={p => <CollectionsPanel protocol={p} startCreate={ask?.protocol === p ? ask.id : undefined} />}
      onAdd={canEdit ? start : undefined}
      empty={
        <>
          <CollectionsFolderIcon size={26} />
          <p>No collections saved in this workspace yet.</p>
          {/* Asks which protocol, which is the question the sidebar never has
              to ask because it is already showing one. */}
          {!choosing && (
            <ButtonView
              variant="primary"
              size="sm"
              iconLeft={<PlusIcon size={13} />}
              accentColor="var(--color-workspace)"
              onClick={() => setChoosing(true)}
              disabled={!canEdit}
              title={canEdit ? undefined : READ_ONLY_REASON}
            >
              New Collection
            </ButtonView>
          )}
        </>
      }
      extra={choosing ? <ProtocolChooser onPick={start} onClose={() => setChoosing(false)} /> : null}
    />
  );
}

// ── History ──────────────────────────────────────────────────────────────────

export function WorkspaceHistory() {
  const store = useSidebarDataStore();

  useEffect(() => {
    for (const p of PROTOCOLS) postMsg({ type: 'getHistory', protocol: p.id });
  }, []);

  return (
    <ProtocolSections
      kind="history"
      counts={p => (store.getHistory(p) ?? []).length}
      panel={p => <HistoryPanel protocol={p} />}
      empty={<><ClockIcon size={26} /><p>Nothing sent from this workspace yet.</p></>}
    />
  );
}

// ── Environments ─────────────────────────────────────────────────────────────

/**
 * One list, not seven sections.
 *
 * An environment is not protocol-scoped — a {{baseUrl}} is the same variable
 * whichever protocol reads it — so grouping them by protocol would be seven
 * copies of one list. It is the real panel, exactly as the sidebar shows it.
 */
export function WorkspaceEnvironments({ createSignal = 0 }: { createSignal?: number }) {
  const setPref = useUiStateStore(s => s.setPref);
  const stored = useUiStateStore(s => s.prefs['workspace.environments.open']);
  const open = stored !== 'closed';
  const environments = useEnvStore(s => s.environments);
  /* Bumped after the panel is on screen, so the panel sees it change. */
  const [panelAsk, setPanelAsk] = useState(0);
  useCreateSignal('environments', createSignal, () => {
    /* A closed row has no panel yet: open it, and ask once the panel is there. */
    if (!open) {
      setPref('workspace.environments.open', 'open');
      window.setTimeout(() => setPanelAsk(n => n + 1), 0);
    } else setPanelAsk(n => n + 1);
  });

  useEffect(() => { postMsg({ type: 'getEnvironments' }); }, []);

  return (
    <div className="ws-sections">
      <div className="ws-sec-list">
        <ProtocolRow
          label="All protocols"
          accent="var(--color-sidebar-environments)"
          count={environments.length}
          open={open}
          onToggle={() => setPref('workspace.environments.open', open ? 'closed' : 'open')}
        >
          <EnvironmentsPanel createSignal={panelAsk} />
        </ProtocolRow>
      </div>
    </div>
  );
}

// ── Creating one ─────────────────────────────────────────────────────────────

/**
 * Which protocol a new collection is for, asked in the page rather than over it.
 *
 * The sidebar never asks, because it is already showing one. On a screen
 * showing all of them there is nothing to infer, and defaulting to REST is how
 * a GraphQL collection ends up filed under REST and invisible from the row it
 * belongs to. The name is asked next, in that protocol's tree.
 */
function ProtocolChooser({ onPick, onClose }: { onPick: (p: Protocol) => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="ws-new-strip" role="group" aria-label="New collection in">
      <FolderPlusIcon size={14} className="ws-new-strip__icon" />
      <span className="ws-new-strip__label">New collection in</span>
      {/* Chips rather than a dropdown: seven options, the same seven as the
          rail, each in the colour it has there — so the choice is recognised
          rather than read. */}
      <div className="ws-new-strip__chips">
        {PROTOCOLS.map(p => {
          const accent = getProtocolAccent(p.id);
          return (
            <button
              key={p.id}
              type="button"
              className="ws-proto"
              style={{ '--ws-proto-accent': accent } as React.CSSProperties}
              onClick={() => onPick(p.id)}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <IconButtonView size="sm" icon={<CloseIcon size={12} />} tooltip="Cancel" onClick={onClose} />
    </div>
  );
}
