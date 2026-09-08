/**
 * A workspace's collections, environments and history — across every protocol.
 *
 * ── Why this is not the sidebar ──
 *
 * The sidebar shows one protocol at a time, because that is the protocol you
 * are working in. The workspace tab is the opposite question: what is in this
 * workspace *at all*. Mounting the sidebar's panel here answered the first
 * question on a screen asking the second, so a workspace with GraphQL and SOAP
 * collections looked like a workspace with only REST ones.
 *
 * ── One search, every protocol ──
 *
 * The search at the top filters across all of them at once and hides the
 * sections that end up empty, so searching is how you find out which protocol a
 * request was saved under rather than something you do after already knowing.
 *
 * A protocol with nothing saved is not drawn. An empty section per protocol
 * would be seven headings and no content on a fresh install — a table of
 * contents for a book nobody has written yet.
 */
import { useEffect, useMemo, useState } from 'react';
import { ModalView, ButtonView } from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { useSidebarDataStore } from '../../store/sidebar-data-store';
import { useEnvStore } from '../../store/env-store';
import { getProtocolAccent } from '../../colors/daakia-colors';
import { TagChips } from '../shared/tags/TagChips';
import { tagsFromData } from '../shared/tags/request-tags';
import {
  SearchIcon, ChevronRightIcon, ChevronDownIcon, ExpandAllIcon, CollapseAllIcon,
  FolderIcon, GlobeIcon, ClockIcon, CollectionsFolderIcon,
} from '../../icons';
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
  requests?: { id: string; name: string; method?: string; url?: string; data?: string }[];
}

/** Does anything in this subtree match? A folder is kept for its children. */
function matches(node: TreeNode, q: string): boolean {
  if (!q) return true;
  if (node.name?.toLowerCase().includes(q)) return true;
  if ((node.requests ?? []).some(r =>
    r.name?.toLowerCase().includes(q) || r.url?.toLowerCase().includes(q))) return true;
  return (node.children ?? []).some(c => matches(c, q));
}

function countRequests(node: TreeNode): number {
  return (node.requests?.length ?? 0)
    + (node.children ?? []).reduce((n, c) => n + countRequests(c), 0);
}

// ── The shell every section shares ───────────────────────────────────────────

function Section({ label, accent, count, open, onToggle, children }: {
  label: string; accent: string; count: number;
  open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="ws-sec">
      <button type="button" className="ws-sec-head" onClick={onToggle}>
        {open ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
        <span className="ws-sec-name" style={{ color: accent }}>{label}</span>
        <span className="ws-sec-n" style={{
          color: accent,
          background: `color-mix(in srgb, ${accent} 15%, transparent)`,
        }}>{count}</span>
      </button>
      {open && <div className="ws-sec-body">{children}</div>}
    </div>
  );
}

function Toolbar({ query, onQuery, onExpandAll, onCollapseAll, placeholder }: {
  query: string; onQuery: (q: string) => void;
  onExpandAll: () => void; onCollapseAll: () => void; placeholder: string;
}) {
  return (
    <div className="ws-sec-toolbar">
      <div className="ws-sec-search">
        <SearchIcon size={12} />
        <input value={query} placeholder={placeholder} onChange={e => onQuery(e.target.value)} />
      </div>
      <button type="button" title="Expand all" onClick={onExpandAll}><ExpandAllIcon size={13} /></button>
      <button type="button" title="Collapse all" onClick={onCollapseAll}><CollapseAllIcon size={13} /></button>
    </div>
  );
}

// ── Collections ──────────────────────────────────────────────────────────────

export function WorkspaceCollections({ createSignal = 0 }: { createSignal?: number }) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const store = useSidebarDataStore();

  /* One fetch per protocol, because the sidebar cache is keyed by protocol and
     a single call would land every protocol's tree under whichever one asked. */
  useEffect(() => {
    for (const p of PROTOCOLS) postMsg({ type: 'getCollections', protocol: p.id });
  }, []);

  /* Zero is the initial value, not a request. See CollectionsPanel. */
  useEffect(() => { if (createSignal > 0) setCreating(true); }, [createSignal]);

  const q = query.trim().toLowerCase();
  const sections = PROTOCOLS
    .map(p => ({ ...p, tree: (store.getCollections(p.id) ?? []) as unknown as TreeNode[] }))
    .map(p => ({ ...p, tree: p.tree.filter(n => matches(n, q)) }))
    .filter(p => p.tree.length > 0);

  return (
    <div className="ws-sections">
      <NewCollectionModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={(name, protocol) => {
          postMsg({ type: 'createCollection', id: crypto.randomUUID(), name, parentId: null, protocol });
          setCreating(false);
          // The tree comes from the host; ask for the one that just changed.
          window.setTimeout(() => postMsg({ type: 'getCollections', protocol }), 250);
        }}
      />

      <Toolbar
        query={query} onQuery={setQuery}
        placeholder="Search every protocol…"
        onExpandAll={() => setClosed(new Set())}
        onCollapseAll={() => setClosed(new Set(PROTOCOLS.map(p => p.id)))}
      />

      {sections.length === 0 ? (
        <Empty
          icon={<CollectionsFolderIcon size={26} />}
          text={q ? `Nothing matches “${query}”.` : 'No collections saved in this workspace yet.'}
        />
      ) : (
        <div className="ws-sec-list">
          {sections.map(p => (
            <Section
              key={p.id}
              label={p.label}
              accent={getProtocolAccent(p.id)}
              count={p.tree.reduce((n, t) => n + countRequests(t), 0)}
              open={!closed.has(p.id)}
              onToggle={() => setClosed(prev => {
                const next = new Set(prev);
                next.has(p.id) ? next.delete(p.id) : next.add(p.id);
                return next;
              })}
            >
              {p.tree.map(node => (
                <CollectionNode key={node.id} node={node} depth={0} query={q} protocol={p.id} />
              ))}
            </Section>
          ))}
        </div>
      )}
    </div>
  );
}

