/**
 * WebhookPanel — Configure outbound webhooks/callbacks fired after route matches (6A.23).
 */
import { useState } from 'react';
import { StyledDropdown, type DropdownOption } from '../../shared';
import { ChevronDownIcon, PlusIcon, TrashIcon } from '../../../icons';
import type { MockRoute, WebhookConfig, HttpMethod } from '../mock-types';

const MOCK_ACCENT = 'var(--color-mock-server)';

const METHOD_OPTIONS: DropdownOption[] = [
  { value: 'POST',  label: 'POST' },
  { value: 'PUT',   label: 'PUT' },
  { value: 'GET',   label: 'GET' },
  { value: 'PATCH', label: 'PATCH' },
];

interface Props {
  route: MockRoute;
  onUpdate: (patch: Partial<MockRoute>) => void;
}

export function WebhookPanel({ route, onUpdate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const webhooks = route.webhooks ?? [];

  const addWebhook = () => {
    const w: WebhookConfig = {
      id: crypto.randomUUID(),
      url: 'https://example.com/callback',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"event":"request_matched","path":"{{request.path}}","method":"{{request.method}}"}',
      delayMs: 0,
      enabled: true,
    };
    onUpdate({ webhooks: [...webhooks, w] });
  };

  const update = (idx: number, patch: Partial<WebhookConfig>) => {
    const updated = [...webhooks];
    updated[idx] = { ...updated[idx], ...patch };
    onUpdate({ webhooks: updated });
  };

  const remove = (idx: number) => {
    onUpdate({ webhooks: webhooks.filter((_, i) => i !== idx) });
  };

  return (
    <div className="border border-dashed border-[rgba(255,255,255,0.1)] rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left cursor-pointer hover:bg-[rgba(255,255,255,0.03)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="transition-transform duration-150 text-[var(--color-text-muted)]" style={{ display: 'inline-flex', transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
            <ChevronDownIcon size={12} />
          </span>
          <span className="text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Webhooks / Callbacks</span>
          {webhooks.length > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ background: `color-mix(in srgb, ${MOCK_ACCENT} 15%, transparent)`, color: MOCK_ACCENT }}>
              {webhooks.filter(w => w.enabled).length} active
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); addWebhook(); setExpanded(true); }}
          className="flex items-center gap-1 h-[20px] px-2 text-[10px] rounded cursor-pointer"
          style={{ color: MOCK_ACCENT, background: `color-mix(in srgb, ${MOCK_ACCENT} 10%, transparent)` }}
        >
          <PlusIcon size={9} /> Add Webhook
        </button>
      </button>

      {expanded && (
        <div className="px-3 pb-3 flex flex-col gap-3 border-t border-[rgba(255,255,255,0.07)]">
          {webhooks.length === 0 ? (
            <div className="pt-3 text-center">
              <p className="text-[11px] text-[var(--color-text-muted)] opacity-60">No webhooks configured.</p>
              <p className="text-[10px] text-[var(--color-text-muted)] opacity-40 mt-1">
                Webhooks fire after a request matches this route. Use template variables in the URL and body.
              </p>
              <button type="button" onClick={addWebhook} className="mt-2 flex items-center gap-1 mx-auto h-[24px] px-3 text-[11px] rounded cursor-pointer"
                style={{ color: MOCK_ACCENT, background: `color-mix(in srgb, ${MOCK_ACCENT} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${MOCK_ACCENT} 25%, transparent)` }}>
                <PlusIcon size={10} /> Add Webhook
              </button>
            </div>
          ) : (
            webhooks.map((wh, idx) => (
              <WebhookItem key={wh.id} webhook={wh} index={idx} onUpdate={p => update(idx, p)} onRemove={() => remove(idx)} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Single webhook item ──────────────────────────────────────────────────────

function WebhookItem({ webhook, index, onUpdate, onRemove }: {
  webhook: WebhookConfig;
  index: number;
  onUpdate: (patch: Partial<WebhookConfig>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 bg-[rgba(255,255,255,0.02)] group">
        <button
          type="button"
          onClick={() => onUpdate({ enabled: !webhook.enabled })}
          className="relative w-[24px] h-[12px] rounded-full transition-colors cursor-pointer flex-shrink-0"
          style={{ backgroundColor: webhook.enabled ? 'var(--color-success)' : 'var(--color-muted-fallback)' }}
        >
          <span className="absolute top-[2px] w-[8px] h-[8px] rounded-full bg-white transition-all" style={{ left: webhook.enabled ? '14px' : '2px' }} />
        </button>
        <span className="text-[10px] text-[var(--color-text-muted)]">#{index + 1}</span>
        <span className="flex-1 text-[11px] font-mono text-[var(--color-text-muted)] truncate cursor-pointer" onClick={() => setExpanded(v => !v)}>
          {webhook.method} {webhook.url}
        </span>
        {webhook.delayMs ? <span className="text-[9px] text-[var(--color-text-muted)]">{webhook.delayMs}ms delay</span> : null}
        <button type="button" onClick={onRemove} className="p-1 opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] hover:text-[var(--color-error)] cursor-pointer">
          <TrashIcon size={11} />
        </button>
      </div>

      {expanded && (
        <div className="px-2.5 pb-2.5 flex flex-col gap-1.5">
          {/* Method + URL */}
          <div className="flex items-center gap-1.5">
            <StyledDropdown
              size="sm"
              options={METHOD_OPTIONS}
              value={webhook.method}
              onChange={v => onUpdate({ method: v as HttpMethod })}
            />
            <input
              type="text"
              value={webhook.url}
              onChange={e => onUpdate({ url: e.target.value })}
              placeholder="https://your-server.com/callback"
              className="flex-1 h-[26px] px-2 text-[11px] font-mono rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
            />
          </div>
          {/* Delay */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--color-text-muted)]">Delay</span>
            <input
              type="number"
              value={webhook.delayMs ?? 0}
              onChange={e => onUpdate({ delayMs: parseInt(e.target.value) || 0 })}
              className="w-[70px] h-[22px] px-1.5 text-[11px] rounded bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] focus:outline-none"
            />
            <span className="text-[10px] text-[var(--color-text-muted)]">ms after response is sent</span>
          </div>
          {/* Body */}
          <div>
            <p className="text-[10px] text-[var(--color-text-muted)] mb-1">Body (supports {'{{request.*}}'} and {'{{response.*}}'} templates)</p>
            <textarea
              value={webhook.body ?? ''}
              onChange={e => onUpdate({ body: e.target.value })}
              rows={3}
              className="w-full px-2 py-1.5 text-[11px] font-mono rounded-md bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[var(--color-text-primary)] focus:outline-none resize-none"
              spellCheck={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}
