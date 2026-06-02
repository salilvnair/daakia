import { useState } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { postMsg } from '../../vscode';
import { CodeEditor, StyledDropdown, ConfirmDialog } from '../shared';
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
      <div className="rounded-lg border border-[rgba(255,255,255,0.06)] overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-[rgba(255,255,255,0.02)]">
          <span className="text-[12px] font-medium text-[var(--color-text-primary)]">WS-Security</span>
          <button
            type="button"
            onClick={() => updateSecurity({ enabled: !wsSecurity.enabled })}
            className={`w-8 h-4 rounded-full relative transition-colors cursor-pointer ${wsSecurity.enabled ? 'bg-[var(--color-protocol-soap)]' : 'bg-[rgba(255,255,255,0.12)]'}`}
          >
            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${wsSecurity.enabled ? 'left-4' : 'left-0.5'}`} />
          </button>
        </div>

        {wsSecurity.enabled && (
          <div className="px-3 py-3 border-t border-[rgba(255,255,255,0.04)] flex flex-col gap-3">
            {/* Username Token */}
            <div className="text-[10px] text-[var(--color-text-muted)] uppercase font-semibold tracking-wider">Username Token</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-[var(--color-text-muted)] mb-1 block">Username</label>
                <input
                  type="text"
                  value={wsSecurity.username || ''}
                  onChange={(e) => updateSecurity({ username: e.target.value })}
                  placeholder="{{soap_user}}"
                  className="w-full h-[28px] px-2 text-[12px] rounded-md bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-protocol-soap)]"
                />
              </div>
              <div>
                <label className="text-[10px] text-[var(--color-text-muted)] mb-1 block">Password</label>
                <input
                  type="password"
                  value={wsSecurity.password || ''}
                  onChange={(e) => updateSecurity({ password: e.target.value })}
                  placeholder="{{soap_pass}}"
                  className="w-full h-[28px] px-2 text-[12px] rounded-md bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-protocol-soap)]"
                />
              </div>
            </div>

            <div className="flex items-end gap-3">
              <div className="w-[180px]">
                <label className="text-[10px] text-[var(--color-text-muted)] mb-1 block">Password Type</label>
                <StyledDropdown
                  options={PASSWORD_TYPE_OPTIONS}
                  value={wsSecurity.passwordType}
                  onChange={(v) => updateSecurity({ passwordType: v as 'PasswordText' | 'PasswordDigest' })}
                  size="sm"
                  accentColor={ACCENT}
                />
              </div>
              <label className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)] cursor-pointer">
                <input type="checkbox" checked={wsSecurity.addNonce} onChange={(e) => updateSecurity({ addNonce: e.target.checked })} className="accent-[var(--color-protocol-soap)]" />
                Nonce
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)] cursor-pointer">
                <input type="checkbox" checked={wsSecurity.addCreated} onChange={(e) => updateSecurity({ addCreated: e.target.checked })} className="accent-[var(--color-protocol-soap)]" />
                Created
              </label>
            </div>

            {/* Timestamp */}
            <div className="text-[10px] text-[var(--color-text-muted)] uppercase font-semibold tracking-wider mt-2">Timestamp</div>
            <div className="flex items-end gap-3">
              <label className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)] cursor-pointer">
                <input type="checkbox" checked={wsSecurity.addTimestamp} onChange={(e) => updateSecurity({ addTimestamp: e.target.checked })} className="accent-[var(--color-protocol-soap)]" />
                Include Timestamp
              </label>
              {wsSecurity.addTimestamp && (
                <div className="flex items-center gap-1.5">
                  <label className="text-[10px] text-[var(--color-text-muted)]">TTL (sec):</label>
                  <input
                    type="number"
                    value={wsSecurity.timestampTtl}
                    onChange={(e) => updateSecurity({ timestampTtl: parseInt(e.target.value) || 300 })}
                    className="w-[60px] h-[24px] px-1.5 text-[11px] rounded bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-protocol-soap)]"
                  />
                </div>
              )}
            </div>

            {/* Preview button */}
            <button
              type="button"
              onClick={handlePreview}
              className="self-start h-[26px] px-3 text-[10px] font-medium rounded-md cursor-pointer transition-colors mt-1"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-protocol-soap) 12%, transparent)', color: ACCENT }}
            >
              Preview Security Header
            </button>
          </div>
        )}
      </div>

      {/* Custom SOAP Header Blocks */}
      <div className="rounded-lg border border-[rgba(255,255,255,0.06)] overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-[rgba(255,255,255,0.02)]">
          <span className="text-[12px] font-medium text-[var(--color-text-primary)]">Custom SOAP Headers</span>
          <button
            type="button"
            onClick={addHeaderBlock}
            className="w-5 h-5 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-protocol-soap)] cursor-pointer transition-colors"
            title="Add header block"
          >
            <PlusIcon size={12} />
          </button>
        </div>

        {headerBlocks.length === 0 ? (
          <div className="px-3 py-3 text-[11px] text-[var(--color-text-muted)] border-t border-[rgba(255,255,255,0.04)]">
            No custom SOAP headers. Click + to add one.
          </div>
        ) : (
          <div className="border-t border-[rgba(255,255,255,0.04)]">
            {headerBlocks.map(block => (
              <div key={block.id} className="border-b border-[rgba(255,255,255,0.03)] last:border-b-0">
                <div className="flex items-center gap-2 px-3 py-1.5">
                  <button
                    type="button"
                    onClick={() => updateHeaderBlock(block.id, { enabled: !block.enabled })}
                    className={`w-6 h-3.5 rounded-full relative transition-colors cursor-pointer flex-shrink-0 ${block.enabled ? 'bg-[var(--color-protocol-soap)]' : 'bg-[rgba(255,255,255,0.12)]'}`}
                  >
                    <span className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all ${block.enabled ? 'left-3' : 'left-0.5'}`} />
                  </button>
                  <input
                    type="text"
                    value={block.name}
                    onChange={(e) => updateHeaderBlock(block.id, { name: e.target.value })}
                    className="flex-1 min-w-0 h-[24px] px-1.5 text-[11px] rounded bg-transparent border-none text-[var(--color-text-primary)] focus:outline-none"
                    placeholder="Header Name"
                  />
                  <input
                    type="text"
                    value={block.namespace}
                    onChange={(e) => updateHeaderBlock(block.id, { namespace: e.target.value })}
                    className="flex-1 min-w-0 h-[24px] px-1.5 text-[10px] font-mono rounded bg-transparent border-none text-[var(--color-text-muted)] focus:outline-none"
                    placeholder="xmlns:..."
                  />
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(block.id)}
                    className="w-5 h-5 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-error)] cursor-pointer transition-colors flex-shrink-0"
                  >
                    <TrashIcon size={10} />
                  </button>
                </div>
                <div className="h-[80px] mx-3 mb-2 rounded overflow-hidden border border-[rgba(255,255,255,0.06)]">
                  <CodeEditor
                    value={block.content}
                    onChange={(v) => updateHeaderBlock(block.id, { content: v })}
                    language="xml"
                    lineNumbers={false}
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
