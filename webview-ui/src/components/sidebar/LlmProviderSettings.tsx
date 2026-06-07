/**
 * LlmProviderSettings — AI provider configuration panel.
 * Tasks 4.1.6 (model selection UI), 4.1.10 (custom provider + API key management)
 *
 * Features:
 * - Toggle providers + models on/off (existing)
 * - Model pill-badge view showing enabled models per provider
 * - API key management: save/delete per provider (stored securely in SQLite)
 * - Custom provider form with endpoint URL, API key, model name, custom headers
 */
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAiProvidersStore, type AiProviderConfig, type AiModelConfig } from '../../store/ai-providers-store';
import { useAiKeysStore } from '../../store/ai-keys-store';
import {
  PlusIcon, TrashIcon, ChevronDownIcon, ChevronRightIcon, KeyIcon, CopilotBrandIcon,
  RadioSelectIcon, CheckIcon,
  OpenAiProviderIcon, AnthropicProviderIcon, GeminiProviderIcon, DeepSeekProviderIcon,
  GrokProviderIcon, GroqProviderIcon, TogetherProviderIcon, MistralProviderIcon,
  OllamaProviderIcon, AzureOpenAiProviderIcon, DaakiaMockProviderIcon,
} from '../../icons';
import { PROVIDER_BRAND_COLORS } from '../../colors/daakia-colors';
import { ConfirmDialog } from '../shared';
import { postMsg } from '../../vscode';
import { AI_PROVIDERS } from '../ai/ai-providers';

const ACCENT = 'var(--color-protocol-ai)';

// ─── Provider brand meta — icon + accent color keyed by provider ID ───────────
type BrandIconProps = { size?: number };
type BrandMeta = { color: string; Icon: (props: BrandIconProps) => JSX.Element };

const PROVIDER_BRAND_META: Record<string, BrandMeta> = {
  openai:         { color: PROVIDER_BRAND_COLORS.openai,         Icon: OpenAiProviderIcon },
  anthropic:      { color: PROVIDER_BRAND_COLORS.anthropic,      Icon: AnthropicProviderIcon },
  google:         { color: PROVIDER_BRAND_COLORS.google,         Icon: GeminiProviderIcon },
  deepseek:       { color: PROVIDER_BRAND_COLORS.deepseek,       Icon: DeepSeekProviderIcon },
  xai:            { color: PROVIDER_BRAND_COLORS.xai,            Icon: GrokProviderIcon },
  groq:           { color: PROVIDER_BRAND_COLORS.groq,           Icon: GroqProviderIcon },
  together:       { color: PROVIDER_BRAND_COLORS.together,       Icon: TogetherProviderIcon },
  mistral:        { color: PROVIDER_BRAND_COLORS.mistral,        Icon: MistralProviderIcon },
  ollama:         { color: PROVIDER_BRAND_COLORS.ollama,         Icon: OllamaProviderIcon },
  'azure-openai': { color: PROVIDER_BRAND_COLORS['azure-openai'], Icon: AzureOpenAiProviderIcon },
};

// ────────── Reusable sub-components ──────────

function MiniToggle({ value, onChange, accent }: { value: boolean; onChange: (v: boolean) => void; accent?: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="w-[36px] h-[20px] rounded-full cursor-pointer transition-colors flex-shrink-0 relative"
      style={{ backgroundColor: value ? (accent || ACCENT) : 'rgba(255,255,255,0.15)' }}
      title={value ? 'Enabled — click to disable' : 'Disabled — click to enable'}
    >
      <span className="absolute top-[3px] w-[14px] h-[14px] rounded-full bg-white transition-transform" style={{ left: value ? '19px' : '3px' }} />
    </button>
  );
}

