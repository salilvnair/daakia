/**
 * The scripts library, as a sidebar.
 *
 * The same list in the pod's Python tab and on the Scripts screen, because it
 * is the same list — the workspace's. Folders become headings; the age column
 * is there because "which of these did I write last week" is how a library
 * of small scripts is actually searched.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  IconButtonView, SearchInputView, IconSize,
} from '@salilvnair/dui';
import { PlusIcon, SearchIcon, FileTextIcon } from '../../../icons';
import { usePyStore, ensurePyListener } from '../../../store/dk8s-python-store';
import { filterScripts, groupScripts, relativeAge, PY_HEADER_HEIGHT } from './py-view';
import { ACCENT } from '../tone';

export function ScriptLibrary({ heading, footer, width = 208 }: {
  heading: string;
  footer: string;
  width?: number;
}) {
  const scripts = usePyStore(s => s.scripts);
  const loaded = usePyStore(s => s.loaded);
  const selectedId = usePyStore(s => s.selectedId);
  const select = usePyStore(s => s.select);
  const newScript = usePyStore(s => s.newScript);
  const drafts = usePyStore(s => s.drafts);
  const [query, setQuery] = useState('');

  useEffect(() => {
    ensurePyListener();
    if (!loaded) usePyStore.getState().loadScripts();
  }, [loaded]);

  const groups = useMemo(() => {
    const now = Date.now();
    const filed = scripts.some(s => !!s.folder);
    return groupScripts(filterScripts(scripts, query)).map(g => ({
      /* A heading for the unfiled only once there are headings at all — a
         library with no folders is one list, and labelling it says nothing. */
      title: g.folder ? g.folder.toUpperCase() : (filed ? 'UNFILED' : undefined),
      items: g.scripts.map(s => ({
        id: s.id,
        name: drafts[s.id]?.name ?? s.name,
        /* An unsaved edit is marked on the row, not only in the editor: the
           library is where you go to switch scripts, and switching is when
           an unsaved edit is easiest to forget. */
        dirty: !!drafts[s.id],
        age: relativeAge(s.updatedAt, now),
      })),
    }));
  }, [scripts, query, drafts]);

  return (
    <div className="flex flex-col h-full min-h-0 flex-shrink-0"
         style={{ width, borderRight: '1px solid var(--color-surface-border)', background: 'var(--color-surface)' }}>
      <div className="flex items-center justify-between px-3 flex-shrink-0"
           style={{ height: PY_HEADER_HEIGHT, borderBottom: '1px solid var(--color-surface-border)' }}>
        <span className="text-[10.5px] font-bold tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
          {heading}
        </span>
        <IconButtonView
          icon={<PlusIcon size={IconSize.action} />}
          size="xs" tooltip="New script" aria-label="New script"
          color={ACCENT}
          onClick={() => newScript()}
        />
      </div>
      <div className="px-2.5 py-2">
        <SearchInputView
          value={query} onChange={setQuery} placeholder="Search" size="sm"
          prefix={<SearchIcon size={IconSize.inline} />}
          aria-label="Search scripts"
        />
      </div>
      <div className="flex-1 min-h-0 overflow-auto px-1.5">
        {loaded && scripts.length === 0 ? (
          <div className="px-2 py-3 text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            No scripts yet. The + above starts one.
          </div>
        ) : groups.length === 0 ? (
          <div className="px-2 py-3 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            Nothing matches &ldquo;{query}&rdquo;.
          </div>
        ) : (
          <div className="flex flex-col pb-2">
            {groups.map((g, gi) => (
              <div key={g.title ?? `g${gi}`} className="flex flex-col" style={{ gap: 1 }}>
                {g.title && (
                  <div className="text-[10px] font-bold" style={{ padding: gi ? '10px 6px 4px' : '4px 6px', letterSpacing: '0.06em', color: 'var(--color-text-muted)' }}>
                    {g.title}
                  </div>
                )}
                {g.items.map(it => {
                  const on = it.id === selectedId;
                  return (
                    <button key={it.id} type="button" onClick={() => select(it.id)}
                            className="py-lib-row flex items-center gap-2 w-full text-left cursor-pointer border-none rounded-md"
                            style={{
                              padding: '6px 8px', fontSize: 12.5,
                              background: on ? `color-mix(in srgb, ${ACCENT} 16%, transparent)` : 'transparent',
                              color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                            }}>
                      <FileTextIcon size={12} color={on ? ACCENT : 'var(--color-text-muted)'} />
                      <span className="flex-1 truncate">{it.name}</span>
                      {it.dirty && <span title="Unsaved" style={{ width: 6, height: 6, borderRadius: 6, background: 'var(--color-warning)', flexShrink: 0 }} />}
                      {it.age && <span className="text-[10.5px] shrink-0" style={{ color: 'var(--color-text-muted)' }}>{it.age}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
            <style>{'.py-lib-row:hover { background: var(--color-surface-hover) }'}</style>
          </div>
        )}
      </div>
      <div className="px-3 py-2.5 text-[10.5px] leading-relaxed"
           style={{ borderTop: '1px solid var(--color-surface-border)', color: 'var(--color-text-muted)' }}>
        {footer}
      </div>
    </div>
  );
}