function CollectionNode({ node, depth, query, protocol }: {
  node: TreeNode; depth: number; query: string; protocol: Protocol;
}) {
  /* Open when searching: a hit three folders down is not a hit you can see. */
  const [open, setOpen] = useState(depth === 0);
  const expanded = query ? true : open;

  const kids = (node.children ?? []).filter(c => matches(c, query));
  const reqs = (node.requests ?? []).filter(r =>
    !query || r.name?.toLowerCase().includes(query) || r.url?.toLowerCase().includes(query));

  return (
    <div>
      <button
        type="button"
        className="ws-node"
        style={{ paddingLeft: 10 + depth * 14 }}
        onClick={() => setOpen(o => !o)}
      >
        {expanded ? <ChevronDownIcon size={11} /> : <ChevronRightIcon size={11} />}
        <FolderIcon size={12} />
        <span className="ws-node-name">{node.name}</span>
        <span className="ws-node-n">{countRequests(node)}</span>
      </button>

      {expanded && (
        <>
          {kids.map(c => (
            <CollectionNode key={c.id} node={c} depth={depth + 1} query={query} protocol={protocol} />
          ))}
          {reqs.map(r => (
            <button
              key={r.id}
              type="button"
              className="ws-req"
              style={{ paddingLeft: 10 + (depth + 1) * 14 }}
              title={r.url}
              onClick={() => postMsg({ type: 'openCollectionRequest', requestId: r.id, protocol })}
            >
              <span className="ws-req-method" style={{ color: getProtocolAccent(protocol) }}>
                {r.method || 'GET'}
              </span>
              <span className="ws-node-name">{r.name || r.url}</span>
              <RequestTags data={r.data} />
            </button>
          ))}
        </>
      )}
    </div>
  );
}

function RequestTags({ data }: { data?: string }) {
  const tags = useMemo(() => {
    if (!data) return [];
    try { return tagsFromData(JSON.parse(data)); } catch { return []; }
  }, [data]);
  if (!tags.length) return null;
  return <TagChips tags={tags} max={2} size="xs" />;
}

// ── Environments ─────────────────────────────────────────────────────────────

/**
 * Environments are not protocol-scoped — a {{baseUrl}} is the same variable
 * whichever protocol reads it — so this is one list rather than seven sections.
 * It gets the same search and the same expand/collapse, because the reason to
 * come here is the same: find the one you are looking for.
 */
