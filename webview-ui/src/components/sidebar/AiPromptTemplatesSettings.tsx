/**
 * AiPromptTemplatesSettings — view and edit AI prompt templates.
 *
 * Shows all prompt templates (Ask AI Why, Generate With AI per protocol).
 * Users can edit the template text and reset to defaults.
 * Changes are persisted to SQLite via the extension host.
 *
 * E6.83 — AI prompt templates in settings
 */
import { useEffect, useState } from 'react';
import {
  useAiPromptTemplatesStore,
  AI_PROMPT_TEMPLATE_LABELS,
  AI_PROMPT_TEMPLATE_DEFAULTS,
  type AiPromptTemplateKey,
} from '../../store/ai-prompt-templates-store';
import { SparkleIcon, RefreshIcon } from '../../icons';

const ACCENT = 'var(--color-protocol-ai)';

function TemplateRow({ templateKey }: { templateKey: AiPromptTemplateKey }) {
  const { templates, setTemplate, resetTemplate } = useAiPromptTemplatesStore();
  const { label, description } = AI_PROMPT_TEMPLATE_LABELS[templateKey];
  const currentValue = templates[templateKey] ?? AI_PROMPT_TEMPLATE_DEFAULTS[templateKey] ?? '';
  const isModified = currentValue !== AI_PROMPT_TEMPLATE_DEFAULTS[templateKey];

  const [localValue, setLocalValue] = useState(currentValue);
  const [dirty, setDirty] = useState(false);

  // Sync from store when it changes externally
  useEffect(() => {
    setLocalValue(currentValue);
    setDirty(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentValue]);

  const handleSave = () => {
    setTemplate(templateKey, localValue);
    setDirty(false);
  };

  const handleReset = () => {
    resetTemplate(templateKey);
    setLocalValue(AI_PROMPT_TEMPLATE_DEFAULTS[templateKey]);
    setDirty(false);
  };

  return (
    <div className="flex flex-col gap-2 py-3 border-b border-[rgba(255,255,255,0.06)] last:border-b-0">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <SparkleIcon size={10} style={{ color: ACCENT }} />
            <span className="text-[12px] font-medium" style={{ color: 'var(--color-text-primary)' }}>{label}</span>
            {isModified && (
              <span
                className="text-[9px] px-1.5 py-px rounded-full font-medium"
                style={{
                  background: `color-mix(in srgb, ${ACCENT} 15%, transparent)`,
                  color: ACCENT,
                  border: `1px solid color-mix(in srgb, ${ACCENT} 30%, transparent)`,
                }}
              >
                Modified
              </span>
            )}
          </div>
          <p className="text-[10.5px] mt-0.5 pl-[17px]" style={{ color: 'var(--color-text-muted)' }}>{description}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isModified && (
            <button
              type="button"
              onClick={handleReset}
              title="Reset to default"
              className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded cursor-pointer transition-colors"
              style={{ color: 'var(--color-text-muted)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--color-text-primary)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-muted)'}
            >
              <RefreshIcon size={10} />
              Reset
            </button>
          )}
          {dirty && (
            <button
              type="button"
              onClick={handleSave}
              className="text-[10px] px-2 py-0.5 rounded cursor-pointer transition-colors"
              style={{
                backgroundColor: `color-mix(in srgb, ${ACCENT} 15%, transparent)`,
                color: ACCENT,
                border: `1px solid color-mix(in srgb, ${ACCENT} 30%, transparent)`,
              }}
            >
              Save
            </button>
          )}
        </div>
      </div>

      {/* Textarea */}
      <textarea
        value={localValue}
        onChange={e => { setLocalValue(e.target.value); setDirty(e.target.value !== currentValue); }}
        rows={5}
        spellCheck={false}
        className="w-full rounded-md px-2.5 py-2 text-[11px] font-mono resize-y focus:outline-none"
        style={{
          backgroundColor: 'var(--color-input-bg)',
          border: `1px solid ${dirty ? `color-mix(in srgb, ${ACCENT} 40%, transparent)` : 'var(--color-input-border)'}`,
          color: 'var(--color-text-primary)',
          lineHeight: '1.6',
          minHeight: 90,
          maxHeight: 280,
        }}
        onBlur={() => { if (dirty) handleSave(); }}
      />

      {/* Variables hint */}
      <p className="text-[9.5px]" style={{ color: 'var(--color-text-muted)' }}>
        Available variables:&nbsp;
        <code className="font-mono" style={{ color: ACCENT }}>
          {'{serverName}'} {'{context}'} {'{method}'} {'{url}'} {'{status}'} {'{statusText}'} {'{body}'}
        </code>
      </p>
    </div>
  );
}

export function AiPromptTemplatesSettings() {
  const { loadTemplates } = useAiPromptTemplatesStore();

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const templateKeys = Object.keys(AI_PROMPT_TEMPLATE_LABELS) as AiPromptTemplateKey[];

  // Group: Ask AI Why first, then mock generate by protocol
  const [askWhy, ...mockKeys] = templateKeys;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-[var(--color-surface-border)] pt-3">
        <div className="flex items-center gap-0 px-5">
          <span
            className="px-3 py-2 text-[12px] border-b-2 font-medium"
            style={{ borderColor: ACCENT, color: ACCENT }}
          >
            AI Templates
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-5 py-4">
        <div className="flex flex-col gap-5">
          <div>
            <p className="text-[13px] font-medium" style={{ color: 'var(--color-text-primary)' }}>Prompt Templates</p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              Customize the prompts sent to your AI provider for each action.
              Templates auto-save when you click outside. Use{' '}
              <code className="font-mono text-[10px]" style={{ color: ACCENT }}>{'{variable}'}</code>{' '}
              syntax for dynamic values.
            </p>
          </div>

          {/* Ask AI Why */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--color-text-muted)' }}>
              Response Errors
            </p>
            <div className="rounded-lg border px-3 py-1" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              <TemplateRow templateKey={askWhy} />
            </div>
          </div>

          {/* Mock server generate */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--color-text-muted)' }}>
              Mock Server — Generate With AI
            </p>
            <div className="rounded-lg border px-3 py-1" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              {mockKeys.map(key => <TemplateRow key={key} templateKey={key} />)}
            </div>
          </div>

          {/* Info box */}
          <div
            className="p-3 rounded-md border text-[11px]"
            style={{
              backgroundColor: `color-mix(in srgb, ${ACCENT} 6%, transparent)`,
              borderColor: `color-mix(in srgb, ${ACCENT} 15%, transparent)`,
              color: 'var(--color-text-muted)',
            }}
          >
            <p className="font-medium mb-1" style={{ color: ACCENT }}>Tip</p>
            <p>
              Templates are sent as the user message to your configured AI provider.
              The system prompt instructs the AI to act as a mock API generator assistant.
              Longer, more detailed templates produce better results.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
