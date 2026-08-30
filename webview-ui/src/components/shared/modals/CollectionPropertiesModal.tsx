import { useState } from 'react';
import { AuthEditor, ScriptsEditor } from '..';
import { InfoCircleIcon } from '../../../icons';
import { ModalView, ButtonView, TabView, type TabItem, KeyValueTableView, type KeyValueTableRow } from '@salilvnair/dui';
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

export function CollectionPropertiesModal({ open, collectionId, collectionName, properties, onSave, onClose }: CollectionPropertiesModalProps) {
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

  return (
    <ModalView
      open={open}
      onClose={onClose}
      title={collectionName ? `Collection Properties — ${collectionName}` : 'Collection Properties'}
      size="xl"
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
