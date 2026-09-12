/**
 * Log formats.
 *
 * The editor is built around one idea: never write a pattern blind. Sample
 * lines sit next to the pattern, the preview updates on every keystroke, and
 * the preview is computed by the HOST using the same compiled format the log
 * stream will use — so what you see here is what the log view will do, not a
 * second implementation that can drift from it.
 */
import { useEffect, useRef, useState } from 'react';
import {
  ButtonView, TextInputView, MultilineInputView, SegmentedControlView,
  CheckboxView, SelectInputView,
} from '@salilvnair/dui';
import { Hint } from './prose';
import { SparkleIcon, TrashIcon, PlusIcon, SpinnerIcon, WarningTriangleIcon } from '../../icons';
import { useDk8sFormatStore, type LogFormat, type PreviewRow } from '../../store/dk8s-format-store';
import { levelColor } from '../k8s/log-view';
import { useUiStateStore } from '../../store/ui-state-store';

const ACCENT = 'var(--color-dk8s)';
const AI_ACCENT = 'var(--color-protocol-ai)';

const KIND_HELP: Record<string, string> = {
  json: 'Lines that are JSON objects. Parsed with JSON.parse — no pattern needed, and the fastest of the three.',
  logfmt: 'Lines of key=value pairs. Scanned directly, also without a pattern.',
  pattern: 'Anything else. Write a template with %{…} placeholders, or a raw /regex/ if the placeholders cannot express it.',
};

function Field({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[9.5px] uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}
      </span>
      {children}
      {hint && <span className="text-[10.5px] leading-relaxed text-[var(--color-text-muted)]">{hint}</span>}
    </div>
  );
}

/** One parsed line, so the effect of a pattern is visible rather than described. */
function PreviewLine({ row }: { row: PreviewRow }) {
  if (!row.matched) {
    return (
      <div className="flex items-baseline gap-2 px-2 py-0.5 font-mono"
           style={{ fontSize: 10.5, opacity: 0.45 }}>
        <span style={{ color: 'var(--color-text-muted)', width: 52 }}>no match</span>
        <span className="truncate" style={{ color: 'var(--color-text-muted)' }}>{row.line}</span>
      </div>
    );
  }
  return (
    <div className="flex items-baseline gap-2 px-2 py-0.5 font-mono" style={{ fontSize: 10.5 }}>
      <span className="shrink-0 uppercase text-right"
            style={{ width: 52, color: levelColor(row.level ?? 'other'), fontWeight: 600 }}>
        {row.level === 'other' ? '—' : row.level}
      </span>
      {row.logger && (
        <span className="shrink-0 truncate" style={{ maxWidth: 150, color: 'var(--color-text-muted)' }}>
          {row.logger}
        </span>
      )}
      <span className="truncate" style={{ color: 'var(--color-text-primary)' }}>
        {row.message}
      </span>
    </div>
  );
}

