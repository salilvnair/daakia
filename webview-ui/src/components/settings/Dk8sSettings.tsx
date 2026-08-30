/**
 * dk8s settings.
 *
 * Everything about how dk8s behaves against a live cluster, including the
 * diagnostics that used to live under a separate "Doctor" heading — they are
 * dk8s features, collected from dk8s pods, and splitting them across two
 * settings pages made the reader hunt for which page owned a switch.
 *
 * Switches here get room to explain themselves rather than being lines in a
 * list. Turning one off is a real decision with a real consequence, and the
 * person making it should be able to read what that consequence is without
 * leaving the page.
 */
import { useEffect } from 'react';
import { Dk8sIcon, MemoryIcon, WarningTriangleIcon, StethoscopeIcon } from '../../icons';
import { useK8sStore } from '../../store/k8s-store';
import { LogFormatSettings } from './LogFormatSettings';

const ACCENT = 'var(--color-dk8s)';

function Toggle({ on, onChange, label, description, children }: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-3 px-4 py-3.5 rounded-lg cursor-pointer"
           style={{
             background: 'var(--color-surface)',
             border: '1px solid var(--color-surface-border)',
             maxWidth: '92ch',
           }}>
      <input
        type="checkbox"
        checked={on}
        onChange={e => onChange(e.target.checked)}
        style={{ accentColor: ACCENT, marginTop: 2, width: 15, height: 15 }}
      />
      <span className="flex flex-col gap-1.5 flex-1 min-w-0">
        <span className="text-[13px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
          {label}
        </span>
        <span className="text-[11.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          {description}
        </span>
        {children}
      </span>
    </label>
  );
}

export function Dk8sSettings() {
  const guardHeapDump = useK8sStore(s => s.guardHeapDump);
  const setGuardHeapDump = useK8sStore(s => s.setGuardHeapDump);
  const apply = useK8sStore(s => s.apply);

  // The Settings tab can be opened without dk8s ever having been, so this page
  // has to hear dk8s: messages itself rather than relying on K8sPanel being
  // mounted — otherwise the checkbox shows its default instead of the stored
  // value.
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as Record<string, unknown>;
      if (typeof msg?.type === 'string' && msg.type === 'dk8s:guardHeapDump') apply(msg);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [apply]);

  return (
    // Full width. The 680px cap was inherited from when this page held one
    // checkbox; the format list has rules, previews and an editor beside each
    // other, and squeezing those into half a wide window wastes the half that
    // makes them readable.
    <div className="flex flex-col gap-4 px-5 py-4">
      <div className="flex items-center gap-2">
        <Dk8sIcon size={16} color={ACCENT} />
        <span className="text-[14px]" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
          dk8s
        </span>
      </div>
      <span className="text-[11.5px] leading-relaxed"
            style={{ color: 'var(--color-text-muted)', maxWidth: '72ch' }}>
        How dk8s behaves against a live cluster.
      </span>

      {/* Sub-heading, so the page can grow other groups (log formats, artifact
          retention) without the diagnostics switches losing their context. */}
      <div className="flex items-center gap-1.5 mt-1">
        <StethoscopeIcon size={12} color="var(--color-text-muted)" />
        <span className="text-[9.5px] uppercase tracking-wider"
              style={{ color: 'var(--color-text-muted)' }}>
          collecting diagnostics
        </span>
        <div className="flex-1 h-px" style={{ background: 'var(--color-surface-border)' }} />
      </div>
      <span className="text-[11px] leading-relaxed -mt-2"
            style={{ color: 'var(--color-text-muted)', maxWidth: '72ch' }}>
        Everything in this group is about the cost to the pod, not to you.
      </span>

      <Toggle
        on={guardHeapDump}
        onChange={setGuardHeapDump}
        label="Block heap dumps when the pod has no memory to spare"
        description={
          'Before offering a heap dump, dk8s reads the container’s memory limit, its current '
          + 'usage, and the JVM’s heap, and estimates what the dump would cost. If that would '
          + 'take the pod close to its limit, the button is disabled and the numbers are shown '
          + 'instead.'
        }
      >
        <span className="flex flex-col gap-2 mt-1.5">
          <span className="flex items-start gap-2 text-[11px] leading-relaxed"
                style={{ color: 'var(--color-text-muted)' }}>
            <MemoryIcon size={12} color="var(--color-text-muted)" />
            <span>
              The case this exists for: many images mount <code className="font-mono">/tmp</code> as
              tmpfs. A tmpfs write is a memory write, so dumping a 6&nbsp;GiB heap there adds
              6&nbsp;GiB to the container&rsquo;s accounting and the kernel kills it — while every
              number you would have checked by hand looked fine.
            </span>
          </span>
          <span className="flex items-start gap-2 text-[11px] leading-relaxed"
                style={{ color: guardHeapDump ? 'var(--color-text-muted)' : 'var(--color-warning)' }}>
            <WarningTriangleIcon size={12}
                                 color={guardHeapDump ? 'var(--color-text-muted)' : 'var(--color-warning)'} />
            <span>
              {guardHeapDump
                ? 'With this off, dk8s still shows the numbers and the verdict, but takes the dump when asked.'
                : 'Currently off. dk8s will take a heap dump on a pod it expects to be OOM-killed by it.'}
            </span>
          </span>
        </span>
      </Toggle>

      <span className="text-[10.5px] leading-relaxed"
            style={{ color: 'var(--color-text-muted)', maxWidth: '72ch' }}>
        Thread dumps, class histograms, flight recordings and connection snapshots are
        never blocked by this — none of them writes a file the size of the heap.
      </span>

      <div className="mt-3" />
      <LogFormatSettings />
    </div>
  );
}
