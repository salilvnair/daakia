/**
 * The Daakia AI tab's header: which conversation, which model, and a menu —
 * all dui controls.
 *
 * The model picker sets this tab's own provider and model — the global
 * default is Settings' business. Beside it, when the model that answered is
 * not the one picked (a provider with no key falls through to one that has
 * one; a key from the environment brings its own model), the header says so
 * rather than letting the picker claim an answer it did not give.
 */
import { useMemo, useRef, useState } from 'react';
import {
  ButtonView, IconButtonView, SelectInputView, ContextMenuView,
  type SelectOption, type ContextMenuItem,
} from '@salilvnair/dui';
import { DaakiaMarkIcon } from '../../icons';
import { useAiProvidersStore } from '../../store/ai-providers-store';
import { useTabsStore } from '../../store/tabs-store';
import { useAiChatSessions } from '../../store/ai-chat-sessions-store';

const ACCENT = 'var(--color-ai-accent, #D97757)';

const RailIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M9 4v16" /></svg>
);
/* New chat: a pen on a page — the conversation starts blank. */
const ComposeIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V12" /><path d="M17.6 3.6a1.9 1.9 0 0 1 2.8 2.8L12.5 14.3 9 15l.7-3.5Z" /></svg>
);
const MoreIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
);
const Dk8sGlyph = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--dai-dk8s)" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" /></svg>
);

export function AiChatHeader({
  tabId, title, dk8s, onToggleRail, railOpen, onCollection, onExport,
}: {
  /** The Daakia AI tab this header belongs to — each has its own conversation. */
  tabId: string;
  title: string;
  /** Present when pods are watched: whether search is on, and how to flip it. */
  dk8s?: { on: boolean; toggle: () => void; where: string };
  onToggleRail: () => void;
  railOpen: boolean;
  onCollection: () => void;
  onExport: () => void;
}) {
  const providers = useAiProvidersStore(s => s.providers);
  const defaultProviderId = useAiProvidersStore(s => s.defaultProviderId);
  const defaultModelId = useAiProvidersStore(s => s.defaultModelId);
  const tab = useTabsStore(s => s.tabs.find(t => t.type === 'daakia-ai'));
  const updateTab = useTabsStore(s => s.updateTab);
  const answeredBy = useAiChatSessions(s => s.byTab[tabId]?.answeredBy);
  const activeId = useAiChatSessions(s => s.byTab[tabId]?.activeId);
  const { remove } = useAiChatSessions.getState();
  const newChat = () => useAiChatSessions.getState().newChat(tabId);
  const moreRef = useRef<HTMLSpanElement>(null);
  const [menu, setMenu] = useState(false);
  /* Deleting a thread cannot be undone, so the menu asks twice. */
  const [confirmDelete, setConfirmDelete] = useState(false);

  const provider = tab?.aiProvider || defaultProviderId;
  const model = tab?.aiModel || defaultModelId;
  const current = `${provider}::${model}`;

  /* One flat list with a header row per provider, the way dui groups a select. */
  const options = useMemo<SelectOption[]>(() => {
    const out: SelectOption[] = [];
    let listed = false;
    for (const p of providers) {
      if (!p.enabled) continue;
      const models = p.models.filter(m => m.enabled);
      if (!models.length) continue;
      out.push({ value: `hdr:${p.id}`, label: p.name, isHeader: true });
      for (const m of models) {
        const value = `${p.id}::${m.id}`;
        if (value === current) listed = true;
        out.push({ value, label: m.name || m.id });
      }
    }
    if (!listed) out.unshift({ value: current, label: model || provider });
    return out;
  }, [providers, current, model, provider]);

  const items: ContextMenuItem[] = [
    { id: 'new', label: 'New chat', onClick: () => newChat() },
    { id: 's1', label: '', separator: true },
    { id: 'collection', label: 'Save as a collection…', onClick: onCollection },
    { id: 'export', label: 'Export as Markdown…', onClick: onExport },
    ...(dk8s?.on ? [{ id: 'dk8s', label: 'Stop searching dk8s', onClick: dk8s.toggle }] : []),
    { id: 's2', label: '', separator: true },
    {
      id: 'delete', danger: true,
      label: confirmDelete ? 'Click again to delete it' : 'Delete this conversation',
      onClick: () => {
        if (!confirmDelete) { setConfirmDelete(true); setTimeout(() => setMenu(true), 0); return; }
        setConfirmDelete(false);
        if (activeId) remove(activeId); else newChat();
      },
    },
  ];

  const differs = answeredBy?.model && answeredBy.model !== model;

  return (
    <header className="dai-hdr">
      <IconButtonView
        icon={<RailIcon />}
        size="sm"
        tooltip={railOpen ? 'Hide conversations' : 'Show conversations'}
        aria-label={railOpen ? 'Hide conversations' : 'Show conversations'}
        active={railOpen}
        activeColor={ACCENT}
        onClick={onToggleRail}
      />
      <span className="dai-mark"><DaakiaMarkIcon size={17} tint={ACCENT} /></span>
      <span className="dai-title">{title}</span>
      <span className="dai-sp" />

      {dk8s && !dk8s.on && (
        <ButtonView
          variant="ghost"
          size="sm"
          iconLeft={<Dk8sGlyph />}
          title={`Let Daakia AI search the logs of the pods you are watching in ${dk8s.where}`}
          onClick={dk8s.toggle}
        >
          dk8s off · turn on
        </ButtonView>
      )}

      {differs && <span className="dai-answered" title="The model that wrote the last answer">answered by {answeredBy!.model}</span>}

      <SelectInputView
        testId="ai-model"
        size="sm"
        width={200}
        menuMinWidth={220}
        accentColor={ACCENT}
        options={options}
        value={current}
        onChange={v => {
          if (v.startsWith('hdr:')) return;
          const [p, m] = v.split('::');
          if (tab) updateTab(tab.id, { aiProvider: p, aiModel: m });
        }}
      />

      <IconButtonView
        icon={<ComposeIcon />}
        size="sm"
        variant="filled"
        accentColor={ACCENT}
        color={ACCENT}
        tooltip="New chat (Ctrl+N)"
        aria-label="New chat"
        onClick={() => newChat()}
      />
      <span ref={moreRef}>
        <IconButtonView
          icon={<MoreIcon />}
          size="sm"
          tooltip="More"
          aria-label="More"
          aria-haspopup="menu"
          aria-expanded={menu}
          active={menu}
          activeColor={ACCENT}
          onClick={() => { setConfirmDelete(false); setMenu(m => !m); }}
        />
      </span>
      <ContextMenuView
        testId="ai-more"
        items={items}
        anchorEl={moreRef.current}
        open={menu}
        onClose={() => setMenu(false)}
        align="right"
        width="md"
      />
    </header>
  );
}
