import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTabsStore } from '../../store/tabs-store';
import { useMockStore } from '../../store/mock-store';
import { postMsg } from '../../vscode';
import { CloseIcon, UploadIcon, LinkIcon, SpinnerIcon, HelpCircleIcon, DownloadIcon } from '../../icons';
import { useClickOutside } from '../../hooks/useClickOutside';
import { WSDL_SAMPLES } from './wsdl-samples';
import type { WsdlSample } from './wsdl-samples';
import type { SoapServiceDef } from '../../store/tabs-store';

const ACCENT = 'var(--color-protocol-soap)';

interface SoapWsdlImportProps {
  open: boolean;
  onClose: () => void;
}

/**
 * SoapWsdlImport — Modal to import a WSDL from URL or upload a local .wsdl file.
 * On success, stores parsed service/port/operation tree on the active tab.
 */
export function SoapWsdlImport({ open, onClose }: SoapWsdlImportProps) {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const tabIdRef = useRef(activeTab?.id);
  tabIdRef.current = activeTab?.id;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const mockServers = useMockStore(s => s.servers);

  const [mode, setMode] = useState<'url' | 'file'>('url');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSamples, setShowSamples] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const helpBtnRef = useRef<HTMLButtonElement>(null);
  const samplesRef = useRef<HTMLDivElement>(null);
  const [samplesPos, setSamplesPos] = useState({ top: 0, left: 0 });

  useClickOutside(samplesRef, () => setShowSamples(false), showSamples);

  // Reset state when modal opens or tab changes
  useEffect(() => {
    if (open) {
      setLoading(false);
      setError(null);
    }
  }, [open, activeTab?.id]);

  // Listen for WSDL parse results — stable deps only (open) to prevent re-registration
  useEffect(() => {
    if (!open) return;

    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (!msg) return;
      const currentTabId = tabIdRef.current;
      if (!currentTabId) return;

      if (msg.type === 'soap:wsdlLoaded' && msg.tabId === currentTabId) {
        setLoading(false);
        setError(null);
        const services = msg.services as SoapServiceDef[];
        // Extract endpoint URL from the first port's address
        const patch: Record<string, unknown> = { soapServices: services, dirty: true };
        const firstAddress = findFirstEndpoint(services);
        if (firstAddress) {
          patch.url = firstAddress;
        }
        useTabsStore.getState().updateTab(currentTabId, patch);
        onCloseRef.current();
      }

      if (msg.type === 'soap:wsdlError' && msg.tabId === currentTabId) {
        setLoading(false);
        setError(msg.error as string);
      }

      if (msg.type === 'soap:wsdlLoading' && msg.tabId === currentTabId) {
        setLoading(true);
        setError(null);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [open]);

  const handleLoadUrl = () => {
    if (!activeTab || !url.trim()) return;
    setLoading(true);
    setError(null);
    const trimmed = url.trim();
    const finalUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
    postMsg({ type: 'soap:loadWsdl', tabId: activeTab.id, url: finalUrl });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeTab) return;

    setLoading(true);
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      postMsg({ type: 'soap:loadWsdlContent', tabId: activeTab.id, content, filename: file.name });
    };
    reader.readAsText(file);
  };

  const downloadSample = (sample: WsdlSample) => {
    const runningSoap = mockServers.find(s => s.protocol === 'soap' && s.running && s.port);
    const content = runningSoap
      ? sample.content.replace(/localhost:8080/g, `localhost:${runningSoap.port}`)
      : sample.content;
    const blob = new Blob([content], { type: 'text/xml' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = sample.filename;
    a.click();
    URL.revokeObjectURL(href);
  };

  const downloadAll = () => {
    WSDL_SAMPLES.forEach(s => downloadSample(s));
    setShowSamples(false);
  };

  const toggleSamples = () => {
    if (!showSamples && helpBtnRef.current) {
      const rect = helpBtnRef.current.getBoundingClientRect();
      const popupWidth = 340;
      let left = rect.right + 8;
      if (left + popupWidth > window.innerWidth) left = rect.left - popupWidth - 8;
      left = Math.max(4, left);
      setSamplesPos({ top: rect.top - 40, left });
    }
    setShowSamples(!showSamples);
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Modal */}
      <div className="relative w-[480px] max-h-[90vh] bg-[var(--color-surface)] border border-[var(--color-surface-border)] rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-surface-border)]">
          <div className="flex items-center gap-2">
            <h2 className="text-[14px] font-semibold text-[var(--color-text-primary)]">Import WSDL</h2>
            <button
              ref={helpBtnRef}
              type="button"
              onClick={toggleSamples}
              className="w-5 h-5 flex items-center justify-center rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-protocol-soap)] hover:bg-[rgba(232,121,249,0.08)] cursor-pointer transition-colors"
              title="Sample WSDL & XSD files"
            >
              <HelpCircleIcon size={13} />
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-icon-hover-bg)] cursor-pointer transition-colors"
          >
            <CloseIcon size={14} />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-1 px-5 pt-4">
          <button
            type="button"
            onClick={() => setMode('url')}
            className={`h-[28px] px-3 text-[11px] font-medium rounded-md cursor-pointer transition-colors flex items-center gap-1.5 ${
              mode === 'url'
                ? 'bg-[color-mix(in_srgb,var(--color-protocol-soap)_15%,transparent)] text-[var(--color-protocol-soap)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.04)]'
            }`}
          >
            <LinkIcon size={12} />
            From URL
          </button>
          <button
            type="button"
            onClick={() => setMode('file')}
            className={`h-[28px] px-3 text-[11px] font-medium rounded-md cursor-pointer transition-colors flex items-center gap-1.5 ${
              mode === 'file'
                ? 'bg-[color-mix(in_srgb,var(--color-protocol-soap)_15%,transparent)] text-[var(--color-protocol-soap)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.04)]'
            }`}
          >
            <UploadIcon size={12} />
            Upload File
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 flex flex-col gap-3">
          {mode === 'url' ? (
            <>
              <label className="text-[11px] text-[var(--color-text-muted)]">WSDL URL</label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleLoadUrl(); }}
                placeholder="https://example.com/service?wsdl"
                autoFocus
                className="w-full h-[36px] px-3 text-[12px] rounded-md bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-protocol-soap)]"
              />
            </>
          ) : (
            <>
              <label className="text-[11px] text-[var(--color-text-muted)]">Upload .wsdl or .xml file</label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-[80px] rounded-md border-2 border-dashed border-[rgba(255,255,255,0.12)] hover:border-[var(--color-protocol-soap)] flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <UploadIcon size={16} className="text-[var(--color-text-muted)]" />
                <span className="text-[12px] text-[var(--color-text-muted)]">Click to browse or drag file here</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".wsdl,.xml"
                onChange={handleFileUpload}
                className="hidden"
              />
            </>
          )}

          {/* Error */}
          {error && (
            <div className="px-3 py-2 rounded-md bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.25)] text-[11px] text-[var(--color-error)]">
              {error}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
              <SpinnerIcon size={12} className="animate-spin" />
              Parsing WSDL...
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--color-surface-border)]">
          <button
            type="button"
            onClick={onClose}
            className="h-[30px] px-4 text-[12px] rounded-md text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.08)] cursor-pointer transition-colors"
          >
            Cancel
          </button>
          {mode === 'url' && (
            <>
              <button
                type="button"
                onClick={() => {
                  if (!activeTab || !url.trim()) return;
                  const collectionName = `${url.trim().split('/').pop()?.replace('.wsdl', '') || 'WSDL'} Collection`;
                  postMsg({ type: 'soap:importWsdlToCollection', wsdlUrl: url.trim(), collectionName });
                }}
                disabled={!url.trim() || loading}
                className="h-[30px] px-3 text-[11.5px] font-medium rounded-md hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-opacity"
                style={{ color: ACCENT, border: `1px solid ${ACCENT}` }}
                title="Parse WSDL and create a SOAP collection with all operations"
              >
                Import to Collection
              </button>
              <button
                type="button"
                onClick={handleLoadUrl}
                disabled={!url.trim() || loading}
                className="h-[30px] px-4 text-[12px] font-medium rounded-md text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-opacity"
                style={{ backgroundColor: ACCENT }}
              >
                {loading ? 'Loading...' : 'Load WSDL'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* WSDL/XSD Samples Popup (portal inside the same overlay) */}
      {showSamples && (
        <div
          ref={samplesRef}
          className="fixed z-[99999] w-[340px] bg-[var(--color-surface)] border border-[var(--color-surface-border)] rounded-lg shadow-xl animate-[fadeSlideIn_150ms_ease-out]"
          style={{ top: samplesPos.top, left: samplesPos.left }}
        >
          <div className="px-4 pt-4 pb-2">
            <h4 className="text-[13px] font-semibold text-[var(--color-text-primary)]">Sample WSDL & XSD Files</h4>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-1 leading-[15px]">
              Download real-world .wsdl and .xsd definitions to test SOAP client and WSDL import.
            </p>
          </div>

          <div className="px-2 py-1 max-h-[360px] overflow-y-auto [scrollbar-gutter:stable]">
            {WSDL_SAMPLES.map(sample => (
              <div
                key={sample.id}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-[rgba(255,255,255,0.04)] group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[12px] font-medium text-[var(--color-text-primary)] truncate">{sample.label}</p>
                    <span className={`text-[8px] font-bold uppercase px-1 py-0.5 rounded ${
                      sample.type === 'xsd'
                        ? 'text-[#fbbf24] bg-[rgba(251,191,36,0.12)]'
                        : 'text-[var(--color-protocol-soap)] bg-[color-mix(in_srgb,var(--color-protocol-soap)_12%,transparent)]'
                    }`}>
                      {sample.type}
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--color-text-muted)] truncate">{sample.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => downloadSample(sample)}
                  className="w-6 h-6 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-protocol-soap)] hover:bg-[color-mix(in_srgb,var(--color-protocol-soap)_10%,transparent)] cursor-pointer transition-colors shrink-0"
                  title={`Download ${sample.filename}`}
                >
                  <DownloadIcon size={13} />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 px-4 py-3 border-t border-[var(--color-surface-border)]">
            <button
              type="button"
              onClick={downloadAll}
              className="h-[28px] px-3 text-[11px] font-medium rounded-md text-white cursor-pointer transition-colors hover:opacity-90"
              style={{ backgroundColor: ACCENT }}
            >
              Download All
            </button>
            <button
              type="button"
              onClick={() => setShowSamples(false)}
              className="h-[28px] px-3 text-[11px] font-medium rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.08)] cursor-pointer transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

/** Extract the first non-empty endpoint address from WSDL services. */
function findFirstEndpoint(services: SoapServiceDef[]): string | undefined {
  for (const svc of services) {
    for (const port of svc.ports) {
      if (port.address && port.address !== 'http://localhost/') {
        return port.address;
      }
    }
  }
  return undefined;
}
