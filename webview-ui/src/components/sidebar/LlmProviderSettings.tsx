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
import { useState, useCallback, useEffect } from 'react';
import { useAiProvidersStore, type AiProviderConfig, type AiModelConfig } from '../../store/ai-providers-store';
import { useAiKeysStore } from '../../store/ai-keys-store';
import { PlusIcon, TrashIcon, ChevronDownIcon, ChevronRightIcon, KeyIcon, CopilotIcon } from '../../icons';
import { ConfirmDialog } from '../shared';
import { postMsg } from '../../vscode';

const ACCENT = 'var(--color-protocol-ai)';

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
          className="flex-1 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-md px-2 py-1 text-[12px] focus:outline-none focus:border-[var(--color-protocol-ai)] font-mono"
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

function ModelPills({ models, providerId }: { models: AiModelConfig[]; providerId: string }) {
  const { toggleModel } = useAiProvidersStore();
  const enabled = models.filter(m => m.enabled);
  const disabled = models.filter(m => !m.enabled);

  if (models.length === 0) return <p className="text-[11px] text-[var(--color-text-muted)] italic">No models</p>;

  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {enabled.map(m => (
        <button
          key={m.id}
          type="button"
          onClick={() => toggleModel(providerId, m.id)}
          title={`${m.id} — click to disable`}
          className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full cursor-pointer transition-colors font-mono"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-protocol-ai) 15%, transparent)', color: ACCENT, border: '1px solid color-mix(in srgb, var(--color-protocol-ai) 30%, transparent)' }}
        >
          {m.name}
        </button>
      ))}
      {disabled.map(m => (
        <button
          key={m.id}
          type="button"
          onClick={() => toggleModel(providerId, m.id)}
          title={`${m.id} — click to enable`}
          className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full cursor-pointer transition-colors font-mono"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: 'var(--color-text-muted)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {m.name}
        </button>
      ))}
    </div>
  );
}

// ────────── Model Row (expanded) ──────────

function ModelRow({ model, providerId, onDelete }: { model: AiModelConfig; providerId: string; onDelete: () => void; }) {
  const { updateModel, toggleModel } = useAiProvidersStore();
  return (
    <div className="flex items-center gap-2 py-1 group">
      <div className="w-[14px]" />
      <MiniToggle value={model.enabled} onChange={() => toggleModel(providerId, model.id)} />
      <InlineEdit value={model.name} onChange={v => updateModel(providerId, model.id, { name: v })} placeholder="Display name" className="w-[140px] h-[26px]" />
      <InlineEdit value={model.id} onChange={v => updateModel(providerId, model.id, { id: v })} placeholder="model-id" className="flex-1 h-[26px] font-mono text-[11px]" />
      <button type="button" onClick={onDelete} className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer p-1 rounded hover:bg-[rgba(255,80,80,0.12)]" title="Delete model">
        <TrashIcon size={12} className="text-[var(--color-error)]" />
      </button>
    </div>
  );
}

// ────────── Provider Card ──────────

type ViewMode = 'pills' | 'list';

