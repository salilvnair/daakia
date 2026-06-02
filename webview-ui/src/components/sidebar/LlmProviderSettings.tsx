/**
 * LlmProviderSettings — Settings panel for managing AI providers and models.
 * Parent-child UI: each provider expands to show its models.
 * Toggle on/off, add, remove, edit name/value for both providers and models.
 */
import { useState, useCallback } from 'react';
import { useAiProvidersStore, type AiProviderConfig, type AiModelConfig } from '../../store/ai-providers-store';
import { PlusIcon, TrashIcon, ChevronDownIcon, ChevronRightIcon } from '../../icons';
import { ConfirmDialog } from '../shared';

// Accent color for AI protocol
const ACCENT = 'var(--color-protocol-ai)';

// ────────── Inline Toggle (compact) ──────────

function MiniToggle({ value, onChange, accent }: { value: boolean; onChange: (v: boolean) => void; accent?: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="w-[36px] h-[20px] rounded-full cursor-pointer transition-colors flex-shrink-0 relative"
      style={{ backgroundColor: value ? (accent || ACCENT) : 'rgba(255,255,255,0.15)' }}
      title={value ? 'Enabled — click to disable' : 'Disabled — click to enable'}
    >
      <span
        className="absolute top-[3px] w-[14px] h-[14px] rounded-full bg-white transition-transform"
        style={{ left: value ? '19px' : '3px' }}
      />
    </button>
  );
}

// ────────── Inline editable text ──────────

