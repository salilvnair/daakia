import { useState } from 'react';
import { formatBytes } from '../../../services/response';
import type { ResponseData } from '../../../store/tabs-store';
import { AiActionButton } from '../../ai/AiAssistPopover';
import { useAiFeaturesStore } from '../../../store/ai-features-store';

interface ResponseStatusBarProps {
  response: ResponseData;
  /** The method of the request that produced this response */
  requestMethod?: string;
  /** The URL of the request that produced this response */
  requestUrl?: string;
  /** Optional request body sent with the request */
  requestBody?: string;
}

export function ResponseStatusBar({ response, requestMethod = 'GET', requestUrl = '', requestBody }: ResponseStatusBarProps) {
  const [aiOpen, setAiOpen] = useState(false);
  const errorDiagnosisEnabled = useAiFeaturesStore(s => s.isEnabled('errorDiagnosis'));
  const isNetworkError = response.status === 0;
  const isError = isNetworkError || response.status >= 400;
  const statusLabel = isNetworkError ? response.statusText || 'Error' : `${response.status} ${response.statusText}`;
  const statusColor = isNetworkError
    ? 'text-[#ef4444] bg-[rgba(239,68,68,0.12)]'
    : response.status < 300
      ? 'text-[var(--color-success)] bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)]'
      : response.status < 400
        ? 'text-[#f59e0b] bg-[rgba(245,158,11,0.12)]'
        : 'text-[#ef4444] bg-[rgba(239,68,68,0.12)]';

  return (
    <div>
    {response.bodyTruncated && (
      <div className="flex items-center gap-2 px-4 py-1 bg-[rgba(245,158,11,0.08)] border-t border-[rgba(245,158,11,0.25)] text-[10.5px] text-[#f59e0b]">
        ⚠ Response body truncated to 512 KB for display. Full size: {response.fullSize ? (response.fullSize / 1024 / 1024).toFixed(2) + ' MB' : 'unknown'}.
      </div>
    )}
    <div className="flex items-center gap-4 px-4 py-2 border-t border-[var(--color-surface-border)] bg-[var(--color-surface)]">
      <span className="text-[12px] flex items-center gap-1.5">
        <span className="text-[var(--color-text-muted)]">Status:</span>
        <span className={`px-1.5 py-[1px] rounded text-[10px] font-bold font-mono ${statusColor}`}>
          {statusLabel}
        </span>
      </span>
      <span className="text-[12px] flex items-center gap-1.5">
        <span className="text-[var(--color-text-muted)]">Time:</span>
        <span className="px-1.5 py-[1px] rounded text-[10px] font-mono font-semibold bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)]">{response.time} ms</span>
      </span>
      <span className="text-[12px] flex items-center gap-1.5">
        <span className="text-[var(--color-text-muted)]">Size:</span>
        <span className="px-1.5 py-[1px] rounded text-[10px] font-mono font-semibold bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)]">{formatBytes(response.size)}</span>
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* AI action: error diagnosis — only shown on 4xx/5xx/network errors when feature enabled */}
      {isError && requestUrl && errorDiagnosisEnabled && (
        <AiActionButton
          mode="error-diagnosis"
          label="Ask AI why"
          response={response}
          requestMethod={requestMethod}
          requestUrl={requestUrl}
          requestBody={requestBody}
          open={aiOpen}
          onOpen={() => setAiOpen(p => !p)}
        />
      )}
    </div>
    </div>
  );
}
