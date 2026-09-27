/**
 * "This pod": the three facts that decide whether Run will work, before it is
 * pressed.
 *
 * Each is a finding from inside the container (the capability probe), not a
 * guess from the image name — see pod-classify on the host. And when one of
 * them changes what Run does, the row says what it does instead: a read-only
 * /tmp is not a failure, it is a different directory.
 */
import { IconButtonView, IconSize, TableSkeletonView } from '@salilvnair/dui';
import { RefreshIcon } from '../../../icons';
import type { PyProbe } from '../../../store/dk8s-python-store';
import { OK, BAD, WARN, MUTED } from '../tone';

export function ThisPodPanel({ probe, execAllowed, onRefresh, title = 'THIS POD' }: {
  probe?: PyProbe;
  /** From the namespace's access probe, known before anything execs. */
  execAllowed: boolean;
  onRefresh?: () => void;
  title?: string;
}) {
  const v = probe?.verdict;
  const tmp = probe?.writableDirs.includes('/tmp');
  const exec = execAllowed && probe?.execAllowed !== false;

  return (
    <div className="flex flex-col"
         style={{ padding: '10px 12px', borderTop: '1px solid var(--color-surface-border)' }}>
      <div className="flex items-center">
        <span className="text-[10.5px] font-bold flex-1" style={{ letterSpacing: '0.06em', marginBottom: 7, color: 'var(--color-text-secondary)' }}>
          {title}
        </span>
        {onRefresh && (
          <IconButtonView size="xs" icon={<RefreshIcon size={IconSize.inline} />} tooltip="Look again"
                          aria-label="Probe this pod again" onClick={onRefresh} disabled={probe?.busy} />
        )}
      </div>
      {probe?.busy && !v ? (
        <TableSkeletonView rows={3} rowHeight={16} columns={[{ width: '55%' }, { width: 'flex' }]} />
      ) : (
        <>
          <Fact label="python3"
                value={probe?.python3Version?.replace(/^Python\s+/i, '')
                  ?? (probe?.pythonVersion ? `none (python ${probe.pythonVersion.replace(/^Python\s+/i, '')})` : probe ? 'none' : '—')}
                tone={v?.ok ? 'var(--color-text-primary)' : probe ? BAD : MUTED} />
          <Fact label="/tmp writable"
                value={!probe ? '—' : tmp ? 'yes' : probe.base ? `no — using ${probe.base}` : 'no — streamed on stdin'}
                tone={!probe ? MUTED : tmp ? OK : WARN} />
          <Fact label="exec" value={exec ? 'allowed' : 'not allowed'} tone={exec ? OK : BAD} />
          {v && !v.ok && (
            <span className="text-[10.5px] leading-relaxed mt-1" style={{ color: BAD }}>{v.reason}</span>
          )}
          {v?.ok && probe && !probe.base && (
            <span className="text-[10.5px] leading-relaxed mt-1" style={{ color: MUTED }}>
              Nothing here is writable, so Run pipes the script to <code>python3 -</code> and leaves no file.
              Debug needs a file for pdb, so it is off for this pod.
            </span>
          )}
        </>
      )}
    </div>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[11.5px]" style={{ lineHeight: 1.9 }}>
      <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      <span className={label === 'python3' ? 'font-mono truncate' : 'truncate'} style={{ color: tone }} title={value}>{value}</span>
    </div>
  );
}
