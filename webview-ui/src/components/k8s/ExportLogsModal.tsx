/**
 * Bulk log export.
 *
 * You reach for this when something has just gone wrong across several pods
 * and you want the evidence on disk before it rolls out of the ring buffer.
 * That framing drives the defaults: the whole log, both container generations,
 * timestamps kept — the safe answer, with narrowing available rather than
 * required.
 */
import { useState } from 'react';
import {
  ModalView, ButtonView, TextInputView, DateTimeInputView, SegmentedControlView,
} from '@salilvnair/dui';
import { useK8sStore } from '../../store/k8s-store';
import { softPrimary } from './button-style';

const ACCENT = 'var(--color-dk8s)';
/** Every control in this dialog uses the same dui size, so they line up. */
const SIZE = 'sm';

type RangeKind = 'all' | '30m' | '1h' | '2h' | 'between';
type SliceKind = 'all' | 'head' | 'tail';

const RANGE_SECONDS: Record<string, number> = { '30m': 1800, '1h': 3600, '2h': 7200 };

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[9.5px] uppercase tracking-wider text-[var(--color-text-muted)]">{label}</span>
      {children}
      {hint && <span className="text-[10.5px] text-[var(--color-text-muted)]">{hint}</span>}
    </div>
  );
}

/** `datetime-local` wants `YYYY-MM-DDTHH:mm`, in local time. */
function localInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ExportLogsModal({ onClose }: { onClose: () => void }) {
  const { selected, pods, exportLogs, exportState, logExportOpen, detail } = useK8sStore();

  const [range, setRange] = useState<RangeKind>('all');
  const [slice, setSlice] = useState<SliceKind>('all');
  const [lines, setLines] = useState('500');
  const [includePrevious, setIncludePrevious] = useState(true);
  const [keepTimestamps, setKeepTimestamps] = useState(true);

  const now = new Date();
  const [from, setFrom] = useState(() => localInputValue(new Date(now.getTime() - 3600_000)));
  const [to, setTo] = useState(() => localInputValue(now));

  // Opened from a pod's log view, this exports that pod; opened from the grid,
  // it exports the ticked ones.
  const single = logExportOpen && detail ? detail : undefined;
  const chosen = single ? [single] : pods.filter(p => selected.includes(p.uid));
  const crashers = chosen.filter(p => p.restarts > 0).length;

  const submit = () => {
    const n = Math.max(1, parseInt(lines, 10) || 500);
    exportLogs({
      range:
        range === 'all' ? { kind: 'all' }
        : range === 'between'
          ? { kind: 'between', fromIso: new Date(from).toISOString(), toIso: new Date(to).toISOString() }
          : { kind: 'since', seconds: RANGE_SECONDS[range] },
      slice: slice === 'all' ? { kind: 'all' } : { kind: slice, lines: n },
      includePrevious,
      keepTimestamps,
    });
  };

  const busy = exportState?.phase === 'running';

  return (
    <ModalView
      open
      onClose={busy ? () => {} : onClose}
      title={single ? 'Download log' : 'Export logs'}
      subtitle={single
        // Opened from inside a pod, the pod is not a selection to be counted —
        // it is the subject, so name it.
        ? single.name
        : `${chosen.length} pod${chosen.length === 1 ? '' : 's'} selected`}
      size="md"
      headerColor={ACCENT}
      footerRight={
        <div className="flex items-center gap-2">
          <ButtonView label="Cancel" size="sm" variant="secondary" disabled={busy} onClick={onClose} />
          <ButtonView
            label={busy ? 'Exporting…' : 'Choose folder and export'}
            size="sm" variant="secondary" disabled={busy || !chosen.length}
            accentColor={ACCENT}
            color={busy || !chosen.length ? 'var(--color-text-muted)' : ACCENT}
            onClick={submit}
            style={softPrimary(ACCENT, !busy && chosen.length > 0)}
          />
        </div>
      }
    >
      <div className="flex flex-col gap-4 py-1">
        <Field label="Time range">
          <SegmentedControlView
            value={range}
            onChange={v => setRange(v as RangeKind)}
            options={[
              { value: 'all', label: 'Complete log' },
              { value: '30m', label: 'Last 30 min' },
              { value: '1h', label: 'Last hour' },
              { value: '2h', label: 'Last 2 hours' },
              { value: 'between', label: 'Between\u2026' },
            ]}
            size={SIZE}
            variant="rounded"
            accentColor={ACCENT}
          />
        </Field>

        {/* dui's picker rather than a native datetime-local input: the native
            one renders the browser's own calendar, which ignores the theme
            entirely and looks like a different application. Same
            `YYYY-MM-DDTHH:mm` value shape, so it is a straight swap. */}
        {range === 'between' && (
          <div className="flex items-center gap-2 flex-wrap">
            <DateTimeInputView value={from} onChange={setFrom} size={SIZE} color={ACCENT} />
            <span className="text-[11px] text-[var(--color-text-muted)]">to</span>
            <DateTimeInputView value={to} onChange={setTo} size={SIZE} color={ACCENT} />
          </div>
        )}

        <Field
          label="How much"
          hint={slice === 'all'
            ? undefined
            : slice === 'head'
              ? 'The first N lines of whatever the range selected — the start of an incident.'
              : 'The last N lines of the range — where a pod usually dies.'}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <SegmentedControlView
              value={slice}
              onChange={v => setSlice(v as SliceKind)}
              options={[
                { value: 'all', label: 'Everything' },
                { value: 'head', label: 'Head' },
                { value: 'tail', label: 'Tail' },
              ]}
              size={SIZE}
              variant="rounded"
              accentColor={ACCENT}
            />
            {slice !== 'all' && (
              <TextInputView
                value={lines}
                onChange={e => setLines(e.target.value.replace(/[^0-9]/g, ''))}
                size={SIZE} accentColor={ACCENT}
                style={{ width: 90, fontFamily: 'monospace' }}
              />
            )}
            {slice !== 'all' && <span className="text-[11px] text-[var(--color-text-muted)]">lines</span>}
          </div>
        </Field>

        <div className="flex flex-col gap-2">
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={includePrevious}
                   onChange={e => setIncludePrevious(e.target.checked)}
                   style={{ accentColor: ACCENT, marginTop: 2 }} />
            <span className="flex flex-col gap-0.5">
              <span className="text-[12px] text-[var(--color-text-primary)]">
                Include the previous container
              </span>
              <span className="text-[10.5px] text-[var(--color-text-muted)]">
                {crashers > 0
                  ? single
                    ? 'This pod has restarted. Its current log is usually just a few lines of boot — the failure is in the previous run.'
                    : `${crashers} of these pods have restarted. Their current log is usually just a few lines of boot — the failure is in the previous run.`
                  : 'For a pod that has restarted, the failure is in the run before the current one.'}
              </span>
            </span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={keepTimestamps}
                   onChange={e => setKeepTimestamps(e.target.checked)}
                   style={{ accentColor: ACCENT }} />
            <span className="text-[12px] text-[var(--color-text-primary)]">Keep timestamps</span>
          </label>
        </div>

        <div className="flex flex-col gap-1 px-3 py-2 rounded-md"
             style={{ background: 'var(--color-surface-hover)' }}>
          <span className="text-[10.5px] text-[var(--color-text-muted)]">
            {single ? 'Written as ' : <>One file per pod, named </>}
            <code className="font-mono">
              {single ? `${single.name}.log` : '<pod>.log'}
            </code>
            {new Set(chosen.map(p => p.namespace)).size > 1 && (
              <> — prefixed with the namespace, since more than one is selected</>
            )}
            . You will be asked where to put {single ? 'it' : 'them'}.
          </span>
        </div>

        {exportState?.phase === 'running' && (
          <div className="flex flex-col gap-1">
            <span className="text-[11.5px]" style={{ color: ACCENT }}>
              {exportState.done} / {exportState.total} · {exportState.pod}
            </span>
            <div style={{ height: 3, borderRadius: 2, background: 'var(--color-surface-hover)' }}>
              <div style={{
                height: '100%', borderRadius: 2, background: ACCENT,
                width: `${Math.round((exportState.done / Math.max(1, exportState.total)) * 100)}%`,
                transition: 'width .2s ease',
              }} />
            </div>
          </div>
        )}

        {exportState?.phase === 'error' && (
          <span className="text-[11.5px] font-mono" style={{ color: 'var(--color-error)' }}>
            {exportState.error}
          </span>
        )}
      </div>
    </ModalView>
  );
}
