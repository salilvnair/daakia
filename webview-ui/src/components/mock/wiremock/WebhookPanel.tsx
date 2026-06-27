/**
 * WebhookPanel — Configure outbound webhooks/callbacks fired after route matches (6A.23).
 */
import { useState } from 'react';
import {
  SelectInputView, TextInputView, ButtonView, IconButtonView,
  ToggleSwitchView, EditorView, ResizablePanelView, type SelectOption,
} from '@salilvnair/dui';
import { ChevronDownIcon, PlusIcon, TrashIcon } from '../../../icons';
import type { MockRoute, WebhookConfig, HttpMethod } from '../mock-types';
import { logUiEvent } from '../../../store/ui-audit-store';

const MOCK_ACCENT = 'var(--color-mock-server)';

const METHOD_OPTIONS: SelectOption[] = [
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
    logUiEvent('mock.webhook_add');
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
    logUiEvent('mock.webhook_del');
    onUpdate({ webhooks: webhooks.filter((_, i) => i !== idx) });
  };

  return (
    <div className="border border-dashed border-[rgba(255,255,255,0.1)] rounded-lg overflow-hidden">
      <div
        className="w-full flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[rgba(255,255,255,0.03)] transition-colors"
        onClick={() => setExpanded(v => !v)}
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
        <ButtonView
          size="md"
          variant="ghost"
          accentColor={MOCK_ACCENT}
          iconLeft={<PlusIcon size={12} />}
          onClick={e => { e.stopPropagation(); addWebhook(); setExpanded(true); }}
        >
          Add Webhook
        </ButtonView>
      </div>

      {expanded && (
        <div className="px-3 pb-3 flex flex-col gap-3 border-t border-[rgba(255,255,255,0.07)]">
          {webhooks.length === 0 ? (
            <div className="pt-3 text-center">
              <p className="text-[11px] text-[var(--color-text-muted)] opacity-60">No webhooks configured.</p>
              <p className="text-[10px] text-[var(--color-text-muted)] opacity-40 mt-1">
                Webhooks fire after a request matches this route. Use template variables in the URL and body.
              </p>
              <div className="mt-2 flex justify-center">
                <ButtonView
                  size="md"
                  variant="ghost"
                  accentColor={MOCK_ACCENT}
                  iconLeft={<PlusIcon size={10} />}
                  onClick={addWebhook}
                >
                  Add Webhook
                </ButtonView>
              </div>
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
        <ToggleSwitchView
          checked={webhook.enabled}
          onChange={(v) => onUpdate({ enabled: v })}
          accentColor="var(--color-success)"
          size="xs"
        />
        <span className="text-[10px] text-[var(--color-text-muted)]">#{index + 1}</span>
        <span
          className="flex-1 text-[11px] font-mono text-[var(--color-text-muted)] truncate cursor-pointer"
          onClick={() => setExpanded(v => !v)}
        >
          {webhook.method} {webhook.url}
        </span>
        {webhook.delayMs ? <span className="text-[9px] text-[var(--color-text-muted)]">{webhook.delayMs}ms delay</span> : null}
        <IconButtonView
          size="sm"
          icon={<TrashIcon size={11} />}
          accentColor="var(--color-error)"
          className="opacity-0 group-hover:opacity-100"
          onClick={onRemove}
        />
      </div>

      {expanded && (
        <div className="px-2.5 pb-2.5 flex flex-col gap-1.5">
          {/* Method + URL */}
          <div className="flex items-center gap-1.5">
            <SelectInputView
              size="md"
              options={METHOD_OPTIONS}
              value={webhook.method}
              onChange={v => onUpdate({ method: v as HttpMethod })}
            />
            <TextInputView
              value={webhook.url}
              onChange={e => onUpdate({ url: e.target.value })}
              placeholder="https://your-server.com/callback"
              size="md"
              style={{ flex: 1, fontFamily: 'monospace' }}
            />
          </div>
          {/* Delay */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--color-text-muted)]">Delay</span>
            <TextInputView
              type="number"
              value={String(webhook.delayMs ?? 0)}
              onChange={e => onUpdate({ delayMs: parseInt(e.target.value) || 0 })}
              size="md"
              style={{ width: 70, fontFamily: 'monospace' }}
            />
            <span className="text-[10px] text-[var(--color-text-muted)]">ms after response is sent</span>
          </div>
          {/* Body */}
          <div>
            <p className="text-[10px] text-[var(--color-text-muted)] mb-1">Body (supports {'{{request.*}}'} and {'{{response.*}}'} templates)</p>
            <ResizablePanelView defaultHeight={80} minHeight={60} maxHeight={300}>
              <EditorView
                value={webhook.body ?? ''}
                onChange={val => onUpdate({ body: val })}
                language="json"
                placeholder={'{\n  "event": "route_matched",\n  "path": "{{request.path}}"\n}'}
                height="100%"
                bordered
              />
            </ResizablePanelView>
          </div>
        </div>
      )}
    </div>
  );
}