function FormatRow({ f, builtin }: { f: LogFormat; builtin: boolean }) {
  const { draft, editDraft, closeDraft, remove, toggleBuiltin, disabled } = useDk8sFormatStore();
  const off = builtin ? disabled.includes(f.id) : f.enabled === false;
  // The editor belongs to the row it was opened from, not to the top of the
  // page: opening it far from the thing you clicked leaves you scrolling back
  // to find out which format you are looking at.
  const open = draft?.id === f.id;

  const rule = f.match && Object.entries(f.match).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`);

  return (
    /*
      The row and its editor are one element of the list, not two.

      As siblings in a fragment they were separated by the list's own gap — a
      strip of page showing between a card's header and its body, which is the
      last thing left making them read as two cards. Wrapped, the gap falls
      between formats where it belongs.
    */
    <div className="flex flex-col">
    <div className="flex items-center gap-3 px-3 py-2 rounded-md"
         style={{
           background: 'var(--color-surface)',
           border: `1px solid ${open ? `color-mix(in srgb, ${ACCENT} 45%, transparent)` : 'var(--color-surface-border)'}`,
           opacity: off ? 0.5 : 1,
           /*
             Open, the row and its editor are one card.

             The editor already dropped its top border, but the row kept its
             bottom one, so a rule still ran between the name and the form that
             belongs to it — two stacked cards, which is exactly what the
             squared-off corners were there to avoid.
           */
           ...(open ? { borderBottom: 'none' } : {}),
           borderBottomLeftRadius: open ? 0 : undefined,
           borderBottomRightRadius: open ? 0 : undefined,
         }}>
      <CheckboxView
        checked={!off}
        size="sm"
        accentColor={ACCENT}
        onChange={(v) => builtin
          ? toggleBuiltin(f.id, v)
          : useDk8sFormatStore.getState().patchDraft({})}
      />
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
            {f.name}
          </span>
          <span className="text-[9.5px] px-1.5 py-0.5 rounded uppercase tracking-wide"
                style={{ background: 'var(--color-surface-hover)', color: 'var(--color-text-muted)' }}>
            {f.kind}
          </span>
          {builtin && (
            <span className="text-[9.5px]" style={{ color: 'var(--color-text-muted)' }}>built in</span>
          )}
        </div>
        {rule && rule.length > 0 ? (
          <span className="text-[10.5px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
            applies when {rule.join(' and ')}
          </span>
        ) : (
          <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
            {builtin
              ? 'Matched by content when no rule claims the pod.'
              : 'No rule — only used when picked by hand, or matched by content.'}
          </span>
        )}
      </div>

      {/* A toggle, so the same button that opened it closes it. It used to
          re-open the already-open editor, which looked like nothing happening. */}
      {/*
        Close is tinted red, View and Edit are not.

        All three were the accent, so the button that dismisses the editor
        looked exactly like Save two rows below it — the same colour promising
        two opposite outcomes. Red is not a warning here; it is the same
        vocabulary the rest of the app uses for "this closes/removes", and it
        is what stops Close reading as the primary action of the panel.
      */}
      <ButtonView
        label={open ? 'Close' : (builtin ? 'View' : 'Edit')}
        size="sm" variant="secondary"
        accentColor={open ? 'var(--color-error)' : ACCENT}
        color={open ? 'var(--color-error)' : undefined}
        onClick={() => (open ? closeDraft() : editDraft(f))}
        style={{
          background: open ? 'color-mix(in srgb, var(--color-error) 12%, transparent)' : 'transparent',
          borderColor: open ? 'color-mix(in srgb, var(--color-error) 40%, transparent)' : undefined,
        }}
      />
      {!builtin && (
        <ButtonView size="sm" variant="secondary" onClick={() => remove(f.id)}
                    iconLeft={<TrashIcon size={11} />} label=""
                    style={{ background: 'transparent' }} />
      )}
    </div>

    {open && <Editor />}
    </div>
  );
}

function Editor() {
  const {
    draft, sample, preview, previewError, saveError,
    detecting, detected,
    patchDraft, closeDraft, save, setSample, detect, applyDetected,
  } = useDk8sFormatStore();
  const [rawSample, setRawSample] = useState(sample.join('\n'));

  useEffect(() => { setRawSample(sample.join('\n')); }, [sample]);
  if (!draft) return null;

  const matched = preview.filter(p => p.matched).length;
  const levelled = preview.filter(p => p.matched && p.level && p.level !== 'other').length;

  return (
    <div className="flex flex-col gap-4 px-4 py-4"
         style={{
           background: 'var(--color-surface)',
           // Joined to the row above rather than floating: it is that row's
           // detail, and a gap between them reads as two unrelated cards.
           border: `1px solid color-mix(in srgb, ${ACCENT} 45%, transparent)`,
           borderTop: 'none',
           borderBottomLeftRadius: 8,
           borderBottomRightRadius: 8,
         }}>
      <div className="flex items-center gap-2">
        <span className="text-[13px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
          {draft.builtin ? draft.name : (draft.name || 'New format')}
        </span>
        {draft.builtin && (
          <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
            built in — editing makes a copy
          </span>
        )}
        <div className="flex-1" />
        <ButtonView label="Cancel" size="sm" variant="secondary" onClick={closeDraft}
                    style={{ background: 'transparent' }} />
        <ButtonView label="Save" size="sm" variant="secondary" accentColor={ACCENT} color={ACCENT}
                    onClick={save}
                    style={{
                      background: `color-mix(in srgb, ${ACCENT} 16%, transparent)`,
                      borderColor: `color-mix(in srgb, ${ACCENT} 45%, transparent)`,
                      fontWeight: 600,
                    }} />
      </div>

      {/*
        The form sits on its own surface inside the panel.

        Header, fields and preview were all one flat sheet, so nothing said
        where the row's identity stopped and its editable detail began — a page
        of controls with a title floating above them. An inset card puts a
        visible edge around the part you are editing while the panel keeps the
        accent that ties it to the row it belongs to.
      */}
      <div className="grid gap-4 p-3.5 rounded-lg"
           style={{
             gridTemplateColumns: 'minmax(280px, 1fr) minmax(320px, 1.2fr)',
             background: 'var(--color-panel, var(--color-surface-hover))',
             border: '1px solid var(--color-surface-border)',
           }}>
        {/* ── Definition ── */}
        <div className="flex flex-col gap-3.5">
          <Field label="name">
            <TextInputView value={draft.name} size="sm" accentColor={ACCENT}
                           onChange={e => patchDraft({ name: e.target.value })}
                           style={{ width: '100%' }} />
          </Field>

          <Field label="how the lines are structured" hint={KIND_HELP[draft.kind]}>
            <SegmentedControlView
              value={draft.kind}
              onChange={v => patchDraft({ kind: v as LogFormat['kind'] })}
              options={[
                { value: 'pattern', label: 'pattern' },
                { value: 'json', label: 'JSON' },
                { value: 'logfmt', label: 'logfmt' },
              ]}
              size="sm" variant="rounded" accentColor={ACCENT}
            />
          </Field>

          {draft.kind === 'pattern' ? (
            <Field
              label="pattern"
              hint="%{TIMESTAMP} %{LEVEL} %{LOGGER} %{MESSAGE} %{NUM} %{WORD} %{DATA}. One space matches any run of spaces, so padded columns are fine. A value starting with / is a raw regex."
            >
              <MultilineInputView
                value={draft.pattern ?? ''}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => patchDraft({ pattern: e.target.value })}
                rows={2}
                size="sm"
                accentColor={ACCENT}
                style={{ width: '100%', fontFamily: 'monospace', fontSize: 11.5 }}
              />
            </Field>
          ) : (
            <Field label="field names"
                   hint="Which key holds each value. Leave blank for the usual ones.">
              <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
                {(['timestamp', 'level', 'logger', 'message'] as const).map(k => (
                  <TextInputView
                    key={k}
                    value={draft.fields?.[k] ?? ''}
                    size="sm" accentColor={ACCENT}
                    placeholder={k}
                    onChange={e => patchDraft({ fields: { ...draft.fields, [k]: e.target.value } })}
                    style={{ width: '100%', fontFamily: 'monospace' }}
                  />
                ))}
              </div>
            </Field>
          )}

          <Field
            label="apply automatically when"
            hint="Every field you fill must match. Leave all blank and the format is only used when its shape matches the lines."
          >
            <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
              {([
                ['image', 'image contains'],
                ['namespace', 'namespace is'],
                ['pod', 'pod name contains'],
                ['label', 'label key=value'],
              ] as const).map(([k, ph]) => (
                <TextInputView
                  key={k}
                  value={draft.match?.[k] ?? ''}
                  size="sm" accentColor={ACCENT}
                  placeholder={ph}
                  onChange={e => patchDraft({ match: { ...draft.match, [k]: e.target.value } })}
                  style={{ width: '100%', fontFamily: 'monospace' }}
                />
              ))}
            </div>
          </Field>
        </div>

        {/* ── Sample and preview ── */}
        <div className="flex flex-col gap-3">
          <Field label="sample lines"
                 hint="Paste real output, or open a pod's log view and use Detect there.">
            <MultilineInputView
              value={rawSample}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRawSample(e.target.value)}
              onBlur={() => setSample(rawSample.split('\n').map(l => l.trim()).filter(Boolean))}
              rows={5}
              size="sm"
              accentColor={ACCENT}
              style={{ width: '100%', fontFamily: 'monospace', fontSize: 10.5 }}
            />
          </Field>

          <div className="flex items-center gap-2 flex-wrap">
            <ButtonView
              label={detecting ? 'Looking…' : 'Detect with AI'}
              size="sm" variant="secondary"
              accentColor={AI_ACCENT} color={AI_ACCENT}
              disabled={detecting || !rawSample.trim()}
              onClick={() => { setSample(rawSample.split('\n').map(l => l.trim()).filter(Boolean)); detect(); }}
              iconLeft={detecting ? <SpinnerIcon size={11} color={AI_ACCENT} /> : <SparkleIcon size={11} color={AI_ACCENT} />}
              style={{
                background: `color-mix(in srgb, ${AI_ACCENT} 16%, transparent)`,
                borderColor: `color-mix(in srgb, ${AI_ACCENT} 45%, transparent)`,
                fontWeight: 600,
              }}
            />
            {detected?.raw && !detected.error && (
              <ButtonView label="Use this" size="sm" variant="secondary"
                          accentColor={ACCENT} color={ACCENT} onClick={applyDetected}
                          style={{ background: `color-mix(in srgb, ${ACCENT} 14%, transparent)` }} />
            )}
            {preview.length > 0 && (
              <span className="text-[10.5px]" style={{ color: 'var(--color-text-muted)' }}>
                {matched}/{preview.length} parsed
                {matched > 0 && ` · ${levelled} with a level`}
              </span>
            )}
          </div>

          {detected?.error && (
            <span className="text-[11px]" style={{ color: 'var(--color-error)' }}>{detected.error}</span>
          )}

          {/* The model's answer is a proposal. It lands in the fields only when
              accepted, and the preview below shows what it does first. */}
          {detected?.raw && !detected.error && (
            <pre className="px-2 py-1.5 rounded font-mono overflow-auto m-0"
                 style={{
                   maxHeight: 110, fontSize: 10,
                   background: 'var(--color-surface-hover)',
                   color: 'var(--color-text-secondary)',
                   whiteSpace: 'pre-wrap',
                 }}>
              {detected.raw}
            </pre>
          )}

          <Field label="what these lines become">
            <div className="rounded-md overflow-auto"
                 style={{
                   maxHeight: 180,
                   background: 'var(--color-surface-hover)',
                   border: '1px solid var(--color-surface-border)',
                 }}>
              {previewError ? (
                <div className="flex items-start gap-2 px-2.5 py-2">
                  <WarningTriangleIcon size={12} color="var(--color-error)" />
                  <span className="text-[11px]" style={{ color: 'var(--color-error)' }}>{previewError}</span>
                </div>
              ) : preview.length === 0 ? (
                <span className="block px-2.5 py-2 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                  Paste some lines above to see how they parse.
                </span>
              ) : (
                preview.map((row, i) => <PreviewLine key={i} row={row} />)
              )}
            </div>
          </Field>
        </div>
      </div>

      {saveError && (
        <span className="text-[11.5px]" style={{ color: 'var(--color-error)' }}>{saveError}</span>
      )}
    </div>
  );
}

export function LogFormatSettings() {
  const { formats, builtins, draft, load, newDraft, apply, editDraft } = useDk8sFormatStore();
  const isExisting = !!draft
    && (formats.some(f => f.id === draft.id) || builtins.some(f => f.id === draft.id));

  // Reopen the row that was open last time. Waits for the lists, since they
  // arrive from the host after mount and there is nothing to reopen until then.
  const reopenId = useUiStateStore(s => s.prefs['dk8s.format.open']);
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || draft || !reopenId) return;
    const f = [...formats, ...builtins].find(x => x.id === reopenId);
    if (!f) return;
    restored.current = true;
    editDraft(f);
  }, [reopenId, formats, builtins, draft, editDraft]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as Record<string, unknown>;
      const t = typeof msg?.type === 'string' ? msg.type : '';
      if (/^dk8s:(formats|formatError|formatTested|sampleLines|formatDetected)$/.test(t)
          || (t.startsWith('ai:') && msg.tabId === 'dk8s-format-detect')) {
        apply(msg);
      }
    };
    window.addEventListener('message', handler);
    load();
    return () => window.removeEventListener('message', handler);
  }, [apply, load]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-[9.5px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
          log formats
        </span>
        <div className="flex-1 h-px" style={{ background: 'var(--color-surface-border)' }} />
        <ButtonView label="New format" size="sm" variant="secondary"
                    accentColor={ACCENT} color={ACCENT} onClick={newDraft}
                    iconLeft={<PlusIcon size={11} />}
                    style={{ background: `color-mix(in srgb, ${ACCENT} 14%, transparent)` }} />
      </div>

      <Hint
        lead={<>How dk8s reads your applications&rsquo; log lines — which part is the
          timestamp, which is the level, which is the logger.</>}
        points={[
          <>A pod with no matching format is checked against the built-ins by content, so
            most work with nothing set up here.</>,
          <>With no format at all, dk8s falls back to looking for an uppercase level word —
            which finds Java and Python, and misses JSON, logfmt and access logs entirely.</>,
        ]}
      />

      {/* A new format has no row to sit under, so it opens here. */}
      {draft && !isExisting && <Editor />}

      {formats.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {formats.map(f => <FormatRow key={f.id} f={f} builtin={false} />)}
        </div>
      )}

      <span className="text-[9.5px] uppercase tracking-wider mt-1"
            style={{ color: 'var(--color-text-muted)' }}>
        built in
      </span>
      <div className="flex flex-col gap-1.5">
        {builtins.map(f => <FormatRow key={f.id} f={f} builtin />)}
      </div>
    </div>
  );
}
