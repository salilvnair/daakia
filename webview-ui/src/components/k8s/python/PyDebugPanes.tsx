/**
 * Run and Debug, for pdb: Variables, Watch, Call Stack, Breakpoints.
 *
 * The same four sections, in the same order and the same accents, as the
 * request-script debugger's panel (shared/debugger/RunAndDebugPanel) — a
 * reader who has used one has used the other. That panel reads the script
 * debugger's store and names its breakpoints after request tabs, so the
 * sections are rebuilt here over the pdb store rather than bent to fit.
 *
 * Values arrive as Python reprs, typed by the interpreter. They are coloured
 * by that type rather than parsed back into JavaScript values: a repr is what
 * `p` would have printed, and that is the honest thing to show.
 */
import { useState } from 'react';
import {
  CollapsibleSectionView, CheckboxView, IconButtonView, TextInputView, IconSize,
} from '@salilvnair/dui';
import {
  ChevronRightIcon, DbgContinueIcon, DbgStepOverIcon, DbgStepIntoIcon, DbgStepOutIcon,
  DbgRestartIcon, DbgStopIcon, RunDebugIcon, PlusIcon, CloseIcon,
} from '../../../icons';
import { usePyStore, type PyVar } from '../../../store/dk8s-python-store';

/** Colour by Python type, through the debugger's own theme tokens. */
function valueColor(type: string): string {
  switch (type) {
    case 'str': case 'bytes': return 'var(--color-debug-string)';
    case 'int': case 'float': case 'complex': case 'Decimal': return 'var(--color-debug-number)';
    case 'bool': return 'var(--color-debug-boolean)';
    case 'NoneType': return 'var(--color-debug-null)';
    case 'function': case 'method': case 'builtin_function_or_method': return 'var(--color-debug-fn)';
    default: return 'var(--color-debug-object)';
  }
}

/** `dict(4)` for a container, the repr for anything else — as the plan's pane reads. */
function summary(v: { type: string; value: string; size?: number }): string {
  return v.size !== undefined && v.size >= 0 && v.type !== 'str' ? `${v.type}(${v.size})` : v.value;
}

export function DebugToolbar({ compact }: { compact?: boolean }) {
  const debug = usePyStore(s => s.debug);
  const cmd = usePyStore(s => s.debugCmd);
  const stop = usePyStore(s => s.stopDebug);
  const live = !!debug && !debug.ended;
  const paused = live && debug.state.status === 'paused';
  const size = compact ? 'xs' : 'sm';
  return (
    <div className="flex items-center gap-0.5">
      <IconButtonView size={size} icon={<DbgContinueIcon size={IconSize.action} />} tooltip="Continue (c)"
                      aria-label="Continue" disabled={!paused} onClick={() => cmd('continue')} />
      <IconButtonView size={size} icon={<DbgStepOverIcon size={IconSize.action} />} tooltip="Step over (n)"
                      aria-label="Step over" disabled={!paused} onClick={() => cmd('next')} />
      <IconButtonView size={size} icon={<DbgStepIntoIcon size={IconSize.action} />} tooltip="Step into (s)"
                      aria-label="Step into" disabled={!paused} onClick={() => cmd('step')} />
      <IconButtonView size={size} icon={<DbgStepOutIcon size={IconSize.action} />} tooltip="Step out (r)"
                      aria-label="Step out" disabled={!paused} onClick={() => cmd('return')} />
      <IconButtonView size={size} icon={<DbgRestartIcon size={IconSize.action} />} tooltip="Restart"
                      aria-label="Restart" disabled={!paused} onClick={() => cmd('restart')} />
      <IconButtonView size={size} icon={<DbgStopIcon size={IconSize.action} />} tooltip="Stop — ends pdb and removes the copy"
                      aria-label="Stop" disabled={!live} color="var(--color-error)" onClick={stop} />
    </div>
  );
}

export function PyDebugPanes({ scriptId, scriptName }: { scriptId?: string; scriptName: string }) {
  const debug = usePyStore(s => s.debug);
  const live = !!debug && !debug.ended;
  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 py-2"
           style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <RunDebugIcon size={IconSize.action} />
        <span className="text-[10.5px] font-bold tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
          RUN AND DEBUG
        </span>
        <span className="flex-1" />
        <DebugToolbar compact />
      </div>
      {!live && (
        <div className="px-3 py-2.5 text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
          {debug?.ended
            ? `Session ended: ${debug.ended}`
            : <>Not debugging. Press <b>Debug</b> to run under <code>pdb</code> in the pod.</>}
        </div>
      )}
      <VariablesSection />
      <WatchSection />
      <CallStackSection />
      <BreakpointsSection scriptId={scriptId} scriptName={scriptName} />
    </div>
  );
}

