import type { ResponseData } from '../../../store/tabs-store';
import { CheckIcon, CloseCircleIcon } from '../../../icons';
import { LEVEL_CONFIG, formatTimestamp, LogMessage, LevelIcon } from '../devtools/log-utils';

export function ScriptResultsView({ response }: { response: ResponseData }) {
  const { scriptErrors = [], testResults = [], consoleLogs = [] } = response;
  const passed = testResults.filter(t => t.passed).length;
  const failed = testResults.filter(t => !t.passed).length;
  const hasLogs = consoleLogs.length > 0 || scriptErrors.length > 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto [scrollbar-gutter:stable] font-mono text-[11px]">
      {/* Summary bar */}
      {testResults.length > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--color-surface-border)] flex-shrink-0">
          <span className="text-[11px] font-medium text-[var(--color-text-primary)]">Tests</span>
          <span className="text-[10px] px-1.5 py-[1px] rounded-full bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)] text-[var(--color-success)] font-semibold">
            {passed} passed
          </span>
          {failed > 0 && (
            <span className="text-[10px] px-1.5 py-[1px] rounded-full bg-[rgba(239,68,68,0.12)] text-[#ef4444] font-semibold">
              {failed} failed
            </span>
          )}
        </div>
      )}

      {/* Entries - console-like list */}
      <div className="py-1">
        {/* Test Results as console entries */}
        {testResults.map((test, idx) => (
          <div
            key={`test-${idx}`}
            className="flex items-start gap-2 px-3 py-[3px] hover:bg-[var(--color-input-bg)] border-l-2"
            style={{ borderLeftColor: test.passed ? 'var(--color-success)' : '#ef4444' }}
          >
            <span className="flex-shrink-0 pt-[1px]">
              {test.passed ? (
                <CheckIcon size={12} style={{ stroke: 'var(--color-success)' }} />
              ) : (
                <CloseCircleIcon size={12} style={{ color: '#ef4444' }} />
              )}
            </span>
            <span className={`flex-1 break-all whitespace-pre-wrap ${test.passed ? 'text-[var(--color-text-primary)]' : 'text-[#ef4444]'}`}>
              {test.name}
            </span>
            {test.error && (
              <span className="text-[10px] text-[#ef4444] truncate max-w-[300px] flex-shrink-0">
                {test.error}
              </span>
            )}
          </div>
        ))}

        {/* Console Logs — rendered identically to DevTools Console */}
        {consoleLogs.map((log, idx) => {
          const level = (log.level || 'log') as keyof typeof LEVEL_CONFIG;
          const config = LEVEL_CONFIG[level] || LEVEL_CONFIG.log;
          return (
            <div
              key={`clog-${idx}`}
              className="flex items-start gap-2 px-3 py-[3px] hover:bg-[var(--color-input-bg)] border-l-2"
              style={{ borderLeftColor: config.color }}
            >
              {/* Timestamp */}
              <span className="flex-shrink-0 text-[10px] text-[var(--color-text-muted)] pt-[1px] tabular-nums">
                {formatTimestamp(log.timestamp)}
              </span>
              {/* Level icon */}
              <span className="flex-shrink-0 pt-[1px]">
                <LevelIcon level={level} />
              </span>
              {/* Message with Raw/JSON toggle */}
              <LogMessage args={Array.isArray(log.args) ? log.args : [log.args]} />
              {/* Script phase badge */}
              {log.scriptPhase && (
                <span className="flex-shrink-0 text-[9px] px-1 py-[0.5px] rounded bg-[var(--color-input-bg)] text-[var(--color-text-muted)]">
                  {log.scriptPhase}
                </span>
              )}
            </div>
          );
        })}

        {/* Script Errors */}
        {scriptErrors.map((err, idx) => (
          <div
            key={`err-${idx}`}
            className="flex items-start gap-2 px-3 py-[3px] hover:bg-[var(--color-input-bg)] border-l-2"
            style={{ borderLeftColor: '#ef4444' }}
          >
            <span className="flex-shrink-0 pt-[1px]">
              <CloseCircleIcon size={12} style={{ color: '#ef4444' }} />
            </span>
            <span className="flex-1 break-all whitespace-pre-wrap text-[#ef4444]">
              {err}
            </span>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {testResults.length === 0 && !hasLogs && (
        <div className="flex-1 flex flex-col items-center justify-center text-[var(--color-text-muted)] gap-1">
          <span className="text-[20px] opacity-40">✓</span>
          <span className="text-[11px]">No test output</span>
          <span className="text-[10px] opacity-60">Use dk.test() and dk.expect() in post-response scripts</span>
        </div>
      )}
    </div>
  );
}
