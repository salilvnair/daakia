/**
 * DebugView — VS Code-style "Run and Debug" panel as a standalone DUI component.
 *
 * Sections: toolbar, VARIABLES (scopes + recursive tree), WATCH,
 * CALL STACK, BREAKPOINTS.
 *
 * Fully abstract — consumer provides session data + action callbacks.
 * No daakia store imports. Drop into any project.
 */
import { useState, useCallback, type ReactNode } from 'react';
import {
  DbgContinueIcon, DbgStepOverIcon, DbgStepIntoIcon,
  DbgStepOutIcon, DbgRestartIcon, DbgStopIcon,
  RunDebugIcon, MuteBreakpointsIcon, ChevronRightIcon,
} from '../../../icons';
import { CollapsibleSectionView } from './CollapsibleSectionView';
import { ModalView } from '../modal/ModalView';
import { ButtonView } from '../button/ButtonView';

// ── Public types ──────────────────────────────────────────────────────────────

export interface DebugVariable {
  name: string;
  value: unknown;
  type?: string;
}

export interface DebugCallFrame {
  fn: string;
  file?: string;
  line?: number | null;
  col?: number;
  isUser?: boolean;
}

export interface DebugBreakpoint {
  /** Consumer-defined key that groups breakpoints (e.g. "tabId:phase"). */
  key: string;
  line: number;
  disabled?: boolean;
  condition?: string;
  /** Display label shown in the breakpoints list. */
  label?: string;
  /** Optional badge rendered before the label (e.g. HTTP method chip). */
  badge?: ReactNode;
}

/** Current state of the debug session — provided by consumer. */
export interface DebugSession {
  active: boolean;
  status: 'idle' | 'running' | 'paused';
  pausedLine?: number | null;
  variables?: DebugVariable[];
  callStack?: DebugCallFrame[];
  breakpoints?: DebugBreakpoint[];
  breakpointsMuted?: boolean;
}

/** All action callbacks — consumer provides implementations. */
export interface DebugActions {
  onContinue?: () => void;
  onStepOver?: () => void;
  onStepInto?: () => void;
  onStepOut?: () => void;
  onRestart?: () => void;
  onStop?: () => void;
  onAddWatchExpression?: (expr: string) => void;
  onRemoveWatchExpression?: (expr: string) => void;
  onClearWatchExpressions?: () => void;
  onToggleBreakpoint?: (key: string, line: number, currentlyDisabled: boolean) => void;
  onRemoveBreakpoint?: (key: string, line: number) => void;
  onNavigateBreakpoint?: (key: string, line: number) => void;
  onToggleMuteBreakpoints?: () => void;
  onClearAllBreakpoints?: () => void;
  /** Called when user clicks Restart Frame in call stack. */
  onRestartFrame?: (frameIndex: number) => void;
}

export interface DebugViewProps {
  session: DebugSession;
  actions?: DebugActions;
  /** Controlled watch expressions — managed externally. */
  watchExpressions?: string[];
  accentColor?: string;
  title?: string;
  className?: string;
}

// ── DebugView (root) ──────────────────────────────────────────────────────────

export function DebugView({
  session, actions, watchExpressions = [], accentColor = 'var(--color-primary)',
  title = 'Run and Debug', className = '',
}: DebugViewProps) {
  const { active, status } = session;
  const isPaused = status === 'paused';

  return (
    <div className={`flex flex-col h-full overflow-hidden ${className}`}>
      {/* Toolbar */}
      <div className="px-3 py-2 border-b border-[var(--color-surface-border)] flex items-center gap-2 shrink-0">
        <RunDebugIcon size={14} style={{ color: accentColor }} />
        <h3 className="text-[11px] font-bold text-[var(--color-text-primary)] uppercase tracking-wide">{title}</h3>
        {active && (
          <div className="ml-auto flex items-center gap-0.5">
            <ToolBtn onClick={actions?.onContinue} disabled={!isPaused} title="Continue (F5)">
              <DbgContinueIcon size={12} />
            </ToolBtn>
            <ToolBtn onClick={actions?.onStepOver} disabled={!isPaused} title="Step Over (F10)">
              <DbgStepOverIcon size={12} />
            </ToolBtn>
            <ToolBtn onClick={actions?.onStepInto} disabled={!isPaused} title="Step Into (F11)">
              <DbgStepIntoIcon size={12} />
            </ToolBtn>
            <ToolBtn onClick={actions?.onStepOut} disabled={!isPaused} title="Step Out (⇧F11)">
              <DbgStepOutIcon size={12} />
            </ToolBtn>
            <ToolBtn onClick={actions?.onRestart} title="Restart">
              <DbgRestartIcon size={12} />
            </ToolBtn>
            <ToolBtn onClick={actions?.onStop} title="Stop">
              <DbgStopIcon size={12} />
            </ToolBtn>
          </div>
        )}
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <VariablesSection session={session} accentColor={accentColor} />
        <WatchSection session={session} watchExpressions={watchExpressions} actions={actions} accentColor={accentColor} />
        <CallStackSection session={session} actions={actions} accentColor={accentColor} />
        <BreakpointsSection session={session} actions={actions} accentColor={accentColor} />
      </div>
    </div>
  );
}

