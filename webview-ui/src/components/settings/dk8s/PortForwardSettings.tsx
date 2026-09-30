/**
 * Settings → DK8S → Port forwarding.
 *
 * How a forward behaves once started: whether it comes back when the tunnel
 * drops and how many times, whether it follows its workload to a new pod,
 * when an idle one stops, which clusters count as production, and what to do
 * when the local port is taken. Read by every start — see
 * dk8s-port-forward-store.ts.
 */
import { CheckboxView, SegmentedControlView, SelectInputView, TextInputView } from '@salilvnair/dui';
import { useUiStateStore } from '../../../store/ui-state-store';
import { useK8sStore } from '../../../store/k8s-store';
import { isProdContext } from '../../../store/dk8s-port-forward-store';
import {
  usePfPrefs, PF_RECONNECT_PREF, PF_TRIES_PREF, PF_FOLLOW_PREF, PF_IDLE_PREF, PF_PROD_PREF, PF_TAKEN_PREF, useSets,
} from '../../k8s/port-forward-prefs';
import { PortForwardIcon, LockIcon } from '../../../icons';
import { ACCENT } from '../../k8s/tone';

const cardStyle: React.CSSProperties = { background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', maxWidth: '100%' };

function SectionRule({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9.5px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <div className="flex-1 h-px" style={{ background: 'var(--color-surface-border)' }} />
    </div>
  );
}

function Rule() {
  return <div className="h-px" style={{ background: 'var(--color-surface-border)' }} />;
}

function Row({ checked, onChange, label, hint, disabled, extra }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; hint?: React.ReactNode; disabled?: boolean; extra?: React.ReactNode;
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

function Group({ title, hint, children }: { title: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{title}</span>
      {hint && <span className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{hint}</span>}
      {children}
    </div>
  );
}

export function PortForwardSettings() {
  const p = usePfPrefs();
  const setPref = useUiStateStore(s => s.setPref);
  const prodRaw = useUiStateStore(s => s.prefs[PF_PROD_PREF] ?? '');
  const contexts = useK8sStore(s => s.contexts);
  const sets = useSets();
  const matching = contexts.map(c => c.name).filter(n => isProdContext(n, ['*prod*', ...p.prodPatterns]));

  return (
    <div className="flex flex-col gap-3">
      <SectionRule label="port forwarding" />

      <div className="flex items-start gap-3 px-4 py-3.5 rounded-lg" style={cardStyle}>
        <span style={{ color: ACCENT, display: 'inline-flex', marginTop: 2 }}><PortForwardIcon size={15} /></span>
        <span className="flex flex-col gap-1.5 flex-1 min-w-0">
          <span className="text-[13px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>A pod&rsquo;s port, on this machine</span>
          <span className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            Start one from a pod&rsquo;s <b>Ports</b> tab; every forward is on the pods page&rsquo;s <b>Forwards</b> panel.
            These settings apply to each forward as it starts.
          </span>
        </span>
      </div>

      <div className="flex flex-col gap-3 px-4 py-3.5 rounded-lg" style={cardStyle}>
        <Row checked disabled onChange={() => undefined} label="Bind to 127.0.0.1 only"
             hint={<span className="inline-flex items-center gap-1"><LockIcon size={10} /> Always. A tunnel that listens on the network hands the cluster to everyone on it.</span>} />

        <Rule />

        <Row checked={p.reconnect} onChange={v => setPref(PF_RECONNECT_PREF, v ? 'on' : 'off')}
             label="Reconnect when the tunnel drops"
             hint="A restart, a rollout or a network blip ends kubectl's tunnel. It comes back on the same local port after 1, 2, 5, 10 and 30 seconds."
             extra={
               <SelectInputView size="sm" width="sm" accentColor={ACCENT} disabled={!p.reconnect} value={String(p.tries)}
                                onChange={v => setPref(PF_TRIES_PREF, v)}
                                options={[1, 3, 5, 10].map(n => ({ value: String(n), label: `up to ${n} ${n === 1 ? 'try' : 'tries'}` }))} />
             } />

        <Row checked={p.follow} onChange={v => setPref(PF_FOLLOW_PREF, v ? 'on' : 'off')}
             label="Follow the workload across rollouts"
             hint="When the pod is replaced, move the forward to the deployment's newest ready pod — and say so on the card. Off, it waits for the same pod." />

        <Rule />

        <Group title="Stop an idle forward after" hint="Nothing going through it for this long. A production forward stops after 60 minutes whatever its traffic.">
          <div style={{ width: 180 }}>
            <SelectInputView size="sm" width="sm" accentColor={ACCENT} value={String(p.idleMinutes)}
                             onChange={v => setPref(PF_IDLE_PREF, v)}
                             options={[
                               { value: '15', label: '15 minutes' }, { value: '30', label: '30 minutes' },
                               { value: '60', label: '1 hour' }, { value: '120', label: '2 hours' }, { value: '0', label: 'never' },
                             ]} />
          </div>
        </Group>

        <Rule />

        <Group title="Production contexts"
               hint={<>Contexts matching <code>*prod*</code> always count. Add more — names or patterns with <code>*</code>, separated by spaces or commas. A production forward asks first, is tagged PROD everywhere, and stops after an hour.</>}>
          <TextInputView size="sm" value={prodRaw} placeholder="e.g. *-live  payments-eu" accentColor={ACCENT}
                         onChange={e => setPref(PF_PROD_PREF, e.target.value)}
                         inputStyle={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)' }} />
          <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
            {matching.length
              ? <>Production here: {matching.map(n => <code key={n} style={{ marginRight: 6 }}>{n}</code>)}</>
              : 'None of your contexts counts as production.'}
          </span>
        </Group>

        <Rule />

        <Group title="When the local port is taken" hint="What the start dialog offers in its place. It always says which process holds the port.">
          <SegmentedControlView size="sm" accentColor={ACCENT} value={p.whenTaken}
                                onChange={v => setPref(PF_TAKEN_PREF, v)}
                                options={[{ value: 'next', label: 'next free port' }, { value: 'plus10000', label: 'add 10000' }, { value: 'ask', label: 'ask' }]} />
        </Group>
      </div>

      <div className="px-4 py-3 rounded-lg text-[11.5px] leading-relaxed" style={{ ...cardStyle, color: 'var(--color-text-secondary)' }}>
        <b style={{ color: 'var(--color-text-primary)' }}>{sets.length} saved set{sets.length === 1 ? '' : 's'}.</b> Save a forward from its card; start a set from the
        Forwards panel. Sets are saved with the workspace and travel with Git Sync, so a teammate gets them too.
      </div>
    </div>
  );
}
