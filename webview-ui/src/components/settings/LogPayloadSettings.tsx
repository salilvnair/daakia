/**
 * Settings → DK8S → Logs → how a log event is drawn, and what the counters count.
 *
 * One switch at the top that means it: off, the log is plain text again and
 * nothing below is consulted. That ordering is the whole design — somebody who
 * does not want their log rearranged should need one click to say so, not six.
 *
 * Everything under it is dimmed rather than hidden while the switch is off, so
 * the choices somebody made are still visible as the ones that would come back.
 */
import { useState } from 'react';
import { ButtonView, CheckboxView, SegmentedControlView, SelectInputView, TextInputView } from '@salilvnair/dui';
import { useUiStateStore } from '../../store/ui-state-store';
import {
  payloadPrefs, shapesText, resetRenderingPrefs,
  PAYLOAD_DRAW_PREF, PAYLOAD_SHAPES_PREF, PAYLOAD_MODE_PREF,
  PAYLOAD_DEPTH_PREF, PAYLOAD_MAX_PREF, PAYLOAD_SECRETS_PREF,
  PAYLOAD_COLLAPSED_PREF, PAYLOAD_REMEMBER_PREF, PAYLOAD_KEEP_RAW_PREF,
  TRACE_APP_FIRST_PREF, TRACE_HOME_PREF, PAYLOAD_OPEN_LOGGERS_PREF, openLoggers,
} from '../../components/k8s/log-payload-prefs';
import { LOG_FOLD_PREF, prefOn } from '../../components/k8s/log-view-prefs';
import type { PayloadShape } from '../../components/k8s/log-payload';
import { BracesIcon } from '../../icons';

const ACCENT = 'var(--color-dk8s)';

const cardStyle: React.CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-surface-border)',
  maxWidth: '100%',
};

const SHAPES: { id: PayloadShape; label: string; hint: string }[] = [
  { id: 'json', label: 'JSON', hint: 'whole line, or after the text' },
  { id: 'xml', label: 'XML', hint: 'envelopes and fragments' },
  { id: 'yaml', label: 'YAML', hint: 'config dumps, joined back into one event' },
  { id: 'kv', label: 'key=value', hint: 'logfmt and the like, three pairs or more' },
];

