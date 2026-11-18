/**
 * What Ctrl+N makes: another of whatever is in front.
 *
 * A REST tab in front makes a REST tab, GraphQL a GraphQL one, an SSE tab an
 * SSE tab, and a scratchpad another scratchpad of the same type. It used to be
 * `addTab()` whatever was in front, which reads the store's `activeProtocol` —
 * the protocol of the last request tab — so on a scratchpad Ctrl+N made a REST
 * request, and on SSE a WebSocket one, since the realtime transports share a
 * protocol and differ only by `rt_protocol`.
 *
 * Anything that is neither (the workspace page, settings, a dk8s window) has
 * nothing to make another of, and gets a request in the protocol last used.
 *
 * One function for both ways the key arrives: the webview's own listener, and
 * the VS Code keybinding's command when an editor kept the key from it.
 */
import { useTabsStore } from '../../store/tabs-store';
import { useScratchpadStore } from '../../store/scratchpad-store';
import { useAppSettingsStore } from '../../store/app-settings-store';
import { logUiEvent } from '../../store/ui-audit-store';

export function newTabLikeActive(): void {
  const { tabs, activeTabId, addTab } = useTabsStore.getState();
  const tab = tabs.find(t => t.id === activeTabId);

  if (tab?.type === 'scratchpad') {
    const pads = useScratchpadStore.getState();
    const open = pads.files.find(f => f.id === tab.scratchpadId);
    pads.create(open?.type ?? useAppSettingsStore.getState().settings.newScratchpadType ?? 'json');
    return;
  }

  logUiEvent('tab.new');
  if (tab && (tab.type ?? 'request') === 'request') {
    const rt = tab.protocol === 'websocket' ? tab.authData?.rt_protocol : undefined;
    addTab({ protocol: tab.protocol, ...(rt ? { authData: { rt_protocol: rt } } : {}) });
    return;
  }
  addTab();
}

/** A new scratchpad of the type chosen beside its shortcut in Settings → Keymap. */
export function newScratchpadOfChosenType(): void {
  useScratchpadStore.getState().create(useAppSettingsStore.getState().settings.newScratchpadType ?? 'json');
}
