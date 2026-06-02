import { useState } from 'react';
import { createPortal } from 'react-dom';
import { PillTabs, KeyValueTable, AuthEditor, ScriptsEditor, type KeyValueRow, type PillTab } from '..';
import { CloseIcon, InfoCircleIcon } from '../../../icons';

export interface CollectionProperties {
  headers: KeyValueRow[];
  authType: string;
  authData: Record<string, string>;
  variables: KeyValueRow[];
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

const TABS: PillTab[] = [
  { id: 'headers', label: 'Headers' },
  { id: 'authorization', label: 'Authorization' },
  { id: 'variables', label: 'Variables' },
  { id: 'scripts', label: 'Scripts' },
];

export function CollectionPropertiesModal({ open, collectionName, properties, onSave, onClose }: CollectionPropertiesModalProps) {
  const [activeTab, setActiveTab] = useState('headers');
  const [headers, setHeaders] = useState<KeyValueRow[]>(properties.headers);
  const [authType, setAuthType] = useState(properties.authType);
  const [authData, setAuthData] = useState(properties.authData);
  const [variables, setVariables] = useState<KeyValueRow[]>(properties.variables);
  const [preRequestScript, setPreRequestScript] = useState(properties.preRequestScript);
  const [postResponseScript, setPostResponseScript] = useState(properties.postResponseScript);

  if (!open) return null;

  const handleSave = () => {
    onSave({ headers, authType, authData, variables, preRequestScript, postResponseScript });
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"

    >
      <div className="w-full max-w-[800px] rounded-xl bg-[var(--color-elevated)] border border-[var(--color-elevated-border)] shadow-2xl animate-[fadeSlideIn_150ms_ease-out] flex flex-col h-[75vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[var(--color-surface-border)]">
          <h2 className="text-[18px] font-semibold text-[var(--color-text-primary)]">Collection Properties</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-[#ef4444] hover:text-[#dc2626] hover:bg-[rgba(239,68,68,0.08)] cursor-pointer transition-colors"
          >
            <CloseIcon size={14} />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-3 border-b border-[var(--color-surface-border)]">
          <PillTabs
            tabs={TABS}
            activeTab={activeTab}
            onChange={setActiveTab}
            size="sm"
            variant="underline"
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-visible px-6 py-4 flex flex-col">
          {activeTab === 'headers' && (
            <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable]">
              <KeyValueTable
                rows={headers}
                onChange={setHeaders}
                placeholder={{ key: 'Header', value: 'Value' }}
                label="Header List"
                autocompleteKeys
              />
              <p className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1.5 px-1">
                <InfoCircleIcon size={12} className="shrink-0" />
                This header will be set for every request in this collection.
              </p>
            </div>
          )}

          {activeTab === 'authorization' && (
            <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-visible">
              <AuthEditor
                authType={authType}
                authData={authData}
                onAuthTypeChange={setAuthType}
                onAuthDataChange={setAuthData}
              />
              <p className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1.5 px-1">
                <InfoCircleIcon size={12} className="shrink-0" />
                This authorization will be set for every request in this collection.
              </p>
            </div>
          )}

          {activeTab === 'variables' && (
            <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable]">
              <KeyValueTable
                rows={variables}
                onChange={setVariables}
                placeholder={{ key: 'Variable', value: 'Value' }}
                label="Variable List"
              />
              <p className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1.5 px-1">
                <InfoCircleIcon size={12} className="shrink-0" />
                Collection variables are available to all requests within this collection.
              </p>
            </div>
          )}

          {activeTab === 'scripts' && (
            <div className="flex flex-col flex-1 min-h-0">
              <ScriptsEditor
                preRequestScript={preRequestScript}
                postResponseScript={postResponseScript}
                onPreRequestScriptChange={setPreRequestScript}
                onPostResponseScriptChange={setPostResponseScript}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-[var(--color-surface-border)]">
          <button
            type="button"
            onClick={handleSave}
            className="h-[36px] px-4 text-[12.5px] font-medium rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)] cursor-pointer transition-colors"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-[36px] px-4 text-[12.5px] font-medium rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
