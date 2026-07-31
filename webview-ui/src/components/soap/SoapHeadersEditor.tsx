import { useState } from 'react';
import { SelectInputView, TextInputView, CheckboxView, ToggleSwitchView, ButtonView, IconButtonView } from '@salilvnair/dui';
import { useTabsStore } from '../../store/tabs-store';
import { postMsg } from '../../vscode';
import { CodeEditor, ConfirmDialog } from '../shared';
import { TrashIcon, PlusIcon } from '../../icons';
import type { SoapHeaderBlock, WsSecurityConfig } from '../../store/tabs-store';

const ACCENT = 'var(--color-protocol-soap)';

const PASSWORD_TYPE_OPTIONS = [
  { value: 'PasswordText', label: 'PasswordText' },
  { value: 'PasswordDigest', label: 'PasswordDigest (SHA-1)' },
];

/**
 * SoapHeadersEditor — two sections:
 * 1. WS-Security configuration (Username Token + Timestamp)
 * 2. Custom SOAP header blocks (arbitrary XML elements in <soap:Header>)
 */
export function SoapHeadersEditor() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  if (!activeTab) return null;

  const wsSecurity: WsSecurityConfig = activeTab.soapWsSecurity || {
    enabled: false,
    passwordType: 'PasswordText',
    addNonce: true,
    addCreated: true,
    addTimestamp: true,
    timestampTtl: 300,
  };

  const headerBlocks: SoapHeaderBlock[] = activeTab.soapHeaders || [];

  const updateSecurity = (patch: Partial<WsSecurityConfig>) => {
    updateTab(activeTab.id, {
      soapWsSecurity: { ...wsSecurity, ...patch },
      dirty: true,
    });
  };

  const addHeaderBlock = () => {
    const newBlock: SoapHeaderBlock = {
      id: crypto.randomUUID(),
      namespace: 'http://example.com/custom',
      name: 'CustomHeader',
      content: '<CustomHeader xmlns="http://example.com/custom">\n  <!-- Custom content -->\n</CustomHeader>',
      enabled: true,
    };
    updateTab(activeTab.id, {
      soapHeaders: [...headerBlocks, newBlock],
      dirty: true,
    });
  };

  const updateHeaderBlock = (id: string, patch: Partial<SoapHeaderBlock>) => {
    updateTab(activeTab.id, {
      soapHeaders: headerBlocks.map(h => h.id === id ? { ...h, ...patch } : h),
      dirty: true,
    });
  };

  const deleteHeaderBlock = (id: string) => {
    updateTab(activeTab.id, {
      soapHeaders: headerBlocks.filter(h => h.id !== id),
      dirty: true,
    });
    setDeleteConfirm(null);
  };

  const handlePreview = () => {
    if (!activeTab) return;
    postMsg({
      type: 'soap:generateSecurity',
      tabId: activeTab.id,
      envId: activeTab.envId,
      ...wsSecurity,
    });
  };

  return (
    <div className="flex flex-col gap-4 p-3">
      {/* WS-Security Section */}
      <div className="rounded-lg border border-[color-mix(in_srgb,var(--color-text-primary)_6%,transparent)] overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-[color-mix(in_srgb,var(--color-text-primary)_2%,transparent)]">
          <span className="text-[12px] font-medium text-[var(--color-text-primary)]">WS-Security</span>
          <ToggleSwitchView
            checked={wsSecurity.enabled}
            onChange={(v) => updateSecurity({ enabled: v })}
            size="sm"
            accentColor={ACCENT}
          />
        </div>

        {wsSecurity.enabled && (
          <div className="px-3 py-3 border-t border-[color-mix(in_srgb,var(--color-text-primary)_4%,transparent)] flex flex-col gap-3">
            {/* Username Token */}
            <div className="text-[10px] text-[var(--color-text-muted)] uppercase font-semibold tracking-wider">Username Token</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-[var(--color-text-muted)] mb-1 block">Username</label>
                <TextInputView
                  value={wsSecurity.username || ''}
                  onChange={(e) => updateSecurity({ username: e.target.value })}
                  placeholder="{{soap_user}}"
                  size="md"
                  width="fw"
                  accentColor={ACCENT}
                />
              </div>
              <div>
                <label className="text-[10px] text-[var(--color-text-muted)] mb-1 block">Password</label>
                <TextInputView
                  value={wsSecurity.password || ''}
                  onChange={(e) => updateSecurity({ password: e.target.value })}
                  placeholder="{{soap_pass}}"
                  size="md"
                  width="fw"
                  masked
                  accentColor={ACCENT}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-[var(--color-text-muted)] mb-1 block">Password Type</label>
                <SelectInputView
                  options={PASSWORD_TYPE_OPTIONS}
                  value={wsSecurity.passwordType}
                  onChange={(v) => updateSecurity({ passwordType: v as 'PasswordText' | 'PasswordDigest' })}
                  size="md"
                  accentColor={ACCENT}
                />
              </div>
              <div>
                <label className="text-[10px] text-[var(--color-text-muted)] mb-1 block">Security Flags</label>
                <div className="h-[34px] flex items-center gap-4">
                  <CheckboxView checked={wsSecurity.addNonce} onChange={(v) => updateSecurity({ addNonce: v })} label="Nonce" size="md" accentColor={ACCENT} />
                  <CheckboxView checked={wsSecurity.addCreated} onChange={(v) => updateSecurity({ addCreated: v })} label="Created" size="md" accentColor={ACCENT} />
                </div>
              </div>
            </div>

            {/* Timestamp */}
            <div>
              <div className="text-[10px] text-[var(--color-text-muted)] uppercase font-semibold tracking-wider mb-1.5">Timestamp</div>
              <div className="flex items-center gap-3">
                <CheckboxView checked={wsSecurity.addTimestamp} onChange={(v) => updateSecurity({ addTimestamp: v })} label="Include Timestamp" size="md" accentColor={ACCENT} />
                {wsSecurity.addTimestamp && (
                  <div className="flex items-center gap-1.5">
                    <label className="text-[10px] text-[var(--color-text-muted)]">TTL (sec):</label>
                    <TextInputView
                      value={String(wsSecurity.timestampTtl)}
                      onChange={(e) => updateSecurity({ timestampTtl: parseInt(e.target.value) || 300 })}
                      size="sm"
                      style={{ width: 70 }}
                      accentColor={ACCENT}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Preview button */}
            <ButtonView
              size="sm"
              accentColor={ACCENT}
              onClick={handlePreview}
              className="self-start"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-protocol-soap) 12%, transparent)', color: ACCENT }}
            >
              Preview Security Header
            </ButtonView>
          </div>
        )}
      </div>

      {/* Custom SOAP Header Blocks */}
      <div className="rounded-lg border border-[color-mix(in_srgb,var(--color-text-primary)_6%,transparent)] overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-[color-mix(in_srgb,var(--color-text-primary)_2%,transparent)]">
          <span className="text-[12px] font-medium text-[var(--color-text-primary)]">Custom SOAP Headers</span>
          <IconButtonView
            icon={<PlusIcon size={12} />}
            size="sm"
            accentColor={ACCENT}
            onClick={addHeaderBlock}
            tooltip="Add header block"
          />
        </div>

        {headerBlocks.length === 0 ? (
          <div className="px-3 py-3 text-[11px] text-[var(--color-text-muted)] border-t border-[color-mix(in_srgb,var(--color-text-primary)_4%,transparent)]">
            No custom SOAP headers. Click + to add one.
          </div>
        ) : (
          <div className="border-t border-[color-mix(in_srgb,var(--color-text-primary)_4%,transparent)]">
            {headerBlocks.map(block => (
              <div key={block.id} className="border-b border-[color-mix(in_srgb,var(--color-text-primary)_3%,transparent)] last:border-b-0">
                <div className="flex items-center gap-2 px-3 py-1.5">
                  <ToggleSwitchView
                    checked={block.enabled}
                    onChange={(v) => updateHeaderBlock(block.id, { enabled: v })}
                    size="xs"
                    accentColor={ACCENT}
                    className="flex-shrink-0"
                  />
                  <TextInputView
                    value={block.name}
                    onChange={(e) => updateHeaderBlock(block.id, { name: e.target.value })}
                    placeholder="Header Name"
                    size="sm"
                    width="fw"
                    className="flex-1 min-w-0"
                    accentColor={ACCENT}
                  />
                  <TextInputView
                    value={block.namespace}
                    onChange={(e) => updateHeaderBlock(block.id, { namespace: e.target.value })}
                    placeholder="xmlns:..."
                    size="sm"
                    width="fw"
                    className="flex-1 min-w-0 font-mono"
                    accentColor={ACCENT}
                  />
                  <IconButtonView
                    icon={<TrashIcon size={10} />}
                    size="sm"
                    accentColor="var(--color-error)"
                    onClick={() => setDeleteConfirm(block.id)}
                    className="flex-shrink-0"
                  />
                </div>
                <div className="h-[80px] mx-3 mb-2 rounded overflow-hidden border border-[color-mix(in_srgb,var(--color-text-primary)_6%,transparent)]">
                  <CodeEditor
                    value={block.content}
                    onChange={(v) => updateHeaderBlock(block.id, { content: v })}
                    language="xml"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {deleteConfirm && (
        <ConfirmDialog
          title="Delete header block?"
          message="This header block will be permanently removed."
          confirmLabel="Delete"
          onConfirm={() => deleteHeaderBlock(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}
