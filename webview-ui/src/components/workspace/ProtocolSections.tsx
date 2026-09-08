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
import { ModalView, ButtonView } from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { useSidebarDataStore } from '../../store/sidebar-data-store';
import { getProtocolAccent } from '../../colors/daakia-colors';
import { CollectionsPanel } from '../rest/sidebar/CollectionsPanel';
import { HistoryPanel } from '../rest/sidebar/HistoryPanel';
import { EnvironmentsPanel } from '../rest/sidebar/EnvironmentsPanel';
import { ChevronRightIcon, ChevronDownIcon, CollectionsFolderIcon, ClockIcon } from '../../icons';
import type { Protocol } from '../../store/tabs-store';
import './workspace.css';

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
    <div className={`ws-proto-sec${open ? ' ws-proto-sec--open' : ''}`}>
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

  /* Open the first one that has something. A screen of closed rows makes you
     click before you can see anything, and the common case is one protocol. */
  const [open, setOpen] = useState<Protocol | null>(null);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched && withData.length > 0 && open === null) setOpen(withData[0].id);
  }, [withData, open, touched]);

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
            onToggle={() => { setTouched(true); setOpen(cur => (cur === p.id ? null : p.id)); }}
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

  /* Zero is the initial value, not a request. See CollectionsPanel. */
  useEffect(() => { if (createSignal > 0) setCreating(true); }, [createSignal]);

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
  return <EnvironmentsPanel createSignal={createSignal} />;
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
      <div className="ws-new-coll">
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
