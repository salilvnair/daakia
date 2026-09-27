/**
 * One log payload, on a page of its own.
 *
 * "Open in a tab" from a payload box: the same body, with the room a
 * two-thousand-line SOAP envelope or a forty-key config actually needs, and
 * nothing else on the screen competing with it. It holds the payload itself,
 * so it survives the log it came from scrolling on, or the pod going away.
 */
import { useMemo, useState } from 'react';
import { ButtonView, SegmentedControlView } from '@salilvnair/dui';
import type { RequestTab } from '../../store/tabs-store';
import { PayloadBody } from './LogPayloadView';
import { maskSecrets } from './log-payload';
import { usePayloadPrefs } from './log-payload-prefs';
import { copyText } from '../../utils/clipboard';
import { CopyIcon, CheckIcon, ExpandAllIcon, CollapseAllIcon } from '../../icons';
import { ACCENT } from './tone';

type Mode = 'tree' | 'pretty' | 'raw';

export function PayloadTab({ tab }: { tab: RequestTab }) {
  const view = tab.payloadView;
  const prefs = usePayloadPrefs();
  const [mode, setMode] = useState<Mode>(prefs.mode === 'raw' && !prefs.keepRaw ? 'tree' : prefs.mode);
  const [all, setAll] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const value = useMemo(
    () => (view && prefs.hideSecrets && !revealed ? maskSecrets(view.payload.value) : view?.payload.value),
    [view, prefs.hideSecrets, revealed],
  );

  if (!view) {
    return <div className="flex-1 flex items-center justify-center text-[12px]" style={{ color: 'var(--color-text-muted)' }}>This tab has no payload.</div>;
  }
  const { payload } = view;
  const masking = prefs.hideSecrets && !revealed && payload.value !== undefined
    && JSON.stringify(maskSecrets(payload.value)) !== JSON.stringify(payload.value);

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: 'var(--color-bg, var(--color-surface))' }}>
      <div className="flex items-center gap-3 px-4 py-2.5 shrink-0 flex-wrap" style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[13px] font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>{view.title}</span>
          <span className="text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>
            <span style={{ color: ACCENT, textTransform: 'uppercase' }}>{payload.shape}</span> · {payload.summary} · {(payload.source.length / 1024).toFixed(1)} KB
            {payload.prefix ? ` · ${payload.prefix}` : ''}
          </span>
        </div>
        {masking && (
          <ButtonView variant="secondary" size="sm" color="var(--color-warning)" onClick={() => setRevealed(true)}>Show hidden</ButtonView>
        )}
        <SegmentedControlView
          size="sm"
          variant="pointy"
          borderRadius={4}
          accentColor={ACCENT}
          value={mode}
          onChange={v => setMode(v as Mode)}
          options={[{ value: 'tree', label: 'Tree' }, { value: 'pretty', label: 'Pretty' }, ...(prefs.keepRaw ? [{ value: 'raw', label: 'Raw' }] : [])]}
        />
        <ButtonView variant="secondary" size="sm" disabled={mode !== 'tree'}
                    iconLeft={all ? <CollapseAllIcon size={12} /> : <ExpandAllIcon size={12} />}
                    onClick={() => setAll(a => !a)}>
          {all ? 'Collapse' : 'Expand all'}
        </ButtonView>
        <ButtonView variant="secondary" size="sm" accentColor={ACCENT} color={copied ? 'var(--color-success)' : ACCENT}
                    iconLeft={copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
                    onClick={async () => { if (await copyText(payload.source)) { setCopied(true); setTimeout(() => setCopied(false), 1400); } }}>
          {copied ? 'Copied' : 'Copy'}
        </ButtonView>
      </div>
      <div className="flex-1 min-h-0 overflow-auto px-5 py-4">
        <PayloadBody key={`${mode}:${all}`} payload={payload} mode={mode} value={value} depth={all ? 64 : Math.max(prefs.depth, 3)} />
      </div>
    </div>
  );
}
