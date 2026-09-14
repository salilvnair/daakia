/**
 * Settings → DK8S → General — which kubectl dk8s runs.
 *
 * The setup screen has always been able to take a path, but only when kubectl
 * was missing: a machine with two of them — the cluster's pinned version beside
 * whatever Docker Desktop installed — had no way to say which one, because
 * nothing was broken enough to show the screen that asks.
 *
 * So it lives here too, where a setting belongs, and both write the same
 * stored path through the same message.
 */
import { useEffect, useState } from 'react';
import { ButtonView, TextInputView } from '@salilvnair/dui';
import { useK8sStore } from '../../store/k8s-store';
import { CheckCircleIcon, WarningTriangleIcon, TerminalIcon } from '../../icons';

const ACCENT = 'var(--color-dk8s)';

export function KubectlBinarySetting() {
  const env = useK8sStore(s => s.env);
  const busy = useK8sStore(s => s.busy);
  const probe = useK8sStore(s => s.probe);
  const setKubectlPath = useK8sStore(s => s.setKubectlPath);
  const apply = useK8sStore(s => s.apply);

  /*
    This page can be opened without dk8s ever having been, so it has to hear
    dk8s: messages itself rather than relying on the panel being mounted —
    otherwise it shows an empty field and claims nothing is configured.
  */
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as Record<string, unknown>;
      if (typeof msg?.type === 'string' && msg.type.startsWith('dk8s:')) apply(msg);
    };
    window.addEventListener('message', handler);
    if (!env) probe();
    return () => window.removeEventListener('message', handler);
    // Once: `probe` would otherwise re-run on every store write it causes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const override = env?.override;
  const fromEnv = !!env?.overrideFromEnv;
  const [draft, setDraft] = useState('');
  /* Follow the stored value until somebody types — a path set from the setup
     screen should appear here without a reload. */
  const [typed, setTyped] = useState(false);
  useEffect(() => { if (!typed) setDraft(override ?? ''); }, [override, typed]);

  const dirty = draft.trim() !== (override ?? '');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        <span className="text-[9.5px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
          kubectl
        </span>
        <div className="flex-1 h-px" style={{ background: 'var(--color-surface-border)' }} />
      </div>

      <div className="flex flex-col gap-3 px-4 py-3.5 rounded-lg"
           style={{
             background: 'var(--color-surface)',
             border: '1px solid var(--color-surface-border)',
             maxWidth: '92ch',
           }}>
        <div className="flex items-start gap-3">
          <TerminalIcon size={15} style={{ color: ACCENT, marginTop: 2, flexShrink: 0 }} />
          <div className="flex flex-col gap-1.5 min-w-0 flex-1">
            <span className="text-[13px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
              Which kubectl to run
            </span>
            <span className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              Leave it empty and dk8s looks on PATH, then in the usual places for this
              platform. Set it when there is more than one on the machine, or when the
              editor cannot see the one your terminal uses — a GUI-launched editor inherits
              a login shell&rsquo;s PATH only sometimes.
            </span>
          </div>
        </div>

        {/* What is in force right now, before anything is typed. */}
        <div className="flex items-start gap-2 text-[11.5px]"
             style={{ color: 'var(--color-text-muted)' }}>
          {env?.present ? (
            <>
              <CheckCircleIcon size={13} style={{ marginTop: 1, flexShrink: 0, color: 'var(--color-success)' }} />
              <span>
                Running <code className="font-mono" style={{ color: 'var(--color-text-secondary)' }}>{env.binary}</code>
                {env.clientVersion ? <> · {env.clientVersion}</> : null}
                {override ? <> · set by hand</> : <> · found on PATH</>}
              </span>
            </>
          ) : (
            <>
              <WarningTriangleIcon size={13} style={{ marginTop: 1, flexShrink: 0, color: 'var(--color-warning)' }} />
              <span>
                Not found yet. dk8s will show its install guide until it is.
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="flex-1 min-w-0">
            <TextInputView
              value={draft}
              onChange={e => { setTyped(true); setDraft(e.target.value); }}
              placeholder={env?.platform === 'win32'
                ? 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\kubectl.exe'
                : '/usr/local/bin/kubectl'}
              size="sm"
              /* Fills the row: a path is long and a 200px box shows a third of it. */
              width="fullWidth"
              accentColor={ACCENT}
              disabled={fromEnv}
            />
          </span>
          <ButtonView
            label={busy ? 'Checking…' : 'Use this'}
            size="sm"
            variant="secondary"
            accentColor={ACCENT}
            color={!dirty || busy || fromEnv ? 'var(--color-text-muted)' : ACCENT}
            disabled={!dirty || busy || fromEnv}
            onClick={() => { setKubectlPath(draft.trim()); setTyped(false); }}
          />
          {override && !fromEnv && (
            <ButtonView
              label="Clear"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => { setKubectlPath(''); setDraft(''); setTyped(false); }}
            />
          )}
        </div>

        {fromEnv && (
          <span className="text-[11px]" style={{ color: 'var(--color-warning)' }}>
            <code className="font-mono">DAAKIA_KUBECTL</code> is set in the environment and wins
            over this setting, so the field is read-only while it is there.
          </span>
        )}
      </div>
    </div>
  );
}
