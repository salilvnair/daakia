/**
 * RunAndDebugPanel — VS Code-style "Run and Debug" sidebar panel.
 *
 * Sections: VARIABLES (with scopes + recursive tree), WATCH (live expressions),
 * CALL STACK, BREAKPOINTS (with toggle enable/disable).
 */
import { useState, useCallback } from 'react';
import { useDebugStore, type DebugVariable } from '../../../store/debug-store';
import { useTabsStore } from '../../../store/tabs-store';
import {
  ChevronRightIcon,
  DbgContinueIcon,
  DbgStepOverIcon,
  DbgStepIntoIcon,
  DbgStepOutIcon,
  DbgRestartIcon,
  DbgStopIcon,
  RunDebugIcon,
  MuteBreakpointsIcon,
  RestartFrameIcon,
} from '../../../icons/daakia-icons';
import { Checkbox } from '../controls/Checkbox';
import { ConfirmDialog } from '../modals/ConfirmDialog';
import { NetworkSection } from './DebugNetworkSection';
import { postMsg } from '../../../vscode';
import { MethodBadge } from '../display/MethodBadge';

export function RunAndDebugPanel() {
  const active = useDebugStore(s => s.active);
  const status = useDebugStore(s => s.status);
  const tabId = useDebugStore(s => s.tabId);
  const phase = useDebugStore(s => s.phase);
  const isPaused = status === 'paused';

  const send = (type: string) => {
    // When breakpoints are muted and continuing, clear breakpoints in the session so it runs to end
    const { breakpointsMuted } = useDebugStore.getState();
    if (breakpointsMuted && type === 'scriptDebug:continue') {
      postMsg({ type: 'scriptDebug:setBreakpoints', tabId, breakpoints: [] });
    }
    postMsg({ type, tabId });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--color-surface-border)] flex items-center gap-2">
        <RunDebugIcon size={14} />
        <h3 className="text-[11px] font-bold text-[var(--color-text-primary)] uppercase tracking-wide">
          Run and Debug
        </h3>
        {active && (
          <div className="ml-auto flex items-center gap-0.5">
            <button className="p-0.5 rounded hover:bg-[var(--color-surface-hover)] cursor-pointer disabled:opacity-40" onClick={() => send('scriptDebug:continue')} disabled={!isPaused} title="Continue">
              <DbgContinueIcon size={12} />
            </button>
            <button className="p-0.5 rounded hover:bg-[var(--color-surface-hover)] cursor-pointer disabled:opacity-40" onClick={() => send('scriptDebug:stepOver')} disabled={!isPaused} title="Step Over">
              <DbgStepOverIcon size={12} />
            </button>
            <button className="p-0.5 rounded hover:bg-[var(--color-surface-hover)] cursor-pointer disabled:opacity-40" onClick={() => send('scriptDebug:stepInto')} disabled={!isPaused} title="Step Into">
              <DbgStepIntoIcon size={12} />
            </button>
            <button className="p-0.5 rounded hover:bg-[var(--color-surface-hover)] cursor-pointer disabled:opacity-40" onClick={() => send('scriptDebug:stepOut')} disabled={!isPaused} title="Step Out">
              <DbgStepOutIcon size={12} />
            </button>
            <button className="p-0.5 rounded hover:bg-[var(--color-surface-hover)] cursor-pointer" onClick={() => {
              send('scriptDebug:stop');
              setTimeout(() => postMsg({ type: 'scriptDebug:start', tabId, phase, restart: true }), 100);
            }} title="Restart">
              <DbgRestartIcon size={12} />
            </button>
            <button className="p-0.5 rounded hover:bg-[var(--color-surface-hover)] cursor-pointer" onClick={() => {
              send('scriptDebug:stop');
              useDebugStore.getState().stopDebug();
            }} title="Stop">
              <DbgStopIcon size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <VariablesSection />
        <WatchSection />
        <NetworkSection CollapsibleSection={CollapsibleSection} />
        <CallStackSection />
        <BreakpointsSection />
      </div>
    </div>
  );
}

// ─── VARIABLES Section ──────────────────────────────────────────────────────

