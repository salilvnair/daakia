import { useState } from 'react';
import { useTabsStore } from '../../store/tabs-store';
import { ConfirmDialog } from '../shared';
import { PlusIcon, TrashIcon, FileUploadIcon } from '../../icons';
import type { SoapAttachment } from '../../store/tabs-store';

const ACCENT = 'var(--color-protocol-soap)';

/**
 * SoapAttachments — Manage MTOM/SwA file attachments for SOAP requests.
 * Files are stored as base64 in the tab state and sent as multipart/related MIME.
 */
export function SoapAttachments() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  if (!activeTab) return null;

  const attachments: SoapAttachment[] = activeTab.soapAttachments || [];

  const update = (newAttachments: SoapAttachment[]) => {
    updateTab(activeTab.id, { soapAttachments: newAttachments, dirty: true });
  };

  const handleAddFile = () => {
    // Use the VS Code postMessage API to request file pick from extension host
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = async () => {
      if (!input.files) return;
      const newAttachments: SoapAttachment[] = [...attachments];
      for (const file of Array.from(input.files)) {
        const base64 = await fileToBase64(file);
        newAttachments.push({
          id: crypto.randomUUID(),
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          contentId: `${crypto.randomUUID()}@daakia`,
          size: file.size,
          base64Data: base64,
          enabled: true,
        });
      }
      update(newAttachments);
    };
    input.click();
  };

  const toggleAttachment = (id: string) => {
    update(attachments.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a));
  };

  const deleteAttachment = (id: string) => {
    update(attachments.filter(a => a.id !== id));
    setDeleteConfirm(null);
  };

  const updateContentId = (id: string, contentId: string) => {
    update(attachments.map(a => a.id === id ? { ...a, contentId } : a));
  };

  return (
    <div className="flex flex-col gap-2 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[var(--color-text-muted)]">
          {attachments.length} attachment{attachments.length !== 1 ? 's' : ''}
          {attachments.length > 0 && (
            <> · {formatBytes(attachments.reduce((sum, a) => sum + a.size, 0))} total</>
          )}
        </span>
        <button
          type="button"
          onClick={handleAddFile}
          className="h-[24px] px-2 text-[10px] font-medium rounded cursor-pointer transition-colors flex items-center gap-1"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-protocol-soap) 12%, transparent)', color: ACCENT }}
        >
          <PlusIcon size={10} />
          Add File
        </button>
      </div>

      {/* Info banner */}
      <div className="text-[10px] text-[var(--color-text-muted)] px-2.5 py-1.5 rounded-md bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)]">
        Attachments are sent as MTOM (multipart/related). Reference them in the envelope with{' '}
        <code className="text-[var(--color-protocol-soap)]">&lt;xop:Include href="cid:content-id"/&gt;</code>
      </div>

      {/* Attachment list */}
      {attachments.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <FileUploadIcon size={24} className="text-[var(--color-text-muted)] opacity-40" />
          <span className="text-[11px] text-[var(--color-text-muted)]">No attachments. Click + Add File to attach.</span>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {attachments.map(att => (
            <div
              key={att.id}
              className={`flex items-center gap-2 px-2.5 py-2 rounded-md transition-colors ${att.enabled ? 'bg-[rgba(255,255,255,0.02)]' : 'opacity-50'}`}
            >
              {/* Toggle */}
              <button
                type="button"
                onClick={() => toggleAttachment(att.id)}
                className={`w-6 h-3.5 rounded-full relative transition-colors cursor-pointer flex-shrink-0 ${att.enabled ? 'bg-[var(--color-protocol-soap)]' : 'bg-[rgba(255,255,255,0.12)]'}`}
              >
                <span className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all ${att.enabled ? 'left-3' : 'left-0.5'}`} />
              </button>

              {/* File info */}
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="text-[11px] text-[var(--color-text-primary)] truncate font-medium">{att.filename}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-[var(--color-text-muted)]">{att.contentType}</span>
                  <span className="text-[9px] text-[var(--color-text-muted)]">{formatBytes(att.size)}</span>
                </div>
                {/* Content ID input */}
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[9px] text-[var(--color-text-muted)] flex-shrink-0">cid:</span>
                  <input
                    type="text"
                    value={att.contentId}
                    onChange={(e) => updateContentId(att.id, e.target.value)}
                    className="flex-1 h-[20px] px-1.5 text-[10px] font-mono rounded bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-protocol-soap)]"
                  />
                </div>
              </div>

              {/* Delete */}
              <button
                type="button"
                onClick={() => setDeleteConfirm(att.id)}
                className="w-5 h-5 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-error)] cursor-pointer transition-colors flex-shrink-0"
              >
                <TrashIcon size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <ConfirmDialog
          title="Remove attachment?"
          message="This file will be removed from the request."
          confirmLabel="Remove"
          onConfirm={() => deleteAttachment(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data:mime;base64, prefix
      const base64 = result.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`;
}
