/**
 * RequestChaining — extract values from response body/headers and chain to next request.
 * Feature 6B.1 — Request Chaining
 *
 * Lets users define extractions like: response.data.id → {{userId}}
 * The variable is then available in subsequent requests via the env system.
 */
import { useState } from 'react';
import { useToastStore } from '../../store/toast-store';
import { logUiEvent } from '../../store/ui-audit-store';
import { PlusIcon, TrashIcon, LinkIcon, CheckCircleFilledIcon } from '../../icons';
import { ActionButtonView, RadioGroupView, TextInputView, IconButtonView, ArrowRightIcon } from '@salilvnair/dui';
import { PathField } from './PathField';
import { applyChainExtractions, extractValue } from '../../services/request/chaining';
import type { ChainExtraction } from '../../store/tabs-store';

export type { ChainExtraction };

/** One grid for the header row and every rule, so the columns line up. */
const ROW_COLS = 'grid-cols-[24px_1fr_28px_minmax(160px,0.45fr)_28px]';

interface Props {
  tabId: string;
  extractions: ChainExtraction[];
  onExtractionsChange: (extractions: ChainExtraction[]) => void;
  responseBody?: string;
  responseHeaders?: Record<string, string>;
}

export function RequestChaining({ tabId, extractions, onExtractionsChange, responseBody = '', responseHeaders = {} }: Props) {
  const [collapsed, setCollapsed] = useState(true);
  const addToast = useToastStore(s => s.addToast);

  const addExtraction = () => {
    onExtractionsChange([
      ...extractions,
      { id: `ex-${Date.now()}`, source: 'body', path: '', variableName: '', enabled: true },
    ]);
  };

  const removeExtraction = (id: string) => {
    onExtractionsChange(extractions.filter(e => e.id !== id));
  };

  const updateExtraction = (id: string, partial: Partial<ChainExtraction>) => {
    onExtractionsChange(extractions.map(e => e.id === id ? { ...e, ...partial } : e));
  };

  /*
    The same run the arrival of a response does on its own, on demand.

    Kept because a rule is written against a response you already have, and
    pressing the button is how you find out the path is `data.id` and not
    `id` without sending again.
  */
  const applyExtractions = () => {
    const { applied, missed } = applyChainExtractions(tabId, {
      body: responseBody, headers: responseHeaders,
    });
    logUiEvent('rest.chain_apply', {
      // The names, never the values: an extracted value is a token as often
      // as not, and an audit row is a place it must not end up.
      variables: applied.map(a => a.name),
      missed,
    });
    if (applied.length === 0) {
      addToast({ type: 'warning', message: 'No values extracted. Check your paths.' });
      return;
    }
    addToast({
      type: missed.length ? 'warning' : 'success',
      message: `Set ${applied.map(a => `{{${a.name}}}`).join(', ')}`
        + (missed.length ? ` — no value at the path for ${missed.join(', ')}` : ''),
    });
  };

  const extractedPreviews: Array<{ ex: ChainExtraction; value: string | undefined }> = responseBody
    ? extractions.filter(e => e.enabled && e.path)
        .map(ex => ({ ex, value: extractValue(ex, responseBody, responseHeaders) }))
    : [];

  // `rounded-md` here and on the row below: the same 6px the bulk-edit box
  // above uses. Two panels in one column with different corners read as two
  // designs.
  return (
    <div className="border rounded-md overflow-hidden" style={{ borderColor: 'var(--color-surface-border)' }}>
      {/* Header */}
      <button type="button" onClick={() => setCollapsed(p => !p)}
        className="w-full flex items-center justify-between px-3 py-2 cursor-pointer"
        style={{ backgroundColor: 'var(--color-surface-hover)' }}>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            ⛓ Response Chaining
          </span>
          {extractions.filter(e => e.enabled).length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold text-white"
              style={{ backgroundColor: 'var(--color-info)' }}>
              {extractions.filter(e => e.enabled).length}
            </span>
          )}
        </div>
        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{collapsed ? '▼' : '▲'}</span>
      </button>

      {!collapsed && (
        <div className="p-4 flex flex-col gap-3">
          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            Extract values from the response and inject them as environment variables for use in subsequent requests.
          </p>

          {/*
            A key/value table, like the ones this sits beside.

            The row was a checkbox, a column of three stacked radios, two
            boxes and an arrow, all on one line — nothing lined up with the
            Params or Form-data tables a tab away, and the source radios ate
            the left margin of every row. Now: a header row, a round enable
            mark, path and variable in aligned columns with a real arrow
            between them, and the source as one horizontal group above the
            pair it applies to.
          */}
          {extractions.length > 0 && (
            <div className={`grid ${ROW_COLS} gap-2 px-4`}>
              <div />
              <div className="text-[10px] uppercase tracking-wide font-medium"
                   style={{ color: 'var(--color-text-muted)' }}>Path in response</div>
              <div />
              <div className="text-[10px] uppercase tracking-wide font-medium"
                   style={{ color: 'var(--color-text-muted)' }}>Variable</div>
              <div />
            </div>
          )}

          {extractions.map(ex => {
            const preview = extractedPreviews.find(p => p.ex.id === ex.id)?.value;
            return (
              <div key={ex.id} className="flex flex-col gap-3 p-4 rounded-md border"
                style={{ borderColor: 'var(--color-surface-border)', backgroundColor: 'var(--color-panel)' }}>

                {/* Where the value comes from, across the top of its own rule. */}
                <RadioGroupView
                  direction="horizontal"
                  size="md"
                  value={ex.source}
                  onChange={v => updateExtraction(ex.id, { source: v as ChainExtraction['source'] })}
                  options={[
                    { value: 'body', label: 'Body' },
                    { value: 'header', label: 'Header' },
                    { value: 'status', label: 'Status' },
                  ]}
                  accentColor="var(--color-protocol-rest, var(--color-accent))"
                />

                <div className={`grid ${ROW_COLS} gap-2 items-start group ${ex.enabled ? '' : 'opacity-50'}`}>
                  {/* The same round mark the Form-data and Params tables use
                      for "this row counts". */}
                  <button
                    type="button"
                    title={ex.enabled ? 'Rule is on — click to disable' : 'Rule is off — click to enable'}
                    onClick={() => updateExtraction(ex.id, { enabled: !ex.enabled })}
                    className="flex items-center justify-center h-[28px] border-none bg-transparent cursor-pointer p-0"
                  >
                    {ex.enabled
                      ? <CheckCircleFilledIcon size={16} checked className="text-[var(--color-success)]" />
                      : <CheckCircleFilledIcon size={16} checked={false} />}
                  </button>

                  <div className="min-w-0 flex flex-col gap-1">
                    <PathField
                      value={ex.path}
                      onChange={next => updateExtraction(ex.id, { path: next })}
                      responseBody={ex.source === 'body' ? responseBody : undefined}
                      placeholder={ex.source === 'header' ? 'Authorization' : ex.source === 'status' ? '(status code)' : 'data.user.id'}
                      disabled={ex.source === 'status'}
                    />

                    {/*
                      What this path pulls out of the response on screen,
                      under the box that names it.
                    */}
                    {responseBody && ex.path && (
                      <span className="text-[10px] font-mono truncate px-0.5"
                        style={{ color: preview ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                        {preview ?? 'no value at this path'}
                      </span>
                    )}
                  </div>

                  {/* Reads as the direction it describes: out of the response,
                      into the variable. */}
                  <div className="flex items-center justify-center h-[28px]">
                    <ArrowRightIcon size={17} strokeWidth={2.4}
                      style={{ color: 'var(--color-text-muted)' }} />
                  </div>

                  <TextInputView
                    size="md"
                    width="fw"
                    value={ex.variableName}
                    onChange={e => updateExtraction(ex.id, { variableName: e.target.value })}
                    placeholder="variableName"
                    inputStyle={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                  />

                  {/* The Variables table's own delete, copied rather than
                      approximated: hidden until the row is hovered, muted
                      until this button is, then red. */}
                  <div className="flex items-center justify-center h-[28px]">
                    <button
                      type="button"
                      onClick={() => removeExtraction(ex.id)}
                      title="Remove this rule"
                      className="opacity-0 group-hover:opacity-100 p-1 text-[var(--color-text-muted)] hover:text-[var(--color-error)] cursor-pointer transition-all border-none bg-transparent"
                    >
                      <TrashIcon size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/*
            Both buttons in the same tinted shape the rest of the app uses.

            Apply was solid `--color-success` with white text: a filled green
            slab shouting louder than anything on the panel, for an action
            that is a convenience — the rules run on every response by
            themselves. A tint states the action without claiming the eye.
          */}
          {/* Right-aligned, like every other footer action in the app: the
              eye leaves a form at its end, not at its left margin. */}
          <div className="flex items-center justify-end gap-2">
            <ActionButtonView
              size="sm"
              onClick={addExtraction}
              accentColor="var(--color-text-secondary)"
              icon={(iconSize) => <PlusIcon size={iconSize} style={{ flexShrink: 0 }} />}
              label="Add extraction"
            />

            {/*
              Present whenever there are rules, disabled until there is a
              response to read them from.

              It used to render only when both were true, so it appeared and
              vanished as you worked — and the first question anyone asks of a
              control that disappears is where it went, not what it needed. A
              disabled button with a reason answers that on hover.
            */}
            {extractions.length > 0 && (
              <ActionButtonView
                size="sm"
                onClick={applyExtractions}
                disabled={!responseBody}
                title={responseBody
                  ? 'Read these rules against the response on screen and set the variables'
                  : 'Send the request first — there is no response to extract from yet'}
                accentColor="var(--color-success)"
                icon={(iconSize) => <LinkIcon size={iconSize} style={{ flexShrink: 0 }} />}
                label="Apply to environment"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