// ── Toolbar button ────────────────────────────────────────────────────────────

function ToolBtn({ children, onClick, disabled, title }: { children: ReactNode; onClick?: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="p-0.5 rounded hover:bg-[var(--color-surface-hover)] cursor-pointer disabled:opacity-40 disabled:cursor-default text-[var(--color-text-primary)]"
    >
      {children}
    </button>
  );
}

// ── VARIABLES ────────────────────────────────────────────────────────────────

function VariablesSection({ session, accentColor }: { session: DebugSession; accentColor: string }) {
  const [expanded, setExpanded] = useState(true);
  const { active, variables = [] } = session;

  const localVars = variables.filter(v => !['dk', 'console', 'require', 'module', 'exports', '__filename', '__dirname'].includes(v.name));
  const scriptGlobals = variables.filter(v => ['dk', 'console'].includes(v.name));

  return (
    <CollapsibleSectionView title="Variables" expanded={expanded} onToggle={() => setExpanded(!expanded)} accentColor={accentColor}>
      {!active ? (
        <Muted>Not debugging</Muted>
      ) : variables.length === 0 ? (
        <Muted>No variables captured</Muted>
      ) : (
        <div className="flex flex-col">
          <ScopeGroup label="Local" variables={localVars} defaultExpanded />
          {scriptGlobals.length > 0 && <ScopeGroup label="Script Globals" variables={scriptGlobals} defaultExpanded={false} />}
        </div>
      )}
    </CollapsibleSectionView>
  );
}

function ScopeGroup({ label, variables, defaultExpanded }: { label: string; variables: DebugVariable[]; defaultExpanded: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  if (variables.length === 0) return null;
  return (
    <div>
      <button type="button" onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 w-full px-3 py-0.5 hover:bg-[var(--color-surface-hover)] cursor-pointer">
        <ChevronRightIcon size={10} className="shrink-0 transition-transform text-[var(--color-text-muted)]"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }} />
        <span className="text-[11px] font-semibold" style={{ color: '#c586c0' }}>{label}</span>
      </button>
      {expanded && (
        <div className="pl-2">
          {variables.map(v => <ValueTreeNode key={v.name} name={v.name} value={v.value} depth={1} />)}
        </div>
      )}
    </div>
  );
}

// ── Recursive value tree ──────────────────────────────────────────────────────

function ValueTreeNode({ name, value, depth }: { name: string; value: unknown; depth: number }) {
  const [expanded, setExpanded] = useState(false);
  const expandable = isExpandable(value);

  return (
    <div>
      <div className="flex items-center gap-1 px-2 py-[1px] hover:bg-[var(--color-surface-hover)] text-[11px] min-h-[18px] cursor-default font-mono"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={expandable ? () => setExpanded(!expanded) : undefined}>
        {expandable
          ? <ChevronRightIcon size={10} className="shrink-0 transition-transform text-[var(--color-text-muted)] cursor-pointer"
              style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }} />
          : <span className="w-[10px] shrink-0" />
        }
        <span className="shrink-0" style={{ color: '#4fc3f7' }}>{name}</span>
        <span className="text-[var(--color-text-muted)] shrink-0 mx-0.5">=</span>
        <span className="truncate" style={{ color: valueColor(value) }}>{valuePreview(value)}</span>
      </div>
      {expanded && expandable && <ExpandedValue value={value} depth={depth + 1} />}
    </div>
  );
}

