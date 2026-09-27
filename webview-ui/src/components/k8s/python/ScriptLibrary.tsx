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
  IconButtonView, SearchInputView, SettingsNavView, IconSize, type SettingsNavGroup,
} from '@salilvnair/dui';
import { PlusIcon, SearchIcon } from '../../../icons';
import { usePyStore, ensurePyListener } from '../../../store/dk8s-python-store';
import { filterScripts, groupScripts, relativeAge } from './py-view';
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

  const groups: SettingsNavGroup[] = useMemo(() => {
    const now = Date.now();
    const filed = scripts.some(s => !!s.folder);
    return groupScripts(filterScripts(scripts, query)).map(g => ({
      /* A heading for the unfiled only once there are headings at all — a
         library with no folders is one list, and labelling it says nothing. */
      title: g.folder ? g.folder.toUpperCase() : (filed ? 'UNFILED' : undefined),
      items: g.scripts.map(s => ({
        id: s.id,
        /* An unsaved edit is marked on the row, not only in the editor: the
           library is where you go to switch scripts, and switching is when
           an unsaved edit is easiest to forget. */
        label: drafts[s.id] ? `${drafts[s.id].name ?? s.name} •` : s.name,
        badge: relativeAge(s.updatedAt, now) || undefined,
      })),
    }));
  }, [scripts, query, drafts]);

  return (
    <div className="flex flex-col h-full min-h-0 flex-shrink-0"
         style={{ width, borderRight: '1px solid var(--color-surface-border)', background: 'var(--color-surface)' }}>
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
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
      <div className="px-2.5 pb-2">
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
          <SettingsNavView
            groups={groups}
            activeId={selectedId}
            onSelect={select}
            accentColor={ACCENT}
            size="sm"
          />
        )}
      </div>
      <div className="px-3 py-2.5 text-[10.5px] leading-relaxed"
           style={{ borderTop: '1px solid var(--color-surface-border)', color: 'var(--color-text-muted)' }}>
        {footer}
      </div>
    </div>
  );
}
