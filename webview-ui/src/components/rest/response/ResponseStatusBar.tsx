import { useState, useMemo } from 'react';
import { formatBytes } from '../../../services/response';
import type { ResponseData } from '../../../store/tabs-store';
import { AiActionButton } from '../../ai/AiAssistPopover';
import { useAiFeaturesStore } from '../../../store/ai-features-store';
import { useSidebarDataStore } from '../../../store/sidebar-data-store';
import { AiPerfAnomalyModal } from '../../ai/AiPerfAnomalyModal';
import { GaugeIcon } from '../../../icons';

interface ResponseStatusBarProps {
  response: ResponseData;
  requestMethod?: string;
  requestUrl?: string;
  requestBody?: string;
}

const ANOMALY_SIGMA_THRESHOLD = 2;

function useAnomalyCheck(url: string, currentTime: number, protocol = 'rest') {
  const history = useSidebarDataStore(s => s.history);
  return useMemo(() => {
    const entries = (history[protocol] ?? []).filter(e => e.url === url && e.response_time != null && e.response_time > 0);
    if (entries.length < 3) return null;
    const times = entries.map(e => e.response_time!);
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const max = Math.max(...times);
    const stdDev = avg * 0.35;
    const sigma = stdDev > 0 ? (currentTime - avg) / stdDev : 0;
    if (sigma < ANOMALY_SIGMA_THRESHOLD) return null;
    return { avg, max, count: times.length, sigma };
  }, [history, protocol, url, currentTime]);
}

export function ResponseStatusBar({ response, requestMethod = 'GET', requestUrl = '', requestBody }: ResponseStatusBarProps) {
  const [aiOpen, setAiOpen] = useState(false);
  const [showAnomaly, setShowAnomaly] = useState(false);
  const errorDiagnosisEnabled = useAiFeaturesStore(s => s.isEnabled('errorDiagnosis'));
  const perfAnomalyEnabled = useAiFeaturesStore(s => s.isEnabled('performanceAnomalyDetector'));
  const isNetworkError = response.status === 0;
  const isError = isNetworkError || response.status >= 400;
  const statusLabel = isNetworkError ? response.statusText || 'Error' : `${response.status} ${response.statusText}`;
  const statusColor = isNetworkError
    ? 'text-[var(--color-error)] bg-[color-mix(in_srgb,var(--color-error)_12%,transparent)]'
    : response.status < 300
      ? 'text-[var(--color-success)] bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)]'
      : response.status < 400
        ? 'text-[var(--color-warning)] bg-[color-mix(in_srgb,var(--color-warning)_12%,transparent)]'
        : 'text-[var(--color-error)] bg-[color-mix(in_srgb,var(--color-error)_12%,transparent)]';

  const anomaly = useAnomalyCheck(requestUrl, response.time ?? 0);

  return (
    <div>
      {response.bodyTruncated && (
        <div className="flex items-center gap-2 px-4 py-1 bg-[color-mix(in_srgb,var(--color-warning)_8%,transparent)] border-t border-[color-mix(in_srgb,var(--color-warning)_25%,transparent)] text-[10.5px] text-[var(--color-warning)]">
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

        <div className="flex-1" />

        {/* Performance anomaly badge */}
        {perfAnomalyEnabled && anomaly && (
          <button
            type="button"
            onClick={() => setShowAnomaly(true)}
            className="flex items-center gap-1 h-[22px] px-2 text-[10px] rounded cursor-pointer transition-all animate-pulse"
            style={{
              background: 'color-mix(in srgb, var(--color-warning) 15%, transparent)',
              color: 'var(--color-warning)',
              border: '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)',
            }}
            title={`Performance anomaly: ${Math.round(((response.time ?? 0) - anomaly.avg) / anomaly.avg * 100)}% slower than baseline`}
          >
            <GaugeIcon size={10} />
            <span className="font-medium">{anomaly.sigma.toFixed(1)}σ slow</span>
          </button>
        )}

        {/* AI action: error diagnosis */}
        {isError && requestUrl && errorDiagnosisEnabled && (
          <AiActionButton
            compact
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

      {showAnomaly && anomaly && (
        <AiPerfAnomalyModal
          url={requestUrl}
          currentTime={response.time ?? 0}
          avgTime={anomaly.avg}
          maxTime={anomaly.max}
          count={anomaly.count}
          onClose={() => setShowAnomaly(false)}
        />
      )}
    </div>
  );
}
