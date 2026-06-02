import { useCallback, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTabsStore } from '../../store/tabs-store';
import { postMsg } from '../../vscode';
import { UploadIcon, TrashIcon, RefreshIcon, DownloadIcon, HelpCircleIcon, CheckCircleFilledIcon, WarningTriangleIcon } from '../../icons';
import { useClickOutside } from '../../hooks/useClickOutside';
import { PROTO_SAMPLES } from './proto-samples';

const ACCENT = 'var(--color-protocol-grpc)';

function downloadSample(sample: typeof PROTO_SAMPLES[number]) {
  const blob = new Blob([sample.content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = sample.filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadAll() {
  PROTO_SAMPLES.forEach(s => downloadSample(s));
}

/**
 * GrpcProtoManager — Proto file upload + management UI.
 * Upload .proto files for method discovery + IntelliSense.
 * Also supports server reflection as an alternative.
 */
export function GrpcProtoManager() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);
  const [showSamples, setShowSamples] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useClickOutside(popupRef, () => setShowSamples(false), showSamples);

  useEffect(() => {
    if (!showSamples || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const popupWidth = 320;
    const popupHeight = 460;
    let left = rect.left;
    let top = rect.bottom + 6;
    if (left + popupWidth > window.innerWidth) left = rect.right - popupWidth;
    if (top + popupHeight > window.innerHeight) top = rect.top - popupHeight - 6;
    left = Math.max(4, Math.min(left, window.innerWidth - popupWidth - 4));
    top = Math.max(4, top);
    setPos({ top, left });
  }, [showSamples]);

  const handleUpload = useCallback(() => {
    if (!activeTab) return;
    postMsg({ type: 'grpc:upload-proto', tabId: activeTab.id });
  }, [activeTab]);

  const handleReflect = useCallback(() => {
    if (!activeTab) return;
    const endpoint = activeTab.url.trim();
    if (!endpoint) return;
    updateTab(activeTab.id, { grpcReflectionStatus: 'loading', grpcReflectionError: undefined });
    postMsg({
      type: 'grpc:reflect',
      tabId: activeTab.id,
      endpoint,
      tls: activeTab.grpcTls ?? false,
    });
  }, [activeTab, updateTab]);

  const handleRemoveProto = useCallback(() => {
    if (!activeTab) return;
    updateTab(activeTab.id, { grpcProtoFile: undefined, dirty: true });
  }, [activeTab, updateTab]);

  if (!activeTab) return null;

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Proto Source
        </h4>
        <button
          ref={btnRef}
          type="button"
          onClick={() => setShowSamples(!showSamples)}
          className="w-5 h-5 flex items-center justify-center rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-protocol-grpc)] hover:bg-[rgba(0,184,181,0.08)] cursor-pointer transition-colors"
          title="Sample Proto Files"
        >
          <HelpCircleIcon size={13} />
        </button>
      </div>

      {/* Current proto file */}
      {activeTab.grpcProtoFile ? (
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)]">
          <span className="flex-1 text-[12px] font-mono text-[var(--color-text-primary)] truncate">
            {activeTab.grpcProtoFile.split(/[/\\]/).pop()}
          </span>
          <button
            type="button"
            onClick={handleRemoveProto}
            className="w-6 h-6 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.08)] cursor-pointer transition-colors"
            title="Remove proto file"
          >
            <TrashIcon size={12} />
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-[var(--color-text-muted)]">No proto file loaded</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleUpload}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium cursor-pointer transition-colors hover:opacity-90"
          style={{ color: ACCENT, backgroundColor: 'rgba(0,184,181,0.1)' }}
        >
          <UploadIcon size={12} />
          Upload .proto
        </button>

        <button
          type="button"
          onClick={handleReflect}
          disabled={!activeTab.url.trim() || activeTab.grpcReflectionStatus === 'loading'}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.08)] cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {activeTab.grpcReflectionStatus === 'loading' ? (
            <span className="w-3 h-3 border-[1.5px] border-[var(--color-text-muted)] border-t-transparent rounded-full animate-spin" />
          ) : activeTab.grpcReflectionStatus === 'connected' ? (
            <CheckCircleFilledIcon size={12} style={{ color: '#4ade80' }} />
          ) : activeTab.grpcReflectionStatus === 'warning' ? (
            <WarningTriangleIcon size={12} style={{ color: '#fbbf24' }} />
          ) : (
            <RefreshIcon size={12} />
          )}
          Server Reflection
        </button>
      </div>



      {activeTab.grpcReflectionStatus === 'error' && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[rgba(239,68,68,0.06)] border border-[rgba(239,68,68,0.15)]">
          <span className="text-[11px] text-[var(--color-error)]">{activeTab.grpcReflectionError || 'Reflection failed'}</span>
        </div>
      )}

      {activeTab.grpcReflectionStatus === 'warning' && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[rgba(251,191,36,0.06)] border border-[rgba(251,191,36,0.15)]">
          <WarningTriangleIcon size={11} style={{ color: '#fbbf24' }} />
          <span className="text-[11px] text-[#fbbf24]">{activeTab.grpcReflectionError || 'No services available'}</span>
        </div>
      )}

      {!activeTab.url.trim() && activeTab.grpcReflectionStatus !== 'connected' && activeTab.grpcReflectionStatus !== 'warning' && (
        <p className="text-[10px] text-[var(--color-text-muted)] italic">
          Enter server URL to load methods using server reflection.
        </p>
      )}

      {/* Proto Samples Popup */}
      {showSamples && createPortal(
        <div
          ref={popupRef}
          className="fixed z-[99999] w-[320px] bg-[var(--color-surface)] border border-[var(--color-surface-border)] rounded-lg shadow-xl animate-[fadeSlideIn_150ms_ease-out]"
          style={{ top: pos.top, left: pos.left }}
        >
          {/* Header */}
          <div className="px-4 pt-4 pb-2">
            <h4 className="text-[13px] font-semibold text-[var(--color-text-primary)]">Sample Proto Files</h4>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-1 leading-[15px]">
              Download real-world .proto definitions to test gRPC client functionality.
            </p>
          </div>

          {/* Sample list */}
          <div className="px-2 py-1 max-h-[360px] overflow-y-auto [scrollbar-gutter:stable]">
            {PROTO_SAMPLES.map(sample => (
              <div
                key={sample.id}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-[rgba(255,255,255,0.04)] group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-[var(--color-text-primary)] truncate">{sample.label}</p>
                  <p className="text-[10px] text-[var(--color-text-muted)] truncate">{sample.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => downloadSample(sample)}
                  className="w-6 h-6 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-protocol-grpc)] hover:bg-[rgba(0,184,181,0.1)] cursor-pointer transition-colors shrink-0"
                  title={`Download ${sample.filename}`}
                >
                  <DownloadIcon size={13} />
                </button>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2 px-4 py-3 border-t border-[var(--color-surface-border)]">
            <button
              type="button"
              onClick={() => { downloadAll(); setShowSamples(false); }}
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
              Cancel
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
