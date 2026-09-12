import { useState, useMemo } from 'react';
import { BadgeChipView } from '@salilvnair/dui';
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

/* BadgeChipView uppercases by default, which is right for a label and wrong
   for a value: "142 MS" and "1.2 KB" are harder to read than what they
   replaced, and a status line is scanned for its numbers. */
const CHIP_VALUE: React.CSSProperties = { textTransform: 'none', letterSpacing: 0 };

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
  /* One tone drives text, fill, border and highlight — a chip whose border and
     text disagree stops reading as one object. */
  const statusTone = isNetworkError || response.status >= 400
    ? 'var(--color-error)'
    : response.status < 300
      ? 'var(--color-success)'
      : 'var(--color-warning)';

  const anomaly = useAnomalyCheck(requestUrl, response.time ?? 0);

  return (
    <div>
      {response.bodyTruncated && (
        <div className="flex items-center gap-2 px-4 py-1 bg-[color-mix(in_srgb,var(--color-warning)_8%,transparent)] border-t border-[color-mix(in_srgb,var(--color-warning)_25%,transparent)] text-[10.5px] text-[var(--color-warning)]">
 Response body truncated to 512 KB for display. Full size: {response.fullSize ? (response.fullSize / 1024 / 1024).toFixed(2) + 'MB': 'unknown'}.
        </div>
      )}
      <div className="flex items-center gap-4 px-4 py-2 border-t border-[var(--color-surface-border)] bg-[var(--color-surface)]">
        {/* `textTransform: none` on all three: these are values, not labels, and
            "142 MS" reads worse than what it replaced. */}
        <span className="text-[12px] flex items-center gap-1.5">
          <span className="text-[var(--color-text-muted)]">Status:</span>
          <BadgeChipView tone={statusTone} size="md" style={CHIP_VALUE}>
            {statusLabel}
          </BadgeChipView>
        </span>
        <span className="text-[12px] flex items-center gap-1.5">
          <span className="text-[var(--color-text-muted)]">Time:</span>
          <BadgeChipView tone="var(--color-accent)" size="md" style={CHIP_VALUE}>
            {response.time} ms
          </BadgeChipView>
        </span>
        <span className="text-[12px] flex items-center gap-1.5">
          <span className="text-[var(--color-text-muted)]">Size:</span>
          <BadgeChipView tone="var(--color-accent)" size="md" style={CHIP_VALUE}>
            {formatBytes(response.size)}
          </BadgeChipView>
        </span>

        <div className="flex-1" />

        {/* Performance anomaly badge */}
        {perfAnomalyEnabled && anomaly && (
          /* Still a button: it opens the anomaly modal. The chip is what it
             looks like, not what it does. */
          <button
            type="button"
            onClick={() => setShowAnomaly(true)}
            className="border-none bg-transparent p-0 cursor-pointer animate-pulse"
            title={`Performance anomaly: ${Math.round(((response.time ?? 0) - anomaly.avg) / anomaly.avg * 100)}% slower than baseline`}
          >
            <BadgeChipView tone="var(--color-warning)" size="md" style={CHIP_VALUE}>
              <GaugeIcon size={10} style={{ marginRight: 4 }} />
              {anomaly.sigma.toFixed(1)}σ slow
            </BadgeChipView>
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