function ProviderCard({ provider }: { provider: AiProviderConfig }) {
  const { updateProvider, toggleProvider, removeProvider, addModel, removeModel } = useAiProvidersStore();
  const [expanded, setExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('pills');
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'provider' | 'model'; modelId?: string } | null>(null);

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
    <div className="border border-[rgba(255,255,255,0.08)] rounded-lg overflow-hidden">
      {/* Provider header row */}
      <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[rgba(255,255,255,0.03)] transition-colors" onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronDownIcon size={12} className="text-[var(--color-text-muted)] flex-shrink-0" /> : <ChevronRightIcon size={12} className="text-[var(--color-text-muted)] flex-shrink-0" />}
        <div onClick={e => e.stopPropagation()} className="flex items-center">
          <MiniToggle value={provider.enabled} onChange={() => toggleProvider(provider.id)} />
        </div>
        <InlineEdit value={provider.name} onChange={v => updateProvider(provider.id, { name: v })} placeholder="Provider name" className="w-[130px] h-[26px] font-medium" />
        <InlineEdit value={provider.id} onChange={v => updateProvider(provider.id, { id: v })} placeholder="provider-id" className="w-[100px] h-[26px] font-mono text-[11px]" />
        <InlineEdit value={provider.baseUrl} onChange={v => updateProvider(provider.id, { baseUrl: v })} placeholder="https://api.example.com/v1" className="flex-1 h-[26px] font-mono text-[11px]" />
        <span className="text-[10px] text-[var(--color-text-muted)] flex-shrink-0 ml-1">{provider.models.length} model{provider.models.length !== 1 ? 's' : ''}</span>
        <button type="button" onClick={e => { e.stopPropagation(); setDeleteTarget({ type: 'provider' }); }} className="opacity-60 hover:opacity-100 transition-opacity cursor-pointer p-1 rounded hover:bg-[rgba(255,80,80,0.12)]" title="Delete provider">
          <TrashIcon size={12} className="text-[var(--color-error)]" />
        </button>
      </div>

      {/* Model pills (always visible when provider not expanded) */}
      {!expanded && provider.models.length > 0 && (
        <div className="px-6 pb-2">
          <ModelPills models={provider.models} providerId={provider.id} />
        </div>
      )}

      {/* API Key manager (always visible) */}
      <div className="px-6 pb-2">
        <ApiKeyManager providerId={provider.id} />
      </div>

      {/* Expanded model list */}
      {expanded && (
        <div className="border-t border-[rgba(255,255,255,0.06)] bg-[rgba(0,0,0,0.15)] px-3 py-1.5">
          {/* View mode toggle + Add model */}
          <div className="flex items-center gap-2 mb-1">
            <div className="w-[14px]" />
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] flex-1">Models</span>
            <div className="flex items-center gap-1 mr-2">
              {(['pills', 'list'] as ViewMode[]).map(m => (
                <button key={m} type="button" onClick={() => setViewMode(m)} className={`text-[9px] px-1.5 py-0.5 rounded cursor-pointer transition-colors ${viewMode === m ? 'text-white' : 'text-[var(--color-text-muted)]'}`} style={viewMode === m ? { backgroundColor: ACCENT } : {}}>
                  {m === 'pills' ? '● Badges' : '≡ List'}
                </button>
              ))}
            </div>
            <button type="button" onClick={handleAddModel} className="flex items-center gap-1 text-[11px] cursor-pointer px-2 py-0.5 rounded-md transition-colors hover:bg-[rgba(255,255,255,0.06)]" style={{ color: ACCENT }}>
              <PlusIcon size={11} /><span>Add</span>
            </button>
          </div>

          {provider.models.length === 0 ? (
            <p className="text-[11px] text-[var(--color-text-muted)] py-2 pl-[14px] italic">No models configured.</p>
          ) : viewMode === 'pills' ? (
            <div className="pl-[14px] pb-2"><ModelPills models={provider.models} providerId={provider.id} /></div>
          ) : (
            provider.models.map(m => (
              <ModelRow key={m.id} model={m} providerId={provider.id} onDelete={() => setDeleteTarget({ type: 'model', modelId: m.id })} />
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

// ────────── Copilot Provider Card ──────────

const COPILOT_ACCENT = '#8957E5';

function CopilotProviderCard({ provider }: { provider: AiProviderConfig }) {
  const { toggleProvider, toggleModel } = useAiProvidersStore();
  const [liveModels, setLiveModels] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Fetch live Copilot models from VS Code LM API once when expanded
  useEffect(() => {
    if (!expanded || liveModels.length > 0) return;
    setLoadingModels(true);
    const handler = (evt: MessageEvent) => {
      const msg = evt.data as Record<string, unknown>;
      if (msg?.type === 'copilot:models') {
        const models = (msg.models as Array<{ id: string; name: string }>) ?? [];
        if (models.length > 0) setLiveModels(models);
        setLoadingModels(false);
        window.removeEventListener('message', handler);
      }
    };
    window.addEventListener('message', handler);
    postMsg({ type: 'copilot:models' });
    const cleanup = setTimeout(() => { setLoadingModels(false); window.removeEventListener('message', handler); }, 5000);
    return () => { clearTimeout(cleanup); window.removeEventListener('message', handler); };
  }, [expanded, liveModels.length]);

  const displayModels = liveModels.length > 0
    ? liveModels.map(m => ({ ...m, enabled: provider.models.some(pm => pm.id === m.id && pm.enabled) }))
    : provider.models.map(m => ({ id: m.id, name: m.name, enabled: m.enabled }));

  return (
    <div className="rounded-lg overflow-hidden border-2" style={{ borderColor: `color-mix(in srgb, ${COPILOT_ACCENT} 40%, transparent)`, backgroundColor: `color-mix(in srgb, ${COPILOT_ACCENT} 5%, transparent)` }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronDownIcon size={12} style={{ color: COPILOT_ACCENT }} /> : <ChevronRightIcon size={12} style={{ color: COPILOT_ACCENT }} />}
        <div onClick={e => e.stopPropagation()} className="flex items-center">
          <MiniToggle value={provider.enabled} onChange={() => toggleProvider(provider.id)} accent={COPILOT_ACCENT} />
        </div>
        <CopilotIcon size={16} style={{ color: COPILOT_ACCENT }} />
        <span className="text-[13px] font-semibold flex-1" style={{ color: COPILOT_ACCENT }}>GitHub Copilot</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: `color-mix(in srgb, ${COPILOT_ACCENT} 15%, transparent)`, color: COPILOT_ACCENT }}>
          No API key needed
        </span>
      </div>

      {/* Always-visible info */}
      <div className="px-4 pb-2 text-[11px] text-[var(--color-text-muted)]">
        Uses your active GitHub Copilot subscription via VS Code's Language Model API.
      </div>

      {/* Model pills (collapsed) */}
      {!expanded && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
          {displayModels.filter(m => m.enabled).map(m => (
            <button key={m.id} type="button" onClick={() => toggleModel(provider.id, m.id)}
              className="text-[10px] px-2 py-0.5 rounded-full cursor-pointer font-mono transition-colors"
              style={{ backgroundColor: `color-mix(in srgb, ${COPILOT_ACCENT} 15%, transparent)`, color: COPILOT_ACCENT, border: `1px solid color-mix(in srgb, ${COPILOT_ACCENT} 30%, transparent)` }}>
              {m.name}
            </button>
          ))}
        </div>
      )}

      {/* Expanded model list */}
      {expanded && (
        <div className="border-t px-4 py-2" style={{ borderColor: `color-mix(in srgb, ${COPILOT_ACCENT} 20%, transparent)` }}>
          <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: COPILOT_ACCENT }}>
            {loadingModels ? 'Loading models from VS Code…' : 'Available Models — toggle to enable/disable'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {displayModels.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => toggleModel(provider.id, m.id)}
                className="text-[10px] px-2.5 py-0.5 rounded-full cursor-pointer font-mono transition-all"
                style={m.enabled
                  ? { backgroundColor: `color-mix(in srgb, ${COPILOT_ACCENT} 18%, transparent)`, color: COPILOT_ACCENT, border: `1px solid color-mix(in srgb, ${COPILOT_ACCENT} 35%, transparent)` }
                  : { backgroundColor: 'rgba(255,255,255,0.04)', color: 'var(--color-text-muted)', border: '1px solid rgba(255,255,255,0.08)' }
                }
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ────────── Main Component ──────────

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

  return (
    <div className="flex flex-col h-full">
      {/* Pill tab header */}
      <div className="flex items-center gap-0 px-4 pt-3 pb-0 border-b border-[var(--color-surface-border)]">
        <span className="px-3 py-2 text-[12px] border-b-2 font-medium" style={{ borderColor: ACCENT, color: ACCENT }}>
          Providers &amp; Models
        </span>
      </div>

      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] p-4">
        <div className="flex flex-col gap-4 max-w-[700px]">
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

          {/* Provider list */}
          {!loaded ? (
            <p className="text-[12px] text-[var(--color-text-muted)] py-4">Loading providers...</p>
          ) : providers.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-[12px] text-[var(--color-text-muted)]">No providers configured.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {providers.map(p =>
                p.id === 'copilot'
                  ? <CopilotProviderCard key={p.id} provider={p} />
                  : <ProviderCard key={p.id} provider={p} />
              )}
            </div>
          )}

          {/* Info */}
          <div className="p-3 rounded-md border" style={{ backgroundColor: 'rgba(139,92,246,0.06)', borderColor: 'rgba(139,92,246,0.15)' }}>
            <p className="text-[12px] font-medium mb-1" style={{ color: ACCENT }}>API Keys</p>
            <ul className="text-[11px] text-[var(--color-text-muted)] space-y-1">
              <li>• Keys are stored securely in the local SQLite database — never sent to any third party</li>
              <li>• Keys are automatically injected into requests — you don't need to paste them each time</li>
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
