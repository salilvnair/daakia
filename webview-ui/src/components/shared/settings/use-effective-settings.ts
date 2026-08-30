/**
 * What this level would inherit if it overrode nothing.
 *
 * Asked of the host rather than computed here — see the note at the top of
 * ExecutionSettingsEditor for why there is only one resolver.
 *
 * Re-asked whenever the global settings change, so an Inherit label that says
 * "(30s)" stops saying it the moment the global timeout moves. Without that
 * the labels would be right when the tab opened and quietly wrong afterwards,
 * which is the failure mode this whole feature exists to avoid.
 */
import { useEffect, useState } from 'react';
import { postMsg } from '../../../vscode';
import { useAppSettingsStore } from '../../../store/app-settings-store';
import type { EffectiveSettings, SettingsLevel } from './execution-settings';

interface Effective {
  values?: EffectiveSettings;
  from?: Record<keyof EffectiveSettings, SettingsLevel>;
}

export function useEffectiveSettings(
  scope: 'request' | 'collection',
  ids: { tabId?: string; collectionId?: string },
  enabled = true,
): Effective {
  const [state, setState] = useState<Effective>({});
  const { tabId, collectionId } = ids;
  // Any global change can move an inherited value, so this is the cheap,
  // always-correct trigger rather than trying to name the fields that matter.
  const globalSettings = useAppSettingsStore(s => s.settings);

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: MessageEvent) => {
      const msg = e.data as Record<string, unknown>;
      if (msg?.type !== 'settings:effective') return;
      // Several Settings tabs can be mounted at once — one per open request
      // tab — and they all listen on the same channel.
      if (msg.scope !== scope) return;
      if (scope === 'request' && msg.tabId !== tabId) return;
      if (scope === 'collection' && msg.collectionId !== collectionId) return;
      setState({
        values: msg.values as EffectiveSettings,
        from: msg.from as Record<keyof EffectiveSettings, SettingsLevel>,
      });
    };

    window.addEventListener('message', handler);
    postMsg({ type: 'settings:getEffective', scope, tabId, collectionId });
    return () => window.removeEventListener('message', handler);
  }, [scope, tabId, collectionId, enabled, globalSettings]);

  return state;
}
