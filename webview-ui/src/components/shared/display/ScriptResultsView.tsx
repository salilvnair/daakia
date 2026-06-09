import { useState } from 'react';
import type { ResponseData } from '../../../store/tabs-store';
import { CheckIcon, CloseCircleIcon, ChevronDownIcon } from '../../../icons';
import { LEVEL_CONFIG, formatTimestamp, LogMessage, LevelIcon } from '../devtools/log-utils';

// ─── Error parsing ────────────────────────────────────────────────────────────

interface ParsedError {
  type: string;
  message: string;
  hint?: string;
}

// All matchers actually implemented in test-provider.ts
const DK_MATCHERS = [
  'toBe', 'toEqual', 'toContain', 'toMatch', 'toBeTruthy', 'toBeFalsy',
  'toBeGreaterThan', 'toBeLessThan', 'toHaveLength', 'toHaveProperty',
  'toHaveStatus', 'toMatchSchema',
];

function getHint(error: string): string | undefined {
  // toHaveLength — now supported; if it still fails it means value has no .length
  if (error.includes('toHaveLength') && error.includes('not a function'))
    return 'dk.expect(value).toHaveLength(n) is supported. Make sure you are passing an array or string — not an object.';
  if (error.includes('have a .length property'))
    return 'The value passed to toHaveLength does not have a .length property. Make sure you are passing an array or string, not an object or undefined.';
  if (error.includes('toMatch') && error.includes('not a function'))
    return 'dk.expect(value).toMatch(pattern) is supported. Make sure the value is a string.';
  if (error.includes('toEqual') && error.includes('not a function'))
    return 'Use dk.expect(JSON.stringify(actual)).toBe(JSON.stringify(expected)) for deep equality, or toBe() for primitives.';
  if (error.includes('toBeUndefined') && error.includes('not a function'))
    return 'Use dk.expect(value).toBe(undefined) instead of toBeUndefined().';
  if (error.includes('toBeNull') && error.includes('not a function'))
    return 'Use dk.expect(value).toBe(null) instead of toBeNull().';
  if (error.includes('not a function')) {
    const matcherMatch = error.match(/\.(\w+)\s+is not a function/);
    const matcher = matcherMatch?.[1];
    if (matcher && !DK_MATCHERS.includes(matcher)) {
      return `"${matcher}" is not a supported dk matcher. Supported: ${DK_MATCHERS.join(', ')}.`;
    }
    return 'This matcher is not in the dk API. Check the Post-Response Script tab for the correct method name.';
  }
  if (error.includes('Expected length'))
    return 'The array or string length did not match. Check the actual response data — the count may differ from what you expected.';
  if (error.includes('is not defined') || error.includes('ReferenceError'))
    return 'A variable or function is referenced before it\'s defined. Check your script for typos.';
  if (error.includes('Cannot read') || error.includes('null') || error.includes('undefined'))
    return 'A value you tried to access is null or undefined. The response may not have the expected structure.';
  if (error.includes('SyntaxError'))
    return 'There is a syntax error in your test script. Check the Post-Response Script tab.';
  return undefined;
}

function parseError(raw: string): ParsedError {
  // "TypeError: dk.expect(...).toHaveLength is not a function"
  const typed = raw.match(/^([A-Z]\w*Error):\s*([\s\S]*)/);
  if (typed) {
    return { type: typed[1], message: typed[2].trim(), hint: getHint(raw) };
  }
  // "AssertionError: Expected 5, received 3"
  if (raw.toLowerCase().includes('expected') || raw.toLowerCase().includes('received')) {
    return { type: 'AssertionError', message: raw, hint: getHint(raw) };
  }
  return { type: 'Error', message: raw, hint: getHint(raw) };
}

// ─── Error type badge ─────────────────────────────────────────────────────────

const ERROR_TYPE_COLORS: Record<string, string> = {
  TypeError:       '#f97316',
  AssertionError:  '#ef4444',
  ReferenceError:  '#a855f7',
  SyntaxError:     '#eab308',
  RangeError:      '#ec4899',
  Error:           '#ef4444',
};

function ErrorTypeBadge({ type }: { type: string }) {
  const color = ERROR_TYPE_COLORS[type] ?? '#ef4444';
  return (
    <span
      className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-[2px] rounded shrink-0"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 25%, transparent)` }}
    >
      {type}
    </span>
  );
}

// ─── Single test row ─────────────────────────────────────────────────────────

