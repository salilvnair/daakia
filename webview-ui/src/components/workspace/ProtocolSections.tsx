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
import { useEffect, useRef, useState } from 'react';
import { ModalView, ButtonView } from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { useSidebarDataStore } from '../../store/sidebar-data-store';
import { useUiStateStore } from '../../store/ui-state-store';
import { useEnvStore } from '../../store/env-store';
import { getProtocolAccent } from '../../colors/daakia-colors';
import { CollectionsPanel } from '../rest/sidebar/CollectionsPanel';
import { HistoryPanel } from '../rest/sidebar/HistoryPanel';
import { EnvironmentsPanel } from '../rest/sidebar/EnvironmentsPanel';
import { ChevronRightIcon, ChevronDownIcon, CollectionsFolderIcon, ClockIcon } from '../../icons';
import type { Protocol } from '../../store/tabs-store';
import './workspace.css';

/**
 * Call `onAsk` when `signal` changes — never on mount.
 *
 * The naive `if (signal > 0)` fires on every mount, and the value is already
 * above zero once the button has been used, so a tab switch reopened the dialog
 * with nobody having asked. The value present at mount is the baseline.
 */
function useCreateSignal(signal: number, onAsk: () => void) {
  const seen = useRef(signal);
  useEffect(() => {
    if (signal === seen.current) return;
    seen.current = signal;
    onAsk();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal]);
}

/** Every protocol that can own a collection, in rail order. */
const PROTOCOLS: { id: Protocol; label: string }[] = [
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

function ProtocolRow({ label, accent, count, open, onToggle, children }: {
  label: string; accent: string; count: number;
  open: boolean; onToggle: () => void; children: React.ReactNode;
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

      {/* Mounted only while open — see the note at the top of the file. */}
      {open && <div className="ws-proto-body">{children}</div>}
    </div>
  );
}

/**
 * The shell both tabs share: fetch every protocol for the counts, draw a row
 * per protocol that has something, and put the real panel inside the open one.
 */
function ProtocolSections({ kind, counts, panel, empty, extra }: {
  kind: 'collections' | 'history';
  counts: (p: Protocol) => number;
  panel: (p: Protocol) => React.ReactNode;
  empty: React.ReactNode;
  extra?: React.ReactNode;
}) {
  const withData = PROTOCOLS.filter(p => counts(p.id) > 0);

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
    return <div className="ws-sec-empty">{empty}</div>;
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
  const [creating, setCreating] = useState(false);
  const store = useSidebarDataStore();

  /* One fetch per protocol, because the sidebar cache is keyed by protocol and
     a single call would land every protocol's tree under whichever one asked.
     These are what the headings count. */
  useEffect(() => {
    for (const p of PROTOCOLS) postMsg({ type: 'getCollections', protocol: p.id });
  }, []);

  useCreateSignal(createSignal, () => setCreating(true));

  const counts = (p: Protocol) =>
    ((store.getCollections(p) ?? []) as unknown as TreeNode[])
      .reduce((n, t) => n + countRequests(t), 0);

  return (
    <ProtocolSections
      kind="collections"
      counts={counts}
      panel={p => <CollectionsPanel protocol={p} />}
      empty={<><CollectionsFolderIcon size={26} /><p>No collections saved in this workspace yet.</p></>}
      extra={
        <NewCollectionModal
          open={creating}
          onClose={() => setCreating(false)}
          onCreate={(name, protocol) => {
            postMsg({ type: 'createCollection', id: crypto.randomUUID(), name, parentId: null, protocol });
            setCreating(false);
            window.setTimeout(() => postMsg({ type: 'getCollections', protocol }), 250);
          }}
        />
      }
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
          <EnvironmentsPanel createSignal={createSignal} />
        </ProtocolRow>
      </div>
    </div>
  );
}

// ── Creating one ─────────────────────────────────────────────────────────────

/**
 * Name and protocol together.
 *
 * The sidebar never asks which protocol, because it is already showing one. On
 * a screen showing all of them there is nothing to infer, and defaulting to
 * REST is how a GraphQL collection ends up filed under REST and invisible from
 * the row it belongs to.
 */
function NewCollectionModal({ open, onClose, onCreate }: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, protocol: Protocol) => void;
}) {
  const [name, setName] = useState('');
  const [protocol, setProtocol] = useState<Protocol>('rest');

  useEffect(() => { if (open) { setName(''); setProtocol('rest'); } }, [open]);

  const save = () => { if (name.trim()) onCreate(name.trim(), protocol); };

  return (
    <ModalView
      open={open}
      onClose={onClose}
      title="New Collection"
      headerColor={getProtocolAccent(protocol)}
      size="sm"
      elevated
      footerRight={
        <ButtonView size="sm" variant="primary" disabled={!name.trim()}
                    accentColor={getProtocolAccent(protocol)} onClick={save}>
          Create
        </ButtonView>
      }
    >
      <div
        className="ws-new-coll"
        style={{ '--ws-input-accent': getProtocolAccent(protocol) } as React.CSSProperties}
      >
        <input
          autoFocus
          className="ws-url-input"
          value={name}
          placeholder="Collection name"
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); }}
        />

        <div className="ws-new-coll-label">Protocol</div>
        {/* Chips rather than a dropdown: seven options, the same seven as the
            rail, each in the colour it has there — so the choice is recognised
            rather than read. */}
        <div className="ws-new-coll-protocols">
          {PROTOCOLS.map(p => {
            const accent = getProtocolAccent(p.id);
            const on = protocol === p.id;
            return (
              <button
                key={p.id}
                type="button"
                className={`ws-proto${on ? ' ws-proto--on' : ''}`}
                style={on ? {
                  color: accent,
                  borderColor: `color-mix(in srgb, ${accent} 55%, transparent)`,
                  background: `color-mix(in srgb, ${accent} 14%, transparent)`,
                } : undefined}
                onClick={() => setProtocol(p.id)}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>
    </ModalView>
  );
}
