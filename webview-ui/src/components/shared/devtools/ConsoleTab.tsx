/**
 * ConsoleTab — Displays script console.log/warn/error/info output.
 * Each entry shows: timestamp, level icon (colored), and message.
 * JSON values are shown in an expand/collapse tree with Raw/JSON toggle.
 * HTTP status codes are colorized as badges.
 * Filter by level, auto-scroll to bottom.
 */
import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { useDevToolsStore, LogFilter, LogLevel } from '../../../store/devtools-store';
import { useUiStateStore } from '../../../store/ui-state-store';
import { LineNumbersIcon, ReplSendIcon } from '../../../icons';
import { getDkCompletions, replEval, type ReplEvalContext } from '../../../services/dk-repl';
import { useTabsStore } from '../../../store/tabs-store';
import { useEnvStore, GLOBAL_ENV_ID } from '../../../store/env-store';
import { getProtocolAccent } from '../../../colors';
import Editor, { OnMount } from '@monaco-editor/react';
import { LEVEL_CONFIG, formatTimestamp, LogMessage, LevelIcon } from './log-utils';
import { InfoPopup } from '../display/InfoPopup';


const FILTERS: { key: LogFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'log', label: 'Log' },
  { key: 'info', label: 'Info' },
  { key: 'warn', label: 'Warn' },
  { key: 'error', label: 'Errors' },
];