function VariablesSection() {
  const [open, setOpen] = useState(true);
  const debug = usePyStore(s => s.debug);
  const paused = !!debug && !debug.ended && debug.state.status === 'paused';
  const locals = debug?.state.locals ?? [];
  const globals = debug?.state.globals ?? [];
  return (
    <CollapsibleSectionView title="Variables" expanded={open} onToggle={() => setOpen(!open)}
                            accentColor="var(--color-debug-key)">
      {!paused ? (
        <Muted>{debug && !debug.ended ? 'Running…' : 'Not debugging'}</Muted>
      ) : locals.length + globals.length === 0 ? (
        <Muted>No variables in this frame</Muted>
      ) : (
        <div className="flex flex-col pb-1">
          <Scope label="Locals" vars={locals} initiallyOpen />
          {globals.length > 0 && <Scope label="Globals" vars={globals} initiallyOpen={locals.length === 0} />}
        </div>
      )}
    </CollapsibleSectionView>
  );
}

function Scope({ label, vars, initiallyOpen }: { label: string; vars: PyVar[]; initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <div>
      <Row depth={0} onToggle={() => setOpen(!open)} open={open} expandable>
        <span className="text-[11px] font-semibold" style={{ color: 'var(--color-debug-scope)' }}>{label}</span>
      </Row>
      {open && vars.map(v => <VarRow key={v.name} v={v} depth={1} />)}
    </div>
  );
}

function VarRow({ v, depth }: { v: PyVar; depth: number }) {
  const [open, setOpen] = useState(false);
  const kids = v.children ?? [];
  return (
    <div>
      <Row depth={depth} expandable={kids.length > 0} open={open} onToggle={() => setOpen(!open)} title={v.value}>
        <span className="font-mono shrink-0" style={{ color: 'var(--color-debug-key)' }}>{v.name}</span>
        <span className="shrink-0" style={{ color: 'var(--color-text-muted)' }}>:</span>
        <span className="font-mono truncate" style={{ color: valueColor(v.type) }}>{summary(v)}</span>
      </Row>
      {open && kids.map(k => (
        <Row key={k.name} depth={depth + 1} title={k.value}>
          <span className="font-mono shrink-0" style={{ color: 'var(--color-debug-key)' }}>{k.name}</span>
          <span className="shrink-0" style={{ color: 'var(--color-text-muted)' }}>:</span>
          <span className="font-mono truncate" style={{ color: valueColor(k.type) }}>{k.value}</span>
        </Row>
      ))}
    </div>
  );
}

/**
 * One line of a tree. The caret is a toggle only where there is something to
 * open, and the whole row is the target — a 10px caret is a hard thing to hit.
 */
function Row({ depth, expandable, open, onToggle, title, children }: {
  depth: number; expandable?: boolean; open?: boolean; onToggle?: () => void; title?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role={expandable ? 'button' : undefined}
      tabIndex={expandable ? 0 : undefined}
      aria-expanded={expandable ? open : undefined}
      title={title}
      onClick={expandable ? onToggle : undefined}
      onKeyDown={expandable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle?.(); } } : undefined}
      className="flex items-center gap-1 pr-2 py-[1px] min-h-[18px] text-[11px]"
      style={{ paddingLeft: depth * 12 + 8, cursor: expandable ? 'pointer' : 'default' }}
    >
      {expandable
        ? <ChevronRightIcon size={10} style={{ transform: open ? 'rotate(90deg)' : 'none', flexShrink: 0, color: 'var(--color-text-muted)' }} />
        : <span style={{ width: 10, flexShrink: 0 }} />}
      {children}
    </div>
  );
}

function WatchSection() {
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const watches = usePyStore(s => s.watches);
  const add = usePyStore(s => s.addWatch);
  const remove = usePyStore(s => s.removeWatch);
  const results = usePyStore(s => s.debug?.state.watches ?? []);
  const paused = usePyStore(s => !!s.debug && !s.debug.ended && s.debug.state.status === 'paused');

  const commit = () => { add(draft); setDraft(''); setAdding(false); };

  return (
    <CollapsibleSectionView
      title="Watch" expanded={open} onToggle={() => setOpen(!open)}
      accentColor="var(--color-warning)" badge={watches.length || undefined}
      headerRight={
        <IconButtonView size="xs" icon={<PlusIcon size={IconSize.inline} />} tooltip="Add expression"
                        aria-label="Add watch expression"
                        onClick={(e) => { e.stopPropagation(); setAdding(true); setOpen(true); }} />
      }
    >
      <div className="flex flex-col pb-1">
        {watches.length === 0 && !adding && <Muted>Expressions evaluated in the paused frame</Muted>}
        {watches.map(expr => {
          const r = results.find(w => w.expr === expr);
          return (
            <div key={expr} className="group flex items-center gap-1.5 px-3 py-[2px] text-[11px] min-h-[20px]">
              <span className="font-mono shrink-0" style={{ color: 'var(--color-debug-key)' }}>{expr}</span>
              <span className="font-mono truncate flex-1"
                    style={{ color: r?.error ? 'var(--color-text-muted)' : 'var(--color-debug-object)' }}
                    title={r?.error ?? r?.value}>
                {!paused ? '' : r?.error ? `<${r.error}>` : r?.value ?? ''}
              </span>
              <IconButtonView size="xs" icon={<CloseIcon size={IconSize.inline} />} tooltip="Remove"
                              aria-label={`Remove watch ${expr}`} onClick={() => remove(expr)} />
            </div>
          );
        })}
        {adding && (
          <div className="px-3 py-1">
            <TextInputView
              autoFocus size="xs" value={draft} placeholder="Expression to watch"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') { setDraft(''); setAdding(false); }
              }}
              onBlur={commit}
            />
          </div>
        )}
      </div>
    </CollapsibleSectionView>
  );
}

