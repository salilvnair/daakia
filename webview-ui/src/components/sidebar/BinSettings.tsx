/**
 * BinSettings — soft-deleted items, kept for 30 days before permanent removal.
 *
 * Scope matches git-sync exactly: History, Collections, Mock Server, Environments.
 * Audit logs, cookies, AI conversations, and script console output are never
 * routed here — deleting those stays permanent, unchanged from before.
 */
import { useEffect, useState } from 'react';
import { ButtonView, TabView, type TabItem } from '@salilvnair/dui';
import { postMsg } from '../../vscode';
import { useToastStore } from '../../store/toast-store';
import { ConfirmDialog } from '../shared';
import { TrashIcon, UndoIcon, ClockIcon } from '../../icons';

const ACCENT = 'var(--color-settings)';

type TrashCategory = 'history' | 'collection' | 'collection_request' | 'mock_server' | 'environment';
type BinTab = 'all' | TrashCategory;

interface TrashEntry {
  id: string;
  category: TrashCategory;
  original_id: string;
  group_id: string | null;
  label: string;
  data: string;
  deleted_at: string;
  expires_at: string;
}

const TAB_META: { id: BinTab; label: string; category?: TrashCategory }[] = [
  { id: 'all', label: 'All' },
  { id: 'history', label: 'History', category: 'history' },
  { id: 'collection', label: 'Collections', category: 'collection' },
  { id: 'mock_server', label: 'Mock Server', category: 'mock_server' },
  { id: 'environment', label: 'Environments', category: 'environment' },
];

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

