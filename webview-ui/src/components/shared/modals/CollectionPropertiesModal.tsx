import { useState } from 'react';
import { AuthEditor, ScriptsEditor } from '..';
import { InfoCircleIcon } from '../../../icons';
import { ModalView, ButtonView, TabView, type TabItem, KeyValueTableView, type KeyValueTableRow } from '@salilvnair/dui';
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
      title="Collection Properties"
      size="xl"
      noPadding
      footerRight={
        <ButtonView variant="primary" size="md" onClick={handleSave}>
          Save
        </ButtonView>
      }
    >
      {/*
        Which collection this is, before anything you can change about it.

        The name was appended to the dialog's title, at title weight and title
        colour, where it read as part of the phrase rather than as the subject
        of it — and a long one was simply cut off. It gets its own line, and
        the counts beside it answer the question the name raises: how much is
        in here, and of what kind.
      */}
      <div className="flex items-center gap-2.5 flex-wrap px-3 pt-3 pb-1">
        <span className="text-[16px] font-semibold truncate"
              style={{ color: 'var(--color-text-primary)', maxWidth: '46ch' }}>
          {collectionName || 'Untitled collection'}
        </span>
        {!!total && (
          <span className="text-[10.5px] font-semibold px-2 py-[3px] rounded-full shrink-0"
                style={{
                  color: 'var(--color-accent)',
                  background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--color-accent) 32%, transparent)',
                }}>
            {total} {total === 1 ? 'request' : 'requests'}
          </span>
        )}
        {methods.map(([method, count]) => (
          <span key={method}
                className="text-[10px] font-bold px-1.5 py-[3px] rounded shrink-0 tracking-wide"
                style={{
                  color: colorFor(method),
                  background: `color-mix(in srgb, ${colorFor(method)} 15%, transparent)`,
                }}>
            {method} {count}
          </span>
        ))}
      </div>

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
