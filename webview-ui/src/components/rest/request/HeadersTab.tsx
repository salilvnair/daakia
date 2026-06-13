import { useState, useRef } from 'react';
import { useTabsStore } from '../../../store/tabs-store';
import { useAiFeaturesStore } from '../../../store/ai-features-store';
import { KeyValueTableView, IconButtonView, type KeyValueTableRow, type PinnedKeyValueRow } from '../../../dui';
import { SparkleIcon } from '../../../icons';
import { AiHeaderSuggest, type AiHeaderSuggestHandle } from '../../ai/AiHeaderSuggest';
import { computeAuthRows } from './requestUtils';

type Tab = ReturnType<typeof useTabsStore.getState>['tabs'][0];

interface HeadersTabProps {
  tab: Tab;
  cookieJarRows: { key: string; value: string }[];
}

export function HeadersTab({ tab, cookieJarRows }: HeadersTabProps) {
  const { updateTab } = useTabsStore();
  const aiEnabled = useAiFeaturesStore(s => s.isEnabled);
  const [aiHeaderLoading, setAiHeaderLoading] = useState(false);
  const aiHeaderSuggestRef = useRef<AiHeaderSuggestHandle>(null);

  const pinnedRows: PinnedKeyValueRow[] = [
    ...computeAuthRows(tab.authType, tab.authData).map((row, i) => ({
      id: `auth-${i}`,
      key: row.key,
      value: row.value,
      deletable: true,
    })),
    ...cookieJarRows.map((row, i) => ({
      id: `cookie-${i}`,
      key: row.key,
      value: row.value,
      deletable: false,
    })),
  ];

  return (
    <>
      <KeyValueTableView
        rows={tab.headers as KeyValueTableRow[]}
        onChange={(rows) => updateTab(tab.id, { headers: rows as typeof tab.headers })}
        placeholder={{ key: 'Header', value: 'Value' }}
        maskSensitive
        autocompleteKeys
        showDescription
        label="Headers"
        pinnedTopRows={pinnedRows.length > 0 ? pinnedRows : undefined}
        onPinnedRemove={(id) => {
          if (id.startsWith('auth-')) {
            updateTab(tab.id, { authType: 'none' as typeof tab.authType, authData: {} });
          }
        }}
        toolbarExtra={
          aiEnabled('headerAutocomplete') ? (
            <IconButtonView
              icon={<SparkleIcon size={13} />}
              size="md"
              tooltip="Suggest headers"
              accentColor="var(--color-protocol-ai)"
              disabled={aiHeaderLoading}
              onClick={() => {
                setAiHeaderLoading(true);
                aiHeaderSuggestRef.current?.trigger();
                setTimeout(() => setAiHeaderLoading(false), 300);
              }}
            />
          ) : undefined
        }
      />
      <AiHeaderSuggest
        ref={aiHeaderSuggestRef}
        tabId={tab.id}
        method={tab.method}
        url={tab.url}
        bodyContentType={tab.bodyContentType}
        authType={tab.authType}
        existingHeaders={tab.headers}
        onAddHeader={(key, value) => {
          const rows = tab.headers.filter(r => r.key || r.value);
          const newRow = { id: crypto.randomUUID(), key, value, description: '', enabled: true };
          updateTab(tab.id, { headers: [...rows, newRow] });
        }}
      />
    </>
  );
}