function TestRow({ test, index }: { test: { name: string; passed: boolean; error?: string }; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const parsed = test.error ? parseError(test.error) : null;
  const accentColor = test.passed ? 'var(--color-success)' : '#ef4444';

  return (
    <div
      className="border-b last:border-b-0"
      style={{ borderColor: 'var(--color-surface-border)' }}
    >
      {/* ── Row header — always visible, clickable ── */}
      <div
        onClick={() => !test.passed && setExpanded(v => !v)}
        className="flex items-center gap-2.5 px-3 py-2.5 group transition-colors"
        style={{
          cursor: test.passed ? 'default' : 'pointer',
          backgroundColor: expanded ? `color-mix(in srgb, ${accentColor} 4%, var(--color-surface))` : undefined,
        }}
        onMouseEnter={e => { if (!test.passed) (e.currentTarget as HTMLElement).style.backgroundColor = `color-mix(in srgb, ${accentColor} 5%, var(--color-surface))`; }}
        onMouseLeave={e => { if (!expanded) (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
      >
        {/* Status icon */}
        <span className="flex-shrink-0">
          {test.passed
            ? <CheckIcon size={14} style={{ color: 'var(--color-success)' }} />
            : <CloseCircleIcon size={14} style={{ color: '#ef4444' }} />
          }
        </span>

        {/* Index */}
        <span
          className="text-[9.5px] font-mono font-bold px-1.5 py-[2px] rounded shrink-0 tabular-nums"
          style={{ color: accentColor, backgroundColor: `color-mix(in srgb, ${accentColor} 10%, transparent)` }}
        >
          #{index + 1}
        </span>

        {/* Test name */}
        <span
          className="flex-1 text-[11.5px] font-medium leading-snug"
          style={{ color: test.passed ? 'var(--color-text-primary)' : '#ef4444' }}
        >
          {test.name}
        </span>

        {/* Error type badge + chevron — only for failed */}
        {!test.passed && parsed && (
          <div className="flex items-center gap-1.5 shrink-0">
            <ErrorTypeBadge type={parsed.type} />
            <ChevronDownIcon
              size={12}
              style={{
                color: 'var(--color-text-muted)',
                transform: expanded ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.18s',
              }}
            />
          </div>
        )}

        {/* Green check label for passed */}
        {test.passed && (
          <span className="text-[10px] shrink-0" style={{ color: 'var(--color-success)' }}>passed</span>
        )}
      </div>

      {/* ── Expanded detail panel ── */}
      {expanded && !test.passed && parsed && (
        <div
          className="px-4 pb-4 pt-1 flex flex-col gap-3"
          style={{ backgroundColor: `color-mix(in srgb, #ef4444 4%, var(--color-surface))` }}
        >
          {/* Error header with type */}
          <div className="flex items-center gap-2">
            <ErrorTypeBadge type={parsed.type} />
            <span className="text-[10.5px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
              {parsed.type}
            </span>
          </div>

          {/* Full error message */}
          <div
            className="rounded-lg border px-3 py-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all"
            style={{
              color: '#fca5a5',
              backgroundColor: 'rgba(239,68,68,0.06)',
              borderColor: 'rgba(239,68,68,0.2)',
            }}
          >
            {parsed.message}
          </div>

          {/* Hint */}
          {parsed.hint && (
            <div
              className="flex gap-2.5 rounded-lg border px-3 py-2.5 text-[11px] leading-relaxed"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--color-warning) 6%, var(--color-surface))',
                borderColor: 'color-mix(in srgb, var(--color-warning) 22%, transparent)',
                color: 'var(--color-warning)',
              }}
            >
              <span className="text-[13px] leading-tight flex-shrink-0">💡</span>
              <span>{parsed.hint}</span>
            </div>
          )}

          {/* What to do section */}
          <div
            className="rounded-lg border px-3 py-2.5 flex flex-col gap-1.5 text-[10.5px]"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-info) 5%, var(--color-surface))',
              borderColor: 'color-mix(in srgb, var(--color-info) 18%, transparent)',
            }}
          >
            <span className="font-semibold" style={{ color: 'var(--color-info)' }}>What to do</span>
            <ul className="flex flex-col gap-1 list-none" style={{ color: 'var(--color-text-secondary)' }}>
              <li>• Open the <strong>Post-Response Script</strong> tab and review your test code</li>
              <li>• Check the <strong>Assertions</strong> button to regenerate or edit assertions</li>
              {parsed.type === 'TypeError' && (
                <li>• Verify the <strong>dk API</strong>: supported matchers are <code className="font-mono text-[10px] px-1 rounded" style={{ backgroundColor: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>toBe, toContain, toMatch, toBeGreaterThan, toBeLessThan, toBeTruthy, toBeFalsy, toHaveProperty</code></li>
              )}
              {parsed.type === 'ReferenceError' && (
                <li>• Check for <strong>typos</strong> in variable or function names</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function PassRateBar({ passed, total }: { passed: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((passed / total) * 100);
  const allPass = passed === total;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-[4px] rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-border)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            backgroundColor: allPass ? 'var(--color-success)' : pct === 0 ? '#ef4444' : '#f59e0b',
          }}
        />
      </div>
      <span
        className="text-[10px] font-bold tabular-nums shrink-0"
        style={{ color: allPass ? 'var(--color-success)' : pct === 0 ? '#ef4444' : '#f59e0b' }}
      >
        {pct}%
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ScriptResultsView({ response }: { response: ResponseData }) {
  const { scriptErrors = [], testResults = [], consoleLogs = [] } = response;
  const passed = testResults.filter(t => t.passed).length;
  const failed = testResults.filter(t => !t.passed).length;
  const total = testResults.length;
  const hasLogs = consoleLogs.length > 0 || scriptErrors.length > 0;
  const allPass = total > 0 && failed === 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto [scrollbar-gutter:stable] text-[11px]">

      {/* ── Summary header ── */}
      {total > 0 && (
        <div
          className="px-4 py-3 border-b flex-shrink-0 flex flex-col gap-2"
          style={{
            borderColor: 'var(--color-surface-border)',
            backgroundColor: allPass
              ? 'color-mix(in srgb, var(--color-success) 5%, var(--color-surface))'
              : 'color-mix(in srgb, #ef4444 5%, var(--color-surface))',
          }}
        >
          {/* Counts row */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[12px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Tests
            </span>

            {/* Passed */}
            <div className="flex items-center gap-1.5">
              <CheckIcon size={13} style={{ color: 'var(--color-success)' }} />
              <span className="font-semibold" style={{ color: 'var(--color-success)' }}>{passed}</span>
              <span style={{ color: 'var(--color-text-muted)' }}>passed</span>
            </div>

            {/* Failed */}
            {failed > 0 && (
              <div className="flex items-center gap-1.5">
                <CloseCircleIcon size={13} style={{ color: '#ef4444' }} />
                <span className="font-semibold" style={{ color: '#ef4444' }}>{failed}</span>
                <span style={{ color: 'var(--color-text-muted)' }}>failed</span>
              </div>
            )}

            {/* Total */}
            <span className="ml-auto text-[10.5px] tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
              {total} total
            </span>
          </div>

          {/* Progress bar */}
          <PassRateBar passed={passed} total={total} />

          {/* All-pass celebration */}
          {allPass && (
            <div className="text-[10.5px] font-medium flex items-center gap-1.5" style={{ color: 'var(--color-success)' }}>
              <span>🎉</span>
              All tests passed
            </div>
          )}
        </div>
      )}

      {/* ── Test rows — click failed ones to expand ── */}
      {total > 0 && (
        <div className="flex flex-col">
          {testResults.map((test, idx) => (
            <TestRow key={idx} test={test} index={idx} />
          ))}
        </div>
      )}

      {/* ── Console logs — rendered identically to DevTools Console ── */}
      {consoleLogs.length > 0 && (
        <div
          className="border-t py-1"
          style={{ borderColor: 'var(--color-surface-border)' }}
        >
          {consoleLogs.map((log, idx) => {
            const level = (log.level || 'log') as keyof typeof LEVEL_CONFIG;
            const config = LEVEL_CONFIG[level] || LEVEL_CONFIG.log;
            return (
              <div
                key={`clog-${idx}`}
                className="flex items-start gap-2 px-3 py-[3px] hover:bg-[var(--color-input-bg)] border-l-2"
                style={{ borderLeftColor: config.color }}
              >
                <span className="flex-shrink-0 text-[10px] text-[var(--color-text-muted)] pt-[1px] tabular-nums">
                  {formatTimestamp(log.timestamp)}
                </span>
                <span className="flex-shrink-0 pt-[1px]">
                  <LevelIcon level={level} />
                </span>
                <LogMessage args={Array.isArray(log.args) ? log.args : [log.args]} />
                {log.scriptPhase && (
                  <span className="flex-shrink-0 text-[9px] px-1 py-[0.5px] rounded bg-[var(--color-input-bg)] text-[var(--color-text-muted)]">
                    {log.scriptPhase}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Script errors (syntax/runtime outside dk.test) ── */}
      {scriptErrors.length > 0 && (
        <div
          className="border-t py-1"
          style={{ borderColor: 'var(--color-surface-border)' }}
        >
          {scriptErrors.map((err, idx) => (
            <div
              key={`err-${idx}`}
              className="flex items-start gap-2 px-3 py-[3px] hover:bg-[var(--color-input-bg)] border-l-2"
              style={{ borderLeftColor: '#ef4444' }}
            >
              <span className="flex-shrink-0 pt-[1px]">
                <CloseCircleIcon size={12} style={{ color: '#ef4444' }} />
              </span>
              <span className="flex-1 break-all whitespace-pre-wrap text-[#ef4444]">{err}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Empty state ── */}
      {total === 0 && !hasLogs && (
        <div className="flex-1 flex flex-col items-center justify-center text-[var(--color-text-muted)] gap-3 py-10">
          <span className="text-[28px] opacity-30">✓</span>
          <div className="flex flex-col items-center gap-1 text-center">
            <span className="text-[12px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>No test output</span>
            <span className="text-[10.5px] opacity-60 max-w-[260px] leading-relaxed">
              Write test assertions in the <strong>Post-Response Script</strong> tab using{' '}
              <code className="font-mono px-1 rounded" style={{ backgroundColor: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>
                dk.test()
              </code>{' '}
              and{' '}
              <code className="font-mono px-1 rounded" style={{ backgroundColor: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>
                dk.expect()
              </code>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
