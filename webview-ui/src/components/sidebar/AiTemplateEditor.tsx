/**
 * AiTemplateEditor — simple textarea editor for a single AI prompt template key.
 *
 * Used in PromptLibraryPanel for the "AI Actions" group entries.
 * Reads/writes directly from/to useAiPromptTemplatesStore.
 * Auto-persists to SQLite via the store's setTemplate action.
 */
import { useState, useEffect, useCallback } from 'react';
import { RefreshIcon, TrashIcon } from '../../icons';
import {
  useAiPromptTemplatesStore,
  AI_PROMPT_TEMPLATE_LABELS,
  AI_PROMPT_TEMPLATE_DEFAULTS,
  AI_PROMPT_TEMPLATE_VARIABLES,
  AI_TEMPLATE_COLORS,
  type AiPromptTemplateKey,
} from '../../store/prompt-template';

const ACCENT = 'var(--color-protocol-ai)';

interface AiTemplateEditorProps {
  templateKey: AiPromptTemplateKey;
}

export function AiTemplateEditor({ templateKey }: AiTemplateEditorProps) {
  const { templates, setTemplate, resetTemplate } = useAiPromptTemplatesStore();
  const { label, description } = AI_PROMPT_TEMPLATE_LABELS[templateKey];
  const defaultVal = AI_PROMPT_TEMPLATE_DEFAULTS[templateKey];
  const currentVal = templates[templateKey] ?? defaultVal;
  const isModified = currentVal !== defaultVal;
  const color = AI_TEMPLATE_COLORS[templateKey];
  const variables = AI_PROMPT_TEMPLATE_VARIABLES[templateKey];

  const [localValue, setLocalValue] = useState(currentVal);
  const [dirty, setDirty] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);

  // Reset local state when switching templates
  useEffect(() => {
    setLocalValue(templates[templateKey] ?? AI_PROMPT_TEMPLATE_DEFAULTS[templateKey]);
    setDirty(false);
    setResetConfirm(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateKey]);

  const handleSave = useCallback(() => {
    setTemplate(templateKey, localValue);
    setDirty(false);
  }, [templateKey, localValue, setTemplate]);

  const handleReset = useCallback(() => {
    resetTemplate(templateKey);
    setLocalValue(defaultVal);
    setDirty(false);
    setResetConfirm(false);
  }, [templateKey, defaultVal, resetTemplate]);

  return (
    <>
      {/* Header */}
      <div className="flex-shrink-0 flex items-start gap-3 px-4 py-3 border-b border-[var(--color-surface-border)]">
        <div
          className="w-[32px] h-[32px] rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 text-white text-[13px]"
          style={{ backgroundColor: color }}
        >
          ✦
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">{label}</p>
            {isModified && !dirty && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
                style={{ backgroundColor: `${color}22`, color }}
              >
                CUSTOM
              </span>
            )}
            {dirty && <span className="text-[9px] text-[var(--color-text-muted)]">● unsaved</span>}
          </div>
          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">{description}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
          {dirty && (
            <button
              type="button"
              onClick={handleSave}
              className="px-3 py-1 text-[11px] rounded-md cursor-pointer text-white transition-opacity"
              style={{ backgroundColor: ACCENT }}
            >
              Save
            </button>
          )}
          {isModified && !dirty && (
            <button
              type="button"
              onClick={() => setResetConfirm(true)}
              className="h-[26px] w-[26px] flex items-center justify-center rounded cursor-pointer hover:bg-[rgba(255,80,80,0.12)] transition-colors"
              title="Reset to built-in default"
            >
              <TrashIcon size={12} className="text-[var(--color-error)]" />
            </button>
          )}
        </div>
      </div>

      {/* Variable hints */}
      <div className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 border-b border-[var(--color-surface-border)] flex-wrap">
        <span className="text-[10px] text-[var(--color-text-muted)] flex-shrink-0">Available variables:</span>
        {variables.map(v => (
          <span
            key={v}
            className="text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold flex-shrink-0"
            style={{ backgroundColor: `${color}18`, color, border: `1px solid ${color}44` }}
          >
            {v}
          </span>
        ))}
      </div>

      {/* Textarea */}
      <div className="flex-1 overflow-auto p-4 [scrollbar-gutter:stable]">
        <textarea
          value={localValue}
          onChange={e => {
            setLocalValue(e.target.value);
            setDirty(e.target.value !== currentVal);
          }}
          onBlur={() => { if (dirty) handleSave(); }}
          spellCheck={false}
          className="w-full h-full rounded-md px-3 py-2.5 text-[12px] font-mono resize-none focus:outline-none"
          style={{
            backgroundColor: 'var(--color-input-bg)',
            border: `1px solid ${dirty ? `color-mix(in srgb, ${color} 40%, transparent)` : 'var(--color-input-border)'}`,
            color: 'var(--color-text-primary)',
            lineHeight: '1.65',
            minHeight: 300,
          }}
          placeholder={`Enter your prompt template here. Use {variable} placeholders for dynamic values.`}
        />

        {/* Auto-save note */}
        <p className="text-[10px] text-[var(--color-text-muted)] mt-2">
          Changes auto-save when you click away. Saved templates persist in your local database and override the built-in defaults.
        </p>
      </div>

      {/* Reset confirm */}
      {resetConfirm && (
        <div
          className="absolute inset-0 flex items-center justify-center z-20"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
        >
          <div
            className="rounded-xl border p-5 w-[340px] shadow-2xl"
            style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-surface-border)' }}
          >
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)] mb-1">Reset to Default</p>
            <p className="text-[11px] text-[var(--color-text-muted)] mb-4">
              Reset "{label}" to the built-in default? Your customization will be lost.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResetConfirm(false)}
                className="px-3 py-1.5 text-[11px] rounded-md cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="px-3 py-1.5 text-[11px] rounded-md cursor-pointer text-white flex items-center gap-1"
                style={{ backgroundColor: 'var(--color-error)' }}
              >
                <RefreshIcon size={10} />
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
