/**
 * Settings → DK8S → Logs → the machine half of a line.
 *
 * One switch at the top that means it: off, the log is plain text again and
 * nothing below is consulted. That ordering is the whole design — somebody who
 * does not want their log rearranged should need one click to say so, not six.
 *
 * Everything under it is dimmed rather than hidden while the switch is off, so
 * the choices somebody made are still visible as the ones that would come back.
 */
import { useUiStateStore } from '../../store/ui-state-store';
import {
  payloadPrefs, shapesText,
  PAYLOAD_DRAW_PREF, PAYLOAD_SHAPES_PREF, PAYLOAD_MODE_PREF,
  PAYLOAD_DEPTH_PREF, PAYLOAD_MAX_PREF, PAYLOAD_SECRETS_PREF,
  type PayloadMode,
} from '../../components/k8s/log-payload-prefs';
import type { PayloadShape } from '../../components/k8s/log-payload';
import { BracesIcon } from '../../icons';

const ACCENT = 'var(--color-dk8s)';

const cardStyle: React.CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-surface-border)',
  maxWidth: '100%',
};

const SHAPES: { id: PayloadShape; label: string; hint: string }[] = [
  { id: 'json', label: 'JSON', hint: 'a whole-line event, or a body after the message' },
  { id: 'xml', label: 'XML', hint: 'SOAP envelopes and fragments' },
  { id: 'kv', label: 'key=value', hint: 'logfmt and the like, three pairs or more' },
];

const MODES: { id: PayloadMode; label: string; hint: string }[] = [
  { id: 'tree', label: 'Tree', hint: 'collapsible, the way the response viewer draws JSON' },
  { id: 'pretty', label: 'Pretty', hint: 'indented text, nothing to click' },
  { id: 'raw', label: 'Raw', hint: 'exactly what the pod wrote' },
];