export function LogPayloadSettings() {
  const prefs = useUiStateStore(s => s.prefs);
  const setPref = useUiStateStore(s => s.setPref);
  const p = payloadPrefs(prefs);
  const on = (key: string, v: boolean) => setPref(key, v ? 'on' : 'off');
  const [confirmReset, setConfirmReset] = useState(false);

  /* `p.shapes` is empty while the switch is off, so the ticks come from what is
     stored rather than from what is in force — otherwise turning the master
     switch off would appear to untick every shape as well. */
  const ticked = payloadPrefs({ ...prefs, [PAYLOAD_DRAW_PREF]: 'on' }).shapes;
  const toggleShape = (id: PayloadShape) => {
    const next = ticked.includes(id) ? ticked.filter(s => s !== id) : [...ticked, id];
    setPref(PAYLOAD_SHAPES_PREF, shapesText(next));
  };
  const remembered = openLoggers(prefs).size;

  return (
    <div className="flex flex-col gap-3">
      <SectionRule label="payloads" />

      {/* ── The master switch ── */}
      <div className="flex items-start gap-3 px-4 py-3.5 rounded-lg" style={{ ...cardStyle, borderColor: p.draw ? `color-mix(in srgb, ${ACCENT} 45%, var(--color-surface-border))` : undefined }}>
        <CheckboxView checked={p.draw} accentColor={ACCENT} onChange={v => on(PAYLOAD_DRAW_PREF, v)} />
        <span className="flex flex-col gap-1.5 flex-1 min-w-0">
          <span className="text-[13px] flex items-center gap-2" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
            <span style={{ color: ACCENT, display: 'inline-flex' }}><BracesIcon size={14} /></span>
            Draw structured payloads
          </span>
          <span className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            A line carrying JSON, XML, YAML or a run of <code>key=value</code> pairs reads as its sentence,
            with a chip for the payload; opening the chip draws it under the line. Nothing is claimed
            unless it parses. Off, every line is plain text, exactly as the container wrote it — and
            everything below follows this one.
          </span>
        </span>
      </div>

      <div className="flex flex-col gap-3 px-4 py-3.5 rounded-lg" style={{ ...cardStyle, opacity: p.draw ? 1 : 0.55 }}>
        {/* ── Which shapes ── */}
        <Group title="Which shapes">
          <div className="grid gap-x-6 gap-y-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
            {SHAPES.map(s => (
              <Row key={s.id} checked={ticked.includes(s.id)} disabled={!p.draw} onChange={() => toggleShape(s.id)} label={s.label} hint={s.hint} />
            ))}
          </div>
          {p.draw && ticked.length === 0 && (
            <span className="text-[11px]" style={{ color: 'var(--color-warning)' }}>
              Nothing ticked — the switch above is on, but there is no shape left to look for.
            </span>
          )}
        </Group>

        <Rule />

        {/* ── How it opens ── */}
        <Group title="How it opens" hint="The starting point for every payload, and the switch in the Logs toolbar. Each line keeps its own switch, because the reason to change is always a particular line.">
          <div className="flex items-center gap-3 flex-wrap">
            <SegmentedControlView
              size="sm"
              accentColor={ACCENT}
              disabled={!p.draw}
              value={p.mode}
              onChange={v => setPref(PAYLOAD_MODE_PREF, v)}
              options={[{ value: 'tree', label: 'Tree' }, { value: 'pretty', label: 'Pretty' }, { value: 'raw', label: 'Raw' }]}
            />
            <span className="text-[11.5px]" style={{ color: 'var(--color-text-secondary)' }}>Open to depth</span>
            <SelectInputView
              size="sm"
              width="sm"
              accentColor={ACCENT}
              value={String(p.depth)}
              onChange={v => setPref(PAYLOAD_DEPTH_PREF, v)}
              options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '12', label: 'all' }]}
            />
          </div>
          <Row checked={p.collapsed} disabled={!p.draw} onChange={v => on(PAYLOAD_COLLAPSED_PREF, v)}
               label="Collapsed to one line until clicked"
               hint="Off, every payload is drawn open under its line — a longer log, nothing to click." />
          <Row checked={p.remember} disabled={!p.draw} onChange={v => on(PAYLOAD_REMEMBER_PREF, v)}
               label="Remember what I opened, per logger"
               hint={`Open one payload from a logger and its others open too, and stay open next time.${remembered ? ` ${remembered} logger${remembered === 1 ? '' : 's'} remembered.` : ''}`}
               extra={remembered > 0 ? (
                 <ButtonView variant="ghost" size="xs" accentColor={ACCENT} onClick={() => setPref(PAYLOAD_OPEN_LOGGERS_PREF, '[]')}>Forget them</ButtonView>
               ) : undefined} />
        </Group>

        <Rule />

        {/* ── Limits and secrets ── */}
        <Group title="Limits and secrets">
          <div className="flex items-center gap-2.5">
            <span className="text-[11.5px]" style={{ color: 'var(--color-text-secondary)' }}>Stop parsing above</span>
            <SelectInputView
              size="sm"
              width="sm"
              accentColor={ACCENT}
              value={String(Math.round(p.maxChars / 1024))}
              onChange={v => setPref(PAYLOAD_MAX_PREF, v)}
              options={[{ value: '64', label: '64 KB' }, { value: '256', label: '256 KB' }, { value: '1024', label: '1 MB' }]}
            />
          </div>
          <span className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            A longer line stays raw, with a note on it saying why. So does a line cut at 32 KB when it was
            read: its payload lost its end and can no longer parse.
          </span>
          <Row checked={p.hideSecrets} disabled={!p.draw} onChange={v => on(PAYLOAD_SECRETS_PREF, v)}
               label="Hide values on secret-looking keys"
               hint="token, password, secret, authorization — drawn as dots, revealed per line. Copy and Raw always mean the line as the pod wrote it." />
          <Row checked={p.keepRaw} disabled={!p.draw} onChange={v => on(PAYLOAD_KEEP_RAW_PREF, v)}
               label="Keep the raw text available on every line"
               hint="Raw beside Tree and Pretty on every payload. Off, the switch offers only the two drawn modes." />
        </Group>
      </div>

      {/* ── Stack traces and counters ── */}
      <SectionRule label="stack traces and counters" />
      <div className="flex flex-col gap-3 px-4 py-3.5 rounded-lg" style={cardStyle}>
        <Row checked={prefOn(prefs, LOG_FOLD_PREF)} onChange={v => on(LOG_FOLD_PREF, v)}
             label="Fold a stack trace into its first line"
             hint="The frames sit behind one chip on the exception's line. The Logs toolbar has the same switch." />
        <Row checked={p.appFirst} onChange={v => on(TRACE_APP_FIRST_PREF, v)}
             label="Put your own packages first when it opens"
             hint="Your frames lead and the framework's follow, each part in its own order. Without your packages below, whatever is not known framework leads." />
        <div className="flex flex-col gap-1.5" style={{ paddingLeft: 28 }}>
          <span className="text-[12px]" style={{ color: 'var(--color-text-primary)' }}>Your packages</span>
          <TextInputView
            size="sm"
            width="lg"
            accentColor={ACCENT}
            value={prefs[TRACE_HOME_PREF] ?? ''}
            onChange={e => setPref(TRACE_HOME_PREF, e.target.value)}
            placeholder="com.acme, org.acme.billing"
          />
          <span className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            Package prefixes that are your code. With them, a folded trace says <em>24 frames · 3 of yours</em>;
            without, it counts only what is known framework — it never guesses which frames are yours.
          </span>
        </div>
        <div className="flex flex-col gap-1 px-3 py-2.5 rounded-md text-[11.5px] leading-relaxed"
             style={{ background: 'color-mix(in srgb, var(--color-warning) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-warning) 35%, transparent)', color: 'var(--color-text-secondary)' }}>
          <span><b style={{ color: 'var(--color-warning)' }}>The ERROR chip counts events, never frames.</b>{' '}
            One exception with 24 frames is one error whether it is folded or open, so the number stops
            jumping when you expand something. Lines inside a folded trace are not counted at all.</span>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[11px] flex-1" style={{ color: 'var(--color-text-muted)' }}>
          Parsing happens on this machine. Nothing here sends a log anywhere.
        </span>
        <ButtonView variant="secondary" size="sm" accentColor={ACCENT}
                    color={confirmReset ? 'var(--color-warning)' : undefined}
                    title="Every setting on this card back to how it came. Your packages and the loggers you left open are kept."
                    onClick={() => {
                      if (!confirmReset) { setConfirmReset(true); setTimeout(() => setConfirmReset(false), 3000); return; }
                      setConfirmReset(false);
                      resetRenderingPrefs();
                    }}>
          {confirmReset ? 'Click again to reset' : 'Back to defaults'}
        </ButtonView>
      </div>
    </div>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{title}</span>
      {hint && <span className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{hint}</span>}
      {children}
    </div>
  );
}

function Row({ checked, onChange, label, hint, disabled, extra }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean; extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span style={{ marginTop: 1 }}>
        <CheckboxView checked={checked} disabled={disabled} size="sm" accentColor={ACCENT} onChange={onChange} />
      </span>
      <span className="flex flex-col gap-0.5 min-w-0 flex-1 cursor-pointer" onClick={() => !disabled && onChange(!checked)}>
        <span className="text-[12px]" style={{ color: 'var(--color-text-primary)' }}>{label}</span>
        {hint && <span className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>{hint}</span>}
      </span>
      {extra}
    </div>
  );
}

function Rule() {
  return <div className="h-px" style={{ background: 'var(--color-surface-border)' }} />;
}

function SectionRule({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9.5px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: 'var(--color-surface-border)' }} />
    </div>
  );
}
