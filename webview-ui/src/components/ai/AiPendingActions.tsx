/**
 * AiPendingActions — parses and renders "daakia-action" command blocks
 * from AI responses. Users can apply or dismiss each suggested action.
 *
 * Feature 4.5.6 — AI Actions from Chat
 */
import { useCallback } from 'react';
import { useTabsStore, type HttpMethod, type BodyMode, type AuthType, type RequestTab } from '../../store/tabs-store';
import { useEnvStore } from '../../store/env-store';
import type { KeyValueRow } from '../shared';

// ─── Action types ─────────────────────────────────────────────────────────────

export type DaakiaAction =
  | { action: 'set_url';    url: string }
  | { action: 'set_method'; method: HttpMethod }
  | { action: 'add_header'; key: string; value: string }
  | { action: 'set_body';   mode: BodyMode; content: string }
  | { action: 'set_env_var'; key: string; value: string }
  | { action: 'set_auth';   authType: AuthType; token?: string; username?: string; password?: string; apiKey?: string; headerName?: string };

/** Parse all ```daakia-action ... ``` blocks from an AI response string */
export function parseDaakiaActions(text: string): DaakiaAction[] {
  const results: DaakiaAction[] = [];
  const regex = /```daakia-action\s*\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim()) as DaakiaAction;
      if (parsed && typeof parsed.action === 'string') {
        results.push(parsed);
      }
    } catch {
      // ignore malformed JSON blocks
    }
  }
  return results;
}

// ─── Action helpers ───────────────────────────────────────────────────────────

function actionLabel(a: DaakiaAction): string {
  switch (a.action) {
    case 'set_url':     return '🔗 Set URL';
    case 'set_method':  return '⚡ Set Method';
    case 'add_header':  return '📋 Add Header';
    case 'set_body':    return '📝 Set Body';
    case 'set_env_var': return '🔧 Set Env Var';
    case 'set_auth':    return '🔐 Set Auth';
  }
}

function actionDetail(a: DaakiaAction): string {
  switch (a.action) {
    case 'set_url':     return a.url.length > 48 ? a.url.slice(0, 45) + '…' : a.url;
    case 'set_method':  return a.method;
    case 'add_header':  return `${a.key}: ${a.value.length > 30 ? a.value.slice(0, 27) + '…' : a.value}`;
    case 'set_body':    return `${a.mode} — ${a.content.slice(0, 40).replace(/\n/g, ' ')}${a.content.length > 40 ? '…' : ''}`;
    case 'set_env_var': return `${a.key} = ${a.value.length > 30 ? a.value.slice(0, 27) + '…' : a.value}`;
    case 'set_auth':    return a.authType + (a.token ? ' (token provided)' : '');
  }
}

// ─── Apply logic ──────────────────────────────────────────────────────────────

function applyAction(action: DaakiaAction, contextTab: RequestTab | null): void {
  const store = useTabsStore.getState();
  const envStore = useEnvStore.getState();

  switch (action.action) {
    case 'set_url': {
      if (!contextTab) return;
      store.updateTab(contextTab.id, { url: action.url });
      break;
    }
    case 'set_method': {
      if (!contextTab) return;
      store.updateTab(contextTab.id, { method: action.method });
      break;
    }
    case 'add_header': {
      if (!contextTab) return;
      const existing = contextTab.headers ?? [];
      // Replace if key already exists (case-insensitive), otherwise append
      const idx = existing.findIndex(h => h.key.toLowerCase() === action.key.toLowerCase());
      const newRow: KeyValueRow = { id: crypto.randomUUID(), key: action.key, value: action.value, enabled: true };
      const updated = idx >= 0
        ? existing.map((h, i) => i === idx ? newRow : h)
        : [...existing, newRow];
      store.updateTab(contextTab.id, { headers: updated });
      break;
    }
    case 'set_body': {
      if (!contextTab) return;
      store.updateTab(contextTab.id, { bodyMode: action.mode, bodyRaw: action.content });
      break;
    }
    case 'set_env_var': {
      const envId = contextTab?.envId ?? envStore.activeEnvId ?? 'global';
      const env = envStore.environments.find(e => e.id === envId);
      if (!env) return;
      const varIdx = env.variables.findIndex(v => v.key === action.key);
      if (varIdx >= 0) {
        envStore.updateVariable(envId, env.variables[varIdx].id, {
          currentValue: action.value,
          initialValue: action.value,
        });
      } else {
        envStore.addVariable(envId);
        // addVariable appends an empty row — patch the last one
        const updatedEnv = useEnvStore.getState().environments.find(e => e.id === envId);
        if (updatedEnv && updatedEnv.variables.length > 0) {
          const last = updatedEnv.variables[updatedEnv.variables.length - 1];
          envStore.updateVariable(envId, last.id, { key: action.key, currentValue: action.value, initialValue: action.value });
        }
      }
      break;
    }
    case 'set_auth': {
      if (!contextTab) return;
      const authData: Record<string, string> = {};
      if (action.token)      authData['token']      = action.token;
      if (action.username)   authData['username']   = action.username;
      if (action.password)   authData['password']   = action.password;
      if (action.apiKey)     authData['apiKey']     = action.apiKey;
      if (action.headerName) authData['headerName'] = action.headerName;
      store.updateTab(contextTab.id, { authType: action.authType, authData });
      break;
    }
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  actions: DaakiaAction[];
  contextTab: RequestTab | null;
  onDismiss: (index: number) => void;
  onDismissAll: () => void;
}

export function AiPendingActions({ actions, contextTab, onDismiss, onDismissAll }: Props) {
  const handleApply = useCallback((action: DaakiaAction, index: number) => {
    applyAction(action, contextTab);
    onDismiss(index);
  }, [contextTab, onDismiss]);

  if (actions.length === 0) return null;

  return (
    <div
      className="flex-shrink-0 border-b px-3 py-2"
      style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'color-mix(in srgb, var(--color-protocol-ai) 7%, var(--color-panel))' }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10.5px] font-semibold" style={{ color: 'var(--color-protocol-ai)' }}>
          ✦ AI suggested {actions.length === 1 ? 'an action' : `${actions.length} actions`}
        </span>
        <button
          type="button"
          onClick={onDismissAll}
          className="text-[10px] cursor-pointer hover:opacity-70 transition-opacity"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Dismiss all
        </button>
      </div>

      {/* Action cards */}
      <div className="flex flex-col gap-1">
        {actions.map((action, i) => (
          <div
            key={i}
            className="flex items-center gap-2 rounded-md px-2 py-1 border"
            style={{ borderColor: 'color-mix(in srgb, var(--color-protocol-ai) 25%, var(--color-surface-border))', backgroundColor: 'var(--color-panel)' }}
          >
            {/* Label + detail */}
            <div className="flex-1 min-w-0">
              <span className="text-[10.5px] font-semibold mr-1.5" style={{ color: 'var(--color-protocol-ai)' }}>
                {actionLabel(action)}
              </span>
              <span className="text-[10px] font-mono truncate" style={{ color: 'var(--color-text-secondary)' }}>
                {actionDetail(action)}
              </span>
            </div>

            {/* Apply */}
            <button
              type="button"
              onClick={() => handleApply(action, i)}
              disabled={!contextTab && action.action !== 'set_env_var'}
              className="flex-shrink-0 h-[20px] px-2 text-[10px] font-medium rounded cursor-pointer hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              style={{ backgroundColor: 'var(--color-protocol-ai)', color: '#fff' }}
            >
              Apply
            </button>

            {/* Dismiss */}
            <button
              type="button"
              onClick={() => onDismiss(i)}
              className="flex-shrink-0 h-[20px] w-[20px] flex items-center justify-center rounded cursor-pointer hover:opacity-70 transition-opacity text-[12px]"
              style={{ color: 'var(--color-text-muted)' }}
              title="Dismiss"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