function InlineEdit({ value, onChange, placeholder, className }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1 text-[12px] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-protocol-ai)] transition-colors ${className || ''}`}
    />
  );
}

// ────────── Model Row ──────────

function ModelRow({ model, providerId, onDelete }: {
  model: AiModelConfig;
  providerId: string;
  onDelete: () => void;
}) {
  const { updateModel, toggleModel } = useAiProvidersStore();

  return (
    <div className="flex items-center gap-2 py-1 group">
      <div className="w-[14px]" /> {/* indent spacer */}
      <MiniToggle value={model.enabled} onChange={() => toggleModel(providerId, model.id)} />
      <InlineEdit
        value={model.name}
        onChange={v => updateModel(providerId, model.id, { name: v })}
        placeholder="Display name"
        className="w-[140px] h-[26px]"
      />
      <InlineEdit
        value={model.id}
        onChange={v => updateModel(providerId, model.id, { id: v })}
        placeholder="model-id"
        className="flex-1 h-[26px] font-mono text-[11px]"
      />
      <button
        type="button"
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer p-1 rounded hover:bg-[rgba(255,80,80,0.12)]"
        title="Delete model"
      >
        <TrashIcon size={12} className="text-[var(--color-error)]" />
      </button>
    </div>
  );
}

// ────────── Provider Card ──────────

function ProviderCard({ provider }: { provider: AiProviderConfig }) {
  const { updateProvider, toggleProvider, removeProvider, addModel, removeModel } = useAiProvidersStore();
  const [expanded, setExpanded] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'provider' | 'model'; modelId?: string } | null>(null);

  const handleAddModel = useCallback(() => {
    const newId = `new-model-${Date.now()}`;
    addModel(provider.id, { id: newId, name: 'New Model', enabled: true });
    setExpanded(true);
  }, [provider.id, addModel]);

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'provider') {
      removeProvider(provider.id);
    } else if (deleteTarget.modelId) {
      removeModel(provider.id, deleteTarget.modelId);
    }
    setDeleteTarget(null);
  }, [deleteTarget, provider.id, removeProvider, removeModel]);

  return (
    <div className="border border-[rgba(255,255,255,0.08)] rounded-lg overflow-hidden">
      {/* Provider header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[rgba(255,255,255,0.03)] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded
          ? <ChevronDownIcon size={12} className="text-[var(--color-text-muted)] flex-shrink-0" />
          : <ChevronRightIcon size={12} className="text-[var(--color-text-muted)] flex-shrink-0" />
        }

        {/* Toggle — stop propagation so click doesn't toggle expand */}
        <div onClick={e => e.stopPropagation()}>
          <MiniToggle value={provider.enabled} onChange={() => toggleProvider(provider.id)} />
        </div>

        <InlineEdit
          value={provider.name}
          onChange={v => updateProvider(provider.id, { name: v })}
          placeholder="Provider name"
          className="w-[130px] h-[26px] font-medium"
        />
        <InlineEdit
          value={provider.id}
          onChange={v => updateProvider(provider.id, { id: v })}
          placeholder="provider-id"
          className="w-[100px] h-[26px] font-mono text-[11px]"
        />
        <InlineEdit
          value={provider.baseUrl}
          onChange={v => updateProvider(provider.id, { baseUrl: v })}
          placeholder="https://api.example.com/v1"
          className="flex-1 h-[26px] font-mono text-[11px]"
        />

        <span className="text-[10px] text-[var(--color-text-muted)] flex-shrink-0 ml-1">
          {provider.models.length} model{provider.models.length !== 1 ? 's' : ''}
        </span>

        {/* Delete provider */}
        <button
          type="button"
          onClick={e => { e.stopPropagation(); setDeleteTarget({ type: 'provider' }); }}
          className="opacity-60 hover:opacity-100 transition-opacity cursor-pointer p-1 rounded hover:bg-[rgba(255,80,80,0.12)]"
          title="Delete provider"
        >
          <TrashIcon size={12} className="text-[var(--color-error)]" />
        </button>
      </div>

      {/* Models list */}
      {expanded && (
        <div className="border-t border-[rgba(255,255,255,0.06)] bg-[rgba(0,0,0,0.15)] px-3 py-1.5">
          {/* Models header */}
          <div className="flex items-center gap-2 mb-1">
            <div className="w-[14px]" />
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] flex-1">Models</span>
            <button
              type="button"
              onClick={handleAddModel}
              className="flex items-center gap-1 text-[11px] cursor-pointer px-2 py-0.5 rounded-md transition-colors hover:bg-[rgba(255,255,255,0.06)]"
              style={{ color: ACCENT }}
            >
              <PlusIcon size={11} />
              <span>Add</span>
            </button>
          </div>

          {provider.models.length === 0 ? (
            <p className="text-[11px] text-[var(--color-text-muted)] py-2 pl-[14px] italic">
              No models configured. Click "Add" to add one.
            </p>
          ) : (
            provider.models.map(m => (
              <ModelRow
                key={m.id}
                model={m}
                providerId={provider.id}
                onDelete={() => setDeleteTarget({ type: 'model', modelId: m.id })}
              />
            ))
          )}
        </div>
      )}

      {/* Confirm dialog */}
      {deleteTarget && (
        <ConfirmDialog
          title={deleteTarget.type === 'provider' ? 'Delete Provider' : 'Delete Model'}
          message={
            deleteTarget.type === 'provider'
              ? `Delete "${provider.name}" and all its models? This cannot be undone.`
              : `Delete this model? This cannot be undone.`
          }
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ────────── Main Component ──────────

export function LlmProviderSettings() {
  const { providers, loaded, addProvider, seedDefaults } = useAiProvidersStore();
  const [resetConfirm, setResetConfirm] = useState(false);

  const handleAddProvider = useCallback(() => {
    const id = `custom-${Date.now()}`;
    addProvider({
      id,
      name: 'New Provider',
      baseUrl: '',
      enabled: true,
      models: [],
    });
  }, [addProvider]);

  const handleReset = useCallback(() => {
    seedDefaults();
    setResetConfirm(false);
  }, [seedDefaults]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-0 px-4 pt-3 pb-0 border-b border-[var(--color-surface-border)]">
        <span
          className="px-3 py-2 text-[12px] border-b-2 font-medium"
          style={{ borderColor: ACCENT, color: ACCENT }}
        >
          Providers &amp; Models
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] p-4">
        <div className="flex flex-col gap-4 max-w-[680px]">
          {/* Description */}
          <div>
            <p className="text-[13px] font-medium text-[var(--color-text-primary)]">AI Providers</p>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
              Configure which AI providers and models appear in the AI tab. Toggle providers and models on/off, or add custom ones.
            </p>
          </div>

          {/* Action bar */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAddProvider}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-md cursor-pointer transition-colors hover:opacity-90 text-white"
              style={{ backgroundColor: ACCENT }}
            >
              <PlusIcon size={12} />
              <span>Add Provider</span>
            </button>
            <button
              type="button"
              onClick={() => setResetConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-md cursor-pointer transition-colors border border-[rgba(255,255,255,0.12)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.04)]"
            >
              Reset to Defaults
            </button>
          </div>

          {/* Provider list */}
          {!loaded ? (
            <p className="text-[12px] text-[var(--color-text-muted)] py-4">Loading providers...</p>
          ) : providers.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-[12px] text-[var(--color-text-muted)]">No providers configured.</p>
              <button
                type="button"
                onClick={handleAddProvider}
                className="mt-2 text-[12px] cursor-pointer"
                style={{ color: ACCENT }}
              >
                Add your first provider
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {providers.map(p => <ProviderCard key={p.id} provider={p} />)}
            </div>
          )}

          {/* Info box */}
          <div className="p-3 rounded-md border" style={{ backgroundColor: 'rgba(139,92,246,0.06)', borderColor: 'rgba(139,92,246,0.15)' }}>
            <p className="text-[12px] font-medium mb-1" style={{ color: ACCENT }}>How it works</p>
            <ul className="text-[11px] text-[var(--color-text-muted)] space-y-1">
              <li>• Disabled providers and models are hidden from the AI tab dropdowns</li>
              <li>• The "Name" field is what you see in the UI; the "ID" field is sent to the API</li>
              <li>• Base URL is auto-filled when you select a provider in the AI tab</li>
              <li>• Add custom providers for OpenAI-compatible APIs (Ollama, LM Studio, vLLM, etc.)</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Reset confirm dialog */}
      {resetConfirm && (
        <ConfirmDialog
          title="Reset to Defaults"
          message="This will replace all your custom provider and model settings with the built-in defaults. Any custom providers will be lost."
          confirmLabel="Reset"
          danger
          onConfirm={handleReset}
          onCancel={() => setResetConfirm(false)}
        />
      )}
    </div>
  );
}