function VariablesSection() {
  const [expanded, setExpanded] = useState(true);
  const variables = useDebugStore(s => s.variables);
  const active = useDebugStore(s => s.active);

  // Group variables into scopes (Local for user vars, Script Globals for dk/console)
  const localVars = variables.filter(v => !['dk', 'console', 'require', 'module', 'exports', '__filename', '__dirname'].includes(v.name));
  const scriptGlobals = variables.filter(v => ['dk', 'console'].includes(v.name));

  return (
    <CollapsibleSection title="Variables" expanded={expanded} onToggle={() => setExpanded(!expanded)} chipColor="#4fc3f7">
      {!active ? (
        <div className="px-4 py-2 text-[11px] text-[var(--color-text-muted)] italic">Not debugging</div>
      ) : variables.length === 0 ? (
        <div className="px-4 py-2 text-[11px] text-[var(--color-text-muted)] italic">No variables captured</div>
      ) : (
        <div className="flex flex-col">
          <ScopeGroup label="Local" variables={localVars} defaultExpanded={true} />
          {scriptGlobals.length > 0 && (
            <ScopeGroup label="Script Globals" variables={scriptGlobals} defaultExpanded={false} />
          )}
        </div>
      )}
    </CollapsibleSection>
  );
}

function ScopeGroup({ label, variables, defaultExpanded }: { label: string; variables: DebugVariable[]; defaultExpanded: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (variables.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 w-full px-3 py-0.5 hover:bg-[var(--color-surface-hover)] cursor-pointer"
      >
        <ChevronRightIcon
          size={10}
          className="shrink-0 transition-transform text-[var(--color-text-muted)]"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
        />
        <span className="text-[11px] font-semibold text-[#c586c0]">{label}</span>
      </button>
      {expanded && (
        <div className="pl-2">
          {variables.map(v => (
            <ValueTreeNode key={v.name} name={v.name} value={v.value} depth={1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Recursive Value Tree Node ──────────────────────────────────────────────

function ValueTreeNode({ name, value, depth }: { name: string; value: unknown; depth: number }) {
  const [expanded, setExpanded] = useState(false);
  const isExpandable = isObjectOrArray(value);
  const preview = getValuePreview(value);
  const typeColor = getValueColor(value);

  return (
    <div>
      <div
        className="flex items-center gap-1 px-2 py-[1px] hover:bg-[var(--color-surface-hover)] text-[11px] min-h-[18px] cursor-default font-mono"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={isExpandable ? () => setExpanded(!expanded) : undefined}
      >
        {isExpandable ? (
          <ChevronRightIcon
            size={10}
            className="shrink-0 transition-transform text-[var(--color-text-muted)] cursor-pointer"
            style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
          />
        ) : (
          <span className="w-[10px] shrink-0" />
        )}
        <span className="text-[#4fc3f7] shrink-0">{name}</span>
        <span className="text-[var(--color-text-muted)] shrink-0 mx-0.5">=</span>
        <span className="truncate" style={{ color: typeColor }}>{preview}</span>
      </div>
      {expanded && isExpandable && (
        <ExpandedChildren value={value} depth={depth + 1} />
      )}
    </div>
  );
}

function ExpandedChildren({ value, depth }: { value: unknown; depth: number }) {
  if (Array.isArray(value)) {
    return (
      <div>
        {value.map((item, idx) => (
          <ValueTreeNode key={idx} name={String(idx)} value={item} depth={depth} />
        ))}
        <div
          className="text-[11px] text-[var(--color-text-muted)] italic px-2 py-[1px]"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          length: {value.length}
        </div>
      </div>
    );
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return (
      <div>
        {entries.map(([key, val]) => (
          <ValueTreeNode key={key} name={key} value={val} depth={depth} />
        ))}
      </div>
    );
  }

  return null;
}

// ─── WATCH Section ──────────────────────────────────────────────────────────

function WatchSection() {
  const [expanded, setExpanded] = useState(true);
  const [expressions, setExpressions] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const variables = useDebugStore(s => s.variables);
  const active = useDebugStore(s => s.active);

  const addExpression = useCallback(() => {
    const trimmed = inputValue.trim();
    if (trimmed && !expressions.includes(trimmed)) {
      setExpressions(prev => [...prev, trimmed]);
    }
    setInputValue('');
    setIsAdding(false);
  }, [inputValue, expressions]);

  const removeExpression = useCallback((expr: string) => {
    setExpressions(prev => prev.filter(e => e !== expr));
  }, []);

  const clearAllExpressions = useCallback(() => {
    if (expressions.length > 1) {
      setShowClearConfirm(true);
    } else {
      setExpressions([]);
    }
  }, [expressions.length]);

  const confirmClearAll = useCallback(() => {
    setExpressions([]);
    setShowClearConfirm(false);
  }, []);

  const evaluateExpression = useCallback((expr: string): { value: unknown; found: boolean } => {
    if (!active || variables.length === 0) return { value: undefined, found: false };

    // Simple path evaluation: support "a", "a.b", "a.b.c", "a[0]"
    const parts = expr.replace(/\[(\d+)\]/g, '.$1').split('.');
    const rootName = parts[0];
    const rootVar = variables.find(v => v.name === rootName);
    if (!rootVar) return { value: undefined, found: false };

    let current: unknown = rootVar.value;
    for (let i = 1; i < parts.length; i++) {
      if (current === null || current === undefined) return { value: undefined, found: false };
      if (typeof current !== 'object') return { value: undefined, found: false };
      current = (current as Record<string, unknown>)[parts[i]];
    }

    return { value: current, found: true };
  }, [active, variables]);

  return (
    <CollapsibleSection
      title="Watch"
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
      chipColor="#ffa726"
      badge={expressions.length || undefined}
      headerRight={
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setIsAdding(true); if (!expanded) setExpanded(true); }}
            className="w-[22px] h-[22px] inline-flex items-center justify-center rounded text-[#ffa726] cursor-pointer hover:bg-[var(--color-surface-hover)] hover:text-[#ffb74d]"
            title="Add Expression"
          >
            <span className="text-[18px] font-bold leading-none">+</span>
          </button>
          {expressions.length > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); clearAllExpressions(); if (!expanded) setExpanded(true); }}
              className="w-[22px] h-[22px] inline-flex items-center justify-center rounded text-[#ffa726] cursor-pointer hover:bg-[var(--color-surface-hover)] hover:text-[#ffb74d]"
              title="Remove All Expressions"
            >
              <span className="text-[18px] font-bold leading-none">x</span>
            </button>
          )}
        </>
      }
    >
      {/* Confirmation modal for clearing all watch expressions */}
      {showClearConfirm && (
        <ConfirmDialog
          title="Remove all watch expressions?"
          message={`This will remove all ${expressions.length} watch expressions.`}
          confirmLabel="Remove All"
          danger={true}
          onConfirm={confirmClearAll}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}

      <div className="flex flex-col py-0.5">
        {expressions.map(expr => {
          const { value, found } = evaluateExpression(expr);
          return (
            <div
              key={expr}
              className="group flex items-center gap-2 px-4 py-[3px] hover:bg-[var(--color-surface-hover)] text-[11px] min-h-[24px]"
            >
              {isObjectOrArray(value) ? (
                <WatchTreeItem name={expr} value={value} onRemove={() => removeExpression(expr)} />
              ) : (
                <>
                  <span className="text-[#4fc3f7] shrink-0 font-mono">{expr}</span>
                  <span className="text-[var(--color-text-muted)] mx-0.5">=</span>
                  <span className="truncate font-mono flex-1" style={{ color: found ? getValueColor(value) : 'var(--color-text-muted)' }}>
                    {found ? getValuePreview(value) : '<not available>'}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeExpression(expr)}
                    className="ml-auto opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] hover:text-[var(--color-danger)] cursor-pointer text-[13px] font-bold leading-none shrink-0"
                    title="Remove"
                  >
                    x
                  </button>
                </>
              )}
            </div>
          );
        })}

        {/* Add expression input */}
        {isAdding && (
          <div className="px-3 py-1.5">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addExpression();
                if (e.key === 'Escape') { setIsAdding(false); setInputValue(''); }
              }}
              onBlur={addExpression}
              autoFocus
              placeholder="Expression to watch"
              className="w-full bg-[var(--color-input-bg)] border border-[var(--color-input-border)] rounded px-2 py-1 text-[11px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
            />
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}

function WatchTreeItem({ name, value, onRemove }: { name: string; value: unknown; onRemove: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const preview = getValuePreview(value);

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 group w-full">
        <ChevronRightIcon
          size={10}
          className="shrink-0 transition-transform text-[var(--color-text-muted)] cursor-pointer"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
          onClick={() => setExpanded(!expanded)}
        />
        <span
          className="text-[#4fc3f7] shrink-0 cursor-pointer font-mono"
          onClick={() => setExpanded(!expanded)}
        >
          {name}
        </span>
        <span className="text-[var(--color-text-muted)] mx-0.5">=</span>
        <span className="truncate font-mono flex-1" style={{ color: getValueColor(value) }}>{preview}</span>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] hover:text-[var(--color-danger)] cursor-pointer text-[13px] font-bold leading-none"
          title="Remove"
        >
          ×
        </button>
      </div>
      {expanded && <ExpandedChildren value={value} depth={2} />}
    </div>
  );
}

// ─── CALL STACK Section ─────────────────────────────────────────────────────

function CallStackSection() {
  const [expanded, setExpanded] = useState(true);
  const active = useDebugStore(s => s.active);
  const pausedLine = useDebugStore(s => s.pausedLine);
  const phase = useDebugStore(s => s.phase);
  const tabId = useDebugStore(s => s.tabId);
  const status = useDebugStore(s => s.status);
  const storeCallStack = useDebugStore(s => s.callStack);
  const tab = useTabsStore(s => s.tabs.find(t => t.id === tabId));

  const scriptName = tab ? (tab.name || tab.url || 'untitled') : 'script';
  const fileName = phase === 'pre-request' ? 'pre-request.js' : 'post-response.js';

  const handleRestartFrame = () => {
    if (tabId) {
      postMsg({ type: 'scriptDebug:restartFrame', tabId });
    }
  };

  // Use real call stack frames from runtime, fallback to a single user frame
  const frames = active ? (
    storeCallStack.length > 0
      ? storeCallStack.map((f, i) => ({
          id: i,
          fn: f.fn,
          file: f.isUser ? `${scriptName}/${fileName}` : f.file,
          line: f.isUser ? pausedLine : f.line,
          col: f.col,
          isUser: f.isUser,
        }))
      : [{ id: 0, fn: '<anonymous>', file: `${scriptName}/${fileName}`, line: pausedLine, col: 1, isUser: true }]
  ) : [];

  return (
    <CollapsibleSection title="Call Stack" expanded={expanded} onToggle={() => setExpanded(!expanded)} chipColor="#ab47bc">
      {!active ? (
        <div className="px-4 py-2 text-[11px] text-[var(--color-text-muted)] italic">Not debugging</div>
      ) : (
        <div className="flex flex-col font-mono text-[11px]">
          {frames.map((frame) => (
            <div
              key={frame.id}
              className={`group flex items-center gap-1.5 px-3 py-[3px] cursor-default hover:bg-[var(--color-surface-hover)] ${
                frame.id === 0 ? 'bg-[color-mix(in_srgb,#ab47bc_8%,transparent)]' : ''
              }`}
            >
              {/* Yellow indicator for current frame */}
              {frame.id === 0 && <span className="w-1.5 h-1.5 rounded-full bg-[#ffa726] shrink-0" />}
              {frame.id !== 0 && <span className="w-1.5 shrink-0" />}

              {/* Function name */}
              <span className={`shrink-0 ${frame.isUser ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'}`}>
                {frame.fn}
              </span>

              {/* File path + line */}
              <span className="text-[var(--color-text-muted)] truncate flex-1 text-right">
                {frame.file}
                {frame.line && <span className="ml-1">{frame.line}:{frame.col}</span>}
              </span>

              {/* Restart Frame icon on hover — only for user frames (frame 0) */}
              {frame.isUser && status === 'paused' && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleRestartFrame(); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                  title="Restart Frame"
                >
                  <RestartFrameIcon size={14} />
                </button>
              )}
            </div>
          ))}

          {/* Paused badge */}
          {status === 'paused' && (
            <div className="px-3 py-1 border-t border-[var(--color-surface-border)]">
              <span className="text-[9px] px-1.5 py-[1px] rounded bg-[rgba(255,167,38,0.15)] text-[#ffa726] font-bold uppercase tracking-wide">
                Paused on breakpoint
              </span>
            </div>
          )}
        </div>
      )}
    </CollapsibleSection>
  );
}

// ─── BREAKPOINTS Section ────────────────────────────────────────────────────

function BreakpointsSection() {
  const [expanded, setExpanded] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const breakpoints = useDebugStore(s => s.breakpoints);
  const disabledBreakpoints = useDebugStore(s => s.disabledBreakpoints);
  const conditions = useDebugStore(s => s.conditions);
  const breakpointsMuted = useDebugStore(s => s.breakpointsMuted);
  const toggleMute = useDebugStore(s => s.toggleMuteBreakpoints);

  const allEntries: { key: string; line: number; disabled: boolean; condition?: string }[] = [];
  for (const [key, lines] of Object.entries(breakpoints)) {
    const disabled = disabledBreakpoints[key] || [];
    const conds = conditions[key] || {};
    for (const line of lines) {
      allEntries.push({
        key,
        line,
        disabled: disabled.includes(line),
        condition: conds[line],
      });
    }
  }

  const handleRemoveAll = () => {
    if (allEntries.length > 1) {
      setShowClearConfirm(true);
    } else {
      useDebugStore.getState().clearAllBreakpoints();
    }
  };

  const confirmRemoveAll = () => {
    useDebugStore.getState().clearAllBreakpoints();
    setShowClearConfirm(false);
  };

  return (
    <CollapsibleSection
      title="Breakpoints"
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
      badge={allEntries.length || undefined}
      chipColor="#ef5350"
      headerRight={
        <>
          {allEntries.length > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleRemoveAll(); if (!expanded) setExpanded(true); }}
              className="w-[22px] h-[22px] inline-flex items-center justify-center rounded text-[#ef5350] cursor-pointer hover:bg-[var(--color-surface-hover)] hover:text-[#e53935]"
              title="Remove All Breakpoints"
            >
              <span className="text-[18px] font-bold leading-none">x</span>
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggleMute(); if (!expanded) setExpanded(true); }}
            className={`w-[22px] h-[22px] mt-[3px] inline-flex items-center justify-center rounded cursor-pointer transition-colors ${breakpointsMuted ? 'text-[#ef4444]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'} hover:bg-[var(--color-surface-hover)]`}
            title={breakpointsMuted ? 'Unmute all breakpoints' : 'Mute all breakpoints'}
          >
            <MuteBreakpointsIcon size={16} />
          </button>
        </>
      }
    >
      {/* Confirmation modal for clearing all breakpoints */}
      {showClearConfirm && (
        <ConfirmDialog
          title="Remove all breakpoints?"
          message={`This will remove all ${allEntries.length} breakpoints.`}
          confirmLabel="Remove All"
          danger={true}
          onConfirm={confirmRemoveAll}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}

      {allEntries.length === 0 ? (
        <div className="px-4 py-2 text-[11px] text-[var(--color-text-muted)] italic">No breakpoints set</div>
      ) : (
        <div className="flex flex-col py-0.5">
          {allEntries.map((bp, idx) => (
            <BreakpointRow key={`${bp.key}-${bp.line}-${idx}`} entry={bp} />
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}

function BreakpointRow({ entry }: { entry: { key: string; line: number; disabled: boolean; condition?: string } }) {
  const [tabId, phase] = entry.key.split(':');
  const tab = useTabsStore(s => s.tabs.find(t => t.id === tabId));
  const tabName = tab?.name || tab?.url || 'Untitled';
  const method = tab?.method || 'GET';
  const breakpointsMuted = useDebugStore(s => s.breakpointsMuted);

  const handleToggle = () => {
    useDebugStore.getState().toggleDisableBreakpoint(tabId, phase, entry.line);
  };

  const handleRemove = () => {
    useDebugStore.getState().removeBreakpoint(tabId, phase, entry.line);
  };

  const handleClick = () => {
    const store = useTabsStore.getState();
    if (store.activeTabId !== tabId) {
      store.setActiveTab(tabId);
    }
    // Navigate editor to the breakpoint line
    useDebugStore.getState().setNavigateLine(entry.line);
  };

  const isFaded = breakpointsMuted || entry.disabled;

  return (
    <div className={`group flex items-center gap-2 px-3 py-[3px] hover:bg-[var(--color-surface-hover)] text-[11px] min-h-[24px] transition-opacity ${isFaded ? 'opacity-45' : ''}`}>
      {/* Checkbox to toggle enable/disable */}
      <div className="shrink-0 scale-[0.65] origin-left">
        <Checkbox checked={!entry.disabled} onChange={handleToggle} />
      </div>
      {/* Colored dot indicator */}
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{
          backgroundColor: entry.condition
            ? 'var(--color-warning)'
            : (entry.disabled || breakpointsMuted)
              ? 'var(--color-text-muted)'
              : 'var(--color-danger)',
        }}
      />
      <span
        className="flex items-center gap-1 cursor-pointer hover:underline truncate flex-1"
        onClick={handleClick}
        title={`${tabName} — ${phase} Line ${entry.line}`}
      >
        <MethodBadge method={method} compact />
        <span className="text-[var(--color-text-primary)] truncate">{tabName}</span>
        <span className="text-[var(--color-text-muted)] shrink-0">Line {entry.line}</span>
      </span>
      {entry.condition && (
        <span className="text-[var(--color-warning)] truncate text-[10px]" title={entry.condition}>
          {entry.condition}
        </span>
      )}
      {/* Remove button */}
      <button
        type="button"
        onClick={handleRemove}
        className="shrink-0 opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] hover:text-[var(--color-danger)] cursor-pointer text-[13px] font-bold leading-none"
        title="Remove breakpoint"
      >
        ×
      </button>
    </div>
  );
}

// ─── Shared CollapsibleSection ──────────────────────────────────────────────

function CollapsibleSection({
  title,
  expanded,
  onToggle,
  badge,
  chipColor,
  headerRight,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  badge?: number;
  chipColor?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-[var(--color-surface-border)]">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1.5 w-full px-2 py-1.5 hover:bg-[var(--color-surface-hover)] cursor-pointer"
      >
        <ChevronRightIcon
          size={12}
          className="shrink-0 transition-transform text-[var(--color-text-muted)]"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
        />
        <span
          className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-[1px] rounded"
          style={{
            color: chipColor || 'var(--color-text-primary)',
            backgroundColor: chipColor ? `color-mix(in srgb, ${chipColor} 12%, transparent)` : undefined,
          }}
        >
          {title}
        </span>
        {/* Badge near label */}
        {badge !== undefined && badge > 0 && (
          <span
            className="text-[9px] font-bold rounded-full px-1.5 min-w-[16px] h-4 inline-flex items-center justify-center"
            style={{
              backgroundColor: chipColor ? `color-mix(in srgb, ${chipColor} 20%, transparent)` : 'var(--color-accent)',
              color: chipColor || 'white',
            }}
          >
            {badge}
          </span>
        )}
        {/* Actions pushed to the right */}
        {headerRight && (
          <span className="ml-auto inline-flex items-center gap-2.5">
            {headerRight}
          </span>
        )}
      </button>
      {expanded && children}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isObjectOrArray(v: unknown): boolean {
  return v !== null && typeof v === 'object';
}

function getValuePreview(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') {
    if (v.startsWith('<') && v.endsWith('>')) return v; // <Function: x>, <Promise>, etc.
    return `'${v.length > 50 ? v.slice(0, 50) + '…' : v}'`;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    const inner = v.slice(0, 5).map(i => getShortPreview(i)).join(', ');
    const suffix = v.length > 5 ? ', …' : '';
    return `(${v.length}) [${inner}${suffix}]`;
  }
  if (typeof v === 'object') {
    const keys = Object.keys(v as Record<string, unknown>);
    const inner = keys.slice(0, 3).map(k => `${k}: ${getShortPreview((v as any)[k])}`).join(', ');
    const suffix = keys.length > 3 ? ', …' : '';
    return `{${inner}${suffix}}`;
  }
  return String(v);
}

function getShortPreview(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return `'${v.length > 15 ? v.slice(0, 15) + '…' : v}'`;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `Array(${v.length})`;
  if (typeof v === 'object') return '{…}';
  return String(v);
}

function getValueColor(v: unknown): string {
  if (v === null || v === undefined) return '#808080';
  if (typeof v === 'string') {
    if (v.startsWith('<')) return '#808080'; // special labels like <Function>
    return '#ce9178'; // VS Code string color (warm orange/brown)
  }
  if (typeof v === 'number') return '#b5cea8'; // VS Code number color (light green)
  if (typeof v === 'boolean') return '#569cd6'; // VS Code keyword color (blue)
  if (Array.isArray(v)) return '#dcdcaa'; // VS Code type color (yellow)
  if (typeof v === 'object') return '#9cdcfe'; // VS Code variable color (cyan)
  return '#d4d4d4';
}