function CallStackSection() {
  const [open, setOpen] = useState(true);
  const debug = usePyStore(s => s.debug);
  const paused = !!debug && !debug.ended && debug.state.status === 'paused';
  const frames = debug?.state.frames ?? [];
  const base = (f: string) => f.slice(f.lastIndexOf('/') + 1);
  return (
    <CollapsibleSectionView title="Call Stack" expanded={open} onToggle={() => setOpen(!open)}
                            accentColor="var(--color-debug-scope)">
      {!paused ? <Muted>Not paused</Muted> : (
        <div className="flex flex-col font-mono text-[11px] pb-1">
          {frames.map((f, i) => (
            <div key={`${f.file}:${f.line}:${i}`} className="flex items-center gap-1.5 px-3 py-[3px]"
                 title={`${f.file}:${f.line}`}
                 style={{ background: i === 0 ? 'color-mix(in srgb, var(--color-warning) 8%, transparent)' : undefined }}>
              <span style={{
                width: 6, height: 6, borderRadius: 6, flexShrink: 0,
                background: i === 0 ? 'var(--color-warning)' : 'transparent',
              }} />
              <span className="shrink-0" style={{ color: 'var(--color-text-primary)' }}>{f.fn}()</span>
              <span className="truncate flex-1 text-right" style={{ color: 'var(--color-text-muted)' }}>
                {base(f.file)}:{f.line}
              </span>
            </div>
          ))}
        </div>
      )}
    </CollapsibleSectionView>
  );
}

function BreakpointsSection({ scriptId, scriptName }: { scriptId?: string; scriptName: string }) {
  const [open, setOpen] = useState(true);
  const lines = usePyStore(s => (scriptId ? s.breakpoints[scriptId] : undefined) ?? []);
  const off = usePyStore(s => (scriptId ? s.disabledBreakpoints[scriptId] : undefined) ?? []);
  const toggle = usePyStore(s => s.toggleBreakpointEnabled);
  const remove = usePyStore(s => s.removeBreakpoint);
  const here = usePyStore(s => (s.debug && !s.debug.ended && s.debug.scriptId === scriptId
    && s.debug.state.status === 'paused' ? s.debug.state.location?.line : undefined));
  return (
    <CollapsibleSectionView title="Breakpoints" expanded={open} onToggle={() => setOpen(!open)}
                            accentColor="var(--color-error)" badge={lines.length || undefined}>
      {!scriptId || lines.length === 0 ? <Muted>Click the gutter to set one</Muted> : (
        <div className="flex flex-col pb-1">
          {lines.map(line => (
            <div key={line} className="flex items-center gap-2 px-3 py-[2px] text-[11px] min-h-[22px]"
                 style={{ opacity: off.includes(line) ? 0.5 : 1 }}>
              <CheckboxView size="xs" checked={!off.includes(line)} onChange={() => toggle(scriptId, line)}
                            testId={`bp-${line}`} />
              <span className="truncate flex-1" style={{ color: 'var(--color-text-primary)' }}>{scriptName}</span>
              <span className="font-mono" style={{ color: 'var(--color-text-muted)' }}>{line}</span>
              {here === line && (
                <span className="text-[9.5px] font-bold uppercase" style={{ color: 'var(--color-warning)' }}>here</span>
              )}
              <IconButtonView size="xs" icon={<CloseIcon size={IconSize.inline} />} tooltip="Remove breakpoint"
                              aria-label={`Remove breakpoint at line ${line}`} onClick={() => remove(scriptId, line)} />
            </div>
          ))}
        </div>
      )}
    </CollapsibleSectionView>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-2 text-[11px] italic" style={{ color: 'var(--color-text-muted)' }}>{children}</div>;
}