export function WorkspaceEnvironments({ createSignal = 0 }: { createSignal?: number }) {
  const [query, setQuery] = useState('');
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const environments = useEnvStore(s => s.environments);

  useEffect(() => { postMsg({ type: 'getEnvironments' }); }, []);

  /* Creating an environment is the sidebar's flow — there is one editor for
     them and this screen should not grow a second. */
  useEffect(() => {
    if (createSignal > 0) postMsg({ type: 'openEnvironmentsPanelCreate' });
  }, [createSignal]);

  const q = query.trim().toLowerCase();
  const shown = environments.filter(env =>
    !q || env.name.toLowerCase().includes(q)
    || (env.variables ?? []).some(v => v.key?.toLowerCase().includes(q)));

  return (
    <div className="ws-sections">
      <Toolbar
        query={query} onQuery={setQuery}
        placeholder="Search environments and variable names…"
        onExpandAll={() => setClosed(new Set())}
        onCollapseAll={() => setClosed(new Set(environments.map(e => e.id)))}
      />

      {shown.length === 0 ? (
        <Empty
          icon={<GlobeIcon size={26} />}
          text={q ? `Nothing matches “${query}”.` : 'No environments in this workspace yet.'}
        />
      ) : (
        <div className="ws-sec-list">
          {shown.map(env => {
            const vars = (env.variables ?? []).filter(v => !q || v.key?.toLowerCase().includes(q));
            return (
              <Section
                key={env.id}
                label={env.name}
                accent="var(--color-sidebar-environments)"
                count={(env.variables ?? []).length}
                open={!closed.has(env.id)}
                onToggle={() => setClosed(prev => {
                  const next = new Set(prev);
                  next.has(env.id) ? next.delete(env.id) : next.add(env.id);
                  return next;
                })}
              >
                {vars.length === 0 ? (
                  <p className="ws-sec-note">No variables.</p>
                ) : vars.map(v => (
                  <div key={v.id ?? v.key} className="ws-var">
                    <span className="ws-var-key">{v.key}</span>
                    {/* Names, never values. A secret's value does not belong on
                        an overview screen any more than it belongs in a log. */}
                    <span className="ws-var-note">
                      {v.isSecret ? 'secret' : v.currentValue ? 'set' : 'empty'}
                    </span>
                  </div>
                ))}
              </Section>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── History ──────────────────────────────────────────────────────────────────

export function WorkspaceHistory() {
  const [query, setQuery] = useState('');
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const store = useSidebarDataStore();

  useEffect(() => {
    for (const p of PROTOCOLS) postMsg({ type: 'getHistory', protocol: p.id });
  }, []);

  const q = query.trim().toLowerCase();
  const sections = PROTOCOLS
    .map(p => ({
      ...p,
      rows: (store.getHistory(p.id) ?? []).filter(h =>
        !q || h.url?.toLowerCase().includes(q) || h.method?.toLowerCase().includes(q)),
    }))
    .filter(p => p.rows.length > 0);

  return (
    <div className="ws-sections">
      <Toolbar
        query={query} onQuery={setQuery}
        placeholder="Search every protocol…"
        onExpandAll={() => setClosed(new Set())}
        onCollapseAll={() => setClosed(new Set(PROTOCOLS.map(p => p.id)))}
      />

      {sections.length === 0 ? (
        <Empty
          icon={<ClockIcon size={26} />}
          text={q ? `Nothing matches “${query}”.` : 'Nothing sent from this workspace yet.'}
        />
      ) : (
        <div className="ws-sec-list">
          {sections.map(p => (
            <Section
              key={p.id}
              label={p.label}
              accent={getProtocolAccent(p.id)}
              count={p.rows.length}
              open={!closed.has(p.id)}
              onToggle={() => setClosed(prev => {
                const next = new Set(prev);
                next.has(p.id) ? next.delete(p.id) : next.add(p.id);
                return next;
              })}
            >
              {/* Capped: history is thousands of rows and this is an overview,
                  not the history panel. The count on the heading is the whole
                  number either way. */}
              {p.rows.slice(0, 50).map(h => (
                <button
                  key={h.id}
                  type="button"
                  className="ws-req"
                  style={{ paddingLeft: 16 }}
                  title={h.url}
                  onClick={() => postMsg({ type: 'openHistoryEntry', id: h.id, protocol: p.id })}
                >
                  <span className="ws-req-method" style={{ color: getProtocolAccent(p.id) }}>
                    {h.method}
                  </span>
                  <span className="ws-node-name">{h.url}</span>
                  {h.status != null && (
                    <span className="ws-req-status" style={{
                      color: h.status >= 400 ? 'var(--color-error)'
                        : h.status >= 100 ? 'var(--color-success)' : 'var(--color-text-muted)',
                    }}>{h.status}</span>
                  )}
                </button>
              ))}
              {p.rows.length > 50 && (
                <p className="ws-sec-note">
                  {(p.rows.length - 50).toLocaleString()} more — open the {p.label} sidebar for all of them.
                </p>
              )}
            </Section>
          ))}
        </div>
      )}
    </div>
  );
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="ws-sec-empty">
      {icon}
      <p>{text}</p>
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
 * the tab it belongs to.
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
        {/* Chips rather than a dropdown: there are seven, they are the same
            seven as the rail, and each carries the colour it has there — so
            the choice is recognised rather than read. */}
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