function ExpandedValue({ value, depth }: { value: unknown; depth: number }) {
  if (Array.isArray(value)) {
    return (
      <div>
        {value.map((item, idx) => <ValueTreeNode key={idx} name={String(idx)} value={item} depth={depth} />)}
        <div className="text-[11px] text-[var(--color-text-muted)] italic px-2 py-[1px]" style={{ paddingLeft: `${depth * 12 + 8}px` }}>
          length: {value.length}
        </div>
      </div>
    );
  }
  if (value && typeof value === 'object') {
    return (
      <div>
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => <ValueTreeNode key={k} name={k} value={v} depth={depth} />)}
      </div>
    );
  }
  return null;
}

// ── WATCH ─────────────────────────────────────────────────────────────────────

function WatchSection({ session, watchExpressions, actions, accentColor }: {
  session: DebugSession; watchExpressions: string[]; actions?: DebugActions; accentColor: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [showClear, setShowClear] = useState(false);

  const addExpr = useCallback(() => {
    const v = inputValue.trim();
    if (v && !watchExpressions.includes(v)) actions?.onAddWatchExpression?.(v);
    setInputValue(''); setIsAdding(false);
  }, [inputValue, watchExpressions, actions]);

  const evaluate = useCallback((expr: string): { value: unknown; found: boolean } => {
    const vars = session.variables ?? [];
    if (!session.active || vars.length === 0) return { value: undefined, found: false };
    const parts = expr.replace(/\[(\d+)\]/g, '.$1').split('.');
    const root = vars.find(v => v.name === parts[0]);
    if (!root) return { value: undefined, found: false };
    let cur: unknown = root.value;
    for (let i = 1; i < parts.length; i++) {
      if (cur == null || typeof cur !== 'object') return { value: undefined, found: false };
      cur = (cur as Record<string, unknown>)[parts[i]];
    }
    return { value: cur, found: true };
  }, [session]);

  return (
    <CollapsibleSectionView
      title="Watch" expanded={expanded} onToggle={() => setExpanded(!expanded)}
      accentColor={accentColor} badge={watchExpressions.length || undefined}
      headerRight={
        <>
          <HeaderBtn onClick={() => { setIsAdding(true); if (!expanded) setExpanded(true); }} title="Add Expression">+</HeaderBtn>
          {watchExpressions.length > 0 && (
            <HeaderBtn onClick={() => { watchExpressions.length > 1 ? setShowClear(true) : actions?.onClearWatchExpressions?.(); }} title="Remove All">×</HeaderBtn>
          )}
        </>
      }
    >
      {showClear && (
        <ModalView open onClose={() => setShowClear(false)} title="Remove all watch expressions?" size="sm"
          footerRight={
            <div style={{ display: 'flex', gap: 8 }}>
              <ButtonView variant="secondary" size="sm" onClick={() => setShowClear(false)}>Cancel</ButtonView>
              <ButtonView variant="danger" size="sm" onClick={() => { actions?.onClearWatchExpressions?.(); setShowClear(false); }}>Remove All</ButtonView>
            </div>
          }
        >
          <p style={{ fontSize: 13, color: 'var(--color-text-primary)', margin: 0 }}>
            This will remove all {watchExpressions.length} watch expressions.
          </p>
        </ModalView>
      )}
      <div className="flex flex-col py-0.5">
        {watchExpressions.map(expr => {
          const { value, found } = evaluate(expr);
          return (
            <div key={expr} className="group flex items-center gap-2 px-4 py-[3px] hover:bg-[var(--color-surface-hover)] text-[11px] min-h-[24px]">
              <span className="font-mono shrink-0" style={{ color: '#4fc3f7' }}>{expr}</span>
              <span className="text-[var(--color-text-muted)] mx-0.5">=</span>
              <span className="truncate font-mono flex-1" style={{ color: found ? valueColor(value) : 'var(--color-text-muted)' }}>
                {found ? valuePreview(value) : '<not available>'}
              </span>
              <button type="button" onClick={() => actions?.onRemoveWatchExpression?.(expr)}
                className="ml-auto opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] hover:text-[var(--color-danger)] cursor-pointer text-[13px] font-bold leading-none shrink-0"
                title="Remove">×</button>
            </div>
          );
        })}
        {isAdding && (
          <div className="px-3 py-1.5">
            <input
              type="text" value={inputValue} onChange={e => setInputValue(e.target.value)} autoFocus
              onKeyDown={e => { if (e.key === 'Enter') addExpr(); if (e.key === 'Escape') { setIsAdding(false); setInputValue(''); } }}
              onBlur={addExpr}
              placeholder="Expression to watch"
              className="w-full bg-[var(--color-input-bg)] border border-[var(--color-input-border)] rounded px-2 py-1 text-[11px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
            />
          </div>
        )}
      </div>
    </CollapsibleSectionView>
  );
}

// ── CALL STACK ────────────────────────────────────────────────────────────────

function CallStackSection({ session, actions, accentColor }: { session: DebugSession; actions?: DebugActions; accentColor: string }) {
  const [expanded, setExpanded] = useState(true);
  const { active, status, callStack = [], pausedLine } = session;
  const isPaused = status === 'paused';

  const frames = active
    ? (callStack.length > 0
        ? callStack.map((f, i) => ({ ...f, id: i }))
        : [{ id: 0, fn: '<anonymous>', file: 'script.js', line: pausedLine, col: 1, isUser: true }])
    : [];

  return (
    <CollapsibleSectionView title="Call Stack" expanded={expanded} onToggle={() => setExpanded(!expanded)} accentColor={accentColor}>
      {!active ? <Muted>Not debugging</Muted> : (
        <div className="flex flex-col font-mono text-[11px]">
          {frames.map((frame) => (
            <div key={frame.id}
              className={`group flex items-center gap-1.5 px-3 py-[3px] cursor-default hover:bg-[var(--color-surface-hover)] ${frame.id === 0 ? 'bg-[color-mix(in_srgb,#ab47bc_8%,transparent)]' : ''}`}>
              {frame.id === 0
                ? <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#ffa726' }} />
                : <span className="w-1.5 shrink-0" />
              }
              <span className={`shrink-0 ${frame.isUser ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'}`}>{frame.fn}</span>
              <span className="text-[var(--color-text-muted)] truncate flex-1 text-right">
                {frame.file}{frame.line != null && <span className="ml-1">{frame.line}:{frame.col}</span>}
              </span>
              {frame.isUser && isPaused && (
                <button type="button" onClick={() => actions?.onRestartFrame?.(frame.id)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                  title="Restart Frame">↺</button>
              )}
            </div>
          ))}
          {isPaused && (
            <div className="px-3 py-1 border-t border-[var(--color-surface-border)]">
              <span className="text-[9px] px-1.5 py-[1px] rounded font-bold uppercase tracking-wide"
                style={{ background: 'rgba(255,167,38,0.15)', color: '#ffa726' }}>Paused on breakpoint</span>
            </div>
          )}
        </div>
      )}
    </CollapsibleSectionView>
  );
}

// ── BREAKPOINTS ───────────────────────────────────────────────────────────────

function BreakpointsSection({ session, actions, accentColor }: { session: DebugSession; actions?: DebugActions; accentColor: string }) {
  const [expanded, setExpanded] = useState(true);
  const [showClear, setShowClear] = useState(false);
  const { breakpoints = [], breakpointsMuted = false } = session;

  return (
    <CollapsibleSectionView
      title="Breakpoints" expanded={expanded} onToggle={() => setExpanded(!expanded)}
      accentColor={accentColor} badge={breakpoints.length || undefined}
      headerRight={
        <>
          {breakpoints.length > 0 && (
            <HeaderBtn onClick={() => breakpoints.length > 1 ? setShowClear(true) : actions?.onClearAllBreakpoints?.()} title="Remove All Breakpoints">×</HeaderBtn>
          )}
          <button type="button" onClick={actions?.onToggleMuteBreakpoints}
            className={`w-[22px] h-[22px] mt-[3px] inline-flex items-center justify-center rounded cursor-pointer transition-colors hover:bg-[var(--color-surface-hover)] ${breakpointsMuted ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'}`}
            title={breakpointsMuted ? 'Unmute breakpoints' : 'Mute all breakpoints'}>
            <MuteBreakpointsIcon size={16} />
          </button>
        </>
      }
    >
      {showClear && (
        <ModalView open onClose={() => setShowClear(false)} title="Remove all breakpoints?" size="sm"
          footerRight={
            <div style={{ display: 'flex', gap: 8 }}>
              <ButtonView variant="secondary" size="sm" onClick={() => setShowClear(false)}>Cancel</ButtonView>
              <ButtonView variant="danger" size="sm" onClick={() => { actions?.onClearAllBreakpoints?.(); setShowClear(false); }}>Remove All</ButtonView>
            </div>
          }
        >
          <p style={{ fontSize: 13, color: 'var(--color-text-primary)', margin: 0 }}>
            This will remove all {breakpoints.length} breakpoints.
          </p>
        </ModalView>
      )}
      {breakpoints.length === 0
        ? <Muted>No breakpoints set</Muted>
        : (
          <div className="flex flex-col py-0.5">
            {breakpoints.map((bp, idx) => (
              <BreakpointRow key={`${bp.key}-${bp.line}-${idx}`} bp={bp} muted={breakpointsMuted} actions={actions} />
            ))}
          </div>
        )
      }
    </CollapsibleSectionView>
  );
}

function BreakpointRow({ bp, muted, actions }: { bp: DebugBreakpoint; muted: boolean; actions?: DebugActions }) {
  const faded = muted || !!bp.disabled;
  const dotColor = bp.condition
    ? 'var(--color-warning)'
    : (bp.disabled || muted) ? 'var(--color-text-muted)' : 'var(--color-danger)';

  return (
    <div className={`group flex items-center gap-2 px-3 py-[3px] hover:bg-[var(--color-surface-hover)] text-[11px] min-h-[24px] transition-opacity ${faded ? 'opacity-45' : ''}`}>
      <input type="checkbox" checked={!bp.disabled} onChange={() => actions?.onToggleBreakpoint?.(bp.key, bp.line, !!bp.disabled)}
        className="shrink-0 cursor-pointer accent-[var(--color-danger)]" style={{ width: 11, height: 11 }} />
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
      <span className="flex items-center gap-1 cursor-pointer hover:underline truncate flex-1"
        onClick={() => actions?.onNavigateBreakpoint?.(bp.key, bp.line)}
        title={`${bp.label ?? bp.key} — Line ${bp.line}`}>
        {bp.badge && <span className="shrink-0">{bp.badge}</span>}
        <span className="text-[var(--color-text-primary)] truncate">{bp.label ?? bp.key}</span>
        <span className="text-[var(--color-text-muted)] shrink-0">Line {bp.line}</span>
      </span>
      {bp.condition && (
        <span className="truncate text-[10px]" style={{ color: 'var(--color-warning)' }} title={bp.condition}>{bp.condition}</span>
      )}
      <button type="button" onClick={() => actions?.onRemoveBreakpoint?.(bp.key, bp.line)}
        className="shrink-0 opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] hover:text-[var(--color-danger)] cursor-pointer text-[13px] font-bold leading-none"
        title="Remove breakpoint">×</button>
    </div>
  );
}

// ── Shared micro-components ───────────────────────────────────────────────────

function Muted({ children }: { children: ReactNode }) {
  return <div className="px-4 py-2 text-[11px] text-[var(--color-text-muted)] italic">{children}</div>;
}

function HeaderBtn({ children, onClick, title }: { children: ReactNode; onClick?: () => void; title?: string }) {
  return (
    <button type="button" onClick={e => { e.stopPropagation(); onClick?.(); }}
      className="w-[22px] h-[22px] inline-flex items-center justify-center rounded cursor-pointer hover:bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-[18px] font-bold leading-none"
      title={title}>{children}</button>
  );
}

// ── Value helpers (VS Code-style colors) ──────────────────────────────────────

function isExpandable(v: unknown): boolean {
  return v !== null && typeof v === 'object';
}

function valuePreview(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return v.startsWith('<') ? v : `'${v.length > 50 ? v.slice(0, 50) + '…' : v}'`;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    const inner = v.slice(0, 5).map(i => shortPreview(i)).join(', ');
    return `(${v.length}) [${inner}${v.length > 5 ? ', …' : ''}]`;
  }
  if (typeof v === 'object') {
    const keys = Object.keys(v as Record<string, unknown>);
    const inner = keys.slice(0, 3).map(k => `${k}: ${shortPreview((v as any)[k])}`).join(', ');
    return `{${inner}${keys.length > 3 ? ', …' : ''}}`;
  }
  return String(v);
}

function shortPreview(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return `'${v.length > 15 ? v.slice(0, 15) + '…' : v}'`;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `Array(${v.length})`;
  if (typeof v === 'object') return '{…}';
  return String(v);
}

function valueColor(v: unknown): string {
  if (v === null || v === undefined) return '#808080';
  if (typeof v === 'string') return v.startsWith('<') ? '#808080' : '#ce9178';
  if (typeof v === 'number') return '#b5cea8';
  if (typeof v === 'boolean') return '#569cd6';
  if (Array.isArray(v)) return '#dcdcaa';
  if (typeof v === 'object') return '#9cdcfe';
  return '#d4d4d4';
}
