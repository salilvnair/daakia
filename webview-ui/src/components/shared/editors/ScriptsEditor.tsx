import { useState, useRef, useCallback, useMemo } from 'react';
import { PillTabs } from '../controls/PillTabs';
import { CodeEditor } from './CodeEditor';
import { SnippetsPanel } from './SnippetsPanel';
import { useDebugStore } from '../../../store/debug-store';
import { useTabsStore } from '../../../store/tabs-store';
import { ContextMenu } from '../menus/ContextMenu';
import { useAiScriptAutocomplete, type AiAutocompleteMode } from '../../../hooks/useAiScriptAutocomplete';
import { SparkleIcon } from '../../../icons';
import { AiContractTestGenerator, type AiContractTestHandle } from '../../ai/AiContractTestGenerator';

interface ScriptsEditorProps {
  preRequestScript: string;
  postResponseScript: string;
  onPreRequestScriptChange: (val: string) => void;
  onPostResponseScriptChange: (val: string) => void;
  accentColor?: string;
}

/** Module-level flag: snippets start collapsed, user can open manually */
let snippetsClosed = true;

export function ScriptsEditor({ preRequestScript, postResponseScript, onPreRequestScriptChange, onPostResponseScriptChange, accentColor }: ScriptsEditorProps) {
  const [activeScript, setActiveScript] = useState('pre-request');
  const [showSnippets, setShowSnippets] = useState(!snippetsClosed);
  const [snippetsWidth, setSnippetsWidth] = useState(220);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // AI Scripting Autocomplete
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiMode, setAiMode] = useState<AiAutocompleteMode>('on-demand');
  const { handleEditorMount } = useAiScriptAutocomplete({ enabled: aiEnabled, mode: aiMode });

  // AI Contract Test Generator
  const contractTestRef = useRef<AiContractTestHandle>(null);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ line: number; pos: { x: number; y: number } } | null>(null);
  // Conditional breakpoint input state
  const [condInput, setCondInput] = useState<{ line: number; value: string } | null>(null);

  const { active: debugActive, phase: debugPhase } = useDebugStore();
  const activeTabId = useTabsStore(s => s.activeTabId) || '';
  const currentPhase = activeScript === 'pre-request' ? 'pre-request' : 'post-response';
  const bpKey = `${activeTabId}:${currentPhase}`;
  const breakpointsRaw = useDebugStore(s => s.breakpoints[bpKey]);
  const breakpoints = useMemo(() => breakpointsRaw || [], [breakpointsRaw]);
  const disabledBpRaw = useDebugStore(s => s.disabledBreakpoints[bpKey]);
  const disabledBreakpoints = useMemo(() => disabledBpRaw || [], [disabledBpRaw]);
  const conditionsRaw = useDebugStore(s => s.conditions[bpKey]);
  const conditionalLines = useMemo(() => {
    if (!conditionsRaw) return [];
    return Object.keys(conditionsRaw).map(Number);
  }, [conditionsRaw]);

  const isDebuggingThisScript = debugActive && (
    (activeScript === 'pre-request' && debugPhase === 'pre-request') ||
    (activeScript === 'post-response' && debugPhase === 'post-response')
  );

  // Get paused line for the current script (only if this script is being debugged)
  const pausedLine = useDebugStore(s => s.pausedLine);
  const currentPausedLine = isDebuggingThisScript ? pausedLine : null;

  const handleToggleBreakpoint = useCallback((line: number) => {
    if (!activeTabId) return;
    useDebugStore.getState().toggleBreakpoint(activeTabId, currentPhase, line);
  }, [activeTabId, currentPhase]);

  const handleGlyphContextMenu = useCallback((line: number, pos: { x: number; y: number }) => {
    setCtxMenu({ line, pos });
  }, []);

  const handleCtxMenuSelect = useCallback((id: string) => {
    if (!ctxMenu || !activeTabId) return;
    const line = ctxMenu.line;
    if (id === 'add-bp') {
      const store = useDebugStore.getState();
      if (!store.breakpoints[bpKey]?.includes(line)) {
        store.toggleBreakpoint(activeTabId, currentPhase, line);
      }
    } else if (id === 'remove-bp') {
      useDebugStore.getState().removeBreakpoint(activeTabId, currentPhase, line);
    } else if (id === 'add-conditional') {
      // Show inline condition input
      const existing = conditionsRaw?.[line] || '';
      setCondInput({ line, value: existing });
    } else if (id === 'disable-bp') {
      useDebugStore.getState().toggleDisableBreakpoint(activeTabId, currentPhase, line);
    } else if (id === 'enable-bp') {
      useDebugStore.getState().toggleDisableBreakpoint(activeTabId, currentPhase, line);
    }
    setCtxMenu(null);
  }, [ctxMenu, activeTabId, currentPhase, bpKey, conditionsRaw]);

  const handleConditionSubmit = useCallback(() => {
    if (!condInput || !activeTabId) return;
    const { line, value } = condInput;
    if (value.trim()) {
      useDebugStore.getState().addConditionalBreakpoint(activeTabId, currentPhase, line, value.trim());
    }
    setCondInput(null);
  }, [condInput, activeTabId, currentPhase]);

  const handleInsertSnippet = (code: string) => {
    const current = activeScript === 'pre-request' ? preRequestScript : postResponseScript;
    const newValue = current ? current + '\n\n' + code : code;
    if (activeScript === 'pre-request') onPreRequestScriptChange(newValue);
    else onPostResponseScriptChange(newValue);
  };

  const handleDragStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startWidth: snippetsWidth };
  }, [snippetsWidth]);

  const handleDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const delta = dragRef.current.startX - e.clientX;
    setSnippetsWidth(Math.max(160, Math.min(400, dragRef.current.startWidth + delta)));
  }, []);

  const handleDragEnd = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    dragRef.current = null;
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2">
      <div className="flex items-center justify-between border-b border-[var(--color-surface-border)]">
        <PillTabs
          tabs={[
            { id: 'pre-request', label: 'Pre-request', dot: !!preRequestScript.trim() },
            { id: 'post-response', label: 'Post-response', dot: !!postResponseScript.trim() },
          ]}
          activeTab={activeScript}
          onChange={setActiveScript}
          size="sm"
          variant="underline"
          accentColor={accentColor}
        />
        <div className="flex items-center gap-1 mr-2">
          {/* AI Contract Test — post-response only */}
          {activeScript === 'post-response' && (
            <button
              type="button"
              title="Generate contract tests with AI"
              onClick={() => contractTestRef.current?.open()}
              className="flex items-center gap-1 px-1.5 py-1 text-[10px] font-medium rounded cursor-pointer transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              style={{ color: 'var(--color-success)' }}
            >
              <SparkleIcon size={10} />
              <span>Tests</span>
            </button>
          )}
          {/* AI Autocomplete toggle */}
          <button
            type="button"
            title={aiEnabled ? 'AI autocomplete ON — click to disable' : 'AI autocomplete OFF — click to enable (Ctrl+Alt+Space)'}
            onClick={() => setAiEnabled(e => !e)}
            className={`flex items-center gap-1 px-1.5 py-1 text-[10px] font-medium rounded cursor-pointer transition-colors ${
              aiEnabled
                ? 'text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            }`}
            style={aiEnabled ? { backgroundColor: 'color-mix(in srgb, #a78bfa 18%, transparent)', color: '#a78bfa' } : undefined}
          >
            <SparkleIcon size={10} />
            <span>AI</span>
          </button>
          {/* Mode toggle — only visible when AI is enabled */}
          {aiEnabled && (
            <button
              type="button"
              title={aiMode === 'on-demand' ? 'On-demand mode (Ctrl+Alt+Space) — click for auto' : 'Auto mode (triggers after idle) — click for on-demand'}
              onClick={() => setAiMode(m => m === 'on-demand' ? 'on-type' : 'on-demand')}
              className="px-1.5 py-1 text-[9px] font-medium rounded cursor-pointer transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              style={{ backgroundColor: 'color-mix(in srgb, #a78bfa 8%, transparent)', color: '#a78bfa' }}
            >
              {aiMode === 'on-demand' ? '⌃⌥Space' : 'auto'}
            </button>
          )}
          {/* Snippets toggle */}
          <button
            type="button"
            onClick={() => {
              const newVal = !showSnippets;
              setShowSnippets(newVal);
              if (!newVal) snippetsClosed = true;
              else snippetsClosed = false;
            }}
            className={`px-2 py-1 text-[10px] font-medium rounded cursor-pointer transition-colors ${
              showSnippets
                ? 'text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            }`}
            style={showSnippets ? { backgroundColor: accentColor ? `color-mix(in srgb, ${accentColor} 15%, transparent)` : 'rgba(99,102,241,0.15)', color: accentColor || 'var(--color-primary)' } : undefined}
          >
            Snippets
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-[200px] gap-0">
        <div className="flex-1 min-w-0 relative">
            <CodeEditor
              key={`${activeTabId}-${currentPhase}`}
              value={activeScript === 'pre-request' ? preRequestScript : postResponseScript}
              onChange={(val) => {
                if (activeScript === 'pre-request') onPreRequestScriptChange(val);
                else onPostResponseScriptChange(val);
                // Prune breakpoints that exceed new line count
                const newLineCount = val.split('\n').length;
                if (activeTabId) {
                  useDebugStore.getState().pruneBreakpoints(activeTabId, currentPhase, newLineCount);
                }
              }}
              language="javascript"
              readOnly={isDebuggingThisScript}
              placeholder={`// ${activeScript === 'pre-request' ? 'Pre-request script (JavaScript)...' : 'Post-response script — runs after the response is received...'}`}
              height="100%"
              breakpoints={breakpoints}
              disabledBreakpoints={disabledBreakpoints}
              conditionalBreakpointLines={conditionalLines}
              pausedLine={currentPausedLine}
              onToggleBreakpoint={handleToggleBreakpoint}
              onGlyphContextMenu={handleGlyphContextMenu}
              onEditorMount={handleEditorMount(currentPhase)}
            />
          {/* Conditional breakpoint inline input */}
          {condInput && (
            <div className="absolute left-12 right-4 z-50 flex items-center gap-2 px-3 py-1.5 bg-[var(--color-elevated)] border border-[var(--color-warning)] rounded-md shadow-lg"
              style={{ top: `${(condInput.line - 1) * 20 + 28}px` }}
            >
              <span className="text-[10px] font-medium text-[var(--color-warning)] whitespace-nowrap">Expression</span>
              <input
                autoFocus
                type="text"
                value={condInput.value}
                onChange={(e) => setCondInput({ ...condInput, value: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConditionSubmit();
                  if (e.key === 'Escape') setCondInput(null);
                }}
                onBlur={handleConditionSubmit}
                placeholder="Break when expression is truthy, e.g. x > 5"
                className="flex-1 bg-[var(--color-input-bg)] border border-[var(--color-input-border)] rounded px-2 py-1 text-[11px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-warning)]"
              />
            </div>
          )}
        </div>
        {showSnippets && !isDebuggingThisScript && (
          <>
            {/* Vertical drag handle */}
            <div
              className="w-[5px] flex-shrink-0 cursor-col-resize flex items-center justify-center group/splitter transition-colors"
              style={{ ['--splitter-accent' as any]: accentColor || 'var(--color-primary)' }}
              onPointerDown={handleDragStart}
              onPointerMove={handleDragMove}
              onPointerUp={handleDragEnd}
            >
              <div className="w-[1px] h-8 bg-[var(--color-surface-border)] group-hover/splitter:bg-[var(--splitter-accent)] transition-colors rounded-full" />
            </div>
            <div className="flex-shrink-0 border-l border-[var(--color-surface-border)]" style={{ width: snippetsWidth }}>
              <SnippetsPanel onInsert={handleInsertSnippet} accentColor={accentColor} />
            </div>
          </>
        )}
      </div>

      {/* AI Contract Test Generator modal */}
      <AiContractTestGenerator
        ref={contractTestRef}
        tabId={activeTabId}
        onApply={(script) => {
          const current = postResponseScript;
          onPostResponseScriptChange(current ? current + '\n\n' + script : script);
        }}
      />

      {/* Glyph margin context menu */}
      {ctxMenu && (
        <ContextMenu
          position={ctxMenu.pos}
          onClose={() => setCtxMenu(null)}
          onSelect={handleCtxMenuSelect}
          items={(() => {
            const hasBp = breakpoints.includes(ctxMenu.line);
            const isDisabled = disabledBreakpoints.includes(ctxMenu.line);
            if (hasBp) {
              return [
                { id: 'remove-bp', label: 'Remove Breakpoint' },
                { id: isDisabled ? 'enable-bp' : 'disable-bp', label: isDisabled ? 'Enable Breakpoint' : 'Disable Breakpoint' },
                { id: 'sep1', label: '', separator: true },
                { id: 'add-conditional', label: 'Edit Condition…' },
              ];
            }
            return [
              { id: 'add-bp', label: 'Add Breakpoint' },
              { id: 'add-conditional', label: 'Add Conditional Breakpoint…' },
            ];
          })()}
        />
      )}
    </div>
  );
}
