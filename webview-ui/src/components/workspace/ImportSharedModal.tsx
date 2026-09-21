/**
 * Import shared — bring a teammate's workspace into your own.
 *
 * Opened by picking a workspace under Import shared. It shows what the
 * workspace holds, asks what to bring and what to call it, and creates an
 * ordinary workspace of yours: editable, with fresh ids, not following the
 * teammate's later changes. Everything is ticked to begin with, and the name
 * defaults to "<name> (by <who shared it>)" so it cannot be mistaken for one
 * you made.
 */
import { useEffect, useMemo, useState } from 'react';
import { ModalView, ButtonView, TextInputView, CheckboxView } from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { useWorkspaceStore } from '../../store/workspace-store';
import { getProtocolAccent } from '../../colors/daakia-colors';
import { UsersIcon, CollectionsFolderIcon, GlobeIcon } from '../../icons';

interface Preview {
  ownerId: string;
  ownerName: string;
  workspaceId: string;
  name: string;
  collections: { id: string; name: string; protocol: string; requests: number }[];
  environments: { id: string; name: string; variables: number; secrets: number }[];
}

const ACCENT = 'var(--color-workspace)';

export function ImportSharedModal({ ownerId, workspaceId, onClose }: {
  ownerId: string;
  workspaceId: string;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [collections, setCollections] = useState<Set<string>>(new Set());
  const [environments, setEnvironments] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  /* A successful import switches to the new workspace; that switch, seen in
     the store, is the dialog's cue to close. */
  const activeId = useWorkspaceStore(s => s.activeId);
  const [startedFrom, setStartedFrom] = useState<string | null>(null);
  useEffect(() => {
    if (busy && startedFrom !== null && activeId !== startedFrom) onClose();
  }, [busy, startedFrom, activeId, onClose]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const msg = e.data as { type?: string; preview?: Preview; error?: string };
      if (msg?.type === 'sharedWorkspacePreview') {
        if (msg.preview) {
          setPreview(msg.preview);
          setName(`${msg.preview.name} (by ${msg.preview.ownerName})`);
          setCollections(new Set(msg.preview.collections.map(c => c.id)));
          setEnvironments(new Set(msg.preview.environments.map(env => env.id)));
        } else {
          setError(msg.error ?? 'Could not read that workspace.');
        }
      }
      if (msg?.type === 'workspaceError') setBusy(false);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    postMsg({ type: 'getSharedWorkspacePreview', ownerId, workspaceId });
  }, [ownerId, workspaceId]);

  const toggle = (set: Set<string>, setSet: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSet(next);
  };

  const nothing = collections.size === 0 && environments.size === 0;
  const blankSecrets = useMemo(
    () => (preview?.environments ?? []).filter(e => environments.has(e.id)).reduce((n, e) => n + e.secrets, 0),
    [preview, environments],
  );

  const doImport = () => {
    if (!preview || !name.trim() || nothing) return;
    setStartedFrom(activeId ?? '');
    setBusy(true);
    postMsg({
      type: 'copyWorkspaceToMine',
      ownerId: preview.ownerId,
      workspaceId: preview.workspaceId,
      name: name.trim(),
      collectionIds: [...collections],
      environmentIds: [...environments],
    });
  };

  return (
    <ModalView
      open
      onClose={onClose}
      title={preview ? `Import ${preview.name}` : 'Import shared workspace'}
      subtitle={preview ? <span className="ws-imp-sub"><UsersIcon size={11} /> Shared by {preview.ownerName}</span> : undefined}
      headerIcon={<UsersIcon size={15} style={{ color: ACCENT }} />}
      headerColor={ACCENT}
      size="md"
      elevated
      footerRight={
        <>
          <ButtonView size="sm" variant="ghost" onClick={onClose}>Cancel</ButtonView>
          <ButtonView size="sm" variant="primary" accentColor={ACCENT}
                      disabled={!preview || !name.trim() || nothing || busy} onClick={doImport}>
            {busy ? 'Importing…' : 'Import'}
          </ButtonView>
        </>
      }
    >
      {error ? (
        <p className="ws-imp-error">{error}</p>
      ) : !preview ? (
        <p className="ws-imp-note">Reading what is shared…</p>
      ) : (
        <div className="ws-imp">
          <label className="ws-imp-label" htmlFor="ws-imp-name">Name in your workspaces</label>
          <TextInputView id="ws-imp-name" value={name} onChange={e => setName(e.target.value)}
                         size="md" accentColor={ACCENT} style={{ width: '100%' }} />

          <Section
            icon={<CollectionsFolderIcon size={12} />}
            title="Collections"
            all={preview.collections.length > 0 && collections.size === preview.collections.length}
            onAll={on => setCollections(new Set(on ? preview.collections.map(c => c.id) : []))}
            empty="Nothing shared in collections."
            count={preview.collections.length}
          >
            {preview.collections.map(c => (
              <label key={c.id} className="ws-imp-row">
                <CheckboxView size="sm" accentColor={ACCENT} checked={collections.has(c.id)}
                              onChange={() => toggle(collections, setCollections, c.id)} />
                <span className="ws-imp-proto" style={{ color: getProtocolAccent(c.protocol as never) }}>{c.protocol.toUpperCase()}</span>
                <span className="ws-imp-name">{c.name}</span>
                <span className="ws-imp-meta">{c.requests} request{c.requests === 1 ? '' : 's'}</span>
              </label>
            ))}
          </Section>

          <Section
            icon={<GlobeIcon size={12} />}
            title="Environments"
            all={preview.environments.length > 0 && environments.size === preview.environments.length}
            onAll={on => setEnvironments(new Set(on ? preview.environments.map(env => env.id) : []))}
            empty="No environments shared."
            count={preview.environments.length}
          >
            {preview.environments.map(env => (
              <label key={env.id} className="ws-imp-row">
                <CheckboxView size="sm" accentColor={ACCENT} checked={environments.has(env.id)}
                              onChange={() => toggle(environments, setEnvironments, env.id)} />
                <span className="ws-imp-name">{env.name}</span>
                <span className="ws-imp-meta">
                  {env.variables} variable{env.variables === 1 ? '' : 's'}
                  {env.secrets > 0 && ` · ${env.secrets} secret`}
                </span>
              </label>
            ))}
          </Section>

          <p className="ws-imp-note">
            It becomes your own workspace — change anything; it does not follow {preview.ownerName}'s later changes.
            {blankSecrets > 0 && ` ${blankSecrets} secret value${blankSecrets === 1 ? '' : 's'} arrive blank: fill them in after importing.`}
          </p>
        </div>
      )}
    </ModalView>
  );
}

function Section({ icon, title, all, onAll, empty, count, children }: {
  icon: React.ReactNode; title: string; all: boolean; onAll: (on: boolean) => void;
  empty: string; count: number; children: React.ReactNode;
}) {
  return (
    <div className="ws-imp-sec">
      <div className="ws-imp-sec-head">
        <span className="ws-imp-sec-title">{icon} {title}</span>
        {count > 0 && (
          <label className="ws-imp-all">
            <CheckboxView size="sm" accentColor={ACCENT} checked={all} onChange={(on: boolean) => onAll(on)} />
            All
          </label>
        )}
      </div>
      {count === 0 ? <p className="ws-imp-note">{empty}</p> : <div className="ws-imp-list">{children}</div>}
    </div>
  );
}
