/**
 * PromptLibraryPanel — view, edit, and reset agent system prompts.
 * Task 4.1.8 — Prompt Library Panel
 *
 * Shows all prompts stored in prompt_library SQLite table.
 * Pre-populates with defaults from prompt-template constants on first load.
 * Each prompt can be edited inline or reset to default.
 */
import { useState, useEffect, useCallback } from 'react';
import { postMsg } from '../../vscode';
import { SparkleIcon, TrashIcon } from '../../icons';
import { ConfirmDialog } from '../shared';

const ACCENT = 'var(--color-protocol-ai)';

interface PromptEntry {
  scenario: string;
  system_prompt: string;
  user_prompt?: string;
  agent_name?: string;
  updated_at?: string;
}

// Built-in agent prompt scenarios shown in the library
const BUILTIN_SCENARIOS: { scenario: string; agent_name: string; description: string }[] = [
  { scenario: 'request',  agent_name: 'REST API Agent',    description: 'Builds HTTP requests from natural language' },
  { scenario: 'mock',     agent_name: 'Mock Server Agent', description: 'Designs mock API endpoints with realistic data' },
  { scenario: 'test',     agent_name: 'Test Script Agent', description: 'Generates dk.* test assertions' },
  { scenario: 'curl',     agent_name: 'cURL Agent',        description: 'Converts cURL commands to structured requests' },
  { scenario: 'explain',  agent_name: 'Knowledge Agent',   description: 'Explains HTTP/API concepts' },
  { scenario: 'general',  agent_name: 'General Assistant', description: 'Fallback conversational assistant' },
];

// ─── Prompt Editor Card ───

function PromptCard({ entry, onSave, onReset }: {
  entry: PromptEntry & { description?: string };
  onSave: (scenario: string, prompt: string) => void;
  onReset: (scenario: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.system_prompt);
  const [resetConfirm, setResetConfirm] = useState(false);
  const isCustomized = !!entry.updated_at;

  const handleSave = useCallback(() => {
    onSave(entry.scenario, draft);
    setEditing(false);
  }, [entry.scenario, draft, onSave]);

  const handleCancel = useCallback(() => {
    setDraft(entry.system_prompt);
    setEditing(false);
  }, [entry.system_prompt]);

  return (
    <div className="border border-[rgba(255,255,255,0.08)] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[rgba(255,255,255,0.02)]">
        <SparkleIcon size={13} style={{ color: ACCENT }} />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium text-[var(--color-text-primary)]">{entry.agent_name || entry.scenario}</p>
          {entry.description && <p className="text-[10px] text-[var(--color-text-muted)]">{entry.description}</p>}
        </div>
        {isCustomized && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'color-mix(in srgb, var(--color-protocol-ai) 12%, transparent)', color: ACCENT }}>
            CUSTOM
          </span>
        )}
        <div className="flex items-center gap-1">
          {!editing && (
            <button type="button" onClick={() => setEditing(true)} className="text-[11px] px-2 py-0.5 rounded cursor-pointer transition-colors" style={{ color: ACCENT }}>
              Edit
            </button>
          )}
          {isCustomized && !editing && (
            <button type="button" onClick={() => setResetConfirm(true)} className="h-[22px] w-[22px] flex items-center justify-center rounded cursor-pointer hover:bg-[rgba(255,80,80,0.12)] transition-colors" title="Reset to default">
              <TrashIcon size={11} className="text-[var(--color-error)]" />
            </button>
          )}
        </div>
      </div>

      {/* Prompt content */}
      <div className="px-3 py-2">
        {editing ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={8}
              className="w-full bg-[rgba(0,0,0,0.2)] border border-[rgba(255,255,255,0.10)] rounded-md p-2 text-[12px] font-mono text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-protocol-ai)] resize-y"
              spellCheck={false}
            />
            <div className="flex gap-2">
              <button type="button" onClick={handleSave} className="px-3 py-1 text-[11px] rounded-md cursor-pointer text-white" style={{ backgroundColor: ACCENT }}>Save</button>
              <button type="button" onClick={handleCancel} className="px-3 py-1 text-[11px] rounded-md cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">Cancel</button>
            </div>
          </div>
        ) : (
          <pre className="text-[11px] font-mono text-[var(--color-text-muted)] whitespace-pre-wrap max-h-[120px] overflow-auto leading-relaxed">
            {entry.system_prompt.slice(0, 400)}{entry.system_prompt.length > 400 ? '\n...' : ''}
          </pre>
        )}
      </div>

      {resetConfirm && (
        <ConfirmDialog
          title="Reset to Default"
          message={`Reset "${entry.agent_name || entry.scenario}" prompt to the built-in default? Your customization will be lost.`}
          confirmLabel="Reset"
          danger
          onConfirm={() => { onReset(entry.scenario); setResetConfirm(false); }}
          onCancel={() => setResetConfirm(false)}
        />
      )}
    </div>
  );
}

// ─── Main Panel ───

export function PromptLibraryPanel() {
  const [prompts, setPrompts] = useState<PromptEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load prompts from extension host
    postMsg({ type: 'promptLibrary:load' });

    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.type === 'promptLibrary:data') {
        setPrompts(msg.prompts || []);
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleSave = useCallback((scenario: string, systemPrompt: string) => {
    postMsg({ type: 'promptLibrary:save', scenario, prompt: { scenario, system_prompt: systemPrompt } });
    setPrompts(prev => {
      const idx = prev.findIndex(p => p.scenario === scenario);
      const updated = { scenario, system_prompt: systemPrompt, updated_at: new Date().toISOString() };
      return idx >= 0 ? prev.map((p, i) => i === idx ? { ...p, ...updated } : p) : [...prev, updated];
    });
  }, []);

  const handleReset = useCallback((scenario: string) => {
    postMsg({ type: 'promptLibrary:reset', scenario });
    setPrompts(prev => prev.filter(p => p.scenario !== scenario));
  }, []);

  // Merge stored prompts with builtin scenarios
  const displayEntries = BUILTIN_SCENARIOS.map(b => {
    const stored = prompts.find(p => p.scenario === b.scenario);
    return {
      scenario: b.scenario,
      agent_name: b.agent_name,
      description: b.description,
      system_prompt: stored?.system_prompt || `(Using built-in default — click Edit to customize)`,
      updated_at: stored?.updated_at,
    };
  });

  // Custom prompts not in builtin list
  const customOnly = prompts.filter(p => !BUILTIN_SCENARIOS.find(b => b.scenario === p.scenario));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-0 px-4 pt-3 pb-0 border-b border-[var(--color-surface-border)]">
        <span className="px-3 py-2 text-[12px] border-b-2 font-medium" style={{ borderColor: ACCENT, color: ACCENT }}>
          Prompt Library
        </span>
      </div>

      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] p-4">
        <div className="flex flex-col gap-4 max-w-[700px]">
          <div>
            <p className="text-[13px] font-medium text-[var(--color-text-primary)]">Agent System Prompts</p>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
              Customize the system prompt for each AI agent. Changes are saved to your local database and override the built-in defaults.
            </p>
          </div>

          {loading ? (
            <p className="text-[12px] text-[var(--color-text-muted)] py-4">Loading prompts...</p>
          ) : (
            <div className="flex flex-col gap-3">
              {displayEntries.map(entry => (
                <PromptCard key={entry.scenario} entry={entry} onSave={handleSave} onReset={handleReset} />
              ))}
              {customOnly.map(entry => (
                <PromptCard key={entry.scenario} entry={{ ...entry, description: 'Custom scenario' }} onSave={handleSave} onReset={handleReset} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