export function ConsoleTab() {
  const logs = useDevToolsStore(s => s.logs);
  const addLog = useDevToolsStore(s => s.addLog);
  const logFilter = useDevToolsStore(s => s.logFilter);
  const setLogFilter = useDevToolsStore(s => s.setLogFilter);
  const jsonExpandState = useUiStateStore(s => s.jsonExpandState);
  const toggleJsonPath = useUiStateStore(s => s.toggleJsonPath);

  const [showLineNumbers, setShowLineNumbers] = useState(false);
  const [replCode, setReplCode] = useState('');
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const [editorHeight, setEditorHeight] = useState(28);
  // Command history for up/down arrow navigation
  const historyRef = useRef<string[]>([]);
  const historyIdxRef = useRef(-1);
  // Ref to always hold latest executeRepl (avoids stale closures in Monaco commands)
  const executeReplRef = useRef<() => void>(() => {});

  const filteredLogs = useMemo(() => {
    if (logFilter === 'all') return logs;
    return logs.filter(l => l.level === logFilter);
  }, [logs, logFilter]);

  // Auto-scroll to bottom when new logs arrive (use scrollTop to avoid scrollIntoView affecting ancestors)
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [filteredLogs.length]);

  // Auto-resize editor height based on line count
  useEffect(() => {
    const lineCount = (replCode.match(/\n/g) || []).length + 1;
    const minH = showLineNumbers ? 48 : 28;
    const newHeight = Math.min(Math.max(minH, lineCount * 19), 140);
    setEditorHeight(newHeight);
  }, [replCode, showLineNumbers]);

  // Build REPL eval context from stores (reads current state at execution time)
  const buildReplContext = useCallback((): ReplEvalContext => {
    const { tabs, activeTabId } = useTabsStore.getState();
    const activeTab = tabs.find(t => t.id === activeTabId);
    const { environments, activeEnvId } = useEnvStore.getState();

    // Env vars: merge global + active env (active overrides global)
    const globalEnv = environments.find(e => e.id === GLOBAL_ENV_ID);
    const activeEnv = activeEnvId && activeEnvId !== GLOBAL_ENV_ID
      ? environments.find(e => e.id === activeEnvId)
      : null;

    const envVars: Record<string, string> = {};
    const globalVars: Record<string, string> = {};

    // Global vars go to globalVars, active env to envVars
    for (const v of globalEnv?.variables || []) {
      if (v.key) globalVars[v.key] = v.currentValue || v.initialValue || '';
    }
    for (const v of activeEnv?.variables || []) {
      if (v.key) envVars[v.key] = v.currentValue || v.initialValue || '';
    }

    // Request from active tab
    const request = activeTab
      ? {
          method: activeTab.method,
          url: activeTab.url,
          headers: Object.fromEntries(
            activeTab.headers.filter(h => h.enabled && h.key).map(h => [h.key, h.value])
          ),
          body: activeTab.bodyRaw || null,
        }
      : { method: 'GET', url: '', headers: {} as Record<string, string>, body: null as string | null };

    // Response from active tab
    const response = activeTab?.response
      ? {
          status: activeTab.response.status,
          statusText: activeTab.response.statusText,
          headers: activeTab.response.headers,
          body: activeTab.response.body,
          time: activeTab.response.time,
          size: activeTab.response.size,
        }
      : null;

    return { envVars, globalVars, collectionVars: {}, request, response };
  }, []);

  // Execute REPL code via extension host (async — no CSP eval issues)
  const executeRepl = useCallback(async () => {
    const code = replCode.trim();
    if (!code) return;

    // Save to history
    historyRef.current.push(code);
    historyIdxRef.current = -1;

    // Add the input as a log entry (styled as command input)
    addLog({ timestamp: Date.now(), level: 'debug', args: [`› ${code}`], scriptPhase: 'repl' });

    try {
      const ctx = buildReplContext();
      const result = await replEval(code, ctx);

      // Push captured console logs from the sandbox
      for (const entry of result.logs) {
        addLog({ timestamp: entry.timestamp, level: entry.level, args: entry.args, scriptPhase: 'repl' });
      }

      // Apply variable updates back to stores
      if (result.envUpdates && Object.keys(result.envUpdates).length > 0) {
        const envState = useEnvStore.getState();
        const targetEnvId = envState.activeEnvId || GLOBAL_ENV_ID;
        const env = envState.environments.find(e => e.id === targetEnvId);
        if (env) {
          for (const [key, value] of Object.entries(result.envUpdates)) {
            const existing = env.variables.find(v => v.key === key);
            if (existing) {
              useEnvStore.getState().updateVariable(targetEnvId, existing.id, { currentValue: value });
            } else {
              useEnvStore.getState().addVariable(targetEnvId);
              const updated = useEnvStore.getState().environments.find(e => e.id === targetEnvId);
              const newVar = updated?.variables[updated.variables.length - 1];
              if (newVar) {
                useEnvStore.getState().updateVariable(targetEnvId, newVar.id, { key, currentValue: value, initialValue: value });
              }
            }
          }
        }
      }
      if (result.globalUpdates && Object.keys(result.globalUpdates).length > 0) {
        const envState = useEnvStore.getState();
        const globalE = envState.environments.find(e => e.id === GLOBAL_ENV_ID);
        if (globalE) {
          for (const [key, value] of Object.entries(result.globalUpdates)) {
            const existing = globalE.variables.find(v => v.key === key);
            if (existing) {
              useEnvStore.getState().updateVariable(GLOBAL_ENV_ID, existing.id, { currentValue: value });
            } else {
              useEnvStore.getState().addVariable(GLOBAL_ENV_ID);
              const updated = useEnvStore.getState().environments.find(e => e.id === GLOBAL_ENV_ID);
              const newVar = updated?.variables[updated.variables.length - 1];
              if (newVar) {
                useEnvStore.getState().updateVariable(GLOBAL_ENV_ID, newVar.id, { key, currentValue: value, initialValue: value });
              }
            }
          }
        }
      }

      // Show the return value (suppress undefined when console output was captured)
      if (result.error) {
        addLog({ timestamp: Date.now(), level: 'error', args: [result.error], scriptPhase: 'repl' });
      } else if (result.result === undefined) {
        // Only show 'undefined' if no console logs were emitted (pure expression that returned undefined)
        if (result.logs.length === 0) {
          addLog({ timestamp: Date.now(), level: 'log', args: ['__repl_undefined__'], scriptPhase: 'repl' });
        }
      } else {
        addLog({ timestamp: Date.now(), level: 'log', args: [result.result], scriptPhase: 'repl' });
      }
    } catch (err: any) {
      addLog({ timestamp: Date.now(), level: 'error', args: [err.message || String(err)], scriptPhase: 'repl' });
    }

    setReplCode('');
    setEditorHeight(showLineNumbers ? 48 : 28);
  }, [replCode, addLog, showLineNumbers, buildReplContext]);

  // Keep ref in sync so Monaco commands always call the latest version
  useEffect(() => { executeReplRef.current = executeRepl; }, [executeRepl]);

  // Setup Monaco editor with dk intellisense
  const handleEditorMount = useCallback((editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Enter always inserts newline (default Monaco behavior — no override needed)

    // Shift+Enter always executes
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => {
      executeReplRef.current();
    });

    // Up arrow — navigate command history
    editor.addCommand(monaco.KeyCode.UpArrow, () => {
      const model = editor.getModel();
      if (!model) return;
      const position = editor.getPosition();
      // Only intercept if cursor is on line 1 (top of editor)
      if (position && position.lineNumber > 1) {
        // Normal cursor-up behavior
        editor.trigger('keyboard', 'cursorUp', {});
        return;
      }
      const history = historyRef.current;
      if (history.length === 0) return;
      if (historyIdxRef.current === -1) {
        historyIdxRef.current = history.length - 1;
      } else if (historyIdxRef.current > 0) {
        historyIdxRef.current--;
      }
      const val = history[historyIdxRef.current];
      editor.setValue(val);
      editor.setPosition({ lineNumber: 1, column: val.length + 1 });
    });

    // Down arrow — navigate command history forward
    editor.addCommand(monaco.KeyCode.DownArrow, () => {
      const model = editor.getModel();
      if (!model) return;
      const position = editor.getPosition();
      const lineCount = model.getLineCount();
      // Only intercept if cursor is on last line
      if (position && position.lineNumber < lineCount) {
        editor.trigger('keyboard', 'cursorDown', {});
        return;
      }
      const history = historyRef.current;
      if (historyIdxRef.current === -1) return;
      if (historyIdxRef.current < history.length - 1) {
        historyIdxRef.current++;
        const val = history[historyIdxRef.current];
        editor.setValue(val);
        editor.setPosition({ lineNumber: 1, column: val.length + 1 });
      } else {
        // Past end of history — clear
        historyIdxRef.current = -1;
        editor.setValue('');
      }
    });

    // Register dk + console autocomplete provider
    const disposable = monaco.languages.registerCompletionItemProvider('javascript', {
      triggerCharacters: ['.'],
      provideCompletionItems: (model: any, position: any) => {
        const textUntilPosition = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        // dk completions
        const dkSuggestions = getDkCompletions(textUntilPosition, monaco, position);
        if (dkSuggestions.length > 0) return { suggestions: dkSuggestions };

        // console. completions
        if (/\bconsole\.\s*$/.test(textUntilPosition)) {
          const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: position.column, endColumn: position.column };
          return {
            suggestions: [
              { label: 'log', kind: monaco.languages.CompletionItemKind.Function, insertText: 'log(${1})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Print to console', range },
              { label: 'info', kind: monaco.languages.CompletionItemKind.Function, insertText: 'info(${1})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Info message', range },
              { label: 'warn', kind: monaco.languages.CompletionItemKind.Function, insertText: 'warn(${1})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Warning message', range },
              { label: 'error', kind: monaco.languages.CompletionItemKind.Function, insertText: 'error(${1})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Error message', range },
              { label: 'debug', kind: monaco.languages.CompletionItemKind.Function, insertText: 'debug(${1})', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: 'Debug message', range },
            ],
          };
        }

        return { suggestions: [] };
      },
    });

    // Cleanup
    editor.onDidDispose(() => disposable.dispose());
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex items-center gap-1 h-[26px] px-2 border-b border-[var(--color-surface-border)] flex-shrink-0">
        {FILTERS.map(f => (
          <button
            key={f.key}
            className={`px-1.5 h-[20px] text-[10px] rounded transition-colors cursor-pointer ${
              logFilter === f.key
                ? 'bg-[var(--color-input-bg)] text-[var(--color-text-primary)] font-medium'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            }`}
            onClick={() => setLogFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-[var(--color-text-muted)]">
          {filteredLogs.length} {filteredLogs.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {/* Log entries */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable] font-mono text-[11px]">
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-muted)] gap-1">
            <span className="text-[20px] opacity-40">›_</span>
            <span className="text-[11px]">No logs to display</span>
            <span className="text-[10px] opacity-60">Type JavaScript below or run scripts to see output</span>
          </div>
        ) : (
          <div className="py-1">
            {filteredLogs.map(log => {
              const config = LEVEL_CONFIG[log.level];
              return (
                <div
                  key={log.id}
                  className="flex items-start gap-2 px-3 py-[3px] hover:bg-[var(--color-input-bg)] border-l-2"
                  style={{ borderLeftColor: config.color }}
                >
                  {/* Timestamp */}
                  <span className="text-[10px] text-[var(--color-text-muted)] flex-shrink-0 pt-[1px] select-none min-w-[72px]">
                    {formatTimestamp(log.timestamp)}
                  </span>

                  {/* Level icon */}
                  <span className="flex-shrink-0 pt-[1px]">
                    <LevelIcon level={log.level} />
                  </span>

                  {/* Message */}
                  {log.args.length === 1 && log.args[0] === '__repl_undefined__' ? (
                    <span className="flex-1 break-all whitespace-pre-wrap text-[var(--color-text-muted)] italic">undefined</span>
                  ) : (
                    <LogMessage
                      args={log.args}
                      expandedPaths={jsonExpandState[`console.${log.id}`] ?? undefined}
                      onTogglePath={(path) => toggleJsonPath(`console.${log.id}`, path)}
                    />
                  )}

                  {/* Source badge */}
                  {log.scriptPhase && (
                    <span className="flex-shrink-0 text-[9px] px-1 py-0.5 rounded bg-[var(--color-surface-border)] text-[var(--color-text-muted)]">
                      {log.scriptPhase}
                    </span>
                  )}
                </div>
              );
            })}

          </div>
        )}
      </div>

      {/* REPL Input — Chrome-style bottom editor */}
      <div className="flex-shrink-0 border-t border-[var(--color-surface-border)]">
        <div className="flex items-start">
          {/* Prompt chevron */}
          <span className="flex items-center justify-center w-[28px] h-[28px] text-[var(--color-primary)] font-mono text-[13px] font-bold select-none flex-shrink-0">
            ›
          </span>
          {/* Monaco editor */}
          <div className="flex-1 min-w-0" style={{ height: editorHeight }}>
            <ConsoleReplEditor
              value={replCode}
              onChange={setReplCode}
              onExecute={executeRepl}
              onMount={handleEditorMount}
              showLineNumbers={showLineNumbers}
              height={editorHeight}
            />
          </div>
          {/* Info popup */}
          <InfoPopup
            title="Console REPL"
            description="Execute JavaScript with access to request/response data, environment variables, and the dk scripting API."
            items={[
              { code: 'Shift+Enter', label: 'Execute command' },
              { code: 'Send button', label: 'Execute command' },
              { code: 'Enter', label: 'New line' },
              { code: '↑ / ↓', label: 'Navigate command history' },
              { code: 'Line #', label: 'Toggle line numbers' },
            ]}
            footer="Supports multi-line scripts, console.log, dk.env, dk.global, and more."
            wikiSlug="console-repl"
            accentColor={getProtocolAccent(useTabsStore.getState().activeProtocol)}
          />
          {/* Send button */}
          <button
            type="button"
            className={`w-[26px] h-[26px] flex items-center justify-center rounded transition-colors flex-shrink-0 mt-[1px] ${
              replCode.trim() ? 'text-[var(--color-primary)] hover:bg-[var(--color-input-bg)] cursor-pointer' : 'text-[var(--color-text-muted)] opacity-40 cursor-not-allowed'
            }`}
            title="Run (Shift+Enter)"
            onClick={() => replCode.trim() && executeRepl()}
          >
            <ReplSendIcon size={13} />
          </button>
          {/* Line numbers toggle */}
          <button
            type="button"
            className={`w-[26px] h-[26px] flex items-center justify-center cursor-pointer rounded transition-colors flex-shrink-0 mt-[1px] ${
              showLineNumbers ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            }`}
            title={showLineNumbers ? 'Hide line numbers' : 'Show line numbers'}
            onClick={() => setShowLineNumbers(!showLineNumbers)}
          >
            <LineNumbersIcon size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Console REPL Editor (Monaco) ────────────────────────────────────────────

function ConsoleReplEditor({ value, onChange, onExecute, onMount, showLineNumbers, height }: {
  value: string;
  onChange: (v: string) => void;
  onExecute: () => void;
  onMount: OnMount;
  showLineNumbers: boolean;
  height: number;
}) {
  return (
    <Editor
      value={value}
      onChange={(v) => onChange(v || '')}
      language="javascript"
      height={height}
      onMount={onMount}
      options={{
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        lineNumbers: showLineNumbers ? 'on' : 'off',
        glyphMargin: false,
        folding: false,
        lineDecorationsWidth: showLineNumbers ? 4 : 0,
        lineNumbersMinChars: showLineNumbers ? 3 : 0,
        overviewRulerLanes: 0,
        overviewRulerBorder: false,
        hideCursorInOverviewRuler: true,
        renderLineHighlight: 'none',
        scrollbar: { vertical: 'hidden', horizontal: 'hidden' },
        wordWrap: 'on',
        fontSize: 12,
        fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
        padding: { top: 6, bottom: 6 },
        suggest: { showIcons: true },
        tabSize: 2,
        automaticLayout: true,
        contextmenu: false,
        fixedOverflowWidgets: true,
        quickSuggestions: true,
        parameterHints: { enabled: true },
      }}
      theme="daakia-dark"
    />
  );
}
