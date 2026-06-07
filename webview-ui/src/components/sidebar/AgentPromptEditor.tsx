/**
 * AgentPromptEditor — Monaco-based editor for a single AI agent scenario prompt.
 * Extracted from PromptLibraryPanel to keep file sizes manageable.
 *
 * Features:
 * - System / User prompt tabs
 * - Preview ({{var}} pills) + Edit (Monaco) view modes
 * - {{variable}} syntax decorations in purple
 * - Clickable variable ribbon to insert at cursor
 * - Save + Reset actions
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Editor from '@monaco-editor/react';
import type * as MonacoT from 'monaco-editor';
import { TrashIcon } from '../../icons';
import type { AgentScenario, ScenarioVarMap } from '../ai/ai-agent-prompts';
import { SCENARIO_COLORS, SCENARIO_LABELS, SCENARIO_DESCRIPTIONS } from '../ai/ai-agent-prompts';

const ACCENT = 'var(--color-protocol-ai)';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentEntry {
  scenario: AgentScenario;
  systemPrompt: string;
  userPrompt: string;
  agentName: string;
  isCustomized: boolean;
  variables: ScenarioVarMap;
  updatedAt: string | null;
}

interface AgentPromptEditorProps {
  entry: AgentEntry;
  onSave: (scenario: AgentScenario, system: string, user: string) => void;
  onResetRequest: (scenario: AgentScenario) => void;
}

// ─── Monaco {{var}} decoration helpers ────────────────────────────────────────

function ensureVarDecorationStyle() {
  if (document.getElementById('prompt-var-deco-style')) return;
  const style = document.createElement('style');
  style.id = 'prompt-var-deco-style';
  style.textContent = `
    .monaco-editor .prompt-var-highlight {
      background-color: rgba(139, 92, 246, 0.18);
      border-bottom: 1.5px solid rgba(139, 92, 246, 0.55);
      border-radius: 2px;
      color: #c084fc !important;
      font-weight: 600;
    }
  `;
  document.head.appendChild(style);
}

function computeVarDecorations(
  text: string,
  monaco: typeof MonacoT,
): MonacoT.editor.IModelDeltaDecoration[] {
  const decos: MonacoT.editor.IModelDeltaDecoration[] = [];
  text.split('\n').forEach((line, lineIdx) => {
    const regex = /\{\{[^}]+\}\}/g;
    let m;
    while ((m = regex.exec(line)) !== null) {
      decos.push({
        range: new monaco.Range(lineIdx + 1, m.index + 1, lineIdx + 1, m.index + m[0].length + 1),
        options: { inlineClassName: 'prompt-var-highlight' },
      });
    }
  });
  return decos;
}

// ─── Prompt preview ({{var}} as colored pills) ────────────────────────────────

function PromptPreview({ text, vars }: { text: string; vars: ScenarioVarMap }) {
  if (!text) {
    return <p className="text-[12px] text-[var(--color-text-muted)] italic">No prompt text — switch to Edit to add one.</p>;
  }
  return (
    <div className="text-[12px] font-mono leading-relaxed text-[var(--color-text-secondary)] whitespace-pre-wrap break-words">
      {text.split(/(\{\{[^}]+\}\})/g).map((part, i) => {
        const m = part.match(/^\{\{([^}]+)\}\}$/);
        if (m) {
          const v = vars[m[1].trim()];
          return (
            <span
              key={i}
              className="inline-block rounded px-1 font-semibold"
              style={{ backgroundColor: 'rgba(139,92,246,0.18)', color: '#c084fc', border: '1px solid rgba(139,92,246,0.35)', lineHeight: '1.6' }}
              title={v ? `${v.description}\nSource: ${v.source}` : part}
            >
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
}

// ─── Main editor component ────────────────────────────────────────────────────

export function AgentPromptEditor({ entry, onSave, onResetRequest }: AgentPromptEditorProps) {
  const [promptRole, setPromptRole] = useState<'system' | 'user'>('system');
  const [viewMode, setViewMode] = useState<'preview' | 'edit'>('preview');
  const [editSystem, setEditSystem] = useState(entry.systemPrompt);
  const [editUser, setEditUser] = useState(entry.userPrompt);
  const [dirty, setDirty] = useState(false);

  const editorRef = useRef<MonacoT.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof MonacoT | null>(null);
  const decoCollRef = useRef<MonacoT.editor.IEditorDecorationsCollection | null>(null);

  useEffect(() => { ensureVarDecorationStyle(); }, []);

  // Sync when scenario changes
  useEffect(() => {
    setEditSystem(entry.systemPrompt);
    setEditUser(entry.userPrompt);
    setPromptRole('system');
    setViewMode('preview');
    setDirty(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.scenario]);

  const currentEditText = promptRole === 'system' ? editSystem : editUser;

  const updateDecorations = useCallback((text: string) => {
    if (!decoCollRef.current || !monacoRef.current) return;
    decoCollRef.current.set(computeVarDecorations(text, monacoRef.current));
  }, []);

  const handleSave = useCallback(() => {
    onSave(entry.scenario, editSystem, editUser);
    setDirty(false);
  }, [entry.scenario, editSystem, editUser, onSave]);

  const insertVariable = useCallback((varStr: string) => {
    if (!editorRef.current) return;
    const sel = editorRef.current.getSelection();
    if (!sel) return;
    editorRef.current.executeEdits('insert-var', [{ range: sel, text: varStr, forceMoveMarkers: true }]);
    const newVal = editorRef.current.getValue();
    if (promptRole === 'system') setEditSystem(newVal);
    else setEditUser(newVal);
    setDirty(true);
    setViewMode('edit');
    updateDecorations(newVal);
  }, [promptRole, updateDecorations]);

  const allVars = useMemo((): ScenarioVarMap => {
    const both = editSystem + '\n' + editUser;
    const extra: ScenarioVarMap = {};
    const re = /\{\{([^}]+)\}\}/g;
    let m;
    while ((m = re.exec(both)) !== null) {
      const k = m[1].trim();
      if (!(k in entry.variables)) extra[k] = { description: 'Template variable', source: 'prompt text' };
    }
    return { ...entry.variables, ...extra };
  }, [entry.variables, editSystem, editUser]);

  const color = SCENARIO_COLORS[entry.scenario];

  return (
    <>
      {/* Header */}
      <div className="flex-shrink-0 flex items-start gap-3 px-4 py-3 border-b border-[var(--color-surface-border)]">
        <div className="w-[32px] h-[32px] rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: color }}>
          <span className="text-white text-[11px] font-bold">{SCENARIO_LABELS[entry.scenario].slice(0, 2)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">{entry.agentName || SCENARIO_LABELS[entry.scenario]}</p>
            {entry.isCustomized && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: `${color}22`, color }}>CUSTOM</span>
            )}
            {dirty && <span className="text-[9px] text-[var(--color-text-muted)]">● unsaved</span>}
          </div>
          <p className="text-[11px] text-[var(--color-text-muted)]">{SCENARIO_DESCRIPTIONS[entry.scenario]}</p>
          {entry.updatedAt && (
            <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Modified: {new Date(entry.updatedAt).toLocaleString()}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty}
            className="px-3 py-1 text-[11px] rounded-md cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-white transition-opacity"
            style={{ backgroundColor: ACCENT }}
          >
            Save
          </button>
          {entry.isCustomized && (
            <button
              type="button"
              onClick={() => onResetRequest(entry.scenario)}
              className="h-[26px] w-[26px] flex items-center justify-center rounded cursor-pointer hover:bg-[rgba(255,80,80,0.12)] transition-colors"
              title="Reset to built-in default"
            >
              <TrashIcon size={12} className="text-[var(--color-error)]" />
            </button>
          )}
        </div>
      </div>

      {/* Variable ribbon */}
      {Object.keys(allVars).length > 0 && (
        <div className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 border-b border-[var(--color-surface-border)] flex-wrap">
          <span className="text-[10px] text-[var(--color-text-muted)] flex-shrink-0">Variables — click to insert:</span>
          {Object.entries(allVars).map(([k, v]) => (
            <button
              key={k}
              type="button"
              onClick={() => insertVariable(`{{${k}}}`)}
              title={`${v.description}\nSource: ${v.source}\nClick to insert at cursor`}
              className="text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold cursor-pointer flex-shrink-0 transition-opacity hover:opacity-80"
              style={{ backgroundColor: 'rgba(139,92,246,0.15)', color: '#c084fc', border: '1px solid rgba(139,92,246,0.3)' }}
            >
              {`{{${k}}}`}
            </button>
          ))}
        </div>
      )}

      {/* Role + View tabs */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 border-b border-[var(--color-surface-border)]">
        <div className="flex items-center">
          {(['system', 'user'] as const).map(role => (
            <button
              key={role}
              type="button"
              onClick={() => { setPromptRole(role); updateDecorations(role === 'system' ? editSystem : editUser); }}
              className="px-3 py-2 text-[11px] cursor-pointer transition-colors border-b-2"
              style={{ borderColor: promptRole === role ? ACCENT : 'transparent', color: promptRole === role ? ACCENT : 'var(--color-text-muted)' }}
            >
              {role === 'system' ? '⚙ System' : '💬 User'}
            </button>
          ))}
        </div>
        <div className="flex items-center">
          {(['preview', 'edit'] as const).map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className="px-3 py-2 text-[11px] cursor-pointer transition-colors border-b-2"
              style={{ borderColor: viewMode === mode ? ACCENT : 'transparent', color: viewMode === mode ? ACCENT : 'var(--color-text-muted)' }}
            >
              {mode === 'preview' ? '👁 Preview' : '✏ Edit'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'preview' ? (
          <div className="h-full overflow-auto p-4 [scrollbar-gutter:stable]">
            <PromptPreview text={currentEditText} vars={allVars} />
          </div>
        ) : (
          <Editor
            key={`${entry.scenario}-${promptRole}`}
            height="100%"
            language="plaintext"
            theme="daakia-dark"
            value={currentEditText}
            onChange={val => {
              const v = val ?? '';
              if (promptRole === 'system') setEditSystem(v); else setEditUser(v);
              setDirty(true);
              updateDecorations(v);
            }}
            onMount={(editor, monaco) => {
              editorRef.current = editor as unknown as MonacoT.editor.IStandaloneCodeEditor;
              monacoRef.current = monaco as unknown as typeof MonacoT;
              decoCollRef.current = editor.createDecorationsCollection([]);
              decoCollRef.current.set(computeVarDecorations(currentEditText, monaco as unknown as typeof MonacoT));
            }}
            options={{
              fontSize: 12, wordWrap: 'on', lineNumbers: 'off', minimap: { enabled: false },
              scrollBeyondLastLine: false, padding: { top: 12, bottom: 12 },
              renderLineHighlight: 'none', overviewRulerLanes: 0,
              lineDecorationsWidth: 0, folding: false, glyphMargin: false,
            }}
          />
        )}
      </div>
    </>
  );
}
