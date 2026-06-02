/**
 * ScriptErrorCard — Inline error card shown in the response pane when a script fails.
 * Shows error source (phase), error message, and collapsible stack trace.
 * Dismissable per-card.
 */
import { useState } from 'react';
import { CloseIcon, ChevronDownIcon } from '../../../icons';

export interface ScriptError {
  message: string;
  /** Which phase: pre-request, post-response, collection-pre, collection-post, folder-pre, folder-post */
  source?: string;
}

interface ScriptErrorCardProps {
  error: ScriptError;
  onDismiss: () => void;
}

function parseErrorParts(message: string): { mainError: string; stackTrace?: string } {
  // Try to split on common stack trace patterns
  const stackIdx = message.indexOf('\n    at ');
  if (stackIdx > -1) {
    return { mainError: message.slice(0, stackIdx), stackTrace: message.slice(stackIdx + 1) };
  }
  return { mainError: message };
}

function getSourceLabel(source?: string): string {
  switch (source) {
    case 'pre-request': return 'Pre-request Script';
    case 'post-response': return 'Post-response Script';
    case 'collection-pre': return 'Collection Pre-request';
    case 'collection-post': return 'Collection Post-response';
    case 'folder-pre': return 'Folder Pre-request';
    case 'folder-post': return 'Folder Post-response';
    default: return 'Script';
  }
}

export function ScriptErrorCard({ error, onDismiss }: ScriptErrorCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { mainError, stackTrace } = parseErrorParts(error.message);

  return (
    <div className="bg-[rgba(239,68,68,0.06)] border border-[rgba(239,68,68,0.25)] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Error icon */}
        <span className="flex-shrink-0 w-[18px] h-[18px] rounded-full bg-[rgba(239,68,68,0.15)] flex items-center justify-center">
          <span className="text-[11px] text-[#ef4444] font-bold">!</span>
        </span>

        {/* Source badge */}
        <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-[rgba(239,68,68,0.12)] text-[#ef4444] font-medium">
          {getSourceLabel(error.source)}
        </span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Expand toggle (if has stack trace) */}
        {stackTrace && (
          <button
            className="flex items-center gap-0.5 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors"
            onClick={() => setExpanded(!expanded)}
          >
            <span>Stack</span>
            <ChevronDownIcon size={11} style={{ transform: expanded ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
          </button>
        )}

        {/* Dismiss */}
        <button
          className="flex items-center justify-center w-[18px] h-[18px] rounded text-[var(--color-text-muted)] hover:text-[#ef4444] hover:bg-[rgba(239,68,68,0.1)] cursor-pointer transition-colors"
          onClick={onDismiss}
          title="Dismiss"
        >
          <CloseIcon size={11} />
        </button>
      </div>

      {/* Error message */}
      <div className="px-3 pb-2">
        <p className="text-[12px] text-[#ef4444] font-mono whitespace-pre-wrap break-all leading-relaxed">
          {mainError}
        </p>
      </div>

      {/* Collapsible stack trace */}
      {stackTrace && expanded && (
        <div className="px-3 pb-2 border-t border-[rgba(239,68,68,0.12)]">
          <pre className="text-[10px] text-[var(--color-text-muted)] font-mono whitespace-pre-wrap break-all mt-2 leading-relaxed opacity-80">
            {stackTrace}
          </pre>
        </div>
      )}
    </div>
  );
}

interface ScriptErrorCardsProps {
  errors: string[];
  /** Source phase for all errors in this group */
  source?: string;
}

/**
 * Renders a list of dismissable script error cards.
 */
export function ScriptErrorCards({ errors, source }: ScriptErrorCardsProps) {
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  const visibleErrors = errors
    .map((msg, idx) => ({ msg, idx }))
    .filter(({ idx }) => !dismissed.has(idx));

  if (visibleErrors.length === 0) return null;

  return (
    <div className="space-y-2">
      {visibleErrors.map(({ msg, idx }) => (
        <ScriptErrorCard
          key={idx}
          error={{ message: msg, source }}
          onDismiss={() => setDismissed(prev => new Set(prev).add(idx))}
        />
      ))}
    </div>
  );
}
