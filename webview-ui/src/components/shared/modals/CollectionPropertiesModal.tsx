import { useState } from 'react';
import { AuthEditor, ScriptsEditor } from '..';
import { InfoCircleIcon } from '../../../icons';
import { ModalView, ButtonView, TabView, type TabItem, KeyValueTableView, type KeyValueTableRow } from '../../../dui';

export interface CollectionProperties {
  headers: KeyValueTableRow[];
  authType: string;
  authData: Record<string, string>;
  variables: KeyValueTableRow[];
  preRequestScript: string;
  postResponseScript: string;
}

interface CollectionPropertiesModalProps {
  open: boolean;
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
];

export function CollectionPropertiesModal({ open, collectionName, properties, onSave, onClose }: CollectionPropertiesModalProps) {
  const [activeTab, setActiveTab] = useState('headers');
  const [headers, setHeaders]                     = useState<KeyValueTableRow[]>(properties.headers as KeyValueTableRow[]);
  const [authType, setAuthType]                   = useState(properties.authType);
  const [authData, setAuthData]                   = useState(properties.authData);
  const [variables, setVariables]                 = useState<KeyValueTableRow[]>(properties.variables as KeyValueTableRow[]);
  const [preRequestScript, setPreRequestScript]   = useState(properties.preRequestScript);
  const [postResponseScript, setPostResponseScript] = useState(properties.postResponseScript);

  const handleSave = () => {
    onSave({ headers, authType, authData, variables, preRequestScript, postResponseScript });
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
        <ButtonView variant="primary" size="sm" onClick={handleSave}>
          Save
        </ButtonView>
      }
    >
      {/* Tab bar — flush to modal header */}
      <div style={{ borderBottom: '1px solid var(--color-surface-border)', padding: '0 18px' }}>
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
              onAuthDataChange={setAuthData}
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
      </div>
    </ModalView>
  );
}
