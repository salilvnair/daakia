/**
 * The Settings tab body, for any protocol that sends over HTTP.
 *
 * REST, GraphQL and SOAP all end up in the same place — a proxy decision, a
 * TLS decision, a timeout — so they get one tab rather than three that drift
 * apart. (They did drift: GraphQL ignored the proxy entirely and SOAP verified
 * certificates unconditionally, so the same request to the same host took
 * different routes depending on which tab sent it.)
 *
 * A component rather than an inline block because the inherited-values hook
 * cannot be called from inside a conditional branch of a panel's render, and
 * because this way the host is only asked when the tab is actually open.
 */
import { useTabsStore, type RequestTab } from '../../../store/tabs-store';
import { ExecutionSettingsEditor } from './ExecutionSettingsEditor';
import { useEffectiveSettings } from './use-effective-settings';

export function ProtocolSettingsTab({ tab, accent }: { tab: RequestTab; accent?: string }) {
  const updateTab = useTabsStore(s => s.updateTab);
  const { values, from } = useEffectiveSettings(
    'request', { tabId: tab.id, collectionId: tab.collectionId },
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <ExecutionSettingsEditor
        scope="request"
        value={tab.settings ?? {}}
        onChange={next => updateTab(tab.id, { settings: next })}
        inherited={values}
        inheritedFrom={from}
        accentColor={accent}
      />
    </div>
  );
}
