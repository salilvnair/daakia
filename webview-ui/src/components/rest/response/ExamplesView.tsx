/**
 * The saved responses for this request.
 *
 * A list on the left, the chosen one rendered on the right — the same shape
 * as every other "several of a thing" panel in the app, and the reason the
 * body is shown here rather than swapped into the live response pane: an
 * example must never be mistakable for what the server just said.
 */
import { useState } from 'react';
import { useTabsStore } from '../../../store/tabs-store';
import { removeExample, renameExample, type ResponseExample } from '../../../services/request/examples';
import { TrashIcon, RenameIcon } from '../../../icons';

/** Green for a 2xx, amber for a 3xx/4xx, red for a 5xx — as everywhere else. */
function statusColor(status: number): string {
  if (status >= 500) return 'var(--color-error)';
  if (status >= 300) return 'var(--color-warning)';
  if (status >= 200) return 'var(--color-success)';
  return 'var(--color-text-muted)';
}

function when(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

export function ExamplesView({ tabId, examples }: { tabId: string; examples: ResponseExample[] }) {
  const updateTab = useTabsStore(s => s.updateTab);
  const [selectedId, setSelectedId] = useState<string | undefined>(examples[0]?.id);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const selected = examples.find(e => e.id === selectedId) ?? examples[0];

  if (examples.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-1 text-[var(--color-text-muted)]">
        <p className="text-[12px]">No examples saved yet</p>
        <p className="text-[10px] opacity-70">Send a request, then press “Save as example”</p>
      </div>
    );
  }

  const commitRename = (id: string) => {
    updateTab(tabId, { examples: renameExample(examples, id, draft) });
    setRenamingId(null);
  };

  return (
    <div className="flex flex-1 min-h-0">
      <div className="w-[210px] shrink-0 overflow-y-auto border-r border-[var(--color-surface-border)]">
        {examples.map(ex => {
          const active = ex.id === selected?.id;
          return (
            <div
              key={ex.id}
              onClick={() => setSelectedId(ex.id)}
              className={`px-2.5 py-1.5 cursor-pointer group flex flex-col gap-0.5 ${
                active ? 'bg-[var(--color-item-hover-bg)]' : 'hover:bg-[var(--color-item-hover-bg)]'
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[9.5px] font-bold shrink-0" style={{ color: statusColor(ex.status) }}>
                  {ex.status || '—'}
                </span>
                {renamingId === ex.id ? (
                  <input
                    autoFocus
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onBlur={() => commitRename(ex.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitRename(ex.id);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    onClick={e => e.stopPropagation()}
                    className="flex-1 min-w-0 text-[11.5px] px-1 rounded bg-[var(--color-input-bg)]
                               border border-[var(--color-primary)] text-[var(--color-text-primary)]
                               focus:outline-none"
                  />
                ) : (
                  <span className="flex-1 text-[11.5px] truncate min-w-0 text-[var(--color-text-primary)]">
                    {ex.name}
                  </span>
                )}
                {renamingId !== ex.id && (
                  <span className="hidden group-hover:flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      title="Rename"
                      onClick={e => { e.stopPropagation(); setRenamingId(ex.id); setDraft(ex.name); }}
                      className="cursor-pointer border-none bg-transparent p-0 opacity-60 hover:opacity-100"
                    >
                      <RenameIcon size={11} />
                    </button>
                    <button
                      type="button"
                      title="Delete this example"
                      onClick={e => {
                        e.stopPropagation();
                        updateTab(tabId, { examples: removeExample(examples, ex.id) });
                        if (selectedId === ex.id) setSelectedId(undefined);
                      }}
                      className="cursor-pointer border-none bg-transparent p-0 opacity-60 hover:opacity-100"
                      style={{ color: 'var(--color-error)' }}
                    >
                      <TrashIcon size={11} />
                    </button>
                  </span>
                )}
              </div>
              <span className="text-[9px] text-[var(--color-text-muted)] truncate">{when(ex.savedAt)}</span>
            </div>
          );
        })}
      </div>

      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        {selected && (
          <>
            <div className="flex items-center gap-2 px-3 py-1.5 text-[10.5px] shrink-0
                            border-b border-[var(--color-surface-border)] text-[var(--color-text-muted)]">
              <span style={{ color: statusColor(selected.status), fontWeight: 700 }}>
                {selected.status} {selected.statusText}
              </span>
              {selected.contentType && <span>{selected.contentType}</span>}
              <span>{selected.body.length.toLocaleString()} B</span>
              {/* Said, not hidden — an example cut to fit is still useful, and
                  a body that silently ends mid-object is not. */}
              {selected.truncated && (
                <span style={{ color: 'var(--color-warning)' }}>truncated when saved</span>
              )}
            </div>
            <pre className="flex-1 overflow-auto m-0 px-3 py-2 text-[11.5px] font-mono whitespace-pre-wrap
                            break-words text-[var(--color-text-primary)]">
              {selected.body || '(empty body)'}
            </pre>
          </>
        )}
      </div>
    </div>
  );
}
