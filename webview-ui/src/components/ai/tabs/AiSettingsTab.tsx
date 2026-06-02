import { useCallback, useState } from 'react';
import { useTabsStore } from '../../../store/tabs-store';
import { StyledDropdown, type DropdownOption } from '../../shared';

const TEMPERATURE_OPTIONS: DropdownOption[] = [
  { value: '0', label: '0 — Deterministic' },
  { value: '0.3', label: '0.3 — Focused' },
  { value: '0.7', label: '0.7 — Balanced' },
  { value: '1.0', label: '1.0 — Creative' },
  { value: '1.5', label: '1.5 — Very Creative' },
  { value: '2.0', label: '2.0 — Maximum' },
];

const RESPONSE_FORMAT_OPTIONS: DropdownOption[] = [
  { value: 'text', label: 'Text (default)' },
  { value: 'json_object', label: 'JSON Object' },
];

/**
 * AiSettingsTab — Model parameters: temperature, max tokens, top_p, frequency/presence penalty, stream toggle.
 */
export function AiSettingsTab() {
  const activeTab = useTabsStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useTabsStore(s => s.updateTab);

  const settings = activeTab?.aiSettings || {};
  const temperature = settings.temperature ?? 0.7;
  const maxTokens = settings.maxTokens ?? 4096;
  const topP = settings.topP ?? 1;
  const frequencyPenalty = settings.frequencyPenalty ?? 0;
  const presencePenalty = settings.presencePenalty ?? 0;
  const stream = settings.stream !== false;
  const stopSequences = settings.stopSequences ?? [];
  const seed = settings.seed;
  const responseFormat = settings.responseFormat ?? 'text';
  const [stopInput, setStopInput] = useState('');

  const updateSetting = useCallback((key: string, value: number | boolean) => {
    if (!activeTab) return;
    updateTab(activeTab.id, {
      aiSettings: { ...settings, [key]: value },
      dirty: true,
    });
  }, [activeTab, updateTab, settings]);

  if (!activeTab) return null;

  return (
    <div className="flex flex-col px-4 py-3 gap-2.5 overflow-auto">
      {/* Temperature */}
      <div className="flex items-center">
        <span className="text-[12px] text-[var(--color-text-muted)] w-[130px] flex-shrink-0">Temperature</span>
        <div className="flex items-center gap-2">
          <div className="w-[150px]">
            <StyledDropdown
              options={TEMPERATURE_OPTIONS}
              value={String(temperature)}
              onChange={(v) => updateSetting('temperature', parseFloat(v))}
              size="sm"
            />
          </div>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={temperature}
            onChange={(e) => updateSetting('temperature', parseFloat(e.target.value))}
            className="w-[120px]"
          />
          <span className="text-[11px] font-mono text-[var(--color-text-muted)]">{temperature}</span>
        </div>
      </div>

      {/* Max Tokens */}
      <div className="flex items-center">
        <span className="text-[12px] text-[var(--color-text-muted)] w-[130px] flex-shrink-0">Max Tokens</span>
        <input
          type="number"
          value={maxTokens}
          onChange={(e) => updateSetting('maxTokens', parseInt(e.target.value) || 4096)}
          min={1}
          max={128000}
          className="w-[120px] h-[28px] px-2.5 text-[12px] rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] font-mono text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
        />
      </div>

      {/* Top P */}
      <div className="flex items-center">
        <span className="text-[12px] text-[var(--color-text-muted)] w-[130px] flex-shrink-0">Top P</span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={topP}
            onChange={(e) => updateSetting('topP', parseFloat(e.target.value) || 1)}
            min={0}
            max={1}
            step={0.05}
            className="w-[80px] h-[28px] px-2.5 text-[12px] rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] font-mono text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
          />
          <span className="text-[11px] text-[var(--color-text-muted)]">0 to 1</span>
        </div>
      </div>

      {/* Frequency Penalty */}
      <div className="flex items-center">
        <span className="text-[12px] text-[var(--color-text-muted)] w-[130px] flex-shrink-0">Frequency Penalty</span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={frequencyPenalty}
            onChange={(e) => updateSetting('frequencyPenalty', parseFloat(e.target.value) || 0)}
            min={-2}
            max={2}
            step={0.1}
            className="w-[80px] h-[28px] px-2.5 text-[12px] rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] font-mono text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
          />
          <span className="text-[11px] text-[var(--color-text-muted)]">-2 to 2</span>
        </div>
      </div>

      {/* Presence Penalty */}
      <div className="flex items-center">
        <span className="text-[12px] text-[var(--color-text-muted)] w-[130px] flex-shrink-0">Presence Penalty</span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={presencePenalty}
            onChange={(e) => updateSetting('presencePenalty', parseFloat(e.target.value) || 0)}
            min={-2}
            max={2}
            step={0.1}
            className="w-[80px] h-[28px] px-2.5 text-[12px] rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] font-mono text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
          />
          <span className="text-[11px] text-[var(--color-text-muted)]">-2 to 2</span>
        </div>
      </div>

      {/* Stream toggle */}
      <div className="flex items-center">
        <span className="text-[12px] text-[var(--color-text-muted)] w-[130px] flex-shrink-0">Stream Response</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => updateSetting('stream', !stream)}
            className={`w-[34px] h-[18px] rounded-full relative transition-colors cursor-pointer ${stream ? 'bg-[var(--color-protocol-ai)]' : 'bg-[var(--color-surface-border)]'}`}
          >
            <div
              className="w-[14px] h-[14px] rounded-full bg-white absolute top-[2px] transition-transform"
              style={{ transform: stream ? 'translateX(18px)' : 'translateX(2px)' }}
            />
          </button>
          <span className="text-[11px] text-[var(--color-text-muted)]">
            {stream ? 'Real-time streaming' : 'Wait for full response'}
          </span>
        </div>
      </div>

      {/* Response Format */}
      <div className="flex items-center">
        <span className="text-[12px] text-[var(--color-text-muted)] w-[130px] flex-shrink-0">Response Format</span>
        <div className="w-[150px]">
          <StyledDropdown
            options={RESPONSE_FORMAT_OPTIONS}
            value={responseFormat}
            onChange={(v) => updateSetting('responseFormat', v)}
            size="sm"
          />
        </div>
      </div>

      {/* Seed */}
      <div className="flex items-center">
        <span className="text-[12px] text-[var(--color-text-muted)] w-[130px] flex-shrink-0">Seed</span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={seed ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              if (!activeTab) return;
              updateTab(activeTab.id, {
                aiSettings: { ...settings, seed: val === '' ? undefined : parseInt(val) },
                dirty: true,
              });
            }}
            placeholder="Optional"
            className="w-[120px] h-[28px] px-2.5 text-[12px] rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] font-mono text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
          />
          <span className="text-[11px] text-[var(--color-text-muted)]">Deterministic (if supported)</span>
        </div>
      </div>

      {/* Stop Sequences */}
      <div className="flex items-start">
        <span className="text-[12px] text-[var(--color-text-muted)] w-[130px] flex-shrink-0 pt-1">Stop Sequences</span>
        <div className="flex flex-col gap-1.5">
          <input
            type="text"
            value={stopInput}
            onChange={(e) => setStopInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && stopInput.trim()) {
                if (!activeTab) return;
                const updated = [...stopSequences, stopInput.trim()];
                updateTab(activeTab.id, { aiSettings: { ...settings, stopSequences: updated }, dirty: true });
                setStopInput('');
              }
            }}
            placeholder="Type and press Enter"
            className="w-[200px] h-[28px] px-2.5 text-[12px] rounded-md bg-[var(--color-input-bg)] border border-[var(--color-input-border)] font-mono text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
          />
          {stopSequences.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {stopSequences.map((seq, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--color-surface-hover)] text-[11px] font-mono text-[var(--color-text-secondary)]"
                >
                  {seq.replace(/\n/g, '\\n')}
                  <button
                    type="button"
                    onClick={() => {
                      if (!activeTab) return;
                      const updated = stopSequences.filter((_, idx) => idx !== i);
                      updateTab(activeTab.id, { aiSettings: { ...settings, stopSequences: updated }, dirty: true });
                    }}
                    className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)] cursor-pointer ml-0.5"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