function InlineEdit({ value, onChange, placeholder, className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
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

// ────────── API Key Manager ──────────

function ApiKeyManager({ providerId }: { providerId: string }) {
  const { hasKey, saveKey, deleteKey } = useAiKeysStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const stored = hasKey(providerId);

  const handleSave = () => {
    if (draft.trim()) {
      saveKey(providerId, draft.trim());
      setDraft('');
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 mt-2">
        <input
          type="password"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
          placeholder="Paste API key..."
          autoFocus
          className="flex-1 h-[26px] bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-md px-2 text-[11px] focus:outline-none focus:border-[var(--color-protocol-ai)] font-mono"
        />
        <button type="button" onClick={handleSave} className="px-2 py-1 text-[11px] rounded-md cursor-pointer text-white" style={{ backgroundColor: ACCENT }}>Save</button>
        <button type="button" onClick={() => { setEditing(false); setDraft(''); }} className="px-2 py-1 text-[11px] rounded-md cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">Cancel</button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 mt-2">
      <KeyIcon size={12} style={{ color: stored ? ACCENT : 'var(--color-text-muted)' }} />
      {stored ? (
        <>
          <span className="text-[11px] text-[var(--color-text-muted)]">API key stored</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: 'color-mix(in srgb, var(--color-protocol-ai) 10%, transparent)', color: ACCENT }}>••••••••</span>
          <button type="button" onClick={() => setEditing(true)} className="text-[11px] cursor-pointer ml-1" style={{ color: ACCENT }}>Update</button>
          <button type="button" onClick={() => setConfirmDelete(true)} className="text-[11px] cursor-pointer text-[var(--color-error)] ml-1">Remove</button>
        </>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="text-[11px] cursor-pointer" style={{ color: ACCENT }}>
          + Add API key
        </button>
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Remove API Key"
          message={`Remove the stored API key for this provider? You will need to re-enter it to use this provider.`}
          confirmLabel="Remove"
          danger
          onConfirm={() => { deleteKey(providerId); setConfirmDelete(false); }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

// ────────── Model Pill Badges ──────────
//
// PURPOSE SEPARATION:
//   Collapsed pills  → click = SET AS DEFAULT (select one model for AI requests)
//                      ✓ tick shown ONLY on the currently selected default model
//   Expanded pills   → click = TOGGLE enable/disable (controls what shows in AI tab)
//                      no ✓ tick (it's a toggle view, not a selection view)
//
// The caller decides mode by passing selectedModelId + the appropriate onPillClick handler.

function ModelPills({ models, accent = ACCENT, selectedModelId, onPillClick }: {
  models: AiModelConfig[];
  accent?: string;
  /** The model ID to show ✓ on. Only ONE pill gets a ✓. undefined = no ✓ anywhere. */
  selectedModelId?: string;
  /** Called on pill click — caller decides action (set-default or toggle-enabled) */
  onPillClick?: (modelId: string, modelName: string) => void;
}) {
  if (models.length === 0) return <p className="text-[11px] text-[var(--color-text-muted)] italic">No models</p>;

  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {models.map(m => {
        const isSelected = m.id === selectedModelId;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onPillClick?.(m.id, m.name)}
            title={isSelected ? `${m.name} — default model` : m.name}
            className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full cursor-pointer transition-all font-mono"
            style={
              isSelected
                ? { backgroundColor: '#0a0a0a', color: '#ffffff', border: `1.5px solid ${accent}`, fontWeight: 600 }
                : m.enabled
                  ? { backgroundColor: `color-mix(in srgb, ${accent} 12%, transparent)`, color: accent, border: `1px solid color-mix(in srgb, ${accent} 28%, transparent)` }
                  : { backgroundColor: 'transparent', color: 'var(--color-text-muted)', border: '1px solid rgba(255,255,255,0.12)', opacity: 0.5 }
            }
          >
            {isSelected && <CheckIcon size={9} strokeWidth={3} className="flex-shrink-0" style={{ color: accent }} />}
            <span>{m.name}</span>
          </button>
        );
      })}
    </div>
  );
}

// ────────── Model Row (expanded list view) ──────────

function ModelRow({
  model, providerId, onDelete, isSelected, onSelect, accent = ACCENT,
}: {
  model: AiModelConfig;
  providerId: string;
  onDelete: () => void;
  /** Whether this model is the current default selection for its provider */
  isSelected: boolean;
  /** Called when the radio circle is clicked — sets this model as default */
  onSelect: () => void;
  accent?: string;
}) {
  const { updateModel, toggleModel } = useAiProvidersStore();
  const canSelect = model.enabled;

  return (
    <div className="flex items-center gap-2 py-1 group">
      <div className="w-[14px]" />
      <MiniToggle value={model.enabled} onChange={() => toggleModel(providerId, model.id)} accent={accent} />
      <InlineEdit value={model.name} onChange={v => updateModel(providerId, model.id, { name: v })} placeholder="Display name" className="w-[140px] h-[26px]" />
      <InlineEdit value={model.id} onChange={v => updateModel(providerId, model.id, { id: v })} placeholder="model-id" className="flex-1 h-[26px] font-mono text-[11px]" />

      {/* Radio circle — select as default model. Disabled models can't be selected. */}
      <button
        type="button"
        onClick={canSelect ? onSelect : undefined}
        title={!canSelect ? 'Enable this model first to set it as default' : isSelected ? 'Default model' : 'Set as default model'}
        disabled={!canSelect}
        className={`p-1 rounded flex-shrink-0 transition-all ${
          isSelected
            ? 'opacity-100 cursor-default'
            : canSelect
              ? 'opacity-0 group-hover:opacity-60 hover:!opacity-100 cursor-pointer'
              : 'opacity-20 cursor-not-allowed'
        }`}
        style={{ color: isSelected ? accent : undefined }}
      >
        <RadioSelectIcon size={13} selected={isSelected} />
      </button>

      <button type="button" onClick={onDelete} className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer p-1 rounded hover:bg-[rgba(255,80,80,0.12)]" title="Delete model">
        <TrashIcon size={12} className="text-[var(--color-error)]" />
      </button>
    </div>
  );
}

// ────────── Provider Card ──────────

type ViewMode = 'pills' | 'list';

function ProviderCard({ provider }: { provider: AiProviderConfig }) {
  const { updateProvider, toggleProvider, removeProvider, toggleModel, addModel, removeModel, setDefaultProvider } = useAiProvidersStore();
  const defaultProviderId = useAiProvidersStore(s => s.defaultProviderId);
  const defaultModelId = useAiProvidersStore(s => s.defaultModelId);
  const [expanded, setExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('pills');
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'provider' | 'model'; modelId?: string } | null>(null);

  // Resolve brand meta (icon + accent color) for this provider — falls back to generic AI accent
  const brand = PROVIDER_BRAND_META[provider.id];
  const accent = brand?.color ?? ACCENT;
  const BrandIcon = brand?.Icon ?? null;
  const isDefault = defaultProviderId === provider.id;

  const handleSetDefault = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const firstEnabledModel = provider.models.find(m => m.enabled)?.id ?? provider.models[0]?.id ?? '';
    setDefaultProvider(provider.id, firstEnabledModel);
  }, [provider.id, provider.models, setDefaultProvider]);

  const handleAddModel = useCallback(() => {
    addModel(provider.id, { id: `new-model-${Date.now()}`, name: 'New Model', enabled: true });
    setExpanded(true);
    setViewMode('list');
  }, [provider.id, addModel]);

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'provider') removeProvider(provider.id);
    else if (deleteTarget.modelId) removeModel(provider.id, deleteTarget.modelId);
    setDeleteTarget(null);
  }, [deleteTarget, provider.id, removeProvider, removeModel]);

  return (
    <div className="rounded-lg overflow-hidden group/card" style={{ border: `1px solid color-mix(in srgb, ${accent} 30%, transparent)`, backgroundColor: `color-mix(in srgb, ${accent} 4%, transparent)` }}>
      {/* Provider header row */}
      <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[rgba(255,255,255,0.03)] transition-colors" onClick={() => setExpanded(!expanded)}>
        {expanded
          ? <ChevronDownIcon size={12} style={{ color: accent }} className="flex-shrink-0" />
          : <ChevronRightIcon size={12} style={{ color: accent }} className="flex-shrink-0" />
        }
        <div onClick={e => e.stopPropagation()} className="flex items-center">
          <MiniToggle value={provider.enabled} onChange={() => toggleProvider(provider.id)} accent={accent} />
        </div>
        {/* Brand icon */}
        {BrandIcon && (
          <div className="flex-shrink-0" onClick={e => e.stopPropagation()}>
            <BrandIcon size={18} />
          </div>
        )}
        <InlineEdit value={provider.name} onChange={v => updateProvider(provider.id, { name: v })} placeholder="Provider name" className="w-[120px] h-[26px] font-medium" />
        <InlineEdit value={provider.id} onChange={v => updateProvider(provider.id, { id: v })} placeholder="provider-id" className="w-[100px] h-[26px] font-mono text-[11px]" />
        <InlineEdit value={provider.baseUrl} onChange={v => updateProvider(provider.id, { baseUrl: v })} placeholder="https://api.example.com/v1" className="flex-1 h-[26px] font-mono text-[11px]" />
        <span className="text-[10px] text-[var(--color-text-muted)] flex-shrink-0 ml-1">{provider.models.length} model{provider.models.length !== 1 ? 's' : ''}</span>
        {/* Default provider selector — always visible when default, shown on hover otherwise */}
        <button
          type="button"
          title={isDefault ? 'Default provider for all AI requests' : 'Set as default provider'}
          onClick={handleSetDefault}
          className={`p-1 rounded transition-opacity cursor-pointer flex-shrink-0 ${isDefault ? 'opacity-100' : 'opacity-0 group-hover/card:opacity-50 hover:!opacity-100'}`}
          style={{ color: isDefault ? accent : undefined }}
        >
          <RadioSelectIcon size={13} selected={isDefault} />
        </button>
        <button type="button" onClick={e => { e.stopPropagation(); setDeleteTarget({ type: 'provider' }); }} className="opacity-60 hover:opacity-100 transition-opacity cursor-pointer p-1 rounded hover:bg-[rgba(255,80,80,0.12)]" title="Delete provider">
          <TrashIcon size={12} className="text-[var(--color-error)]" />
        </button>
      </div>

      {/* Model pills — collapsed: click a pill to set it as the default model */}
      {!expanded && provider.models.some(m => m.enabled) && (
        <div className="px-6 pb-2">
          <ModelPills
            models={provider.models.filter(m => m.enabled)}
            accent={accent}
            selectedModelId={isDefault ? defaultModelId : undefined}
            onPillClick={(modelId) => setDefaultProvider(provider.id, modelId)}
          />
        </div>
      )}

      {/* API Key manager (always visible) */}
      <div className="px-6 pb-2">
        <ApiKeyManager providerId={provider.id} />
      </div>

      {/* Expanded model list */}
      {expanded && (
        <div className="border-t bg-[rgba(0,0,0,0.15)] px-3 py-1.5" style={{ borderColor: `color-mix(in srgb, ${accent} 15%, transparent)` }}>
          {/* View mode toggle + Add model */}
          <div className="flex items-center gap-2 mb-1">
            <div className="w-[14px]" />
            <span className="text-[10px] uppercase tracking-wider flex-1" style={{ color: accent, opacity: 0.7 }}>Models</span>
            <div className="flex items-center gap-1 mr-2">
              {(['pills', 'list'] as ViewMode[]).map(m => (
                <button key={m} type="button" onClick={() => setViewMode(m)} className={`text-[9px] px-1.5 py-0.5 rounded cursor-pointer transition-colors ${viewMode === m ? 'text-white' : 'text-[var(--color-text-muted)]'}`} style={viewMode === m ? { backgroundColor: accent } : {}}>
                  {m === 'pills' ? '● Badges' : '≡ List'}
                </button>
              ))}
            </div>
            <button type="button" onClick={handleAddModel} className="flex items-center gap-1 text-[11px] cursor-pointer px-2 py-0.5 rounded-md transition-colors hover:bg-[rgba(255,255,255,0.06)]" style={{ color: accent }}>
              <PlusIcon size={11} /><span>Add</span>
            </button>
          </div>

          {provider.models.length === 0 ? (
            <p className="text-[11px] text-[var(--color-text-muted)] py-2 pl-[14px] italic">No models configured.</p>
          ) : viewMode === 'pills' ? (
            /* Expanded badges: same as collapsed — click = select as default, ✓ on selected only */
            <div className="pl-[14px] pb-2">
              <ModelPills
                models={provider.models.filter(m => m.enabled)}
                accent={accent}
                selectedModelId={isDefault ? defaultModelId : undefined}
                onPillClick={(modelId) => setDefaultProvider(provider.id, modelId)}
              />
            </div>
          ) : (
            provider.models.map(m => (
              <ModelRow
                key={m.id}
                model={m}
                providerId={provider.id}
                onDelete={() => setDeleteTarget({ type: 'model', modelId: m.id })}
                isSelected={isDefault && m.id === defaultModelId}
                onSelect={() => setDefaultProvider(provider.id, m.id)}
                accent={accent}
              />
            ))
          )}
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={deleteTarget.type === 'provider' ? 'Delete Provider' : 'Delete Model'}
          message={deleteTarget.type === 'provider' ? `Delete "${provider.name}" and all its models? This cannot be undone.` : `Delete this model? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ────────── Custom Provider Quick-Add Form ──────────

function CustomProviderForm({ onAdd }: { onAdd: (p: AiProviderConfig) => void }) {
  const [show, setShow] = useState(false);
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [modelId, setModelId] = useState('');
  const [modelName, setModelName] = useState('');

  const handleAdd = () => {
    if (!name.trim() || !baseUrl.trim()) return;
    const id = `custom-${Date.now()}`;
    const models: AiModelConfig[] = modelId.trim()
      ? [{ id: modelId.trim(), name: modelName.trim() || modelId.trim(), enabled: true }]
      : [];
    onAdd({ id, name: name.trim(), baseUrl: baseUrl.trim(), enabled: true, models });
    setName(''); setBaseUrl(''); setModelId(''); setModelName('');
    setShow(false);
  };

  if (!show) {
    return (
      <button type="button" onClick={() => setShow(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-md cursor-pointer border border-[rgba(255,255,255,0.12)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.04)]">
        <PlusIcon size={12} />Custom provider (OpenAI-compatible)
      </button>
    );
  }

  return (
    <div className="p-3 rounded-lg border border-[rgba(255,255,255,0.10)] bg-[rgba(0,0,0,0.15)] flex flex-col gap-2">
      <p className="text-[11px] font-medium text-[var(--color-text-primary)]">Add Custom Provider</p>
      <div className="grid grid-cols-2 gap-2">
        <InlineEdit value={name} onChange={setName} placeholder="Provider name (e.g. Ollama)" className="h-[28px]" />
        <InlineEdit value={baseUrl} onChange={setBaseUrl} placeholder="Base URL (e.g. http://localhost:11434/v1)" className="h-[28px] font-mono text-[11px]" />
        <InlineEdit value={modelName} onChange={setModelName} placeholder="Model display name" className="h-[28px]" />
        <InlineEdit value={modelId} onChange={setModelId} placeholder="Model ID (e.g. llama3.2)" className="h-[28px] font-mono text-[11px]" />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={handleAdd} disabled={!name.trim() || !baseUrl.trim()} className="px-3 py-1.5 text-[11px] rounded-md cursor-pointer text-white disabled:opacity-40" style={{ backgroundColor: ACCENT }}>Add Provider</button>
        <button type="button" onClick={() => setShow(false)} className="px-3 py-1.5 text-[11px] rounded-md cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">Cancel</button>
      </div>
    </div>
  );
}

// ────────── DaakiaAI Mock Provider Card ──────────

const DAAKIA_MOCK_ACCENT = PROVIDER_BRAND_COLORS['daakia-mock'];

function DaakiaMockProviderCard({ provider }: { provider: AiProviderConfig }) {
  const { providers, addProvider, toggleProvider, setDefaultProvider, updateProvider } = useAiProvidersStore();
  const defaultProviderId = useAiProvidersStore(s => s.defaultProviderId);
  const defaultModelId = useAiProvidersStore(s => s.defaultModelId);

  const isDefault = defaultProviderId === 'daakia-mock';

  const handleToggle = useCallback(() => {
    const inStore = providers.find(p => p.id === 'daakia-mock');
    if (inStore) {
      toggleProvider('daakia-mock');
    } else {
      addProvider({ ...provider, enabled: false });
    }
  }, [providers, provider, addProvider, toggleProvider]);

  const handleSetDefault = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setDefaultProvider('daakia-mock', 'mock1-model');
  }, [setDefaultProvider]);

  const handleBaseUrlChange = useCallback((url: string) => {
    const inStore = providers.find(p => p.id === 'daakia-mock');
    if (!inStore) {
      addProvider({ ...provider, baseUrl: url });
    } else {
      updateProvider('daakia-mock', { baseUrl: url });
    }
  }, [providers, provider, addProvider, updateProvider]);

  return (
    <div className="rounded-lg overflow-hidden group/card" style={{ border: `1.5px solid color-mix(in srgb, ${DAAKIA_MOCK_ACCENT} 40%, transparent)`, backgroundColor: `color-mix(in srgb, ${DAAKIA_MOCK_ACCENT} 5%, transparent)` }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <DaakiaMockProviderIcon size={20} />
        <div onClick={e => e.stopPropagation()}>
          <MiniToggle value={provider.enabled} onChange={handleToggle} accent={DAAKIA_MOCK_ACCENT} />
        </div>
        <span className="text-[13px] font-semibold flex-1" style={{ color: DAAKIA_MOCK_ACCENT }}>DaakiaAI (Mock)</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: `color-mix(in srgb, ${DAAKIA_MOCK_ACCENT} 15%, transparent)`, color: DAAKIA_MOCK_ACCENT }}>
          No API key needed
        </span>
        {/* Default provider selector */}
        <button
          type="button"
          title={isDefault ? 'Default provider for all AI requests' : 'Set as default provider'}
          onClick={handleSetDefault}
          className={`p-1 rounded transition-opacity cursor-pointer flex-shrink-0 ${isDefault ? 'opacity-100' : 'opacity-0 group-hover/card:opacity-50 hover:!opacity-100'}`}
          style={{ color: isDefault ? DAAKIA_MOCK_ACCENT : undefined }}
        >
          <RadioSelectIcon size={14} selected={isDefault} />
        </button>
      </div>

      {/* Description + BaseUrl config */}
      <div className="px-4 pb-3 flex flex-col gap-2">
        <p className="text-[11px] text-[var(--color-text-muted)]">
          Routes AI requests to your locally running Daakia AI mock server (OpenAI-compatible).
          {isDefault && (
            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: `color-mix(in srgb, ${DAAKIA_MOCK_ACCENT} 12%, transparent)`, color: DAAKIA_MOCK_ACCENT }}>
              ● Default
            </span>
          )}
        </p>

        {/* Mock AI server URL */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--color-text-muted)] flex-shrink-0 w-[110px]">Mock AI Server URL</span>
          <InlineEdit
            value={provider.baseUrl}
            onChange={handleBaseUrlChange}
            placeholder="http://localhost:8888/v1"
            className="flex-1 h-[26px] font-mono text-[11px]"
          />
        </div>

        {/* Model pills */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--color-text-muted)] flex-shrink-0 w-[110px]">Model</span>
          <button
            type="button"
            onClick={() => setDefaultProvider('daakia-mock', 'mock1-model')}
            className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-mono cursor-pointer transition-all"
            style={
              isDefault && defaultModelId === 'mock1-model'
                ? { backgroundColor: '#0a0a0a', color: '#ffffff', border: `1.5px solid ${DAAKIA_MOCK_ACCENT}`, fontWeight: 600 }
                : { backgroundColor: `color-mix(in srgb, ${DAAKIA_MOCK_ACCENT} 12%, transparent)`, color: DAAKIA_MOCK_ACCENT, border: `1px solid color-mix(in srgb, ${DAAKIA_MOCK_ACCENT} 28%, transparent)` }
            }
          >
            {isDefault && defaultModelId === 'mock1-model' && (
              <CheckIcon size={9} strokeWidth={3} className="flex-shrink-0" style={{ color: DAAKIA_MOCK_ACCENT }} />
            )}
            <span>Mock Model 1</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────── Copilot Provider Card ──────────

const COPILOT_ACCENT = PROVIDER_BRAND_COLORS.copilot;
const AUTO_MODEL = { id: 'auto', name: 'Auto (Copilot chooses)' };

function CopilotProviderCard({ provider }: { provider: AiProviderConfig }) {
  const { providers, addProvider, toggleProvider, setDefaultProvider } = useAiProvidersStore();
  const defaultProviderId = useAiProvidersStore(s => s.defaultProviderId);
  const defaultModelId = useAiProvidersStore(s => s.defaultModelId);
  const [liveModels, setLiveModels] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const isDefault = defaultProviderId === 'copilot';

  // Fix toggle: if copilot isn't in the store yet (using COPILOT_DEFAULT_PROVIDER fallback),
  // add it first (as disabled) before toggling — avoids silent no-op from toggleProvider map
  const handleToggle = useCallback(() => {
    const inStore = providers.find(p => p.id === 'copilot');
    if (inStore) {
      toggleProvider('copilot');
    } else {
      // Not yet persisted — add with toggled state (was enabled:true by default, so now false)
      addProvider({ ...provider, enabled: false });
    }
  }, [providers, provider, addProvider, toggleProvider]);

  // Fetch live Copilot models from VS Code LM API on mount
  useEffect(() => {
    if (liveModels.length > 0) return;
    setLoadingModels(true);
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg?.type === 'copilot:models') {
        const models = (msg.models as Array<{ id: string; name: string }>) ?? [];
        if (models.length > 0) setLiveModels(models.filter(m => m.id !== 'auto'));
        setLoadingModels(false);
        window.removeEventListener('message', handler);
      }
    };
    window.addEventListener('message', handler);
    postMsg({ type: 'copilot:models' });
    const cleanup = setTimeout(() => { setLoadingModels(false); window.removeEventListener('message', handler); }, 5000);
    return () => { clearTimeout(cleanup); window.removeEventListener('message', handler); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Auto" is always first — live VS Code models follow.
  // All Copilot models are always treated as enabled — we don't manage per-model
  // enable/disable for dynamic VS Code models. The pills are purely for selecting default.
  const displayModels = useMemo(() => {
    const autoEntry = { ...AUTO_MODEL, enabled: true };
    const rest = liveModels.length > 0
      ? liveModels.filter(m => m.id !== 'auto').map(m => ({ id: m.id, name: m.name, enabled: true }))
      : provider.models.filter(m => m.id !== 'auto').map(m => ({ id: m.id, name: m.name, enabled: true }));
    return [autoEntry, ...rest];
  }, [liveModels, provider.models]);

  const handleSetDefault = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const defModel = provider.models.find(m => m.enabled)?.id ?? 'auto';
    setDefaultProvider('copilot', defModel);
  }, [provider.models, setDefaultProvider]);

  return (
    <div className="rounded-lg overflow-hidden border-2 group/card" style={{ borderColor: `color-mix(in srgb, ${COPILOT_ACCENT} 40%, transparent)`, backgroundColor: `color-mix(in srgb, ${COPILOT_ACCENT} 5%, transparent)` }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronDownIcon size={12} style={{ color: COPILOT_ACCENT }} /> : <ChevronRightIcon size={12} style={{ color: COPILOT_ACCENT }} />}
        <div onClick={e => e.stopPropagation()} className="flex items-center">
          <MiniToggle value={provider.enabled} onChange={handleToggle} accent={COPILOT_ACCENT} />
        </div>
        <CopilotBrandIcon size={20} />
        <span className="text-[13px] font-semibold flex-1" style={{ color: COPILOT_ACCENT }}>GitHub Copilot</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: `color-mix(in srgb, ${COPILOT_ACCENT} 15%, transparent)`, color: COPILOT_ACCENT }}>
          No API key needed
        </span>
        {/* Default provider selector */}
        <button
          type="button"
          title={isDefault ? 'Default provider for all AI requests' : 'Set as default provider'}
          onClick={handleSetDefault}
          className={`p-1 rounded transition-opacity cursor-pointer flex-shrink-0 ${isDefault ? 'opacity-100' : 'opacity-0 group-hover/card:opacity-50 hover:!opacity-100'}`}
          style={{ color: isDefault ? COPILOT_ACCENT : undefined }}
        >
          <RadioSelectIcon size={14} selected={isDefault} />
        </button>
      </div>

      {/* Always-visible info */}
      <div className="px-4 pb-2 text-[11px] text-[var(--color-text-muted)]">
        Uses your active GitHub Copilot subscription via VS Code's Language Model API.
        {isDefault && (
          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: `color-mix(in srgb, ${COPILOT_ACCENT} 12%, transparent)`, color: COPILOT_ACCENT }}>
            ● Default
          </span>
        )}
      </div>

      {/* Model pills — collapsed: click a pill to set it as the default Copilot model */}
      {!expanded && displayModels.some(m => m.enabled) && (
        <div className="px-4 pb-2">
          <ModelPills
            models={displayModels.filter(m => m.enabled)}
            accent={COPILOT_ACCENT}
            selectedModelId={isDefault ? defaultModelId : undefined}
            onPillClick={(modelId) => setDefaultProvider('copilot', modelId)}
          />
        </div>
      )}

      {/* Expanded model list — click a model to set it as the default Copilot model */}
      {expanded && (
        <div className="border-t px-4 py-2" style={{ borderColor: `color-mix(in srgb, ${COPILOT_ACCENT} 20%, transparent)` }}>
          <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: COPILOT_ACCENT }}>
            {loadingModels ? 'Loading models from VS Code…' : 'Available Models — click to select default'}
          </p>
          <ModelPills
            models={displayModels}
            accent={COPILOT_ACCENT}
            selectedModelId={isDefault ? defaultModelId : undefined}
            onPillClick={(modelId) => setDefaultProvider('copilot', modelId)}
          />
        </div>
      )}
    </div>
  );
}

// ────────── Main Component ──────────

// Default copilot provider config — used when stored providers don't include copilot yet
const COPILOT_DEFAULT_PROVIDER: AiProviderConfig = (() => {
  const def = AI_PROVIDERS.find(p => p.id === 'copilot')!;
  return {
    id: 'copilot',
    name: 'GitHub Copilot',
    baseUrl: def?.baseUrl ?? 'vscode://copilot',
    enabled: true,
    models: (def?.models ?? []).map(m => ({ id: m.id, name: m.name, enabled: true })),
  };
})();

// Default DaakiaAI Mock provider config — shown above Copilot, no API key needed
const DAAKIA_MOCK_DEFAULT_PROVIDER: AiProviderConfig = (() => {
  const def = AI_PROVIDERS.find(p => p.id === 'daakia-mock')!;
  return {
    id: 'daakia-mock',
    name: 'DaakiaAI (Mock)',
    baseUrl: def?.baseUrl ?? '',
    enabled: true,
    models: (def?.models ?? []).map(m => ({ id: m.id, name: m.name, enabled: true })),
  };
})();

export function LlmProviderSettings() {
  const { providers, loaded, addProvider, seedDefaults } = useAiProvidersStore();
  const { loadKeys } = useAiKeysStore();
  const [resetConfirm, setResetConfirm] = useState(false);

  // Load key status on mount
  useEffect(() => { loadKeys(); }, [loadKeys]);

  const handleReset = useCallback(() => {
    seedDefaults();
    setResetConfirm(false);
  }, [seedDefaults]);

  // Resolve daakia-mock provider — always shown above Copilot even if not yet in stored providers
  const daakiaMockProvider = useMemo(
    () => providers.find(p => p.id === 'daakia-mock') ?? DAAKIA_MOCK_DEFAULT_PROVIDER,
    [providers],
  );

  // Resolve copilot provider — always shown at top even if not yet in stored providers
  const copilotProvider = useMemo(
    () => providers.find(p => p.id === 'copilot') ?? COPILOT_DEFAULT_PROVIDER,
    [providers],
  );

  // All other providers (non-copilot, non-daakia-mock) for the regular list
  const otherProviders = useMemo(
    () => providers.filter(p => p.id !== 'copilot' && p.id !== 'daakia-mock'),
    [providers],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Pill tab header */}
      <div className="border-b border-[var(--color-surface-border)] pt-3">
        <div className="flex items-center gap-0 px-5">
          <span className="px-3 py-2 text-[12px] border-b-2 font-medium" style={{ borderColor: ACCENT, color: ACCENT }}>
            Providers &amp; Models
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-5 py-4">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-[13px] font-medium text-[var(--color-text-primary)]">AI Providers</p>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
              Configure providers and models. Toggle on/off, add API keys, or add custom OpenAI-compatible endpoints.
            </p>
          </div>

          {/* Action bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <CustomProviderForm onAdd={addProvider} />
            <button type="button" onClick={() => setResetConfirm(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-md cursor-pointer transition-colors border border-[rgba(255,255,255,0.12)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[rgba(255,255,255,0.04)]">
              Reset to Defaults
            </button>
          </div>

          {/* Provider list — DaakiaAI Mock first, then Copilot, then others */}
          {!loaded ? (
            <p className="text-[12px] text-[var(--color-text-muted)] py-4">Loading providers...</p>
          ) : (
            <div className="flex flex-col gap-2">
              {/* DaakiaAI Mock — pinned above Copilot, no API key needed, routes to local mock AI server */}
              <DaakiaMockProviderCard provider={daakiaMockProvider} />

              {/* GitHub Copilot — always second, no API key needed */}
              <CopilotProviderCard provider={copilotProvider} />

              {/* All other providers */}
              {otherProviders.map(p => (
                <ProviderCard key={p.id} provider={p} />
              ))}

              {/* If no other providers configured */}
              {otherProviders.length === 0 && (
                <p className="text-[11px] text-[var(--color-text-muted)] py-2 italic">
                  No other providers configured. Add API keys above or add a custom provider.
                </p>
              )}
            </div>
          )}

          {/* Info */}
          <div className="p-3 rounded-md border" style={{ backgroundColor: 'rgba(139,92,246,0.06)', borderColor: 'rgba(139,92,246,0.15)' }}>
            <p className="text-[12px] font-medium mb-1" style={{ color: ACCENT }}>API Keys</p>
            <ul className="text-[11px] text-[var(--color-text-muted)] space-y-1">
              <li>• Keys are stored securely in the OS keychain (macOS Keychain / Windows Credential Store / Linux Secret Service) — never in plain text</li>
              <li>• Keys are automatically injected into requests — you don't need to paste them each time</li>
              <li>• GitHub Copilot: no API key needed — uses your active Copilot subscription via VS Code</li>
              <li>• For Ollama / LM Studio: no API key needed, just set the base URL</li>
            </ul>
          </div>
        </div>
      </div>

      {resetConfirm && (
        <ConfirmDialog
          title="Reset to Defaults"
          message="This will replace all provider and model settings with the built-in defaults. Custom providers will be lost."
          confirmLabel="Reset"
          danger
          onConfirm={handleReset}
          onCancel={() => setResetConfirm(false)}
        />
      )}
    </div>
  );
}