function daysLeft(expiresAt: string): number {
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

const CATEGORY_LABEL: Record<TrashCategory, string> = {
  history: 'History',
  collection: 'Collection',
  collection_request: 'Request',
  mock_server: 'Mock Server',
  environment: 'Environment',
};

export function BinSettings() {
  const [tab, setTab] = useState<BinTab>('all');
  const [entries, setEntries] = useState<TrashEntry[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState<string | null>(null);
  const addToast = useToastStore(s => s.addToast);

  const refresh = () => postMsg({ type: 'bin:getEntries', category: undefined });

  useEffect(() => {
    refresh();
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'bin:entriesData') {
        setEntries(msg.entries);
        setCounts(msg.counts || {});
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeCategory = TAB_META.find(t => t.id === tab)?.category;
  const visible = activeCategory ? entries.filter(e => e.category === activeCategory) : entries;

  // Group entries sharing a group_id into one row; singles stay individual.
  const groups = new Map<string, TrashEntry[]>();
  const singles: TrashEntry[] = [];
  for (const e of visible) {
    if (e.group_id) {
      const arr = groups.get(e.group_id) ?? [];
      arr.push(e);
      groups.set(e.group_id, arr);
    } else {
      singles.push(e);
    }
  }

  const restore = (id: string) => { postMsg({ type: 'bin:restore', id }); addToast({ type: 'success', message: 'Restored.' }); };
  const restoreGroup = (groupId: string) => { postMsg({ type: 'bin:restoreGroup', groupId }); addToast({ type: 'success', message: 'Restored.' }); };
  const permanentlyDelete = (id: string) => { postMsg({ type: 'bin:permanentlyDelete', id }); setConfirmDeleteId(null); };
  const permanentlyDeleteGroup = (groupId: string) => { postMsg({ type: 'bin:permanentlyDeleteGroup', groupId }); setConfirmDeleteGroupId(null); };
  const emptyBin = () => { postMsg({ type: 'bin:empty', category: activeCategory }); setConfirmEmpty(false); };

  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-4">
        <p className="text-[14px] font-semibold text-[var(--color-text-primary)]">Bin</p>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
          Deleted History, Collections, Mock Servers, and Environments land here for 30 days before being permanently removed — restore anytime before then.
        </p>
      </div>

      <div className="px-3 pt-3 border-b border-[var(--color-surface-border)]">
        <TabView
          tabs={TAB_META.map(t => ({ id: t.id, label: t.category ? `${t.label} (${counts[t.category] || 0})` : `${t.label} (${totalCount})` })) as TabItem[]}
          activeTab={tab}
          onChange={(t) => setTab(t as BinTab)}
          variant="underline"
          size="sm"
          accentColor={ACCENT}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {visible.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
            <TrashIcon size={28} style={{ color: 'var(--color-text-muted)', opacity: 0.4 }} />
            <p className="text-[12px] text-[var(--color-text-muted)]">Bin is empty</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {[...groups.entries()].map(([groupId, groupEntries]) => (
              <BinRow
                key={groupId}
                label={`${CATEGORY_LABEL[groupEntries[0].category]}: ${groupEntries[0].label}${groupEntries.length > 1 ? ` (+${groupEntries.length - 1} more)` : ''}`}
                deletedAt={groupEntries[0].deleted_at}
                expiresAt={groupEntries[0].expires_at}
                onRestore={() => restoreGroup(groupId)}
                onDelete={() => setConfirmDeleteGroupId(groupId)}
              />
            ))}
            {singles.map(e => (
              <BinRow
                key={e.id}
                label={`${CATEGORY_LABEL[e.category]}: ${e.label}`}
                deletedAt={e.deleted_at}
                expiresAt={e.expires_at}
                onRestore={() => restore(e.id)}
                onDelete={() => setConfirmDeleteId(e.id)}
              />
            ))}
          </div>
        )}
      </div>

      {visible.length > 0 && (
        <div className="px-5 py-3 border-t border-[var(--color-surface-border)]">
          <ButtonView size="sm" variant="secondary" accentColor="var(--color-error)" iconLeft={<TrashIcon size={13} />} onClick={() => setConfirmEmpty(true)}>
            Empty {tab === 'all' ? 'Bin' : TAB_META.find(t => t.id === tab)?.label}
          </ButtonView>
        </div>
      )}

      {confirmEmpty && (
        <ConfirmDialog
          title="Empty Bin"
          message={`Permanently delete ${visible.length} item(s)? This cannot be undone.`}
          confirmLabel="Empty Bin"
          danger
          onConfirm={emptyBin}
          onCancel={() => setConfirmEmpty(false)}
        />
      )}
      {confirmDeleteId && (
        <ConfirmDialog
          title="Delete Permanently"
          message="Permanently delete this item? This cannot be undone."
          confirmLabel="Delete Permanently"
          danger
          onConfirm={() => permanentlyDelete(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
      {confirmDeleteGroupId && (
        <ConfirmDialog
          title="Delete Permanently"
          message="Permanently delete every item in this group? This cannot be undone."
          confirmLabel="Delete Permanently"
          danger
          onConfirm={() => permanentlyDeleteGroup(confirmDeleteGroupId)}
          onCancel={() => setConfirmDeleteGroupId(null)}
        />
      )}
    </div>
  );
}

function BinRow({ label, deletedAt, expiresAt, onRestore, onDelete }: {
  label: string; deletedAt: string; expiresAt: string; onRestore: () => void; onDelete: () => void;
}) {
  const left = daysLeft(expiresAt);
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border" style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-surface)' }}>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-[var(--color-text-primary)] truncate" title={label}>{label}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <ClockIcon size={10} style={{ color: 'var(--color-text-muted)' }} />
          <span className="text-[10px] text-[var(--color-text-muted)]">Deleted {formatRelativeTime(deletedAt)}</span>
          <span className="text-[10px]" style={{ color: left <= 3 ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>
            · {left === 0 ? 'expires today' : `${left}d left`}
          </span>
        </div>
      </div>
      <ButtonView size="sm" variant="secondary" accentColor={ACCENT} iconLeft={<UndoIcon size={12} />} onClick={onRestore}>Restore</ButtonView>
      <ButtonView size="sm" variant="secondary" accentColor="var(--color-error)" iconLeft={<TrashIcon size={12} />} onClick={onDelete}>Delete</ButtonView>
    </div>
  );
}
