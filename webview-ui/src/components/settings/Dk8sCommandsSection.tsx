/**
 * Settings → DK8S → Commands.
 *
 * Two tabs over one subject: the log of what ran, and the switches that decide
 * which kinds of it are listed. They are together because the second is only
 * ever reached from looking at the first and wanting less of it.
 *
 * The same shape as Developer Tools → Audit Log / Audit Config next door, for
 * the same reason: somebody who has used one already knows this.
 */
import { TabView, type TabItem } from '@salilvnair/dui';
import { usePersistedPref } from '../../store/ui-state-store';
import { Dk8sCommandAudit } from './Dk8sCommandAudit';
import { Dk8sCommandConfig } from './Dk8sCommandConfig';

const TABS = ['log', 'config'] as const;
type Tab = typeof TABS[number];

const ITEMS: TabItem[] = [
  { id: 'log', label: 'Commands' },
  { id: 'config', label: 'Command Config' },
];

export function Dk8sCommandsSection() {
  /* Remembered, so coming back lands where you left — the same pref mechanism
     every other subtab in Settings uses. */
  const [tab, setTab] = usePersistedPref<Tab>('settings.dk8sCommandsTab', 'log', TABS);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 pt-2 shrink-0" style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <TabView
          tabs={ITEMS}
          activeTab={tab}
          onChange={(id: string) => setTab(id as Tab)}
          accentColor="var(--color-dk8s)"
        />
      </div>
      <div className="flex-1 min-h-0">
        {tab === 'config' ? <Dk8sCommandConfig /> : <Dk8sCommandAudit />}
      </div>
    </div>
  );
}
