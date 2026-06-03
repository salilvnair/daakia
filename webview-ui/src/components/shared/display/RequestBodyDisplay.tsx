/**
 * RequestBodyDisplay — renders request body with special handling for multipart file attachments.
 * Detects lines starting with 📎 and renders them as file attachment cards.
 * Used in DevTools NetworkTab and Response TimelineView.
 */
import { useState } from 'react';
import { AttachmentIcon, DownloadIcon } from '../../../icons';
import { postMsg } from '../../../vscode';

interface Props {
  body: string;
  maxHeight?: string;
  className?: string;
}

interface FileAttachment {
  fieldName: string;
  fileName: string;
  mimeType: string;
  size: string;
  filePath: string;
}

function parseMultipartBody(body: string): { files: FileAttachment[]; textFields: string[] } | null {
  const lines = body.split('\n');
  const files: FileAttachment[] = [];
  const textFields: string[] = [];

  let hasFiles = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('📎')) {
      hasFiles = true;
      // Format: 📎 key: filename [mime/type] (size) {filePath}
      const match = trimmed.match(/📎\s+(.+?):\s+(.+?)\s+\[(.+?)\](?:\s+\((.+?)\))?(?:\s+\{(.+?)\})?/);
      if (match) {
        files.push({ fieldName: match[1], fileName: match[2], mimeType: match[3], size: match[4] || '', filePath: match[5] || '' });
      }
    } else {
      textFields.push(trimmed);
    }
  }

  return hasFiles ? { files, textFields } : null;
}

function FileCard({ file }: { file: FileAttachment }) {
  const [expanded, setExpanded] = useState(false);
  const isImage = file.mimeType.startsWith('image/');
  const isPdf = file.mimeType === 'application/pdf';

  return (
    <div
      className="flex items-center gap-2.5 px-2.5 py-[6px] rounded-md bg-[rgba(99,102,241,0.06)] border border-[rgba(99,102,241,0.15)] cursor-pointer hover:bg-[rgba(99,102,241,0.1)] transition-colors"
      onClick={() => setExpanded(!expanded)}
      title={`${file.fileName} (${file.mimeType})${file.size ? ` — ${file.size}` : ''}`}
    >
      <AttachmentIcon size={14} className="text-[var(--color-primary)] flex-shrink-0" />
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-[var(--color-text-primary)] truncate">{file.fileName}</span>
          {file.size && (
            <span className="text-[9px] px-1.5 py-[1px] rounded-full bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)] font-mono font-semibold flex-shrink-0">
              {file.size}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-[1px]">
          <span className="text-[9px] text-[var(--color-text-muted)] font-mono">{file.fieldName}</span>
          <span className="text-[9px] px-1.5 py-[0.5px] rounded bg-[var(--color-input-bg)] text-[var(--color-text-muted)] font-mono">
            {file.mimeType}
          </span>
          {(isImage || isPdf) && (
            <span className="text-[9px] text-[var(--color-primary)]">
              {isImage ? '🖼' : '📄'}
            </span>
          )}
        </div>
      </div>
      {file.filePath && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); postMsg({ type: 'openFilePath', filePath: file.filePath }); }}
          className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-[rgba(99,102,241,0.12)] text-[var(--color-text-muted)] hover:text-[var(--color-primary)] cursor-pointer transition-colors"
          title="Open file location"
        >
          <DownloadIcon size={12} />
        </button>
      )}
    </div>
  );
}

export function RequestBodyDisplay({ body, maxHeight = '150px', className = '' }: Props) {
  const parsed = parseMultipartBody(body);

  if (!parsed) {
    // Regular body — try JSON pretty-print
    let display = body;
    try { display = JSON.stringify(JSON.parse(body), null, 2); } catch { /* keep raw */ }
    return (
      <pre className={`text-[11px] text-[var(--color-text-primary)] font-mono whitespace-pre-wrap bg-[var(--color-input-bg)] rounded-md p-2 overflow-y-auto [scrollbar-gutter:stable] leading-[18px] ${className}`} style={{ maxHeight }}>
        {display}
      </pre>
    );
  }

  // Multipart display
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {/* File attachments */}
      {parsed.files.length > 0 && (
        <div className="flex flex-col gap-1">
          {parsed.files.map((file, idx) => (
            <FileCard key={idx} file={file} />
          ))}
        </div>
      )}
      {/* Text fields */}
      {parsed.textFields.length > 0 && (
        <div className="flex flex-col gap-0.5 mt-1">
          <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-medium px-1">Form Fields</span>
          {parsed.textFields.map((field, idx) => {
            const [key, ...rest] = field.split(': ');
            const value = rest.join(': ');
            return (
              <div key={idx} className="flex items-center gap-2 px-2 py-[3px] text-[11px]">
                <span className="text-[var(--color-accent)] font-mono font-medium flex-shrink-0">{key}</span>
                <span className="text-[var(--color-text-primary)] font-mono break-all">{value}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