export function LogPayloadSettings() {
  const prefs = useUiStateStore(s => s.prefs);
  const setPref = useUiStateStore(s => s.setPref);
  const p = payloadPrefs(prefs);

  /* `p.shapes` is empty while the switch is off, so the ticks come from what is
     stored rather than from what is in force — otherwise turning the master
     switch off would appear to untick every shape as well. */
  const ticked = payloadPrefs({ ...prefs, [PAYLOAD_DRAW_PREF]: 'on' }).shapes;

  const toggleShape = (id: PayloadShape) => {
    const next = ticked.includes(id) ? ticked.filter(s => s !== id) : [...ticked, id];
    setPref(PAYLOAD_SHAPES_PREF, shapesText(next));
  };

  return (
    <div className="flex flex-col gap-3">
      <SectionRule label="payloads" />

      <label className="flex items-start gap-3 px-4 py-3.5 rounded-lg cursor-pointer" style={cardStyle}>
        <input
          type="checkbox"
          checked={p.draw}
          onChange={e => setPref(PAYLOAD_DRAW_PREF, e.target.checked ? 'on' : 'off')}
          style={{ accentColor: ACCENT, marginTop: 2, width: 15, height: 15 }}
        />
        <span className="flex flex-col gap-1.5 flex-1 min-w-0">
          <span className="text-[13px] flex items-center gap-2"
                style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
            <span style={{ color: ACCENT, display: 'inline-flex' }}><BracesIcon size={14} /></span>
            Draw structured payloads
          </span>
          <span className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            A line that ends in JSON, XML or a run of <code>key=value</code> pairs gets a chip; opening it
            draws the payload under the line, the way a stack trace folds. The message itself is never
            rewritten, and nothing is claimed unless it parses. Off, every line is plain text.
          </span>
        </span>
      </label>

      <div className="flex flex-col gap-3 px-4 py-3.5 rounded-lg"
           style={{ ...cardStyle, opacity: p.draw ? 1 : 0.55 }}>

        <div className="flex flex-col gap-2">
          <span className="text-[12px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
            Which shapes
          </span>
          {SHAPES.map(s => (
            <label key={s.id} className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={ticked.includes(s.id)}
                disabled={!p.draw}
                onChange={() => toggleShape(s.id)}
                style={{ accentColor: ACCENT, width: 14, height: 14 }}
              />
              <span className="text-[12px]" style={{ color: 'var(--color-text-primary)' }}>{s.label}</span>
              <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{s.hint}</span>
            </label>
          ))}
          {p.draw && ticked.length === 0 && (
            <span className="text-[11px]" style={{ color: 'var(--color-warning)' }}>
              Nothing ticked — the switch above is on, but there is no shape left to look for.
            </span>
          )}
        </div>

        <div className="h-px" style={{ background: 'var(--color-surface-border)' }} />

        <div className="flex flex-col gap-2">
          <span className="text-[12px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
            How it opens
          </span>
          <span className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            The starting point for every payload. Each line keeps its own switch, because the reason to
            change is always a particular line.
          </span>
          <div className="flex gap-1.5">
            {MODES.map(m => (
              <button
                key={m.id}
                type="button"
                disabled={!p.draw}
                onClick={() => setPref(PAYLOAD_MODE_PREF, m.id)}
                title={m.hint}
                className="px-2.5 py-1 rounded cursor-pointer text-[11.5px]"
                style={p.mode === m.id
                  ? { background: ACCENT, color: 'var(--color-on-accent, #10262b)', border: '1px solid transparent' }
                  : {
                    background: 'transparent',
                    color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-surface-border)',
                  }}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2.5 mt-1">
            <label htmlFor="payload-depth" className="text-[11.5px]" style={{ color: 'var(--color-text-secondary)' }}>
              Open a tree to depth
            </label>
            <select
              id="payload-depth"
              value={String(p.depth)}
              disabled={!p.draw}
              onChange={e => setPref(PAYLOAD_DEPTH_PREF, e.target.value)}
              className="px-2 py-1 rounded text-[11.5px]"
              style={{
                background: 'var(--color-input-bg, var(--color-panel))',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-surface-border)',
              }}
            >
              {[1, 2, 3, 4, 12].map(d => (
                <option key={d} value={d}>{d === 12 ? 'all of it' : d}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="h-px" style={{ background: 'var(--color-surface-border)' }} />

        <div className="flex flex-col gap-2">
          <span className="text-[12px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
            Limits and secrets
          </span>

          <div className="flex items-center gap-2.5">
            <label htmlFor="payload-max" className="text-[11.5px]" style={{ color: 'var(--color-text-secondary)' }}>
              Stop parsing a line longer than
            </label>
            <select
              id="payload-max"
              value={String(Math.round(p.maxChars / 1024))}
              disabled={!p.draw}
              onChange={e => setPref(PAYLOAD_MAX_PREF, e.target.value)}
              className="px-2 py-1 rounded text-[11.5px]"
              style={{
                background: 'var(--color-input-bg, var(--color-panel))',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-surface-border)',
              }}
            >
              {[64, 256, 1024].map(kb => (
                <option key={kb} value={kb}>{kb >= 1024 ? '1 MB' : `${kb} KB`}</option>
              ))}
            </select>
          </div>
          <span className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            A megabyte of base64 on one line is not a payload anybody wants drawn, and parsing it on every
            scroll is how a log view stops scrolling.
          </span>

          <label className="flex items-start gap-2.5 cursor-pointer mt-1">
            <input
              type="checkbox"
              checked={p.hideSecrets}
              disabled={!p.draw}
              onChange={e => setPref(PAYLOAD_SECRETS_PREF, e.target.checked ? 'on' : 'off')}
              style={{ accentColor: ACCENT, marginTop: 2, width: 14, height: 14 }}
            />
            <span className="flex flex-col gap-1 min-w-0">
              <span className="text-[12px]" style={{ color: 'var(--color-text-primary)' }}>
                Hide values on secret-looking keys
              </span>
              <span className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                <code>token</code>, <code>password</code>, <code>secret</code>, <code>authorization</code> and
                their kin are drawn as dots, with a button on the payload to show them. Only what is drawn —
                Copy, Raw and Export always mean the line as the pod wrote it.
              </span>
            </span>
          </label>
        </div>
      </div>
    </div>
  );
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
