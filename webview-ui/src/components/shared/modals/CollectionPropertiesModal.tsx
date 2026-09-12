import { useState } from 'react';
import { AuthEditor, ScriptsEditor } from '..';
import { InfoCircleIcon } from '../../../icons';
import { ModalView, ButtonView, ChipView, TabView, type TabItem, KeyValueTableView, type KeyValueTableRow } from '@salilvnair/dui';
import { getMethodColors } from '../../../colors/daakia-colors';
import { ExecutionSettingsEditor } from '../settings/ExecutionSettingsEditor';
import { useEffectiveSettings } from '../settings/use-effective-settings';
import type { ExecutionSettings } from '../settings/execution-settings';

export interface CollectionProperties {
  headers: KeyValueTableRow[];
  authType: string;
  authData: Record<string, string>;
  variables: KeyValueTableRow[];
  preRequestScript: string;
  postResponseScript: string;
  /**
   * Execution overrides for every request in this collection — timeout,
   * redirects, SSL, encoding, proxy. Optional, and every field within it is
   * optional too: what is not set here follows the global settings, and what
   * a request sets wins over both.
   */
  settings?: ExecutionSettings;
}

interface CollectionPropertiesModalProps {
  open: boolean;
  /** Needed to ask the host what this collection inherits. */
  collectionId?: string;
  collectionName: string;
  /**
   * How many requests it holds, by HTTP method.
   *
   * Passed in rather than derived here: the tree lives in the panel that owns
   * it, and a modal that went looking for it would need the whole collections
   * service to render a title.
   */
  methodCounts?: Record<string, number>;
  properties: CollectionProperties;
  onSave: (props: CollectionProperties) => void;
  onClose: () => void;
}

const TABS: TabItem[] = [
  { id: 'headers',       label: 'Headers' },
  { id: 'authorization', label: 'Authorization' },
  { id: 'variables',     label: 'Variables' },
  { id: 'scripts',       label: 'Scripts' },
  { id: 'settings',      label: 'Settings' },
];

export function CollectionPropertiesModal({ open, collectionId, collectionName, properties, methodCounts, onSave, onClose }: CollectionPropertiesModalProps) {
  const [activeTab, setActiveTab] = useState('headers');
  const [headers, setHeaders]                     = useState<KeyValueTableRow[]>(properties.headers as KeyValueTableRow[]);
  const [authType, setAuthType]                   = useState(properties.authType);
  const [authData, setAuthData]                   = useState(properties.authData);
  const [variables, setVariables]                 = useState<KeyValueTableRow[]>(properties.variables as KeyValueTableRow[]);
  const [preRequestScript, setPreRequestScript]   = useState(properties.preRequestScript);
  const [postResponseScript, setPostResponseScript] = useState(properties.postResponseScript);
  const [settings, setSettings] = useState<ExecutionSettings>(properties.settings ?? {});

  // A collection inherits from the global settings only. Passing scope
  // 'collection' keeps the host from folding this collection's own values in
  // and showing them back as something it inherited.
  const effective = useEffectiveSettings('collection', { collectionId }, open);

  const handleSave = () => {
    onSave({ headers, authType, authData, variables, preRequestScript, postResponseScript, settings });
    onClose();
  };

  /*
    Ordered by how many there are, so the shape of the collection reads off
    the row — a mostly-GET collection looks different from a mostly-POST one
    at a glance, which alphabetical order would hide.
  */
  const METHOD_COLORS = getMethodColors();
  const colorFor = (m: string) =>
    (METHOD_COLORS as Record<string, string>)[m] ?? 'var(--color-text-muted)';
  const methods: [string, number][] = Object.entries(methodCounts ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const total = methods.reduce((n, [, c]) => n + c, 0);

  return (
    <ModalView
      open={open}
      onClose={onClose}
      /*
        The collection first, then what you are doing to it.

        "Collection Properties" was the heading and the name was appended to
        it, so the dialog announced its own function louder than the thing it
        was about — and every properties dialog looked identical at a glance.
        The name is the subject; "Properties" is the quieter word that says
        which dialog this is.
      */
      title={
        <span className="flex items-baseline gap-2 min-w-0">
          <span className="truncate">{collectionName || 'Collection'}</span>
          <span className="shrink-0 font-normal"
                style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
            Properties
          </span>
        </span>
      }
      /*
        Capped below the default 85vh. The body is a handful of rows on most
        tabs, and a dialog that always stood nearly the full height of the
        window made an empty headers table look like a page.
      */
      maxHeight="68vh"
      size="xl"
      /*
        DUI's chip, not a hand-rolled span. The app already has one look for a
        small labelled count, and a second one invented here would be a near
        miss of it — `rounded={false}` is the squared variant the rest of the
        product uses for these.
      */
      subtitle={total ? (
        <span className="flex items-center gap-1.5 flex-wrap pt-1">
          <ChipView label={`${total} ${total === 1 ? 'request' : 'requests'}`}
                    size="xs" rounded={false} color="var(--color-accent)" />
          {methods.map(([method, count]) => (
            <ChipView key={method} label={`${method} ${count}`}
                      size="xs" rounded={false} color={colorFor(method)} />
          ))}
        </span>
      ) : undefined}
      noPadding
      footerRight={
        <ButtonView variant="primary" size="md" onClick={handleSave}>
          Save
        </ButtonView>
      }
    >
      {/* Tab bar */}
      <div className="px-3 pt-2.5 pb-0" style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <TabView
          tabs={TABS}
          activeTab={activeTab}
          onChange={setActiveTab}
          size="md"
          variant="underline"
        />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '16px 18px', height: '60vh' }}>
        {activeTab === 'headers' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <KeyValueTableView
              rows={headers}
              onChange={setHeaders}
              placeholder={{ key: 'Header', value: 'Value' }}
              label="Headers"
              maskSensitive
              autocompleteKeys
              showDescription
            />
            <p className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1.5 px-1">
              <InfoCircleIcon size={12} className="shrink-0" />
              This header will be sent with every request in this collection.
            </p>
          </div>
        )}

        {activeTab === 'authorization' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <AuthEditor
              authType={authType}
              authData={authData}
              onAuthTypeChange={setAuthType}
              onAuthDataChange={(d) => setAuthData(d as Record<string, string>)}
            />
            <p className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1.5 px-1">
              <InfoCircleIcon size={12} className="shrink-0" />
              This authorization applies to every request in this collection.
            </p>
          </div>
        )}

        {activeTab === 'variables' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <KeyValueTableView
              rows={variables}
              onChange={setVariables}
              placeholder={{ key: 'Variable', value: 'Value' }}
              label="Collection Variables"
              showDescription
            />
            <p className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1.5 px-1">
              <InfoCircleIcon size={12} className="shrink-0" />
              Collection variables are available to all requests within this collection.
            </p>
          </div>
        )}

        {activeTab === 'scripts' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <ScriptsEditor
              preRequestScript={preRequestScript}
              postResponseScript={postResponseScript}
              onPreRequestScriptChange={setPreRequestScript}
              onPostResponseScriptChange={setPostResponseScript}
            />
          </div>
        )}

        {activeTab === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <ExecutionSettingsEditor
              scope="collection"
              value={settings}
              onChange={setSettings}
              inherited={effective.values}
              inheritedFrom={effective.from}
            />
          </div>
        )}
      </div>
    </ModalView>
  );
}
