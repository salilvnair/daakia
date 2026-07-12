import { useCallback, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ButtonView, IconButtonView } from '@salilvnair/dui';
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
  const btnRef = useRef<HTMLSpanElement>(null);
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
    <div className="flex flex-col gap-3 px-4 py-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Proto Source
        </h4>
        <span ref={btnRef} className="inline-flex">
          <IconButtonView
            icon={<HelpCircleIcon size={13} />}
            size="sm"
            accentColor={ACCENT}
            onClick={() => setShowSamples(!showSamples)}
            tooltip="Sample Proto Files"
          />
        </span>
      </div>

      {/* Current proto file */}
      {activeTab.grpcProtoFile ? (
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-[color-mix(in_srgb,var(--color-text-primary)_4%,transparent)] border border-[color-mix(in_srgb,var(--color-text-primary)_8%,transparent)]">
          <span className="flex-1 text-[12px] font-mono text-[var(--color-text-primary)] truncate">
            {activeTab.grpcProtoFile.split(/[/\\]/).pop()}
          </span>
          <IconButtonView
            icon={<TrashIcon size={12} />}
            size="sm"
            accentColor="var(--color-error)"
            onClick={handleRemoveProto}
            tooltip="Remove proto file"
          />
        </div>
      ) : (
        <p className="text-[11px] text-[var(--color-text-muted)]">No proto file loaded</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <ButtonView
          size="sm"
          accentColor={ACCENT}
          onClick={handleUpload}
          iconLeft={<UploadIcon size={12} />}
          style={{ color: ACCENT, backgroundColor: 'color-mix(in srgb, var(--color-protocol-grpc) 10%, transparent)' }}
        >
          Upload .proto
        </ButtonView>

        <ButtonView
          size="sm"
          accentColor="var(--color-text-muted)"
          onClick={handleReflect}
          disabled={!activeTab.url.trim() || activeTab.grpcReflectionStatus === 'loading'}
          iconLeft={activeTab.grpcReflectionStatus === 'loading' ? (
            <span className="w-3 h-3 border-[1.5px] border-[var(--color-text-muted)] border-t-transparent rounded-full animate-spin" />
          ) : activeTab.grpcReflectionStatus === 'connected' ? (
            <CheckCircleFilledIcon size={12} style={{ color: 'var(--color-success)' }} />
          ) : activeTab.grpcReflectionStatus === 'warning' ? (
            <WarningTriangleIcon size={12} style={{ color: 'var(--color-warning)' }} />
          ) : (
            <RefreshIcon size={12} />
          )}
        >
          Server Reflection
        </ButtonView>
      </div>



      {activeTab.grpcReflectionStatus === 'error' && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[color-mix(in_srgb,var(--color-error)_6%,transparent)] border border-[color-mix(in_srgb,var(--color-error)_15%,transparent)]">
          <span className="text-[11px] text-[var(--color-error)]">{activeTab.grpcReflectionError || 'Reflection failed'}</span>
        </div>
      )}

      {activeTab.grpcReflectionStatus === 'warning' && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[color-mix(in_srgb,var(--color-warning)_6%,transparent)] border border-[color-mix(in_srgb,var(--color-warning)_15%,transparent)]">
          <WarningTriangleIcon size={11} style={{ color: 'var(--color-warning)' }} />
          <span className="text-[11px] text-[var(--color-warning)]">{activeTab.grpcReflectionError || 'No services available'}</span>
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
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-[color-mix(in_srgb,var(--color-text-primary)_4%,transparent)] group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-[var(--color-text-primary)] truncate">{sample.label}</p>
                  <p className="text-[10px] text-[var(--color-text-muted)] truncate">{sample.description}</p>
                </div>
                <IconButtonView
                  icon={<DownloadIcon size={13} />}
                  size="sm"
                  accentColor={ACCENT}
                  onClick={() => downloadSample(sample)}
                  tooltip={`Download ${sample.filename}`}
                  className="shrink-0"
                />
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2 px-4 py-3 border-t border-[var(--color-surface-border)]">
            <ButtonView
              size="sm"
              variant="primary"
              accentColor={ACCENT}
              onClick={() => { downloadAll(); setShowSamples(false); }}
            >
              Download All
            </ButtonView>
            <ButtonView
              size="sm"
              accentColor="var(--color-text-muted)"
              onClick={() => setShowSamples(false)}
            >
              Cancel
            </ButtonView>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
