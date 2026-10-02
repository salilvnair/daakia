/**
 * Errors… — from a pod's right-click: which window, and for several pods how
 * to lay them out.
 *
 * What opens is the log view itself, not a screen of its own: one pod opens
 * its Logs tab, read for the window and narrowed to ERROR; several open as a
 * split, every pane the same. So the errors are read, filtered and opened
 * exactly the way every other log is — and widening the window or clearing
 * the level is the toolbar already there.
 */
import { useMemo, useState } from 'react';
import { create } from 'zustand';
import { DateTimeInputView, IconSize, ModalView, SegmentedControlView } from '@salilvnair/dui';
import { useK8sStore, localTime, ERRORS_TAIL, type PodSummary } from '../../store/k8s-store';
import { useSplitStore, MAX_PANES, type SplitMode } from '../../store/dk8s-split-store';
import { logUiEvent } from '../../store/ui-audit-store';
import { SPLIT_MODES } from './SplitLogs';
import { PF, tint, PfButton, PfBar } from './pf-ui';

/** The pods the popup is open for; empty is closed. Its own store, because the menu that opens it closes first. */
export const useErrorsDialog = create<{ pods: PodSummary[]; open: (pods: PodSummary[]) => void; close: () => void }>(set => ({
  pods: [],
  open: pods => set({ pods }),
  close: () => set({ pods: [] }),
}));

const WINDOWS = [
  { value: '10', label: 'Last 10 min' },
  { value: '30', label: 'Last 30 min' },
  { value: '60', label: 'Last 1 hour' },
  { value: 'custom', label: 'Custom' },
];

export function ErrorsDialog() {
  const pods = useErrorsDialog(s => s.pods);
  if (!pods.length) return null;
  /* Keyed by the pods, so each opening starts fresh. */
  return <ErrorsDialogBody key={pods.map(p => p.uid).join(',')} pods={pods} />;
}

function ErrorsDialogBody({ pods }: { pods: PodSummary[] }) {
  const close = useErrorsDialog(s => s.close);
  const [win, setWin] = useState('30');
  const [from, setFrom] = useState(() => localTime(Date.now() - 3_600_000));
  const [to, setTo] = useState(() => localTime(Date.now()));
  const [mode, setMode] = useState<SplitMode>(pods.length > 3 ? 'grid' : 'horizontal');
  const many = pods.length > 1;

  const range = useMemo(() => {
    if (win !== 'custom') { const now = Date.now(); return { fromMs: now - Number(win) * 60_000, toMs: now }; }
    const f = Date.parse(from), t = Date.parse(to);
    return Number.isFinite(f) && Number.isFinite(t) && f < t ? { fromMs: f, toMs: t } : undefined;
  }, [win, from, to]);

  const room = Math.min(pods.length, MAX_PANES[mode]);
  const show = () => {
    if (!range) return;
    logUiEvent('dk8s.logs_open', { errors: true, pods: pods.length, minutes: Math.round((range.toMs - range.fromMs) / 60_000) });
    if (many) {
      useSplitStore.getState().open(pods, mode, ERRORS_TAIL, 'pods', {
        levels: ['error'], window: { from: localTime(range.fromMs), to: localTime(range.toMs) },
      });
    } else {
      useK8sStore.getState().openErrors(pods[0], range);
    }
    close();
  };

  const names = pods.map(p => p.name);
  return (
    <ModalView open onClose={close} size="sm"
               title={<span>Errors <span style={{ fontWeight: 400, color: PF.mu }}>· {many ? `${pods.length} pods` : pods[0].name}</span></span>}
               footerRight={
                 <div style={{ display: 'flex', gap: 8 }}>
                   <PfButton onClick={close}>Cancel</PfButton>
                   <PfButton tone="solid" disabled={!range} onClick={show}>
                     {many ? `Show errors in ${room} panes` : 'Show errors'}
                   </PfButton>
                 </div>
               }>
      <div className="flex flex-col" style={{ gap: 14, fontSize: 12.5, color: PF.mu }}>
        {many && (
          <div className="flex flex-wrap" style={{ gap: 4 }}>
            {names.map(n => (
              <span key={n} style={{ fontFamily: PF.mono, fontSize: 11, padding: '1px 7px', borderRadius: 5, background: PF.well, border: `1px solid ${PF.bd}`, color: PF.tx }}>{n}</span>
            ))}
          </div>
        )}

        <div className="flex flex-col" style={{ gap: 6 }}>
          <span style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase' }}>Window</span>
          <SegmentedControlView size="sm" accentColor={PF.dk} value={win} onChange={setWin} options={WINDOWS} />
          {win === 'custom' && (
            <div className="flex items-center flex-wrap" style={{ gap: 6 }}>
              <DateTimeInputView value={from} onChange={(v: string) => setFrom(v)} size="sm" />
              <span>to</span>
              <DateTimeInputView value={to} onChange={(v: string) => setTo(v)} size="sm" />
            </div>
          )}
          {win === 'custom' && !range && <span style={{ color: PF.er, fontSize: 11.5 }}>The start has to be before the end.</span>}
        </div>

        {many && (
          <div className="flex flex-col" style={{ gap: 6 }}>
            <span style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase' }}>Layout</span>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
              {SPLIT_MODES.map(({ id, label, Icon }) => {
                const on = mode === id;
                const fits = Math.min(pods.length, MAX_PANES[id]);
                return (
                  <button key={id} type="button" onClick={() => setMode(id)} aria-pressed={on}
                          className="flex flex-col items-center cursor-pointer"
                          style={{
                            gap: 4, padding: '9px 6px', borderRadius: 8, fontSize: 12,
                            border: `1px solid ${on ? tint(PF.dk, 55) : PF.bd}`,
                            background: on ? tint(PF.dk, 12) : 'transparent',
                            color: on ? PF.tx : PF.mu,
                          }}>
                    <Icon size={IconSize.action} color={on ? PF.dk : undefined} />
                    <span>{label}</span>
                    <span style={{ fontSize: 10.5, color: PF.mu }}>{fits} pane{fits === 1 ? '' : 's'}</span>
                  </button>
                );
              })}
            </div>
            {room < pods.length && <PfBar tone="wa">{label(mode)} holds {room} — the first {room} of the {pods.length} pods open.</PfBar>}
          </div>
        )}

        <span style={{ fontSize: 11.5, lineHeight: 1.6 }}>
          Opens in the log view, read for that window and filtered to ERROR — stack traces stay under their errors.
          Clear the level or widen the window from its toolbar.
        </span>
      </div>
    </ModalView>
  );
}

const label = (m: SplitMode) => SPLIT_MODES.find(x => x.id === m)?.label ?? m;
